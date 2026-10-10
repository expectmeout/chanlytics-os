import "server-only";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  LIFECYCLE_WORDS,
  VERSION_CHANNEL_WORDS,
  campaignChannelsOf,
  channelsGoesByWords,
  noteRows,
  playbookChannelsRead,
  readyOrWhatsApp,
  triggerOf,
  type ConsentChannel,
  type PlaybookChannelsRead,
} from "@chanlytics/contracts";
import { channelsChanged, playbookChannelsRow } from "../../../campaigns/playbook-channels";
import { checkPlaybookChannelsInput } from "../../../campaigns/playbooks";
import { load } from "../../../readers";
import { channelsReady } from "../../../readers/facts";
import {
  UUID,
  actAction,
  askedMessage,
  propose,
  refuse,
  str,
  type ProposalOutcome,
  type ToolContext,
} from "../context";

/** Where a playbook's id is read, said as the model calls it. */
const PLAYBOOK_FROM = "campaigns with action playbooks";

/**
 * What a playbook card says of each channel it keeps and cannot go by yet, by the drawer's own reading (contracts
 * playbookChannelsRead): " · Email waits: <why> Its runs hold those people until it can.", one after another, and
 * nothing where every channel it keeps can go. The channels card's sentence, and the starter card's (act/playbook.ts).
 */
export function channelsWaitWords(read: PlaybookChannelsRead): string {
  return read.kept
    .filter((c) => read.stands[c] === "waits")
    .map((c) => {
      const why = read.choices.find((x) => x.channel === c)?.why;
      return ` · ${VERSION_CHANNEL_WORDS[c]} waits${why ? `: ${why}` : "."} Its runs hold those people until it can.`;
    })
    .join("");
}

/**
 * The channels an existing playbook goes by, changed (8 Oct 2026; the spec "A campaign says where it goes"): what a press
 * on the Goes by row of its drawer does, proposed here as a card.
 *
 * The playbook is read as far as its channels need (campaigns/playbook-channels.ts playbookChannelsRow: its row, the
 * channels it keeps, whether a run of it waits), never the whole Playbooks page. The channels asked are judged by the
 * check its Approve runs (the PUT's own, for channels alone: campaigns/playbooks.ts checkPlaybookChannelsInput, against
 * the playbook as it stands), so a channel its purpose never carries is refused here in the composers' words and never at
 * Approve. What the card then says of each channel is the one reading the drawer and the rail make (contracts
 * playbookChannelsRead): a channel it keeps and cannot go by yet (no line, no version of its message there, offers by
 * email not open) waits, with the reason, its runs holding those people until it can. The card carries the channels and
 * nothing else of the playbook, so its Approve, and its Undo, change nothing else.
 */
async function proposePlaybookChannels(
  t: ToolContext,
  input: { playbook_id: string; channels: ConsentChannel[] },
): Promise<ProposalOutcome> {
  // An id is one id in either case: the pattern takes both, so the row is asked for as the table writes it.
  const id = str(input.playbook_id, 40).toLowerCase();
  if (!UUID.test(id)) return refuse(`playbook_id must be a playbook's id, as ${PLAYBOOK_FROM} gives it`);
  const p = await playbookChannelsRow(t.ctx, t.tenantId, id);
  // A reach-out's steps are not listed among the playbooks (they go by email alone, from their own sheet).
  if (!p || triggerOf(p.trigger)?.kind === "reach_out")
    return refuse(`no such playbook in this workspace; ${PLAYBOOK_FROM} names them`);
  // The playbook is a row the answer may cite, opened where its drawer is.
  noteRows(t.read, [{ kind: "playbook" as const, id: p.id, route: `campaigns/moment:${p.id}`, label: p.name }]);
  const was = campaignChannelsOf(p.channels);
  let next: ConsentChannel[];
  try {
    next = campaignChannelsOf(await checkPlaybookChannelsInput(t.ctx, t.tenantId, p, input.channels));
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }
  if (!channelsChanged(next, p.channels))
    return refuse(`“${p.name}” already goes by ${channelsGoesByWords(was)}: say so, and change nothing`);
  const asked = await askedMessage(t, p.template_id ?? "");
  if ("refusal" in asked) return refuse(asked.refusal);
  // What the workspace can send on, as the turn already holds it (readers/facts.ts); unread, it is WhatsApp alone.
  const ready = readyOrWhatsApp((await load(t.rc, channelsReady, undefined)).data);
  const waits = channelsWaitWords(playbookChannelsRead(p, next, asked.message, ready));
  // A run that already waits for approval was made with the channels the playbook had (core run-playbook stores them).
  const runKeeps = p.run_waits ? ` · ${LIFECYCLE_WORDS.channels.runKeeps}` : "";
  return propose({
    kind: "playbook_channels",
    title: `Channels: ${p.name}`,
    summary: `Goes by ${channelsGoesByWords(next)}, where it went by ${channelsGoesByWords(was)} · each person is still reached once, on the first of them that can reach them${waits}${runKeeps}`,
    payload: { playbook_id: p.id, name: p.name, channels: next, was, run_waits: p.run_waits },
  });
}

/** The channels an existing playbook goes by, changed: propose_campaign's action channels. */
export const playbookChannelsAction = actAction({
  kind: "playbook_channels",
  input: z.object({ playbook_id: z.string(), channels: z.array(z.enum(CONSENT_CHANNELS)) }),
  examples: [{ playbook_id: "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c", channels: ["whatsapp", "email"] }],
  label: "Preparing a playbook's channels",
  words: `Action channels takes playbook_id, a playbook that exists, as ${PLAYBOOK_FROM} gives it, and channels (whatsapp, sms, email), every channel it should go by from now on, not only the ones to add (that read gives the channels it goes by now): each person is reached once, on the first of them that can reach them, so one more channel widens who it reaches and never sends a person two messages. Nothing else about the playbook changes. A channel its purpose never carries is refused; one it cannot go by yet (no line, no version of its message there, offers by email not open) is kept, and the card says it waits and that its runs hold those people until it can; a run of it already waiting for approval keeps the channels it was made with, and the card says so; and a playbook that already goes by exactly those channels is refused in words.`,
  build: proposePlaybookChannels,
});
