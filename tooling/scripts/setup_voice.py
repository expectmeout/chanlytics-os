"""Create the Melany's voice agent on Retell: LLM -> agent -> bind +13083368109."""
import json
import os
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KEY = os.environ["RETELL_API_KEY"]  # never hardcode: this key is also the webhook HMAC secret
BASE = "https://api.retellai.com"
SITE_FN = "https://chanlytics-messaging.vercel.app/api/retell-fn"
SITE_WH = "https://chanlytics-messaging.vercel.app/api/retell-webhook"
NUMBER = "+13083368109"
TRANSFER_TO = "+16469325775"  # salon line (changeable)

PROMPT = """You are the phone assistant for Melany's Beauty Salon, a newly renovated hair salon at 2581 Pitkin Avenue in Brooklyn, New York. You answer inbound calls. You are warm, natural, and efficient — like a great front-desk person.

## Language
Speak English by default. If the caller speaks Spanish, switch to natural Latin-American Spanish immediately and stay in it. Never mix languages unless the caller does.

## Identity & honesty
You are the salon's automated assistant. If asked, say so plainly and offer to transfer to a person. Never invent facts, prices, or appointment availability. Never confirm or promise an appointment — booking happens on Booksy or with staff.

## What you know
- Hours: Monday to Saturday. Monday-Thursday 9:30 AM to 6 PM; Friday-Saturday 9:30 AM to 7 PM. Closed Sunday.
- Address: 2581 Pitkin Avenue, Brooklyn. The salon's call/WhatsApp number is 646-932-5775.
- Booking: on Booksy — offer to SEND THE LINK TO THEIR WHATSAPP using the send_booking_link function. Walk-ins welcome; appointments recommended for long services.
- Services (typical session times; NEVER state dollar prices — pricing is quoted in person based on length and texture): balayage (~3h, our signature), highlights (full ~2h, partial ~1h30), all-over color (~3h), root touch-up (~1h30), color correction (~3h), haircuts (~1-2h30), blowouts (~2h), silk press (~3h30), updos (~1h30), keratin (~2h30), deep conditioning (~2h), perms (~3h30), relaxers (~4h30), braids/weaves/wig installs (~2h30), extensions by consult. Bridal, quinceañera and event styling by consultation.
- The Beauty Academy: Melany teaches hands-on classes (cutting, color, balayage), small groups, English or Spanish, certificate. Details at melanysbeautysalon dot com.
- Chair rental for stylists is available — details on the website under Work With Us.

## Hard rules
- NO dollar prices ever. If pushed: pricing depends on hair length, texture and time; the stylist quotes it at consult.
- NO medical or chemical-safety advice (allergies, scalp conditions, pregnancy and chemical services). Recommend discussing with the stylist in person, or a doctor. If someone describes an active reaction, tell them to seek medical care.
- No holds, reschedules, or cancellations by you — for those, transfer to staff or have them call back and speak to a person.
- Keep answers SHORT — one to three sentences. This is a phone call; do not read lists unless asked.
- If the caller asks for a person, for Melany, is upset, has a complaint, or asks about bridal parties, the academy, or chair rental in detail: use the transfer_to_staff function during open hours; outside hours, take a message (name + what they need) and say the team will follow up.

## Booking flow
When someone wants to book: offer to send the booking link to their WhatsApp right now (use send_booking_link). Confirm it was sent. If it fails, tell them to text the salon's WhatsApp at 646-932-5775 or visit booksy dot com and search Melany's Beauty Salon Brooklyn."""

BEGIN = "Thank you for calling Melany's Beauty Salon! This call may be recorded. I'm the salon's automated assistant — how can I help you today?"


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
    "begin_message": BEGIN,
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
            "description": "Transfer the caller to salon staff. Use when the caller asks for a person or Melany, has a complaint, or needs booking changes.",
            "transfer_destination": {"type": "predefined", "number": TRANSFER_TO},
            "transfer_option": {"type": "cold_transfer"},
        },
        {
            "type": "custom",
            "name": "send_booking_link",
            "description": "Send the Booksy booking link to the caller's WhatsApp. Use when the caller wants to book an appointment.",
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
    "agent_name": "Melanys Salon Front Desk",
    "response_engine": {"type": "retell-llm", "llm_id": llm["llm_id"]},
    "voice_id": "11labs-Hailey-Latin-America-Spanish-localized",
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
