/**
 * Who the send reaches (moved from legacy/pages/broadcasts.jsx, decision 0015; then onto the kit, Claude Video/docs/
 * 2026-10-02-campaigns-on-the-kit.md §3.3; then lightened, the Campaigns review's item 17; then a word of the send's one
 * sentence, Ruben, 11 Oct 2026, "Option B"): the list as a word of the sentence, and what the reach line under it opens --
 * the people held back and why, with everything the To row used to say under it.
 */
import type { ReactNode } from "react";
import type { AudiencePreview } from "@chanlytics/contracts";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Picker } from "../../../kit/picker/picker";
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
  /** A word of the send's sentence ("Send … to [Regulars] by …"), not a capsule of its own. */
  inline?: boolean;
}

// The list the send goes to, a token in the sentence: every list with who it is and how many of it this message reaches.
export function BcAudiencePick({ audiences, active, sizeOf, onPick, inline = false }: BcAudiencePickProps) {
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
      placeholder={inline ? "who" : "Pick who it goes to"}
      inline={inline}
      {...(audiences.length > BC_SEARCH_OVER ? { search: cmSearch("Find a list", "No list has those words.") } : {})}
      data-testid="bc-audience"
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

// What the reach line under the send's sentence opens (send-screen.tsx): the reasons anybody is held, counted,
// the ones the list holds that the send does not reach, each with the reason in the operator's own words (the wire's:
// contracts audiencePreview), and the paragraphs that stood under the To row -- who said yes, the rules every send keeps, what
// the offer needs -- with the way to get their yes. The count was already honest, but a count is the one thing an owner
// cannot check, so the people the preview names are here, and pressing one walks the bubble to them, where the message
// is read as they read it. How many more are held, for the same reasons, closes the list. Where the send goes by more than
// one channel the reasons come first, each counted: a person with no email address is held for it on email, and one with
// no number on WhatsApp, so the reason is per channel. It is there whenever a list is picked: the paragraphs are, even
// where nobody is held.
export function BcHeldBox({ sample, people, heldLines = [], onWho, notes, yesLink }: BcHeldBackProps) {
  const held = people.flatMap((p, i) => (p.refusal ? [{ p, i, refusal: p.refusal }] : []));
  const rest = sample ? Math.max(0, sample.held - held.length) : 0;
  const noYes = sample && sample.split ? (sample.split.heldBy.no_yes ?? 0) : 0;
  return (
    <>
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
    </>
  );
}
