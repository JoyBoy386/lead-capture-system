import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pywhatkit
from dotenv import load_dotenv


load_dotenv()

HOST = os.environ.get("WHATSAPP_WORKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("WHATSAPP_WORKER_PORT", "8787"))
TOKEN = os.environ.get("WHATSAPP_WORKER_TOKEN", "")
TEMPLATE = os.environ.get(
    "WHATSAPP_MESSAGE_TEMPLATE",
    "Hi {name}, thank you for your interest. We received your lead from {source}.",
)


class WhatsAppWorkerHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.path != "/send":
            self.send_error(404, "Not found")
            return

        if not TOKEN or self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_error(401, "Unauthorized")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length > 16_384:
                self.send_error(413, "Payload too large")
                return

            payload = json.loads(self.rfile.read(content_length))
            phone = str(payload.get("to", "")).strip()
            name = str(payload.get("name", "there")).strip() or "there"
            source = str(payload.get("source", "lead form")).strip() or "lead form"

            if not phone:
                self.send_error(400, "Missing recipient phone number")
                return

            message = TEMPLATE.replace("{name}", name).replace("{source}", source)
            pywhatkit.sendwhatmsg_instantly(
                phone,
                message,
                wait_time=15,
                tab_close=True,
                close_time=3,
            )

            response = json.dumps({"success": True}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)
        except Exception as error:
            self.send_error(500, str(error))

    def log_message(self, format: str, *args: object) -> None:
        print(f"[whatsapp-worker] {format % args}")


def main() -> None:
    if not TOKEN:
        raise RuntimeError("WHATSAPP_WORKER_TOKEN must be configured")

    server = ThreadingHTTPServer((HOST, PORT), WhatsAppWorkerHandler)
    print(f"WhatsApp worker listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()