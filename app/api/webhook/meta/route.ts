import { NextRequest, NextResponse } from "next/server";
import { verifyMetaWebhook, fetchLeadFromGraph } from "@/lib/facebook";
import { mapMetaFields } from "@/lib/leadMapper";
import { createLead } from "@/lib/leadService";
import { metaWebhookBodySchema } from "@/lib/validators";
import { logger } from "@/lib/logger";
import { sendWhatsAppNotification } from "@/lib/metaWhatsApp";
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

    const parsed = metaWebhookBodySchema.safeParse(body);

    if (!parsed.success) {
      logger.warn(CONTEXT, "Invalid payload", parsed.error.flatten());
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Invalid payload" },
        { status: 200 }
      );
    }

    const { entry } = parsed.data;

    for (const e of entry) {
      for (const change of e.changes) {
        if (change.field !== "leadgen") continue;

        const { leadgen_id, field_data } = change.value;

        let fields = field_data;
        if (!fields || fields.length === 0) {
          const graphLead = await fetchLeadFromGraph(leadgen_id);
          fields = graphLead?.field_data ?? [];
        }

        const mappedLead = mapMetaFields(fields);

        const saved = await createLead(mappedLead);

        if (!saved) {
          logger.error(CONTEXT, "Failed to save lead to Supabase");
          continue;
        }

        const targetPhone = mappedLead.phone || process.env.META_TEST_PHONE || "+60178520801";

        const notified = await sendWhatsAppNotification({
          to: targetPhone,
          name: mappedLead.name || "there",
        });

        if (notified) {
          logger.info(CONTEXT, "✅ WhatsApp notification step completed");
        } else {
          logger.warn(CONTEXT, "⚠️ WhatsApp notification failed, but lead was saved to DB");
        }
      }
    }

    return NextResponse.json<ApiResponse>(
      { success: true, message: "Webhook processed" },
      { status: 200 }
    );
  } catch (err) {
    logger.error(CONTEXT, "Unhandled error", err);

    return NextResponse.json<ApiResponse>(
      { success: false, message: "Internal error" },
      { status: 200 }
    );
  }
}