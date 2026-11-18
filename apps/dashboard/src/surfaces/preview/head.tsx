"use client";

/**
 * A lead's own preview, its head (decision 0079; the redesign of 17 November 2026): Make it mine at the top; the
 * business as itself, its mark or its photo in a circle with AI's three beside it, its name, what this is, and the one
 * filled act before anything is tried: Call it. Under it, what it knows, each fact with where it was read, and one it
 * lacks where the listing never had it. Every word is contracts' (previews/words.ts).
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
import type { Call } from "./use-call";

/** The glyph each fact wears. */
const FACT_GLYPH: Record<PreviewKnowsRowVM["key"], string> = {
  hours: "clock",
  address: "place",
  phone: "phone",
  website: "globe",
  services: "list",
};

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
      <p className="pv-quiet" role="status" data-testid="pv-call-left">
        {W.callUsed}
      </p>
    );
  if (!canCall)
    return (
      <p className="pv-quiet" role="status" data-testid="pv-call-nomic">
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
        <Icon name="phone" size={16} />
        {W.callStart}
      </Button>
      {call.trouble ? (
        <p className="pv-quiet" role="alert" data-testid="pv-call-trouble">
          {call.trouble}
        </p>
      ) : (
        <p className="pv-quiet">{W.micFirst}</p>
      )}
    </>
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
      <h1 className="pv-name">{vm.business}</h1>
      <p className="pv-by">{W.ready}</p>
      {look ? null : <PvCallIt call={call} canCall={canCall} leads={leads} />}
    </header>
  );
}

/** One fact, as a capsule: what it is, and where it was read; one it lacks says where it was looked for. */
function PvFact({ row, onOpen }: { row: PreviewKnowsRowVM; onOpen: () => void }) {
  return (
    <Button variant="soft" size="touch" className="pv-fact" onClick={onOpen} data-testid={`pv-fact-${row.key}`}>
      <Icon name={FACT_GLYPH[row.key]} size={16} />
      <span className="pv-fact-words">
        <b>{row.missing ? row.label : row.value}</b>
        <span data-missing={row.missing || undefined}>{row.from}</span>
      </span>
    </Button>
  );
}

/** What it knows, up front: its facts in one row, at most one it lacks among them, and the way to all of them. */
export function PvFacts({ rows, onOpen }: { rows: readonly PreviewKnowsRowVM[]; onOpen: () => void }) {
  if (!rows.length) return null;
  // What it does leads: the proof it read their business.
  const known = [
    ...rows.filter((row) => !row.missing && row.key === "services"),
    ...rows.filter((row) => !row.missing && row.key !== "services"),
  ];
  const lacks = rows.find((row) => row.missing);
  // The one it lacks stands second, where a phone's width still shows it.
  const shown = lacks ? [...known.slice(0, 1), lacks, ...known.slice(1)] : known;
  return (
    <section className="pv-facts" aria-label={W.knowsTitle} data-testid="pv-facts">
      <div className="pv-facts-head">
        <h2 className="pv-label">{W.knowsTitle}</h2>
        <Button variant="quiet" size="touch" onClick={onOpen} data-testid="pv-knows-open">
          {W.knowsAll}
          <Icon name="chevron" size={12} />
        </Button>
      </div>
      <div className="pv-facts-row">
        {shown.map((row) => (
          <PvFact key={row.key} row={row} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
