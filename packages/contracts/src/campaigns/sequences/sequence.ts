import { PLAYBOOK_VETO_DELAY_WORDS } from "../playbooks/triggers/notices";
import { isOneOf } from "../../shared/unknown";

/**
 * A sequence (decision 0060): anything the workspace sends on its own. It starts for someone, takes its steps in their
 * places, and stops. Storage keeps it in `sequences`, its steps in `sequence_steps`, what goes at one time in
 * `sequence_batches`, each message to one person in `sequence_sends` and what came back in `sequence_replies`.
 */

/**
 * How a sequence starts: at a moment of a customer's journey (before a visit, after one, a proposal out, gone quiet), when
 * someone joins a list, when a lead joins a list, or once, on a date. `sequences.starts` holds the same four.
 */
export const SEQUENCE_STARTS = ["moment", "list", "leads", "date"] as const;
export type SequenceStart = (typeof SEQUENCE_STARTS)[number];

/**
 * Where a sequence stands: not started, on, paused, or ended with its history kept (a one-off that went, a sequence whose
 * first step was removed after it sent). `sequences.state` holds the same four.
 */
export const SEQUENCE_STATES = ["draft", "on", "paused", "ended"] as const;
export type SequenceState = (typeof SEQUENCE_STATES)[number];

/**
 * How a sequence's batches are decided (decision 0064): each sent (`auto`), each held thirty minutes for a stop (`veto`),
 * or each waiting for an OK (`ask`). `sequences.mode` holds the same three, in the Autonomy pane's filing words
 * (POLICY_MODES) less `never`: a sequence that should not send is paused. A one-off has none: pressing Send decided it.
 */
export const SEQUENCE_MODES = ["auto", "veto", "ask"] as const;
export type SequenceMode = (typeof SEQUENCE_MODES)[number];

export const isSequenceMode = (message: unknown): message is SequenceMode =>
  typeof message === "string" && isOneOf(SEQUENCE_MODES, message);

/**
 * Each mode in the owner's words: `line` is what the line under a sequence's name says ("· holds each batch for you to
 * stop"), `choice` how How it runs offers it under `SEQUENCE_MODE_LABEL`, and `does` the sentence a card says it in.
 */
export const SEQUENCE_MODE_WORDS: Record<SequenceMode, { line: string; choice: string; does: string }> = {
  auto: { line: "sends on its own", choice: "Send it", does: "each batch goes on its own" },
  veto: {
    line: "holds each batch for you to stop",
    choice: `Hold it ${PLAYBOOK_VETO_DELAY_WORDS} so I can stop it`,
    does: `each batch waits ${PLAYBOOK_VETO_DELAY_WORDS} for you to stop it, then goes`,
  },
  ask: { line: "asks you before each batch", choice: "Ask me", does: "each batch waits for your OK" },
};

/** What How it runs calls the mode, and what it says of a step's new words (decision 0064). */
export const SEQUENCE_MODE_LABEL = "Before each batch";
export const SEQUENCE_NEW_WORDS_ASK = "A batch of new words waits for your OK first, whatever this says.";

/**
 * The modes a sequence that exists may take, by how it starts: every one of them. One to leads may send on its own
 * since decision 0120, where its owner picks that on the sequence itself; until then cold email only waited or held.
 * The one argument stays, so a page asks by the sequence it shows and a kind that takes fewer is one line here.
 */
export function sequenceModesFor(_starts: string | null | undefined): readonly SequenceMode[] {
  return SEQUENCE_MODES;
}

/**
 * The modes a NEW sequence may start as, by how it starts: one to leads starts held for a stop or asked for, never on
 * its own (decision 0120: sending on its own is chosen for a sequence whose emails its owner has seen go, never as a
 * default). What New's sheet and the Cold email page's row for new sequences offer.
 */
export function sequenceStartModesFor(starts: string | null | undefined): readonly SequenceMode[] {
  return starts === "leads" ? ["veto", "ask"] : SEQUENCE_MODES;
}

/**
 * What a new sequence starts as (decision 0064): its class's Autonomy row where that is a mode a sequence of its kind
 * starts as, else ask. The database's sequence_mode_for (00462) says the same when it makes the sequence.
 */
export function newSequenceMode(classMode: string | null | undefined, starts: string | null | undefined): SequenceMode {
  return isSequenceMode(classMode) && sequenceStartModesFor(starts).includes(classMode) ? classMode : "ask";
}

/**
 * How a step's next batch is decided (decision 0064): the one rule the run plans by and every page says it by. A batch of
 * a step whose words are new to the owner (none of its batches let go since they last changed: `words_ok_at`) waits for
 * an OK, whatever the mode; any other goes by its sequence's mode, and a mode this build does not know asks (fail safe).
 */
export function batchModeOf(state: {
  mode: string | null | undefined;
  words_ok_at: string | null | undefined;
}): SequenceMode {
  if (!state.words_ok_at) return "ask";
  return isSequenceMode(state.mode) ? state.mode : "ask";
}

/**
 * Whether a cold email sequence's next batch waits for an OK: batchModeOf's ask (new words, or a sequence that asks for
 * each). Held for a stop, or sent on its own where its owner set that on the sequence (decision 0120), it does not. The
 * one rule its pages, its leads' lines and its run say it by.
 */
export const coldBatchAsks = (state: { mode: string | null | undefined; words_ok_at: string | null | undefined }) =>
  batchModeOf(state) === "ask";
