/**
 * The kit's Segmented, loaded as it is first drawn rather than with the page that draws it. Base UI's radio group is a
 * few KB, and imported with a page the bundler's shared chunks carried it to pages that draw none: the chart card's
 * switch put fourteen KB on the Inbox (26 Nov 2026), and the Pipeline's List and Board and a plan's choice put four to
 * six on People, the Inbox and Conversations (27 Nov 2026). Until it arrives its own markup holds its place, inert and
 * unread, so nothing moves as it lands. It takes what the Segmented takes, and says the picked option as its own value.
 */
import { lazy, Suspense } from "react";
import { cx } from "../variants";
import type { SegmentedProps } from "./segmented";

const Loaded = lazy(() => import("./segmented").then((loaded) => ({ default: loaded.Segmented<string> })));

/** Its place while it loads: the options as the Segmented draws them, the one picked lit, none of them a stop. */
function Waits<V extends string>({ value, options, className }: SegmentedProps<V>) {
  return (
    <div className={cx("rec-seg", className)} aria-hidden="true" inert>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={-1}
          className="rec-seg-btn"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The Segmented, drawn once its part has loaded: the option picked handed back as one of the page's own values. */
export function SegmentedOnDraw<V extends string>(props: SegmentedProps<V>) {
  const { options, onValueChange } = props;
  const pick = (next: string) => {
    const picked = options.find((option) => option.value === next);
    if (picked) onValueChange(picked.value);
  };
  return (
    <Suspense fallback={<Waits {...props} />}>
      <Loaded {...props} onValueChange={pick} />
    </Suspense>
  );
}
