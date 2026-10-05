/**
 * The chooser under the line row (moved from legacy/pages/setup.jsx, decision 0015): a new number in an area code, the
 * number you have (forwarding arrives next), or bringing it over (we file the port). A line costs money, so only an owner
 * gets one.
 */
import { useState } from "react";
import { canDo, gate, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { setupVerbs, type LineChoice, type SetupSurface } from "../surface";

interface ChooserProps {
  S: SetupSurface;
  flash: (f: LegacyFlash) => void;
  onDone: () => void;
  onKeep: () => void;
}

/** A new number: the area code, the numbers free in it, and the one chosen with its Get this number. */
function newNumber(o: {
  area: string;
  setArea: (a: string) => void;
  find: () => void;
  busy: boolean;
  numbers: LineChoice[] | null;
  chosen: LineChoice | null;
  setChosen: (n: LineChoice) => void;
  buy: () => void;
}) {
  const { area, setArea, find, busy, numbers, chosen, setChosen, buy } = o;
  return (
    <div className="setup-new">
      <div className="setup-find">
        <label className="setup-find-label" htmlFor="setup-area">
          Area code
        </label>
        <input
          id="setup-area"
          className="setup-area"
          inputMode="numeric"
          maxLength={3}
          placeholder="305"
          value={area}
          onChange={(e) => setArea(e.target.value.replace(/\D/g, "").slice(0, 3))}
          onKeyDown={(e) => {
            if (e.key === "Enter") find();
          }}
          data-testid="setup-area"
        />
        <button
          className="btn btn-sm"
          onClick={find}
          disabled={busy}
          data-testid="setup-find"
          {...gate("team", "find a number")}
        >
          {busy && !chosen ? "Looking…" : "Find numbers"}
        </button>
      </div>
      {numbers && numbers.length > 0 && (
        <div className="setup-numbers" data-testid="setup-numbers">
          {numbers.map((n) => (
            <button
              key={n.e164}
              className={"setup-number " + (chosen && chosen.e164 === n.e164 ? "active" : "")}
              onClick={() => setChosen(n)}
              data-testid="setup-number"
            >
              <span className="setup-number-num tabular">{n.friendly}</span>
              <span className="setup-number-where">{[n.locality, n.region].filter(Boolean).join(", ") || "Local"}</span>
            </button>
          ))}
        </div>
      )}
      {chosen && (
        <div className="setup-confirm" data-testid="setup-confirm">
          <span className="setup-confirm-text">
            <b className="tabular">{chosen.friendly}</b> · included in your plan · your receptionist answers it; texting
            arrives when the carriers register it
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={buy}
            disabled={busy}
            data-testid="setup-buy"
            {...gate("team", "get a line")}
          >
            {busy ? "Setting up…" : "Get this number"}
          </button>
        </div>
      )}
    </div>
  );
}

/** The three ways a number reaches the receptionist, the one picked pressed. */
function paths(path: string, setPath: (p: string) => void) {
  return (
    <div className="setup-paths">
      <button
        className={`setup-path ${path === "new" ? "active" : ""}`}
        onClick={() => setPath("new")}
        data-testid="setup-path-new"
      >
        <b>Get a new number</b>
        <span>
          A local number in your area code, included in your plan. Your receptionist answers it within a minute of
          choosing.
        </span>
      </button>
      <button
        className={`setup-path ${path === "keep" ? "active" : ""}`}
        onClick={() => setPath("keep")}
        data-testid="setup-path-keep"
      >
        <b>Keep my number</b>
        <span>
          Keep the number your customers know: forward the calls you don&rsquo;t answer to the receptionist. You keep
          your phone, your carrier and your texts.
        </span>
      </button>
      <button
        className={`setup-path ${path === "bring" ? "active" : ""}`}
        onClick={() => setPath("bring")}
        data-testid="setup-path-bring"
      >
        <b>Bring my number</b>
        <span>
          Move the number you have onto Chanlytics. The carriers take 7 to 14 business days; we file it for you.
        </span>
      </button>
    </div>
  );
}

export const LineChooser = ({ S, flash, onDone, onKeep }: ChooserProps) => {
  const [path, setPath] = useState("new");
  const [area, setArea] = useState("");
  const [numbers, setNumbers] = useState<LineChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<LineChoice | null>(null);
  const owner = canDo("team");
  const find = async () => {
    // Enter in the area code reaches this too, past the gated Find numbers, so it asks the same gate.
    if (!owner) return;
    if (!/^\d{3}$/.test(area)) {
      flash({ tone: "warn", msg: <>Three digits, like 305.</> });
      return;
    }
    setBusy(true);
    setChosen(null);
    const r = await setupVerbs.lines.search(area);
    setBusy(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message}</> });
      return;
    }
    setNumbers(r.numbers || []);
    if (!(r.numbers || []).length)
      flash({ tone: "info", msg: <>Nothing free in {area} right now — try a nearby area code.</> });
  };
  const buy = async () => {
    if (!owner) return;
    if (!chosen) return;
    setBusy(true);
    const r = await setupVerbs.lines.buy(chosen.e164, area);
    setBusy(false);
    if (!r.ok && r.message) {
      flash(refusalToast(r, "No line bought"));
      return;
    }
    // Bought, then stopped part-way: the number is ours and a person has it -- a warning, not good news.
    flash({
      tone: r.ok ? "ok" : "warn",
      msg: r.ok ? (
        r.queued ? (
          <>{chosen.friendly} is yours — setting it up now, usually a minute or two. This page updates by itself.</>
        ) : (
          <>{chosen.friendly} is yours — the receptionist answers it. Call it from your phone.</>
        )
      ) : (
        <>Setting up {chosen.friendly} stopped part-way — a person at Chanlytics has it, and Retry is on the row.</>
      ),
    });
    onDone();
  };
  // Bringing the number you have is its own ask (S14): it filed a line request, and the row then said "set up your line".
  const askToBring = async () => {
    if (!canDo("approve")) return;
    const r = await setupVerbs.request("port");
    flash(
      r.ok
        ? {
            msg: r.already ? (
              <>Already asked — a person at Chanlytics has it.</>
            ) : (
              <>We got it — a person at Chanlytics will move your number with you and reach you by email.</>
            ),
          }
        : refusalToast(r, "Request not sent"),
    );
    onDone();
  };
  const voice = S.dto.channels.voice;
  return (
    <section className="setup-chooser" data-testid="setup-chooser">
      {paths(path, setPath)}
      {path === "new" ? (
        newNumber({ area, setArea, find: () => void find(), busy, numbers, chosen, setChosen, buy: () => void buy() })
      ) : path === "keep" ? (
        <div className="setup-ask">
          <span className="setup-ask-text">
            {voice.active
              ? `Your receptionist answers on ${S.vm.tryIt && S.vm.tryIt.voiceLabel ? S.vm.tryIt.voiceLabel : "its line"}. Forward the number you have to it from the row "The number you already have" below.`
              : "First, a line for the receptionist to answer on — get a new number here. Then forward the number you have to it from the row below."}
          </span>
          {voice.active && (
            <button
              className="btn btn-sm"
              onClick={() => {
                onDone();
                onKeep();
              }}
              data-testid="setup-keep-go"
            >
              Set up forwarding
            </button>
          )}
        </div>
      ) : (
        <div className="setup-ask">
          <span className="setup-ask-text">
            A person at Chanlytics files the move with your carrier. Ask, and we reach you by email for what your
            carrier needs.
          </span>
          <button
            className="btn btn-sm"
            onClick={askToBring}
            data-testid="setup-ask-us"
            {...gate("approve", "ask to bring your number")}
          >
            Ask us
          </button>
        </div>
      )}
    </section>
  );
};
