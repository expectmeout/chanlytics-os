import { CALL_FACT_WORDS, DRAFT_NOTICE_WORDS, PERSON_NAME_WORDS, WORKS_AT_WORDS } from "./words.js";
export function personNoticesOf(f) {
  const out = [];
  const s = f.head.signer;
  if (s)
    out.push({
      id: `name:${s.messageId}`,
      home: "name",
      fact: s.fact,
      source: s.day,
      act: { label: PERSON_NAME_WORDS.use, do: { kind: "use-name", messageId: s.messageId } },
      dismiss: { label: PERSON_NAME_WORDS.notTheirs }
    });
  const others = f.peopleHere.filter((p) => p.id && p.email && !(f.phone && p.phone && f.phone !== p.phone));
  if (f.head.standIn && !f.heardFrom) {
    const human = others.find((p) => p.nameSource !== "lead");
    if (human && human.email) {
      const named = !!human.named;
      const address = shortAddress(human.email);
      out.push({
        id: `combine:${human.id}`,
        home: "name",
        fact: named ? WORKS_AT_WORDS.answeredFrom(human.name, address) : WORKS_AT_WORDS.someoneAnswered(address),
        source: null,
        act: {
          label: named ? WORKS_AT_WORDS.combineWith(human.name) : WORKS_AT_WORDS.combine,
          do: {
            kind: "combine",
            otherId: human.id,
            otherName: human.name,
            otherEmail: human.email,
            keepsOther: true,
            keptNamed: named
          }
        },
        dismiss: null
      });
    }
  } else if (!f.head.standIn) {
    const standIn = others.find((p) => p.nameSource === "lead");
    if (standIn && standIn.email)
      out.push({
        id: `combine:${standIn.id}`,
        home: "name",
        fact: WORKS_AT_WORDS.wroteToFirst(shortAddress(standIn.email)),
        source: null,
        act: {
          label: WORKS_AT_WORDS.combine,
          do: {
            kind: "combine",
            otherId: standIn.id,
            otherName: standIn.name,
            otherEmail: standIn.email,
            keepsOther: false,
            keptNamed: !!f.named
          }
        },
        dismiss: null
      });
  }
  for (const d of f.doubts)
    out.push({
      id: `doubt:${d.id}`,
      home: "reach",
      fact: d.sentence,
      source: null,
      act: { label: "Same person?", do: { kind: "same-person", doubtId: d.id, otherId: d.otherId } },
      dismiss: { label: "Not the same" }
    });
  out.push(...callNotices(f, !!s));
  if (f.draft)
    out.push({
      id: "draft",
      home: "last-words",
      fact: DRAFT_NOTICE_WORDS.waiting,
      source: DRAFT_NOTICE_WORDS.sends(f.draft.sends),
      act: { label: DRAFT_NOTICE_WORDS.review, do: { kind: "open-thread", to: f.draft.to } },
      dismiss: null
    });
  return out;
}
const folded = (s) => (s ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
function callNotices(f, signerOffered) {
  const c = f.calls;
  if (!c) return [];
  const W = CALL_FACT_WORDS;
  const out = [];
  const nameIsNew = !!c.name && folded(c.name.name) !== folded(f.givenName);
  if (c.name && nameIsNew && !signerOffered && (!f.givenName || f.head.standIn))
    out.push({
      id: `call-name:${c.name.callId}`,
      home: "name",
      fact: W.name(c.name.name),
      source: W.onTheCall(c.name.day),
      act: { label: PERSON_NAME_WORDS.use, do: { kind: "use-call-name", callId: c.name.callId, name: c.name.name } },
      dismiss: { label: PERSON_NAME_WORDS.notTheirs }
    });
  if (c.email && !f.email)
    out.push({
      id: `call-email:${c.email.callId}`,
      home: "reach",
      fact: W.email(c.email.day, c.email.email),
      source: null,
      act: { label: W.useEmail, do: { kind: "use-call-email", callId: c.email.callId, email: c.email.email } },
      dismiss: { label: W.notTheirAddress }
    });
  if (c.step && !f.openStep && !f.stepNoted)
    out.push({
      id: `call-step:${c.step.callId}`,
      home: "next",
      fact: c.step.body,
      source: W.fromTheCall(c.step.day),
      act: { label: W.keepStep, do: { kind: "note-call-step", callId: c.step.callId, body: c.step.body } },
      dismiss: { label: W.notAStep }
    });
  return out;
}
function shortAddress(email) {
  const at = email.indexOf("@");
  return at > 0 ? `${email.slice(0, at)}@\u2026` : email;
}
