// Chanlytics — Settings › Business: the services sheet.
//
// What you offer's list of services, in a sheet beside the page (docs/superpowers/specs/2026-09-20-business-tab-design.md
// §4.4 and §5; the canvas's Edit-Sheet board): thirty-three rows of three boxes on the live record, the "99 inputs in a
// 720px column" the redesign exists to remove. Add above the rows (and a search once the list is long), the rows in
// three columns with a remove each, and a foot that says what the receptionist will be told. On a phone a service is
// one line, its name and "3 h · At consult", that opens onto its boxes when pressed (Ruben, 10 Oct 2026: each service
// took two lines of boxes). Its row at rest is the card's (offer.tsx BtServicesRow), whose act asks the registry for
// this sheet by its id, as the gap line's door does.
//
// A file of its own because the PAGE draws it, through its one sheet slot after every card, never the card: the fold
// registry opens one editor or sheet at a time, and the slot draws one sheet or none (tab.tsx BtSheetSlot).
//
// The page composes and never derives: every sentence here with a number in it is contracts' (servicesToldWords,
// through BUSINESS_TAB); what the sheet opens with, refuses and writes is folds.ts's; the gesture
// is BtSheet (gestures/). Its rows come and go (an Add, a remove, a search), so they are drawn hookless (the kit's
// RecordBox), as a fold's rows are: they are drawn before the kit's sheet's own hooks.

import { useRef, useState } from "react";
import type { ComponentProps, Dispatch, ReactNode, SetStateAction } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { RecordBox } from "../../kit/record/field";
import { gate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { BtSheet } from "./gestures/fold";
import type { Brain, Saver } from "./save";
import { businessTabSave } from "./saver";

/** A service's row in the sheet's draft: the minutes as its box holds them (a number as stored, a string as typed). */
interface ServiceRow {
  name?: string;
  duration_min?: number | string;
  price_note?: string;
}

/** What the sheet's strip, rows and foot are handed (gestures/ BtSheet's contract: a fold's body, and `will`). */
type SheetFields = Parameters<ComponentProps<typeof BtSheet<ServiceRow[]>>["body"]>[0];

/** A list inside the draft, with every rule a list has (gestures/ BtFold's `rows`). */
type ServiceRows = ReturnType<SheetFields["rows"]>;

/** An Undo the list keeps for a row taken out: where it would go, the row, and the press that puts it back. */
type PutBack = ReturnType<ServiceRows["waiting"]>[number];

/** The name a row has, where it is a row of a list (a put-back's row is whatever the list held). */
const btsNameOf = (row: unknown) =>
  row && typeof row === "object" && "name" in row && typeof row.name === "string" ? row.name : undefined;

/** What the search holds, for one opening of the sheet (the editor's `opening`). */
interface Search {
  opening: number;
  q: string;
}

// A name as the search reads it: contracts' foldName (availability.ts, through the bridge), accents off and case
// folded, so "unas" finds "Uñas de gel" as a caller's words find a service, with the space around it trimmed as
// needsConsultation trims it. The page once folded names with a copy of that rule, which agreed until one changed.
const btsFolded = (s: string | null | undefined) => BUSINESS_TAB.foldName(String(s == null ? "" : s).trim());

// What the sheet says when a list is full: the cap the save's schema keeps (LIMITS.services), said where Add was.
const btsFull = (max: number) => `That is the most services the receptionist keeps (${max}). Remove one first.`;

// The search comes with a list long enough to search: under this many, every service is in sight at once, and a
// search box over three rows was a box with nothing to do. A search with words in it stays, whatever the count.
const BTS_SEARCH_FROM = 8;

/**
 * The rows a phone has pressed open, by their place, for one opening of the sheet: a row pressed open last time opens
 * folded the next. A row typed in is open from then as a changed row, whatever its place.
 */
interface Pressed {
  opening: number;
  at: number[];
}

/**
 * The services list inside the sheet's draft, with every rule a list has (BtFold's rows: the cap through Add and
 * through an Undo, a removal said only when it happened, the row back at its index, the field keys each row's
 * sentences are under, and focus in a row just added), and the rows an Undo may still put back, each where it would go
 * (waiting), which the sheet draws an Undo for in the row's place.
 */
const btsServiceRows = (rows: SheetFields["rows"]) => {
  const max = businessTabSave.LIMITS.services;
  return rows({
    id: "services",
    name: (i) => `service-${i}`,
    max,
    blank: () => ({ name: "" }),
    keysOf: (i) => [`service-${i}-name`, `service-${i}-duration_min`, `service-${i}-price_note`],
    key: "services",
    full: btsFull(max),
  });
};

/** The strip above the rows: Add, and the search once the list is long enough to need one. */
const btsTools = (f: SheetFields, search: Search, setSearch: Dispatch<SetStateAction<Search>>) => {
  const svc = btsServiceRows(f.rows);
  const q = search.opening === f.opening ? search.q : "";
  const searched = q !== "" || (f.draft || []).length >= BTS_SEARCH_FROM;
  return (
    <>
      {searched ? (
        <span className="bt-services-search">
          <Icon name="search" size={12} />
          <RecordBox
            id="bt-services-search"
            label="Search services"
            type="search"
            value={q}
            placeholder="Search services"
            onChange={(v) => setSearch({ opening: f.opening, q: v })}
            autoComplete="off"
            spellCheck={false}
            testid="rec-services-search"
            // Escape with words in the search clears them, and goes no further: the sheet's Escape closed it, or asked,
            // over a search a person only meant to empty. Not preventDefault, which would stop the box's own clear.
            // Empty, the key is the sheet's.
            onKeyDown={(e) => {
              if (e.key === "Escape" && q !== "") {
                e.stopPropagation();
                setSearch({ opening: f.opening, q: "" });
              }
            }}
          />
        </span>
      ) : null}
      {/* The write schema takes no more than this, so the sheet does not offer it (rows' canAdd). */}
      {svc.canAdd ? (
        <button type="button" className="btn btn-sm" {...f.press(() => svc.add())} data-testid="rec-services-add">
          <Icon name="plus" size={12} /> {searched ? "Add" : "Add a service"}
        </button>
      ) : (
        <span className="bt-fold-note" data-testid="rec-services-cap">
          {btsFull(businessTabSave.LIMITS.services)}
        </span>
      )}
    </>
  );
};

/**
 * The Undo left where a row was taken out. Each is known by its put-back's id, not its place: two waiting in one gap
 * shared a place, and shared an id. Its name is what it puts back (contracts serviceUndoName), and holds the word on
 * it (WCAG 2.5.3).
 */
const btsMark = (m: PutBack, f: SheetFields) => (
  <div
    key={`gone-${m.id}`}
    className="bt-service-gone"
    data-rec-row={`service-gone-${m.id}`}
    data-testid={`rec-service-gone-${m.id}`}
  >
    <span className="bt-service-gone-words">Removed {btsNameOf(m.row) ? <b>{btsNameOf(m.row)}</b> : "a service"}</span>
    <button
      type="button"
      className="bt-link"
      aria-label={BUSINESS_TAB.serviceUndoName(btsNameOf(m.row))}
      {...f.press(() => {
        const at = m.at;
        if (m.back?.()) f.focus(`service-${at}`);
      })}
      data-testid={`rec-service-undo-${m.id}`}
    >
      Undo
    </button>
  </div>
);

/** What a row of the sheet is drawn with. */
interface RowEnv {
  f: SheetFields;
  svc: ServiceRows;
  /** Whether the search leaves the row in sight. */
  shown: boolean;
  /** Whether the row's service is on the consult-first list. */
  consults: boolean;
  /** Whether a phone draws the row's boxes, or its one line: a row pressed open, changed, new, or wrong is open. */
  open: boolean;
  /** Opens the row onto its boxes; from a key, focus goes to its name (a finger's press leaves the keyboard down). */
  onOpen: (byKey: boolean) => void;
}

/**
 * A service's one line on a phone: its name, and how long it takes with its price under it (contracts
 * serviceLineWords), pressed to open the row onto its boxes. A desk draws the boxes, and never this.
 */
const btsLine = (x: ServiceRow, i: number, env: RowEnv) => (
  <button
    type="button"
    className="bt-service-line"
    aria-expanded={env.open}
    aria-controls={`svc-${i}-name`}
    // A click a key made has no count of presses (detail 0): only then does focus move into the name, so a finger's
    // press opens the row without raising the keyboard (Ruben, 9 Oct 2026: no field focuses by itself).
    onClick={(e) => env.onOpen(e.detail === 0)}
    data-testid={`rec-service-line-${i}`}
  >
    <span className="bt-service-line-words">
      <span className="bt-service-line-name">{x.name && x.name.trim() ? x.name : "New service"}</span>
      <span className="bt-service-line-sub">{BUSINESS_TAB.serviceLineWords(x, env.consults)}</span>
    </span>
    <Icon name="chevron" size={12} />
  </button>
);

/** One service: its three boxes and a remove. */
const btsRow = (x: ServiceRow, i: number, env: RowEnv) => {
  const { f, svc } = env;
  const n = i + 1;
  const setSvc = (k: keyof ServiceRow, v: string) => svc.setAt(i, { [k]: v });
  // A service and a note are words somebody typed, the same as a closure, and each went with one press and no Undo (S18).
  const removeService = () => {
    const back = svc.removeAt(i, (gone) => <>Removed {btsNameOf(gone) ? <b>{btsNameOf(gone)}</b> : "a service"}</>);
    // Focus was on the remove, which went with its row: it goes to the Undo left in the row's place.
    if (back) f.focus(`service-gone-${back.id}`);
  };
  const said = (key: string) => f.problems[key] || null;
  // The mark describes the row's name box, so it is heard with the box it stands beside, not as a word on its own.
  const consult = env.consults ? `svc-${i}-consult` : null;
  return (
    <div
      key={`svc-${i}`}
      className="bt-service-row"
      hidden={env.shown ? undefined : true}
      data-open={env.open ? "true" : "false"}
      data-testid={`rec-service-${i}`}
      {...svc.row(i)}
    >
      {btsLine(x, i, env)}
      <span className="bt-service-name">
        <RecordBox
          id={`svc-${i}-name`}
          label={`Service ${n} name`}
          size="sm"
          value={x.name}
          placeholder="What customers call it"
          onChange={(v) => setSvc("name", v)}
          problem={said(`service-${i}-name`)}
          readOnly={f.readOnly}
          aria-describedby={consult || undefined}
        />
        {consult ? (
          <span id={consult} className="bt-service-consult" data-testid={`rec-service-consult-${i}`}>
            consult first
          </span>
        ) : null}
      </span>
      <RecordBox
        id={`svc-${i}-minutes`}
        label={`Service ${n} takes (min)`}
        unit="min"
        size="sm"
        inputMode="numeric"
        value={x.duration_min == null ? "" : String(x.duration_min)}
        onChange={(v) => setSvc("duration_min", v)}
        problem={said(`service-${i}-duration_min`)}
        readOnly={f.readOnly}
      />
      <RecordBox
        id={`svc-${i}-price`}
        label={`Service ${n} price`}
        size="sm"
        value={x.price_note || ""}
        placeholder={BUSINESS_TAB.SERVICE_PRICE_EMPTY}
        onChange={(v) => setSvc("price_note", v)}
        problem={said(`service-${i}-price_note`)}
        readOnly={f.readOnly}
      />
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm"
        aria-label={`Remove ${x.name ? x.name : `service ${n}`}`}
        {...f.press(() => removeService())}
        data-testid={`rec-service-remove-${i}`}
      >
        <Icon name="x" size={11} />
      </button>
    </div>
  );
};

/** What the rows are drawn from: the search in force, the rows changed since the sheet opened, and the booking rules. */
interface BodyEnv {
  search: Search;
  pins: WeakMap<object, string>;
  rules: NonNullable<NonNullable<Brain["profile"]>["booking_rules"]> | null;
  /** The rows pressed open on a phone, and how a press opens one. */
  pressed: Pressed;
  press: (i: number, byKey: boolean) => void;
}

/**
 * The rows, with each Undo where its row would go back, which moves as rows are taken out and put back around it
 * (both are rows()', `waiting`, so every list keeps them).
 */
const btsDrawn = (f: SheetFields, list: ServiceRow[], shows: (x: ServiceRow) => boolean, env: BodyEnv) => {
  const { rules } = env;
  const svc = btsServiceRows(f.rows);
  const marks = svc.waiting();
  // A row a phone draws open: one pressed open, one changed since the sheet opened (typed in, added, put back: rows()
  // makes a new row for each, so a row being typed in never folds away under the keys), or one with something wrong.
  const opened = new Set(f.opened || []);
  const wrong = (i: number) =>
    [`service-${i}-name`, `service-${i}-duration_min`, `service-${i}-price_note`].some((k) => !!f.problems[k]);
  const pressed = (i: number) => env.pressed.opening === f.opening && env.pressed.at.includes(i);
  const isOpen = (x: ServiceRow, i: number) => pressed(i) || !opened.has(x) || wrong(i);
  // Whether a service needs a consultation first is contracts' one question (needsConsultation), the one the Calendar's
  // board asks of the same list: a row marked here is a service the receptionist offers as a consultation.
  const consults = (name: string | null | undefined) =>
    !!BUSINESS_TAB.needsConsultation(String(name == null ? "" : name), rules);
  const drawn: ReactNode[] = [];
  list.forEach((x, i) => {
    marks.filter((m) => m.at === i).forEach((m) => drawn.push(btsMark(m, f)));
    drawn.push(
      btsRow(x, i, {
        f,
        svc,
        shown: shows(x),
        consults: consults(x.name),
        open: isOpen(x, i),
        onOpen: (byKey) => env.press(i, byKey),
      }),
    );
  });
  marks.filter((m) => m.at >= list.length).forEach((m) => drawn.push(btsMark(m, f)));
  return drawn;
};

/**
 * The rows. The search narrows them by name and NEVER reorders them: the stored order is the order the receptionist
 * reads them in, and a sheet sorted by its search would save them sorted. A row it leaves out is hidden, not taken off
 * the page, so every row keeps its index and its boxes their focus. A row changed since the sheet opened (typed in,
 * just added, or put back) is pinned to the search in force when it changed, and stays in sight under that search: a
 * name typed over until it no longer matched would have taken its row, and the box being typed in, out of sight, and a
 * row put back while another name was searched came back hidden (the quality review's P6). Under a later search it is
 * searched like any other; pinned to every later one, a row changed once stayed in every search after.
 */
const btsBody = (f: SheetFields, env: BodyEnv) => {
  const list = f.draft || [];
  const q = btsFolded(env.search.opening === f.opening ? env.search.q : "");
  const opened = new Set(f.opened || []);
  list.forEach((x) => {
    if (x && !opened.has(x) && !env.pins.has(x)) env.pins.set(x, q);
  });
  const shows = (x: ServiceRow) => !q || btsFolded(x.name).includes(q) || (!opened.has(x) && env.pins.get(x) === q);
  const drawn = btsDrawn(f, list, shows, env);
  const none = q && list.length > 0 && !list.some(shows);
  // What the search has left in sight, said politely to a screen reader as it narrows (contracts servicesFoundWords):
  // the rows it hides are hidden, which nothing announces. Drawn from the sheet's first draw, empty with no search, so
  // the region is on the page before it has anything to say, and a change in it is heard.
  const found = q ? BUSINESS_TAB.servicesFoundWords(list.filter(shows).length, list.length) : "";
  return (
    <div className="bt-services" data-testid="rec-services-rows">
      <span className="rec-sr" role="status" aria-live="polite" data-testid="rec-services-found">
        {found}
      </span>
      {list.length > 0 ? (
        <div className="bt-service-row bt-service-head" aria-hidden="true">
          <span>Service</span>
          <span>Takes</span>
          <span>Price</span>
          <span />
        </div>
      ) : null}
      {drawn}
      {none ? (
        <p className="bt-fold-note" data-testid="rec-services-none">
          No service is called that. The search reads names only.
        </p>
      ) : null}
    </div>
  );
};

/** How many services a draft would write: none is the one count the foot says anything of. */
const btsWritten = (draft: ServiceRow[] | null) => businessTabSave.WRITTEN_ROWS.services(draft).length;

// Only what an owner must know, over the Save: that a list with nothing in it composes nothing (contracts'
// servicesToldWords at zero), and, where the save crosses the resolver's line, the sentence for it. The count of
// services, their characters and their share of the prompt went with the "It will be told" eyebrow (23 Sep): a foot
// that said "33 services, 1,085 characters" under thirty-three rows was the clutter it counted, and the count left the
// Save on 10 Oct 2026 (every sheet's Save says Save). The list's own refusal (too many) is said here too, by the Save
// it stops.
const btsTold = (f: SheetFields) => {
  const count = btsWritten(f.draft);
  const words =
    count === 0
      ? BUSINESS_TAB.servicesToldWords({
          count,
          chars: f.will ? f.will.chars : null,
          total: f.will ? f.will.total : null,
        })
      : null;
  return (
    <div className="bt-services-told" data-testid="rec-sheet-services-told">
      {f.will && f.will.note ? (
        <p className="bt-services-note" data-testid="rec-sheet-services-note">
          {f.will.note}
        </p>
      ) : null}
      {words ? (
        <p className="bt-services-told-line" data-testid="rec-sheet-services-told-words">
          {words}
        </p>
      ) : null}
      <FieldError id="bt-services-problem" message={f.problems.services || null} testid="rec-services-problem" />
    </div>
  );
};

/**
 * The services sheet (the canvas's Edit-Sheet): a search and Add above the rows, the rows in three columns (Service,
 * Takes, Price) with a remove each, and the foot's one warning over its Save. Its title alone, "Services", the row's own
 * name (Ruben, 10 Oct 2026: a line under every title said it again). Drawn by the page, last (the
 * header says why), over the one editor a fold is (BtSheet).
 *
 * The rows, their search and the foot are drawn by the functions above; what is the sheet's own is the two things it
 * keeps: what the search holds, and the rows changed since it opened.
 *
 * A row taken out leaves an Undo where it was, inside the sheet, since the toast's Undo is outside the dialog's Tab ring
 * (record-sheet.jsx); the toast still says it and offers the same Undo, which does nothing once the sheet has closed
 * and says so. Either puts the row back once, between the same two rows it went from, and each Undo is drawn where its
 * row would go back, which moves as rows are taken out and put back around it: both are rows()' (waiting), so every
 * list keeps them. What the search holds is kept for one opening of the sheet (the editor's `opening`).
 *
 * A row whose name is on the consult-first list carries a "consult first" mark, to read: that list is its own fold's.
 * The mark describes the row's name box (aria-describedby), after what is wrong with the name, if anything.
 */
export const BtServicesSheet = ({
  brain,
  canEdit,
  flash,
  saver,
}: {
  brain: Brain;
  canEdit: boolean;
  flash: (flash: LegacyFlash) => void;
  saver: Saver | null;
}) => {
  const [search, setSearch] = useState<Search>({ opening: 0, q: "" });
  // Each row changed since the sheet opened, and the search in force when it changed (btsBody says why). A row is
  // changed when it is not one the sheet opened with: rows() makes a new one for each keystroke, each row added, and
  // each row put back, so the first draw a row is seen in is the moment it changed.
  const pins = useRef<WeakMap<object, string> | null>(null);
  if (!pins.current) pins.current = new WeakMap();
  const pinned = pins.current;
  const rules = (brain.profile || {}).booking_rules || null;
  const [pressed, setPressed] = useState<Pressed>({ opening: -1, at: [] });

  return (
    <BtSheet<ServiceRow[]>
      id="services"
      title="Services"
      className="bt-services-sheet"
      canEdit={canEdit}
      flash={flash}
      saver={saver}
      gate={gate("settings", "change your services")}
      tools={(f: SheetFields) => btsTools(f, search, setSearch)}
      told={btsTold}
      body={(f: SheetFields) =>
        btsBody(f, {
          search,
          pins: pinned,
          rules,
          pressed,
          press: (i, byKey) => {
            setPressed((was) => ({ opening: f.opening, at: was.opening === f.opening ? [...was.at, i] : [i] }));
            if (byKey) f.focus(`service-${i}`);
          },
        })
      }
    />
  );
};
