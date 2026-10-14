/**
 * Good news in its own tone, and a warning in a warning's (the wiring's second audit, R11 S6-9).
 *
 * A kept row's look is by its kind (today/notifications.ts SERVER_LOOK), and three kinds carry good news and bad alike:
 * `number` ("Texting is on", "Your phone line is ready" beside "WhatsApp quality rating flagged"), `billing` ("Your
 * receptionist is back", "Your trial has started" beside "A payment did not go through") and `sweep`. Each was drawn in
 * the warning's amber with its icon, and Today's While you were away sorts amber first, so good news outranked real
 * warnings; and a carrier sending the texting registration back, kept as a plain alert, was drawn as no warning at all.
 *
 * Splitting each family into two kinds, as templates were (template_ready, template_blocked), moves the owner's mail and
 * phone choices, which are by kind. So the tone of these rows is said here, once, by kind and title, as the mends that
 * close a warning are (notice-mends.ts: "Titles are matched here, never in SQL"): every row that mends a warning is good
 * news by that fact, and the rest of the good news, and the two warnings kept as alerts, are listed. A row of a title
 * listed nowhere keeps its kind's look, and a row already kept takes its tone the next time the bell is drawn.
 */
import type { ServerNotificationKind } from "../today/notifications";
import { NOTICE_MENDS } from "./notice-mends";

/** A row's tone where its kind's look does not say it: good news, or a warning. */
export type NoticeTone = "ok" | "warn";

interface ToneOf {
  kind: ServerNotificationKind;
  title: RegExp;
  tone: NoticeTone;
}

/** The good news the edge keeps under a kind that also carries warnings, and the warnings it keeps as plain alerts. */
const LISTED: readonly ToneOf[] = [
  // A line's own news (lines/provision.ts, voice/voice-provision.ts, voice/forwarding.ts, channels a2p verdict.ts).
  { kind: "number", title: /^Your phone line is ready: /u, tone: "ok" },
  { kind: "number", title: /^Forwarding works: /u, tone: "ok" },
  { kind: "number", title: /^Texting is on: /u, tone: "ok" },
  { kind: "number", title: /^Your business is approved by the carriers$/u, tone: "ok" },
  // The subscription (contracts workspace/billing.ts planBilling's bell).
  { kind: "billing", title: /^Your trial has started$/u, tone: "ok" },
  // The carriers' refusals of a texting registration (channels a2p verdict.ts), kept as alerts: warnings.
  { kind: "alert", title: /^The carriers sent your texting registration back$/u, tone: "warn" },
  { kind: "alert", title: /^Your texting registration stopped$/u, tone: "warn" },
];

/** Every row that mends a warning (NOTICE_MENDS): good news by that fact. */
const MENDS: readonly ToneOf[] = NOTICE_MENDS.flatMap((m) =>
  "kind" in m.by ? [{ kind: m.by.kind, title: m.by.title, tone: "ok" as const }] : [],
);

/** The tone a kept row is drawn in where its kind's look does not say it, or null where the look's own tone stands. */
export function noticeTone(kind: string, title: string): NoticeTone | null {
  const hit = [...MENDS, ...LISTED].find((t) => t.kind === kind && t.title.test(title));
  return hit ? hit.tone : null;
}
