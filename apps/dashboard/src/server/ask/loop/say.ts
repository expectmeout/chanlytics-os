import "server-only";
import { answerSoFar, partialSay, proseAnswer } from "@chanlytics/contracts";
import { log } from "@/server/log";
import type { Offer } from "../refusals";
import type { ToolContext } from "../tools";
import type { turnMeter } from "../turn-end";
import type { TurnInput } from "../loop";

/** Say is sent at most this often while it is written (spec 7.4). */
const SAY_EVERY_MS = 50;

/**
 * Say while the answer is written (spec 7.4): read from the JSON so far --
 * the model may write it with the format refused too -- sent only when it
 * changed and at most every SAY_EVERY_MS. A preview: the final message is
 * the truth. With the format refused, words are said as they come; with it,
 * words before a call are the model thinking aloud, and are not said.
 */
export function sayAsWritten(input: TurnInput, tc: ToolContext, offer: Offer, meter: ReturnType<typeof turnMeter>) {
  let said = "";
  let saidAt = 0;
  let firstKey: string | null = null;
  const onText = (soFar: string) => {
    const json = soFar.trimStart().startsWith("{");
    if (json && firstKey === null) {
      const k = /^\s*\{\s*"([^"]*)"/.exec(soFar);
      if (k) {
        firstKey = k[1];
        if (firstKey !== "say")
          log.warn("ask_say_not_first", { first: firstKey.slice(0, 40), tenant_id: input.tenantId });
      }
    }
    // Drawn as the final message will draw it (contracts partialSay, proseAnswer): nothing past a tag, the leak seen on
    // production, the detail's lines kept, and Show's figures and rows once each closes (answerSoFar).
    const part = json ? partialSay(soFar) : offer.format ? null : proseAnswer(soFar, input.language).say;
    if (!part || (!part.headline && !part.detail)) return;
    const say = answerSoFar(part, json ? soFar : "", tc.read, input.language);
    const key = JSON.stringify(say);
    const at = Date.now();
    if (key === said || at - saidAt < SAY_EVERY_MS) return;
    said = key;
    saidAt = at;
    meter.said();
    input.emit({ t: "say", ...say });
  };
  /** An answer set aside after its Say was sent: an empty Say takes it back, and the Line shows the reads again. */
  const unsay = () => {
    if (!said) return;
    said = "";
    saidAt = 0;
    input.emit({ t: "say", headline: "", detail: "" });
  };
  return { onText, unsay };
}
