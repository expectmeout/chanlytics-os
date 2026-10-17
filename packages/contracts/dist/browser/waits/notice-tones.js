import { NOTICE_MENDS } from "./notice-mends.js";
const LISTED = [
  // A line's own news (lines/provision.ts, voice/voice-provision.ts, voice/forwarding.ts, channels a2p verdict.ts).
  { kind: "number", title: /^Your phone line is ready: /u, tone: "ok" },
  { kind: "number", title: /^Forwarding works: /u, tone: "ok" },
  { kind: "number", title: /^Texting is on: /u, tone: "ok" },
  { kind: "number", title: /^Your business is approved by the carriers$/u, tone: "ok" },
  // The subscription (contracts workspace/billing.ts planBilling's bell).
  { kind: "billing", title: /^Your trial has started$/u, tone: "ok" },
  // The carriers' refusals of a texting registration (channels a2p verdict.ts), kept as alerts: warnings.
  { kind: "alert", title: /^The carriers sent your texting registration back$/u, tone: "warn" },
  { kind: "alert", title: /^Your texting registration stopped$/u, tone: "warn" }
];
const MENDS = NOTICE_MENDS.flatMap(
  (m) => "kind" in m.by ? [{ kind: m.by.kind, title: m.by.title, tone: "ok" }] : []
);
export function noticeTone(kind, title) {
  const hit = [...MENDS, ...LISTED].find((t) => t.kind === kind && t.title.test(title));
  return hit ? hit.tone : null;
}
