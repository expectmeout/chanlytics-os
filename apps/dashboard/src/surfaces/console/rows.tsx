/**
 * A workspace's row, as Home and Workspaces draw it (decision 0066): its name and address, what is up with it in one
 * sentence (contracts platformRows, the back office's own judgement), its verdict, and who on the team has it. Opening
 * it opens the workspace's page; Take it tells the rest of the team you are on it, for four hours or until you let go.
 */
import { useState } from "react";
import {
  CONSOLE_WORDS,
  claimWords,
  consolePathOf,
  verdictPill,
  type ClaimDto,
  type PlatformRowVM,
} from "@chanlytics/contracts";
import { AttnRow } from "../kit/attention/attn-row";
import type { Flash, Go } from "./parts";
import { consoleVerbs, type ConsoleMe } from "./verbs";

/** Each verdict's glyph, as the back office drew it. */
const VERDICT_GLYPH: Partial<Record<string, string>> = {
  broken: "alert",
  billing: "money",
  rehearsal: "flag",
  stalled: "clock",
  waiting_owner: "user",
  quiet: "wave",
  new: "sparkle",
  live: "check",
  paused: "pause",
  test: "bolt",
};

export function WorkspaceRow({
  row,
  claim = null,
  me,
  go,
  flash,
  onClaimed,
  takes = false,
  cost = "",
}: {
  row: PlatformRowVM;
  claim?: ClaimDto | null;
  me: ConsoleMe;
  go: Go;
  flash: Flash;
  onClaimed: () => void;
  /** Whether the row offers Take it (Home's rows that need us): elsewhere it opens. */
  takes?: boolean;
  /** What its model calls cost lately, in words, where the screen knows. */
  cost?: string;
}) {
  const [busy, setBusy] = useState(false);
  const pill = verdictPill(row.verdict);
  const held = claimWords(claim, me.user_id, Date.now());
  const mine = !!claim && claim.user_id === me.user_id && !!held;
  const open = () => go(consolePathOf("workspaces", row.slug));
  const claimIt = async (take: boolean) => {
    setBusy(true);
    const r = await consoleVerbs.claim(row.tenantId, take);
    setBusy(false);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    onClaimed();
  };
  const cta =
    takes && !held
      ? {
          label: CONSOLE_WORDS.takeIt,
          kind: "ghost",
          busy,
          onClick: () => void claimIt(true),
          testid: `console-take-${row.slug}`,
        }
      : takes && mine
        ? {
            label: CONSOLE_WORDS.letGo,
            kind: "ghost",
            busy,
            onClick: () => void claimIt(false),
            testid: `console-letgo-${row.slug}`,
          }
        : { label: CONSOLE_WORDS.open, kind: "ghost", onClick: open, testid: `console-open-${row.slug}` };
  return (
    <AttnRow
      glyph={VERDICT_GLYPH[row.verdict] || "dot"}
      name={row.name}
      meta={[row.slug, row.facts.paying, cost, row.age].filter(Boolean).join(" · ")}
      sentence={row.sentence}
      status={[pill.label]}
      note={held ?? [row.facts.answering, `texting ${row.facts.texting}`, `heard ${row.facts.heard}`].join(" · ")}
      tone={pill.tone}
      cta={cta}
      onOpen={open}
      testid={`console-row-${row.slug}`}
    />
  );
}
