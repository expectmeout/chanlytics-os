import { voiceDoor } from "@/server/ask/voice-door";

/**
 * POST /api/ask/voice/llm[/chat/completions | /v1/chat/completions] — the custom LLM endpoint the ElevenLabs agent
 * calls, one request per spoken turn (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.3;
 * docs/decisions/0026-a-provider-calls-the-dashboard.md). A raw route outside withRoute, as /api/version is: the
 * caller is a provider with no cookie, so the proxy lets these three exact paths through (the vendor appends
 * /chat/completions to the address it is given) and the door proves the caller twice, by the agent's secret and by
 * the session's id, before it reads a byte of the body. Everything else is server/ask/voice-door.ts. Sixty seconds, as
 * /api/v1/ask has.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (req: Request): Promise<Response> => voiceDoor(req);
