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
  Field,
  Menu,
  Popover,
  Segmented,
  Select,
  Sheet,
  Switch,
  Tooltip,
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

/**
 * The entries, in the page's order, each by the gallery id it draws. `closed` is what the entry draws before anyone
 * touches it, with nothing portaled: a server draws that too, and the node suite holds it there.
 */
export const ENTRIES: { id: string; Draw: () => ReactElement; closed: boolean }[] = [
  { id: "sheet-kit", Draw: SheetKit, closed: false },
  { id: "menu-kit", Draw: MenuKit, closed: false },
  { id: "menu-kit-set", Draw: MenuKitSet, closed: false },
  { id: "popover-kit", Draw: PopoverKit, closed: false },
  { id: "tooltip-kit", Draw: TooltipKit, closed: false },
  { id: "select-kit", Draw: SelectKit, closed: false },
  { id: "combobox-kit", Draw: ComboboxKit, closed: false },
  { id: "switch-kit", Draw: SwitchKit, closed: true },
  { id: "segmented-kit", Draw: SegmentedKit, closed: true },
  { id: "segmented-kit-hints", Draw: SegmentedKitHints, closed: true },
  { id: "field-kit", Draw: FieldKit, closed: true },
  { id: "field-kit-wrong", Draw: FieldKitWrong, closed: true },
];
