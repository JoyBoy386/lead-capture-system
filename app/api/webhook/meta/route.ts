import { NextRequest, NextResponse } from "next/server";
import { verifyMetaWebhook, fetchLeadFromGraph } from "@/lib/facebook";
import { mapMetaFields } from "@/lib/leadMapper";
import { createLead } from "@/lib/leadService";
import { metaWebhookBodySchema } from "@/lib/validators";
import { logger } from "@/lib/logger";
import type { ApiResponse } from "@/types/lead";

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

    // 2. Process each entry asynchronously (fire-and-forget)
    const { entry } = parsed.data;

    for (const e of entry) {
      for (const change of e.changes) {
        if (change.field !== "leadgen") continue;

        const { leadgen_id, field_data } = change.value;

        // 3. Fetch full lead from Graph API
        let fields = field_data;

        if (!fields || fields.length === 0) {
          const graphLead = await fetchLeadFromGraph(leadgen_id);
          fields = graphLead?.field_data ?? [];
        }

        if (fields.length === 0) {
          logger.warn(CONTEXT, `No field_data for leadgen ${leadgen_id}`);
          continue;
        }

        // 4. Map → CRM format
        const crmLead = mapMetaFields(fields);

        // 5. Persist
        const saved = await createLead(crmLead);

        if (!saved) {
          logger.error(CONTEXT, `Failed to save lead ${leadgen_id}`);
        }
      }
    }

    // 6. Always 200 so Meta doesn't retry
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