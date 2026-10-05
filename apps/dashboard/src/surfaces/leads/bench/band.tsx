/**
 * The three classes (§8.7), moved from legacy/pages/leads-bench.jsx (decision 0015). Qualified · Needs review · Excluded,
 * under the search that is open: each a count and a view (c-qualified, c-review, c-excluded). The class is not a stage
 * (§9.1): it says whether the place met the plan.
 *
 * The band (D5): one element that says the search's whole shape and filters it. The three classes with their counts are
 * the tabs -- a segmented control whose marker slides to the one that is open, over a hairline that is the same three
 * counts as lengths, so the shape of the search reads at a glance without a fourth number. The qualified split by fit band
 * draws once Qualified is open and the fits differ (contracts leadBand): a fit narrows the rows on screen the way an
 * Excluded chip does. The words are contracts' labels; the count is drawn apart from them only so it can sit in tabular
 * figures.
 */
import { useEffect, useRef } from "react";
import type { LeadBand as LeadBandVM, LeadClass } from "@chanlytics/contracts";

const LEAD_BAND_TONE: Record<LeadClass, string> = { qualified: "ok", review: "warn", excluded: "plain" };

const ldBandWords = (c: { label: string; count: number }) => String(c.label).replace(new RegExp(`^${c.count}\\s+`), "");

type Fit = LeadBandVM["fits"][number]["id"];

export const LeadBand = ({
  band,
  cls,
  onPick,
  fit,
  onPickFit,
}: {
  band: LeadBandVM;
  cls: LeadClass | null;
  onPick: (cls: LeadClass | null) => void;
  fit: Fit | null;
  onPickFit: (fit: Fit | null) => void;
}) => {
  const tabs = useRef<HTMLDivElement>(null);
  // The marker is measured, not guessed: the open tab's own box, written as two custom properties the stylesheet
  // animates. Nothing re-renders for it.
  const counts = band.classes.map((c) => c.count).join(",");
  useEffect(() => {
    const el = tabs.current;
    if (!el || !("querySelector" in el)) return undefined;
    const place = () => {
      const on = el.querySelector<HTMLElement>(".ld-class.on");
      el.style.setProperty("--mark-x", `${on ? on.offsetLeft : 0}px`);
      el.style.setProperty("--mark-w", `${on ? on.offsetWidth : 0}px`);
      el.classList.toggle("has-mark", !!on);
    };
    place();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cls, counts]);
  const total = band.classes.reduce((n, c) => n + c.count, 0);
  return (
    <div className="ld-band" data-testid="lead-band">
      <div className="ld-band-tabs">
        <div
          className="ld-classes"
          ref={tabs}
          role="tablist"
          aria-label="What the search made of each place"
          data-testid="lead-classes"
        >
          <span className="ld-class-mark" aria-hidden="true" />
          {band.classes.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cls === c.id}
              className={`ld-class ${c.id} ${cls === c.id ? "on" : ""}`}
              onClick={() => onPick(cls === c.id ? null : c.id)}
              data-testid={`lead-class-${c.id}`}
            >
              <span className="n">{c.count}</span> <span className="w">{ldBandWords(c)}</span>
            </button>
          ))}
        </div>
        {total > 0 ? (
          <span className="ld-band-shape" aria-hidden="true">
            {band.classes
              .filter((c) => c.count > 0)
              .map((c) => (
                <span
                  key={c.id}
                  className={`seg tone-${LEAD_BAND_TONE[c.id]}${cls && cls !== c.id ? " dim" : ""}`}
                  style={{ flexGrow: c.count }}
                />
              ))}
          </span>
        ) : null}
      </div>
      {band.mixed && cls === "qualified" ? (
        <div className="ld-band-fits" role="group" aria-label="Qualified, by fit" data-testid="lead-band-fits">
          {band.fits
            .filter((f) => f.count > 0)
            .map((f) => (
              <button
                key={f.id}
                type="button"
                className={`ld-band-fit ${f.id}${fit === f.id ? " on" : ""}`}
                aria-pressed={fit === f.id}
                onClick={() => onPickFit(fit === f.id ? null : f.id)}
                data-testid={`lead-band-fit-${f.id}`}
              >
                <span className={`dot ${f.id}`} aria-hidden="true" />
                {f.label} <span className="count">{f.count}</span>
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
};
