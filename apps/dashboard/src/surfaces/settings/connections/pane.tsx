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
  channelFor,
  MAILBOX_LEFT_ROW,
  type ChannelVM,
  type FootageDto,
  type LineCodeDto,
  type SetupDto,
} from "@chanlytics/contracts";
import {
  CONNECTION_GROUP_WORDS,
  connectionRows,
  type ConnectionGroup,
  type ConnectionLine as Row,
} from "./model/setup";
import { tryItLink } from "./model/whatsapp-try-it";
import type { GoogleSurface } from "@/bridge/google";
import { googleVerbs } from "@/bridge/google";
import { pageClock } from "@/bridge/zone";
import { FailedRead } from "../../kit/empty/empty";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordRow } from "../../kit/record/row";
import { refusalToast, useFrameToast, type FrameFlash } from "../../frame-verbs";
import { useAdsShown } from "../../campaigns/ads/shown";
import { useFolderRow } from "../../files/footage/settings-row";
import { useSurface } from "../../use-surface";
import { channelVMs } from "../../channels/surface";
import type { SetupSurface } from "../../setup/surface";
import { retryLineInPlace } from "../../setup/retry-line";
import type { connectedMailboxes } from "./connected-mailboxes";
import { EmailSetupForm } from "./email-setup";
import { WebsiteFormsLine } from "../../campaigns/forms/website/settings-line";
import { GoogleChoose } from "./google-choose";
import {
  signInNames,
  useGoogleNote,
  useLineCodes,
  useLogins,
  useMailboxNote,
  useSignupAhead,
  useStandingCheck,
  type Logins,
} from "./live";
import { ConnectedMailboxes, EmailCard } from "./mailboxes-block";
import { BusinessRecordForm } from "./record-form";
import { ConnectionRow, connRowPress, type Arm } from "./row";
import { signupLeftOpenAt, waConnect, type SignupDoor } from "./whatsapp";
import { igConnect, type InstagramDoor } from "./instagram";
import { metaConnect, type MetaDoor } from "./meta";
import type { SignInNames } from "./model/login-words";
import type { AdsPlace, AdsRowKit } from "./ad-account-real";

type WaConfig = SignupDoor | null | undefined;

// The ad account's card is a chunk of its own, fetched only where Ads is drawn here (campaigns/ads/shown.ts).
const RealAdAccount = lazy(() => import("./ad-account-real").then((m) => ({ default: m.RealAdAccount })));

/**
 * Where the workspace's own ad account goes among the groups (ad-account-real.tsx): the place the pane keeps for it, in
 * the group its account stands in, and what it counts as there. A demo session draws the sample's rows after the groups.
 */
interface AdsHere {
  place: AdsPlace;
  slot: (element: HTMLElement | null) => void;
}

/**
 * What the ad account's row (a lazy chunk) is handed by the page: its press, face and pill, which the page loads at
 * once already, so the chunk imports none of them (ad-account-real.tsx AdsRowKit says why).
 */
const ADS_KIT: AdsRowKit = {
  press: connRowPress,
  face: (on) => (
    <Face
      className="set-int-tile"
      data-kind="ads"
      data-on={on ? "true" : undefined}
      glyph={<Icon name="trending-up" size={15} />}
    />
  ),
  pill: (tone, label) => <StatePill kind="tone" value={tone} label={label} />,
};

/** The place for the ad account's row in a group: an element the row is drawn into, never a box of its own. */
const adsSlotOf = (ads: AdsHere) => <div key="ads-account" className="conn-ads-slot" ref={ads.slot} />;

/** What came back from a login, under the Instagram row: Instagram's own, or Meta's. */
function LoginNote({ note, onOk, label }: { note: string | null; onOk: () => void; label: "Instagram" | "Meta" }) {
  if (!note) return null;
  const id = `${label.toLowerCase()}-note`;
  return <RecordRow id={id} testid={id} label={label} value={note} act={{ label: "Ok", onClick: onOk }} />;
}

/** What each login came back with, under the Instagram row, in the row's words, each until Ok. */
function LoginNotes({ logins: { ig, meta }, names }: { logins: Logins; names: SignInNames }) {
  return (
    <>
      <LoginNote label="Instagram" note={ig.note(names)} onOk={ig.clearNote} />
      <LoginNote label="Meta" note={meta.note(names)} onOk={meta.clearNote} />
    </>
  );
}

/** A disconnect, asked about on its row first (row.tsx rowAsk). */
const armDisconnect = (r: Row, k: { setArm: (a: Arm | null) => void }) =>
  k.setArm({ kind: r.kind, what: "disconnect" });

/**
 * The verbs run in one step: those that leave for a provider's own screen (Google's consent, Instagram's, Meta's dialog),
 * which sends the browser back with a word its row reads once (connections/google, instagram.ts, meta.ts), and the
 * disconnects, each asked about first.
 */
const ONE_STEP_VERBS: Readonly<Record<string, (r: Row, k: { setArm: (a: Arm | null) => void }) => void>> = {
  "verb:google-connect": () => googleVerbs.connect(),
  "verb:instagram-connect": () => igConnect.start(),
  "verb:meta-connect": () => metaConnect.start(),
  "verb:google-disconnect": armDisconnect,
  "verb:instagram-disconnect": armDisconnect,
  "verb:meta-disconnect": armDisconnect,
};

/**
 * The workspace's Instagram account turned off (the row that speaks for it, contracts channelFor), through the login that
 * connected it (Meta's removes its subscription too), said as a toast.
 */
async function disconnectInstagram(channels: readonly ChannelVM[] | undefined): Promise<FrameFlash> {
  const account = channelFor(channels ?? [], "instagram");
  const viaMeta = !!account?.metaLines;
  const login = viaMeta ? metaConnect : igConnect;
  const name = viaMeta ? "Meta" : "Instagram";
  const res = account ? await login.disconnect(account.id) : { ok: false, message: "Nothing to disconnect." };
  return res.ok
    ? { msg: <>{name} is disconnected. Its DMs are not answered here until you connect it again.</> }
    : refusalToast(res, `${name} not disconnected`);
}

/** Meta's door: asked once; `undefined` while asking, so the row says so, and what the tab last held before then. */
function useWhatsAppConfig(): WaConfig {
  const [waCfg, setWaCfg] = useState<WaConfig>(() => waConnect.held() ?? undefined);
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
  meta: MetaDoor | null | undefined;
  codes: LineCodeDto[];
  signupLeftOpenAt: string | null;
  signupSaid: string | null;
  /** Where the watched folder stands (files/footage/use-footage.ts); null until it is read. */
  footage: FootageDto | null;
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
      tz: pageClock().zone(),
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
      meta: asked.meta ? { ready: asked.meta.ready, postsWaiting: asked.meta.posts_waiting } : null,
      footage: asked.footage,
    },
    Date.now(),
    // Google Drive is left out until the day it is offered here: a Later row would promise what nobody can connect yet.
  ).filter((r) => r.kind !== "drive" || r.state !== "later");
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
    flash: (f: FrameFlash) => void;
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
        msg: res.ok ? <>WhatsApp {res.number || "number"} is connected · AI answers on it now</> : <>{res.message}</>,
        action: tryIt ? { label: "Try it", onClick: () => window.open(tryIt, "_blank", "noopener,noreferrer") } : null,
      });
      return;
    }
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
              Read just now · {news}. The bell has{" "}
              {res.fresh === 1 || (!res.fresh && res.counted === 1) ? "it" : "them"}.
            </>
          ) : (
            <>Updated just now · nothing new since last time.</>
          )
        ) : (
          <>{res.message}</>
        ),
      });
      return;
    }
    case "verb:business-record":
      // The form is the row's own body, opened under it by its verb (Connect, or Open the record in its Settings).
      k.toggleRecord();
      return;
    case "verb:email-setup":
      k.toggleEmail();
      return;
    default:
      // A connect that leaves for a provider's own screen, or a disconnect asked about first (ONE_STEP_VERBS).
      ONE_STEP_VERBS[verb.to]?.(r, k);
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
  /** The workspace's ad account, where it stands in this group: under the Meta row, counted as a row is. */
  ads: AdsHere | null;
}): ReactNode {
  const { g, list, note, setNote, row, ads } = o;
  const W = CONNECTION_GROUP_WORDS;
  const counted = ads ? [...list, { state: ads.place.state }] : list;
  const beside = ads !== null && list.some((r) => r.kind === "instagram");
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
        <span className="rec-card-sub">{counted.length ? W[g].sub(counted) : "nothing yet"}</span>
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
      {counted.length === 0 && g === "connected" && (
        <RecordRow
          id="connections-none"
          label={W[g].title}
          empty="Nothing is connected yet · start below."
          value={null}
        />
      )}
      {list.map((r) =>
        beside && ads && r.kind === "instagram" ? (
          <Fragment key={r.kind}>
            {row(r)}
            {adsSlotOf(ads)}
          </Fragment>
        ) : (
          row(r)
        ),
      )}
      {ads && !beside ? adsSlotOf(ads) : null}
    </section>
  );
}

/**
 * The groups in the page's order, and the workspace's ad account in the group it stands in: its card says where once its
 * account is read (ad-account-real.tsx), and is drawn into the place kept for it there.
 */
function ConnectionGroups(props: {
  rows: Row[];
  note: string | null;
  setNote: (n: string | null) => void;
  row: (r: Row) => ReactNode;
  adsShown: boolean;
}) {
  const [adsPlace, setAdsPlace] = useState<AdsPlace | null>(null);
  const [adsSlot, setAdsSlot] = useState<HTMLElement | null>(null);
  const { note, setNote, row } = props;
  // Under the Meta row (the Instagram connection) where both stand in one group: the row is then that row's child.
  const child = !!adsPlace && props.rows.some((r) => r.group === adsPlace.group && r.kind === "instagram");
  return (
    <>
      {connectionGroupsOf(props.rows).map(({ g, list }) =>
        groupCard({
          g,
          list,
          note,
          setNote,
          row,
          ads: props.adsShown && adsPlace?.group === g ? { place: adsPlace, slot: setAdsSlot } : null,
        }),
      )}
      {props.adsShown && (
        <Suspense fallback={null}>
          <RealAdAccount slot={adsSlot} child={child} kit={ADS_KIT} onPlace={setAdsPlace} />
        </Suspense>
      )}
    </>
  );
}

/** The rows by group, in the page's order: Connected, Available, Later. */
const connectionGroupsOf = (rows: Row[]) =>
  (["connected", "available", "later"] as const).map((g) => ({ g, list: rows.filter((r) => r.group === g) }));

/** With a mailbox connected, its row is the Email card: its state, act and facts, its settings in a sheet. */
function emailCardOf(
  r: Row,
  S: SetupSurface | null | undefined,
  o: {
    flash: (f: FrameFlash) => void;
    note: ReturnType<typeof connectedMailboxes.outcome>;
    onNote: () => void;
    openLeft: boolean;
  },
): ReactNode {
  const email = S?.dto.email ?? null;
  if (r.kind !== "mailbox" || !S || !email?.sending?.mailboxes.length) return null;
  return (
    <EmailCard
      key={r.kind}
      r={r}
      email={email}
      imports={S.dto.imports}
      businessName={S.dto.business.name}
      flash={o.flash}
      note={o.note}
      onNote={o.onNote}
      openLeft={o.openLeft}
    />
  );
}

/** Google's listing taken off the record, or its Business Profile disconnected: done, and what to say of it. */
async function leaveGoogle(leaving: "remove" | "disconnect", profileToo: boolean): Promise<FrameFlash> {
  const res = leaving === "remove" ? await googleVerbs.unlink() : await googleVerbs.disconnect();
  if (!res.ok) return refusalToast(res, leaving === "remove" ? "Listing not removed" : "Google not disconnected");
  return {
    msg:
      leaving === "remove" ? (
        <>
          The listing is off the record, with what was read from it
          {profileToo ? " · and the Business Profile is disconnected" : ""}.
        </>
      ) : (
        <>Google is disconnected. The public listing stays · replies and the full history do not.</>
      ),
  };
}

/** Connections, and the row its address names, open (`integrations/left`: the mailbox's left senders). */
export const PaneIntegrationsReal = ({ row: named = null }: { row?: string | null }) => {
  const C = useSurface("channels");
  const S = useSurface("setup");
  const G = useSurface("google");
  const waCfg = useWhatsAppConfig();
  const logins = useLogins();
  const [busy, setBusy] = useState(false);
  // Ad accounts, a demo's card or a workspace's whose Ads preview is on (campaigns/ads/shown.ts); no other workspace draws it.
  const adsShown = useAdsShown();
  const [arm, setArm] = useState<Arm | null>(null);
  // The email row's form and the business record under Texting, each open only once its verb is pressed.
  const [emailOpen, setEmailOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [note, setNote] = useGoogleNote();
  // What the browser came back from a mailbox's provider with, said under the mailboxes' row until it is dropped.
  const [mailboxNote, dropNote] = useMailboxNote();
  // The address named "Left in your mailbox": the mailbox block opens its list.
  const leftOpen = named === MAILBOX_LEFT_ROW;
  // Meta's sign-up window is open (this page began it and it has not ended), and the sign-up an earlier page began on this tab and
  // never finished, read once as this page opens: nothing a later press of Connect should bring back.
  const [signup, setSignup] = useState(false);
  const [leftOpenAt, setLeftOpenAt] = useState<string | null>(() => signupLeftOpenAt());
  const [signupSaid, setSignupSaid] = useState<string | null>(null);
  const [toastNode, flash] = useFrameToast();
  // The watched folder's row: its read, its verbs and its sheets. Another Google connection here keeps the grant alive at
  // Google once Drive is disconnected, which its sheet says before the press.
  const drive = useFolderRow(flash, !!G?.dto.connection || !!S?.dto.email?.sending?.mailboxes.length);
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
        body="AI keeps answering · this page just can't show the connections at the moment."
        surface="channels"
        testid="connections-connected"
      />
    );
  }

  const doors = { instagram: logins.ig.door, meta: logins.meta.door };
  const asked = { whatsapp: waCfg, ...doors, codes, signupLeftOpenAt: leftOpenAt, signupSaid, footage: drive.footage };
  const rows = rowsOf(channels, asked, S, G);
  const run = (r: Row) => {
    if (busy) return;
    if (r.kind === "drive") {
      if (r.verb) drive.run(r.verb.to);
      return;
    }
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
    const toast = await leaveGoogle(what, !!G?.dto.connection);
    setBusy(false);
    setArm(null);
    flash(toast);
  };
  const email: SetupDto["email"] | null = S ? (S.dto.email ?? null) : null;
  const mail = { flash, note: mailboxNote, onNote: dropNote, openLeft: leftOpen };
  const row = (r: Row) =>
    emailCardOf(r, S, mail) ?? (
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
        {r.kind === "instagram" && <LoginNotes logins={logins} names={signInNames(channels)} />}
        {r.kind === "drive" && drive.note}
        {/* A Later row has no block, but what a connect came back with is still said under it. */}
        {((r.body === "mailboxes" && S && email) || (r.kind === "mailbox" && mailboxNote)) && (
          <ConnectedMailboxes email={email} flash={flash} note={mailboxNote} onNote={dropNote} />
        )}
      </Fragment>
    );
  return (
    <>
      <ConnectionGroups rows={rows} note={note} setNote={setNote} row={row} adsShown={adsShown} />
      {/* A website's forms and their keys live in Campaigns › Forms now (00709): one line here says so and opens them. */}
      <WebsiteFormsLine />
      {drive.sheets}
      {toastNode}
    </>
  );
};
