/**
 * The rail's Saved section (the table review of 5 Nov 2026): the three views the product offers, then the member's, between
 * Views and Searches. Views keeps meaning a lead's stage. A press takes a view's address and its layout together; no row
 * shows a count, which would read the status of the whole workspace on every first page. The rules and every word are
 * contracts' (leads/sheet/lead-named-views.ts); a phone lists the views and keeps none.
 */
import { useCallback, useRef, useState } from "react";
import {
  LEAD_NAMED_NAME_MAX,
  LEAD_NAMED_PAGE,
  LEAD_NAMED_WORDS as N,
  LEAD_STARTER_VIEWS,
  LEAD_WORDS as W,
  leadNamedActive,
  leadNamedAdd,
  leadNamedChanged,
  leadNamedRouteFor,
  leadNamedViewsOf,
  type LeadNamedLayout,
  type LeadNamedNow,
  type LeadNamedView,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Field } from "../../kit/field/field";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu } from "../../kit/menu/menu";
import { choicesFrom } from "../../kit/table/columns";
import type { TableState } from "../../kit/table/state";
import { plViewSaver } from "../../people/hooks/view-store";
import { MenuInPlace, moreButton } from "../../people/menu-groups";
import { RailRow, RailSection } from "../../people/rail/rail-kit";

/** What is being asked of a view in place: a name for a new one, a new name, or whether to remove it. */
type Asking = { kind: "new" } | { kind: "rename"; id: string } | { kind: "remove"; id: string } | null;

interface NamedArgs {
  /** Every page's kept view, the workspace's copy (People's read): this list's is one of them. */
  views: Readonly<Record<string, unknown>> | null | undefined;
  table: Pick<TableState, "chosen" | "visibility" | "columns" | "order" | "density" | "takeLayout">;
  /** The page's address as it stands, with no lead open. */
  route: string;
  searchIds: readonly string[];
  nav: (to: string) => void;
  phone: boolean;
  /** A view was pressed: a phone's sheet of lists closes. */
  onPicked: () => void;
  flash: (f: { tone: "warn"; msg: string }) => void;
  /** Where the list is kept: the one saver for a page's view, one save at a time. A test hands its own. */
  saver?: (view: Record<string, unknown>) => void;
}

/** A view's layout alone, as the table takes it. */
const layoutOf = ({ sortBy, sortDir, columns, order, density }: LeadNamedView): LeadNamedLayout => ({
  ...(sortBy !== undefined ? { sortBy } : {}),
  ...(sortDir !== undefined ? { sortDir } : {}),
  ...(columns !== undefined ? { columns } : {}),
  ...(order !== undefined ? { order } : {}),
  ...(density !== undefined ? { density } : {}),
});

/** The table's layout as it stands, as a view keeps it. */
const layoutNow = (now: LeadNamedNow): LeadNamedLayout => ({
  sortBy: now.by,
  sortDir: now.dir,
  columns: now.columns,
  order: [...now.order],
  density: now.density,
});

const nameTyped = (typed: string): string => typed.trim().slice(0, LEAD_NAMED_NAME_MAX);

/** The list and what can be done with it. A change shows at once and is kept behind it. */
export function useLeadNamedViews(a: NamedArgs) {
  const [changed, setChanged] = useState<LeadNamedView[] | null>(null);
  const [asking, ask] = useState<Asking>(null);
  const saver = useRef(a.saver ?? null);
  if (!saver.current) saver.current = plViewSaver(LEAD_NAMED_PAGE);
  const views = changed ?? leadNamedViewsOf(a.views?.[LEAD_NAMED_PAGE]);
  const now: LeadNamedNow = {
    route: a.route,
    by: a.table.chosen.by,
    dir: a.table.chosen.dir,
    columns: choicesFrom(a.table.columns, a.table.visibility),
    order: a.table.order,
    density: a.table.density,
  };
  const keep = (next: LeadNamedView[]) => {
    setChanged(next);
    ask(null);
    if (saver.current) saver.current({ list: next });
  };
  return {
    starters: LEAD_STARTER_VIEWS,
    views,
    asking,
    ask,
    isActive: (v: LeadNamedView) => leadNamedActive(v, now),
    hasMoved: (v: LeadNamedView) => leadNamedChanged(v, now),
    pick: (v: LeadNamedView) => {
      a.table.takeLayout(layoutOf(v) as Record<string, unknown>);
      a.nav(leadNamedRouteFor(v, a.searchIds));
      a.onPicked();
    },
    saveNew: (typed: string) => {
      const name = nameTyped(typed);
      if (!name) return;
      const id = `v${Date.now().toString(36)}`;
      const made = leadNamedAdd(views, { id, name, route: a.route, ...layoutNow(now) });
      if (made.list) keep(made.list);
      else a.flash({ tone: "warn", msg: made.refused });
    },
    rename: (id: string, typed: string) => {
      const name = nameTyped(typed);
      if (name) keep(views.map((v) => (v.id === id ? { ...v, name } : v)));
    },
    remove: (id: string) => keep(views.filter((v) => v.id !== id)),
    update: (id: string) => keep(views.map((v) => (v.id === id ? { ...v, ...layoutNow(now) } : v))),
  };
}
export type LeadNamed = ReturnType<typeof useLeadNamedViews>;

/** A name asked for in place: Enter or Save keeps it, Escape leaves. */
function NameBox({ was, onSave, onLeave }: { was: string; onSave: (name: string) => void; onLeave: () => void }) {
  const [words, setWords] = useState(was);
  // It was asked for, so it takes the focus as it is drawn, and once.
  const box = useCallback((el: HTMLInputElement | null) => el?.focus(), []);
  return (
    <span className="ld-view-naming">
      <Field
        aria-label={N.name}
        value={words}
        onValueChange={setWords}
        maxLength={LEAD_NAMED_NAME_MAX}
        ref={box}
        spellCheck={false}
        data-testid="leads-view-name"
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(words);
          if (e.key === "Escape") onLeave();
        }}
      />
      <Button size="sm" onClick={() => onSave(words)} data-testid="leads-view-name-save">
        {N.saveName}
      </Button>
    </span>
  );
}

/** A member's view's menu: Update where its layout moved since it was kept, its name, and Remove. */
const viewMenu = (v: LeadNamedView, named: LeadNamed) => (
  <MenuInPlace>
    <Menu
      align="start"
      label={`More for ${v.name}`}
      trigger={moreButton({ title: `More for ${v.name}`, className: "ld-search-more" })}
      groups={[
        {
          items: [
            ...(named.isActive(v) && named.hasMoved(v)
              ? [{ label: N.update, onSelect: () => named.update(v.id) }]
              : []),
            { label: N.rename, onSelect: () => named.ask({ kind: "rename", id: v.id }) },
            { label: N.remove, tone: "danger" as const, onSelect: () => named.ask({ kind: "remove", id: v.id }) },
          ],
        },
      ]}
    />
  </MenuInPlace>
);

/** One view's row: a starter's press alone; a member's with its menu and what it is being asked. */
const viewRow = (v: LeadNamedView, named: LeadNamed, keeps: boolean) => {
  const { asking } = named;
  return (
    <RailRow
      key={v.id}
      className="ld-search-row"
      pickClass="ld-search-pick"
      label={v.name}
      active={named.isActive(v)}
      onPick={() => named.pick(v)}
      testid={`leads-view-${v.id}`}
      menu={keeps ? viewMenu(v, named) : null}
      edit={
        asking?.kind === "rename" && asking.id === v.id ? (
          <NameBox was={v.name} onSave={(name) => named.rename(v.id, name)} onLeave={() => named.ask(null)} />
        ) : null
      }
      after={
        asking?.kind === "remove" && asking.id === v.id ? (
          <Confirm
            question={`Remove “${v.name}”?`}
            yes={N.removeYes}
            danger
            onYes={() => named.remove(v.id)}
            onNo={() => named.ask(null)}
            testid="leads-view-remove"
          />
        ) : null
      }
    />
  );
};

/** The Saved section. `compact` is a phone's sheet: it lists them, and keeps none. */
export const LeadsRailViews = ({ named, compact = false }: { named: LeadNamed; compact?: boolean }) => (
  <RailSection label={W.savedHeading} testid="leads-views">
    {named.starters.map((v) => viewRow(v, named, false))}
    {named.views.map((v) => viewRow(v, named, !compact))}
    {compact ? null : named.asking?.kind === "new" ? (
      <NameBox was="" onSave={named.saveNew} onLeave={() => named.ask(null)} />
    ) : (
      <LinkButton onClick={() => named.ask({ kind: "new" })} className="ld-view-save" data-testid="leads-view-save">
        {N.save}
      </LinkButton>
    )}
  </RailSection>
);
