/**
 * What the ad brought, in Option B's block (MOCKUP): "Last 30 days", who got in touch and who booked, the four figures
 * across, the bar a day under its legend, and two quiet lines -- how fast the first reply came, and whose count this is
 * ("Counted by Chanlytics, not by Meta"), with the platform's own numbers one press away. In review nothing can have
 * happened: the figures are dashes and there are no bars. A cost under 5 booked is a dash that says "only 3"; "Too early
 * to judge" is Chanlytics' own reading, and its word opens what each platform says about it.
 */
import type { ReactNode } from "react";
import { LEDGER } from "@chanlytics/contracts/ads-page";
import type { AdDrawerVM, JudgeVM, TheirsVM, TypedVM } from "@chanlytics/contracts/ads-page";
import { Figure } from "../../../kit/figure/figure";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Popover } from "../../../kit/popover/popover";
import { Token } from "../../../kit/picker/picker";
import { routeDoor } from "../../../legacy-verbs";
import { AdDays } from "./days";

/** "Too early to judge. Most ads need…": its first words are the word that opens what the platform says. */
function JudgeLine({ line }: { line: JudgeVM }) {
  if (!line.sheet || !line.word) return <p className="ads-line">{line.rest}</p>;
  return (
    <p className="ads-line" data-testid="ads-judge">
      <Popover
        label={line.word}
        align="start"
        className="ads-theirs"
        trigger={<Token data-testid="ads-judge-word">{line.word}</Token>}
      >
        <p className="ads-theirs-text">{line.sheet}</p>
      </Popover>
      {line.rest}
    </p>
  );
}

/** A quiet door to a small list: its words and a chevron, opening the kit's popover. */
function QuietDoor({ label, testid, children }: { label: string; testid: string; children: ReactNode }) {
  return (
    <Popover
      label={label}
      align="start"
      className="ads-theirs"
      trigger={
        <LinkButton className="ads-door" data-testid={testid}>
          {label}
          <Icon name="chevron" size={11} />
        </LinkButton>
      }
    >
      {children}
    </Popover>
  );
}

/** The platform's own numbers, by name; a number it did not return says so. Never added to ours. */
function TheirsList({ theirs }: { theirs: TheirsVM }) {
  return (
    <QuietDoor label={theirs.door} testid="ads-theirs-door">
      <dl className="ads-theirs-list" data-testid="ads-theirs">
        {theirs.rows.map((row) => (
          <div key={row.label} className="ads-theirs-row" data-known={row.known ? "" : undefined}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="ads-theirs-text">{theirs.note}</p>
    </QuietDoor>
  );
}

/** What people typed on Google, as it groups them, and what is left out for the owner: read, never changed here. */
function TypedList({ typed }: { typed: TypedVM }) {
  return (
    <QuietDoor label={typed.door} testid="ads-typed-door">
      <ul className="ads-typed-list" data-testid="ads-typed">
        {typed.themes.map((theme) => (
          <li key={theme}>{theme}</li>
        ))}
      </ul>
      <p className="ads-theirs-text">{typed.note}</p>
      {typed.left ? (
        <>
          <p className="ads-opts-title">{typed.left.title}</p>
          <ul className="ads-typed-list" data-testid="ads-left-out">
            {typed.left.terms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
          <p className="ads-theirs-text">{typed.left.note}</p>
        </>
      ) : null}
    </QuietDoor>
  );
}

/** The quiet lines under the bars: how fast the first reply came, whose count this is, the platform's own numbers, what people typed. */
function QuietLines({ quiet }: { quiet: AdDrawerVM["quiet"] }) {
  const { reply, replyGrey, provenance, theirs, typed, extra } = quiet;
  return (
    <div className="ads-quiet" data-testid="ads-quiet">
      {reply ? (
        <p className="ads-line" data-grey={replyGrey ? "" : undefined}>
          {reply}
        </p>
      ) : null}
      <p className="ads-line">
        {provenance} {theirs ? <TheirsList theirs={theirs} /> : null}
      </p>
      {extra || typed ? (
        <p className="ads-line">
          {extra} {typed ? <TypedList typed={typed} /> : null}
        </p>
      ) : null}
    </div>
  );
}

export function AdResults({ vm }: { vm: AdDrawerVM }) {
  const { results, bars, quiet, door } = vm;
  // Nothing is counted for an ad the platform has not approved: its count is empty and its days are all before it.
  const started = results.count !== "";
  return (
    <section className="ads-results" aria-label={results.header} data-testid="ads-results">
      <div className="ads-results-head">
        <h3 className="ads-h">{results.header}</h3>
        {started ? <span className="ads-count">{results.count}</span> : null}
        {results.all ? (
          <LinkButton className="ads-all" {...routeDoor(results.all.to)} data-testid="ads-results-all">
            {results.all.words}
            <Icon name="chevron" size={11} />
          </LinkButton>
        ) : null}
      </div>
      <dl className="ads-facts" data-testid="ads-facts">
        {results.facts.map((f) => (
          <Figure
            key={f.id}
            id={f.id}
            label={f.label}
            value={f.value}
            change={f.change}
            meta={f.meta}
            definition={f.definition}
            n={f.n}
            minN={f.minN}
            className="ads-fact"
            data-testid={`ads-fact-${f.id}`}
          />
        ))}
      </dl>
      {results.line ? <JudgeLine line={results.line} /> : null}
      {started ? (
        <AdDays days={bars.days} legend={bars.legend} door={door} aria={bars.aria} todayNote={bars.todayNote} />
      ) : (
        <p className="ads-line">{LEDGER.notStarted}</p>
      )}
      <QuietLines quiet={quiet} />
    </section>
  );
}
