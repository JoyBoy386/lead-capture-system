import { logger } from "./logger";
import type { MetaFieldData } from "@/types/lead";

const CONTEXT = "facebook";
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

/**
 * Fetch full lead details from the Facebook Graph API
 * using the leadgen_id received in the webhook.
 */
export async function fetchLeadFromGraph(
  leadgenId: string
): Promise<{ field_data: MetaFieldData[] } | null> {
  const token = process.env.META_ACCESS_TOKEN;

  if (!token) {
    logger.error(CONTEXT, "META_ACCESS_TOKEN is not set");
    return null;
  }

  const url = `${GRAPH_BASE}/${leadgenId}?access_token=${token}`;

  try {
    logger.info(CONTEXT, `Fetching lead ${leadgenId} from Graph API`);

    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(CONTEXT, `Graph API error ${res.status}`, body);
      return null;
    }

    const data = await res.json();
    logger.debug(CONTEXT, "Graph API response", data);

    return {
      field_data: data.field_data ?? [],
    };
  } catch (err) {
    logger.error(CONTEXT, "Graph API fetch failed", err);
    return null;
  }
}

/**
 * Verify the webhook subscription (GET handshake).
 * Returns the challenge string if valid, null otherwise.
 */
export function verifyMetaWebhook(
  mode: string | null,
  token: string | null,
  challenge: string | null
): string | null {
  const expectedToken = process.env.META_VERIFY_TOKEN;

  if (mode === "subscribe" && token === expectedToken && challenge) {
    logger.info(CONTEXT, "Webhook verification successful");
    return challenge;
  }

  logger.warn(CONTEXT, "Webhook verification failed", { mode, token });
  return null;
}