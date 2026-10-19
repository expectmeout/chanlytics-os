/**
 * The record's foot, where a step opened to be changed puts its Cancel and Save (step-editor.tsx): the element the pane's
 * foot holds while one is open, and how the editor says it is open (`hold`), so a phone's Save stands at the thumb and not
 * under a screen of fields. None outside a record: the editor then keeps its foot under its fields. A module of its own,
 * so the record's reads (use-record.ts), which the lead sheet takes too, hold no React context.
 */
import { createContext } from "react";

interface RecordFoot {
  el: HTMLElement | null;
  hold: (on: boolean) => void;
}
export const RecordFootContext = createContext<RecordFoot | null>(null);
