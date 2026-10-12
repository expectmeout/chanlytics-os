/**
 * The notices on a person's page (canvas A, one suggestion grammar): each is a fact in the page's words, a dim source,
 * one quiet act, and × where it can be wrong. The data settles a notice; × hides it (a member's own, or, for a name,
 * the signer declined for everyone). One home each: at its field when the field is on screen, else on its evidence row,
 * else in Up next. Drawn by one kit variant (Notice).
 *
 * The notices this page has the facts for: a signer's name (the head), a record we wrote to that someone at the business
 * answered beside (Combine), another record with one of their identities (Same person?), and a consultation with no
 * proposal after it (Up next's own rung says it, so it is not said twice here).
 */
import type { PersonDoubtVM } from "../people/person-profile";
import type { BusinessRecordVM, PersonHeadVM } from "./business";
import { PERSON_NAME_WORDS, WORKS_AT_WORDS } from "./words";

export type NoticeHome = "name" | "reach" | "consent" | "next" | "last-words";

/** What a notice's act does; the page maps each kind to its verb. */
export type NoticeAct =
  | { kind: "use-name"; messageId: string }
  | { kind: "combine"; otherId: string }
  | { kind: "same-person"; doubtId: string; otherId: string };

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
  /** They have written or called to us themselves. */
  heardFrom: boolean;
  /** People's other people at the business: who answered from another address, and the record we wrote to. */
  peopleHere: readonly { id: string; name: string; email: string | null; nameSource: string | null }[];
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
  // address at the same business. Each offers to combine with the other; the merge door judges the pair (0052, 0028).
  const others = f.peopleHere.filter((p) => p.id && p.email);
  if (f.head.standIn && !f.heardFrom) {
    const human = others.find((p) => p.nameSource !== "lead");
    if (human && human.email)
      out.push({
        id: `combine:${human.id}`,
        home: "name",
        fact: WORKS_AT_WORDS.answeredFrom(human.name, shortAddress(human.email)),
        source: null,
        act: { label: WORKS_AT_WORDS.combineWith(human.name), do: { kind: "combine", otherId: human.id } },
        dismiss: { label: PERSON_NAME_WORDS.notTheirs },
      });
  } else if (!f.head.standIn) {
    const standIn = others.find((p) => p.nameSource === "lead");
    if (standIn && standIn.email)
      out.push({
        id: `combine:${standIn.id}`,
        home: "name",
        fact: WORKS_AT_WORDS.wroteToFirst(shortAddress(standIn.email)),
        source: null,
        act: { label: WORKS_AT_WORDS.combine, do: { kind: "combine", otherId: standIn.id } },
        dismiss: { label: PERSON_NAME_WORDS.notTheirs },
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
  return out;
}

/** An address shortened for a notice: "priya@…" for priya@bloomandvow.example.com. */
function shortAddress(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? `${email.slice(0, at)}@…` : email;
}
