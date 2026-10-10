/**
 * What the lenses share: the props every lens body takes, the card a period nobody wrote or called in draws, and the card a
 * mix draws (the Receptionist's and the People lens's own reads both fold their parts into it).
 */
import type { ReactNode } from "react";
import { lensEmpty, type LensId, type ReportRange, type ReportVM } from "@chanlytics/contracts";
import type { MixPartVM } from "@chanlytics/contracts/report-lens";
import { BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState } from "../../kit/empty/empty";
import type { ReportsSurface } from "../surface";

/** What a lens body draws from: the one read the surface holds, the page's own pick of another range, and whether the page is a phone's. */
export interface LensProps {
  R: ReportsSurface;
  pick: (range: ReportRange) => Promise<void>;
  phone: boolean;
}

/** Nothing came in: the range said so, and a door to the longest period, where the page is not on it already. */
export function nothingCameIn(vm: ReportVM, range: ReportRange, pick: (range: ReportRange) => Promise<void>) {
  const words = lensEmpty("overview", { since: vm.since, until: vm.until });
  return (
    <EmptyState
      kind="card"
      glyph="wave"
      title={words.title}
      testid="reports-empty"
      body={words.body}
      action={range !== "90d" ? { label: "Look at 90 days", onClick: () => void pick("90d") } : null}
    />
  );
}

/** How a mix is drawn as a card: where it stands, what it is called, the table's columns, and the two things only some mixes have. */
interface MixCard {
  title: string;
  testid: string;
  className: string;
  columns: [string, string];
  /** A colour by row, for the mix whose rows each keep one wherever they are drawn (a channel); a row it names not is the card's own. */
  colors?: Readonly<Record<string, string>>;
  /** What stands under the bars, at the card's foot (the fresh book's door to those who have been quiet). */
  foot?: ReactNode;
}

/** The colour kept for a row, as the bar list reads it; no property at all where the mix keeps none. */
const colorOf = (colors: MixCard["colors"], id: string): { color?: string } =>
  colors && Object.hasOwn(colors, id) ? { color: colors[id] } : {};

/** One mix as a card: its bars, the fold's line under the title, and the table the card offers beside them. */
export function mixCard(part: MixPartVM, card: MixCard) {
  const rows = part.rows.map((r) => ({ id: r.id, label: r.label, value: r.value, ...colorOf(card.colors, r.id) }));
  return (
    <ChartCard
      className={card.className}
      title={card.title}
      testid={card.testid}
      takeaway={part.line}
      table={rows.length ? { columns: card.columns, rows: rows.map((r) => [r.label, r.value]) } : null}
    >
      {rows.length ? <BarList rows={rows} /> : part.empty ? <EmptyState kind="line" title={part.empty} /> : null}
      {card.foot}
    </ChartCard>
  );
}

/** What a lens says where it has nothing to draw: the registry's words, a door where it has one. */
export function LensEmpty({ lens, vm, testid = "lens-empty" }: { lens: LensId; vm: ReportVM; testid?: string }) {
  const words = lensEmpty(lens, { since: vm.since, until: vm.until });
  return (
    <EmptyState
      kind="card"
      glyph="wave"
      title={words.title}
      body={words.body}
      testid={testid}
      action={words.door ? { label: words.door.label, to: words.door.to } : null}
    />
  );
}
