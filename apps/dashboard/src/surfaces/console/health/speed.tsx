/**
 * App speed, Health's tab (decision 0068; the back office's platform cards, moved as they were): how fast the pages are
 * by what people's own browsers measured (00255), where the pages' time goes (00412, decision 0053), and each
 * workspace's day as the nightly roll-up counted it (00277). Read with Health's own read, never the back office's
 * overview; a part that could not be read says so in its own card's sentence. Every word is the view model's (contracts
 * pageVitalsWords, pageSpeedWords, platformDaysWords).
 */
import type { Tone } from "@chanlytics/contracts";
import type { PlatformApi } from "@/legacy-bridge/platform";
import { ScreenSection } from "../parts";
import type { ConsoleHealth } from "../verbs";

type SpeedLine = { key: string; label: string; hint: string; tone?: Tone };

/** A card's lines, each a label and its words in the tone they are said in. */
function Lines({ lines, testid }: { lines: readonly SpeedLine[]; testid: string }) {
  if (!lines.length) return null;
  return (
    <div className="cl-attn-list" data-testid={testid}>
      {lines.map((l) => (
        <div className="set-row" key={l.key}>
          <div className="set-row-info">
            <span className="set-row-label">{l.label}</span>
            <span className="set-row-hint" data-tone={l.tone}>
              {l.hint}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** One card of lines: the speed cards' one shape. */
function SpeedCard({
  title,
  sentence,
  lines,
  testid,
}: {
  title: string;
  sentence: string;
  lines: readonly SpeedLine[];
  testid: string;
}) {
  return (
    <ScreenSection title={title} sub={<span data-testid={`${testid}-words`}>{sentence}</span>} testid={testid}>
      <Lines lines={lines} testid={`${testid}-lines`} />
    </ScreenSection>
  );
}

/** How fast the pages are: the 75th percentile of each of the browser's five, over every page, then the slowest pages. */
function VitalsCard({ P, rows }: { P: PlatformApi; rows: ConsoleHealth["vitals"] }) {
  const pace = P.vitalsWords(rows);
  return (
    <ScreenSection
      title="How fast the pages are"
      sub={<span data-testid="platform-vitals-words">{pace.sentence}</span>}
      testid="platform-vitals"
    >
      <Lines
        lines={pace.lines.map((l) => ({ key: l.metric, label: l.label, hint: l.hint, tone: l.tone }))}
        testid="platform-vitals-lines"
      />
      <Lines
        lines={pace.pages.map((pg) => ({ key: pg.page, label: pg.page, hint: pg.hint }))}
        testid="platform-vitals-pages"
      />
    </ScreenSection>
  );
}

/** Where the pages' time goes: each page by how it opens, the parts drawn last, and what a person waits on. */
function SpeedCards({ P, speed }: { P: PlatformApi; speed: ConsoleHealth["speed"] }) {
  const where = P.speedWords(speed);
  const spots = [...where.taps, ...where.paints, ...where.shifts];
  return (
    <>
      <SpeedCard
        title="Where the pages' time goes"
        sentence={where.sentence}
        lines={where.pages.map((p) => ({ key: p.page, label: `${p.label} · ${p.value}`, hint: p.hint, tone: p.tone }))}
        testid="platform-speed"
      />
      {where.parts.length > 0 && (
        <SpeedCard
          title="Drawn last"
          sentence={where.partsSentence}
          lines={where.parts}
          testid="platform-speed-parts"
        />
      )}
      {spots.length > 0 && (
        <SpeedCard
          title="What a person waits on"
          sentence={where.spotsSentence}
          lines={spots}
          testid="platform-speed-spots"
        />
      )}
      {where.deferred.length > 0 && (
        <SpeedCard
          title="Steps waiting on their numbers"
          sentence={where.deferredSentence}
          lines={where.deferred.map((d) => ({ ...d, label: `${d.label} · ${d.value}` }))}
          testid="platform-speed-deferred"
        />
      )}
    </>
  );
}

/** Each workspace's day: the newest day the roll-up counted, a line per workspace, those that answered nobody first. */
function DaysCard({ P, rows }: { P: PlatformApi; rows: ConsoleHealth["day_rows"] }) {
  const work = P.daysWords(rows);
  return (
    <SpeedCard
      title="Each workspace's day"
      sentence={work.sentence}
      lines={work.lines.map((l) => ({
        key: l.tenantId,
        label: l.name,
        hint: [l.answers, l.receptionist, l.failures, l.spine].filter(Boolean).join(" · "),
        tone: l.tone,
      }))}
      testid="platform-days"
    />
  );
}

export function SpeedTab({ P, h }: { P: PlatformApi; h: Pick<ConsoleHealth, "vitals" | "speed" | "day_rows"> }) {
  return (
    <>
      <VitalsCard P={P} rows={h.vitals} />
      <SpeedCards P={P} speed={h.speed} />
      <DaysCard P={P} rows={h.day_rows} />
    </>
  );
}
