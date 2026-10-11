/**
 * The running page's entries (kit-behaves.tsx): the kit's components with behaviour of their own, each drawn by its
 * own component, imported through the kit's index as a surface imports it (docs/plans/2026-09-28-the-interface-kit-
 * and-its-looks.md, step 2.5). An entry is a figure with its gallery id (data-entry), holding what a page would draw:
 * the component, closed, and the control that opens it, with a caption that says what it holds now. Its id is the
 * static gallery's entry of the kit's Base UI families (kit-gallery.mjs) that the component draws in the state a
 * person brings it to; e2e/kit/kit-behaves.spec.ts holds the two together in a browser, and
 * tooling/scripts/tests/styles/kit-behaves.test.mjs those it can draw on a server, in the node suite. What an entry
 * says is made up, as every fixture's is.
 *
 * The dashboard's `tsc --noEmit` compiles this file (apps/dashboard/tsconfig.json includes the page that imports it),
 * so a props change to a component that an entry no longer meets fails `corepack pnpm -r typecheck`, where no CI job
 * runs the browser spec. Nothing lints it. The spec and the node test run it.
 */
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  Button,
  Combobox,
  DatePicker,
  Field,
  Figure as KitFigure,
  Menu,
  MenuTrigger,
  Picker,
  Popover,
  Segmented,
  SubTabs,
  Select,
  SharedMenu,
  Sheet,
  Switch,
  Tooltip,
  menuHandle,
  useToast,
} from "../../../apps/dashboard/src/surfaces/kit/index.ts";
import { GLYPHS, SHEET_SERVICES } from "./kit-shared.mjs";

/** A glyph as the Icon draws it (surfaces/kit/icon/icon.tsx): the gallery's table of paths, at a size. */
const glyph = (name: keyof typeof GLYPHS, size: number): ReactElement => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="icon"
    style={{ width: size, height: size }}
    dangerouslySetInnerHTML={{ __html: GLYPHS[name] }}
  />
);

/** The toasts' glyphs, as usePPToast draws them by tone (contracts' TOAST_ICONS; the gallery draws a failure's as alert). */
const TOAST_GLYPHS = {
  ok: glyph("check", 13),
  info: glyph("info", 13),
  warn: glyph("alert", 13),
  danger: glyph("alert", 13),
  dismiss: glyph("x", 11),
};

/** A figure of the page, as the static gallery draws an entry: its id, what it holds, and what it is. */
function Figure({ id, about, children }: { id: string; about: string; children: ReactNode }) {
  return (
    <figure className="gx-entry" data-entry={id}>
      <div className="gx-stage gx-row">{children}</div>
      <figcaption className="gx-caption">
        {id} · {about}
      </figcaption>
    </figure>
  );
}

const SERVICES = [
  { value: "consult", label: "Consultation", meta: "45m" },
  { value: "follow", label: "Follow-up visit", meta: "30m" },
  { value: "full", label: "Full treatment", meta: "2h" },
] as const;
type Service = (typeof SERVICES)[number]["value"];

const LANGUAGES = [
  { value: "es", label: "Spanish", meta: "es" },
  { value: "es-MX", label: "Spanish, Mexico", meta: "es-MX" },
  { value: "en", label: "English", meta: "en" },
  { value: "pt", label: "Portuguese", meta: "pt" },
] as const;
type Language = (typeof LANGUAGES)[number]["value"];

/** The sheet, opened by its control: a field in its tools, rows, and a foot whose Save raises a toast, with a menu. */
function SheetKit() {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const [toasts, flash] = useToast(TOAST_GLYPHS);
  return (
    <Figure id="sheet-kit" about="the kit's Sheet, its Save raising the kit's toast">
      <Button data-testid="sheet-open" onClick={() => setOpen(true)}>
        Open the services
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Services"
        sub="What you offer, and how long each takes."
        close={{ label: "Close", glyph: glyph("x", 13) }}
        tools={<Field label="Find a service" value={find} onValueChange={setFind} />}
        foot={
          <div className="rec-foot">
            <Button
              variant="primary"
              size="sm"
              data-testid="sheet-save"
              onClick={() => flash({ msg: "Saved for every line.", undo: () => undefined })}
            >
              Save
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Menu
              trigger={
                <Button variant="quiet" size="sm" iconOnly aria-label="More for the services" data-testid="sheet-menu">
                  {glyph("more", 14)}
                </Button>
              }
              groups={[{ items: [{ label: "Copy the list", glyph: glyph("copy", 13), onSelect: () => undefined }] }]}
            />
          </div>
        }
      >
        {SHEET_SERVICES.map(([name, long]) => (
          <div key={name} className="rec-row" data-empty="false">
            <span className="rec-row-key">{name}</span>
            <div className="rec-row-val">
              <span className="rec-row-value">{long}</span>
            </div>
          </div>
        ))}
      </Sheet>
      {toasts}
    </Figure>
  );
}

/** The one action menu: a group under its heading, a door and the danger item. */
function MenuKit() {
  const [said, setSaid] = useState("nothing yet");
  return (
    <Figure id="menu-kit" about={`the kit's Menu; last chosen: ${said}`}>
      <Menu
        trigger={
          <Button variant="quiet" size="sm" iconOnly aria-label="More" data-testid="menu-open">
            {glyph("more", 14)}
          </Button>
        }
        groups={[
          {
            header: "Sam Ortega",
            items: [
              { label: "Copy number", glyph: glyph("copy", 13), onSelect: () => setSaid("Copy number") },
              {
                label: "Send booking link",
                glyph: glyph("calendar", 13),
                meta: "By text",
                onSelect: () => setSaid("Send booking link"),
              },
              {
                label: "Pause the receptionist",
                glyph: glyph("pause", 13),
                hint: "until 10:00",
                onSelect: () => setSaid("Pause the receptionist"),
              },
            ],
          },
          {
            items: [
              { label: "Open their page", glyph: glyph("user", 13), href: "#kit-person" },
              { label: "Delete person…", glyph: glyph("x", 13), tone: "danger", onSelect: () => setSaid("Delete") },
            ],
          },
        ]}
      />
    </Figure>
  );
}

/** A menu of switches it stays open over, one kept on: the table's columns. */
function MenuKitSwitches() {
  const [on, setOn] = useState<Record<string, boolean>>({ name: true, state: true, email: false });
  const shown = Object.keys(on).filter((k) => on[k]);
  return (
    <Figure id="menu-kit-switches" about={`the kit's Menu, switches; on: ${shown.join(", ")}`}>
      <Menu
        label="Columns"
        trigger={
          <Button variant="quiet" size="sm" data-testid="menu-switches-open">
            {glyph("eye", 12)} Columns
          </Button>
        }
        groups={[
          {
            header: "Show on the table",
            toggles: {
              onToggle: (value) => setOn((o) => ({ ...o, [value]: !o[value] })),
              tick: glyph("check", 13),
              items: [
                { value: "name", label: "Person", on: on.name === true, locked: "Always" },
                { value: "state", label: "State", on: on.state === true },
                { value: "email", label: "Email", on: on.email === true },
              ],
            },
          },
        ]}
      />
    </Figure>
  );
}

/**
 * The kit's Sheet in a phone's small job's shape: the acts for a selection, and a step from them with its way back.
 * Its caption says what the last press did, so the spec reads a step back apart from a close.
 */
function SheetKitJob() {
  const [step, setStep] = useState<"more" | "why" | null>(null);
  const [said, setSaid] = useState("closed");
  const go = (next: "more" | "why" | null, word: string) => {
    setStep(next);
    setSaid(word);
  };
  return (
    <Figure id="sheet-kit-job" about={`the kit's Sheet, a phone's job; ${said}`}>
      <Button data-testid="job-open" onClick={() => go("more", "open")}>
        Work the 3 selected
      </Button>
      <Sheet
        open={step !== null}
        shape="job"
        onClose={() => go(null, "closed")}
        title={step === "why" ? "Not a fit" : "3 selected"}
        close={{ word: "Cancel" }}
        back={step === "why" ? { label: "Back", glyph: glyph("chevron", 18), onBack: () => go("more", "back") } : null}
        testid="job-sheet"
      >
        {step === "why" ? (
          <Button variant="primary" onClick={() => go(null, "marked")}>
            Too far away
          </Button>
        ) : (
          <Button variant="primary" data-testid="job-next" onClick={() => go("why", "stepped")}>
            Not a fit
          </Button>
        )}
      </Sheet>
    </Figure>
  );
}

/** The sheet with its title a kicker over rows that carry their own name, its foot's Cancel the act that closes it. */
function SheetKitKicker() {
  const [open, setOpen] = useState(false);
  return (
    <Figure id="sheet-kit-kicker" about="the kit's Sheet, its title a kicker">
      <Button data-testid="sheet-kicker-open" onClick={() => setOpen(true)}>
        Turn on Win-back
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Turn on"
        close={{ label: "Close", glyph: glyph("x", 13) }}
        kicker
        footCloses
        foot={
          <div data-foot-pair="">
            <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
              Start it
            </Button>
          </div>
        }
      >
        {SHEET_SERVICES.map(([name, long]) => (
          <div key={name} className="rec-row" data-empty="false">
            <span className="rec-row-key">{name}</span>
            <div className="rec-row-val">
              <span className="rec-row-value">{long}</span>
            </div>
          </div>
        ))}
      </Sheet>
    </Figure>
  );
}

/** One menu its controls share, each control carrying its row (a table's Call): the menu says the row that opened it. */
const CALL_ROWS = [
  { name: "Sam's Gym", number: "(512) 555-0142" },
  { name: "Ortega Fitness", number: "(512) 555-0177" },
];
function MenuKitShared() {
  const [calls] = useState(() => menuHandle<(typeof CALL_ROWS)[number]>());
  const [said, setSaid] = useState("nobody called");
  return (
    <Figure id="menu-kit-shared" about={`the kit's Menu, shared by its rows; ${said}`}>
      {CALL_ROWS.map((row, at) => (
        <MenuTrigger
          key={row.name}
          handle={calls}
          payload={row}
          trigger={
            <Button variant="quiet" size="sm" data-testid={`shared-call-${at}`}>
              Call {row.name}
            </Button>
          }
        />
      ))}
      <SharedMenu
        handle={calls}
        label={(row) => `Call ${row.name}`}
        groups={(row) => [
          {
            header: row.number,
            items: [
              {
                label: "Call from your phone",
                glyph: glyph("phone", 13),
                onSelect: () => setSaid(`called ${row.name}`),
              },
            ],
          },
        ]}
      />
    </Figure>
  );
}

/** A menu of one of a set. */
function MenuKitSet() {
  const [sort, setSort] = useState("newest");
  return (
    <Figure id="menu-kit-set" about={`the kit's Menu, one of a set; chosen: ${sort}`}>
      <Menu
        align="start"
        trigger={
          <Button size="sm" data-testid="menu-set-open">
            Sort {glyph("chevron-down", 10)}
          </Button>
        }
        groups={[
          {
            choose: {
              value: sort,
              onChoose: setSort,
              tick: glyph("check", 13),
              options: [
                { value: "newest", label: "Newest first" },
                { value: "oldest", label: "Oldest first" },
                { value: "name", label: "By name" },
              ],
            },
          },
        ]}
      />
    </Figure>
  );
}

/** A popover of words and an act. */
function PopoverKit() {
  return (
    <Figure id="popover-kit" about="the kit's Popover">
      <Popover
        label="Hours"
        trigger={
          <Button size="sm" data-testid="popover-open">
            Hours
          </Button>
        }
      >
        <p className="gx-pop-words">Open today until six.</p>
        <Button size="sm" data-testid="popover-inside">
          Change the hours
        </Button>
      </Popover>
    </Figure>
  );
}

/** A date picker on a control, on the month of the day it holds. */
function DatePickerKit() {
  const [day, setDay] = useState("2026-10-02");
  return (
    <Figure id="datepicker-kit" about="the kit's DatePicker">
      <DatePicker
        label="Go to a date"
        value={day}
        onValueChange={setDay}
        today="2026-10-02"
        glyphs={{ previous: glyph("chevron", 14), next: glyph("chevron", 14) }}
        trigger={
          <Button size="sm" data-testid="datepicker-open">
            Go to a date
          </Button>
        }
      />
      <span className="gx-pop-words" data-testid="datepicker-day">
        {day}
      </span>
    </Figure>
  );
}

/** The hours a playbook may run at, as the composer's sentence offers them: a short list, the Select under the token. */
const HOURS = [
  {
    label: "Morning",
    options: [
      { value: "9", label: "09:00" },
      { value: "10", label: "10:00", sub: "When most of them write back" },
    ],
  },
  { label: "Afternoon", options: [{ value: "14", label: "14:00" }] },
] as const;

/** The moments a playbook runs on, as the composer offers them: a list to search, the Combobox under the token. */
const MOMENTS = [
  {
    label: "Set up",
    options: [{ value: "quiet_30", label: "Win-back", sub: "Nothing heard in 30 days", glyph: glyph("refresh", 13) }],
  },
  {
    label: "Not set up",
    options: [
      {
        value: "phoned_only",
        label: "Save our number",
        sub: "Only ever phoned, never texted",
        glyph: glyph("phone", 13),
      },
      {
        value: "new_week",
        label: "Welcome",
        sub: "First contact in the last 7 days",
        meta: "3 today",
        glyph: glyph("user", 13),
      },
    ],
  },
] as const;

/** A picker in its sentence, on a short list. */
function PickerKit() {
  const [hour, setHour] = useState<"9" | "10" | "14">("10");
  return (
    <Figure id="picker-kit" about={`the kit's Picker on a short list; chosen: ${hour}`}>
      <span className="gx-pop-words">
        Every day at{" "}
        <Picker
          label="The hour it runs"
          value={hour}
          onValueChange={setHour}
          groups={HOURS}
          chevron={glyph("chevron-down", 11)}
          note="Hours outside 9 to 21 are not offered."
          data-testid="picker-open"
        />
      </span>
    </Figure>
  );
}

/** A picker in its sentence, on a list to search. */
function PickerKitFind() {
  const [moment, setMoment] = useState<"quiet_30" | "phoned_only" | "new_week">("quiet_30");
  return (
    <Figure id="picker-kit-find" about={`the kit's Picker on a list to search; chosen: ${moment}`}>
      <span className="gx-pop-words">
        Send it to{" "}
        <Picker
          label="The moment it runs on"
          value={moment}
          onValueChange={setMoment}
          groups={MOMENTS}
          chevron={glyph("chevron-down", 11)}
          search={{ glass: glyph("search", 12), placeholder: "Find a moment", empty: "No moment has those words." }}
          data-testid="picker-find-open"
        />
      </span>
    </Figure>
  );
}

/** A picker in its sentence, on a list to search, for words that match nothing. */
function PickerKitNone() {
  const [moment, setMoment] = useState<"quiet_30" | "phoned_only" | "new_week">("quiet_30");
  return (
    <Figure id="picker-kit-none" about={`the kit's Picker on a list to search, none matching; chosen: ${moment}`}>
      <span className="gx-pop-words">
        Send it to{" "}
        <Picker
          label="The moment it runs on"
          value={moment}
          onValueChange={setMoment}
          groups={MOMENTS}
          chevron={glyph("chevron-down", 11)}
          search={{ glass: glyph("search", 12), placeholder: "Find a moment", empty: "No moment has those words." }}
          data-testid="picker-none-open"
        />
      </span>
    </Figure>
  );
}

/** A picker in its sentence, read-only: it says what was chosen and opens nothing. */
function PickerKitReadOnly() {
  return (
    <Figure id="picker-kit-readonly" about="the kit's Picker, read-only">
      <span className="gx-pop-words">
        Every day at{" "}
        <Picker
          label="The hour it runs"
          value="10"
          onValueChange={() => undefined}
          groups={HOURS}
          chevron={glyph("chevron-down", 11)}
          readOnly
          data-testid="picker-readonly"
        />
      </span>
    </Figure>
  );
}

/** A picker read as a word of its sentence (`inline`): no capsule, its words underlined. */
function PickerKitInline() {
  const [hour, setHour] = useState<string>("10");
  return (
    <Figure id="picker-kit-inline" about="the kit's Picker, inline">
      <span className="gx-pop-words">
        Every day at{" "}
        <Picker
          label="The hour it runs"
          value={hour}
          onValueChange={setHour}
          groups={HOURS}
          chevron={glyph("chevron-down", 11)}
          inline
          data-testid="picker-inline"
        />
        , up to 25 people a run.
      </span>
    </Figure>
  );
}

/** A tooltip on a control. */
function TooltipKit() {
  return (
    <Figure id="tooltip-kit" about="the kit's Tooltip">
      <Tooltip tip="Only an owner can export this workspace's people.">
        <Button size="sm" data-testid="tooltip-trigger">
          Export
        </Button>
      </Tooltip>
    </Figure>
  );
}

/** A figure whose label carries a definition: the kit's Tooltip over the term. */
function FigureDefined() {
  return (
    <Figure id="figure-defined" about="the kit's Figure, its label carrying a definition">
      <dl className="gx-figs">
        <KitFigure
          label="Customer messages"
          value="17"
          meta="on 6 of 7 days"
          definition="What customers wrote or phoned in. Your replies and your campaigns are not counted."
          data-testid="figure-kit"
        />
      </dl>
    </Figure>
  );
}

/** The select, in a field. */
function SelectKit() {
  const [service, setService] = useState<Service>("consult");
  return (
    <Figure id="select-kit" about={`the kit's Select in its Field; chosen: ${service}`}>
      <Field
        label="Service"
        hint="What the proposal is for."
        control={
          <Select value={service} onValueChange={setService} options={SERVICES} chevron={glyph("chevron-down", 12)} />
        }
      />
    </Figure>
  );
}

/** The combobox. */
function ComboboxKit() {
  const [language, setLanguage] = useState<Language | null>(null);
  return (
    <Figure id="combobox-kit" about={`the kit's Combobox; chosen: ${language ?? "none"}`}>
      <Combobox
        label="Languages"
        placeholder="Add a language"
        value={language}
        onValueChange={setLanguage}
        options={LANGUAGES}
        glass={glyph("search", 12)}
      />
    </Figure>
  );
}

/** Switches: off, on and read-only. */
function SwitchKit() {
  const [now, setNow] = useState(false);
  const [remind, setRemind] = useState(true);
  return (
    <Figure id="switch-kit" about="the kit's Switch: off, on, read-only">
      <Switch label="Send it now" checked={now} onCheckedChange={setNow} />
      <Switch label="Remind them the day before" checked={remind} onCheckedChange={setRemind} />
      <Switch label="Take calls" checked readOnly onCheckedChange={() => undefined} />
    </Figure>
  );
}

/** The segmented control. */
function SegmentedKit() {
  const [often, setOften] = useState("week");
  return (
    <Figure id="segmented-kit" about="the kit's Segmented">
      <Segmented
        label="How often"
        value={often}
        onValueChange={setOften}
        options={[
          { value: "once", label: "Once" },
          { value: "week", label: "Every week" },
          { value: "month", label: "Every month" },
        ]}
      />
    </Figure>
  );
}

/** The segmented control with a sentence under each option. */
function SegmentedKitHints() {
  const [who, setWho] = useState("everyone");
  return (
    <Figure id="segmented-kit-hints" about="the kit's Segmented, a sentence under each option">
      <Segmented
        label="Who it answers"
        value={who}
        onValueChange={setWho}
        options={[
          { value: "everyone", label: "Everyone", hint: "Every caller and every message." },
          { value: "known", label: "People it knows", hint: "A new number is handed to you." },
        ]}
      />
    </Figure>
  );
}

/** The sub-tabs: three, the first picked, a figure on two. */
function SubTabsKit() {
  const [on, setOn] = useState("needs");
  return (
    <Figure id="subtabs" about="the kit's SubTabs">
      <SubTabs
        label="Conversations by status"
        value={on}
        onSelect={setOn}
        tabs={[
          { id: "needs", label: "Needs you", count: 27 },
          { id: "done", label: "Handled" },
          { id: "snoozed", label: "Snoozed", count: 3 },
        ]}
      />
    </Figure>
  );
}

/** The sub-tabs of a phone's Inbox: only the warn tab says its figure. */
function SubTabsKitQuiet() {
  const [on, setOn] = useState("needs");
  return (
    <Figure id="subtabs-quiet" about="the kit's SubTabs, quiet on a phone">
      <SubTabs
        label="Conversations by status"
        quietCounts
        value={on}
        onSelect={setOn}
        tabs={[
          { id: "needs", label: "Needs you", count: 27, tone: "warn" },
          { id: "done", label: "Handled", count: 112 },
          { id: "snoozed", label: "Snoozed", count: 3 },
        ]}
      />
    </Figure>
  );
}

/** The sub-tabs of a desk pane with five tabs. */
function SubTabsKitDense() {
  const [on, setOn] = useState("all");
  return (
    <Figure id="subtabs-dense" about="the kit's SubTabs, dense">
      <SubTabs
        label="Conversations by channel"
        dense
        value={on}
        onSelect={setOn}
        tabs={[
          { id: "all", label: "All", count: 64 },
          { id: "calls", label: "Calls", count: 13 },
          { id: "whatsapp", label: "WhatsApp", count: 35 },
          { id: "text", label: "Text", count: 6 },
          { id: "email", label: "Email", count: 10 },
        ]}
      />
    </Figure>
  );
}

/** The sub-tabs with a glyph before each word. */
function SubTabsKitGlyph() {
  const [on, setOn] = useState("all");
  return (
    <Figure id="subtabs-glyph" about="the kit's SubTabs, a glyph before each word">
      <SubTabs
        label="Conversations by channel"
        value={on}
        onSelect={setOn}
        tabs={[
          { id: "all", label: "All", count: 64, glyph: glyph("inbox", 13) },
          { id: "calls", label: "Calls", count: 12, glyph: glyph("phone", 13) },
          { id: "email", label: "Email", glyph: glyph("mail", 13) },
        ]}
      />
    </Figure>
  );
}

/** Fields: a hint, and a unit. */
function FieldKit() {
  const [link, setLink] = useState("https://example.com/book");
  const [notice, setNotice] = useState("24");
  return (
    <Figure id="field-kit" about="the kit's Field: a hint, a unit">
      <Field label="Booking link" value={link} onValueChange={setLink} hint="Sent instead of booking a visit itself." />
      <Field label="Least notice" value={notice} onValueChange={setNotice} unit="hours" />
    </Figure>
  );
}

/** Fields: what is wrong, mended as it is typed, and a box of sentences. */
function FieldKitWrong() {
  const [site, setSite] = useState("northside studio");
  const [note, setNote] = useState("Parking is behind the building, through the gate.");
  const wrong = /^https:\/\//.test(site) ? undefined : "A website starts with https://.";
  return (
    <Figure id="field-kit-wrong" about="the kit's Field: what is wrong, and a box of sentences">
      {wrong === undefined ? (
        <Field label="Website" value={site} onValueChange={setSite} hint="Where they read about you." />
      ) : (
        <Field label="Website" value={site} onValueChange={setSite} problem={wrong} problemGlyph={glyph("alert", 11)} />
      )}
      <Field label="What fits no field" value={note} onValueChange={setNote} rows={3} />
    </Figure>
  );
}

/** A title said in place: no label drawn, named by its own words. */
function FieldKitTitle() {
  const [name, setName] = useState("Win-back, for people who have not been in");
  return (
    <Figure id="field-kit-title" about="the kit's Field as a title said in place">
      <Field
        aria-label="The playbook's name"
        shape="title"
        placeholder="Win-back"
        value={name}
        onValueChange={setName}
      />
    </Figure>
  );
}

/**
 * The entries, in the page's order, each by the gallery id it draws. `closed` is what the entry draws before anyone
 * touches it, with nothing portaled: a server draws that too, and the node suite holds it there.
 */
export const ENTRIES: { id: string; Draw: () => ReactElement; closed: boolean }[] = [
  { id: "sheet-kit", Draw: SheetKit, closed: false },
  { id: "sheet-kit-job", Draw: SheetKitJob, closed: false },
  { id: "sheet-kit-kicker", Draw: SheetKitKicker, closed: false },
  { id: "menu-kit", Draw: MenuKit, closed: false },
  { id: "menu-kit-set", Draw: MenuKitSet, closed: false },
  { id: "menu-kit-switches", Draw: MenuKitSwitches, closed: false },
  { id: "menu-kit-shared", Draw: MenuKitShared, closed: false },
  { id: "popover-kit", Draw: PopoverKit, closed: false },
  { id: "tooltip-kit", Draw: TooltipKit, closed: false },
  { id: "figure-defined", Draw: FigureDefined, closed: false },
  { id: "select-kit", Draw: SelectKit, closed: false },
  { id: "combobox-kit", Draw: ComboboxKit, closed: false },
  { id: "switch-kit", Draw: SwitchKit, closed: true },
  { id: "segmented-kit", Draw: SegmentedKit, closed: true },
  { id: "segmented-kit-hints", Draw: SegmentedKitHints, closed: true },
  { id: "subtabs", Draw: SubTabsKit, closed: true },
  { id: "subtabs-quiet", Draw: SubTabsKitQuiet, closed: true },
  { id: "subtabs-dense", Draw: SubTabsKitDense, closed: true },
  { id: "subtabs-glyph", Draw: SubTabsKitGlyph, closed: true },
  { id: "field-kit", Draw: FieldKit, closed: true },
  { id: "field-kit-wrong", Draw: FieldKitWrong, closed: true },
  { id: "field-kit-title", Draw: FieldKitTitle, closed: true },
  { id: "datepicker-kit", Draw: DatePickerKit, closed: false },
  { id: "picker-kit", Draw: PickerKit, closed: false },
  { id: "picker-kit-find", Draw: PickerKitFind, closed: false },
  { id: "picker-kit-none", Draw: PickerKitNone, closed: false },
  { id: "picker-kit-readonly", Draw: PickerKitReadOnly, closed: true },
  { id: "picker-kit-inline", Draw: PickerKitInline, closed: true },
];
