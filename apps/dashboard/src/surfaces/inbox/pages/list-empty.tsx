/**
 * What the Inbox's list says where it has no rows (moved from inbox-list.tsx, 15 Nov 2026, as that module grew past its
 * length): each empty bucket's words, a real workspace's or the mockup's, and the line that says a waiting customer's
 * conversation could not be read.
 */
import { NEED_YOU_WORDS } from "@chanlytics/contracts";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { surfaceState } from "../shell";
import { inboxData } from "../store";
import type { Thread } from "../types";

/**
 * Escalated threads outside the newest page are fetched one by one;
 * one that failed is a waiting customer nobody can see, so the list
 * says so instead of listing fewer.
 */
export function unreadEscalated() {
  const count = inboxData().UNREAD_ESCALATED || 0;
  return count > 0 ? (
    <FailedRead
      kind="line"
      title={`Couldn't read ${count} escalated conversation${count === 1 ? "" : "s"}`}
      body="Someone may be waiting in them."
      surface="inbox"
      testid="inbox-unread-escalated"
    />
  ) : null;
}

/** What an empty bucket, or an empty saved view, says. */
interface EmptyWords {
  icon: string;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}

/**
 * The words of each empty bucket: a real workspace's, or the mockup's. Needs you with a campaign run waiting is not empty:
 * the run is its row (inbox-runs.tsx), and nothing says "Nobody's waiting" over it.
 */
function emptyWords(isReal: boolean): Record<string, EmptyWords> {
  return {
    waiting: {
      icon: "users",
      title: "Nothing waiting",
      body: "Conversations where the next move is theirs or a teammate's show here, and the ones you snooze.",
    },
    done: isReal
      ? {
          icon: "check",
          title: "Nothing handled yet",
          body: "Conversations that were answered or closed show here.",
          cta: { label: "Open Conversations", to: "conversations" },
        }
      : {
          icon: "check",
          title: "48 resolved this week",
          body: "Handled conversations archive after 7 days. Every transcript stays in Conversations.",
          cta: { label: "Open Conversations", to: "conversations" },
        },
    // The mockup's own list: a real workspace's snoozed conversations stand in Waiting (decision 0142).
    snoozed: {
      icon: "clock",
      title: "7 snoozed, all sleeping",
      body: "They come back when they wake. Next: Elena's win-back, tomorrow 10:00.",
    },
    needs: {
      icon: "check",
      title: "Nothing needs you",
      body: "Conversations AI hands to you land here first.",
    },
    watching: { icon: "eye", title: "Nothing in flight", body: "Conversations AI is answering show here." },
    drafts: { icon: "edit", title: "No drafts waiting", body: "Replies AI wrote wait here for your review." },
    escalated: isReal
      ? {
          icon: "check",
          title: "Nobody's waiting on you",
          body: "AI is answering on its own. Anything left for you lands here.",
        }
      : { icon: "flag", title: "No escalations", body: "Sensitive conversations that need a person land here." },
  };
}

/** What the empty list reads of the list it stands in: its threads, the bucket or view, and the words in the search. */
interface EmptyListOf {
  threads: Thread[];
  activeView: string | null;
  activeBucket: string;
  query: string;
  setQuery: (v: string) => void;
  /** What Needs you folds at its foot: whoever has waited past a week (inbox-list.tsx olderFold). */
  needsYou?: { older: readonly unknown[]; olderRows: readonly unknown[] } | null;
}

/**
 * With anyone folded under this card in Needs you (whoever has waited past a week), the card says Today's own words
 * over them: "Nothing needs you", and that the older ones may need nothing. "Nobody's waiting on you" stood over
 * "1 waiting over a week" (17 Nov 2026).
 */
export function emptyThreads(list: EmptyListOf) {
  const { threads, activeView, activeBucket, query, setQuery, needsYou } = list;
  // "Is this a real workspace?" must come from the surface
  // classification, not from the array being inspected: an EMPTY
  // thread list made `threads.some(t => t.real)` false, so precisely
  // when the empty state showed, it showed the mockup's copy — an
  // empty Snoozed bucket reading "7 snoozed… Elena's win-back".
  const surface = surfaceState("inbox");
  const isReal = surface !== undefined ? surface === "real" : threads.some((t) => t.real);
  const words: EmptyWords = emptyWords(isReal)[activeView ? "view" : activeBucket] || {
    icon: "filter",
    title: "Nothing in this view",
    body: "No conversations match this view right now.",
  };
  // Needs you with nobody in it and nothing typed is what the pane beside says, as "Inbox zero" (thread.tsx InboxEmpty):
  // where that pane stands (a desk), this card steps aside for it (inbox.css, .ix-zero-beside), so the page says it once.
  const saidBeside = activeBucket === "escalated" && !query && !activeView;
  const older = saidBeside ? (needsYou?.older.length ?? 0) + (needsYou?.olderRows.length ?? 0) : 0;
  const meta: EmptyWords = older
    ? { ...words, title: NEED_YOU_WORDS.onlyOlder.title, body: NEED_YOU_WORDS.onlyOlder.says(older) }
    : words;
  return (
    <EmptyState
      kind="page"
      className={saidBeside ? "ix-zero-beside" : ""}
      glyph={query ? "search" : meta.icon || "check"}
      tone={query ? null : "ok"}
      title={query ? `No matches for "${query}"` : meta.title || "All clear"}
      body={
        query
          ? "Try another word. Search looks through every tab."
          : meta.body || "AI brings anything that needs you here."
      }
      action={
        query
          ? { label: "Clear search", onClick: () => setQuery("") }
          : meta.cta
            ? { label: meta.cta.label, to: meta.cta.to }
            : null
      }
    />
  );
}
