/**
 * Whether the receptionist may speak, and in whose voice.
 *
 * This decision was four inline booleans inside a 550-line webhook handler, and
 * it was wrong in a way nobody could see: `routed === null` meant two entirely
 * different things and both took the same branch.
 *
 *   no database configured   the pre-Postgres rollback path. The env-default
 *                            tenant legitimately runs on its baked DR profile.
 *   database said no         the channel row is missing, or its status is not
 *                            'active'. A DELIBERATE state.
 *
 * Because `drFallback` keyed only on the env var, setting
 * `tenant_channels.status='disabled'` — the one channel-level off switch the
 * schema offers — did not silence the receptionist. It dropped it into the DR
 * persona with no tenant, so it kept answering real customers with nothing
 * written to the database and the historical opt-out check dead (that check
 * reads the ingest result, and ingest needs a tenant).
 *
 * The rule, stated once: DR is for a control-plane READ FAILURE, never for a
 * configuration state. Absence configures; errors fall back.
 *
 * Deliberately dependency-free so the truth table can be tested directly.
 */

export interface RoutingFacts {
  /** This webhook's phone_number_id is the env-default tenant's own number. */
  isEnvDefault: boolean;
  /** A database was configured, so routing could actually be consulted. */
  routingConsulted: boolean;
  /**
   * The routing lookup could not be completed (database error, nothing cached).
   * Distinct from `channelResolved: false`, which means the database ANSWERED
   * and said this channel is not active. Without this third state a Postgres
   * blip on a cold lambda is indistinguishable from someone deliberately
   * flipping the off switch — and silencing the live line during an infra
   * hiccup is exactly what the DR profile exists to prevent.
   */
  routingFailed?: boolean;
  /** The control plane resolved an ACTIVE channel for this number. */
  channelResolved: boolean;
  /** The tenant runtime was read AND the read succeeded. */
  runtimeUsable: boolean;
  /** policies.reply.mode for this tenant, when the runtime carried one. */
  policyMode?: string;
}

export interface ReplyPosture {
  /** Speak with the baked DR profile (env-default tenant only). */
  drFallback: boolean;
  /** The reply policy in force. Anything but 'auto' holds for a human. */
  replyMode: string;
}

export function replyPosture(f: RoutingFacts): ReplyPosture {
  // Did we get an ANSWER about this channel? Not "is there a channel" — an
  // answer. No database and a failed lookup are both "we do not know", and only
  // a completed lookup that returned no active channel is a decision.
  const answered = f.routingConsulted && !f.routingFailed;

  const drFallback =
    f.isEnvDefault && (!answered || (f.channelResolved && !f.runtimeUsable));

  // A routed tenant's own policy wins. Otherwise only the DR path may be
  // automatic — keying this to isEnvDefault instead is how an unroutable
  // channel inherited 'auto' from the number it happens to share.
  const replyMode = f.runtimeUsable ? (f.policyMode ?? "ask") : drFallback ? "auto" : "ask";

  return { drFallback, replyMode };
}
