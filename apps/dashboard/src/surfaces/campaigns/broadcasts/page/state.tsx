/**
 * The hooks the broadcasts page calls, each holding one concern (moved from legacy/pages/broadcasts.jsx, decision
 * 0015): what can be offered, who a send goes to, the words of the send, the clock, a link's landing, and the yes.
 * BroadcastsReal calls them in the order it always has.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../../../legacy-verbs";
import { tabDraft } from "../../../legacy-parts";
import type { AudienceOption, BroadcastTemplate, BroadcastsSurface } from "../surface";
import { starters } from "../../templates/verbs";
import { BC_NONE } from "../run";
import type { BcKept, Params, Setter, Sources } from "./types";
import { bcKey, bcOrder, bcSlots } from "./words";

/** A row as `sendable` reads it: with the components Meta holds, which `TemplateDto` does not name. */
type Sendable = BroadcastTemplate & { components?: unknown };

// What can be offered: every template this product can put on the wire, in the library's order, and of those the
// ones whose every slot a broadcast can fill.
export function useBcOffered(data: BroadcastsSurface) {
  // Only what this product can actually put on the wire. `sendTemplate` sends the
  // body alone, so a template needing a value in a heading or a button is refused
  // by Meta for EVERY recipient -- and the composer used to offer it, pass its own
  // "every slot filled" check, and enrol them all.
  const offered = useMemo(() => {
    const rows: Sendable[] = data.templates || BC_NONE;
    return starters.sendable(rows.slice().sort(bcOrder));
  }, [data.templates]);
  // And of those, only one whose every slot a broadcast can fill (bcSlots). The visit's reminder is a visit
  // playbook's: offered here, its time and service were typed once for everyone.
  const link = !!data.bookingLink;
  const templates = useMemo(() => offered.sendable.filter((t) => bcSlots(t, link) !== null), [offered, link]);
  return { offered, link, templates };
}

// Who a send goes to, and whether the send screen is open: the send the tab kept, and the list a link names.
export function useBcList(initialSegment: string | null, audiences: AudienceOption[]) {
  // A send half-written when the page was left: the tab kept it (useUnsavedWork), and the screen opens again on it,
  // with its list, its message and its words -- unless a link names a list, which wins the list.
  // What the tab kept is what `useUnsavedWork` was given as its value (BroadcastsReal), so it has that shape.
  const [kept] = useState(() => tabDraft("broadcast") as BcKept | null);
  const [aud, setAud] = useState(() => {
    const first =
      audiences.find((a) => (a.kind === "saved" || a.kind === "list") && a.id === initialSegment) || audiences[0];
    if (!initialSegment && kept && audiences.some((a) => bcKey(a) === kept.aud)) return kept.aud;
    return first ? bcKey(first) : "everyone:";
  });
  // The composer is its own screen, opened by New broadcast -- and by a link that
  // names a list ("Broadcast to this list" on People), which is asking to write one.
  const [writing, setWriting] = useState(!!initialSegment || !!kept);
  // The shell keeps this page mounted across its own links, so it follows them: a later link to a list picks that
  // list, and a link to a run, which names no list, leaves the audience where it was. Only a new link moves it: the
  // surface re-reading its audiences does not undo a choice made on the page.
  const followed = useRef(initialSegment);
  useEffect(() => {
    if (followed.current === initialSegment) return;
    followed.current = initialSegment;
    const next =
      initialSegment && audiences.find((a) => (a.kind === "saved" || a.kind === "list") && a.id === initialSegment);
    if (next) setAud(bcKey(next));
    if (initialSegment) setWriting(true);
  }, [initialSegment, audiences]);
  return { kept, aud, setAud, writing, setWriting };
}

// The words of the send, kept or fresh: the values typed into its slots and what fills each, the template it writes
// here, its name, its time, and whether it is on its way.
export function useBcWords(kept: BcKept | null) {
  const [params, setParams] = useState<Params>((kept && kept.params) || {});
  const [sources, setSources] = useState<Sources>((kept && kept.sources) || {});
  // A template half-written inside the send is kept under its own kind, and opens again with the send.
  const [composing, setComposing] = useState(() => !!(kept && tabDraft("template", "new")));
  const [name, setName] = useState((kept && kept.name) || "");
  const [whenAt, setWhenAt] = useState<number | null>(
    kept && kept.whenAt !== null && kept.whenAt !== undefined ? kept.whenAt : null,
  );
  const [busy, setBusy] = useState(false);
  // The words of the send -- a name, a value typed into a slot, a time picked -- are what is kept and what Cancel asks
  // about; the list and the message are choices, and a choice alone keeps nothing. Sent, or thrown away, they clear.
  const wrote =
    !!name.trim() ||
    whenAt !== null ||
    Object.values(params).some((w) => (w || []).some((v) => String(v || "").trim()));
  const clearWords = () => {
    setName("");
    setWhenAt(null);
    setParams({});
    setSources({});
  };
  return {
    params,
    setParams,
    sources,
    setSources,
    composing,
    setComposing,
    name,
    setName,
    whenAt,
    setWhenAt,
    busy,
    setBusy,
    wrote,
    clearWords,
  };
}

// Now, for the minutes until a run goes: ticking only while a run is under an hour away.
export function useBcNow(data: BroadcastsSurface) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const at = Date.now();
    const soon = (data.rows || []).some(
      (r) =>
        r.state === "scheduled" &&
        r.scheduled_for &&
        Date.parse(r.scheduled_for) > at &&
        Date.parse(r.scheduled_for) - at < 3_600_000,
    );
    if (!soon) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [data.rows]);
  return now;
}

// A link lands on its run: its report brought into view when the page it replaced was scrolled past where it opens.
export function useBcRunLanding(openId: string | null) {
  useEffect(() => {
    const el =
      openId && typeof document !== "undefined" && document.getElementById
        ? document.getElementById(`bc-run-${openId}`)
        : null;
    if (!el || !el.getBoundingClientRect || !el.scrollIntoView) return;
    const at = el.getBoundingClientRect();
    if (at.top < 0 || at.top > window.innerHeight - 80) el.scrollIntoView({ block: "start" });
  }, [openId]);
}

// The yes: the section that gets it, open where the address or a press asks for it, and the send screen's door to it.
export function useBcYes(initialYes: boolean, data: BroadcastsSurface, setWriting: Setter<boolean>) {
  // broadcasts/get-yes: the section that answers "nobody has said yes to
  // offers", opened and brought into view -- it sits on the ledger under the runs,
  // folded to its one line, where a person sent here to find the QR would otherwise
  // have to scroll for it and open it.
  const [yesOpen, setYesOpen] = useState(!!initialYes);
  const showYes = () => {
    setYesOpen(true);
    const el = typeof document !== "undefined" && document.getElementById ? document.getElementById("bc-optin") : null;
    // Opened before it is brought into view: scrolled to while folded, the section is the page's last line, so the
    // scroll stops at the page's end and it then opens below the screen's foot, under a phone's tab bar (#663).
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the method named as a guard, as the JSX had it
    const fold = el && el.querySelector ? el.querySelector("details") : null;
    if (fold) fold.open = true;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
  };
  useEffect(() => {
    if (initialYes) showYes();
  }, [initialYes]);
  // The send screen's own door to it: the ledger drawn in the send's place, then
  // the section brought into view the same way. Counted, so that every press
  // lands, whether or not the address changes -- a send written from
  // broadcasts/get-yes keeps its address.
  const [yesAsked, setYesAsked] = useState(0);
  useEffect(() => {
    if (yesAsked) showYes();
  }, [yesAsked]);
  const toYes = () => {
    setWriting(false);
    setYesAsked((n) => n + 1);
    navigate(data.getYes);
  };
  // That door, in the sentence that says nobody has the yes: drawn when the
  // ledger draws the card, which takes a number to put in the QR. The sentence
  // pointed at "the phrase and QR below", and nothing is below the send.
  const yesDoor =
    data.optIn && data.optIn.link && data.getYes ? (
      <>
        , or{" "}
        <button type="button" className="bc-nobody-door" onClick={toYes} data-testid="bc-nobody-door">
          get their yes with the phrase and the QR
        </button>
      </>
    ) : null;
  return { yesOpen, setYesOpen, yesDoor };
}
