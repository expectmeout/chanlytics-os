/**
 * Where it answers' calls tile (decision 0073, canvas 4, 4·a–4·d): keep the number customers call (recommended), a new
 * one picked in its area code, or move it here; for a number kept or moved, which calls it sends on and what its line
 * is, by the carrier's own records where this deployment can look (R11: "a Verizon mobile, we checked"), so Go live
 * shows the right code with no question asked. Nothing is bought: the choice is kept, and Go live buys.
 *
 * The parts are the phone's own (phone.tsx: the ways, the number box, a new number's pick); the choice is the page's,
 * kept in the tab (memory.ts) and saved to the member's view when the step goes on.
 */
import { useEffect, useRef, useState } from "react";
import {
  FIRST_RUN_HELPERS,
  areaCodeOf,
  normalizePhone,
  type FirstRunPhoneVM,
  type LineLookupDto,
  type PhoneCompany,
  type PhoneRings,
} from "@chanlytics/contracts";
import { RecordToggleGroup } from "../../../kit/record/field";
import type { LegacyFlash } from "../../../legacy-verbs";
import { setupVerbs, type LineChoice } from "../../surface";
import type { KeptPhoneChoice } from "../memory";
import { keptNumber, newNumber, phoneWays } from "../phone";
import type { PhoneActs } from "../phone-acts";

const PW = FIRST_RUN_HELPERS.phoneWords;
const CALLS = FIRST_RUN_HELPERS.channelsWords.calls;

/** How long the box rests before the number in it is looked up: a lookup is one carrier read, never one per key. */
const LOOKUP_REST_MS = 700;

/** The lookup's answer as the two answers Go live's code is chosen by. */
function callAnswersOf(l: LineLookupDto): { rings: PhoneRings | null; company: PhoneCompany | null } {
  if (l.type === "landline") return { rings: "landline", company: null };
  if (l.type === "voip") return { rings: "office", company: null };
  if (l.type === "mobile")
    return { rings: "mobile", company: l.carrier && l.carrier !== "office" ? l.carrier : "other" };
  return { rings: null, company: null };
}

/**
 * The number kept or moved, looked up once it rests in the box as a US number with its area code; its answer kept with
 * the choice. A deployment with no lookup answers null, and Go live asks the two questions instead, as it always did.
 */
function useLookup(o: {
  ph: FirstRunPhoneVM;
  c: KeptPhoneChoice;
  setChoice: (c: KeptPhoneChoice | null) => void;
}): LineLookupDto | null {
  const { ph, c, setChoice } = o;
  const [found, setFound] = useState<{ number: string; lookup: LineLookupDto } | null>(null);
  const asked = useRef<string | null>(null);
  // The choice as it stands when the lookup answers, and the keeper as it stands: the box may have moved on, and its
  // answer is kept with the latest.
  const latest = useRef(c);
  latest.current = c;
  const keep = useRef(setChoice);
  keep.current = setChoice;
  const number = ph.way !== "new" ? normalizePhone(ph.number) : null;
  const now = useRef(number);
  now.current = number;
  useEffect(() => {
    if (!number || !areaCodeOf(number) || asked.current === number) return undefined;
    const t = setTimeout(() => {
      asked.current = number;
      void setupVerbs.lines.lookup(number).then((l) => {
        if (!l || now.current !== number) return;
        setFound({ number, lookup: l });
        const a = callAnswersOf(l);
        if (a.rings) keep.current({ ...latest.current, rings: a.rings, company: a.company });
      });
    }, LOOKUP_REST_MS);
    return () => clearTimeout(t);
  }, [number]);
  return found && found.number === number ? found.lookup : null;
}

export function FrCalls(o: {
  ph: FirstRunPhoneVM;
  choice: KeptPhoneChoice | null;
  setChoice: (c: KeptPhoneChoice | null) => void;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
}) {
  const { ph, choice, setChoice, flash, go } = o;
  const [busy, setBusy] = useState(false);
  const [numbers, setNumbers] = useState<LineChoice[] | null>(null);
  const [area, setArea] = useState(ph.area || "");
  const [areaProblem, setAreaProblem] = useState<string | null>(null);
  const [boxLeft, setBoxLeft] = useState(false);
  const sent = useRef(false);
  const c: KeptPhoneChoice = choice || { way: ph.way, number: null, pick: null, pending: false };
  const change = (patch: Partial<KeptPhoneChoice>) => setChoice({ ...c, ...patch, pending: false, sent: false });
  const k: PhoneActs = {
    ph,
    c,
    setChoice,
    W: PW,
    flash,
    go,
    busy,
    setBusy,
    sent,
    area,
    setAreaProblem,
    setNumbers,
    setHelp: () => undefined,
  };
  const lookup = useLookup({ ph, c, setChoice });
  const said = lookup ? CALLS.lookup(lookup) : null;
  const listed = ph.number && ph.number === ph.listed;
  return (
    <section className="panel fr-pane fr-place" aria-labelledby="fr-calls-title" data-testid="fr-calls">
      <h2 className="fr-sub" id="fr-calls-title">
        {PW.calls}
      </h2>
      {phoneWays(ph, busy, change)}
      {ph.way === "new"
        ? newNumber({ W: PW, k, setArea, areaProblem, numbers, change })
        : keptNumber({ W: PW, ph, c, change, boxLeft, leftBox: () => setBoxLeft(true) })}
      {ph.way !== "new" && (said || listed) ? (
        <p className="fr-detail" data-testid="fr-calls-lookup">
          {[listed ? CALLS.keepListed : null, said].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {ph.way !== "new" ? (
        <RecordToggleGroup<"unanswered" | "always">
          id="fr-calls-mode"
          label={PW.calls}
          value={c.mode === "always" ? "always" : "unanswered"}
          options={[
            { value: "unanswered", label: PW.mode.unanswered, hint: CALLS.nobodyPicksUp },
            { value: "always", label: PW.mode.always, hint: CALLS.everyCall },
          ]}
          onChange={(m) => change({ mode: m === "always" ? "always" : null })}
          testid="fr-calls-mode"
        />
      ) : (
        <p className="fr-detail">{CALLS.newSays}</p>
      )}
      {ph.way === "move" ? <p className="fr-detail">{CALLS.moveSays}</p> : null}
      <p className="fr-quiet">{ph.way === "new" ? PW.newLater : PW.ownLater}</p>
    </section>
  );
}
