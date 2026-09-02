"""Provision a Retell voice agent that reads its facts from Chanlytics, not from here.

Run:  RETELL_API_KEY=... VOICE_NUMBER=+1... VOICE_TRANSFER_TO=+1... python setup_voice.py

WHY THIS FILE NO LONGER CONTAINS A BUSINESS.

It used to carry one business's hours, address, phone number, booking link and
services in a hardcoded prompt — a frozen copy of facts the product now owns.
Two things followed from that, and both were real:

  * correcting the opening hours in Settings changed what the WhatsApp
    receptionist said and left the phone agent saying the old ones, because its
    prompt lived in Retell's dashboard;
  * re-running this script would have RESTORED that copy over the top, silently
    undoing the fix.

The agent's prompt is now a shell over dynamic variables the inbound webhook
supplies per call (apps/edge/api/retell-inbound.ts):

  {{business_facts}}   the composed prompt — hours, services, closures,
                       guardrails, and the current time in the business's zone
  {{caller_context}}   who is calling, from the same rows the WhatsApp
                       receptionist reads
  {{greeting}}         the opening line, naming the business only when the
                       call could be routed to one

Anything you would be tempted to add here as text is a fact, and facts belong
in Settings, where the owner can see and change them. What stays is the shape
of the call: which tools exist, which number is bound, how long silence runs.
"""
import json
import os
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KEY = os.environ["RETELL_API_KEY"]  # never hardcode: this key is also the webhook HMAC secret
BASE = "https://api.retellai.com"
SITE_FN = "https://chanlytics-messaging.vercel.app/api/retell-fn"
SITE_WH = "https://chanlytics-messaging.vercel.app/api/retell-webhook"

# Per-tenant, so provisioning a second business is a different invocation of
# the same script rather than a second copy of it.
NUMBER = os.environ["VOICE_NUMBER"]                 # e.g. +13083368109
TRANSFER_TO = os.environ["VOICE_TRANSFER_TO"]       # the line a human answers
AGENT_NAME = os.environ.get("VOICE_AGENT_NAME", "Front Desk")
VOICE_ID = os.environ.get("VOICE_ID", "11labs-Hailey-Latin-America-Spanish-localized")

# The ENTIRE prompt. Every fact arrives at call time; what is written here is
# only what the variables cannot say for themselves — the shape of a phone call
# and when to reach for a tool.
PROMPT = """{{business_facts}}

Who you are speaking with:
{{caller_context}}

On this call:
- You are on the phone. Keep answers to one or two sentences and never read a
  URL out character by character — offer to text it instead.
- To send the booking link to the caller's WhatsApp, use send_booking_link, then
  confirm it was sent. If it fails, give the phone number above and say a person
  will follow up.
- If the caller asks for a person, is upset, has a complaint, or needs something
  the facts above do not cover, use transfer_to_staff during opening hours.
  Outside them, take a name and a message and say the team will follow up.
- End the call with end_call once the caller has said goodbye."""


def call(method, path, payload=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} on {path}: {e.read().decode()[:500]}")
        raise SystemExit(1)


llm = call("POST", "/create-retell-llm", {
    "model": "claude-4.5-haiku",
    "start_speaker": "agent",
    # Composed by the webhook, so the recording disclosure and the business
    # name cannot drift apart from the product.
    "begin_message": "{{greeting}}",
    "general_prompt": PROMPT,
    "model_temperature": 0,
    "general_tools": [
        {
            "type": "end_call",
            "name": "end_call",
            "description": "End the call when the conversation is complete and the caller has said goodbye.",
        },
        {
            "type": "transfer_call",
            "name": "transfer_to_staff",
            "description": "Transfer the caller to staff. Use when the caller asks for a person, has a complaint, or needs booking changes.",
            "transfer_destination": {"type": "predefined", "number": TRANSFER_TO},
            "transfer_option": {"type": "cold_transfer"},
        },
        {
            "type": "custom",
            "name": "send_booking_link",
            "description": "Send the booking link to the caller's WhatsApp. Use when the caller wants to book an appointment.",
            "url": SITE_FN,
            "method": "POST",
            "speak_during_execution": True,
            "execution_message_description": "Say you are sending the booking link to their WhatsApp now.",
            "speak_after_execution": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "phone_number": {
                        "type": "string",
                        "description": "Alternate number to send the link to, digits only with country code. Omit to use the caller's number.",
                    }
                },
                "required": [],
            },
        },
    ],
})
print("llm_id:", llm["llm_id"])

agent = call("POST", "/create-agent", {
    "agent_name": AGENT_NAME,
    "response_engine": {"type": "retell-llm", "llm_id": llm["llm_id"]},
    "voice_id": VOICE_ID,
    "language": "multi",
    "webhook_url": SITE_WH,
    "end_call_after_silence_ms": 30000,
    "post_call_analysis_data": [],
})
print("agent_id:", agent["agent_id"])

num = call("PATCH", f"/update-phone-number/{NUMBER}", {
    "inbound_agents": [{"agent_id": agent["agent_id"], "weight": 1}],
})
print("number bound:", json.dumps({k: num.get(k) for k in ("phone_number", "inbound_agents")})[:300])

json.dump({"llm_id": llm["llm_id"], "agent_id": agent["agent_id"], "number": NUMBER},
          open(__file__.replace("setup_voice.py", "voice-ids.json"), "w"), indent=2)
print("DONE — call", NUMBER)
print()
print("The agent holds no business facts. They arrive per call from")
print("apps/edge/api/retell-inbound.ts, so editing Settings changes what it says.")
