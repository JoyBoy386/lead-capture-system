import { spawn } from "child_process";
import path from "path";
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

  const pythonCommand = process.env.PYTHON_COMMAND || "python";
  const scriptPath = path.join(process.cwd(), "scripts", "send_whatsapp.py");
  const messageTemplate =
    process.env.WHATSAPP_MESSAGE_TEMPLATE ||
    "Hi {name}, thank you for your interest. We received your lead from {source}.";

  return new Promise((resolve) => {
    const child = spawn(pythonCommand, [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WHATSAPP_MESSAGE_TEMPLATE: messageTemplate,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });
    child.on("error", (error) => {
      logger.error(CONTEXT, "Could not start Python WhatsApp worker", error);
      resolve(false);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        logger.error(CONTEXT, "WhatsApp worker failed", errorOutput || output);
        resolve(false);
        return;
      }

      logger.info(CONTEXT, "WhatsApp message sent", {
        to: message.to,
        response: output.trim(),
      });
      resolve(true);
    });

    child.stdin.write(JSON.stringify(message));
    child.stdin.end();
  });
}