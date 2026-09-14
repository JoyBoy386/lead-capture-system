import { NextRequest, NextResponse } from "next/server";
import { verifyMetaWebhook, fetchLeadFromGraph } from "@/lib/facebook";
import { getMetaSource, mapMetaFields } from "@/lib/leadMapper";
import { createLead } from "@/lib/leadService";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
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

        const { leadgen_id, field_data, page_id } = change.value;

        let fields = field_data;
        if (!fields || fields.length === 0) {
          const graphLead = await fetchLeadFromGraph(leadgen_id);
          fields = graphLead?.field_data ?? [];
        }

        const mappedLead = mapMetaFields(fields, getMetaSource(page_id ?? e.id));

        const saved = await createLead(mappedLead);

        if (!saved) {
          logger.error(CONTEXT, "Failed to save lead to Supabase");
          continue;
        }

        logger.info(CONTEXT, "Lead saved to Supabase");
        await sendWhatsAppMessage({
          to: mappedLead.phone,
          name: mappedLead.name,
          source: mappedLead.source,
        });
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