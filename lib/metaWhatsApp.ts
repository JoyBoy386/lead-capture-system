import { logger } from "./logger";

const CONTEXT = "metaWhatsApp";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export interface WhatsAppNotificationPayload {
  to: string;
  name: string;
}

export async function sendWhatsAppNotification(
  payload: WhatsAppNotificationPayload
): Promise<boolean> {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error(
      CONTEXT,
      "Missing META_PHONE_NUMBER_ID or META_ACCESS_TOKEN in environment"
    );
    return false;
  }

  const cleanPhone = payload.to.replace(/\D/g, "");

  if (!cleanPhone) {
    logger.warn(CONTEXT, "No valid phone number supplied for WhatsApp notification");
    return false;
  }

  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;

  const messagePayload = {
    messaging_product: "whatsapp",
    to: cleanPhone,
    type: "template",
    template: {
      name: "lead_confirmation",
      language: {
        code: "en_US",
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: payload.name || "there",
            },
          ],
        },
      ],
    },
  };

  try {
    logger.info(CONTEXT, `Sending WhatsApp to ${cleanPhone}`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload),
    });

    const responseData = await res.json();

    if (!res.ok) {
      logger.error(CONTEXT, `Meta API error ${res.status}`, responseData);
      return false;
    }

    logger.info(CONTEXT, "✅ WhatsApp message sent successfully", {
      messageId: responseData.messages?.[0]?.id,
    });
    return true;
  } catch (err) {
    logger.error(CONTEXT, "Exception while sending WhatsApp message", err);
    return false;
  }
}
