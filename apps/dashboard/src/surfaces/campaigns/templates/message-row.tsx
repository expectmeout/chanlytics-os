/**
 * One message, as a row (moved from MessageRow in legacy/pages/messages.jsx, decision 0015): what it is, what sends it
 * and how much of it went out -- the things you scan sixteen of at once. The message itself, its languages and the
 * verbs that change it are in the pane it opens beside the list (template-pane.tsx), as a thread opens beside the
 * Inbox's list (parts/split.tsx).
 *
 * It was a card carrying the whole bubble, and sixteen of those is about three thousand pixels of chat nobody can
 * compare. The words are still the point, so a line of them rides the row and the WHOLE message -- heading, what varies
 * per person, footer, buttons -- is one press away, for one message at a time. It opened under its own row, which
 * pushed the rows after it down by the message's height and left the list's columns over a message that had none.
 */
import type { TemplateDto } from "@/surfaces/inbox/types";
import { closedLine, rowHints } from "./message-row-parts";
import { firstView, messageFacts } from "./message-row-facts";
import type { TemplateGroup, TplLang } from "./group";
import type { StarterLibrary } from "./verbs";

interface MessageRowProps {
  g: TemplateGroup;
  langs: readonly TplLang[];
  S: StarterLibrary;
  /** The workspace's email and text rows: the row says which channels the message has a version on. */
  versions?: readonly TemplateDto[];
  /** Its pane is the one open: the row stands selected. */
  open?: boolean;
  onOpen: () => void;
}

export function MessageRow({ g, langs, S, versions, open = false, onOpen }: MessageRowProps) {
  // The row reads the message as the pane opens on it: its first language on file, whichever language is picked there.
  const { present, lang, usage, marks, line, channels } = messageFacts({
    g,
    langs,
    S,
    versions,
    view: firstView(g, langs),
  });
  const { row } = lang;
  return (
    <div
      className={`msg-row${open ? " is-open" : ""}${marks.attn ? " is-attn" : ""}${marks.dim ? " is-dim" : ""}${row && row.hidden_at ? " is-hidden" : ""}`}
      data-template={usage.gName || undefined}
      data-testid={g.starter ? "starter-row" : "custom-row"}
    >
      {/* A press anywhere on the line that is not one of its controls opens it (cmRowPress), as a person's row does. */}
      {closedLine({
        g,
        offer: marks.offer,
        tag: marks.tag,
        words: line,
        channels,
        use: usage.use,
        present,
        sent: usage.sent,
        open,
        onOpen,
      })}
      {/* Open, the pane says it of the language in view. */}
      {!open && rowHints(row)}
    </div>
  );
}
