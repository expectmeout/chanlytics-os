/**
 * The breakers: a provider that gives no answer stops costing each caller its whole timeout (provider-fetch.ts's
 * header says the rule). Split from the door on 28 Nov 2026 (lane 8 of the "prove it works" plan), when two things
 * changed:
 *
 * One workspace's trouble stays its own. A provider's breaker counted every fault alike, so one workspace whose calls
 * timed out (its huge Drive folder, its slow website, its mailbox's server) held every workspace's calls to that
 * provider. Now a fault is counted twice: under its workspace's own breaker, which holds that workspace's calls, and
 * under the provider's, which opens only when at least two of the faults in a row came from other workspaces than the
 * one with most (or from calls that named none, as every call did before). A workspace's bad sign-in or spent quota is an answer, never a fault, so
 * it opens neither.
 *
 * The pause ends with one call. After BREAKER_OPEN_MS one call is let through and the others wait for its answer
 * (held, as during the pause): it closes the breaker, or opens it again. Before, every call that asked at that moment
 * went, so a provider still down cost each of them its whole timeout once more.
 *
 * The state is one per process, a registered symbol, however many copies of this module the builds inlined.
 */
import { globalSlot } from "@chanlytics/contracts";
import { logger } from "@chanlytics/log";
import { PROVIDER_NAMES, type Provider } from "./provider-rules";

/** Calls in a row with no answer or a 5xx that open a breaker. */
const BREAKER_FAILURES = 5;
/** How long an open breaker holds its calls before one is let through. */
const BREAKER_OPEN_MS = 30_000;
/** How long a call is held while the one let through after the pause is still waiting for its answer. */
const PROBE_WAIT_MS = 1_000;
/** Whose a fault was when its call named no workspace: such faults open the provider's breaker as they always did. */
const NO_WORKSPACE = "*";
/** Of the faults in a row that open a provider's breaker, how many must be other workspaces' than the one with most. */
const OTHERS_FAULTS = 2;

interface Breaker {
  failures: number;
  /** Until when it holds calls; 0 while it has not opened since it last closed. */
  openUntil: number;
  /** A call let through after the pause is waiting for its answer: the others wait for it. */
  probing: boolean;
  /** Whose calls the faults in a row were, and how many each (the provider's breaker): one workspace's never open it. */
  faultsOf: Map<string, number>;
}

interface Breakers {
  /** By provider, and by provider and workspace (`meta|<workspace>`). */
  held: Map<string, Breaker>;
  /** How many times each provider's breaker has opened in this instance, kept when it closes: the outage's count. */
  opened: Map<Provider, number>;
}
const breakers = globalSlot<Breakers>("chanlytics.provider-breakers.v2").keep(() => ({
  held: new Map(),
  opened: new Map(),
}));
const breakerLog = logger();

const breakerKeyOf = (provider: Provider, workspace: string | null): string =>
  workspace ? `${provider}|${workspace}` : provider;

/** The breakers a call answers to: its provider's, and its workspace's own when it names one. */
const breakerKeysOf = (provider: Provider, workspace: string | null): string[] =>
  workspace ? [provider, breakerKeyOf(provider, workspace)] : [provider];

/** What a breaker reads of an answer: its status, why none came, and the service's own name for the request. */
interface FaultSaid {
  status: number;
  error: string | null;
  providerRequest?: string | null;
}

/** What the breakers say of a call about to leave: it goes (and which breakers' pause it ends), or it is held. */
type BreakerVerdict = { go: true; probes: string[] } | { go: false; retryAfterMs: number };

/**
 * Whether a call may leave now. `always` is a call that puts words in front of a person (`breaker: "count"`): it is
 * always made, and only counted.
 */
export function breakerSays(
  provider: Provider,
  workspace: string | null,
  now: number,
  always: boolean,
): BreakerVerdict {
  const probes: string[] = [];
  for (const key of breakerKeysOf(provider, workspace)) {
    const breaker = breakers.held.get(key);
    if (!breaker || breaker.openUntil === 0) continue;
    if (breaker.openUntil > now) {
      if (!always) return { go: false, retryAfterMs: breaker.openUntil - now };
    } else if (!breaker.probing) probes.push(key);
    else if (!always) return { go: false, retryAfterMs: PROBE_WAIT_MS };
  }
  for (const key of probes) {
    const breaker = breakers.held.get(key);
    if (breaker) breaker.probing = true;
  }
  return { go: true, probes };
}

/** Whether an answer is the provider's fault (it opens the breaker), rather than its word. */
const isFault = (a: { status: number; error: string | null }): boolean =>
  (a.status === 0 && a.error !== "breaker_open" && a.error !== "too_many") || a.status >= 500;

/** What a call's answer tells its breakers. */
export function breakerHears(
  provider: Provider,
  workspace: string | null,
  answer: FaultSaid,
  now: number,
  probes: string[],
): void {
  for (const key of probes) {
    const breaker = breakers.held.get(key);
    if (breaker) breaker.probing = false;
  }
  if (!isFault(answer)) {
    // An answer closes the breakers. One that had opened says so: the outage it held calls through is over.
    for (const key of breakerKeysOf(provider, workspace)) {
      const breaker = breakers.held.get(key);
      if (breaker && breaker.openUntil > 0)
        breakerLog.info("breaker_closed", {
          provider,
          failures: breaker.failures,
          ...(key === provider ? {} : { tenant_id: workspace }),
        });
      breakers.held.delete(key);
    }
    return;
  }
  if (workspace) faulted(provider, breakerKeyOf(provider, workspace), workspace, answer, now);
  faulted(provider, provider, workspace ?? NO_WORKSPACE, answer, now);
}

function faulted(provider: Provider, key: string, source: string, answer: FaultSaid, now: number): void {
  const breaker: Breaker = breakers.held.get(key) ?? { failures: 0, openUntil: 0, probing: false, faultsOf: new Map() };
  const wasOpen = breaker.openUntil > now;
  breaker.failures += 1;
  breaker.faultsOf.set(source, (breaker.faultsOf.get(source) ?? 0) + 1);
  breakers.held.set(key, breaker);
  if (breaker.failures < BREAKER_FAILURES || (key === provider && oneWorkspaceAlone(breaker))) return;
  breaker.openUntil = now + BREAKER_OPEN_MS;
  // Opened, or opened again after the pause's one call faulted too: either way calls are held from now.
  if (wasOpen) return;
  if (key === provider) breakers.opened.set(provider, (breakers.opened.get(provider) ?? 0) + 1);
  breakerLog.warn("breaker_open", {
    provider,
    failures: breaker.failures,
    status: answer.status,
    error: answer.error,
    open_ms: BREAKER_OPEN_MS,
    ...(answer.providerRequest ? { provider_request: answer.providerRequest } : {}),
    ...(key === provider ? {} : { tenant_id: source }),
  });
}

/**
 * Whether the provider's faults in a row are, but for one or two, one workspace's: then they are its trouble, which its
 * own breaker holds, and the provider is not held for everyone. Faults of calls that named no workspace count as
 * others', so a provider every workspace's calls fail at opens as it always did.
 */
function oneWorkspaceAlone(breaker: Breaker): boolean {
  let most = 0;
  for (const [source, count] of breaker.faultsOf) if (source !== NO_WORKSPACE && count > most) most = count;
  return breaker.failures - most < OTHERS_FAULTS;
}

/** A provider's own breaker as it stands: what a report of the platform's health, or a test, reads. */
export function breakerOf(provider: Provider, now = Date.now()): { open: boolean; failures: number } {
  const breaker = breakers.held.get(provider);
  return { open: !!breaker && breaker.openUntil > now, failures: breaker?.failures ?? 0 };
}

/** How many workspaces' own breakers hold a provider's calls in this instance now. */
function workspacesHeld(provider: Provider, now: number): number {
  let held = 0;
  for (const [key, breaker] of breakers.held) if (key.startsWith(`${provider}|`) && breaker.openUntil > now) held += 1;
  return held;
}

/** Every provider's breaker as it stands in this instance, and until when an open one holds: what /api/diag says. */
export function breakerStates(now = Date.now()): {
  provider: Provider;
  open: boolean;
  failures: number;
  opened: number;
  open_until: string | null;
  workspaces_held: number;
}[] {
  return PROVIDER_NAMES.map((provider) => {
    const breaker = breakers.held.get(provider);
    const open = !!breaker && breaker.openUntil > now;
    return {
      provider,
      open,
      failures: breaker?.failures ?? 0,
      opened: breakers.opened.get(provider) ?? 0,
      open_until: open ? new Date(breaker.openUntil).toISOString() : null,
      workspaces_held: workspacesHeld(provider, now),
    };
  });
}

/** Every breaker closed: for a test, which must not inherit the last test's outage. */
export function resetBreakerStates(): void {
  breakers.held.clear();
  breakers.opened.clear();
}
