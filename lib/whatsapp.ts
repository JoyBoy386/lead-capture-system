import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import { logger } from "./logger";

const CONTEXT = "whatsapp";

interface WhatsAppMessage {
  to: string;
  name: string;
  source: string;
}

let browserContextPromise: Promise<BrowserContext> | null = null;

function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (!digits) return "";

  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;

  return digits;
}

function buildMessageText(name: string, source: string): string {
  const template =
    process.env.WHATSAPP_MESSAGE_TEMPLATE ??
    "Hi {name}, thanks for your interest from {source}. We received your details and will contact you shortly.";

  return template
    .replace("{name}", name?.trim() || "there")
    .replace("{source}", source?.trim() || "our lead form");
}

function isProfileInUseError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /existing browser session|already in use by another instance|profile is already in use/i.test(message);
}

async function getBrowserContext(): Promise<BrowserContext> {
  const profileDir =
    process.env.WHATSAPP_BROWSER_PROFILE ??
    path.resolve(process.cwd(), ".whatsapp-browser");

  const chromeExecutablePath =
    process.env.WHATSAPP_CHROME_PATH ??
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  if (!browserContextPromise) {
    browserContextPromise = chromium
      .launchPersistentContext(profileDir, {
        headless: process.env.WHATSAPP_HEADLESS === "true",
        executablePath: chromeExecutablePath,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
        ],
      })
      .catch(async (err) => {
        browserContextPromise = null;

        if (isProfileInUseError(err)) {
          const message =
            "WhatsApp Chrome profile is already open in another browser session. Close Chrome completely and try again.";
          logger.error(CONTEXT, message, { profileDir, chromeExecutablePath });
          throw new Error(message);
        }

        if (profileDir) {
          try {
            await fs.rm(profileDir, { recursive: true, force: true });
            logger.warn(CONTEXT, "Cleared stale WhatsApp browser profile after launch failure", {
              profileDir,
            });
          } catch {
            // Ignore cleanup errors and retry once.
          }
        }

        return chromium.launchPersistentContext(profileDir, {
          headless: process.env.WHATSAPP_HEADLESS === "true",
          executablePath: chromeExecutablePath,
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
          ],
        });
      });
  }

  try {
    return await browserContextPromise;
  } catch (err) {
    browserContextPromise = null;
    throw err;
  }
}

async function openWhatsAppChat(phone: string, message: string): Promise<void> {
  const context = await getBrowserContext();
  const page = await context.newPage();

  try {
    const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}`;

    logger.info(CONTEXT, "Opening WhatsApp chat", { phone, url });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

    const waitForReady = async (): Promise<void> => {
      const loginSelectors = [
        "text=Scan to log in",
        "text=Log in to WhatsApp",
        "text=Use WhatsApp on your computer",
        "text=Keep your phone connected",
      ];

      for (const selector of loginSelectors) {
        if (await page.locator(selector).first().isVisible().catch(() => false)) {
          throw new Error("WhatsApp Web is not logged in. Please scan the QR code.");
        }
      }

      const composerSelectors = [
        'div[contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        'div[data-tab="10"]',
        'div[contenteditable="true"][dir="auto"]',
      ];

      for (const selector of composerSelectors) {
        const locator = page.locator(selector).last();

        if ((await locator.count()) > 0) {
          await locator.waitFor({ state: "visible", timeout: 30_000 });
          return;
        }
      }

      const chatHeader = page.getByRole("heading");
      if ((await chatHeader.count()) > 0) {
        await page.waitForTimeout(2_000);
      }

      throw new Error("Unable to find the WhatsApp message composer.");
    };

    await waitForReady();

    const composerSelectors = [
      'div[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      'div[data-tab="10"]',
      'div[contenteditable="true"][dir="auto"]',
    ];

    let composer: { fill: (value: string) => Promise<void> } | null = null;

    for (const selector of composerSelectors) {
      const locator = page.locator(selector).last();
      if ((await locator.count()) > 0) {
        composer = locator;
        break;
      }
    }

    if (!composer) {
      throw new Error("Unable to find the WhatsApp message composer.");
    }

    await composer.fill(message);
    await page.keyboard.press("Enter");
  } finally {
    await page.close();
  }
}

export async function sendWhatsAppMessage(
  message: WhatsAppMessage
): Promise<boolean> {
  if (process.env.WHATSAPP_ENABLED !== "true") {
    logger.info(CONTEXT, "WhatsApp automation is disabled");
    return true;
  }

  const recipient = (message.to ?? "").trim();

  if (!recipient) {
    logger.warn(CONTEXT, "Skipped WhatsApp message because lead has no phone number");
    return false;
  }

  const normalizedPhone = normalizePhoneNumber(recipient);

  if (!normalizedPhone) {
    logger.warn(CONTEXT, "Skipped WhatsApp message because phone number was invalid", {
      raw: recipient,
    });
    return false;
  }

  try {
    const text = buildMessageText(message.name, message.source);
    await openWhatsAppChat(normalizedPhone, text);

    logger.info(CONTEXT, "WhatsApp message sent", {
      to: normalizedPhone,
      name: message.name,
      source: message.source,
    });

    return true;
  } catch (err) {
    logger.error(CONTEXT, "WhatsApp automation failed", err);
    return false;
  }
}