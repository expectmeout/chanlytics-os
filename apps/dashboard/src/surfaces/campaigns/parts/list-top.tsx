/**
 * The top of a Campaigns list, the same for each (Ruben, 12 Nov 2026: one top for every list, as People's and the Inbox's are
 * on a phone, people/rail/phone-bar.tsx): at its left the view, every row or one group with how many it holds ("All
 * sequences 21 ⌄"), a menu of every view with its count; at its right the search's glyph while the search holds no words
 * (kit/head/list-find.tsx, every list's), then the list's own quiet words (Sequences' Type and Sort). Sequences and Messages draw it (campaigns.css, .cm-list-bar).
 */
import type { ReactNode } from "react";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";

/** One view of a list: what it is called and how many it holds. */
export interface ListView<V extends string> {
  value: V;
  label: string;
  count: number;
}

/** The view picked: its name and how many it holds, and the menu of every view with its count. */
export function ListViewPick<V extends string>({
  label,
  views,
  value,
  onView,
  testid,
}: {
  /** What the menu is, to a screen reader ("Which sequences"). */
  label: string;
  views: readonly ListView<V>[];
  value: V;
  onView: (view: V) => void;
  testid: string;
}) {
  const picked = views.find((v) => v.value === value) ?? views[0];
  return (
    <Menu
      align="start"
      label={label}
      trigger={
        <Button variant="plain" size="sm" className="cm-view-pick" data-testid={testid}>
          <span className="cm-view-words">{picked?.label}</span>
          <span className="cm-view-count" data-testid={`${testid}-count`}>
            {picked?.count}
          </span>
          <Icon name="chevron-down" size={11} />
        </Button>
      }
      groups={[
        {
          choose: {
            value: picked?.value ?? value,
            onChoose: (v) => onView(views.find((x) => x.value === v)?.value ?? value),
            tick: <Icon name="check" size={13} />,
            options: views.map((v) => ({ value: v.value, label: v.label, hint: String(v.count) })),
          },
        },
      ]}
    />
  );
}

/** The row: the view at its left, and at its right the search's glyph where it rests and the list's own words after it. */
export function ListBar({ view, find, acts }: { view: ReactNode; find: ReactNode; acts?: ReactNode }) {
  return (
    <div className="cm-list-bar">
      {view}
      <div className="cm-list-acts">
        {find}
        {acts}
      </div>
    </div>
  );
}
