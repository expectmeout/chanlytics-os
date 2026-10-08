/**
 * Keep the number you have (moved from legacy/pages/setup.jsx, decision 0015): the carrier's code to dial on the phone
 * that has it, then a test window -- a call to the kept number that reaches the receptionist inside it marks the row
 * verified, and the page repaints.
 *
 * The form is the kit's look all the way through (Ruben, 7 Oct 2026: it stood on a black panel, in boxes and chips of
 * its own): the number is a field, the carrier a select of the five (two of the names are long, and as chips they
 * wrapped over two lines), which calls a choice of two on the kit's track, and its acts the kit's buttons. Two columns
 * where there is room, one on a phone (settings.css, .setup-fw-form), on the look's inset surface (.setup-chooser).
 *
 * It asks no phone to test from (Ruben, 8 Oct 2026). The field was optional, the first run never asked it, and no line
 * on production ever carried one; and a phone named could fail a test that worked, where a carrier or an office system
 * shows the kept number as the caller of a call it forwards. What proves a test is a call inside the window and, where
 * the carrier says so, its headers naming the kept number (contracts forwardingMatch, edge lib/voice/forwarding.ts).
 *
 * All of it is written in the kit's classes, and the file imports no part of the kit: a field is a label that holds
 * its box, the carrier the browser's own select in that box (drawn as the box in every engine, with the kit's chevron:
 * kit.css select.rec-input; its open list wears the theme: tokens.css color-scheme), the choice two radios with a radio
 * group's keys (modeChoice), the acts buttons as the rows beside it write them. Both Today (the workspace route) and
 * the first run's page load this file, so a module it imports moves to the chunk those two share, and the pages that
 * were sharing it download it again. Each of these was built and measured against main's own build (8 Oct 2026,
 * gzipped): the kit's Field, Select and Segmented added 71 KB to the route; fetched on demand instead, they split
 * again the chunks the pages share, about 540 bytes on each of Inbox, People, Templates and Sent; the house menu
 * copied a chunk for People, Campaigns, Templates and Sent, 13 to 20 KB each; and the record kit's own field, which
 * the first run's files import, left the route's chunk and People downloaded the record kit twice, 6.5 KB.
 */
import { useState, type KeyboardEvent } from "react";
import { isCarrier, isForwardingMode, type Carrier, type LineDto } from "@chanlytics/contracts";
import { canDo, gate, type LegacyFlash } from "../../legacy-verbs";
import { FORWARDING_WORDS, setupVerbs, type SetupSurface } from "../surface";

interface ForwardingProps {
  S: SetupSurface;
  flash: (f: LegacyFlash) => void;
  onDone: () => void;
}

type Forwarding = NonNullable<LineDto["forwarding"]>;
type Codes = ReturnType<typeof FORWARDING_WORDS.codes>;

/** The code to dial, the notes under it, and whether forwarding is proven, on its way to being, or yet to be tested. */
function codeCard(
  fw: LineDto,
  f: Forwarding & { carrier: Carrier },
  codes: Codes,
  o: { testing: boolean; busy: boolean; test: () => void },
) {
  const W = FORWARDING_WORDS;
  return (
    <div className="setup-fw-code" data-testid="setup-fw-code">
      <span className="setup-find-label">{W.dialLabel(f.carrier, W.display(fw.e164) ?? "")}</span>
      {/* For an office phone system the number to forward to is the receptionist line itself: drawn as words, never
          as a call to it, which a test window would take for proof that forwarding works. */}
      {f.carrier === "office" ? (
        <span className="setup-fw-dial tabular" data-testid="setup-fw-dial">
          {W.display(codes.on.code)}
        </span>
      ) : (
        <a className="setup-fw-dial tabular" href={codes.on.tel} data-testid="setup-fw-dial">
          {codes.on.code}
        </a>
      )}
      <ul className="setup-fw-notes">
        {codes.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      <div className="setup-fw-actions">
        {fw.forwarding_state === "verified" ? (
          <span className="setup-fw-ok">
            Verified {f.verified_at ? W.ago(f.verified_at) : ""}
            {codes.off.code ? (
              <>
                {" "}
                · to switch it off, dial <b className="tabular">{codes.off.code}</b>
              </>
            ) : null}
          </span>
        ) : o.testing ? (
          <span className="setup-fw-ok">
            The window is open — call {W.display(fw.e164)} from another phone. This page updates by itself.
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-sm"
            onClick={o.test}
            disabled={o.busy}
            data-testid="setup-fw-test"
            {...gate("team", "test forwarding")}
          >
            Test it
          </button>
        )}
        {fw.forwarding_state !== "verified" && codes.off.code && (
          <span className="setup-fw-off">
            Off again: <b className="tabular">{codes.off.code}</b>
          </span>
        )}
      </div>
    </div>
  );
}

/** The arrows that walk a radio group, and which way: the next option, or the one before. */
const MODE_STEPS: Partial<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Which calls: one of two on the kit's track, a radio group with a radio group's keys, as the kit's choice of a few has
 * them (kit/record/field.tsx RecordToggleGroup, which this file may not import: the header says why). One tab stop,
 * on the one chosen; an arrow chooses the other and takes the focus there, wrapping at either end; a press or Space
 * chooses. It said it was a radio group and gave each option a tab stop of its own, with no arrows (the review of 8
 * Oct 2026).
 */
function modeChoice(mode: string, setMode: (mode: string) => void) {
  const W = FORWARDING_WORDS;
  const at = W.modes.findIndex((m) => m === mode);
  const walkModes = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = MODE_STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    // `at()` takes the one before the first as the last, and the remainder takes the one after the last as the first.
    const next = W.modes.at((Math.max(0, at) + step) % W.modes.length);
    if (!next) return;
    setMode(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-testid="setup-fw-mode-${next}"]`)?.focus();
  };
  return (
    <div className="rec-field setup-fw-wide">
      <span className="rec-field-label">Which calls</span>
      {/* eslint-disable-next-line jsx-a11y-x/interactive-supports-focus -- the group is not a tab stop: its chosen option is, and the arrows walk it */}
      <div className="rec-seg" role="radiogroup" aria-label="Which calls" onKeyDown={walkModes}>
        {W.modes.map((m, i) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            tabIndex={mode === m || (at < 0 && i === 0) ? 0 : -1}
            className="rec-seg-btn"
            onClick={() => setMode(m)}
            data-testid={`setup-fw-mode-${m}`}
          >
            {W.modeWords[m] ?? m}
          </button>
        ))}
      </div>
    </div>
  );
}

export const ForwardingCard = ({ S, flash, onDone }: ForwardingProps) => {
  const W = FORWARDING_WORDS;
  const fw = ((S.dto.lines && S.dto.lines.rows) || []).find((l) => l.kind === "forwarded") || null;
  const f = fw && fw.forwarding ? fw.forwarding : null;
  const dest = S.dto.channels.voice.active ? S.dto.channels.voice.number : null;
  const [number, setNumber] = useState(fw && fw.e164 ? fw.e164 : "");
  const [carrier, setCarrier] = useState(f && f.carrier ? f.carrier : "verizon");
  const [mode, setMode] = useState(f && f.mode ? f.mode : "unanswered");
  const [busy, setBusy] = useState(false);
  const owner = canDo("team");
  const save = async () => {
    if (!owner) return;
    setBusy(true);
    const r = await setupVerbs.forwarding.set({ number, carrier, mode });
    setBusy(false);
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        carrier === "office" ? (
          <>Saved. Forward {number} in the settings of your phone system, then test it.</>
        ) : (
          <>Saved. Dial the code on the phone with {number}, then test it.</>
        )
      ) : (
        <>{r.message}</>
      ),
    });
  };
  const test = async () => {
    if (!owner || !fw) return;
    setBusy(true);
    const r = await setupVerbs.forwarding.test(fw.id);
    setBusy(false);
    flash({
      tone: r.ok ? "ok" : "danger",
      msg: r.ok ? (
        <>The window is open for 30 minutes — call {W.display(fw.e164)} from another phone.</>
      ) : (
        <>{r.message}</>
      ),
    });
  };
  // The line holds the carrier and the mode the door took, each one of contracts' sets.
  const to = f ? f.destination_e164 || dest : null;
  const codes = f && to && isCarrier(f.carrier) && isForwardingMode(f.mode) ? W.codes(f.carrier, f.mode, to) : null;
  const testing = !!(f && W.testOpen(f));
  return (
    <section className="setup-chooser setup-fw" data-testid="setup-forwarding">
      {!dest && (
        <p className="setup-fw-note">Your receptionist needs a line first — get a new number from the row above.</p>
      )}
      <div className="setup-fw-form">
        <div className="rec-field">
          <label>
            <span className="rec-field-label">The number you keep</span>
            <input
              className="rec-input"
              type="tel"
              inputMode="tel"
              placeholder="(305) 555-0100"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              data-testid="setup-fw-number"
            />
          </label>
        </div>
        {/* One of five: the browser's own select (a phone draws its picker), in the kit's box, named by its label. */}
        <div className="rec-field">
          <label>
            <span className="rec-field-label">Carrier</span>
            <select
              className="rec-input"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              data-testid="setup-fw-carrier"
            >
              {W.carriers.map((c) => (
                <option key={c} value={c}>
                  {W.carrierWords[c] ?? c}
                </option>
              ))}
            </select>
          </label>
        </div>
        {modeChoice(mode, setMode)}
        <div className="setup-fw-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void save()}
            disabled={busy || !dest}
            data-testid="setup-fw-save"
            {...gate("team", "set up forwarding")}
          >
            {fw ? "Save changes" : "Save and show the code"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onDone}>
            Close
          </button>
        </div>
      </div>
      {codes &&
        fw &&
        f &&
        isCarrier(f.carrier) &&
        codeCard(fw, { ...f, carrier: f.carrier }, codes, { testing, busy, test: () => void test() })}
    </section>
  );
};
