/**
 * A playbook's detail, the channels it goes by (the spec of 8 October 2026, "A campaign says where it goes"): what its
 * channels' word reads (card-sentence.tsx), and what the page says once the server took a change. Apart from
 * card-detail.tsx, which draws the rest of the card and holds its verbs.
 */
import type { ReactNode } from "react";
import {
  CONSENT_CHANNELS,
  LIFECYCLE_TOAST,
  VERSION_CHANNEL_WORDS,
  campaignChannelsOf,
  playbookChannelsRead,
} from "@chanlytics/contracts";
import type { ConsentChannel } from "@chanlytics/contracts";
import { SentenceParts } from "../home/sentence";
import { CM_NO_MESSAGE_YET, cmReadyOf, cmViaTicks, type CmViaTick } from "../parts/channels";
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

/**
 * What the page says once its channels changed: "Visit reminder goes by WhatsApp and Email now", and, where a run of it
 * already waits for approval, that the run keeps the channels it was made with (contracts LIFECYCLE_TOAST.channels).
 */
export function goesBySaid(name: string, kept: readonly ConsentChannel[], runWaits: boolean): ReactNode {
  return <SentenceParts parts={LIFECYCLE_TOAST.channels(name, kept, runWaits)} />;
}
