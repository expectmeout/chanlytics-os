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
/**
 * Whether a workspace's config turns Campaigns › Sequences on (`features.sequences_preview`, the flag registry's): the one
 * page for everything it sends on its own (0060), drawn before it replaces Campaigns' home, Sent and the Library (the
 * plan's S6). Read off the config as stored, so anything but `true` is off.
 */
export function sequencesPreviewOf(config: unknown): boolean {
  if (typeof config !== "object" || config === null || !("features" in config)) return false;
  const features: unknown = config.features;
  return (
    typeof features === "object" &&
    features !== null &&
    "sequences_preview" in features &&
    features.sequences_preview === true
  );
}

export type SequenceState = (typeof SEQUENCE_STATES)[number];
