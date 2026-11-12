/**
 * The settings override: the workspace's record and facts, its team, policies
 * and templates, as the Business tab and Settings read them. The channels are
 * their own read (surfaces/channels/surface.ts). Part of the SurfaceData seam
 * (../surface-data.ts); its sibling surfaces are the other modules in this folder.
 */

import {
  OWN_VERSION_CHANNELS,
  STARTER_TEMPLATES,
  campaignMessagesOf,
  isReachOutRow,
  templateSentWords,
  templateUnused,
  templateUseNote,
  templateUseWords,
  type CampaignMessage,
  type PolicyLimits,
  type TemplateSentWords,
  type ResolvedFacts,
  type FactConflict,
} from "@chanlytics/contracts";
import type { PromptPreviewDto } from "../../server/receptionist/prompt-preview";
import { read } from "../api";
import { pageClock, workspaceZone } from "../zone";
import type { PoliciesSurface } from "../policy-store";
import type { Output } from "../../client/api";
import type { SurfaceOverride } from "../surface-data";
import { declareReads } from "../surface-registry";
import type { TemplateDto } from "@/surfaces/inbox/types";
import type { StoredProfile } from "@/surfaces/settings/business/save";
import { setSurfaceValue } from "../../surfaces/surface-values";

/**
 * Settings · Workspace — the business's own facts, and who is on the team.
 *
 * The pane rendered "Serenity Spa · +1 (415) 555-0100 · Lena Park, Jay Rivera"
 * — a fabricated business with fabricated staff, shown to a real owner as their
 * own settings. Both APIs behind it have existed since Session B with nothing
 * calling them.
 *
 * Team is fetched even though the card is small: leaving it seeded would mean
 * flipping this pane to "real" while half of it was still invented, which is
 * exactly the thing the surface registry exists to prevent.
 */
export interface WorkspaceSettings {
  brain?: {
    business_name?: string;
    phone_display?: string;
    booking_link?: string;
    /**
     * The business's profile, by the fields the Business tab names (settings/business/save.tsx StoredProfile). Said, not a
     * record of `unknown`, so the settings read's snapshot has a fingerprint and is drawn across a deploy that left its type
     * alone (surface-cache.ts, SURFACE_SHAPES): every deploy left Settings' panes to a cold read.
     */
    profile?: StoredProfile;
  };
  /**
   * The calendar's feed, as the read hands it over: whole to an owner, masked to anyone else (server/readers/settings.ts
   * feedVisibleTo). Ask's palette offers the day's questions where one is set (palette.ts).
   */
  calendar?: { ical_url?: string | null } | null;
}

/** What Settings holds of the workspace (the surface's `settings`): its config, the version it is at, and the prompt the receptionist reads. */
export interface SettingsRecord {
  config: WorkspaceSettings | null;
  version: number;
  role: string;
  broken: { issues: string[] } | null;
  prompt: PromptPreviewDto | null;
  updatedBy: string | null;
  updatedAt: string | null;
  /**
   * Whether the Google listing keeps a review link (GET settings' `review_link`): the Library and its composer offer the
   * review ask only where it does (templates/verbs.ts starters.list). False on a broken config and from an older server.
   */
  reviewLink: boolean;
  /** Whether this workspace makes previews for its leads (GET settings' previews, decision 0079): ours alone. */
  previews: boolean;
}

/** A member of the workspace, and an invitation nobody has taken yet, as the team read answers them. */
export type TeamMember = Output<"GET team">["members"][number];
export type TeamInvite = Output<"GET team">["invites"][number];

/**
 * What each template is used by, as the card says it (the surface's `templateUse`), by the template's name: the words after "Sent by",
 * the line under them, the one sequence that sends it, where its link opens (null: several, or none, so the list), whether
 * a step that runs sends it, and whether the Inbox books with it. The last two are what Messages calls going out.
 */
export type TemplateUse = Record<
  string,
  { words: string; note: string | null; unused: boolean; sequence: string | null; running: boolean; booking: boolean }
>;

/**
 * The slice of Settings a TSX surface reads through `useSurface("settings")`: the workspace's record and its templates with
 * what uses each and when each last went out (the channels are their own read, surfaces/channels/surface.ts), and each null
 * where that read failed. Every reader of the settings read reads it here. It was published on the window too, beside this,
 * and let go one global at a time as its last reader moved: what uses a template and when it last went out first (nothing
 * read them from the window, 11 Nov 2026), then the facts, the roster and its invitations, WhatsApp's rows, and on 12 Nov
 * 2026 the policy rows and the record itself, the last. With nothing of it on the window, the cache keeps the value whole
 * and may draw it under another build whose shape for it is the same (surface-cache.ts drawable).
 *
 * Its templates are the one read of them (decision 0047, task 3.3): every row with its status, from which everything that
 * offers a message to send is made (surfaces/offered-templates.ts): the Inbox's reply box and the New conversation sheet,
 * both composers, and Campaigns' home. None of them reads GET templates of its own.
 */
export interface SettingsSurface {
  settings: SettingsRecord | null;
  /** What the workspace's facts resolve to, and where two sources disagree; null on a broken config. */
  facts: { facts: ResolvedFacts; conflicts: FactConflict[] } | null;
  /** WhatsApp's rows, with every status (approved or not, hidden or not): the pickers keep the ones contracts templateOffered says. */
  templatesAll: TemplateDto[] | null;
  /**
   * A message's other versions (One message, every channel, step 1): the workspace's email and text rows, which the
   * Templates page sets beside each message's WhatsApp rows by their name. `templatesAll` stays WhatsApp's alone, so
   * the Inbox, which offers WhatsApp's only, reads it as it did; the composers add these to make their messages. A
   * reach-out's emails are not here (their own list), and null is a read that failed, as it is for `templatesAll`.
   */
  templateVersions?: TemplateDto[] | null;
  /**
   * The workspace's messages, one a name and language, each with the versions it holds on WhatsApp, email and text
   * (contracts campaignMessagesOf): a WhatsApp version still in review keeps its status inside its message, and a message
   * with no WhatsApp row is one. The read's own, made of every row; where the read does not carry them (an older server
   * answering this bridge) they are made here of `templatesAll` and `templateVersions` (settingsMessagesOf).
   * `templatesAll` stays WhatsApp's alone, as the Inbox, setup and the phone read it. Null is a read that failed, as it
   * is for `templatesAll`.
   */
  messages: CampaignMessage[] | null;
  templateUse: TemplateUse | null;
  templateSent: Record<string, TemplateSentWords> | null;
  /**
   * The workspace's policy rows, null where that read failed: Settings › Autonomy's matrix and dials, and every policy
   * chip (policy-store.ts; a global beside this, `__POLICIES`, until 12 Nov 2026). Absent from a value kept from before it
   * was carried, which the pane and the chips read as not yet read.
   */
  policies?: PoliciesSurface | null;
  /**
   * The roster and its open invitations, each null where the team read failed: Settings › Team, the name a thread's holder
   * is said by (surfaces/holder-names.ts) and the bell's rows for an invitation nobody took (bridge/notifications.ts).
   */
  team?: TeamMember[] | null;
  invites?: TeamInvite[] | null;
}

/** The email and text rows among the templates read, for the page that draws a message's versions; null where the read failed. */
function versionRowsOf(tpl: Error | { templates?: TemplateDto[] }): TemplateDto[] | null {
  if (tpl instanceof Error) return null;
  return (tpl.templates ?? []).filter(
    (t) => (OWN_VERSION_CHANNELS as readonly string[]).includes(t.channel) && !isReachOutRow(t),
  );
}

/**
 * The workspace's messages as the surface holds them: the read's own, or, where it carries none (a server from before the
 * read answered them), made of the rows the surface keeps, which are every row a message is made of: WhatsApp's in
 * `templatesAll` and the email and text rows in `templateVersions` (a reach-out's emails belong to no message). Null where
 * the read failed.
 */
function settingsMessagesOf(
  tpl: Error | { messages?: CampaignMessage[] },
  whatsapp: readonly TemplateDto[] | null,
  versions: readonly TemplateDto[] | null,
): CampaignMessage[] | null {
  if (tpl instanceof Error) return null;
  return tpl.messages ?? campaignMessagesOf([...(whatsapp ?? []), ...(versions ?? [])]);
}

/** The policies read as the autonomy matrix draws it. */
function policiesOf(pol: Output<"GET policies">): PoliciesSurface {
  return {
    // `limits` is a JSON column: an object when set, and anything else reads as none.
    rows: (pol.policies ?? []).map((r) => ({
      class: r.class,
      mode: r.mode,
      limits: r.limits && typeof r.limits === "object" && !Array.isArray(r.limits) ? (r.limits as PolicyLimits) : {},
    })),
    role: pol.role ?? null,
    // What the owner's corrections show (decision 0063): absent from a server from before, which reads as unread.
    held: pol.held ?? null,
    suggestions: pol.suggestions ?? null,
    // The people set differently (the Settings wiring review, item 10): absent from a server from before, read as unread.
    ownModes: pol.own_modes ?? null,
    // The day's budget said in replies (item 12): absent from a server from before, said in tokens.
    replyTokens: pol.reply_tokens ?? null,
    // What each sequence's batches did (decision 0064, step 5): absent from a server from before, read as unread.
    evidence: pol.evidence ?? null,
  };
}

export const settingsOverride: SurfaceOverride = {
  key: "settings",
  value: "settings",
  // Nothing on the window: every reader takes the settings surface (`value`), which the cache keeps whole.
  globals: [],
  events: ["surface:settings"],
  // What it draws that no other surface owns (0047): the business's facts and the version the next save sends
  // (tenant_config), the Autonomy matrix (policies), the Library and what each template is used by (templates), the Team pane
  // (memberships, invitations). A teammate's save, Meta's answer to a template, a seat taken: each reached another open tab
  // only at a return or a reload. Told a few times a day, so heard wherever the tab is; this tab's own save is read once, by
  // the refresh map, and its notice asks for nothing (surface-runner.ts readAfter). And what the Library says of each message,
  // what sends it and how many it sent: the playbooks and the runs, which move several times a run, so heard where the Library
  // and Settings' panes are drawn and read once as one comes back (surface-registry.ts PAGE_HEARS; the wiring's second audit,
  // W-campaign-run-template-reachout-2), and Campaigns' home, whose message drawer is the Library's pane. And what the Business
  // pane resolves the facts from beside the settings, where it is drawn: the channel rows and the line ("from your line": the
  // number, the forwarded one), and the Google listing ("from Google", its conflicts, and the review link the Library's review
  // ask and the composers' review slot need: W-review-facts-rules-3, S1-4). A line's saga and the listing's daily read move them
  // a few times a day, so on its pages alone: Sent's and Playbooks' composers draw the review link too (PAGE_HEARS).
  ...declareReads("settings", {
    // And the visits: the Business pane states the calendar's visits read (getKnownFacts reads the appointments), on its pages.
    reads: ["facts", "rules", "template", "team", "campaign", "send", "channel", "review", "visit"],
    fresh: "its-page",
    always: ["facts", "rules", "template", "team"],
    omit: [
      {
        tables: ["appointment_notices"],
        why: "a booking email held for a look is the Calendar's read, which the Business pane hears where it draws them",
      },
      {
        tables: ["mailboxes", "mailbox_connections", "capability_activations", "business_records"],
        why: "the settings read resolves its facts from the channel rows and the line; a mailbox, a connected mailbox, an activation and the carriers' record are Setup's read",
      },
      {
        tables: ["google_reviews", "google_connections"],
        why: "the facts and the review link are the listing's; a review seen and the profile's connection are Google's own read",
      },
    ],
  }),
  apply: async () => {
    const [cfg, team, pol, tpl, zone] = await Promise.all([
      read("GET settings"),
      // A team read that fails must not blank the business card beside it.
      read("GET team").catch((e: unknown) => e as Error),
      // The autonomy matrix. Same rule: a failed read is its own state (null),
      // never the mockup's charter.
      read("GET policies").catch((e: unknown) => e as Error),
      // Every template with its status, for the Integrations pane's card.
      read("GET templates", { query: { all: "1" } }).catch((e: unknown) => e as Error),
      // When a template last went out is a date past a week, on the business's
      // calendar (zone.ts). A zone that cannot be read is the page clock's, and
      // never a reason to lose the page.
      workspaceZone().catch(() => pageClock().zone()),
    ]);
    // `broken` is its own state, not an empty config: the pane closes its
    // forms on it, because a save from a form that read {} would replace the
    // broken row with the form's few fields.
    // The prompt rides with the config: composed on the server from inputs the
    // browser cannot see, null when there is no receptionist to compose for.
    // The surface's `settings` alone: a global beside it, `__SETTINGS`, until 12 Nov 2026.
    const record: SettingsRecord = cfg.configBroken
      ? {
          config: null,
          version: cfg.version,
          role: cfg.role,
          broken: { issues: cfg.issues ?? [] },
          prompt: null,
          updatedBy: null,
          updatedAt: null,
          reviewLink: false,
          previews: false,
        }
      : {
          config: cfg.config ?? {},
          version: cfg.version,
          role: cfg.role,
          broken: null,
          prompt: cfg.prompt ?? null,
          updatedBy: cfg.updatedBy ?? null,
          updatedAt: cfg.updatedAt ?? null,
          reviewLink: cfg.review_link === true,
          previews: cfg.previews === true,
        };
    // Resolved on the server, where the channel rows and the listing are. Null
    // on a broken config for the same reason the forms close: there is nothing
    // trustworthy to resolve against.
    const facts: SettingsSurface["facts"] = cfg.configBroken ? null : { facts: cfg.facts, conflicts: cfg.conflicts };
    // What uses each template and when each last went out are the surface's alone: null where the templates read failed.
    let templateUse: TemplateUse | null = null;
    let templateSent: Record<string, TemplateSentWords> | null = null;
    // WhatsApp's rows alone, as the Inbox, Setup and the phone read them: null where the templates read failed.
    let templatesAll: TemplateDto[] | null = null;
    if (tpl instanceof Error) {
      console.error("settings_templates_fetch_failed", tpl.message);
    } else {
      const whatsapp = (tpl.templates ?? []).filter((t) => t.channel === "whatsapp");
      templatesAll = whatsapp;
      // Every message on file, WhatsApp's or not: a message written for email or text alone is as much a row of the Library
      // as one WhatsApp holds, and what sends it and how much went out are read of it by its name too.
      const everyMessage = settingsMessagesOf(tpl, whatsapp, versionRowsOf(tpl)) ?? [];
      const names = [...new Set([...whatsapp.map((t) => t.name), ...everyMessage.map((m) => m.name)])];
      // The usage covers every starter too, added or not: a starter nobody added
      // is still a row on the page, and "nothing sends it" is a reading about it,
      // not a gap in the map.
      const useNames = [...new Set([...names, ...STARTER_TEMPLATES.map((st) => st.name)])];
      // What sends each of them, as the sentence the card draws. Keyed by NAME:
      // a template is one message in several languages, and the thing that sends
      // it names the message. Every name gets an entry, so a name MISSING from
      // the map means the usage was not read -- never "nothing sends it".
      const used = tpl.usedBy ?? {};
      templateUse = Object.fromEntries(
        useNames.map((name) => {
          const u = used[name] ?? { playbooks: [], broadcasts: 0, recent: [], booking: false };
          return [
            name,
            {
              words: templateUseWords(u),
              note: templateUseNote(u),
              unused: templateUnused(u),
              sequence: u.sequences?.length === 1 ? (u.sequences[0] ?? null) : null,
              // Running is on and not past its last day (S1-3).
              running: u.playbooks.some((p) => !p.paused && !p.ended),
              booking: u.booking,
            },
          ];
        }),
      );
      // How many of each went out and when the latest did, as the Sent column
      // says it, one entry per name on file. An answer without the roll-up is a
      // read that did not happen: null, and the column says nothing -- never a
      // column of "Never sent".
      const sends = tpl.sends;
      const now = Date.now();
      templateSent = sends
        ? Object.fromEntries(names.map((name) => [name, templateSentWords(sends[name], zone, now)]))
        : null;
    }
    // The Autonomy matrix and every policy chip (settings/business/shell.ts policiesNow): null where the read failed.
    if (pol instanceof Error) console.error("settings_policies_fetch_failed", pol.message);
    const policies: PoliciesSurface | null = pol instanceof Error ? null : policiesOf(pol);
    // null, not [] — "we could not read the team" and "there is nobody" are
    // different facts, and only one of them should render as an empty list.
    // The API has always returned open invitations and nothing rendered
    // them, so an invitation that was sent, accepted or revoked was
    // invisible on the one card whose job is saying who has access.
    if (team instanceof Error) console.error("settings_team_fetch_failed", team.message);
    const members: TeamMember[] | null = team instanceof Error ? null : (team.members ?? []);
    const invites: TeamInvite[] | null = team instanceof Error ? null : (team.invites ?? []);
    // Everything the settings read holds, in the one place every page reads it: nothing of it is on the window.
    const versions = versionRowsOf(tpl);
    setSurfaceValue("settings", {
      settings: record,
      facts,
      templatesAll,
      templateVersions: versions,
      messages: settingsMessagesOf(tpl, templatesAll, versions),
      templateUse,
      templateSent,
      policies,
      team: members,
      invites,
    });
    // The policy chips listen for this and nothing else (the kit's PolicyChip): one drawn before the modes were read
    // says none (policy-store.ts), and went on saying none until a mode was next changed by hand.
    window.dispatchEvent(new CustomEvent("policy:changed"));
  },
};
