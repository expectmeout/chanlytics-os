/**
 * A call back nobody asked for in words lets itself go (decision 0136). A call that reached no answer, a dial that never
 * connected or a caller who left without a word, opens the thread's `callback` hold (the closed-loop audit of 17 Oct
 * 2026), and it stood for ever: past a week it folded at Needs you's foot, counted nowhere, under "Nobody's waiting on
 * you" (17 Nov 2026). Nothing was said, so nothing is owed: a week after anything last happened to such a hold, where the
 * business does not talk with the caller and no member said they are a person (contracts strangerCaller), it is
 * resolved by the platform, with no member named. They are held again the day they ring or write.
 *
 * Never a call back someone asked for (its details are their words, not saysUnansweredCall's two), never someone the
 * business talks with, and never one whose record could not be read: that one is left for the next pass.
 *
 * Run from the deadman tick, in the first ten minutes of each hour (a week-old hold is in no hurry), from a point in
 * the table picked anew each pass, since the holds it leaves standing would otherwise head the list for good. Bounded
 * per pass, and each close is guarded on the hold still being open, so two overlapping ticks let one go once.
 */
import { randomUUID } from "node:crypto";
import {
  HOUR_MS,
  MIN_MS,
  NEED_YOU_OLD_MS,
  callerStandingOf,
  saysUnansweredCall,
  strangerCaller,
} from "@chanlytics/contracts";
import { letHoldGo, listCallBacksGoneQuiet, type QuietCallBack } from "@chanlytics/db/conversations";
import { findCallerFacts } from "@chanlytics/db/voice";
import type { SweepTick } from "../ops/sweep-door.js";

/** How the two to-dos a silent call leaves begin (contracts unansweredCallTodo): what the read asks the table for. */
const SILENT_LEADS = ["Missed call:", "Hung up after"] as const;
/** How many of each are read in a pass. Each costs five small reads of the caller's record. */
const BATCH = 25;
/** The part of each hour a tick runs this pass in: the deadman tick comes every ten minutes, so one tick in six. */
const PASS_WINDOW_MS = 10 * MIN_MS;

interface QuietPorts {
  db: SweepTick["db"];
  L: SweepTick["L"];
  /** When to stop and leave the rest to the next pass: the deadman tick's own work comes after this. */
  deadline: number;
  now?: () => number;
  /** Where in the table this pass begins; its own, each pass. */
  pivot?: string;
}

/** Whether this tick is the hour's pass. */
export const quietPassDue = (nowMs: number): boolean => nowMs % HOUR_MS < PASS_WINDOW_MS;

/** How many call backs gone quiet were let go this pass. */
export async function sweepQuietCallBacks(quietPorts: QuietPorts): Promise<{ letGo: number }> {
  const { db, L, deadline } = quietPorts;
  const clock = quietPorts.now ?? Date.now;
  const asked = {
    beforeIso: new Date(clock() - NEED_YOU_OLD_MS).toISOString(),
    pivot: quietPorts.pivot ?? randomUUID(),
    limit: BATCH,
  };
  const found: QuietCallBack[] = [];
  for (const lead of SILENT_LEADS) found.push(...(await listCallBacksGoneQuiet(db, { ...asked, lead })));
  let letGo = 0;
  for (const hold of found) {
    if (clock() > deadline) break;
    // The table was asked by how the details begin; the rule itself is contracts', and is asked again here.
    if (!saysUnansweredCall(hold.details)) continue;
    try {
      const standing = callerStandingOf(await findCallerFacts(db, hold.tenant_id, hold.conversation_id));
      if (!strangerCaller(standing) || !(await letHoldGo(db, hold.tenant_id, hold.id))) continue;
      letGo += 1;
      L.info("call_back_let_go", {
        tenant_id: hold.tenant_id,
        escalation: hold.id,
        conversation: hold.conversation_id,
      });
    } catch (e) {
      L.error("quiet_call_back_sweep_failed", {
        tenant_id: hold.tenant_id,
        escalation: hold.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { letGo };
}
