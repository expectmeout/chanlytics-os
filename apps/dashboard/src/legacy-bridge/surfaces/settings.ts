/**
 * The settings override: the workspace's record and facts, its team, policies,
 * channels and templates, as the Business tab and Settings read them. Part of
 * the SurfaceData seam (../surface-data.ts); its sibling surfaces are the other
 * modules in this folder.
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
  type TemplateSentWords,
  type ResolvedFacts,
  type FactConflict,
  toChannelVM,
  type ChannelVM,
} from "@chanlytics/contracts";
import type { PromptPreviewDto } from "../../server/receptionist/prompt-preview";
import { read } from "../api";
import { pageClock, workspaceZone } from "../zone";
import type { PoliciesSurface } from "../policy-store";
import type { Output } from "../../client/api";
import type { SurfaceOverride } from "../surface-data";
import { declareReads } from "../surface-registry";
import type { TemplateDto } from "@/surfaces/inbox/types";
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
    profile?: Record<string, unknown>;
  };
}

/** What Settings holds of the workspace (`__SETTINGS`): its config, the version it is at, and the prompt the receptionist reads. */
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
}

/** A member of the workspace, and an invitation nobody has taken yet, as the team read answers them. */
export type TeamMember = Output<"GET team">["members"][number];
export type TeamInvite = Output<"GET team">["invites"][number];

/** What each template is used by, as the card says it (`__TEMPLATE_USE`), by the template's name. */
export type TemplateUse = Record<
  string,
  { words: string; note: string | null; unused: boolean; playbook: string | null; running: boolean }
>;

/**
 * The slice of Settings a TSX surface reads through `useSurface("settings")`: the workspace's record, its channels and its
 * templates with what uses each and when each last went out, exactly what the globals below hold, and each null where
 * that read failed. Campaigns' Templates and the panes of Settings that have moved read it; the rest still read the
 * globals. Its templates are the one read of them (decision 0047, task 3.3): every row with its status, from which everything
 * that offers a message to send is made (surfaces/offered-templates.ts): the Inbox's reply box and the New conversation sheet,
 * both composers, and Campaigns' home. None of them reads GET templates of its own.
 */
export interface SettingsSurface {
  settings: SettingsRecord | null;
  /** What the workspace's facts resolve to, and where two sources disagree (`__FACTS`); null on a broken config. */
  facts: { facts: ResolvedFacts; conflicts: FactConflict[] } | null;
  channels: ChannelVM[] | null;
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
   * The workspace's policy rows (`__POLICIES`), null where that read failed: Settings › Autonomy's matrix and dials.
   * Absent from a value kept from before it was carried, which the pane reads as not yet read.
   */
  policies?: PoliciesSurface | null;
  /** The roster and its open invitations (`__TEAM`, `__TEAM_INVITES`), each null where the team read failed: Settings › Team. */
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
      limits:
        r.limits && typeof r.limits === "object" && !Array.isArray(r.limits)
          ? (r.limits as Record<string, unknown>)
          : {},
    })),
    role: pol.role ?? null,
    // Deals on or off (0008): the follow-ups' row is drawn only where they are on (0006).
    dealsOn: !!pol.deals_on,
  };
}

export const settingsOverride: SurfaceOverride = {
  key: "settings",
  value: "settings",
  globals: [
    "__SETTINGS",
    "__FACTS",
    "__TEAM",
    "__TEAM_INVITES",
    "__POLICIES",
    "__CHANNELS",
    "__TEMPLATES_ALL",
    "__TEMPLATE_USE",
    "__TEMPLATE_SENT",
  ],
  events: ["surface:settings"],
  // What it draws that no other surface owns (0047): the business's facts and the version the next save sends
  // (tenant_config), the Autonomy matrix (policies), the Library and what each template is used by (templates), the Team pane
  // (memberships, invitations). A teammate's save, Meta's answer to a template, a seat taken: each reached another open tab
  // only at a return or a reload. Told a few times a day, so heard wherever the tab is; this tab's own save is read once, by
  // the refresh map, and its notice asks for nothing (surface-runner.ts readAfter).
  ...declareReads("settings", { reads: ["facts", "rules", "template", "team"], fresh: "live" }),
  apply: async () => {
    const [cfg, team, pol, ch, tpl, zone] = await Promise.all([
      read("GET settings"),
      // A team read that fails must not blank the business card beside it.
      read("GET team").catch((e: unknown) => e as Error),
      // The autonomy matrix. Same rule: a failed read is its own state (null),
      // never the mockup's charter.
      read("GET policies").catch((e: unknown) => e as Error),
      // The numbers the business is reachable on, for Integrations.
      read("GET channels").catch((e: unknown) => e as Error),
      // Every template with its status, for the Integrations pane's card.
      read("GET templates", { query: { all: "1" } }).catch((e: unknown) => e as Error),
      // When a template last went out is a date past a week, on the business's
      // calendar (zone.ts). A zone that cannot be read is the page clock's, and
      // never a reason to lose the page.
      workspaceZone().catch(() => pageClock().zone()),
    ]);
    const w = window as unknown as {
      __SETTINGS?: SettingsRecord;
      __FACTS?: { facts: ResolvedFacts; conflicts: FactConflict[] } | null;
      __TEAM?: TeamMember[] | null;
      __TEAM_INVITES?: TeamInvite[] | null;
      __POLICIES?: PoliciesSurface | null;
      __CHANNELS?: ChannelVM[] | null;
      __TEMPLATES_ALL?: TemplateDto[] | null;
      __TEMPLATE_USE?: TemplateUse | null;
      __TEMPLATE_SENT?: Record<string, TemplateSentWords> | null;
    };
    // `broken` is its own state, not an empty config: the pane closes its
    // forms on it, because a save from a form that read {} would replace the
    // broken row with the form's few fields.
    // The prompt rides with the config: composed on the server from inputs the
    // browser cannot see, null when there is no receptionist to compose for.
    w.__SETTINGS = cfg.configBroken
      ? {
          config: null,
          version: cfg.version,
          role: cfg.role,
          broken: { issues: cfg.issues ?? [] },
          prompt: null,
          updatedBy: null,
          updatedAt: null,
          reviewLink: false,
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
        };
    // Resolved on the server, where the channel rows and the listing are. Null
    // on a broken config for the same reason the forms close: there is nothing
    // trustworthy to resolve against.
    w.__FACTS = cfg.configBroken ? null : { facts: cfg.facts, conflicts: cfg.conflicts };
    if (ch instanceof Error) {
      w.__CHANNELS = null;
      console.error("settings_channels_fetch_failed", ch.message);
    } else {
      const now = new Date();
      w.__CHANNELS = (ch.channels ?? []).map((c) => toChannelVM(c, now));
    }
    if (tpl instanceof Error) {
      w.__TEMPLATES_ALL = null;
      w.__TEMPLATE_USE = null;
      w.__TEMPLATE_SENT = null;
      console.error("settings_templates_fetch_failed", tpl.message);
    } else {
      w.__TEMPLATES_ALL = (tpl.templates ?? []).filter((t) => t.channel === "whatsapp");
      // Every message on file, WhatsApp's or not: a message written for email or text alone is as much a row of the Library
      // as one WhatsApp holds, and what sends it and how much went out are read of it by its name too.
      const everyMessage = settingsMessagesOf(tpl, w.__TEMPLATES_ALL, versionRowsOf(tpl)) ?? [];
      const names = [...new Set([...w.__TEMPLATES_ALL.map((t) => t.name), ...everyMessage.map((m) => m.name)])];
      // The usage covers every starter too, added or not: a starter nobody added
      // is still a row on the page, and "nothing sends it" is a reading about it,
      // not a gap in the map.
      const useNames = [...new Set([...names, ...STARTER_TEMPLATES.map((st) => st.name)])];
      // What sends each of them, as the sentence the card draws. Keyed by NAME:
      // a template is one message in several languages, and the thing that sends
      // it names the message. Every name gets an entry, so a name MISSING from
      // the map means the usage was not read -- never "nothing sends it".
      const used = tpl.usedBy ?? {};
      w.__TEMPLATE_USE = Object.fromEntries(
        useNames.map((name) => {
          const u = used[name] ?? { playbooks: [], broadcasts: 0, recent: [], booking: false };
          return [
            name,
            {
              words: templateUseWords(u),
              note: templateUseNote(u),
              unused: templateUnused(u),
              playbook: u.playbooks.length === 1 ? u.playbooks[0].id : null,
              running: u.playbooks.some((p) => !p.paused),
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
      w.__TEMPLATE_SENT = sends
        ? Object.fromEntries(names.map((name) => [name, templateSentWords(sends[name], zone, now)]))
        : null;
    }
    if (pol instanceof Error) {
      w.__POLICIES = null;
      console.error("settings_policies_fetch_failed", pol.message);
    } else {
      w.__POLICIES = policiesOf(pol);
    }
    if (team instanceof Error) {
      // null, not [] — "we could not read the team" and "there is nobody" are
      // different facts, and only one of them should render as an empty list.
      w.__TEAM = null;
      w.__TEAM_INVITES = null;
      console.error("settings_team_fetch_failed", team.message);
    } else {
      w.__TEAM = team.members ?? [];
      // The API has always returned open invitations and nothing rendered
      // them, so an invitation that was sent, accepted or revoked was
      // invisible on the one card whose job is saying who has access.
      w.__TEAM_INVITES = team.invites ?? [];
    }
    // The slice a TSX surface reads (Campaigns' Templates), published beside the globals it copies.
    const versions = versionRowsOf(tpl);
    setSurfaceValue("settings", {
      settings: w.__SETTINGS ?? null,
      facts: w.__FACTS ?? null,
      channels: w.__CHANNELS ?? null,
      templatesAll: w.__TEMPLATES_ALL ?? null,
      templateVersions: versions,
      messages: settingsMessagesOf(tpl, w.__TEMPLATES_ALL ?? null, versions),
      templateUse: w.__TEMPLATE_USE ?? null,
      templateSent: w.__TEMPLATE_SENT ?? null,
      policies: w.__POLICIES ?? null,
      team: w.__TEAM ?? null,
      invites: w.__TEAM_INVITES ?? null,
    });
    // The policy chips listen for this and nothing else (the kit's PolicyChip): one drawn before the modes were read
    // says none (policy-store.ts), and went on saying none until a mode was next changed by hand.
    window.dispatchEvent(new CustomEvent("policy:changed"));
  },
};
