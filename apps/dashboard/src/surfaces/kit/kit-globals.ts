/**
 * The kit's components that the shell's pages still draw, under the names they read (decision 0015, step 3).
 *
 * What is shared moves once. The icons, the empty state and the failed read, and the segmented bar were written for
 * the shell (`components/icons.jsx`, `data-bits.jsx`, `chart-core.jsx`); Reports needed them in TSX, so they moved into
 * the kit (`src/surfaces/kit`), where they are the one implementation. The pages that have not moved read them as they
 * always did, as `Icon`, `EmptyState`, `FailedRead` and `SegmentBar` on `window`: this is that line, and it is deleted
 * with the last page that reads a name. The app publishes it from seed-globals.ts, before any page loads; the standalone
 * mockup gets the same object from a bundle its server builds (tooling/scripts/serve-legacy.mjs, `data/kit-globals.js`).
 * The state pill, the confirm, the more menu, the policy chip and a thread's media (`StatePill`, `Confirm`, `MoreMenu`,
 * `PolicyChip`, `TlMedia`: data-bits.jsx's too) moved when the Inbox needed them in TSX, and are published the same way, as
 * is the attention row (`AttnRow`: Today's queue, People's strip, Setup and the platform pages draw it).
 *
 * The record kit (the row, the fields, the fold, the inline editor, the sheet, and the registry that keeps one fold open),
 * `FieldError` and the agenda's rows moved the same way (`components/record-*.jsx`, `data-bits.jsx`, `day-agenda.jsx`), as did the
 * fold registry's two answers to the Settings rail.
 *
 * Nothing here is behaviour: it is the kit's own components, and a page draws them exactly as it drew the old ones.
 */
import { AgendaItem, AgendaItems, AgendaOpen } from "./agenda/agenda";
import { AttnRow } from "./attention/attn-row";
import { SegmentBar } from "./charts/card";
import { Confirm } from "./confirm/confirm";
import { EmptyState, FailedRead } from "./empty/empty";
import { FieldError } from "./field-error/field-error";
import { Icon } from "./icon/icon";
import { TlMedia } from "./media/tl-media";
import { MoreMenu } from "./more-menu/more-menu";
import { StatePill } from "./pill/state-pill";
import { PolicyChip } from "./policy-chip/policy-chip";
import { RecordCombobox } from "./record/combobox";
import { RecordBox, RecordField, RecordSwitch, RecordTip, RecordTipCard, RecordToggleGroup } from "./record/field";
import { RecordFold } from "./record/fold";
import { recKeys, recPhoneQuery, useRecFocusHold, useRecFocusOn } from "./record/focus";
import { useRecordFold } from "./record/hooks";
import { RecordInline } from "./record/inline";
import { recPortalRoot } from "./record/leaving";
import { recFolds } from "./record/registry";
import { RecordChips, RecordDispute, RecordRow, RecordSourceChip, recRowPress } from "./record/row";
import { RecordFoot, RecordSays } from "./record/says";
import { RecordSheet } from "./record/sheet";
import { UnsavedAsk, tabDraft, useUnsavedWork } from "./record/work";

export const KIT_GLOBALS = {
  Icon,
  EmptyState,
  FailedRead,
  SegmentBar,
  StatePill,
  Confirm,
  MoreMenu,
  PolicyChip,
  TlMedia,
  AttnRow,
  AgendaItem,
  AgendaItems,
  AgendaOpen,
  FieldError,
  RecordRow,
  RecordSourceChip,
  RecordDispute,
  RecordChips,
  recRowPress,
  RecordField,
  RecordBox,
  RecordSwitch,
  RecordToggleGroup,
  RecordCombobox,
  RecordTip,
  RecordTipCard,
  recPhoneQuery,
  recPortalRoot,
  RecordFold,
  RecordInline,
  RecordSays,
  RecordFoot,
  useRecordFold,
  useRecFocusHold,
  useRecFocusOn,
  recKeys,
  useUnsavedWork,
  UnsavedAsk,
  tabDraft,
  RecordSheet,
  /** The rule that only one fold is open, which the pages ask by its id. */
  __recordFolds: recFolds,
  /** The Settings rail's question before it replaces a pane: does anything hold unsaved changes? The open fold answers. */
  __settingsUnsaved: () => recFolds.dirty() || recFolds.saving(),
  /** A fold's save is out: the rail asks in other words, since "Leave without saving?" is untrue of a change on its way. */
  __settingsSaving: () => recFolds.saving(),
};
