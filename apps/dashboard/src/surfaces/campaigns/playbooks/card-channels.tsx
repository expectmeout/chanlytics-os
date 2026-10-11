/**
 * A playbook's detail, the channels it goes by (the spec of 8 October 2026, "A campaign says where it goes"): what its
 * Goes by row reads, the row itself, and what the page says once the server took a change. Apart from card-detail.tsx,
 * which draws the rest of the card and holds its verbs.
 */
import type { ReactNode } from "react";
import {
  CONSENT_CHANNELS,
  LIFECYCLE_TOAST,
  LIFECYCLE_WORDS,
  VERSION_CHANNEL_WORDS,
  campaignChannelsOf,
  playbookChannelsRead,
  triggerOf,
} from "@chanlytics/contracts";
import type { ConsentChannel } from "@chanlytics/contracts";
import { SentenceParts } from "../home/sentence";
import { CM_NO_MESSAGE_YET, cmReadyOf, cmTick, cmViaTicks, type CmViaTick } from "../parts/channels";
import { CmVia } from "../parts/send-by";
import type { PlaybookCardVM, PlaybookTemplate, PlaybooksSurface } from "./surface";

/**
 * The channels it goes by, from the one reading of them (contracts playbookChannelsRead, which the composer's Send by row
 * and the marks on the home's rail read too): what it keeps, laid over what the workspace can send on and what its
 * message holds, each closed one with its reason; a kept channel it cannot go by yet stays ticked and says so.
 *
 * What was not read is not guessed. Without the workspace's readiness, or without the playbook's message (the templates
 * could not be read, or the message was deleted), the row shows what it keeps and takes no press: a reason invented for a
 * message nobody read ("no email version yet") was a false thing to say.
 */
export function cardViaOf(p: PlaybookCardVM, surface: PlaybooksSurface | undefined, tpl: PlaybookTemplate | null) {
  const read = playbookChannelsRead(
    p,
    campaignChannelsOf(p.channels),
    tpl ? { category: tpl.category, versions: (tpl.message ?? CM_NO_MESSAGE_YET).versions } : null,
    cmReadyOf(surface?.ready),
  );
  const known = !!surface?.ready && tpl !== null;
  const ticks: CmViaTick[] = known
    ? cmViaTicks(read.ticked, read.ready, { purpose: read.purpose, about: read.about }, true)
    : CONSENT_CHANNELS.map((c) => ({
        channel: c,
        word: VERSION_CHANNEL_WORDS[c],
        on: read.kept.includes(c),
        why: null,
        fixed: true,
        waiting: false,
      }));
  return { kept: read.kept, ticks };
}

type CardVia = ReturnType<typeof cardViaOf>;

/**
 * What the page says once its channels changed: "Visit reminder goes by WhatsApp and Email now", and, where a run of it
 * already waits for approval, that the run keeps the channels it was made with (contracts LIFECYCLE_TOAST.channels).
 */
export function goesBySaid(name: string, kept: readonly ConsentChannel[], runWaits: boolean): ReactNode {
  return <SentenceParts parts={LIFECYCLE_TOAST.channels(name, kept, runWaits)} />;
}

interface CardViaProps {
  p: PlaybookCardVM;
  /** Whether the role may change the playbook; a viewer sees the switches still. */
  canAct: boolean;
  busy: boolean;
  via: CardVia;
  /** The channels it keeps after a press: what the server is sent, alone. */
  onChannels: (next: readonly ConsentChannel[]) => void;
  /** The switches alone, where a line's word already says "Goes by" (the drawer's lines, parts/lines.tsx). */
  bare?: boolean;
}

/**
 * Goes by: the channels it goes by, as the composer's Send by row (parts/send-by.tsx), switched here in place. A role that
 * may change the playbook presses a switch and the channels it keeps after it are sent, alone (verbs.ts `channels`); a
 * viewer sees them still. A press starts from what it keeps, so a channel kept and waiting for a line is never let go by a
 * press on another. Nothing for a playbook that runs nothing here, nor for a reach-out's step, which goes by email alone.
 */
export function CardVia({ p, canAct, busy, via, onChannels, bare = false }: CardViaProps) {
  if (p.off || triggerOf(p.trigger)?.kind === "reach_out") return null;
  const ticks = canAct && !busy ? via.ticks : via.ticks.map((t) => ({ ...t, fixed: true }));
  const row = (
    <CmVia
      ticks={ticks}
      label={LIFECYCLE_WORDS.channels.goesBy}
      busy={busy}
      onTick={(channel, on) => onChannels(cmTick(via.kept, channel, on))}
      testid="pb-via"
    />
  );
  if (bare) return row;
  return (
    <div className="ob-via" data-testid="pb-goes-by">
      <span className="ob-via-k">{LIFECYCLE_WORDS.channels.goesBy}</span>
      {row}
    </div>
  );
}
