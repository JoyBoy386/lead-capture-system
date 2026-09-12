a# Lead Capture System Documentation

## 1. System Overview

This is a Next.js 15 server application that receives lead events from Meta/Facebook and LinkedIn, converts each provider's payload into one common CRM lead format, and stores the lead in Supabase.

```text
Meta Instant Form ------------------┐
                                    v
LinkedIn Lead Gen Form -> Webhook routes -> Validation/signature checks
                                             -> Provider API lookup when needed
                                             -> Lead mapper
                                             -> Supabase crm_leads table
```

The system does not include chatbot functionality. It can optionally send a WhatsApp message through a local WhatsApp Web browser session using the Python `pywhatkit` worker described below.

## 2. Technology Stack

- Next.js 15 App Router
- TypeScript
- Node.js server runtime
- Supabase JavaScript client
- Zod payload validation
- Native `fetch` for Meta and LinkedIn API calls

Install dependencies and run locally:

```powershell
npm install
npm run dev
```

The local server runs at:

```text
http://localhost:3000
```

Production build and start:

```powershell
npm run build
npm run start
```

A production deployment should use `npm ci` so the committed `package-lock.json` controls installed versions.

## 3. Project Structure

```text
app/
  api/
    webhook/
      meta/route.ts       Meta GET verification and POST lead ingestion
      linkedin/route.ts   LinkedIn GET verification and POST lead ingestion
lib/
  facebook.ts             Meta Graph lookup and Meta GET verification
  leadMapper.ts           Provider-to-CRM field mapping
  leadService.ts          Supabase lead CRUD and optional email upsert
  linkedin.ts             LinkedIn API lookup and HMAC validation
  logger.ts               Structured console logging
  supabase.ts             Singleton Supabase admin client
types/
  lead.ts                 Canonical lead and webhook TypeScript types
lib/validators.ts         Zod schemas for Meta and LinkedIn-related data
.env.example              Safe configuration template
LINKEDIN-HANDOVER.md      LinkedIn-specific client handover
```

## 4. Canonical Lead Model

Every provider is mapped to this shape before insertion:

```text
name      string
 title    string
email     string
phone     string
source    "meta" | "linkedin"
stage     "lead" | "new" | "contacted" | "qualified" | "proposal" | "won" | "lost"
interest  string
cited     string[]
notes     string
lost      boolean
```

Supabase generates `id` and `created_at` when the table is configured with the expected defaults.

Default values created by the mapper:

```text
name: ""
title: ""
email: ""
phone: ""
source: "meta"
stage: "lead"
interest: ""
cited: []
notes: ""
lost: false
```

## 5. Meta Lead Flow

### 5.1 Webhook endpoints

Verification request:

```text
GET https://YOUR-DOMAIN.com/api/webhook/meta
```

Meta sends these query parameters:

```text
hub.mode=subscribe
hub.verify_token=the configured META_VERIFY_TOKEN
hub.challenge=challenge value
```

The route returns the challenge when the verify token matches.

Lead event:

```text
POST https://YOUR-DOMAIN.com/api/webhook/meta
```

### 5.2 Processing behavior

1. The route parses the JSON body.
2. `metaWebhookBodySchema` validates the Meta envelope.
3. It loops through `entry[].changes[]`.
4. Only changes where `field` is `leadgen` are processed.
5. It reads `leadgen_id` and optional `field_data`.
6. If `field_data` exists, it maps it directly.
7. If `field_data` is absent or empty, it calls the Meta Graph API using `leadgen_id` and `META_ACCESS_TOKEN`.
8. `mapMetaFields` converts provider field names into CRM fields.
9. `createLead` inserts the result into `crm_leads`.

### 5.3 Meta payload for Postman

```json
{
  "object": "page",
  "entry": [
    {
      "id": "153125381133",
      "time": 1698292065,
      "changes": [
        {
          "field": "leadgen",
          "value": {
            "leadgen_id": "POSTMAN_MOCK_ID_999",
            "page_id": "123123123",
            "form_id": "12312312312",
            "field_data": [
              {
                "name": "full_name",
                "values": ["Postman Test User"]
              },
              {
                "name": "email",
                "values": ["postman.test@example.com"]
              },
              {
                "name": "phone_number",
                "values": ["+971501234567"]
              },
              {
                "name": "interest",
                "values": ["Dubai Marina"]
              }
            ]
          }
        }
      ]
    }
  ]
}
```

Required Meta envelope fields are `object`, `entry`, `entry[].id`, `entry[].changes`, `changes[].field`, and `changes[].value.leadgen_id`. The `field_data` property is optional for real webhooks but should be included for a direct Postman test.

Supported Meta field names include:

```text
full_name, name, first_name
email
phone_number, phone, mobile
job_title, title, position
interest, product, service
```

### 5.4 Meta production configuration

The Meta Page must be subscribed to the `leadgen` webhook event. The access token must be valid and authorized to retrieve lead details. The deployed webhook must be public HTTPS.

Current security note: the Meta POST handler validates the payload structure but does not currently verify `x-hub-signature-256`. Add Meta HMAC verification before production if the endpoint is exposed publicly.

## 6. LinkedIn Lead Flow

### 6.1 Webhook endpoints

Verification:

```text
GET https://YOUR-DOMAIN.com/api/webhook/linkedin?challenge=VALUE
```

The route returns the HMAC-SHA256 digest of the challenge using `LINKEDIN_SECRET`.

Lead event:

```text
POST https://YOUR-DOMAIN.com/api/webhook/linkedin
```

### 6.2 Real LinkedIn processing behavior

1. The route reads the raw request body.
2. It reads `x-li-signature`.
3. It computes HMAC-SHA256 using `LINKEDIN_SECRET` and compares it to the header.
4. It ignores events whose `leadAction` is present but not `CREATED`.
5. It reads `leadGenFormResponse` and `leadGenForm` URNs.
6. `fetchLinkedInLeadData` extracts the IDs.
7. It requests the form schema from `/rest/leadForms/{formId}`.
8. It builds a map from LinkedIn question IDs to normalized field names.
9. It requests the lead response from `/rest/leadFormResponses/{leadId}`.
10. It maps text and multiple-choice answers into a flat object.
11. `mapLinkedInPayload` maps the flat object into the CRM lead shape.
12. `createLead` inserts the lead into Supabase.

Expected real event shape:

```json
{
  "leadAction": "CREATED",
  "leadGenFormResponse": "urn:li:leadGenFormResponse:123456789",
  "leadGenForm": "urn:li:leadGenForm:987654321"
}
```

### 6.3 LinkedIn local Postman test

Use this only for local testing. It does not call LinkedIn's API.

Set a local secret in `.env`:

```env
LINKEDIN_SECRET=postman-local-test-secret
```

Restart the development server after changing `.env`.

Request:

```text
POST http://localhost:3000/api/webhook/linkedin
```

Headers:

```text
Content-Type: application/json
x-li-signature: generated by the pre-request script
```

Body:

```json
{
  "fullName": "Postman LinkedIn User",
  "email": "linkedin.test@example.com",
  "phone": "+971501234567",
  "company": "Test Company",
  "jobTitle": "Marketing Manager"
}
```

Postman pre-request script:

```javascript
const secret = "postman-local-test-secret";
const body = pm.request.body.raw;
const signature = CryptoJS.HmacSHA256(body, secret).toString(CryptoJS.enc.Hex);

pm.request.headers.upsert({
  key: "x-li-signature",
  value: signature,
});
```

In production, payloads without LinkedIn lead URNs are rejected. A real LinkedIn test requires the client token, permissions, webhook, and lead form.

## 7. Environment Configuration

Use `.env.example` as the template. Never commit `.env`, `.env.local`, or `.env.production`.

Required variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
META_ACCESS_TOKEN=meta-access-token
META_VERIFY_TOKEN=meta-webhook-verification-token
LINKEDIN_ACCESS_TOKEN=linkedin-api-access-token
LINKEDIN_SECRET=linkedin-webhook-signing-secret
```

Optional:

```env
META_TEST_PHONE=
LOG_LEVEL=info
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to browser code. All secrets should be entered into the hosting provider's secret/environment-variable manager.

## 8. Optional Browser-Based WhatsApp Automation

After a lead is saved successfully, both webhook routes call `lib/whatsapp.ts`. When `WHATSAPP_ENABLED=true`, it starts `scripts/send_whatsapp.py`, which uses `pywhatkit` to open WhatsApp Web and send a message to the lead's phone number.

This is not a WhatsApp Cloud API integration. It requires a persistent Windows computer with:

- Python installed and available as `python`, or configured through `PYTHON_COMMAND`.
- Google Chrome installed.
- The WhatsApp account already logged in at WhatsApp Web.
- The machine awake and available when a webhook arrives.
- A non-serverless deployment that can start a visible browser process.

Install the Python dependency:

```powershell
python -m pip install -r requirements.txt
```

Configure the feature:

```env
WHATSAPP_ENABLED=true
PYTHON_COMMAND=python
WHATSAPP_MESSAGE_TEMPLATE=Hi {name}, thank you for your interest. We received your lead from {source}.
```

The placeholders `{name}` and `{source}` are replaced before sending. The lead phone number must include its international country code, for example `+971501234567`.

The webhook waits for the Python worker to finish. Browser automation may take several seconds and can fail if WhatsApp Web is logged out, Chrome is unavailable, the computer is asleep, or WhatsApp changes its web interface. For production reliability and high volume, use the official WhatsApp Cloud API or a dedicated worker queue instead.

## 9. Supabase Requirements

The application expects a table named `crm_leads` with columns equivalent to:

```text
id          UUID, generated by default
name        text
 title      text
email       text
phone       text
source      text
stage       text
created_at  timestamp, default now()
interest    text
cited       json/jsonb or compatible array type
notes       text
lost        boolean
```

Confirm the exact types against the client's database schema before deployment. The server uses the service-role key, so Supabase Row Level Security policies do not replace server-side authorization.

The current webhook routes use `createLead`, which always inserts a row. `upsertLeadByEmail` exists but is not used by the webhooks. Duplicate webhook delivery can therefore create duplicate leads.

## 9. Deployment Procedure

1. Confirm the repository does not contain real secrets.
2. Rotate any secret previously committed or shared.
3. Create the production Supabase table and verify all required columns/defaults.
4. Deploy the Next.js application to a Node-compatible hosting provider.
5. Add production environment variables through the hosting provider.
6. Run `npm ci` and `npm run build` during deployment.
7. Start the application with `npm run start`.
8. Confirm both webhook URLs are public HTTPS endpoints.
9. Complete Meta and LinkedIn webhook verification.
10. Submit one real test lead from each provider.
11. Confirm the row appears in `crm_leads` with the correct `source`.
12. Review logs for provider API errors and duplicate events.

## 10. Troubleshooting

### LinkedIn: Missing X-LI-Signature header

Postman did not send the `x-li-signature` header. Configure the pre-request script and ensure it signs the exact raw body.

### LinkedIn: Invalid signature

Check that the secret in `.env` exactly matches the secret in Postman or the LinkedIn integration. Restart the server after editing `.env`.

### LinkedIn: API fetch failed

Check `LINKEDIN_ACCESS_TOKEN`, organization/form access, API permissions, URN values, LinkedIn API version support, and the response status in server logs.

### Meta: Invalid payload

Check that the body uses the Meta envelope and includes `entry[].changes[].value.leadgen_id`. A raw lead object is not a valid Meta webhook payload.

### Lead is not saved

Check Supabase URL/key, the `crm_leads` schema, server logs, and whether the mapped fields match database column names and types.

## 11. Current Production Gaps

These items should be addressed or explicitly accepted before high-volume production:

- Add Meta POST HMAC verification.
- Change Meta and any remaining error acknowledgements from HTTP 200 to retryable 5xx responses where appropriate.
- Add provider event/lead IDs and database uniqueness for idempotency.
- Confirm the LinkedIn API version `202401` is currently supported; update it if required.
- Redact lead PII from production logs.
- Add automated tests using saved Meta and LinkedIn webhook fixtures.
- Add a database migration or schema document owned by the deployment process.

## 12. Verification Status

The project has passed the production build command:

```powershell
npm run build
```

A successful build confirms compilation and type checking. It does not confirm external provider permissions, webhook delivery, credentials, database schema compatibility, or current LinkedIn API behavior. Those require an end-to-end test with the client's deployed credentials.
