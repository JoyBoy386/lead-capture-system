import type {
  CrmLeadInsert,
  MetaFieldData,
  LinkedInLeadPayload,
  ChatbotLeadPayload,
} from "@/types/lead";

// ── Helpers ───────────────────────────────────────────
function findFieldValue(
  fields: MetaFieldData[],
  names: string[]
): string {
  const lower = names.map((n) => n.toLowerCase());
  const match = fields.find((f) => lower.includes(f.name.toLowerCase()));
  return match?.values?.[0]?.trim() ?? "";
}

function coalesce(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

// ── Defaults ──────────────────────────────────────────
function defaults(overrides: Partial<CrmLeadInsert>): CrmLeadInsert {
  return {
    name: "",
    title: "",
    email: "",
    phone: "",
    source: "meta",      // ✅ NO SPACE
    stage: "lead",        // ✅ NO SPACE
    interest: "",
    chat_topic: "",
    cited: [],           // ✅ EMPTY ARRAY FOR POSTGRES
    notes: "",
    lost: false,
    ...overrides,
  };
}

// ── Mappers ───────────────────────────────────────────
export function mapMetaFields(fieldData: MetaFieldData[]): CrmLeadInsert {
  return defaults({
    name: findFieldValue(fieldData, [
      "full_name",       // ✅ NO SPACE
      "name",            // ✅ NO SPACE
      "first_name",      // ✅ NO SPACE
    ]),
    email: findFieldValue(fieldData, ["email"]), // ✅ NO SPACE
    phone: findFieldValue(fieldData, [
      "phone_number",    // ✅ NO SPACE
      "phone",           // ✅ NO SPACE
      "mobile",          // ✅ NO SPACE
    ]),
    title: findFieldValue(fieldData, ["job_title", "title", "position"]), // ✅ NO SPACE
    source: "meta",      // ✅ NO SPACE
    interest: findFieldValue(fieldData, ["interest", "product", "service"]), // ✅ NO SPACE
    notes: "Lead captured via Meta Lead Form",
  });
}

export function mapLinkedInPayload(
  payload: LinkedInLeadPayload
): CrmLeadInsert {
  const fullName =
    payload.name ??
    (coalesce(payload.firstName, payload.lastName)
      ? `${payload.firstName ?? ""} ${payload.lastName ?? ""}`.trim()
      : "");

  return defaults({
    name: fullName,
    email: payload.email ?? payload.emailAddress ?? "",
    phone: payload.phone ?? payload.phoneNumber ?? "",
    title: payload.jobTitle ?? payload.title ?? "",
    source: "linkedin",  // ✅ NO SPACE
    notes: `Company: ${payload.company ?? payload.companyName ?? "N/A"}`,
  });
}

export function mapChatbotPayload(
  payload: ChatbotLeadPayload
): CrmLeadInsert {
  return defaults({
    name: payload.name ?? "",
    email: payload.email ?? "",
    phone: payload.phone ?? "",
    source: "chatbot",   // ✅ NO SPACE
    interest: payload.interest ?? "",
    chat_topic: payload.chat_topic ?? "",
    notes: payload.notes ?? "Lead captured via website chatbot",
  });
}