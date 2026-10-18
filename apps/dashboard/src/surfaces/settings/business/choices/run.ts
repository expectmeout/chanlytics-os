/**
 * A choice's writes, made in the order contracts gives them (business-tab/choices.ts): a policy row's mode through the
 * policies door (legacy-bridge/inbox-verbs.ts setPolicy, PUT /policies), a key of the config through the Business
 * tab's one saver (save.tsx), one at a time, stopping at the first that does not go through. The order is what keeps a
 * failed second write coherent; this only keeps to it. An object the rows import, so a test stands the policies door in
 * (as Try it's verbs are, try/verbs.ts).
 */
import type { ChoiceWrite } from "@chanlytics/contracts";
import { setPolicy } from "@/legacy-bridge/inbox-verbs";
import type { LegacyFlash } from "../../../legacy-verbs";
import type { Config } from "../save";
import { businessTabSave } from "../saver";

/** A config key's write as a patch of the whole config: the switch or the rule, and everything beside it kept. */
function patchOf(w: Exclude<ChoiceWrite, { kind: "policy" }>): (config: Config) => Config {
  if (w.kind === "booking_requests")
    return (c) => ({ ...c, features: { ...(c.features || {}), booking_requests: w.on } });
  return (c) => {
    const brain = c.brain || {};
    const profile = brain.profile || {};
    return {
      ...c,
      brain: {
        ...brain,
        profile: { ...profile, guardrails: { ...(profile.guardrails || {}), never_quote_prices: w.on } },
      },
    };
  };
}

/** One config write through the saver: true once the server took it, false when it was refused (said in its flash). */
function saveConfig(row: string, w: Exclude<ChoiceWrite, { kind: "policy" }>, flash: (f: LegacyFlash) => void) {
  const saver = businessTabSave.saver;
  // With nothing read to save onto, the saver says nothing and answers nothing: refused here instead.
  if (!saver.base()) return Promise.resolve(false);
  return new Promise<boolean>((done) => {
    saver.save({
      row,
      patch: patchOf(w),
      done: () => done(true),
      // Its refusal is said in the danger tone; its success is the choice's one toast, said by the caller.
      flash: (f: LegacyFlash) => {
        if (f && f.tone === "danger") {
          flash(f);
          done(false);
        }
      },
    });
  });
}

/** The writes, in order, stopping at the first refused. True when every one went through. */
async function run(row: string, writes: readonly ChoiceWrite[], flash: (f: LegacyFlash) => void): Promise<boolean> {
  for (const w of writes) {
    if (w.kind === "policy") {
      const r = await choiceRun.setPolicy(w.cls, w.mode);
      if (!r.ok) {
        flash({ tone: "danger", msg: r.message });
        return false;
      }
    } else if (!(await saveConfig(row, w, flash))) return false;
  }
  return true;
}

export const choiceRun = {
  run,
  /** A policy row's mode, alone: no dial travels with it (PUT /policies). */
  setPolicy: (cls: string, mode: string) => setPolicy(cls, mode),
};
