import { logger } from "./logger";

const CONTEXT = "whatsapp";

interface WhatsAppMessage {
  to: string;
  name: string;
  source: string;
}

export async function sendWhatsAppMessage(
  message: WhatsAppMessage
): Promise<boolean> {
  if (process.env.WHATSAPP_ENABLED !== "true") {
    logger.info(CONTEXT, "WhatsApp automation is disabled");
    return true;
  }

  if (!message.to.trim()) {
    logger.warn(CONTEXT, "Skipped WhatsApp message because lead has no phone number");
    return false;
  }

  const workerUrl = process.env.WHATSAPP_WORKER_URL;
  const workerToken = process.env.WHATSAPP_WORKER_TOKEN;

  if (!workerUrl || !workerToken) {
    logger.error(CONTEXT, "WhatsApp worker URL or token is not configured");
    return false;
  }

  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(45_000),
    });

    const responseBody = await response.text();

    if (!response.ok) {
      logger.error(CONTEXT, `WhatsApp worker returned ${response.status}`, responseBody);
      return false;
    }

    logger.info(CONTEXT, "WhatsApp worker accepted message", {
      to: message.to,
      response: responseBody,
    });
    return true;
  } catch (err) {
    logger.error(CONTEXT, "WhatsApp worker request failed", err);
    return false;
  }
}