"""Provision a Retell voice agent that reads its facts from Chanlytics, not from here.

Run:  RETELL_API_KEY=... RETELL_FN_SECRET=... VOICE_NUMBER=+1... python setup_voice.py

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
  {{handoff_number}}   the line a person answers, from the profile; the
                       transfer tool dials it. Omitted when there is none.

This file is a MIRROR of packages/channels/src/voice-shell.ts — the prompt,
the variable names and the tools are defined there once, read by the
converger (tooling/scripts/voice-converge.mjs, which brings an EXISTING agent
onto the shell in place) and by /api/diag's drift report. A test pins PROMPT
equal to the shell. Edit the TypeScript first.

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
FN_SECRET = os.environ["RETELL_FN_SECRET"]          # the edge refuses the booking tool without it
# The transfer number is NOT an env fact any more: it is the profile's
# handoff_number, sent per call as {{handoff_number}}.
AGENT_NAME = os.environ.get("VOICE_AGENT_NAME", "Front Desk")
VOICE_ID = os.environ.get("VOICE_ID", "11labs-Hailey-Latin-America-Spanish-localized")

# The ENTIRE prompt. Every fact arrives at call time — and so does the shape
# of the call: the composer (contracts composeSystemPrompt, channel "voice")
# tells the agent when to transfer, how booking works and when to end the
# call, inside business_facts. Nothing here but the placeholders.
PROMPT = """{{business_facts}}

Who you are speaking with:
{{caller_context}}"""

# What the agent hears when a variable could not be supplied. A missing
# variable is read aloud as its own placeholder; "" skips this default.
DEFAULT_VARIABLES = {
    "business_facts": (
        "The business's details could not be loaded for this call. Do not state opening hours, prices, "
        "services or an address from memory — you do not have them. Say you will have someone confirm, "
        "offer to take a message, and offer to text the booking link."
    ),
    "caller_context": "New caller - no prior interactions on record.",
    "greeting": "Thank you for calling! This call may be recorded. I'm the automated assistant — how can I help you today?",
    "handoff_number": "",
}


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
    "default_dynamic_variables": DEFAULT_VARIABLES,
    "general_tools": [
        {
            "type": "end_call",
            "name": "end_call",
            "description": "End the call once the conversation is complete and the caller has said goodbye.",
        },
        {
            "type": "transfer_call",
            "name": "transfer_to_staff",
            "description": "Transfer the caller to a person on the business's own line. Use during opening hours when the caller asks for a person, has a complaint, or needs something the facts do not cover.",
            # A dynamic variable, filled per call from the workspace's profile.
            "transfer_destination": {"type": "predefined", "number": "{{handoff_number}}"},
            "transfer_option": {"type": "warm_transfer", "show_transferee_as_caller": True, "on_hold_music": "relaxing_sound"},
        },
        {
            "type": "custom",
            "name": "send_booking_link",
            "description": "Text the booking link to the caller's WhatsApp. Use when the caller wants to book. It goes to the number they are calling from unless another number is given.",
            "url": SITE_FN,
            "method": "POST",
            "headers": {"x-fn-secret": FN_SECRET},
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
    # The events the pipeline is built on (transcript_updated = live
    # transcript), a webhook budget the recording copy fits in, and signed
    # recording links. Mirrors planAgentSettings in voice-shell.ts.
    "webhook_events": ["call_started", "call_ended", "call_analyzed", "transcript_updated"],
    "webhook_timeout_ms": 20000,
    "opt_in_signed_url": True,
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
