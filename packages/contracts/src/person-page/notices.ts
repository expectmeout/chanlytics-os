/**
 * The notices on a person's page (canvas A, one suggestion grammar): each is a fact in the page's words, a dim source,
 * one quiet act, and × where it can be wrong. The data settles a notice; × hides it (a member's own, or, for a name,
 * the signer declined for everyone). One home each: at its field when the field is on screen, else on its evidence row,
 * else in Up next. Drawn by one kit variant (Notice).
 *
 * The notices this page has the facts for: a signer's name (the head), a record we wrote to that someone at the business
 * answered beside (Combine), another record with one of their identities (Same person?), what a call they placed left
 * (the name they gave, an address they spelled out, a next step: call-facts.ts), and a reply the receptionist holds in
 * its veto window (under their last words). A consultation with no proposal after it is Up next's own rung, so it is
 * not said twice here.
 */
import type { PersonDoubtVM } from "../people/person-profile";
import type { BusinessRecordVM, PersonHeadVM } from "./business";
import type { CallFactsVM } from "./call-facts";
import { CALL_FACT_WORDS, DRAFT_NOTICE_WORDS, PERSON_NAME_WORDS, WORKS_AT_WORDS } from "./words";

export type NoticeHome = "name" | "reach" | "consent" | "next" | "last-words";

/**
 * Combine's act (0052, amending 0028): the other record, by its id, name and address, and which of the two the door
 * keeps: the person who answered, whichever page it is pressed from (`keepsOther`: this page is the record we wrote to).
 */
export interface CombineAct {
  kind: "combine";
  otherId: string;
  otherName: string;
  otherEmail: string;
  keepsOther: boolean;
}

/** What a notice's act does; the page maps each kind to its verb. */
export type NoticeAct =
  | { kind: "use-name"; messageId: string }
  | CombineAct
  | { kind: "same-person"; doubtId: string; otherId: string }
  | { kind: "use-call-name"; callId: string; name: string }
  | { kind: "use-call-email"; callId: string; email: string }
  | { kind: "note-call-step"; callId: string; body: string }
  | { kind: "open-thread"; to: string };

export interface NoticeVM {
  id: string;
  home: NoticeHome;
  fact: string;
  /** Dim, after the fact: where it came from, or when. */
  source: string | null;
  act: { label: string; do: NoticeAct };
  /** × where the notice can be wrong, with its words; null where it cannot. */
  dismiss: { label: string } | null;
}

export interface NoticeFacts {
  head: PersonHeadVM;
  business: BusinessRecordVM | null;
  doubts: readonly PersonDoubtVM[];
  /** This person's own address, for the Combine notice on a stand-in. */
  email: string | null;
  /** This person's own number: a pair with two numbers is two people, and the merge door refuses it. */
  phone?: string | null;
  /** They have a name of their own (one a member, a door or a signer gave): the kept person must, or Combine waits. */
  named?: boolean;
  /** They have written or called to us themselves. */
  heardFrom: boolean;
  /** People's other people at the business: who answered from another address, and the record we wrote to. */
  peopleHere: readonly {
    id: string;
    name: string;
    email: string | null;
    nameSource: string | null;
    phone?: string | null;
    named?: boolean;
  }[];
  /** What their calls left (callFactsOf); none where the read holds no call of theirs. */
  calls?: CallFactsVM;
  /** Their name of their own, as the page holds it; null for someone named by a number, an address or a business. */
  givenName?: string | null;
  /** An open next step stands on them already: a call's step is not offered beside it. */
  openStep?: boolean;
  /** A note (kept or offered) came from the newest call already: its step is said there, not twice. */
  stepNoted?: boolean;
  /** A reply the receptionist holds before it sends (heldDraftOf), with when it sends; null with none waiting. */
  draft?: { to: string; sends: string } | null;
}

/** The notices, each once, in the order their homes come on the page. */
export function personNoticesOf(f: NoticeFacts): NoticeVM[] {
  const out: NoticeVM[] = [];
  const s = f.head.signer;
  if (s)
    out.push({
      id: `name:${s.messageId}`,
      home: "name",
      fact: s.fact,
      source: s.day,
      act: { label: PERSON_NAME_WORDS.use, do: { kind: "use-name", messageId: s.messageId } },
      dismiss: { label: PERSON_NAME_WORDS.notTheirs },
    });
  // One human, two doors: the record we wrote to (a stand-in that never wrote) and the person who answered from another
  // address at the same business. Each offers to combine with the other; the merge door judges the pair (0052, 0028)
  // and keeps the person who answered. Offered only where it can hold: two numbers are two people (the door refuses
  // them), and the person kept has a name of their own (the door would give them the business's otherwise).
  const others = f.peopleHere.filter((p) => p.id && p.email && !(f.phone && p.phone && f.phone !== p.phone));
  if (f.head.standIn && !f.heardFrom) {
    const human = others.find((p) => p.nameSource !== "lead" && p.named);
    if (human && human.email)
      out.push({
        id: `combine:${human.id}`,
        home: "name",
        fact: WORKS_AT_WORDS.answeredFrom(human.name, shortAddress(human.email)),
        source: null,
        act: {
          label: WORKS_AT_WORDS.combineWith(human.name),
          do: { kind: "combine", otherId: human.id, otherName: human.name, otherEmail: human.email, keepsOther: true },
        },
        dismiss: null,
      });
  } else if (!f.head.standIn && f.named) {
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
          },
        },
        dismiss: null,
      });
  }
  for (const d of f.doubts)
    out.push({
      id: `doubt:${d.id}`,
      home: "reach",
      fact: d.sentence,
      source: null,
      act: { label: "Same person?", do: { kind: "same-person", doubtId: d.id, otherId: d.otherId } },
      dismiss: { label: "Not the same" },
    });
  out.push(...callNotices(f, !!s));
  if (f.draft)
    out.push({
      id: "draft",
      home: "last-words",
      fact: DRAFT_NOTICE_WORDS.waiting,
      source: DRAFT_NOTICE_WORDS.sends(f.draft.sends),
      act: { label: DRAFT_NOTICE_WORDS.review, do: { kind: "open-thread", to: f.draft.to } },
      dismiss: null,
    });
  return out;
}

const folded = (s: string | null | undefined) =>
  (s ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * What a call they placed left, each at its home: the name they gave under the name (not beside a signer's, and only
 * where they have none of their own, or it is not the name they hold), an address they spelled out at Reach them while
 * none is on their page, and the newest call's next step in Up next while no step stands and no note says it already.
 */
function callNotices(f: NoticeFacts, signerOffered: boolean): NoticeVM[] {
  const c = f.calls;
  if (!c) return [];
  const W = CALL_FACT_WORDS;
  const out: NoticeVM[] = [];
  const nameIsNew = !!c.name && folded(c.name.name) !== folded(f.givenName);
  if (c.name && nameIsNew && !signerOffered && (!f.givenName || f.head.standIn))
    out.push({
      id: `call-name:${c.name.callId}`,
      home: "name",
      fact: W.name(c.name.name),
      source: W.onTheCall(c.name.day),
      act: { label: PERSON_NAME_WORDS.use, do: { kind: "use-call-name", callId: c.name.callId, name: c.name.name } },
      dismiss: { label: PERSON_NAME_WORDS.notTheirs },
    });
  if (c.email && !f.email)
    out.push({
      id: `call-email:${c.email.callId}`,
      home: "reach",
      fact: W.email(c.email.day, c.email.email),
      source: null,
      act: { label: W.useEmail, do: { kind: "use-call-email", callId: c.email.callId, email: c.email.email } },
      dismiss: { label: W.notTheirAddress },
    });
  if (c.step && !f.openStep && !f.stepNoted)
    out.push({
      id: `call-step:${c.step.callId}`,
      home: "next",
      fact: c.step.body,
      source: W.fromTheCall(c.step.day),
      act: { label: W.keepStep, do: { kind: "note-call-step", callId: c.step.callId, body: c.step.body } },
      dismiss: { label: W.notAStep },
    });
  return out;
}

/** An address shortened for a notice: "priya@…" for priya@bloomandvow.example.com. */
function shortAddress(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? `${email.slice(0, at)}@…` : email;
}
