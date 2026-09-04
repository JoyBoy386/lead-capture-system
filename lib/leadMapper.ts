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
    source: "meta",
    stage: "new",
    interest: "",
    chat_topic: "",
    cited: "",
    notes: "",
    lost: false,
    ...overrides,
  };
}

// ── Mappers ───────────────────────────────────────────
export function mapMetaFields(fieldData: MetaFieldData[]): CrmLeadInsert {
  return defaults({
    name: findFieldValue(fieldData, [
      "full_name",
      "name",
      "first_name",
    ]),
    email: findFieldValue(fieldData, ["email"]),
    phone: findFieldValue(fieldData, [
      "phone_number",
      "phone",
      "mobile",
    ]),
    title: findFieldValue(fieldData, ["job_title", "title", "position"]),
    source: "meta",
    interest: findFieldValue(fieldData, ["interest", "product", "service"]),
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
    source: "linkedin",
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
    source: "chatbot",
    interest: payload.interest ?? "",
    chat_topic: payload.chat_topic ?? "",
    notes: payload.notes ?? "Lead captured via website chatbot",
  });
}