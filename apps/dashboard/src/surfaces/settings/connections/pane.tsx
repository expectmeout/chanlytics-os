/**
 * Settings › Connections, one row per connection (moved from legacy/pages/integrations-real.jsx, decision 0015 step 11).
 *
 * Every connection is the same row (contracts/connections.ts) computed from the surfaces already read -- channels (the
 * channels read, surfaces/channels/surface.ts), Setup's facts, Google -- so its rows cannot disagree with Setup. What it asks for itself (live.ts) is what
 * only an open page wants: the one-time codes sent to the workspace's own line, and what Meta holds about the number when the
 * kept answer is missing or stale. Three
 * groups: Connected, Available, Later. "Later" is a row's state, not a list at the bottom. Settings' page (settings.jsx)
 * still draws it by its old name, which seed-globals publishes (settings/globals.ts), until Settings' frame moves.
 */
import { Fragment, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CONNECTION_GROUP_WORDS,
  channelFor,
  connectionRows,
  MAILBOX_LEFT_ROW,
  tryItLink,
  type ConnectionGroup,
  type ChannelVM,
  type ConnectionRow as Row,
  type LineCodeDto,
  type SetupDto,
} from "@chanlytics/contracts";
import type { GoogleSurface } from "@/legacy-bridge/google";
import { googleVerbs } from "@/legacy-bridge/google";
import { FailedRead } from "../../kit/empty/empty";
import { RecordRow } from "../../kit/record/row";
import { refusalToast, useLegacyToast, type LegacyFlash } from "../../legacy-verbs";
import { useAdsShown } from "../../campaigns/ads/shown";
import { useSurface } from "../../use-surface";
import { channelVMs } from "../../channels/surface";
import type { SetupSurface } from "../../setup/surface";
import { retryLineInPlace } from "../../setup/retry-line";
import { connectedMailboxes } from "./connected-mailboxes";
import { EmailSetupForm } from "./email-setup";
import { GoogleChoose } from "./google-choose";
import { useLineCodes, useSignupAhead, useStandingCheck } from "./live";
import { ConnectedMailboxes } from "./mailboxes-block";
import { BusinessRecordForm } from "./record-form";
import { ConnectionRow, type Arm } from "./row";
import { signupLeftOpenAt, waConnect, type SignupDoor } from "./whatsapp";
import { igConnect, type InstagramDoor } from "./instagram";

type WaConfig = SignupDoor | null | undefined;

// The Ad accounts card (MOCKUP) is a chunk of its own, fetched only by a demo session: a real workspace's pane draws none of it.
const AdAccounts = lazy(() => import("./ad-accounts").then((m) => ({ default: m.AdAccounts })));

/** What the browser came back from Google with, said once. */
function googleNote(): string | null {
  const o = googleVerbs.outcome();
  if (!o) return null;
  const W = googleVerbs.outcomeWords;
  return (
    W[o.why || ""] || W[o.outcome] || (o.outcome === "error" ? `Google did not connect (${o.why || "unknown"}).` : null)
  );
}

/**
 * Instagram's door, asked once (`undefined` while asking, null where it could not be read: the row says Later), and what
 * the browser came back from Instagram with, said once under its row until Ok.
 */
function useInstagram() {
  const [door, setDoor] = useState<InstagramDoor | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(() => igConnect.outcome());
  useEffect(() => {
    let on = true;
    igConnect
      .config()
      .then((c) => on && setDoor(c))
      .catch(() => on && setDoor(null));
    return () => {
      on = false;
    };
  }, []);
  return { door, note, clearNote: () => setNote(null) };
}

/** What came back from Instagram, under its row. */
function InstagramNote({ note, onOk }: { note: string | null; onOk: () => void }) {
  if (!note) return null;
  return (
    <RecordRow
      id="instagram-note"
      testid="instagram-note"
      label="Instagram"
      value={note}
      act={{ label: "Ok", onClick: onOk }}
    />
  );
}

/** The workspace's Instagram account turned off (the row that speaks for it, contracts channelFor), said as a toast. */
async function disconnectInstagram(channels: readonly ChannelVM[] | undefined): Promise<LegacyFlash> {
  const account = channelFor(channels ?? [], "instagram");
  const res = account ? await igConnect.disconnect(account.id) : { ok: false, message: "Nothing to disconnect." };
  return res.ok
    ? { msg: <>Instagram is disconnected. Its DMs are not answered here until you connect it again.</> }
    : refusalToast(res, "Instagram not disconnected");
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

/**
 * What the open page asked beside the reads it holds: Meta's door, the codes sent to the line, a sign-up an earlier page left
 * behind, and what the last sign-up this page ran came to when it did not connect and was not the owner's own closing of it.
 */
interface Asked {
  whatsapp: WaConfig;
  instagram: InstagramDoor | null | undefined;
  codes: LineCodeDto[];
  signupLeftOpenAt: string | null;
  signupSaid: string | null;
}

/**
 * The rows, as contracts compute them from the reads the page already holds. A sign-up that could not go on is said first under
 * the row that offers it, in full and until Connect is pressed again: the toast that says it is one line on a phone, and gone in
 * seconds.
 */
function rowsOf(
  channels: Parameters<typeof connectionRows>[0]["channels"] | undefined,
  asked: Asked,
  S: SetupSurface | null | undefined,
  G: GoogleSurface | undefined,
): Row[] {
  const rows = connectionRows(
    {
      channels: channels || [],
      whatsapp: asked.whatsapp,
      lines: { rows: (S && S.dto.lines && S.dto.lines.rows) || [], ready: !!(S && S.dto.lines && S.dto.lines.ready) },
      lineRequestedAt: S ? S.dto.requests.line : null,
      google: G ? { ready: G.dto.ready, listing: G.dto.listing, connection: G.dto.connection } : null,
      calendar: S ? S.dto.calendar : null,
      email: S ? (S.dto.email ?? null) : null,
      codes: asked.codes,
      signupLeftOpenAt: asked.signupLeftOpenAt,
      imports: S ? (S.dto.imports ?? null) : null,
      instagram: asked.instagram ? { ready: asked.instagram.ready } : null,
    },
    Date.now(),
  );
  const said = asked.signupSaid;
  if (!said) return rows;
  // What the sign-up came to is on the row, first and in full, never behind the row's press (ConnectionNote.live).
  const came = { text: said, live: true as const };
  return rows.map((r) => (r.verb?.to === "verb:whatsapp-connect" ? { ...r, notes: [came, ...r.notes] } : r));
}

/** What a row's own verb does: Meta's sign-up, Google's consent, a read of Google, an ask, a scroll, the email form. */
async function runVerb(
  r: Row,
  k: {
    flash: (f: LegacyFlash) => void;
    setBusy: (b: boolean) => void;
    setArm: (a: Arm | null) => void;
    toggleEmail: () => void;
    toggleRecord: () => void;
    setSignup: (open: boolean) => void;
    forgetLeftOpen: () => void;
    setSignupSaid: (said: string | null) => void;
  },
): Promise<void> {
  const verb = r.verb;
  if (!verb) return;
  switch (verb.to) {
    case "verb:whatsapp-connect":
    case "verb:whatsapp-connect-keep": {
      k.setBusy(true);
      // Meta's window is open from here to the end of the sign-up: the page asks for the codes sent to the line while it is, and a
      // sign-up an earlier page left behind is no longer what this row has to say.
      k.forgetLeftOpen();
      k.setSignupSaid(null);
      k.setSignup(true);
      // Keeping the WhatsApp Business app is Meta's own flow for it (coexistence, decision 0073, R12).
      const res = await waConnect.start(verb.to === "verb:whatsapp-connect-keep" ? { keepApp: true } : {});
      k.setSignup(false);
      k.setBusy(false);
      if (!res.ok && res.reason !== "cancelled") k.setSignupSaid(res.message);
      // A number that just connected is tried through its own link, which opens the chat whatever the phone's record of
      // the number says (contracts tryItLink): the toast offers it at the moment an owner reaches for the phone.
      const tryIt = res.ok ? tryItLink(res.number) : null;
      k.flash({
        tone: res.ok ? "ok" : "danger",
        msg: res.ok ? (
          <>WhatsApp {res.number || "number"} is connected — the receptionist answers on it now</>
        ) : (
          <>{res.message}</>
        ),
        action: tryIt ? { label: "Try it", onClick: () => window.open(tryIt, "_blank", "noopener,noreferrer") } : null,
      });
      return;
    }
    case "verb:google-connect":
      googleVerbs.connect();
      return;
    case "verb:instagram-connect":
      // To Instagram's consent screen and back (connections/instagram.ts): the row reads the word it brings back.
      igConnect.start();
      return;
    case "verb:instagram-disconnect":
      k.setArm({ kind: r.kind, what: "disconnect" });
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
      // The form is the row's own body, opened under it by its verb (Connect, or Open the record in its Settings).
      k.toggleRecord();
      return;
    case "verb:email-setup":
      k.toggleEmail();
      return;
    default:
      // A line that stopped part-way, set up again in place, as Start's row does it (contracts ownLineStandOf).
      if (verb.to.startsWith("verb:retry-line:")) {
        k.setBusy(true);
        await retryLineInPlace(verb.to.slice("verb:retry-line:".length), k.flash);
        k.setBusy(false);
      }
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
    <section
      key={g}
      className="rec-card set-card set-conn"
      data-testid={`connections-${g}`}
      aria-labelledby={`connections-${g}-title`}
    >
      <div className="rec-card-head">
        <h2 className="rec-card-title" id={`connections-${g}-title`}>
          {W[g].title}
        </h2>
        <span className="rec-card-sub">{list.length ? W[g].sub(list) : "nothing yet"}</span>
      </div>
      {note && list.some((r) => r.kind === "google_profile") && (
        <RecordRow
          id="google-note"
          testid="google-note"
          label="Google"
          value={note}
          act={{ label: "Ok", onClick: () => setNote(null) }}
        />
      )}
      {list.length === 0 && g === "connected" && (
        <RecordRow
          id="connections-none"
          label={W[g].title}
          empty="Nothing is connected yet — start below."
          value={null}
        />
      )}
      {list.map(row)}
    </section>
  );
}

/** Connections, and the row its address names, open (`integrations/left`: the mailbox's left senders). */
export const PaneIntegrationsReal = ({ row: named = null }: { row?: string | null }) => {
  const C = useSurface("channels");
  const S = useSurface("setup");
  const G = useSurface("google");
  const waCfg = useWhatsAppConfig();
  const ig = useInstagram();
  const [busy, setBusy] = useState(false);
  // Ad accounts, a demo's card or a workspace's whose Ads preview is on (campaigns/ads/shown.ts); no other workspace draws it.
  const adsShown = useAdsShown();
  const [arm, setArm] = useState<Arm | null>(null);
  // The email row's form and the business record under Texting, each open only once its verb is pressed.
  const [emailOpen, setEmailOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [note, setNote] = useState<string | null>(googleNote);
  // What the browser came back from a mailbox's provider with, said once under the mailboxes' row.
  const [mailboxNote, setMailboxNote] = useState(() => connectedMailboxes.outcome());
  const dropNote = () => setMailboxNote(null);
  // The address named "Left in your mailbox" (Today's Brought in links to it): the mailbox block opens its list.
  const leftOpen = named === MAILBOX_LEFT_ROW;
  // Meta's sign-up window is open (this page began it and it has not ended), and the sign-up an earlier page began on this tab and
  // never finished, read once as this page opens: nothing a later press of Connect should bring back.
  const [signup, setSignup] = useState(false);
  const [leftOpenAt, setLeftOpenAt] = useState<string | null>(() => signupLeftOpenAt());
  const [signupSaid, setSignupSaid] = useState<string | null>(null);
  const [toastNode, flash] = useLegacyToast();
  // The WhatsApp and phone rows, from the channels read (surfaces/channels/surface.ts), which hears them wherever the tab is:
  // undefined while it is read, null where it failed (the wiring's second audit, W-channel-team-plus-1, S3-1). Each says when a
  // customer last came in by the later of that read's time and Setup's, which hears the first call and the first message, so
  // a row never says nothing has arrived while Start ticks the test call (X3-3).
  const voiceHeard = S?.dto?.channels?.voice?.lastInboundAt ?? null;
  const waHeard = S?.dto?.channels?.whatsapp?.lastInboundAt ?? null;
  const channels = useMemo(
    () => channelVMs(C, new Date(), { voice: voiceHeard, whatsapp: waHeard }),
    [C, voiceHeard, waHeard],
  );
  // The workspace's own line: what a registration is filed for, and where a code Meta texts arrives.
  const ownLine = ((S && S.dto.lines && S.dto.lines.rows) || []).find((l) => l.provider !== "carrier") || null;
  // What an owner reads about the number Meta is connecting: the codes sent to the line (once as this opens, every three seconds
  // while Meta's window is open), and what Meta holds when the kept answer is missing or has gone stale.
  const codes = useLineCodes(!!ownLine, signup);
  useStandingCheck(channels);
  useSignupAhead(waCfg, channels);

  if (channels === null) {
    return (
      <FailedRead
        kind="card"
        what="your connections"
        body="The receptionist keeps answering; this page just can't show the connections at the moment."
        surface="channels"
        testid="connections-connected"
      />
    );
  }

  const asked = { whatsapp: waCfg, instagram: ig.door, codes, signupLeftOpenAt: leftOpenAt, signupSaid };
  const rows = rowsOf(channels, asked, S, G);
  const run = (r: Row) => {
    if (busy) return;
    void runVerb(r, {
      flash,
      setBusy,
      setArm,
      toggleEmail: () => setEmailOpen((o) => !o),
      toggleRecord: () => setRecordOpen((o) => !o),
      setSignup,
      forgetLeftOpen: () => setLeftOpenAt(null),
      setSignupSaid,
    });
  };
  const confirm = async (what: "remove" | "disconnect") => {
    if (busy) return;
    setBusy(true);
    if (what === "disconnect" && arm?.kind === "instagram") {
      flash(await disconnectInstagram(channels));
      setBusy(false);
      setArm(null);
      return;
    }
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
      <ConnectionRow
        r={r}
        run={run}
        busy={busy}
        signup={signup}
        arm={arm}
        setArm={setArm}
        confirm={(w) => void confirm(w)}
      />
      {r.body === "google_choose" && (
        <GoogleChoose
          busy={busy}
          setBusy={setBusy}
          flash={flash}
          onDisconnect={() => setArm({ kind: r.kind, what: "disconnect" })}
        />
      )}
      {r.body === "business_record" && recordOpen && <BusinessRecordForm line={ownLine} flash={flash} />}
      {r.body === "email_setup" && emailOpen && S && email && (
        <EmailSetupForm
          email={email}
          businessName={S.dto.business.name}
          flash={flash}
          onClose={() => setEmailOpen(false)}
        />
      )}
      {r.kind === "instagram" && <InstagramNote note={ig.note} onOk={ig.clearNote} />}
      {/* A Later row has no block, but what a connect came back with is still said under it. */}
      {((r.body === "mailboxes" && S && email) || (r.kind === "mailbox" && mailboxNote)) && (
        <ConnectedMailboxes email={email} flash={flash} note={mailboxNote} onNote={dropNote} openLeft={leftOpen} />
      )}
    </Fragment>
  );
  const groups = (["connected", "available", "later"] as const).map((g) => ({
    g,
    list: rows.filter((r) => r.group === g),
  }));
  return (
    <>
      {groups.map(({ g, list }) => groupCard({ g, list, note, setNote, row }))}
      {adsShown && (
        <Suspense fallback={null}>
          <AdAccounts flash={flash} />
        </Suspense>
      )}
      {toastNode}
    </>
  );
};
