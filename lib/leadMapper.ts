import type {
  CrmLeadInsert,
  LeadSource,
  MetaFieldData,
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
    stage: "lead",
    interest: "",
    cited: [],
    notes: "",
    lost: false,
    ...overrides,
  };
}

// ── Mappers ───────────────────────────────────────────
export function getMetaSource(pageId?: string): LeadSource {
  const normalizedPageId = pageId?.trim();

  if (
    normalizedPageId &&
    normalizedPageId === process.env.META_INSTAGRAM_PAGE_ID?.trim()
  ) {
    return "instagram";
  }

  if (
    normalizedPageId &&
    normalizedPageId === process.env.META_FACEBOOK_PAGE_ID?.trim()
  ) {
    return "facebook";
  }

  return "meta";
}

export function mapMetaFields(
  fieldData: MetaFieldData[],
  source: LeadSource = "meta"
): CrmLeadInsert {
  const realPhoneNumber = findFieldValue(fieldData, [
    "phone_number",
    "phone",
    "mobile",
  ]);
  const testPhoneNumber = process.env.META_TEST_PHONE ?? "";

  return defaults({
    name: findFieldValue(fieldData, [
      "full_name",       
      "name",            
      "first_name",      
    ]),
    email: findFieldValue(fieldData, ["email"]), 
    phone: realPhoneNumber || testPhoneNumber,
    title: findFieldValue(fieldData, ["job_title", "title", "position"]), 
    source,
    interest: findFieldValue(fieldData, ["interest", "product", "service"]), 
    notes: "Lead captured via Meta Lead Form",
  });
}

export function mapLinkedInPayload(payload: Record<string, string | undefined>): CrmLeadInsert {
  const fullName = payload.firstname && payload.lastname
    ? `${payload.firstname} ${payload.lastname}`.trim()
    : payload.fullname || payload.name || "Unknown";

  return defaults({
    name: fullName,
    email: payload.email || "",
    phone: payload.phone || payload.phonenumber || "",
    title: payload.jobtitle || payload.title || "",
    source: "linkedin",
    notes: `Company: ${payload.companyname || payload.company || "N/A"}`,
  });
}

