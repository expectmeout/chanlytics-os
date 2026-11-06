import { PLAYBOOK_VETO_DELAY_WORDS } from "../playbooks/playbook-triggers";

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

export const isSequenceMode = (m: unknown): m is SequenceMode =>
  typeof m === "string" && (SEQUENCE_MODES as readonly string[]).includes(m);

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

/** The modes a sequence may take, by how it starts: one to leads never sends on its own (cold email waits or holds). */
export function sequenceModesFor(starts: string | null | undefined): readonly SequenceMode[] {
  return starts === "leads" ? ["veto", "ask"] : SEQUENCE_MODES;
}

/**
 * What a new sequence starts as (decision 0064): its class's Autonomy row where that is a mode a sequence of its kind
 * takes, else ask. The database's sequence_mode_for (00462) says the same when it makes the sequence.
 */
export function newSequenceMode(classMode: string | null | undefined, starts: string | null | undefined): SequenceMode {
  return isSequenceMode(classMode) && sequenceModesFor(starts).includes(classMode) ? classMode : "ask";
}

/**
 * How a step's next batch is decided (decision 0064): the one rule the run plans by and every page says it by. A batch of
 * a step whose words are new to the owner (none of its batches let go since they last changed: `words_ok_at`) waits for
 * an OK, whatever the mode; any other goes by its sequence's mode, and a mode this build does not know asks (fail safe).
 */
export function batchModeOf(s: {
  mode: string | null | undefined;
  words_ok_at: string | null | undefined;
}): SequenceMode {
  if (!s.words_ok_at) return "ask";
  return isSequenceMode(s.mode) ? s.mode : "ask";
}
