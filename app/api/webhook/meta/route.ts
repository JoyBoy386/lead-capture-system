import { NextRequest, NextResponse } from "next/server";
import { verifyMetaWebhook, fetchLeadFromGraph } from "@/lib/facebook";
import { mapMetaFields } from "@/lib/leadMapper";
import { createLead } from "@/lib/leadService";
import { metaWebhookBodySchema } from "@/lib/validators";
import { logger } from "@/lib/logger";
import type { ApiResponse } from "@/types/lead";
import twilio from "twilio";

const CONTEXT = "webhook/meta";

// ── GET – Webhook Verification ────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const result = verifyMetaWebhook(mode, token, challenge);

  if (result) {
    // Meta expects the raw challenge string as the body
    return new NextResponse(result, { status: 200 });
  }

  return NextResponse.json<ApiResponse>(
    { success: false, message: "Verification failed" },
    { status: 403 }
  );
}

// ── POST – Receive Lead Events ────────────────────────

// ── POST – Receive Lead Events ────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    logger.debug(CONTEXT, "Incoming payload", body);

    // 1. Validate structure
    const parsed = metaWebhookBodySchema.safeParse(body);

    if (!parsed.success) {
      logger.warn(CONTEXT, "Invalid payload", parsed.error.flatten());
      // Always return 200 to Meta to avoid retries on bad data
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Invalid payload" },
        { status: 200 }
      );
    }

    // 2. Process each entry
    const { entry } = parsed.data;

    for (const e of entry) {
      for (const change of e.changes) {
        if (change.field !== "leadgen") continue;

        const { leadgen_id, field_data } = change.value;

        // 3. Fetch full lead from Graph API if needed
        let fields = field_data;
        if (!fields || fields.length === 0) {
          const graphLead = await fetchLeadFromGraph(leadgen_id);
          fields = graphLead?.field_data ?? [];
        }

        // 4. ✅ MAP THE FIELDS (This was missing)
        const mappedLead = mapMetaFields(fields);

        // 5. Save to Supabase
        const saved = await createLead(mappedLead);

        if (!saved) {
          logger.error(CONTEXT, "Failed to save lead to Supabase");
          continue;
        }

        // 6. Send a test WhatsApp message only when Twilio is configured.
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromPhone = process.env.TWILIO_PHONE_NUMBER;
        const testPhone = process.env.META_TEST_PHONE;

        if (accountSid && authToken && fromPhone && testPhone) {
          const client = twilio(accountSid, authToken);

          try {
            await client.messages.create({
              body: `Hi ${mappedLead.name || "there"}! This is a test message from your Meta Lead Ads prototype. We received your lead!`,
              from: `whatsapp:${fromPhone}`,
              to: `whatsapp:${testPhone}`,
            });
            logger.info(CONTEXT, "WhatsApp test message sent successfully");
          } catch (twilioError) {
            logger.error(CONTEXT, "Twilio error", twilioError);
          }
        } else {
          logger.warn(CONTEXT, "Twilio environment variables are incomplete");
        }
      }
    }

    // 7. Always 200 so Meta doesn't retry
    return NextResponse.json<ApiResponse>(
      { success: true, message: "Webhook processed" },
      { status: 200 }
    );
  } catch (err) {
    logger.error(CONTEXT, "Unhandled error", err);

    return NextResponse.json<ApiResponse>(
      { success: false, message: "Internal error" },
      { status: 200 } // still 200 for Meta
    );
  }
}