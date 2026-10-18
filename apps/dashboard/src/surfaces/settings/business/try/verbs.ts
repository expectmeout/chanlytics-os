/**
 * Settings › How it answers, Try it: its one door, POST receptionist/try (server/receptionist/try.ts), which answers a
 * message as the receptionist would and sends nothing. An object the card imports, so a test stands a door in by
 * assigning onto it, as Autonomy's are (settings/autonomy/verbs.ts).
 */
import type { TryItVM } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";

/** One turn of what was tried before, as the route takes it. */
export interface TryTurn {
  role: "user" | "assistant";
  content: string;
}

/** The receptionist's answer to `text` after the turns tried before it, or the refusal's words. Never throws. */
async function askReceptionist(
  text: string,
  history: readonly TryTurn[],
): Promise<{ ok: true; vm: TryItVM } | { ok: false; message: string }> {
  const r = await api()("POST receptionist/try", { body: { text, history: [...history] } });
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, vm: r.data };
}

export const tryVerbs = { ask: askReceptionist };
