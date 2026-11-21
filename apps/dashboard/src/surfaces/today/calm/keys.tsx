/**
 * Keys on a desk (Working for you, 21 Nov 2026, W12): the same acts as a held line on a phone, nothing new to learn. J and
 * K move between the page's lines, Enter opens the one in focus, E, N and / are its Done, Not now and Ask AI about this
 * (held.tsx, on the line itself), Esc closes what is open over Today (the kit's sheets already do), and ? shows them all.
 * Never while words are being typed, nor with a modifier held, so the browser's and the frame's own keys stay theirs.
 */
import { useEffect, useState } from "react";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { TODAY_LINE_WORDS } from "../model/lines";
import { typing } from "./held";

const KEY_WORDS = TODAY_LINE_WORDS.keys;

/** The page's lines a key can move to: each line's own press, open and in reach (none folded or shut away). */
const LINE_PRESS = '.calm .calm-line:not([data-folded]) > .calm-fold > :is(a, [role="button"])';

function linesInReach(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(LINE_PRESS)].filter((el) => !el.closest("[inert]"));
}

/** Focus the next line (1) or the one before (-1), from the line in focus, else from the page's start. */
function moveFocus(by: 1 | -1): void {
  const lines = linesInReach();
  if (!lines.length) return;
  const at = lines.findIndex((el) => el === document.activeElement || el.contains(document.activeElement));
  const next = at < 0 ? (by > 0 ? 0 : lines.length - 1) : Math.min(lines.length - 1, Math.max(0, at + by));
  const line = lines[next];
  line?.focus();
  line?.scrollIntoView({ block: "nearest" });
}

/** The keys, heard on the desk's Today, and the sheet ? opens with them listed. */
export function TodayKeys() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const heard = (e: KeyboardEvent) => {
      if (typing(e) || e.defaultPrevented) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        moveFocus(e.key === "j" ? 1 : -1);
      } else if (e.key === "?") {
        e.preventDefault();
        setShown(true);
      }
    };
    document.addEventListener("keydown", heard);
    return () => document.removeEventListener("keydown", heard);
  }, []);
  return (
    <Sheet
      open={shown}
      onClose={() => setShown(false)}
      title={KEY_WORDS.title}
      close={{ label: TODAY_LINE_WORDS.held.close, glyph: <Icon name="x" size={13} /> }}
      kicker
      fit
      backCloses
      className="over-page calm-keys-over"
      testid="today-keys-sheet"
    >
      <dl className="calm-keys">
        {KEY_WORDS.list.map(([keys, does]) => (
          <div key={keys} className="calm-key">
            <dt>
              {keys.split(" ").map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{does}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
