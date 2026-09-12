# LinkedIn Lead Capture Handover

## What the integration does

The LinkedIn webhook receives a lead event, verifies the request signature, fetches the form schema and lead response from LinkedIn, maps the answers into the CRM lead shape, and saves the result to Supabase.

```text
LinkedIn Lead Gen Form
  -> POST /api/webhook/linkedin
  -> verify x-li-signature with LINKEDIN_SECRET
  -> fetch /rest/leadForms/{formId}
  -> fetch /rest/leadFormResponses/{leadId}
  -> map answers
  -> insert into Supabase crm_leads
```

WhatsApp notifications are optional. If `WHATSAPP_ENABLED=true`, the application starts the local Python `pywhatkit` worker after saving the lead. See `SYSTEM-DOCUMENTATION.md` for setup and deployment limitations.

## Required client values

Configure these as deployment secrets. Do not commit them to Git or place them in screenshots:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_SECRET=...
```

`LINKEDIN_ACCESS_TOKEN` is used for LinkedIn API requests. The token owner must have access to the organization, lead form, and lead responses.

`LINKEDIN_SECRET` is the shared webhook-signing secret. The application compares the HMAC-SHA256 signature in the `x-li-signature` header with the raw request body.

## Webhook configuration

Configure the LinkedIn webhook URL as:

```text
https://YOUR-DOMAIN.com/api/webhook/linkedin
```

The deployed URL must use HTTPS and be publicly reachable. The GET verification endpoint accepts `challenge` and returns its HMAC-SHA256 digest using `LINKEDIN_SECRET`.

Production lead events must include these values:

```json
{
  "leadAction": "CREATED",
  "leadGenFormResponse": "urn:li:leadGenFormResponse:123456789",
  "leadGenForm": "urn:li:leadGenForm:987654321"
}
```

The exact event field names and API response shape should be confirmed against the client's LinkedIn webhook/API documentation before go-live.

## Postman local test

For local testing, run the app with `npm run dev` and configure a local test secret in `.env`:

```env
LINKEDIN_SECRET=postman-local-test-secret
```

Restart the server after changing `.env`. Send a POST request to:

```text
http://localhost:3000/api/webhook/linkedin
```

Use `Content-Type: application/json` and this body:

```json
{
  "fullName": "Postman LinkedIn User",
  "email": "linkedin.test@example.com",
  "phone": "+971501234567",
  "company": "Test Company",
  "jobTitle": "Marketing Manager"
}
```

The request must include `x-li-signature`. In Postman, use this pre-request script:

```javascript
const secret = "postman-local-test-secret";
const body = pm.request.body.raw;
const signature = CryptoJS.HmacSHA256(body, secret).toString(CryptoJS.enc.Hex);

pm.request.headers.upsert({
  key: "x-li-signature",
  value: signature,
});
```

This local payload is for testing only. Production requests without LinkedIn lead URNs are rejected.

## Deployment checklist

- [ ] Deploy the application to an HTTPS URL.
- [ ] Add the required secrets to the hosting provider, not to Git.
- [ ] Confirm the LinkedIn token has access to the organization and lead form.
- [ ] Confirm the `crm_leads` table and required columns exist in Supabase.
- [ ] Configure the LinkedIn webhook URL.
- [ ] Complete LinkedIn GET webhook verification.
- [ ] Submit a real test lead from the LinkedIn Lead Gen Form.
- [ ] Confirm the server receives the event and saves one row in `crm_leads`.
- [ ] Confirm the saved `source` is `linkedin`.
- [ ] Monitor the first live event for LinkedIn API `401`, `403`, or `404` responses.
- [ ] Rotate any credentials that were previously committed or shared.

## Important limitations

- The application currently creates a new database row for each successful event; duplicate-event idempotency should be added before high-volume production use.
- The LinkedIn API version and endpoint response shape must be kept current with LinkedIn's supported API version.
- API permission approval and organization access are external LinkedIn requirements; a successful build does not prove those permissions.
