import crypto from "crypto";
import { logger } from "./logger";

const CONTEXT = "linkedin";

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