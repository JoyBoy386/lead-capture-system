import crypto from "crypto";
import { logger } from "./logger";

const CONTEXT = "linkedin";
const LINKEDIN_API_BASE = "https://api.linkedin.com/v2";

function extractIdFromUrn(urn: string): string {
  const parts = urn.split(":");
  return parts[parts.length - 1] ?? "";
}

function readLeadValue(data: Record<string, any>, fieldName: string): string {
  const values = data?.element?.data?.values ?? data?.values ?? [];

  const match = values.find((value: any) => value?.fieldName === fieldName);
  return String(match?.value ?? "").trim();
}

/**
 * Fetch the actual lead details using LinkedIn's leadgen API.
 * Real LinkedIn webhooks usually send URNs only, not full PII.
 */
export async function fetchLinkedInLeadData(
  leadUrn: string,
  formUrn: string
): Promise<{ name: string; email: string; phone: string; jobTitle: string } | null> {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;

  if (!accessToken) {
    logger.error(CONTEXT, "LINKEDIN_ACCESS_TOKEN is not set");
    return null;
  }

  const leadId = extractIdFromUrn(leadUrn);
  const formId = extractIdFromUrn(formUrn);

  if (!leadId || !formId) {
    logger.warn(CONTEXT, "Invalid LinkedIn lead or form URN", { leadUrn, formUrn });
    return null;
  }

  const url = `${LINKEDIN_API_BASE}/leadGenForms/${formId}/leads/${leadId}`;

  try {
    logger.info(CONTEXT, `Fetching lead ${leadId} from LinkedIn API`);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(CONTEXT, `LinkedIn API error ${res.status}`, body);
      return null;
    }

    const data = await res.json();
    logger.debug(CONTEXT, "LinkedIn API response", data);

    return {
      name: readLeadValue(data, "fullName"),
      email: readLeadValue(data, "email"),
      phone: readLeadValue(data, "phone"),
      jobTitle: readLeadValue(data, "jobTitle"),
    };
  } catch (err) {
    logger.error(CONTEXT, "LinkedIn API fetch failed", err);
    return null;
  }
}

/**
 * Validate the X-LI-Signature header that LinkedIn sends
 * with every webhook notification (HMAC-SHA256).
 *
 * Returns true when the signature matches.
 */
export function verifyLinkedInSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.LINKEDIN_SECRET;

  if (!secret) {
    logger.warn(CONTEXT, "LINKEDIN_SECRET not set – skipping signature check");
    return true; // fail-open in dev; tighten in prod
  }

  if (!signatureHeader) {
    logger.warn(CONTEXT, "Missing X-LI-Signature header");
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const isValid = crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signatureHeader, "hex")
  );

  if (!isValid) {
    logger.warn(CONTEXT, "Signature mismatch");
  }

  return isValid;
}