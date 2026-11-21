/**
 * AI's state, a press of its own under the head's sentence (Working for you, W1, 21 Nov 2026): "AI is on", "AI is on ·
 * talking to 2 now", or "Everything is paused" while Stop everything is on. Its three orbit only while AI is in a
 * conversation, and rest otherwise: one moving thing, and never moving words. The press opens AI's sheet (sheet.tsx).
 * Nothing while Today is unread, or where whether AI is stopped could not be read: the page says nothing it cannot back.
 */
import type { ReactElement } from "react";
import type { TodayAiVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { AskFace } from "../../kit/face/ask-face";
import { Icon } from "../../kit/icon/icon";
import { AI_WORDS } from "../model/ai";
import { openAiSheet } from "./open";

const PILL = AI_WORDS.pill;

/** What the press says: paused, talking to some, or on. */
function pillWords(ai: TodayAiVM): string {
  if (ai.stopped) return PILL.stopped;
  return ai.talking.length ? PILL.talking(ai.talking.length) : PILL.on;
}

/** AI's state, the press that opens its sheet; nothing where its state is not known. Called, not drawn. */
export function aiPill(ai: TodayAiVM | null): ReactElement | null {
  if (!ai || ai.stopped === null) return null;
  const talking = !ai.stopped && ai.talking.length > 0;
  return (
    <Button
      variant="secondary"
      size="sm"
      className="calm-ai"
      onClick={openAiSheet}
      data-state={ai.stopped ? "stopped" : talking ? "talking" : "on"}
      data-testid="today-ai"
    >
      {talking ? <AskFace className="calm-ai-three" holds="thinking" /> : <Icon name="three" size={15} />}
      <span>{pillWords(ai)}</span>
      <Icon name="chevron" size={13} />
    </Button>
  );
}
