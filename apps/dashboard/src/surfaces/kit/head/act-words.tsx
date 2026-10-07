/**
 * The words of a page's act, as the frame's head draws them beside the row of views (components.css, `.pg-act-fit`): the
 * mark and the first word are kept, and the rest gives way where the row has no room for it. People's scopes say their
 * act with its words on a phone too (Ruben, 7 Oct 2026), and three scopes beside "New proposal" pass a narrow phone's
 * width: there the capsule says "New", "Add" or "Find" beside its mark, and a reader still hears the whole of it, since
 * the rest is only wrapped onto a line the capsule does not show. Nothing is measured and no width is named: the words
 * that fit are the words drawn.
 *
 * On a desk, and wherever the row holds it, it draws what the words drew before: the mark, 6px, the words.
 */
import type { ReactNode } from "react";

/** An act's words, the first kept with its mark and the rest after it, the space between them the rest's own. */
export function ActWords({ icon, words }: { icon?: ReactNode; words: string }) {
  const at = words.indexOf(" ");
  const keep = at < 0 ? words : words.slice(0, at);
  const rest = at < 0 ? "" : words.slice(at);
  return (
    <span className="pg-act-fit">
      <span className="pg-act-keep">
        {icon}
        {keep}
      </span>
      {rest ? <span className="pg-act-rest">{rest}</span> : null}
    </span>
  );
}
