/**
 * The marks the peek's lines carry, and the tips they point at (moved from legacy/pages/leads-peek.jsx, decision 0015): a
 * check's mark, the evidence as a pipeline, and a hint whose words hang under its line, placed against the peek as they
 * are asked for so no pane cuts them off.
 */
import type { ReactNode, SVGProps } from "react";
import { Icon } from "../../kit/icon/icon";

const LD_MARKS = {
  check: "M3.5 8.5l3 3 6-6.5",
  cross: "M4.5 4.5l7 7M11.5 4.5l-7 7",
};

/**
 * A check's mark. Nothing Claude read wears a plain check (PRD 0.1, P2): what was seen gets the check, what was read
 * gets a dashed ring, and either can say it could not tell.
 */
export const ldCheckMark = (how: "seen" | "read", answer: "yes" | "no" | "unknown") => {
  const p: SVGProps<SVGSVGElement> = {
    width: 13,
    height: 13,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  if (answer === "unknown")
    return (
      <span className="pk-ck-mark pk-ck-ask">
        <svg {...p}>
          <path d="M6 6.2a2 2 0 113 1.8v1" />
          <circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  if (answer === "no")
    return (
      <span className={`pk-ck-mark pk-ck-cross${how === "read" ? " pk-ck-read" : ""}`}>
        <svg {...p}>
          <path d={LD_MARKS.cross} />
        </svg>
      </span>
    );
  if (how === "read")
    return (
      <span className="pk-ck-mark pk-ck-read">
        <svg {...p}>
          <circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2.5" />
        </svg>
      </span>
    );
  return (
    <span className="pk-ck-mark pk-ck-check">
      <svg {...p}>
        <path d={LD_MARKS.check} />
      </svg>
    </span>
  );
};

/**
 * Where a hint's tip hangs: under its line and as wide as it, or above it when the peek has no room below. The tip
 * belongs to the peek, not to the body it sits in -- the body scrolls, and on a short window it is 200px tall, so a
 * tip placed inside it was cut off at its edge (the evidence card lost 18px on production, the email's note 41). So it
 * is placed against the peek as it is asked for. A tip is out of the layout until it shows, so its height is reckoned
 * from what it holds: a line a check on the card, a line to every 48 characters of a sentence.
 */
const pkTipRoom = (tip: HTMLElement) => {
  const checks = tip.querySelectorAll(".pk-ck").length;
  return checks ? checks * 24 + 36 : Math.ceil((tip.textContent || "").length / 48) * 18 + 18;
};
/** What a node must answer to be placed: a hint already gone, or a stand-in in a test, may answer less. */
interface Placeable {
  closest?: unknown;
  querySelector?: unknown;
  classList?: unknown;
}
const pkPlace = (placeable: Placeable | null | undefined) => {
  if (
    !placeable ||
    typeof placeable.closest !== "function" ||
    typeof placeable.querySelector !== "function" ||
    !placeable.classList
  )
    return;
  const hint = placeable as Element;
  const tip = hint.querySelector<HTMLElement>(":scope > .pk-hint-tip");
  const line = hint.closest(".pk-rr, .pk-verdict");
  const peek = hint.closest(".pk");
  const body = hint.closest(".pk-body");
  if (!tip || !line || !peek || !body) return;
  const p = peek.getBoundingClientRect();
  const l = line.getBoundingClientRect();
  const b = body.getBoundingClientRect();
  // An absolute box is placed against its containing block's padding box, inside the peek's border.
  const top = p.top + peek.clientTop;
  const left = p.left + peek.clientLeft;
  const bottom = top + peek.clientHeight;
  const right = left + peek.clientWidth;
  // A line scrolled out of the body's view says nothing over the band or the act bar.
  hint.classList.toggle("pk-away", l.bottom <= b.top || l.top >= b.bottom);
  const up = bottom - l.bottom < pkTipRoom(tip) && l.top - top > bottom - l.bottom;
  tip.style.left = `${l.left - left}px`;
  tip.style.right = `${right - l.right}px`;
  tip.style.top = up ? "auto" : `${l.bottom - top + 2}px`;
  tip.style.bottom = up ? `${bottom - l.top + 2}px` : "auto";
};
export const pkPlaceTip = (e: { currentTarget: Element } | null | undefined) => pkPlace(e && e.currentTarget);

/** How long a body must stand still before a tip is asked for again. */
const PK_STILL_MS = 160;
/**
 * A body that is moving shows no tip, as the table's scroller shows no hover (clients-a.jsx): a tip is placed
 * against the peek, so it would stay put while its line scrolled away. Once the body is still, a tip still asked for
 * is placed again where its line is now.
 */
const PK_STILL = new WeakMap<Element, ReturnType<typeof setTimeout>>();
export const pkScrolling = (e: { currentTarget: Element } | null | undefined) => {
  const body = e && e.currentTarget;
  if (!body || typeof body.setAttribute !== "function") return;
  body.setAttribute("data-scrolling", "1");
  clearTimeout(PK_STILL.get(body));
  PK_STILL.set(
    body,
    setTimeout(() => {
      body.removeAttribute("data-scrolling");
      for (const h of body.querySelectorAll(".pk-hint")) if (h.matches(":hover, :focus-within")) pkPlace(h);
    }, PK_STILL_MS),
  );
};

/**
 * A note that was a sentence under its line (D8): now a mark you can point at, focus or tap. The mark is the line's
 * own glyph where it has one -- the reach shapes the table's rows wear -- else a small info mark. Its words are always
 * in the DOM and named by aria-describedby, so a screen reader hears them; a touch shows them on tap, because the
 * mark is a button; and the tip is placed as it is asked for (pkPlaceTip), so no pane cuts it off.
 */
interface PkHintProps {
  id: string;
  label: string;
  mark?: ReactNode;
  testid: string;
  card?: boolean;
  children?: ReactNode;
}
export const PkHint = ({ id, label, mark, testid, card = false, children }: PkHintProps) => (
  <span className="pk-hint" onMouseEnter={pkPlaceTip} onFocus={pkPlaceTip}>
    <button
      type="button"
      className="pk-hint-mark"
      aria-label={label}
      aria-describedby={id}
      data-testid={testid}
      onClick={(e) => e.stopPropagation()}
    >
      {mark || <Icon name="info" size={12} />}
    </button>
    <span className={`pk-hint-tip${card ? " card" : ""}`} role="tooltip" id={id}>
      {children}
    </span>
  </span>
);

/**
 * The evidence as a pipeline (D8): one segment a check, in the order they were made, filled by its answer. It stands
 * beside the verdict's pill, so "Strong fit" and what it rests on read as one thing. It is a gauge of one length
 * whatever the count (PK_BAR_W): four checks or seven, two leads' evidence compares at a glance by how much of it is
 * filled. The segments fill in order as the peek opens, a pipeline running once (none of it for reduced motion).
 *
 * ONE svg with its geometry in its own attributes, not a row of sized spans: an empty span takes its size only from
 * the cascade, and on production the dots this replaces drew at two sizes on one line (#734).
 */
const PK_BAR_W = 120;
const PK_BAR_GAP = 3;
const PK_BAR_H = 4;
export const LeadEvidenceBar = ({ dots }: { dots?: ("yes" | "unknown" | "no")[] }) => {
  if (!dots || !dots.length) return null;
  const seg = (PK_BAR_W - PK_BAR_GAP * (dots.length - 1)) / dots.length;
  return (
    <svg
      className="pk-bar"
      width={PK_BAR_W}
      height={PK_BAR_H}
      viewBox={`0 0 ${PK_BAR_W} ${PK_BAR_H}`}
      aria-hidden="true"
      focusable="false"
      data-testid="peek-check-bar"
    >
      {dots.map((d, i) => (
        <rect
          key={`${d}-${i}`}
          className={`pk-seg ${d}`}
          x={i * (seg + PK_BAR_GAP)}
          y={0}
          width={seg}
          height={PK_BAR_H}
          rx={2}
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </svg>
  );
};
