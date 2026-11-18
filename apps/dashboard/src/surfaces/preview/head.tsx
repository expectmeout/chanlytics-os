"use client";

/**
 * A lead's own preview, its head (decision 0079; the redesign of 17 November 2026, drawn as its canvas draws it): Make
 * it mine at the top; the business as itself, its mark or its photo in a circle with AI's three on a disc at its foot,
 * its name, what this is, and the one filled act before anything is tried: Call it. Under it, what it knows, each fact
 * with where it was read, and one it lacks, in amber, where the listing never had it: on a phone a row of capsules that
 * slides, each opening What it knows whole; on a desk the facts down their card, each put right in place (knows.tsx).
 * Every word is contracts' (previews/words.ts).
 */
import {
  LEAD_PREVIEW_WORDS as W,
  previewMinePath,
  type PreviewKnowsRowVM,
  type PreviewPageVM,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Face } from "../kit/face/face";
import { Icon } from "../kit/icon/icon";
import { StatePill } from "../kit/pill/state-pill";
import type { Call } from "./use-call";

/** The glyph each fact wears. */
const FACT_GLYPH: Record<PreviewKnowsRowVM["key"], string> = {
  hours: "clock",
  address: "place",
  phone: "phone",
  website: "globe",
  services: "list",
};

/** The glyph of Call it, a step over a press's own beside its larger words. */
const CALL_GLYPH_PX = 19;
/** A name past this many letters takes a smaller step, so it stands on two lines of a phone, not three. */
const LONG_NAME_CHARS = 28;

/** AI's mark, as every screen draws it: the three, in the accent only while it works. */
export function PvThree({ live = false, size = 13 }: { live?: boolean; size?: number }) {
  return (
    <span className="pv-three" data-live={live || undefined} aria-hidden="true">
      <Icon name="three" size={size} />
    </span>
  );
}

/** Their face, from what the page has of them: their mark, else their photo, else their initials. */
export function PvFace({ vm, size }: { vm: PreviewPageVM; size: "sm" | "lg" | "xl" }) {
  const picture = vm.logo_url ?? vm.photo;
  return <Face person={{ name: vm.business }} size={size} {...(picture ? { photo: picture } : {})} />;
}

/**
 * The bar that stays at the top, on the page's own ground: whose page it is, once the conversation has started and the
 * head has scrolled away; and Make it mine, quiet glass until they have tried it, then the page's filled act.
 */
export function PvTop({
  vm,
  token,
  leads,
  started,
}: {
  vm: PreviewPageVM;
  token: string;
  leads: boolean;
  started: boolean;
}) {
  return (
    <div className="pv-top">
      {started ? (
        <span className="pv-top-who">
          <PvFace vm={vm} size="sm" />
          <b>{vm.business}</b>
        </span>
      ) : (
        <span />
      )}
      <Button
        variant={leads ? "primary" : "glass"}
        size="touch"
        href={previewMinePath(token)}
        data-testid="pv-mine"
        data-leads={leads || undefined}
      >
        {W.mine}
      </Button>
    </div>
  );
}

/** Call it, and what stands under it: the microphone's line, why no call can be made, or what the last one ran into. */
function PvCallIt({ call, canCall, leads }: { call: Call; canCall: boolean; leads: boolean }) {
  if (call.used)
    return (
      <p className="pv-made" role="status" data-testid="pv-call-left">
        {W.callUsed}
      </p>
    );
  if (!canCall)
    return (
      <p className="pv-made" role="status" data-testid="pv-call-nomic">
        {W.noMic}
      </p>
    );
  return (
    <>
      <Button
        variant={leads ? "outline" : "primary"}
        size="touch"
        className="pv-go"
        onClick={() => void call.start()}
        data-testid="pv-call-start"
      >
        <Icon name="phone" size={CALL_GLYPH_PX} />
        {W.callStart}
      </Button>
      {call.trouble ? (
        <p className="pv-made" role="alert" data-testid="pv-call-trouble">
          {call.trouble}
        </p>
      ) : (
        <p className="pv-made">{W.micFirst}</p>
      )}
    </>
  );
}

/** A part of what they did, as a sentence starts: "A call of a minute". */
const asStart = (words: string): string => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

/** On its sender's look, under their name: that they tried it, each part of what they did, and what they told it. */
function PvTried({ vm }: { vm: PreviewPageVM }) {
  if (!vm.tried.length && !vm.taught.length) return null;
  return (
    <p className="pv-tried" data-testid="pv-tried">
      <StatePill kind="tone" value="ok" label={W.lookTried} lit />
      {vm.tried.map((part) => (
        <span key={part} className="pv-stat">
          {asStart(part)}
        </span>
      ))}
      {vm.taught.length ? <span className="pv-stat">{W.lookTaught(vm.taught.length)}</span> : null}
    </p>
  );
}

/** The business on top, so it reads as theirs. */
export function PvHead({
  vm,
  call,
  canCall,
  leads,
  look,
}: {
  vm: PreviewPageVM;
  call: Call;
  canCall: boolean;
  leads: boolean;
  look: boolean;
}) {
  return (
    <header className="pv-head">
      {vm.photo ? <img className="pv-light" src={vm.photo} alt="" referrerPolicy="no-referrer" /> : null}
      <span className="pv-who">
        <PvFace vm={vm} size="xl" />
        <PvThree />
      </span>
      <h1 className="pv-name" data-long={vm.business.length > LONG_NAME_CHARS || undefined}>
        {vm.business}
      </h1>
      {look ? <PvTried vm={vm} /> : <p className="pv-ready">{W.ready}</p>}
      {look ? null : <PvCallIt call={call} canCall={canCall} leads={leads} />}
    </header>
  );
}

/** A fact's glyph, on its own small tile. */
function PvFactGlyph({ fact }: { fact: PreviewKnowsRowVM["key"] }) {
  return (
    <span className="pv-glyph" aria-hidden="true">
      <Icon name={FACT_GLYPH[fact]} size={18} />
    </span>
  );
}

/** One fact, as a capsule: its glyph on a tile, what it is, and where it was read; one it lacks, in amber. */
function PvFact({ row, onOpen }: { row: PreviewKnowsRowVM; onOpen: (() => void) | null }) {
  const words = (
    <>
      <PvFactGlyph fact={row.key} />
      <span className="pv-fact-words">
        <b>{row.missing ? row.label : (row.short ?? row.value)}</b>
        <span>{row.from}</span>
      </span>
    </>
  );
  // Its sender looking presses nothing: the facts are said, not offered.
  if (!onOpen)
    return (
      <span className="pv-fact" data-missing={row.missing || undefined} data-testid={`pv-fact-${row.key}`}>
        {words}
      </span>
    );
  return (
    <Button
      size="touch"
      className="pv-fact"
      onClick={onOpen}
      data-missing={row.missing || undefined}
      data-testid={`pv-fact-${row.key}`}
    >
      {words}
    </Button>
  );
}

/** What it does leads, the proof it read their business; the one it lacks stands second, where a phone's width shows it. */
function factsInOrder(rows: readonly PreviewKnowsRowVM[]): PreviewKnowsRowVM[] {
  const known = [
    ...rows.filter((row) => !row.missing && row.key === "services"),
    ...rows.filter((row) => !row.missing && row.key !== "services"),
  ];
  const lacks = rows.find((row) => row.missing);
  return lacks ? [...known.slice(0, 1), lacks, ...known.slice(1)] : known;
}

/**
 * What it knows, up front on a phone: its facts in one row that slides, at most one it lacks among them, and the way to
 * all of them. Its sender looking sees them, with nothing to press.
 */
export function PvFacts({ rows, onOpen }: { rows: readonly PreviewKnowsRowVM[]; onOpen: (() => void) | null }) {
  if (!rows.length) return null;
  return (
    <section className="pv-facts" aria-label={W.knowsTitle} data-testid="pv-facts">
      <div className="pv-facts-head">
        <h2 className="pv-label">{W.knowsTitle}</h2>
        {onOpen ? (
          <Button variant="quiet" size="touch" onClick={onOpen} data-testid="pv-knows-open">
            {W.knowsAll}
            <Icon name="chevron" size={12} />
          </Button>
        ) : null}
      </div>
      <div className="pv-facts-row">
        {factsInOrder(rows).map((row) => (
          <PvFact key={row.key} row={row} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
