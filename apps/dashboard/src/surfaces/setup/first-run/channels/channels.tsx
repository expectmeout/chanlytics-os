/**
 * Where it answers (decision 0073, canvas 4, 4·a–4·k): the first run's fourth step, choices only. Calls (calls.tsx),
 * WhatsApp (on the number customers call keeping the app, on its own number, or later), bookings (the tool found, its
 * calendar link, its clients' file, or how people book without one), and the owner's own mailbox (Gmail or Outlook, or
 * "Coming soon" until a provider can connect); beside them, the dashboard filling in as each connection's history comes
 * in. Nothing is bought: the onward saves the choices to the member's view (the number, how its calls go, what rings,
 * WhatsApp; with no number to choose, that the member went on) and Go live spends. Every word is contracts' (first-run-channels.ts).
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  FIRST_RUN_HELPERS,
  KEEP_ROW,
  feedUrlOk,
  type FirstRunChannelsVM,
  type FirstRunPhoneVM,
  type ImportLineVM,
  type MailboxHistory,
  type SetupPhoneWant,
  type WhatsappChoice,
} from "@chanlytics/contracts";
import { RecordField, RecordToggleGroup } from "../../../kit/record/field";
import { canDo, gate, refusalToast, type LegacyFlash } from "../../../legacy-verbs";
import { connectedMailboxes } from "../../../settings/connections/connected-mailboxes";
import { HistoryChoice } from "../../../settings/connections/history-choice";
import { businessTabSave } from "../../shell";
import { setupVerbs } from "../../surface";
import type { KeptPhoneChoice } from "../memory";
import { FrBringing, FrFilling } from "./brought";
import { FrCalls } from "./calls";
import { FrClients } from "./clients";
import { W } from "../words";

const CW = FIRST_RUN_HELPERS.channelsWords;

/** The number chosen, as the member's view keeps it; null while the choice cannot be kept. */
function wantOf(ph: FirstRunPhoneVM, c: KeptPhoneChoice | null): SetupPhoneWant | null {
  if (ph.held) return null;
  if (ph.way === "new") return c?.pick ? { way: "new", number: c.pick.e164 } : null;
  if (!ph.number) return null;
  return {
    way: ph.way,
    number: ph.number,
    ...(c?.mode === "always" ? { mode: "always" as const } : {}),
    ...(c?.rings ? { rings: c.rings } : {}),
    ...(c?.company ? { company: c.company } : {}),
  };
}

/** WhatsApp's tile: connected, or "is it on WhatsApp Business?" and the three ways it can answer, each kept as picked. */
function WhatsappTile({ wa, flash }: { wa: FirstRunChannelsVM["whatsapp"]; flash: (f: LegacyFlash) => void }) {
  const [onIt, setOnIt] = useState<boolean | null>(wa.question?.value ?? null);
  const pick = async (choice: WhatsappChoice) => {
    const r = await setupVerbs.choose({ whatsapp: choice });
    if (!r.ok) flash(refusalToast(r, W.find.notSaved));
  };
  if (wa.connected)
    return (
      <section className="panel fr-pane fr-place" data-testid="fr-whatsapp">
        <h2 className="fr-sub">{wa.title}</h2>
        <p className="fr-sentence">{wa.connected}</p>
      </section>
    );
  const q = wa.question;
  return (
    <section className="panel fr-pane fr-place" aria-labelledby="fr-whatsapp-title" data-testid="fr-whatsapp">
      <h2 className="fr-sub" id="fr-whatsapp-title">
        {wa.title}
      </h2>
      {q ? (
        <span className="fr-label" id="fr-whatsapp-on-label">
          {q.label}
        </span>
      ) : null}
      {q ? (
        <RecordToggleGroup<"yes" | "no">
          id="fr-whatsapp-on"
          labelledBy="fr-whatsapp-on-label"
          value={onIt === null ? null : onIt ? "yes" : "no"}
          options={[
            { value: "yes", label: q.yes },
            { value: "no", label: q.notYet },
          ]}
          onChange={(v) => {
            setOnIt(v === "yes");
            if (v === "no" && wa.value === "same") void pick("own");
          }}
          testid="fr-whatsapp-on"
        />
      ) : null}
      <div className="fr-stack">
        <RecordToggleGroup<WhatsappChoice>
          id="fr-whatsapp-way"
          label={wa.title}
          value={wa.value}
          options={wa.options
            .filter((o) => o.key !== "same" || onIt !== false)
            .map((o) => ({ value: o.key, label: o.label, hint: o.says }))}
          onChange={(v) => void pick(v)}
          gate={gate("settings", "choose where WhatsApp answers")}
          testid="fr-whatsapp-way"
        />
      </div>
      {wa.after ? <p className="fr-detail">{wa.after}</p> : null}
    </section>
  );
}

/** A calendar link pasted, checked by the one rule a feed is read by, and kept through the tab's one saver. */
function LinkBox({ flash, done }: { flash: (f: LegacyFlash) => void; done: () => void }) {
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const keep = () => {
    const u = url.trim();
    if (!u) return;
    const feed = feedUrlOk(u);
    if (!feed) return setProblem(CW.bookings.linkBroken);
    businessTabSave.saver.save({
      row: "calendar",
      patch: (c) => ({ ...c, calendar: { ...(c.calendar ?? {}), ical_url: feed } }),
      said: W.sounds.kept(null),
      done,
      flash,
    });
  };
  return (
    <div className="fr-find-form" data-testid="fr-calendar-link">
      <RecordField
        id="fr-calendar-link-box"
        label={CW.bookings.paste}
        value={url}
        onChange={(v) => {
          setUrl(v);
          setProblem(null);
        }}
        inputMode="url"
        problem={problem}
        testid="fr-calendar-link-box"
      />
      <button type="button" className="btn" onClick={keep} disabled={!url.trim()} data-testid="fr-calendar-link-keep">
        {W.continue}
      </button>
    </div>
  );
}

/** By hand or by message, as the booking tool's section keeps it: the receptionist takes the details. */
function bookByHand(flash: (f: LegacyFlash) => void): void {
  businessTabSave.saver.save({
    row: "bookings",
    patch: (c) => ({ ...c, bookings: { ...(c.bookings ?? {}), by_hand: true } }),
    said: W.sounds.kept(null),
    flash,
  });
}

/** The bookings tile: the tool found with its link and its clients, or how people book with no tool. */
function BookingsTile({
  b,
  flash,
  openClients,
}: {
  b: FirstRunChannelsVM["bookings"];
  flash: (f: LegacyFlash) => void;
  openClients: () => void;
}) {
  const [pasting, setPasting] = useState(false);
  const [how, setHow] = useState<"hand" | "site" | "message" | null>(null);
  return (
    <section className="panel fr-pane fr-place" aria-labelledby="fr-bookings-title" data-testid="fr-bookings">
      <h2 className="fr-sub" id="fr-bookings-title">
        {b.title}
      </h2>
      {b.found ? <p className="fr-sentence">{b.found}</p> : null}
      {b.how ? (
        <span className="fr-label" id="fr-bookings-how-label">
          {b.how.label}
        </span>
      ) : null}
      {b.how ? (
        <RecordToggleGroup<"hand" | "site" | "message">
          id="fr-bookings-how"
          labelledBy="fr-bookings-how-label"
          value={how}
          options={b.how.options.map((o) => ({ value: o.key, label: o.label }))}
          onChange={(v) => {
            setHow(v);
            if (v === "site") setPasting(true);
            else bookByHand(flash);
          }}
          testid="fr-bookings-how"
        />
      ) : null}
      <p className="fr-detail">{b.says}</p>
      {b.link ? (
        <p className="fr-proof" data-testid="fr-bookings-link">
          {b.link}
        </p>
      ) : null}
      {b.clients.done ? (
        <p className="fr-proof" data-testid="fr-bookings-clients">
          {b.clients.done}
        </p>
      ) : null}
      <div className="fr-links">
        {canDo("settings") && !b.clients.done ? (
          <button type="button" className="btn btn-sm" onClick={openClients} data-testid="fr-bookings-clients-go">
            {b.clients.label}
          </button>
        ) : null}
        <button
          type="button"
          className="link-btn"
          onClick={() => setPasting((x) => !x)}
          data-testid="fr-bookings-change"
        >
          {b.link ? b.change : CW.bookings.paste}
        </button>
      </div>
      {pasting ? <LinkBox flash={flash} done={() => setPasting(false)} /> : null}
    </section>
  );
}

/**
 * The mailbox tile: connected, a press per provider this deployment connects with what connecting brings under it and
 * Change (decision 0086), or coming soon.
 */
function EmailTile({ e, flash }: { e: FirstRunChannelsVM["email"]; flash: (f: LegacyFlash) => void }) {
  const [history, setHistory] = useState<MailboxHistory>("six_months");
  const connect = async (p: "google" | "microsoft") => {
    const r = await connectedMailboxes.connect(p, null, "start", history);
    if (!r.ok) flash(refusalToast(r, W.find.notLinked));
  };
  return (
    <section
      className="panel fr-pane fr-place"
      aria-labelledby="fr-email-title"
      data-testid="fr-email"
      data-state={e.state}
    >
      <h2 className="fr-sub" id="fr-email-title">
        {e.title}
      </h2>
      {e.state === "soon" ? <span className="fr-label">{CW.email.soon}</span> : null}
      <p className={e.state === "connected" ? "fr-sentence" : "fr-detail"}>{e.says}</p>
      {e.providers.length ? (
        <div className="fr-links">
          {e.providers.map((p) => (
            <button
              key={p.key}
              type="button"
              className="btn btn-sm"
              onClick={() => void connect(p.key)}
              data-testid={`fr-email-${p.key}`}
              {...gate("settings", "connect your mailbox")}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      {e.providers.length && canDo("settings") ? (
        <HistoryChoice value={history} onChange={setHistory} lineClass="fr-detail" />
      ) : null}
      <p className="fr-detail">{e.note}</p>
    </section>
  );
}

/** The step's foot: Back, what is on, and the way on, held while the calls choice cannot be kept. */
function channelsFoot(o: {
  back: string | null;
  go: (to: string) => void;
  words: string;
  held: string | null;
  busy: boolean;
  onward: () => void;
}): ReactNode {
  return (
    <div className="fr-foot">
      {o.back ? (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => o.go(o.back as string)}
          data-testid="fr-back"
        >
          {W.back}
        </button>
      ) : (
        <span />
      )}
      <span className={o.held ? "fr-held" : "fr-foot-note"} id="fr-channels-held" data-testid="fr-channels-foot">
        {o.held ?? o.words}
      </span>
      <button
        type="button"
        className="btn btn-lg btn-primary fr-go"
        onClick={o.onward}
        aria-disabled={o.held ? true : undefined}
        aria-describedby={o.held ? "fr-channels-held" : undefined}
        aria-busy={o.busy || undefined}
        data-testid="fr-onward"
      >
        {W.channels.onward}
      </button>
    </div>
  );
}

export function FrChannels(o: {
  vm: FirstRunChannelsVM;
  ph: FirstRunPhoneVM;
  choice: KeptPhoneChoice | null;
  setChoice: (c: KeptPhoneChoice | null) => void;
  tool: string | null;
  /** What is coming in, a line per source (imports.ts), for "Bringing it in". */
  lines: ImportLineVM[];
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
  back: string | null;
}) {
  const { vm, ph, choice, setChoice, tool, lines, flash, go, back } = o;
  const [clientsOpen, setClientsOpen] = useState(false);
  const [bringingOpen, setBringingOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Back from a mailbox's consent screen: what came of it, said once.
  useEffect(() => {
    const out = connectedMailboxes.outcome();
    if (out) flash({ tone: out.ok ? "ok" : "warn", msg: <>{out.words}</> });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival: the outcome is the address's, said once
  }, []);
  const choosing = ph.stage === "choose";
  const onward = async () => {
    if (busy) return;
    // No number to choose here (it is on its way, or the deployment sells none): the member's going on is the step.
    if (!choosing) {
      setBusy(true);
      const seen = await setupVerbs.later(FIRST_RUN_HELPERS.channelsSeen, { on: true, why: "answer" });
      setBusy(false);
      if (!seen.ok) return flash(refusalToast(seen, W.find.notSaved));
      return go("start");
    }
    const want = wantOf(ph, choice);
    if (!want) return;
    setBusy(true);
    const [w] = await Promise.all([
      setupVerbs.want(want),
      setupVerbs.later(KEEP_ROW, want.way === "new" ? { on: true, why: "answer" } : { on: false }),
    ]);
    setBusy(false);
    if (!w.ok) return flash(refusalToast(w, W.find.notSaved));
    go("start");
  };
  return (
    <div className="fr-channels" data-testid="fr-channels">
      <div className="fr-channels-list">
        {choosing ? <FrCalls ph={ph} choice={choice} setChoice={setChoice} flash={flash} go={go} /> : null}
        <WhatsappTile wa={vm.whatsapp} flash={flash} />
        <BookingsTile b={vm.bookings} flash={flash} openClients={() => setClientsOpen(true)} />
        <EmailTile e={vm.email} flash={flash} />
        {channelsFoot({
          back,
          go,
          words: vm.foot,
          held: choosing ? (ph.held ?? null) : null,
          busy,
          onward: () => void onward(),
        })}
      </div>
      <FrFilling filling={vm.filling} onOpen={() => setBringingOpen(true)} />
      <FrClients
        open={clientsOpen}
        onClose={() => setClientsOpen(false)}
        clients={vm.clients}
        tool={tool}
        flash={flash}
      />
      <FrBringing open={bringingOpen} onClose={() => setBringingOpen(false)} lines={lines} flash={flash} />
    </div>
  );
}
