/**
 * What the Inbox's own search finds in a thread. Its own module, and the list's alone: the Inbox's rules (rules.ts) are
 * read by the frame's badge on every page, which has no use for the words a search reads.
 */
import { fromAdWords } from "@chanlytics/contracts";
import type { Thread } from "./types";

/** The ad words a thread says, as its head and its marks say them: "From an ad · Spring colour offer". */
const adWordsOf = (thread: Pick<Thread, "fromAd" | "timeline">): string[] => [
  ...(thread.fromAd ? [fromAdWords(thread.fromAd.name)] : []),
  ...thread.timeline.flatMap((entry) => (entry.type === "msg" && entry.fromAd ? [fromAdWords(entry.fromAd.name)] : [])),
];

/**
 * Whether a thread holds the words a search asks for: who it is with, why a person is needed, the last thing said, what
 * they asked (which a row where a person is needed shows in place of the last message), its tags, and where it says an
 * ad, "from an ad" and the ad's name (the Ads tracking plan's T1 and its call 6: the people from ads are found by the
 * search and by asking AI, with no filter row).
 */
export function ixSays(thread: Thread, query: string): boolean {
  const lowered = query.toLowerCase();
  const fields = [
    thread.who,
    thread.subject,
    thread.preview,
    thread.ask?.text ?? "",
    ...thread.tags,
    ...adWordsOf(thread),
  ];
  return fields.some((field) => field.toLowerCase().includes(lowered));
}
