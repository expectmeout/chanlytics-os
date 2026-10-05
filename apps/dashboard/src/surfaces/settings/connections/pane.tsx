/**
 * Settings › Connections, one row per connection (moved from legacy/pages/integrations-real.jsx, decision 0015 step 11).
 *
 * Every connection is the same row (contracts/connections.ts) computed from the surfaces already read -- channels (the
 * settings read), Setup's facts, Google -- so this pane fetches nothing of its own and cannot disagree with Setup. Three
 * groups: Connected, Available, Later. "Later" is a row's state, not a list at the bottom. Settings' page (settings.jsx)
 * still draws it by its old name, which seed-globals publishes (settings/globals.ts), until Settings' frame moves.
 */
import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  CONNECTION_GROUP_WORDS,
  connectionRows,
  type ConnectionGroup,
  type ConnectionRow as Row,
  type SetupDto,
} from "@chanlytics/contracts";
import type { GoogleSurface } from "@/legacy-bridge/google";
import { googleVerbs } from "@/legacy-bridge/google";
import { FailedRead } from "../../kit/empty/empty";
import { refusalToast, useLegacyToast, type LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import type { SetupSurface } from "../../setup/surface";
import { SendingDomains } from "./domains-block";
import { EmailSetupForm } from "./email-setup";
import { GoogleChoose } from "./google-choose";
import { BusinessRecordForm } from "./record-form";
import { ConnectionRow, type Arm } from "./row";
import { waConnect } from "./whatsapp";

type WaConfig = { ready: boolean; reason: string | null } | null | undefined;

/** What the browser came back from Google with, said once. */
function googleNote(): string | null {
  const o = googleVerbs.outcome();
  if (!o) return null;
  const W = googleVerbs.outcomeWords;
  return (
    W[o.why || ""] || W[o.outcome] || (o.outcome === "error" ? `Google did not connect (${o.why || "unknown"}).` : null)
  );
}

/** Meta's door: asked once; `undefined` while asking, so the row says so. */
function useWhatsAppConfig(): WaConfig {
  const [waCfg, setWaCfg] = useState<WaConfig>(undefined);
  useEffect(() => {
    let on = true;
    waConnect
      .config()
      .then((c) => {
        if (on) setWaCfg(c);
      })
      .catch(() => {
        if (on) setWaCfg(null);
      });
    return () => {
      on = false;
    };
  }, []);
  return waCfg;
}

/** The rows, as contracts compute them from the reads the page already holds. */
function rowsOf(
  channels: Parameters<typeof connectionRows>[0]["channels"] | undefined,
  waCfg: WaConfig,
  S: SetupSurface | null | undefined,
  G: GoogleSurface | undefined,
): Row[] {
  return connectionRows(
    {
      channels: channels || [],
      whatsapp: waCfg,
      lines: { rows: (S && S.dto.lines && S.dto.lines.rows) || [], ready: !!(S && S.dto.lines && S.dto.lines.ready) },
      lineRequestedAt: S ? S.dto.requests.line : null,
      google: G ? { ready: G.dto.ready, listing: G.dto.listing, connection: G.dto.connection } : null,
      calendar: S ? S.dto.calendar : null,
      email: S ? (S.dto.email ?? null) : null,
    },
    Date.now(),
  );
}

/** What a row's own verb does: Meta's sign-up, Google's consent, a read of Google, an ask, a scroll, the email form. */
async function runVerb(
  r: Row,
  k: {
    flash: (f: LegacyFlash) => void;
    setBusy: (b: boolean) => void;
    setArm: (a: Arm | null) => void;
    toggleEmail: () => void;
  },
): Promise<void> {
  const verb = r.verb;
  if (!verb) return;
  switch (verb.to) {
    case "verb:whatsapp-connect": {
      k.setBusy(true);
      const res = await waConnect.start();
      k.setBusy(false);
      k.flash({
        tone: res.ok ? "ok" : "danger",
        msg: res.ok ? (
          <>WhatsApp {res.number || "number"} is connected — the receptionist answers on it now</>
        ) : (
          <>{res.message}</>
        ),
      });
      return;
    }
    case "verb:google-connect":
      googleVerbs.connect();
      return;
    case "verb:google-check": {
      k.setBusy(true);
      const res = await googleVerbs.refresh();
      k.setBusy(false);
      const news = res.fresh
        ? `${res.fresh} new review${res.fresh === 1 ? "" : "s"}`
        : res.counted
          ? `${res.counted} new rating${res.counted === 1 ? "" : "s"}`
          : "";
      k.flash({
        tone: res.ok ? "ok" : "danger",
        msg: res.ok ? (
          news ? (
            <>
              Read just now — {news}. The bell has{" "}
              {res.fresh === 1 || (!res.fresh && res.counted === 1) ? "it" : "them"}.
            </>
          ) : (
            <>Read just now — nothing new since the last read.</>
          )
        ) : (
          <>{res.message}</>
        ),
      });
      return;
    }
    case "verb:google-disconnect":
      k.setArm({ kind: r.kind, what: "disconnect" });
      return;
    case "verb:business-record":
      // The form is the row's own body; the verb only points at it.
      document
        .querySelector('[data-testid="business-record"]')
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    case "verb:email-setup":
      k.toggleEmail();
      return;
    default:
      return;
  }
}

/** One group of rows: its head, Google's note, its empty line, each row with the body it opens, and the listing's foot. */
function groupCard(o: {
  g: ConnectionGroup;
  list: Row[];
  note: string | null;
  setNote: (n: string | null) => void;
  row: (r: Row) => ReactNode;
}): ReactNode {
  const { g, list, note, setNote, row } = o;
  const W = CONNECTION_GROUP_WORDS;
  return (
    <section key={g} className="fl-card set-card set-conn" data-testid={`connections-${g}`}>
      <div className="fl-card-head">
        <h2 className="fl-card-title">{W[g].title}</h2>
        <span className="fl-card-sub">{list.length ? W[g].sub(list) : "nothing yet"}</span>
      </div>
      {note && list.some((r) => r.kind === "google_profile") && (
        <div className="set-row" data-testid="google-note">
          <div className="set-row-info">
            <span className="set-row-hint">{note}</span>
          </div>
          <button className="cl-bucket-link" onClick={() => setNote(null)}>
            Ok
          </button>
        </div>
      )}
      {list.length === 0 && g === "connected" && (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">Nothing is connected yet — start below.</span>
          </div>
        </div>
      )}
      {list.map(row)}
      {g === "connected" && list.some((r) => r.kind === "google_listing") && (
        <p className="set-card-foot">
          The public listing is read once a day: Google shows five reviews and counts every rating. Connect the Business
          Profile for all of them, and for the replies you send from Reports.
        </p>
      )}
    </section>
  );
}

export const PaneIntegrationsReal = () => {
  const read = useSurface("settings");
  const S = useSurface("setup");
  const G = useSurface("google");
  const waCfg = useWhatsAppConfig();
  const [busy, setBusy] = useState(false);
  const [arm, setArm] = useState<Arm | null>(null);
  // The email row's form, open only once its verb is pressed.
  const [emailOpen, setEmailOpen] = useState(false);
  const [note, setNote] = useState<string | null>(googleNote);
  const [toastNode, flash] = useLegacyToast();
  const channels = read ? read.channels : undefined;

  if (channels === null) {
    return (
      <FailedRead
        kind="card"
        what="your connections"
        body="The receptionist keeps answering; this page just can't show the connections at the moment."
        surface="settings"
        testid="connections-connected"
      />
    );
  }

  // The workspace's own line: what a registration is filed for.
  const ownLine = ((S && S.dto.lines && S.dto.lines.rows) || []).find((l) => l.provider !== "carrier") || null;
  const rows = rowsOf(channels, waCfg, S, G);
  const run = (r: Row) => {
    if (busy) return;
    void runVerb(r, { flash, setBusy, setArm, toggleEmail: () => setEmailOpen((o) => !o) });
  };
  const confirm = async (what: "remove" | "disconnect") => {
    if (busy) return;
    setBusy(true);
    const res = what === "remove" ? await googleVerbs.unlink() : await googleVerbs.disconnect();
    setBusy(false);
    setArm(null);
    flash(
      res.ok
        ? {
            msg:
              what === "remove" ? (
                <>
                  The listing is off the record, with what was read from it
                  {G && G.dto.connection ? " — and the Business Profile is disconnected" : ""}.
                </>
              ) : (
                <>Google is disconnected. The public listing stays; replies and the full history do not.</>
              ),
          }
        : refusalToast(res, what === "remove" ? "Listing not removed" : "Google not disconnected"),
    );
  };
  const email: SetupDto["email"] | null = S ? (S.dto.email ?? null) : null;
  const row = (r: Row) => (
    <Fragment key={r.kind}>
      <ConnectionRow r={r} run={run} busy={busy} arm={arm} setArm={setArm} confirm={(w) => void confirm(w)} />
      {r.body === "google_choose" && (
        <GoogleChoose
          busy={busy}
          setBusy={setBusy}
          flash={flash}
          onDisconnect={() => setArm({ kind: r.kind, what: "disconnect" })}
        />
      )}
      {r.body === "business_record" && <BusinessRecordForm line={ownLine} flash={flash} />}
      {r.body === "email_setup" && emailOpen && S && email && (
        <EmailSetupForm
          email={email}
          businessName={S.dto.business.name}
          flash={flash}
          onClose={() => setEmailOpen(false)}
        />
      )}
      {r.kind === "email" && S && email && <SendingDomains email={email} flash={flash} />}
    </Fragment>
  );
  const groups = (["connected", "available", "later"] as const).map((g) => ({
    g,
    list: rows.filter((r) => r.group === g),
  }));
  return (
    <>
      {groups.map(({ g, list }) => groupCard({ g, list, note, setNote, row }))}
      {toastNode}
    </>
  );
};
