/**
 * Who the send reaches, said in the To row's one line (moved from legacy/pages/broadcasts.jsx, decision 0015; then onto
 * the kit, Claude Video/docs/2026-10-02-campaigns-on-the-kit.md §3.3; then lightened, the Campaigns review's item 17): the
 * list as a token, how many of those it holds can hear the message and, where it goes by more than WhatsApp, on which
 * channel, a bar, and, behind one quiet link, the people held back and why with everything the row used to say under it.
 */
import type { ReactNode } from "react";
import type { AudiencePreview } from "@chanlytics/contracts";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Meter } from "../../../kit/meter/meter";
import { Picker } from "../../../kit/picker/picker";
import { CmHeldBack } from "../../parts/held-back";
import { cmChevron, cmGroups, cmSearch } from "../../parts/picks";
import type { AudienceOption } from "../surface";
import { bcKey } from "./words";

/** The headings the lists stand under in the picker; Everyone stands alone, over them. */
const BC_AUDIENCE_HEADINGS = { list: "People's lists", saved: "Your lists" };

/** A list longer than this takes a search at the top of its picker. */
const BC_SEARCH_OVER = 8;

interface BcAudiencePickProps {
  audiences: readonly AudienceOption[];
  active: AudienceOption | null;
  /** How many of a list the message picked reaches (an offer needs a separate yes, so it is a number per message). */
  sizeOf: (a: AudienceOption | null) => number;
  onPick: (key: string) => void;
}

// The list the send goes to, a token in the sentence: every list with who it is and how many of it this message reaches.
export function BcAudiencePick({ audiences, active, sizeOf, onPick }: BcAudiencePickProps) {
  return (
    <Picker
      label="Who it goes to"
      value={active ? bcKey(active) : null}
      onValueChange={onPick}
      groups={cmGroups(
        audiences.map((a) => ({
          id: bcKey(a),
          label: a.label,
          sub: a.hint,
          hint: sizeOf(a).toLocaleString(),
          group: a.kind,
        })),
        BC_AUDIENCE_HEADINGS,
      )}
      chevron={cmChevron()}
      placeholder="Pick who it goes to"
      {...(audiences.length > BC_SEARCH_OVER ? { search: cmSearch("Find a list", "No list has those words.") } : {})}
      data-testid="bc-audience"
    />
  );
}

interface BcCountProps {
  /** How many the send reaches. */
  sending: number;
  /** How many of the list it holds back, or null where the page has none counted. */
  held: number | null;
}

// How many can hear it, out of how many the list holds: "24 of 29 can hear it". The count is the one the Send button
// and its question use (a yes and a number); the pool is those plus the ones held back, where the preview counted them.
export function BcCount({ sending, held }: BcCountProps) {
  return (
    <span className="bc-to-count" data-testid="bc-who-count">
      <span aria-hidden="true">·</span>
      <span className="bc-to-n tabular" data-testid="bc-who-n">
        {sending.toLocaleString()}
      </span>
      {held === null ? (
        " can hear it"
      ) : (
        <>
          {" of "}
          <span className="tabular">{(sending + held).toLocaleString()}</span>
          {" can hear it"}
        </>
      )}
    </span>
  );
}

interface BcReachByProps {
  /** Who it reaches on which channel, in one clause (parts/channels.ts cmReachBy): "12 on WhatsApp, 12 by email". */
  words: string;
}

// After the count, where the send goes by more than WhatsApp alone: on which channel it reaches them.
export function BcReachBy({ words }: BcReachByProps) {
  return (
    <span className="bc-to-by">
      <span aria-hidden="true">·</span>
      <span data-testid="bc-reach-by">{words}</span>
    </span>
  );
}

// The same two numbers as a bar: those who will get it, those held back, and nothing where the list is empty.
export function BcReachBar({ sending, held }: { sending: number; held: number }) {
  const pool = sending + held;
  if (pool === 0) return null;
  return (
    <Meter
      size="sm"
      className="bc-to-bar"
      parts={[
        { share: sending, tone: "ok" },
        { share: held, tone: "warn" },
      ]}
      aria-label={`${sending} of ${pool} can hear it; ${held} held back`}
    />
  );
}

interface BcHeldBackProps {
  sample: AudiencePreview | null;
  people: AudiencePreview["people"];
  /** Who is held and why, by reason (parts/channels.ts cmHeldLines), where the send goes by more than WhatsApp alone. */
  heldLines?: readonly { n: number; words: string }[];
  /** The person the preview shows: pressing a name walks the bubble to them. */
  onWho: (i: number) => void;
  /** What stood as paragraphs under the To row: who said yes, the rules every send keeps, what the yes covers (send-screen.tsx). */
  notes: ReactNode;
  /** The door to where their yes is got, said where somebody on the list has not given it: drawn by the page (state.tsx useBcYes). */
  yesLink: ReactNode;
}

// "Who's held back", the one quiet link at the end of the To line, and what it opens: the reasons anybody is held, counted,
// the ones the list holds that the send does not reach, each with the reason in the operator's own words (the wire's:
// contracts audiencePreview), and the paragraphs that stood under the To row -- who said yes, the rules every send keeps, what
// the offer needs -- with the way to get their yes. The count was already honest, but a count is the one thing an owner
// cannot check, so the people the preview names are here, and pressing one walks the bubble to them, where the message
// is read as they read it. How many more are held, for the same reasons, closes the list. Where the send goes by more than
// one channel the reasons come first, each counted: a person with no email address is held for it on email, and one with
// no number on WhatsApp, so the reason is per channel. It is there whenever a list is picked: the paragraphs are, even
// where nobody is held.
export function BcHeldBack({ sample, people, heldLines = [], onWho, notes, yesLink }: BcHeldBackProps) {
  const held = people.flatMap((p, i) => (p.refusal ? [{ p, i, refusal: p.refusal }] : []));
  const rest = sample ? Math.max(0, sample.held - held.length) : 0;
  const noYes = sample && sample.split ? (sample.split.heldBy.no_yes ?? 0) : 0;
  return (
    <CmHeldBack testid="bc-held">
      {heldLines.length > 0 && (
        <ul className="bc-held-by" data-testid="bc-held-by">
          {heldLines.map((l) => (
            <li key={l.words}>
              <span className="tabular">{l.n}</span> · {l.words}
            </li>
          ))}
        </ul>
      )}
      {held.length > 0 && (
        <ul className="bc-held-list" data-testid="bc-who">
          {held.map(({ p, i, refusal }) => (
            <li key={p.id} data-testid="bc-who-row">
              <LinkButton onClick={() => onWho(i)} data-testid="bc-who-name">
                {p.label}
              </LinkButton>
              <span className="bc-held-why">{refusal}</span>
            </li>
          ))}
        </ul>
      )}
      {rest > 0 && (
        <p className="bc-held-rest" data-testid="bc-who-rest">
          {rest} {held.length > 0 ? "more " : ""}held back, for{" "}
          {held.length > 0 ? "the same reasons" : "the reasons above"}
        </p>
      )}
      <div className="bc-held-notes">{notes}</div>
      {noYes > 0 && yesLink ? <p className="bc-held-yes">{yesLink}</p> : null}
    </CmHeldBack>
  );
}
