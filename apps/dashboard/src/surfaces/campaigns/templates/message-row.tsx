/**
 * One message, as a row (moved from MessageRow in legacy/pages/messages.jsx, decision 0015): two lines you scan a list of
 * at once, its name and why it needs you, what sends it or what it is for, and at its right how many went out or when the
 * last did (Messages, the canvas of 10 Nov 2026). The message itself, its languages, its channels and the verbs that change
 * it are in the pane it opens beside the list (template-pane.tsx), as a thread opens beside the Inbox's list
 * (parts/split.tsx).
 *
 * It was four lines (the words, its channels, what sends it, how much went out, each in a column), and the list was three
 * screens on a phone with sixteen rows saying "Not used". The words are still the point, and they are one press away.
 */
import type { TemplateGroup } from "./group";
import type { MessageSetting, messageFacts } from "./message-row-facts";
import { closedLine } from "./message-row-parts";

interface MessageRowProps {
  g: TemplateGroup;
  /** What the row and the pane both read of it, for the language it opens on (message-row-facts.ts messageFacts). */
  facts: ReturnType<typeof messageFacts>;
  /** Where it stands in the list, and what its row says of it (placeOfMessage). */
  setting: MessageSetting;
  /** Its pane is the one open: the row stands selected. */
  open?: boolean;
  onOpen: () => void;
}

export function MessageRow({ g, facts, setting, open = false, onOpen }: MessageRowProps) {
  const { lang, usage, marks } = facts;
  const { row } = lang;
  return (
    <div
      className={`msg-row${open ? " is-open" : ""}${setting.place === "need" ? " is-attn" : ""}${row && row.hidden_at ? " is-hidden" : ""}`}
      data-template={usage.gName || undefined}
      data-place={setting.place}
      data-testid={g.starter ? "starter-row" : "custom-row"}
    >
      {/* A press anywhere on the line that is not one of its controls opens it (cmRowPress), as a person's row does. */}
      {closedLine({
        g,
        tag: marks.tag,
        said: setting.said,
        saysUse: setting.saysUse,
        warn: setting.place === "need",
        aside: setting.aside,
        open,
        onOpen,
      })}
    </div>
  );
}
