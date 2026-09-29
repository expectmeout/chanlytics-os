/**
 * The settings override: the workspace's record and facts, its team, policies,
 * channels and templates, as the Business tab and Settings read them. Part of
 * the SurfaceData seam (../surface-data.ts); its sibling surfaces are the other
 * modules in this folder.
 */

import {
  STARTER_TEMPLATES,
  templateSentWords,
  templateUnused,
  templateUseNote,
  templateUseWords,
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
import type { SurfaceOverride } from "../surface-data";
import type { TemplateDto } from "./inbox";

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

export const settingsOverride: SurfaceOverride = {
  key: "settings",
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
      __SETTINGS?: {
        config: WorkspaceSettings | null;
        version: number;
        role: string;
        broken: { issues: string[] } | null;
        prompt: PromptPreviewDto | null;
        updatedBy: string | null;
        updatedAt: string | null;
      };
      __FACTS?: { facts: ResolvedFacts; conflicts: FactConflict[] } | null;
      __TEAM?: unknown[] | null;
      __TEAM_INVITES?: unknown[] | null;
      __POLICIES?: PoliciesSurface | null;
      __CHANNELS?: ChannelVM[] | null;
      __TEMPLATES_ALL?: TemplateDto[] | null;
      __TEMPLATE_USE?: Record<
        string,
        { words: string; note: string | null; unused: boolean; playbook: string | null; running: boolean }
      > | null;
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
        }
      : {
          config: cfg.config ?? {},
          version: cfg.version,
          role: cfg.role,
          broken: null,
          prompt: cfg.prompt ?? null,
          updatedBy: cfg.updatedBy ?? null,
          updatedAt: cfg.updatedAt ?? null,
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
      const names = [...new Set(w.__TEMPLATES_ALL.map((t) => t.name))];
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
              playbook: u.playbooks.length === 1 ? u.playbooks[0]!.id : null,
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
      w.__POLICIES = {
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
  },
};
