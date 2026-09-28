# Voice agent settings — design note

**Status:** the SHELL pipeline is built (2026-09-04); the settings pane below is
still a design note.

**Built:** `packages/channels/src/voice/voice-shell.ts` defines the agent's prompt
shell (`{{business_facts}}` + `{{caller_context}}`, greeting `{{greeting}}`,
warm transfer to `{{handoff_number}}`, spoken defaults for every variable).
The inbound-call webhook fills the variables per call from the same profile
the WhatsApp receptionist reads — `composeSystemPrompt(…, "voice")` now
carries the phone mechanics (transfer, booking link, end call) and the new
profile fields `handoff_number`, `website`, `notes[]` and the opt-in
`no_health_advice` guardrail, all editable in Settings → Business.
`tooling/scripts/ops/voice-converge.mjs` brings an existing hand-typed agent onto
the shell (dry-run default, JSONL backup, `--apply`, `--pin`), and
`/api/diag` reports `voiceAgents[].shell.drift` so a line that slid off it is
visible. Applying it to the live salon agent is the owner's step: the line
runs the LATEST version, so the apply changes what the next caller hears.
**Goal:** a tenant tunes their phone receptionist from Chanlytics. Nobody signs
into Retell.

---

## The finding that shapes everything

Retell splits one "agent" across **two objects with two endpoints**, and the
split is not where you would guess:

| What a tenant wants to change                          | Lives on       | Endpoint                            |
| ------------------------------------------------------ | -------------- | ----------------------------------- |
| What it says, first line, knowledge                    | **Retell LLM** | `PATCH /update-retell-llm/{llm_id}` |
| Voice, speed, interruption, voicemail, silence timeout | **Agent**      | `PATCH /update-agent/{agent_id}`    |

So "edit my greeting" and "make it less interrupt-y" are two different API
calls against two different ids. Any settings page that pretends otherwise will
be rewritten the first time it saves.

**We already store both ids.** No migration is needed to start:

```
tenant_channels
  kind        = 'voice'
  external_id = 'agent_…'   -- the Agent
  config      = { "provider": "retell",
                  "llm_id": "llm_…" }
```

`external_id` is already the routing key the voice webhook resolves tenants by,
so the row that receives calls is the same row that would be edited. That is the
right shape and it is already in place.

---

## The tenancy question to answer first

Two models, and the choice decides the whole build:

**A. One Retell agent per tenant.** Each tenant owns an agent + LLM. Full
freedom, natural isolation, and the ids already live on their channel row.
Cost: provisioning a new tenant means creating two Retell objects and buying a
number — real onboarding work, and Retell's per-agent limits become ours.

**B. One shared agent, per-tenant `default_dynamic_variables`.** The LLM's
prompt is written once with placeholders; business name, hours, booking link and
transfer number are injected per call. Onboarding is a row, not an API call.
Cost: a tenant cannot meaningfully change _how it talks_, only the facts it
talks about — and one bad prompt edit would affect everyone.

**Recommendation: A, with B's mechanism inside it.** Per-tenant agents for
isolation, but keep the business facts in `default_dynamic_variables` rather
than baked into prompt text, so the same fields feed the WhatsApp brain profile
and the voice agent from one place. There is no fallback profile
any more; the Retell prompt still carries the facts a second time.

---

## What to expose, and what not to

Retell's update surface is large. Most of it is a trap: `voice_temperature`,
`backchannel_frequency` and `reminder_trigger_ms` are knobs a salon owner cannot
evaluate and will turn until the agent is worse.

**Expose (a tenant can judge the result):**

- Greeting — `begin_message` on the LLM
- What it should and shouldn't say — a bounded section of `general_prompt`
- Business facts — hours, booking link, transfer number, languages
- Voice — `voice_id`, from a curated shortlist we have actually listened to
- Speaking speed — `voice_speed`, three steps, not a float
- When to hand off to a human — voicemail and transfer behaviour
- Language — `language`

**Do not expose (no way to judge, high blast radius):**

- `model`, `s2s_model`, `model_temperature`
- `responsiveness`, `interruption_sensitivity`, backchannel settings
- `webhook_url`, `webhook_events` — ours; a tenant editing this silences their
  own call logging
- `general_tools`, `mcps`, `states` — these are the product, not settings

**Never round-trip the whole prompt.** Store the tenant's editable fields in
`tenant_config` as structured data and _compose_ `general_prompt` from a
template we own. A free-text prompt box hands tenants the ability to remove the
guardrails — the price policy, the "never confirm a booking yourself" rule, the
bot-disclosure line — and we would have no way to tell that they had.

---

## Where it belongs in the UI

**Settings, not Agents.** The Agents surface is a fleet roster — status,
activity, what each one is doing. This is configuration of one channel the
tenant owns, and it sits beside the WhatsApp brain profile, which is the same
kind of thing and already lives in Settings. Putting voice somewhere else makes
"change what my receptionist says" two different journeys depending on whether
someone typed or phoned.

A deep link from the Agents row into that Settings pane costs nothing and gives
both entry points.

---

## Build order when the phase opens

1. **Read path first.** Show the live Retell config read-only, sourced from the
   API. If what we render does not match what the tenant hears on the phone, we
   learn that before anyone can write.
2. **Structured fields → composed prompt.** `tenant_config.voice` holds the
   editable facts; a pure function composes `general_prompt` and
   `default_dynamic_variables`. Testable without touching Retell.
3. **Write path, owner-only.** Goes through `requireRole(member, "owner")` like
   every other committing verb, and writes both objects — LLM then Agent —
   recording a `decision` row so a change that ruins call quality is traceable
   to a person and a time.
4. **A test call.** A settings page that cannot be verified will not be trusted.
   Retell can place an outbound call to the owner's own number; "hear it before
   you save" is the feature that makes the rest safe.

---

## Prerequisites this is blocked on

- **Per-tenant Retell credentials.** The API key is currently ours, in env.
  Editing a tenant's agent with a platform-wide key is fine while every agent is
  ours; it stops being fine the moment a tenant brings their own Retell account.
  This is the same blocker as per-tenant WhatsApp send credentials, and
  `tenant_channels.credentials_ref` already exists for it.
- **Retell key rotation** (owed, deferred by the project owner).
- **Voice path parity** — `retell-fn` currently bypasses pause, rate cap and
  reply mode. Settings that promise "hand off to a human" should mean the same
  thing on both channels before we let tenants configure it.
