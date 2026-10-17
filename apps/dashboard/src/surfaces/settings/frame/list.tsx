/**
 * Settings on a phone, before a section is picked: its sections as a grouped list, as the rail groups them on a desk
 * (Ruben, 17 Oct 2026, the "Settings, split" canvas's Phone · Settings is a list). Each row is a link to its section,
 * which opens as a page of its own whose way back is this list. It replaces a strip of nine tabs that ran off the screen,
 * whose way back opened Business again.
 *
 * A row says one fact beside its name where the page already holds it, and nothing where it would have to read
 * something to say it: who you are on the team, the business's name, the languages it answers in, and in the warning
 * tone the page that holds the fact most worth adding (contracts' businessGap, the gap line's own).
 */
import { ROLE_SAYS, roleSays } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { meNow, routeDoor } from "../../legacy-verbs";
import { settingsNow } from "../business/shell";
import type { SetTab } from "./tabs";

type Said = { words: string; warn?: boolean } | null;

/** The business's record as the settings read holds it, or nothing. */
const brainNow = () =>
  (settingsNow()?.config as { brain?: { business_name?: unknown; profile?: { languages?: unknown } } } | null)?.brain ??
  null;

/** What a section's row says beside its name: the gap's page first, then the one fact the page holds, else nothing. */
const sectionSaid = (id: string, gapPane: string | null): Said => {
  if (gapPane === id) return { words: "To add", warn: true };
  if (id === "profile") {
    const role = meNow()?.role;
    return role && Object.hasOwn(ROLE_SAYS, role) ? { words: roleSays(role).label } : null;
  }
  const brain = brainNow();
  if (id === "workspace" && typeof brain?.business_name === "string" && brain.business_name.trim())
    return { words: brain.business_name.trim() };
  const languages = brain?.profile?.languages;
  if (id === "receptionist" && Array.isArray(languages)) {
    const named = languages.filter((l): l is string => typeof l === "string" && l.trim() !== "");
    return named.length ? { words: named.join(", ") } : null;
  }
  return null;
};

export function SettingsList({
  groups,
  gapPane,
  onTab,
  warm,
}: {
  groups: { name: string | undefined; tabs: SetTab[] }[];
  gapPane: string | null;
  onTab: (tab: string) => void;
  warm: Partial<Record<string, () => void>>;
}) {
  return (
    <nav className="set-list" aria-label="Settings sections" data-testid="set-list">
      {groups.map((g) => (
        <section className="set-list-group" key={g.name} aria-label={g.name}>
          {g.name ? <h2 className="set-list-head">{g.name}</h2> : null}
          <div className="rec-card set-list-rows">
            {g.tabs.map((t) => {
              const said = sectionSaid(t.id, gapPane);
              // A link to its section (a long press or a new tab opens it); a plain press is the page's own move.
              const door = routeDoor(`admin/${t.id}`, () => onTab(t.id));
              // Reached for, its page is warmed as any link's is, and its own read too where it has one (page.tsx WARM).
              const reach = () => {
                door.onPointerEnter?.();
                warm[t.id]?.();
              };
              return (
                <a
                  key={t.id}
                  className="set-list-row"
                  href={door.href}
                  onClick={door.onClick}
                  onPointerEnter={reach}
                  onFocus={reach}
                  data-testid={`set-list-${t.id}`}
                >
                  <span className="set-list-glyph" aria-hidden="true">
                    <Icon name={t.icon} size={15} />
                  </span>
                  <span className="set-list-name">{t.label}</span>
                  {said ? (
                    <span className="set-list-said" data-tone={said.warn ? "warn" : undefined}>
                      {said.words}
                    </span>
                  ) : null}
                  <span className="set-list-go" aria-hidden="true">
                    <Icon name="chevron" size={13} />
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
