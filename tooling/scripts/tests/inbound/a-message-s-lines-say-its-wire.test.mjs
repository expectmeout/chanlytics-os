/**
 * Every line the receptionist's verb writes about a message says which wire it came on (core inbound/context.ts binds
 * `channel`). The names stay WhatsApp's (`wa_*`: the names are the contract alerting greps for), so without the field a
 * text's or a DM's lines could not be told from WhatsApp's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { linesOf } from "../_log-lines.mjs";
import { runtime, text, world } from "./_world.mjs";

const onAsk = runtime({ policy: { reply: { mode: "ask", limits: {} } } });
const line = {
  channel: "sms",
  send: async () => ({ ok: true, wamid: "SM1", status: 201 }),
  body: (t) => t,
  held: null,
};

/** The lines the verb wrote: the ones its bound logger carries the sender's tail on. */
const verbLines = (lines) => lines.filter((l) => typeof l.from_tail === "string");

test("a text's lines say sms, and a WhatsApp message's say whatsapp", async () => {
  for (const [carrier, wire] of [
    [line, "sms"],
    [null, "whatsapp"],
  ]) {
    const w = world({ rt: onAsk, ...(carrier ? { carrier } : {}) });
    const { lines } = await linesOf(() => w.run(text("are you open saturday?", `id-${wire}`)));
    const said = verbLines(lines);
    assert.ok(said.length > 0, `${wire}: the verb said something, so this is not a search of no lines`);
    for (const l of said) assert.equal(l.channel, wire, `${l.event} names its wire`);
  }
});
