/**
 * How it reaches out (decision 0113): a row of words and its box, one key of the config's reach_out section. A row with
 * nothing set says what the writers read in its place, in the dim ink of a fact not yet the owner's, and why; its box opens
 * on those same words, so what the row shows is at hand to change, and they become the owner's only once they change them
 * (BtFold's `opensOn`). An empty box says what to put there, and offers what is already known with one press, never
 * filled in by itself. A box says how much of it is used only as it nears its limit: most of them only guard against a
 * whole website pasted in (contracts REACH_OUT_LIMITS).
 */
import { REACH_OUT_SETTINGS_WORDS, textOrEmpty, type ReachOutConfig } from "@chanlytics/contracts";
import { gate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { RecordField } from "../../kit/record/field";
import { BtFold } from "../business/gestures/fold";
import { storedReachOut, type OutreachShared } from "./card";

const BOX_WORDS = REACH_OUT_SETTINGS_WORDS;

/** What a fold's body is handed. */
export type BoxFields = Parameters<Parameters<typeof BtFold>[0]["body"]>[0];

/** The share of a box's limit it says how much of it is used from. */
const NEAR_LIMIT = 0.8;

/** How much of a box is used, where it nears its limit; else nothing. */
export const roomSaid = (used: number, max: number): string | null =>
  used >= max * NEAR_LIMIT ? BOX_WORDS.room(used, max) : null;

/** One box's own: how it is drawn, what it says under it, and what one press can put in it. */
interface BoxSpec {
  id: string;
  /** The lines it opens at, growing with its words; none is a box of one line, a name or a number. */
  rows?: number;
  placeholder: string;
  max: number;
  /** What it says under it always (a signature's rule). */
  rule?: string | null;
  /** What is known that could go in it, offered while it is empty. */
  known?: string | null;
  inputMode?: "tel";
  autoComplete?: string;
}

/** A box of words, named by its fold's label on screen. */
function ReachOutBox({
  spec,
  shows,
  from,
  f,
}: {
  spec: BoxSpec;
  shows: string | null;
  from: string | null;
  f: BoxFields;
}) {
  const { id, known, rows } = spec;
  const text = textOrEmpty(f.draft);
  // Where the words came from is said only while they are still those words.
  const note = shows !== null && text === shows ? from : (spec.rule ?? null);
  return (
    <>
      <RecordField
        id={`ro-${id}`}
        label={null}
        aria-labelledby={`rec-fold-${id}-label`}
        rows={rows ?? null}
        grows={!!rows}
        value={text}
        onChange={(v) => f.update(() => v, [id])}
        problem={f.problems[id] || null}
        hint={roomSaid(text.length, spec.max) ?? note}
        placeholder={spec.placeholder}
        inputMode={spec.inputMode}
        autoComplete={spec.autoComplete}
        readOnly={f.readOnly || undefined}
        testid={`rec-${id}-box`}
      />
      {known && !text.trim() ? (
        <Button
          size="sm"
          className="ro-use"
          {...f.press(() => f.update(() => known, [id]))}
          data-testid={`rec-${id}-use`}
        >
          <span className="ro-use-words">{BOX_WORDS.use(known)}</span>
        </Button>
      ) : null}
    </>
  );
}

/** A row of words: what the section holds, or what stands in its place and why, and its box. */
export const reachOutFold = (
  shared: OutreachShared,
  spec: BoxSpec & {
    key: keyof ReachOutConfig;
    label: string;
    /** What the row says with nothing set and nothing in its place, and what it adds under that. */
    empty: string;
    hint?: string | null;
    /** What a writer reads where nothing is set, and where it came from. */
    fallback?: string | null;
    from?: string | null;
  },
) => {
  const stored = storedReachOut(shared, spec.key);
  const shows = stored ? null : spec.fallback?.trim() || null;
  return (
    <BtFold<unknown>
      canEdit={shared.canEdit}
      flash={shared.flash}
      saver={shared.saver}
      id={spec.id}
      label={spec.label}
      channel={null}
      gate={gate("settings", `change ${spec.label.toLowerCase()}`)}
      opensOn={shows}
      row={{
        value: stored ? <span className="ro-clamp">{stored}</span> : null,
        empty: shows ? <span className="ro-clamp">{shows}</span> : spec.empty,
        hint: shows ? (spec.from ?? null) : (spec.hint ?? null),
        act: shows ? "Change" : undefined,
      }}
      body={(f) => <ReachOutBox spec={spec} shows={shows} from={spec.from ?? null} f={f} />}
    />
  );
};
