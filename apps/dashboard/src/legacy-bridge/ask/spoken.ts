/**
 * A spoken turn, in the shape of a typed one (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended
 * 5 Oct 2026). The Line asks a question two ways: typed, through the stream (api.ts `send`), and spoken to the agent's
 * session on the lift of a hold (voice.ts). The two told it different things, so it drew a turn twice, and the spoken
 * one missed what the typed one had (a turn that a later question had replaced still drew; a turn that failed said
 * nothing). Here the spoken turn tells the Line the stream's own events:
 *
 *   - `thread`, the moment the session has taken the words (its thread; the words as the title a new one shows);
 *   - `trace` and `say`, as the agent speaks them;
 *   - `final`, the stored answer read off the thread once the turn lands, or once the session ends under it. Only this
 *     turn's answer is its answer: the thread is read as the words go, to know what it already held, and again at the
 *     end; the assistant's last message is the answer when it is a new one;
 *   - `error`, with the agent's own words, when the turn ended and nothing new was stored: a refusal the door speaks
 *     (a spent count, a turn it could not run) is never stored, so what was said is what went wrong. Where nothing was
 *     said either, nothing is told, and the Line says the turn was cut off, as it does for a stream that ended early.
 *
 * `sendSpoken` answers false, before it has told anything, when the words cannot go to the agent (no session up
 * within the lift's patience, or one that would not take them): they go the typed way. One turn at a time: a question
 * asked over one still unanswered ends the first with no answer, and whatever the vendor says of the first after that
 * reaches nobody.
 */
import type { AskMessageVM } from "@chanlytics/contracts";
import type { AskApiCalls, SendEvent } from "./api";
import type { installVoice, VoiceStart } from "./voice";

type Voice = Pick<ReturnType<typeof installVoice>, "soonVoice" | "sayVoice">;

export function spokenTurns(voice: Voice, api: Pick<AskApiCalls, "thread">) {
  /** The thread's newest message, or none (a thread that is gone, or could not be read). */
  const newest = async (threadId: string): Promise<AskMessageVM | undefined> => {
    const read = await api.thread(threadId);
    return read && !("missing" in read) ? read.messages.at(-1) : undefined;
  };
  /** The turn waiting on the agent, ended early when another is asked over it. */
  let waiting: (() => void) | null = null;
  return {
    sendSpoken: async (input: VoiceStart, words: string, on: (ev: SendEvent) => void): Promise<boolean> => {
      const up = await voice.soonVoice(input);
      if (!up) return false;
      let over = false;
      let superseded = false;
      let said = "";
      let end = () => {};
      const ended = new Promise<void>((resolve) => {
        end = () => {
          over = true;
          resolve();
        };
      });
      const taken = voice.sayVoice(words, (a) => {
        if (over) return;
        if (a.t === "trace") on({ t: "trace", text: a.text });
        else if (a.t === "say") {
          said = [a.headline, a.detail].filter(Boolean).join(" ");
          on({ t: "say", headline: a.headline, detail: a.detail });
        } else if (a.t === "landed" || a.t === "gone") end();
      });
      if (!taken) return false;
      if (waiting) waiting();
      waiting = () => {
        superseded = true;
        end();
      };
      // What the thread holds as the words go: read beside the agent's thinking, so it costs the turn no time.
      const held = newest(up.threadId);
      on({ t: "thread", id: up.threadId, title: words });
      await ended;
      if (superseded) return true;
      waiting = null;
      const [before, last] = await Promise.all([held, newest(up.threadId)]);
      if (last && last.role === "assistant" && last.id !== before?.id) on({ t: "final", message: last });
      else if (said) on({ t: "error", text: said });
      return true;
    },
  };
}
