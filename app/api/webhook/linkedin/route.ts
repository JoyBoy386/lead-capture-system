import { NextRequest, NextResponse } from "next/server";
import { createLead } from "@/lib/leadService";
import { mapLinkedInPayload } from "@/lib/leadMapper";
import { logger } from "@/lib/logger";
import { sendWhatsAppNotification } from "@/lib/metaWhatsApp";
import { fetchLinkedInLeadData, verifyLinkedInSignature } from "@/lib/linkedin";
import type { ApiResponse } from "@/types/lead";

const CONTEXT = "webhook/linkedin";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-li-signature");
    const isValid = verifyLinkedInSignature(rawBody, signature);

    if (!isValid) {
      logger.warn(CONTEXT, "Rejected LinkedIn webhook with invalid signature");
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Invalid signature" },
        { status: 403 }
      );
    }

    const body = rawBody ? JSON.parse(rawBody) : {};
    logger.debug(CONTEXT, "Incoming payload", body);

    const directFullName = String(body?.fullName ?? "").trim();
    const directEmail = String(body?.email ?? "").trim();
    const directPhone = String(body?.phone ?? "").trim();
    const directCompany = String(body?.company ?? "").trim();
    const directJobTitle = String(body?.jobTitle ?? "").trim();

    const leadUrn = body?.lead ?? body?.event?.lead ?? body?.leadUrn ?? body?.lead_id;
    const formUrn = body?.form ?? body?.event?.form ?? body?.formUrn ?? body?.form_id;

    let mappedLead = mapLinkedInPayload({
      name: directFullName,
      email: directEmail,
      phone: directPhone,
      jobTitle: directJobTitle,
      company: directCompany,
    });

    // Real LinkedIn flow: webhook gives a lead/form URN, and the app must fetch the actual data.
    if (leadUrn && formUrn) {
      const leadData = await fetchLinkedInLeadData(leadUrn, formUrn);

      if (leadData) {
        mappedLead = mapLinkedInPayload({
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          jobTitle: leadData.jobTitle,
        });
      } else {
        logger.warn(CONTEXT, "LinkedIn lead fetch failed; falling back to mock payload fields if present");
      }
    }

    const saved = await createLead(mappedLead);

    if (!saved) {
      logger.error(CONTEXT, "Failed to save lead to Supabase");
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Failed to save lead" },
        { status: 200 }
      );
    }

    const targetPhone = mappedLead.phone || process.env.META_TEST_PHONE || "+60178520801";

    const notified = await sendWhatsAppNotification({
      to: targetPhone,
      name: mappedLead.name || "there",
    });

    if (notified) {
      logger.info(CONTEXT, "WhatsApp notification step completed");
    } else {
      logger.warn(CONTEXT, "WhatsApp notification failed, but lead was saved to DB");
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