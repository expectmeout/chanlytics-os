// Chanlytics — Settings › Business: What it can do.
//
// The fifth card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.7; the plan's Tasks 4.1
// and 4.1b): six abilities, each with the channels that have it and the row it runs on, and under them the three
// things the receptionist cannot do at all. Nothing here is typed. Every ability, every sentence and every limit is
// contracts' (abilityRows, cannotRows, through BUSINESS_TAB), computed from what the records show -- the tab
// had never said a tool exists, and an owner could not know their phone agent sends the booking link to a caller's
// own WhatsApp.
//
// Built to the owner's 22 September rule from the start (the plan's Task 4.0): a row states ONE fact and at most one
// quiet signal. So an ability is its title and two small glyphs, chat and phone, lit for a channel that has it and
// dim for one that does not -- ink, never a colour, never a pill, never a badge. The sentence under the title is
// drawn ONLY where it carries a decision: an input this page supplies is missing (contracts' `missing`), and then the
// row says what happens instead and offers the row that fixes it. Everywhere else the sentence is still in the row --
// a screen reader reads it, a mouse gets it as the row's tip -- and is not a second and third line under six rows of
// a phone. What holds the whole card back is said ONCE, above the rows: the Autonomy tab's Replies row is one cause
// with one fix on another tab, and six rows repeating it is the page shouting (Task 4.1b's decision).
//
// The card holds NO hook, as the four cards before it do not: its state is the page's and its folds'.
//
// Three surfaces beside the settings read reach it, each read as the card draws (shell.ts): Setup (the connections,
// read through contracts' capabilityStatus, the same answer Setup's own rows are drawn from), the policies (the
// Autonomy matrix) and all the templates (the approved message a call sends the booking link as). A surface that could
// not be read is its own state: the rows that need it are a FailedRead, never a guessed false, which would draw a live
// line dark and a hold as none.

import { useEffect, useState, type ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import type { PoliciesSurface } from "@/legacy-bridge/policy-store";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { gate, navigate, type LegacyFlash } from "../../legacy-verbs";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { RecordSwitch } from "../../kit/record/field";
import { recFolds } from "../../kit/record/registry";
import type { SetupSurface } from "../../setup/surface";
import type { Brain as SavedBrain, Config } from "./save";
import { businessTabSave } from "./saver";
import { policiesNow, setupNow, templatesAllNow } from "./shell";

type Abilities = ReturnType<typeof BUSINESS_TAB.abilityRows>;
type Ability = Abilities["rows"][number];
type Limit = ReturnType<typeof BUSINESS_TAB.cannotRows>[number];
type ChannelWords = (typeof BUSINESS_TAB.ABILITY_CHANNEL_WORDS)["whatsapp"];
type Brain = SavedBrain;

/* ------------------------------------ the two glyphs ------------------------------------ */

/**
 * One channel of one ability: the app's own icon, lit in the page's ink where the channel has it and dim where it
 * does not. Dim is a colour, and a colour says nothing to a screen reader or to anyone reading a phone in daylight,
 * so the glyph carries its name -- contracts' (ABILITY_CHANNEL_WORDS), so the four states are spelled once.
 *
 * Drawn dim rather than left out: an absent glyph reads as "we did not say", and the whole point of this card is that
 * it says.
 */
const BtcGlyph = ({ channel, has, words }: { channel: "whatsapp" | "voice"; has: boolean; words: ChannelWords }) => (
  <span className="rec-can-chip" data-on={has ? "true" : "false"} role="img" aria-label={has ? words.has : words.not}>
    <Icon name={channel === "voice" ? "phone" : "chat"} size={12} />
  </span>
);

/* ------------------------------------ an ability ------------------------------------ */

/**
 * One ability: its title, its two channels, and its sentence -- kept out of the way unless it carries a decision.
 *
 * `data-ready` is the row's one signal and the glyphs are its per-channel spelling: contracts folds each ability's
 * input into its channels, so `ready` is exactly "one of the two does it", and a row nothing does takes the dim ink
 * the three limits under it are already in.
 *
 * `door` opens the row that supplies the missing input, by its id, the way the gap line's door opens one (the
 * fold registry asks about changes first). A role that may not change the business is passed none: the row behind it
 * would not open, so the sentence stands alone rather than offering a press that refuses.
 */
const BtcRow = ({
  ability,
  words,
  door,
  end = null,
}: {
  ability: Ability;
  words: Record<"whatsapp" | "voice", ChannelWords>;
  door: ((id: string) => void) | null;
  /** A switch the row carries itself, after its glyphs: only the opt-in ability has one. */
  end?: ReactNode;
}) => {
  const a = ability;
  const saysId = `rec-can-${a.id}-says`;
  const { runsOn } = a;
  const open = a.missing && runsOn && door;
  return (
    <div
      className="rec-row bt-can-row"
      data-testid={`rec-can-${a.id}`}
      data-ready={a.ready ? "true" : "false"}
      // The tip only where the sentence is not on screen: drawn, it IS the row's description.
      title={a.missing ? undefined : a.detail}
    >
      <span className="rec-row-key">{a.title}</span>
      <span className="bt-can-chips">
        <BtcGlyph channel="whatsapp" has={a.channels.whatsapp} words={words.whatsapp} />
        <BtcGlyph channel="voice" has={a.channels.voice} words={words.voice} />
        {end}
      </span>
      {a.missing ? (
        <p className="bt-can-why">
          <span id={saysId}>{a.detail}</span>{" "}
          {open ? (
            <button
              type="button"
              className="bt-link"
              onClick={() => door(runsOn.row)}
              aria-describedby={saysId}
              data-testid={`rec-can-door-${a.id}`}
            >
              {runsOn.label}
            </button>
          ) : null}
        </p>
      ) : (
        // Inside the row a screen reader reads it in its place; the photo switch points at it too.
        <span className="bt-can-says" id={saysId}>
          {a.detail}
        </span>
      )}
    </div>
  );
};

/**
 * The photo switch (features.vision), on its ability's row: it gives the receptionist something, so it is not among the
 * limits it keeps (the Settings wiring review, 18 Oct 2026). Saved at once through the tab's one saver; it shows where it
 * is going until the read says so, and goes back where the save is refused.
 */
const BtcVisionSwitch = ({
  on,
  canEdit,
  flash,
}: {
  on: boolean;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
}) => {
  const [soon, setSoon] = useState<boolean | null>(null);
  useEffect(() => {
    if (soon !== null && on === soon) setSoon(null);
  }, [on, soon]);
  const set = (vision: boolean) => {
    setSoon(vision);
    businessTabSave.saver.save({
      row: "vision",
      patch: (c) => ({ ...c, features: { ...(c.features || {}), vision } }),
      said: BUSINESS_TAB.VISION_SWITCH_WORDS.saved(vision),
      flash: (f: LegacyFlash) => {
        if (f && f.tone === "danger") setSoon(null);
        flash(f);
      },
    });
  };
  return (
    <RecordSwitch
      on={soon ?? on}
      onChange={set}
      label={BUSINESS_TAB.VISION_SWITCH_WORDS.label}
      describedBy="rec-can-vision-says"
      readOnly={!canEdit}
      gate={canEdit ? null : gate("settings", BUSINESS_TAB.VISION_SWITCH_WORDS.gate)}
      testid="rec-can-vision-switch"
    />
  );
};

/** One thing the receptionist cannot do: a line, and what it is instead, kept where the abilities keep theirs. */
const BtcCannotRow = ({ limit }: { limit: Limit }) => (
  <div className="rec-row bt-cannot-row" data-testid={`rec-cannot-${limit.id}`} title={limit.detail}>
    <span className="rec-row-key">{limit.title}</span>
    <span className="bt-can-says">{limit.detail}</span>
  </div>
);

/* ------------------------------------ the card ------------------------------------ */

/**
 * A door opens a row by its id, as the gap line's does (tab.tsx says how the registry asks first). The page passes its
 * own (tab.tsx btDoorFrom), which takes a row on another page there, open; drawn alone, the card opens rows in place.
 */
const btcOpenRow = (id: string) => {
  recFolds.request(id);
};

/** Whether a stored reply mode is one the Autonomy pane keeps. An unknown one holds at the edge, and holds here. */
const btcReplyMode = (stored: string) => BUSINESS_TAB.POLICY_MODES.find((m) => m === stored) ?? "ask";

/** The card's frame: its title, and under it the line that says whose lines these are, once the rows are there. */
/** The card's section and head, around what it says: a call, not a component, so the section is what the card draws. */
const btcCard = (lined: boolean, children: ReactNode) => (
  <section className="rec-card" data-testid="rec-card-can" aria-labelledby="bt-can-title">
    <div className="rec-card-head">
      <h2 className="rec-card-title" id="bt-can-title">
        What it can do
      </h2>
      {lined ? <span className="rec-card-sub">On the lines that answer</span> : null}
    </div>
    {children}
  </section>
);

/**
 * What the card reads, once all three surfaces are in: the connections (null when that read failed), the Autonomy
 * rows (null when that failed) and the approved messages (null when that failed).
 */
interface CanReads {
  dto: SetupSurface["dto"] | null;
  rows: PoliciesSurface["rows"] | null;
  templates: TemplateDto[] | null;
}

/**
 * Whether a connection is live, decided where Setup decides them: ready, tested and switched on by the owner.
 * `activating` names what the page is about to switch on (the first run's Live, whose Finish records it): asked of the
 * same rule, with that activation on record, so a capability never tested is still not live here.
 */
const btcLive = (dto: SetupSurface["dto"] | null, activating: readonly string[] | null, kind: "voice" | "whatsapp") => {
  if (!dto) return false;
  const on =
    activating && activating.indexOf(kind) >= 0
      ? {
          ...dto,
          activations: (dto.activations || []).concat([
            { capability: kind, activated_at: new Date().toISOString(), activated_by: null, deactivated_at: null },
          ]),
        }
      : dto;
  return !!BUSINESS_TAB.capabilityStatus(kind, on).live;
};

/** Whether the profile gave the receptionist any reason to hand a customer over. */
const btcHasReasons = (profile: Brain["profile"]) =>
  Array.isArray(profile?.escalate_when) && profile.escalate_when.some((r) => typeof r === "string" && r.trim() !== "");

/**
 * The six abilities, from the inputs each comes from -- none of them a number or a sentence the page works out for
 * itself (the plan's table under Task 4.1 step 3). abilityRows throws on an input left out, so a wiring slip is an
 * error here rather than a card that quietly says a live line is dark.
 */
const btcAbilities = (
  brain: Brain,
  config: Config | null,
  reads: { dto: NonNullable<CanReads["dto"]>; rows: NonNullable<CanReads["rows"]>; templates: TemplateDto[] },
  activating: readonly string[] | null,
): Abilities => {
  const profile = brain.profile || {};
  const { dto, rows, templates } = reads;
  const reply = rows.filter((r) => r && r.class === "reply")[0] || null;
  return BUSINESS_TAB.abilityRows({
    voiceLive: btcLive(dto, activating, "voice"),
    whatsappLive: btcLive(dto, activating, "whatsapp"),
    hasCalendarFeed: !!config?.calendar?.ical_url,
    // By the resolver's own test (contracts offersBookingLink), as every reader of the link asks.
    hasBookingLink: BUSINESS_TAB.offersBookingLink(brain),
    // Whether the workspace is asked for one at all, by how its customers buy (contracts bookingLinkOptional).
    linkOptional: BUSINESS_TAB.bookingLinkOptional(businessTabSave.answer()),
    // The template retell-fn picks the call's message with, asked of contracts, never matched by name here.
    // The list is known to be one by now: a failed read is said above, not read as "no approved message".
    hasBookingTemplate: !!BUSINESS_TAB.bookingTemplate(templates),
    hasHandoffNumber: !!profile.handoff_number,
    hasEscalateWhen: btcHasReasons(profile),
    // Exactly as stored: usually nothing, which contracts reads as a day, as the Autonomy pane does.
    pauseHours: reply && reply.limits ? reply.limits.pause_hours : undefined,
    visionOn: config?.features?.vision === true,
    bookingHeld: btcBookingHeld(rows),
    // And the REPLIES row, with the edge's own default for a row that is not there (reply-posture.ts: "ask").
    replyMode: btcReplyMode(reply ? reply.mode : "ask"),
  });
};

/**
 * The edge's own question about the BOOKING row (retell-fn.ts), never a copy of the rule: the abilities and the limits
 * both read it. A policies read that failed holds nothing.
 */
function btcBookingHeld(rows: CanReads["rows"]): boolean {
  if (!rows) return false;
  return BUSINESS_TAB.bookingHeld(
    Object.fromEntries(rows.filter((r) => r && r.class).map((r) => [r.class, { mode: r.mode }])),
  );
}

/** What holds the whole card back, said once above the rows, with the door to the tab that fixes it. */
const BtcHeld = ({ held }: { held: NonNullable<Abilities["held"]> }) => (
  <p className="bt-can-held" data-testid="rec-can-held">
    <span id="bt-can-held-words">{held.sentence}</span>{" "}
    <button
      type="button"
      className="bt-link"
      onClick={() => navigate(held.to)}
      aria-describedby="bt-can-held-words"
      data-testid="rec-can-held-door"
    >
      {held.door}
    </button>
  </p>
);

/**
 * The abilities' rows, or what could not be read, named: the card says which surface rather than "something". The
 * connections are the whole card's -- every row of it, the limits included, turns on the lines that answer -- so that
 * one is said ONCE, in place of everything, with one Retry. What the settings surface lost is the abilities' alone, and
 * the three limits stand under it.
 */
const BtcAbilityRows = ({
  abilities,
  reads,
  door,
  vision,
}: {
  abilities: Abilities | null;
  reads: CanReads;
  door: ((id: string) => void) | null;
  /** The photo switch, drawn on its ability's row; null where the card is drawn without one (the first run's Live). */
  vision: ReactNode;
}) => {
  const lost = [
    reads.rows ? null : "the Autonomy tab",
    Array.isArray(reads.templates) ? null : "your approved messages",
  ].filter(Boolean);
  return abilities ? (
    <>
      {abilities.rows.map((a) => (
        <BtcRow
          key={a.id}
          ability={a}
          words={BUSINESS_TAB.ABILITY_CHANNEL_WORDS}
          door={door}
          end={a.id === "vision" ? vision : null}
        />
      ))}
    </>
  ) : (
    <FailedRead kind="line" what={lost.join(" and ")} surface="settings" testid="rec-can-unread" />
  );
};

/**
 * The things it cannot do, under the abilities, folded behind one line that counts them (Ruben, 17 Oct 2026: the card
 * said three things nobody can switch on, in full, on every visit). Open, each is a line, and what it is instead its tip.
 */
const BtcCannot = ({ limits }: { limits: Limit[] }) => (
  <details className="bt-can-group" data-testid="rec-card-cannot">
    <summary className="bt-can-group-head" id="bt-cannot-title">
      {BUSINESS_TAB.cannotFoldWords(limits.length)}
    </summary>
    {limits.map((c) => (
      <BtcCannotRow key={c.id} limit={c} />
    ))}
  </details>
);

/**
 * What it can do (spec §4.7), after *How it answers* and before the services sheet.
 *
 * Every input comes from its own source and none is a number or a sentence the page works out for itself (the plan's
 * table under Task 4.1 step 3).
 */
export const BtCanCard = ({
  brain,
  config,
  canEdit,
  activating = null,
  door = btcOpenRow,
  flash = null,
}: {
  brain: Brain;
  config: Config | null;
  canEdit: boolean;
  activating?: readonly string[] | null;
  /** How a row's door opens the row that supplies what is missing: in place, unless the page says otherwise. */
  door?: (id: string) => void;
  /** The page's toast: where there is one, the photo row carries its switch (the first run's Live draws none). */
  flash?: ((f: LegacyFlash) => void) | null;
}) => {
  // Undefined until the surface is read, null when the read FAILED, and the two are not one answer
  // (setup, settings take the same stance). On a cold boot the settings surface
  // lands well before Setup -- the boot queue puts the tab's own surface first and setupOverride is
  // fourteenth of sixteen -- so a healthy workspace read "Couldn't read the connections", with a
  // Retry, for as long as that took. A surface still on its way is waited for.
  const setup = setupNow();
  const policies = policiesNow();
  const templates = templatesAllNow() as TemplateDto[] | null | undefined;
  if (setup === undefined || policies === undefined || templates === undefined) {
    return btcCard(
      false,
      <p className="bt-can-reading" data-testid="rec-can-reading">
        Reading your connections{"…"}
      </p>,
    );
  }
  const dto = setup && setup.dto ? setup.dto : null;
  if (!dto) {
    return btcCard(false, <FailedRead kind="line" what="the connections" surface="setup" testid="rec-can-unread" />);
  }
  const rows = policies && Array.isArray(policies.rows) ? policies.rows : null;
  const reads: CanReads = { dto, rows, templates };
  const abilities =
    rows && Array.isArray(templates) ? btcAbilities(brain, config, { dto, rows, templates }, activating) : null;
  // Texting reads `ready`, not `live`: `live` needs a tested that texting never records (capabilities.ts), so it can
  // never be true, and the row would say texting is not sold on a line where it is on.
  const limits = BUSINESS_TAB.cannotRows({
    smsLive: BUSINESS_TAB.capabilityStatus("sms", dto).ready,
    hasBookingLink: BUSINESS_TAB.offersBookingLink(brain),
    // A time a customer picks waits for the owner where the workspace takes booking requests (decision 0061).
    takesRequests: BUSINESS_TAB.takesBookingRequests({
      switchOn: config?.features?.booking_requests === true,
      linkInChat: BUSINESS_TAB.offersBookingLink(brain),
      bookingHeld: btcBookingHeld(rows),
    }),
  });
  return btcCard(
    true,
    <>
      {abilities && abilities.held ? <BtcHeld held={abilities.held} /> : null}

      <BtcAbilityRows
        abilities={abilities}
        reads={reads}
        door={canEdit ? door : null}
        vision={
          flash ? <BtcVisionSwitch on={config?.features?.vision === true} canEdit={canEdit} flash={flash} /> : null
        }
      />

      <BtcCannot limits={limits} />
    </>,
  );
};
