import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createLead } from "@/lib/leadService";
import { mapLinkedInPayload } from "@/lib/leadMapper";
import { logger } from "@/lib/logger";
import { fetchLinkedInLeadData, verifyLinkedInSignature } from "@/lib/linkedin";
import type { ApiResponse } from "@/types/lead";

const CONTEXT = "webhook/linkedin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get("challenge") || searchParams.get("verificationToken");
  const secret = process.env.LINKEDIN_SECRET;

  if (challenge && secret) {
    const hmac = crypto.createHmac("sha256", secret).update(challenge).digest("hex");
    logger.info(CONTEXT, "LinkedIn webhook verification successful");
    return new NextResponse(hmac, { status: 200 });
  }

  logger.warn(CONTEXT, "LinkedIn webhook verification failed");
  return new NextResponse("Forbidden: Invalid verification", { status: 403 });
}

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

    if (body.leadAction && body.leadAction !== "CREATED") {
      return NextResponse.json<ApiResponse>(
        { success: true, message: "Ignored" },
        { status: 200 }
      );
    }

    const leadUrn = body.leadGenFormResponse ?? body.lead ?? body.event?.lead;
    const formUrn = body.leadGenForm ?? body.form ?? body.event?.form;

    let mappedLead;

    if (leadUrn && formUrn) {
      const leadData = await fetchLinkedInLeadData(leadUrn, formUrn);

      if (!leadData) {
        logger.error(CONTEXT, "Failed to fetch lead data from LinkedIn API");
        return NextResponse.json<ApiResponse>(
          { success: false, message: "API fetch failed" },
          { status: 200 }
        );
      }

      mappedLead = mapLinkedInPayload(leadData);
    } else {
      mappedLead = mapLinkedInPayload({
        fullname: body.fullName,
        email: body.email,
        phone: body.phone,
        company: body.company,
        jobtitle: body.jobTitle,
      });
    }

    const saved = await createLead(mappedLead);

    if (!saved) {
      logger.error(CONTEXT, "Failed to save lead to Supabase");
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Failed to save lead" },
        { status: 200 }
      );
    }

    logger.info(CONTEXT, "Lead saved to Supabase");

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