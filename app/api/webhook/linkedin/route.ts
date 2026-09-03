import { NextRequest, NextResponse } from "next/server";
import { verifyLinkedInSignature } from "@/lib/linkedin";
import { mapLinkedInPayload } from "@/lib/leadMapper";
import { createLead } from "@/lib/leadService";
import { linkedInLeadSchema } from "@/lib/validators";
import { logger } from "@/lib/logger";
import type { ApiResponse } from "@/types/lead";

const CONTEXT = "webhook/linkedin";

export async function POST(request: NextRequest) {
  try {
    // 1. Read raw body for signature verification
    const rawBody = await request.text();

    const signature = request.headers.get("x-li-signature");

    if (!verifyLinkedInSignature(rawBody, signature)) {
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Invalid signature" },
        { status: 401 }
      );
    }

    // 2. Parse JSON
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Malformed JSON" },
        { status: 400 }
      );
    }

    logger.debug(CONTEXT, "Incoming payload", payload);

    // 3. Validate
    const parsed = linkedInLeadSchema.safeParse(payload);

    if (!parsed.success) {
      logger.warn(CONTEXT, "Validation failed", parsed.error.flatten());
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Invalid payload" },
        { status: 400 }
      );
    }

    // 4. Map → CRM format
    const crmLead = mapLinkedInPayload(parsed.data);

    // 5. Guard: need at least an email or name
    if (!crmLead.email && !crmLead.name) {
      logger.warn(CONTEXT, "Lead has no email or name – skipping");
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Insufficient lead data" },
        { status: 422 }
      );
    }

    // 6. Persist
    const saved = await createLead(crmLead);

    if (!saved) {
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Failed to save lead" },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse>(
      { success: true, message: "Lead captured", data: { id: saved.id } },
      { status: 201 }
    );
  } catch (err) {
    logger.error(CONTEXT, "Unhandled error", err);

    return NextResponse.json<ApiResponse>(
      { success: false, message: "Internal error" },
      { status: 500 }
    );
  }
}