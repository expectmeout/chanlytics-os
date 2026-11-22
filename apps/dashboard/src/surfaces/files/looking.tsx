/**
 * AI's three, at work: drawn on a photo's tile while AI looks at it (photo.tsx), and wherever else a page says AI is
 * working (Content, Forms, a request's reply). A module of its own, so a page that draws the mark loads the mark and
 * not the photo tiles' whole module. Its rules are Files' (files.css `.files-looking`).
 */
import { useState } from "react";

/** Ask's three, while it looks at this photo. A tile that had them keeps them drawn as it finishes, so they fade, and one that never did draws nothing. */
export function AskLooking({ looking, coming = false }: { looking: boolean; coming?: boolean }) {
  const [drawn, setDrawn] = useState(looking);
  if (looking && !drawn) setDrawn(true);
  if (!drawn) return null;
  return (
    <span
      className="files-looking"
      data-on={looking || undefined}
      data-coming={coming || undefined}
      aria-hidden="true"
      data-testid="fl-looking"
    >
      <span />
      <span />
      <span />
    </span>
  );
}
