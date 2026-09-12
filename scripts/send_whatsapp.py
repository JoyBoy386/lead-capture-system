import json
import os
import sys

import pywhatkit


def main() -> int:
    payload = json.loads(sys.stdin.read())
    phone = str(payload.get("to", "")).strip()
    name = str(payload.get("name", "there")).strip() or "there"
    source = str(payload.get("source", "lead form")).strip() or "lead form"

    if not phone:
        print("Missing recipient phone number", file=sys.stderr)
        return 1

    template = os.environ.get(
        "WHATSAPP_MESSAGE_TEMPLATE",
        "Hi {name}, thank you for your interest. We received your lead from {source}.",
    )
    message = template.replace("{name}", name).replace("{source}", source)

    pywhatkit.sendwhatmsg_instantly(
        phone,
        message,
        wait_time=15,
        tab_close=True,
        close_time=3,
    )
    print("sent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())