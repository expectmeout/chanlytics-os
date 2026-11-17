/**
 * What the Campaigns list reads of the workspace's messages (Campaigns, one tab, 17 Nov 2026), from the settings read it
 * waits for and the campaigns' read of the business's channels: each message's title, which a search finds a campaign by
 * (call C7); whether a message a running campaign sends waits for a channel to carry it, which its row says quietly (call
 * C13); and the messages no campaign sends, folded at the list's foot as "Not in a campaign", each saying what can use it
 * and opening over the list as a message pressed anywhere does (call C5). The Messages list said all three; with it folded
 * into Campaigns they are said here. Every word is contracts'.
 */
import { useMemo, useState } from "react";
import {
  OTHER_MESSAGES_WORDS,
  addressOf,
  otherMessagesOf,
  sequenceMessageWaits,
  type CampaignMessage,
  type OtherMessage,
  type SequenceRowDto,
} from "@chanlytics/contracts";
import { GroupHead } from "../../kit/head/group-head";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { ListRow } from "../../kit/list-row/list-row";
import { routeDoor } from "../../frame-verbs";
import { useSurface } from "../../use-surface";

/** No message read yet, or a read that failed: nothing is said of any. */
const NO_MESSAGES: readonly CampaignMessage[] = [];

/** The list's reading of the messages: titles by name, whether a row's message waits, and those nothing sends. */
export function useListMessages() {
  const settings = useSurface("settings");
  const ready = useSurface("playbooks")?.ready ?? null;
  const messages = settings?.messages ?? null;
  const use = settings?.templateUse ?? null;
  return useMemo(() => {
    const titles = new Map<string, string>();
    for (const m of messages ?? NO_MESSAGES) if (!titles.has(m.name)) titles.set(m.name, m.title);
    const sends = (name: string) => {
      const usage = use?.[name];
      return !!usage && (!usage.unused || usage.booking);
    };
    return {
      titleOf: (name: string): string | null => titles.get(name) ?? null,
      waits: (row: SequenceRowDto): boolean => sequenceMessageWaits(row, messages, ready),
      // What sends each message is the usage's: where it was not read, nothing is listed as sending nothing.
      others: messages && use ? otherMessagesOf(messages, sends) : null,
    };
  }, [messages, use, ready]);
}

/** One message nothing sends: its title and what can use it; pressed, it opens over the list. */
function OtherRow({ m }: { m: OtherMessage }) {
  return (
    <ListRow
      mark={<Icon name="chat" size={14} />}
      name={m.title}
      said={(place) => <div className={place}>{m.line}</div>}
      className="sq-row"
      data-row=""
      data-testid={`sq-other-${m.name}`}
      {...routeDoor(addressOf({ kind: "template", name: m.name }))}
    />
  );
}

/**
 * The fold at the list's foot: shut until asked, as the ended campaigns' is, and open under a search, which narrows it to
 * the messages whose titles hold the words. Nothing where no message is left out of every campaign.
 */
export function OtherMessages({ others, words }: { others: readonly OtherMessage[] | null; words: string }) {
  const [open, setOpen] = useState(false);
  const shown = words === "" ? (others ?? []) : (others ?? []).filter((m) => m.title.toLowerCase().includes(words));
  if (shown.length === 0) return null;
  const opened = open || words !== "";
  return (
    <section className="sq-group" aria-label={OTHER_MESSAGES_WORDS.group} data-testid="sq-others">
      <GroupHead
        label={OTHER_MESSAGES_WORDS.group}
        count={shown.length}
        end={
          words === "" ? (
            <LinkButton onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="sq-others-toggle">
              {open ? OTHER_MESSAGES_WORDS.hide : OTHER_MESSAGES_WORDS.show(shown.length)}
            </LinkButton>
          ) : null
        }
      />
      {opened ? shown.map((m) => <OtherRow key={m.name} m={m} />) : null}
    </section>
  );
}
