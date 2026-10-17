import { replyWhy } from "../config/brain.js";
const metaKey = (meta, key) => meta !== null && typeof meta === "object" ? meta[key] : void 0;
const AUTOMATED_SEND_SOURCES = ["broadcast", "reach_out"];
export function isAutomatedSend(meta) {
  const source = metaKey(meta, "source");
  return typeof source === "string" && AUTOMATED_SEND_SOURCES.includes(source);
}
export const EMAIL_CLAIMS = [
  { claim: "report", personsWords: false },
  { claim: "booking_notice", personsWords: false },
  { claim: "forwarding_confirmation", personsWords: false },
  { claim: "auto_reply", personsWords: false },
  { claim: "automated", personsWords: false },
  { claim: "person", personsWords: true }
];
const NOT_A_PERSONS_CLAIMS = EMAIL_CLAIMS.filter((c) => !c.personsWords).map((c) => c.claim);
export function isPersonsWords(meta) {
  const claim = metaKey(metaKey(meta, "email"), "claim");
  return !(typeof claim === "string" && NOT_A_PERSONS_CLAIMS.includes(claim));
}
export function messageVia(m) {
  if (m.meta?.source !== "broadcast") return null;
  return m.meta.playbook_name ? { kind: "playbook", name: String(m.meta.playbook_name) } : { kind: "broadcast", name: String(m.meta.broadcast_name ?? "broadcast") };
}
export function messageAuthor(m) {
  if (m.sender === "customer" || m.sender === "system" || m.type === "call_summary") return null;
  const via = messageVia(m);
  if (via) {
    return via.kind === "playbook" ? (
      // A campaign named "The month's offer" is not "the The month's offer campaign"; a person reads "campaign", never
      // "playbook" (decision 19), and the kind keeps its name.
      { kind: "playbook", words: `${/^the\s/i.test(via.name) ? "" : "the "}${via.name} campaign` }
    ) : { kind: "broadcast", words: m.meta?.broadcast_name ? `a broadcast (${via.name})` : "a broadcast" };
  }
  return m.sender === "ai" ? { kind: "receptionist", words: "the receptionist" } : { kind: "team", words: "your team" };
}
export function lastWordLine(needsHuman, last, author) {
  if (needsHuman) return "Receptionist paused \u2014 a human has this thread";
  if (!last) return "No messages yet";
  if (last.direction === "inbound") return "They wrote last \u2014 no reply yet";
  if (!author) return "Answered automatically";
  if (author.kind === "receptionist") return "Answered by the receptionist";
  if (author.kind === "team") return "Answered by your team";
  return `Last message: ${author.words}`;
}
export function messageWhy(m) {
  return m.sender === "ai" ? replyWhy(m.meta) : null;
}
