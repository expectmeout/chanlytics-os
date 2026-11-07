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
import type { PersonDoubtVM } from "../person-profile/timeline";
import type { BusinessRecordVM, PersonHeadVM } from "./business";
import type { CallFactsVM } from "./call-facts";
import { CALL_FACT_WORDS, DRAFT_NOTICE_WORDS, PERSON_NAME_WORDS, WORKS_AT_WORDS } from "./words";

export type NoticeHome = "name" | "reach" | "consent" | "next" | "last-words";

/**
 * Combine's act (0052, amending 0028): the other record, by its id, name and address, and which of the two the door
 * keeps: the person who answered, whichever page it is pressed from (`keepsOther`: this page is the record we wrote to).
 * `keptNamed`: the person kept has a name of their own; one who gave none keeps none (00420), and the sheet says so.
 */
export interface CombineAct {
  kind: "combine";
  otherId: string;
  otherName: string;
  otherEmail: string;
  keepsOther: boolean;
  keptNamed: boolean;
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
  /** They have a name of their own (one a member, a door or a signer gave): Combine says theirs, or says someone. */
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
export function personNoticesOf(noticeFacts: NoticeFacts): NoticeVM[] {
  const out: NoticeVM[] = [];
  const signer = noticeFacts.head.signer;
  if (signer)
    out.push({
      id: `name:${signer.messageId}`,
      home: "name",
      fact: signer.fact,
      source: signer.day,
      act: { label: PERSON_NAME_WORDS.use, do: { kind: "use-name", messageId: signer.messageId } },
      dismiss: { label: PERSON_NAME_WORDS.notTheirs },
    });
  // One human, two doors: the record we wrote to (a stand-in that never wrote) and the person who answered from another
  // address at the same business. Each offers to combine with the other; the merge door judges the pair (0052, 0028)
  // and keeps the person who answered, with their own name or none (00420). Offered only where it can hold: two numbers
  // are two people, and the door refuses them.
  const others = noticeFacts.peopleHere.filter(
    (p) => p.id && p.email && !(noticeFacts.phone && p.phone && noticeFacts.phone !== p.phone),
  );
  if (noticeFacts.head.standIn && !noticeFacts.heardFrom) {
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
            keptNamed: named,
          },
        },
        dismiss: null,
      });
    }
  } else if (!noticeFacts.head.standIn) {
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
            keptNamed: !!noticeFacts.named,
          },
        },
        dismiss: null,
      });
  }
  for (const d of noticeFacts.doubts)
    out.push({
      id: `doubt:${d.id}`,
      home: "reach",
      fact: d.sentence,
      source: null,
      act: { label: "Same person?", do: { kind: "same-person", doubtId: d.id, otherId: d.otherId } },
      dismiss: { label: "Not the same" },
    });
  out.push(...callNotices(noticeFacts, !!signer));
  if (noticeFacts.draft)
    out.push({
      id: "draft",
      home: "last-words",
      fact: DRAFT_NOTICE_WORDS.waiting,
      source: DRAFT_NOTICE_WORDS.sends(noticeFacts.draft.sends),
      act: { label: DRAFT_NOTICE_WORDS.review, do: { kind: "open-thread", to: noticeFacts.draft.to } },
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
function callNotices(noticeFacts: NoticeFacts, signerOffered: boolean): NoticeVM[] {
  const calls = noticeFacts.calls;
  if (!calls) return [];
  const words = CALL_FACT_WORDS;
  const out: NoticeVM[] = [];
  const nameIsNew = !!calls.name && folded(calls.name.name) !== folded(noticeFacts.givenName);
  if (calls.name && nameIsNew && !signerOffered && (!noticeFacts.givenName || noticeFacts.head.standIn))
    out.push({
      id: `call-name:${calls.name.callId}`,
      home: "name",
      fact: words.name(calls.name.name),
      source: words.onTheCall(calls.name.day),
      act: {
        label: PERSON_NAME_WORDS.use,
        do: { kind: "use-call-name", callId: calls.name.callId, name: calls.name.name },
      },
      dismiss: { label: PERSON_NAME_WORDS.notTheirs },
    });
  if (calls.email && !noticeFacts.email)
    out.push({
      id: `call-email:${calls.email.callId}`,
      home: "reach",
      fact: words.email(calls.email.day, calls.email.email),
      source: null,
      act: {
        label: words.useEmail,
        do: { kind: "use-call-email", callId: calls.email.callId, email: calls.email.email },
      },
      dismiss: { label: words.notTheirAddress },
    });
  if (calls.step && !noticeFacts.openStep && !noticeFacts.stepNoted)
    out.push({
      id: `call-step:${calls.step.callId}`,
      home: "next",
      fact: calls.step.body,
      source: words.fromTheCall(calls.step.day),
      act: { label: words.keepStep, do: { kind: "note-call-step", callId: calls.step.callId, body: calls.step.body } },
      dismiss: { label: words.notAStep },
    });
  return out;
}

/** An address shortened for a notice: "priya@…" for priya@bloomandvow.example.com. */
function shortAddress(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? `${email.slice(0, at)}@…` : email;
}
