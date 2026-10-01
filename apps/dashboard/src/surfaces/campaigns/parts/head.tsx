/**
 * Campaigns' shared page furniture: the head each of the three tabs opens on, the dot between the parts of its line, a
 * notice under it, and the press on a list row that opens the row (moved from legacy/components/campaign-bits.jsx,
 * decision 0015).
 *
 * The three pages opened on a one-line standing sentence and a toolbar with a hairline of its own, and each drew its
 * sections with its own furniture. The canvas opens every one of them the same way: a headline and ONE line under it,
 * with the page's own act at the right. That is not the header #556-#558 took away -- a title the top bar repeated, a
 * sub-headline that ran to six lines at 390px and a three-cell stat strip, about 590px of a phone before the first
 * message. This is 22px and 12.5px, about fifty pixels, and it wraps rather than grows.
 */
import type { MouseEvent, ReactNode } from "react";
import { useStanding } from "../../kit/head/standing";
import { Icon } from "../../kit/icon/icon";
import { useLook } from "../../kit/look/look";

interface CmHeadProps {
  title: string;
  badge?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  quiet?: boolean;
  testid?: string | null;
}

/**
 * The page head.
 *
 *   title   the page's name, as the tab says it
 *   badge   a state beside the name, for a head that names one thing (an opened run)
 *   sub     one line under it: the page's numbers, or what it holds
 *   right   the page's own act, or a state that outranks it
 *   quiet   a tab's list, where the tab above already says the name: the name is kept for a screen reader and the
 *           head is ONE line -- the numbers at the left, the tools and the act at the right, as People's controls
 *           row is. The crumb, the tab and a 22px title said "Playbooks" three times over one list (23 Sep).
 *
 * Under Glass the head is the frame's (kit/head/frame-head.tsx, the canvas C1): a tab's list opens on the surface's name,
 * "Campaigns", with the head's line beside it and its act on the row of views, and a page that names one thing (an
 * opened run, the send screen) opens on that name. This says the head's parts to the frame and draws nothing of its
 * own there; the strip above still says which door this is.
 */
export function CmHead({ title, badge = null, sub = null, right = null, quiet = false, testid = null }: CmHeadProps) {
  const glass = useLook() === "glass";
  useStanding(
    glass
      ? {
          title: badge ? (
            <>
              {title} {badge}
            </>
          ) : quiet ? (
            "Campaigns"
          ) : (
            title
          ),
          // A tab's list is the surface's own page: no way back above its name.
          back: quiet ? null : undefined,
          sentence: sub,
          act: right,
        }
      : null,
  );
  if (glass) return null;
  return (
    <header className={`cm-head${quiet ? " is-quiet" : ""}`} data-testid={testid || undefined}>
      <div className="cm-head-text">
        {badge ? (
          <div className="cm-head-line">
            <h1 className="cm-head-title">{title}</h1>
            {badge}
          </div>
        ) : (
          <h1 className={quiet ? "cm-head-title cm-sr" : "cm-head-title"}>{title}</h1>
        )}
        {sub && <div className="cm-head-sub">{sub}</div>}
      </div>
      {right && <div className="cm-head-right">{right}</div>}
    </header>
  );
}

/** The dot between the parts of a head's line: a separator a screen reader skips. */
export function CmDot() {
  return (
    <span className="cm-head-dot" aria-hidden="true">
      ·
    </span>
  );
}

// A press anywhere on a list row that is not one of its own controls is a press on the row's opener (the element
// marked data-row-open): the row is the target, as People's rows are, and not the 13px of its name. A press on
// another control in the row keeps its own act, and words dragged over are a selection, not a press. The record
// kit's recRowPress is the same rule for a record's rows (record-row.jsx).
const CM_ROW_OWN_PRESS = 'button, a[href], input, select, textarea, [role="button"], [tabindex]';

export const cmRowPress = (e: MouseEvent<HTMLElement> | undefined) => {
  const row = e && e.currentTarget;
  const t: Partial<Element> | null | undefined = e && e.target;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- the guard names the method, one overload of which is deprecated; the call below is not
  if (!row || !t || !t.closest || !row.querySelector) return;
  const own = t.closest(CM_ROW_OWN_PRESS);
  if (own && own !== row && row.contains(own)) return;
  const picked = typeof window.getSelection === "function" ? window.getSelection() : null;
  if (picked && String(picked)) return;
  const opener: Partial<HTMLElement> | null = row.querySelector("[data-row-open]");
  if (opener && typeof opener.click === "function") opener.click();
};

interface CmBannerProps {
  tone?: string;
  lead: ReactNode;
  children?: ReactNode;
  act?: ReactNode;
  testid?: string | null;
}

/**
 * A notice that sits between the head and the list: one bold sentence saying
 * what is true, the rest saying what it costs, and the one act that fixes it.
 */
export function CmBanner({ tone = "warn", lead, children = null, act = null, testid = null }: CmBannerProps) {
  return (
    <div className="cm-banner" data-tone={tone} data-testid={testid || undefined}>
      <Icon name={tone === "plain" ? "info" : "notice"} size={15} />
      <span className="cm-banner-text">
        <strong>{lead}</strong>
        {/* What it costs: beside the sentence on a desk, and left to the act on a phone, where it was five lines. */}
        {children ? <span className="cm-banner-more"> {children}</span> : null}
      </span>
      {act}
    </div>
  );
}
