/**
 * The deal sheet's month (fields.tsx DayField): the kit's DatePicker over a day's token. A module of its own, loaded as
 * the sheet first draws a day, so Base UI's popover and the month grid are not in what every page loads with the frame,
 * where the deal sheet's host lives (the fitted sheets, 14 Oct 2026: route JS stood 91 KB over its ceiling).
 */
import type { ReactElement } from "react";
import { DatePicker } from "../../kit/datepicker/datepicker";
import { Icon } from "../../kit/icon/icon";

export function DayPick(p: {
  value: string;
  today: string;
  label: string;
  onPick: (day: string) => void;
  trigger: ReactElement;
}) {
  const chevron = <Icon name="chevron" size={14} />;
  return (
    <DatePicker
      value={p.value || p.today}
      onValueChange={p.onPick}
      today={p.today}
      label={p.label}
      glyphs={{ previous: chevron, next: chevron }}
      trigger={p.trigger}
    />
  );
}
