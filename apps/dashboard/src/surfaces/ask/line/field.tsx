/**
 * AI's field (the Line's, drawn by arStage in draw.tsx): what it says while empty, what it holds, and its keys. On a
 * phone's bar it is drawn in the bar's own capsule (Today, calm, D8), and while the finger holds the circle it says to let
 * go of it.
 */
import { askCardHasWords } from "@chanlytics/contracts";
import { LineField } from "../../kit/line/line";
import { ahSlideFrom } from "../hooks";
import { pastedPhotos } from "./attached";
import { arPhone, campaignsAskOf } from "./place";
import type { Line } from "./types";

/**
 * What the field says while it is empty: what is heard, or to let go of the circle on the bar; under a card with words to
 * change, that they can be; under an answer, to follow it; else the page's own question.
 */
function fieldWords({
  talk,
  t,
  active,
  surface,
  dock,
}: Pick<Line, "talk" | "t" | "active" | "surface" | "dock">): string {
  if (talk.listening) return dock ? t.letGo : t.listening;
  if (active)
    return active.messages?.at(-1)?.proposals?.some((p) => !p.outcome && askCardHasWords(p.kind))
      ? t.changeAnything
      : t.follow;
  if (surface === "leads") return t.describeLeads;
  return surface === "campaigns" ? campaignsAskOf(t) : t.placeholder;
}

/** The field itself: what it says while empty, what it holds, and its keys. */
export const arField = (
  {
    talk,
    t,
    inputRef,
    active,
    surface,
    query,
    setQuery,
    composing,
    M,
    onKey,
    hold,
    slideFrom,
    stageRef,
    heroRef,
    setComposing,
    rowsDrawn,
    rows,
    attach,
    dock,
  }: Line,
  activeId: string | undefined,
) => (
  <LineField
    ref={inputRef}
    rows={1}
    listening={talk.listening}
    className="ask-line-input"
    placeholder={fieldWords({ talk, t, active, surface, dock })}
    value={query}
    onChange={(e) => {
      setQuery(e.target.value);
      if (composing) M.mood.hear(0.5);
    }}
    onKeyDown={onKey}
    onKeyUp={(e) => hold.onKeyUp(e)}
    onPaste={(e) => pastedPhotos(e, attach)}
    onFocus={() => {
      if (!arPhone()) return;
      slideFrom.current = ahSlideFrom(stageRef.current, heroRef.current);
      setComposing(true);
    }}
    onBlur={() => setComposing(false)}
    role="combobox"
    aria-expanded={rowsDrawn && rows.length > 0}
    aria-controls={rowsDrawn ? "ask-rows" : undefined}
    aria-activedescendant={activeId}
    aria-autocomplete="list"
    aria-label={t.dialogName}
    data-testid="ask-input"
    maxLength={1000}
    enterKeyHint="send"
    autoCapitalize="sentences"
    autoComplete="off"
    spellCheck={false}
  />
);
