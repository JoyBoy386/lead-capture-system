import crypto from "crypto";
import { logger } from "./logger";

const CONTEXT = "linkedin";
const LINKEDIN_API_BASE = "https://api.linkedin.com/rest";
const API_VERSION = "202401";

/**
 * Fetch the form schema and lead response, then map question IDs to names.
 */
export async function fetchLinkedInLeadData(
  leadUrn: string,
  formUrn: string
): Promise<Record<string, string> | null> {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;

  if (!accessToken) {
    logger.error(CONTEXT, "LINKEDIN_ACCESS_TOKEN is not set");
    return null;
  }

  const leadId = leadUrn.split(":").pop() || "";
  const formId = formUrn.match(/leadGenForm:(\d+)/)?.[1] || "";

  if (!leadId || !formId) {
    logger.warn(CONTEXT, "Invalid LinkedIn lead or form URN", { leadUrn, formUrn });
    return null;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };

  try {
    const formRes = await fetch(`${LINKEDIN_API_BASE}/leadForms/${formId}`, { headers });
    if (!formRes.ok) throw new Error(`Form fetch failed: ${formRes.status}`);

    const formData = await formRes.json();
    const questionMap: Record<string, string> = {};

    for (const question of formData.content?.questions ?? []) {
      if (question.questionId && question.predefinedField) {
        questionMap[question.questionId] = question.predefinedField
          .toLowerCase()
          .replace(/_/g, "");
      } else if (question.questionId && question.name) {
        questionMap[question.questionId] = question.name
          .toLowerCase()
          .replace(/_/g, "");
      }
    }

    const leadRes = await fetch(`${LINKEDIN_API_BASE}/leadFormResponses/${leadId}`, { headers });
    if (!leadRes.ok) throw new Error(`Lead fetch failed: ${leadRes.status}`);

    const leadData = await leadRes.json();
    const parsedLead: Record<string, string> = {};

    for (const answer of leadData.formResponse?.answers ?? []) {
      const fieldName = questionMap[answer.questionId] || `custom_q_${answer.questionId}`;
      const textAnswer = answer.answerDetails?.textQuestionAnswer?.answer;
      const choiceAnswer = answer.answerDetails?.multipleChoiceAnswer?.options;

      if (textAnswer) {
        parsedLead[fieldName] = String(textAnswer).trim();
      } else if (Array.isArray(choiceAnswer)) {
        parsedLead[fieldName] = `Option IDs: ${choiceAnswer.join(", ")}`;
      }
    }

    logger.info(CONTEXT, `Successfully parsed LinkedIn lead ${leadId}`);
    return parsedLead;
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
    logger.error(CONTEXT, "LINKEDIN_SECRET is not set");
    return false;
  }

  if (!signatureHeader) {
    logger.warn(CONTEXT, "Missing X-LI-Signature header");
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signatureHeader, "hex");
  const isValid =
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer);

  if (!isValid) {
    logger.warn(CONTEXT, "Signature mismatch");
  }

  return isValid;
}