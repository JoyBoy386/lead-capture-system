import { NextRequest, NextResponse } from "next/server";
import { createLead } from "@/lib/leadService";
import { logger } from "@/lib/logger";
import type { ApiResponse } from "@/types/lead";

const CONTEXT = "webhook/linkedin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    logger.debug(CONTEXT, "Incoming payload", body);

    const fullName = String(body?.fullName ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const company = String(body?.company ?? "").trim();
    const jobTitle = String(body?.jobTitle ?? "").trim();

    const mappedLead = {
      name: fullName,
      title: jobTitle,
      email,
      phone,
      source: "linkedin" as const,
      stage: "lead" as const,
      interest: "",
      chat_topic: "",
      cited: [],
      notes: company ? `Company: ${company}` : "Lead captured via LinkedIn webhook",
      lost: false,
    };

    const saved = await createLead(mappedLead);

    if (!saved) {
      logger.error(CONTEXT, "Failed to save lead to Supabase");
      return NextResponse.json<ApiResponse>(
        { success: false, message: "Failed to save lead" },
        { status: 200 }
      );
    }

    const testPhone = process.env.META_TEST_PHONE?.trim() || "+60178520801";

    logger.info(CONTEXT, "📨 [SIMULATION] Would send message to:", testPhone);
    logger.info(
      CONTEXT,
      "📨 [SIMULATION] Message:",
      `Hi ${mappedLead.name || "there"}! We received your LinkedIn lead.`
    );
    logger.info(CONTEXT, "✅ Notification step completed (Simulated for prototype demo)");

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