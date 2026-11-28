/**
 * A form the business's own website owns, open beside Campaigns › Forms' list (00709; Campaigns in three tabs, Lane B,
 * the canvas's Forms boards 3 to 6): the same three parts as a form made here, each its own. Form: what Chanlytics
 * receives from it, read only, since the site owns its questions. Next: for a request, the same as a form made here,
 * read from what can go (AI drafts, you send; it waits in Needs you until it is answered); for a sign-up, as before (a
 * confirmation email first, offers only once they confirm, never Needs you). Site: where it comes from, what it brought,
 * and the way to the website connection. Its pill says Listed or Hidden: hiding only takes it off the list.
 */
import { useState } from "react";
import {
  agoWords,
  requestAddress,
  SITE_FORM_FIELDS,
  type FormPart,
  type OutsideFormSheetDto,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { EmptyState } from "../../../kit/empty/empty";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Menu, type MenuItem } from "../../../kit/menu/menu";
import { Sheet } from "../../../kit/sheet/sheet";
import { SubTabs } from "../../../kit/sub-tabs/sub-tabs";
import { navigate, type FrameFlash } from "../../../frame-verbs";
import { gate } from "../../../shell-doors";
import { CmPane } from "../../parts/split";
import { NextLine } from "../next-part";
import { doFormEntryPress, doFormPress, useSiteFormSheet } from "../use-forms";
import { FORMS_WORDS } from "../words";
import { SITE_FORM_WORDS as W } from "./words";

/** A site's form's three parts: Site in place of a form made here's Share. */
const SITE_PARTS: readonly FormPart[] = ["form", "next", "site"];

/** Where a press lands: another sheet's part, the list, or the website connection. */
type Go = (place: { form: string | null; part?: FormPart; site?: boolean; website?: boolean }) => void;

/** What the sheet hands its presses. */
interface SiteIo {
  sheet: OutsideFormSheetDto;
  again: () => Promise<void>;
  flash: ((flash: FrameFlash) => void) | null;
}

/** A press on the form, said where it fails. */
async function pressSiteForm(
  io: SiteIo,
  press: { act: "site_rename"; name: string } | { act: "site_list"; listed: boolean },
) {
  const pressed = await doFormPress({ ...press, form_id: io.sheet.id });
  await io.again();
  if (!pressed.ok) io.flash?.({ tone: "danger", msg: pressed.message });
  return pressed.ok;
}

/** Listed or Hidden as a pill with a caret: Rename and Hide (or Show) ride it, never three dots. */
function ListedMenu({ io, onRename }: { io: SiteIo; onRename: () => void }) {
  const { sheet } = io;
  const word = sheet.listed ? W.listed : W.hidden;
  if (!sheet.can_change) return <span className="fmv-st">{word}</span>;
  const allowed = gate("approve", "change a form");
  const items: MenuItem[] = [
    { label: W.pill.rename, gate: allowed, onSelect: onRename },
    {
      label: sheet.listed ? W.pill.hide : W.pill.show,
      gate: allowed,
      onSelect: () => void pressSiteForm(io, { act: "site_list", listed: !sheet.listed }),
    },
  ];
  return (
    <Menu
      label={W.pill.label(sheet.name)}
      align="end"
      trigger={
        <Button size="sm" className="fmv-st" data-state={sheet.listed ? "live" : "off"} data-testid="forms-site-listed">
          {word} <Icon name="chevron-down" size={12} />
        </Button>
      }
      groups={[{ items }]}
    />
  );
}

/** The owner's own name for the form, asked in a sheet: empty goes back to the name the site sends. */
function RenameSheet(props: { io: SiteIo; open: boolean; onClose: () => void }) {
  const { io, open, onClose } = props;
  const [name, setName] = useState(io.sheet.own_name ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const done = await pressSiteForm(io, { act: "site_rename", name: name.trim() });
    setBusy(false);
    if (done) onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={W.rename.title}
      close={{ label: FORMS_WORDS.close, glyph: <Icon name="x" size={13} /> }}
      flatFoot
      fit
      testid="forms-site-rename"
      foot={
        <div data-foot-pair="">
          <Button variant="primary" disabled={busy} onClick={() => void save()} data-testid="forms-site-rename-save">
            {W.rename.save}
          </Button>
          <Button variant="quiet" onClick={onClose} data-foot-cancel="">
            {W.rename.cancel}
          </Button>
        </div>
      }
    >
      <Field
        label={W.rename.label}
        value={name}
        onValueChange={setName}
        placeholder={io.sheet.sent_name ?? io.sheet.name}
        maxLength={120}
        hint={W.rename.hint(io.sheet.sent_name)}
        data-testid="forms-site-rename-name"
      />
    </Sheet>
  );
}

/** Form: what Chanlytics receives from it, the website door's own fields, read only. */
function ReceivesPart() {
  return (
    <div className="fmv-nexts" data-testid="forms-site-form">
      <p className="fmv-note">{W.form.owns}</p>
      <h4>{W.form.receives}</h4>
      <ul className="fmv-receives">
        {SITE_FORM_FIELDS.map((field) => (
          <li key={field.id}>{field.label}</li>
        ))}
      </ul>
      <p className="fmv-note">{W.form.oneWay}</p>
    </div>
  );
}

/** Next: a request's road, as a form made here's, from what can go; a sign-up's, as before. */
function SiteNextPart({ sheet }: { sheet: OutsideFormSheetDto }) {
  const steps = W.next;
  const line = (step: { title: string; body: string; tag: string }) => (
    <NextLine key={step.title} title={step.title} body={step.body} end={step.tag ? <em>{step.tag}</em> : null} />
  );
  if (sheet.form === "signup")
    return (
      <div className="fmv-nexts" data-testid="forms-site-next">
        {[steps.confirm, steps.offers, steps.signupTold].map(line)}
      </div>
    );
  return (
    <div className="fmv-nexts" data-testid="forms-site-next">
      {[steps.told, steps.drafts(sheet.email_ready), steps.after, steps.waits].map(line)}
      <p className="fmv-note">{steps.marks}</p>
      {sheet.entries.some((entry) => entry.standing === "kept") ? <p className="fmv-note">{steps.before}</p> : null}
    </div>
  );
}

/** One entry held for a look: who, when and why, let through by a press, opened where a request is answered. */
function HeldEntry({ entry, now, io }: { entry: OutsideFormSheetDto["held"][number]; now: number; io: SiteIo }) {
  const letThrough = async () => {
    const pressed = await doFormEntryPress({ act: "let_through", entry_id: entry.id });
    if (!pressed.ok) io.flash?.({ tone: "danger", msg: pressed.message });
    await io.again();
  };
  return (
    <div className="fmv-ent" data-testid="forms-entry" data-standing="held">
      <strong>{entry.name ?? FORMS_WORDS.share.noName}</strong>
      <time>{agoWords(Date.parse(entry.created_at), now)}</time>
      <span>{entry.held_why ? W.held.why[entry.held_why] : ""}</span>
      <div className="fmv-acts">
        <Button
          size="sm"
          onClick={() => void letThrough()}
          data-testid="forms-entry-through"
          {...gate("approve", "let a request through")}
        >
          {W.held.letThrough}
        </Button>
        <Button size="sm" variant="quiet" onClick={() => navigate(requestAddress(entry.id))}>
          Open
        </Button>
      </div>
    </div>
  );
}

/**
 * Site: where it comes from, what it brought, its newest entries, its held pile, and the way to the website connection.
 */
function SitePart({ sheet, now, go, io }: { sheet: OutsideFormSheetDto; now: number; go: Go; io: SiteIo }) {
  const brought = sheet.results;
  return (
    <div className="fmv-share" data-testid="forms-site-site">
      <h4>{sheet.site.name}</h4>
      <p className="fmv-note">
        {sheet.site.last_entry_at ? W.site.lastEntry(agoWords(Date.parse(sheet.site.last_entry_at), now)) : W.site.none}
      </p>
      <h4>{W.results.title}</h4>
      <p className="fmv-note" data-testid="forms-site-results">
        {W.results.line(brought, sheet.form)}
        {brought.entries > 0 ? ` ${W.results.who(brought)}` : ""}
      </p>
      {sheet.entries.length > 0 ? <h4>{W.entries}</h4> : null}
      {sheet.entries.map((entry) => (
        <div key={entry.id} className="fmv-ent" data-testid="forms-entry" data-standing={entry.standing}>
          <strong>{entry.name ?? FORMS_WORDS.share.noName}</strong>
          <time>{agoWords(Date.parse(entry.created_at), now)}</time>
          <span>{W.standing[entry.standing]}</span>
          {entry.standing !== "kept" ? (
            <div className="fmv-acts">
              <Button size="sm" variant="quiet" onClick={() => navigate(requestAddress(entry.id))}>
                Open
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {sheet.held.length > 0 ? (
        <>
          <h4 data-testid="forms-site-held">{W.held.title(sheet.held.length)}</h4>
          {sheet.held.map((entry) => (
            <HeldEntry key={entry.id} entry={entry} now={now} io={io} />
          ))}
          <p className="fmv-note">{W.held.left}</p>
        </>
      ) : null}
      <LinkButton onClick={() => go({ form: null, website: true })} data-testid="forms-site-connection">
        {W.site.open}
      </LinkButton>
      <p className="fmv-note">{W.site.owns}</p>
    </div>
  );
}

/** The form's sheet, read: its three parts. */
function SiteSheetRead(props: { sheet: OutsideFormSheetDto; part: FormPart; io: SiteIo; go: Go }) {
  const { sheet, part, io, go } = props;
  const [renaming, setRenaming] = useState(false);
  const [now] = useState(() => Date.now());
  // The form's own newest entry, never its site's: a site sends several forms.
  const last = sheet.last_entry_at ? agoWords(Date.parse(sheet.last_entry_at), now) : null;
  return (
    <CmPane
      title={sheet.name}
      sub={W.sub(sheet.site.name, last, sheet.form)}
      tools={<ListedMenu io={io} onRename={() => setRenaming(true)} />}
      onClose={() => go({ form: null })}
      testid="forms-site-sheet"
      className="fmv-pane"
    >
      <SubTabs
        label={FORMS_WORDS.partsLabel}
        value={SITE_PARTS.includes(part) ? part : "form"}
        tabs={SITE_PARTS.map((id) => ({ id, label: FORMS_WORDS.parts[id] }))}
        onSelect={(id) => go({ form: sheet.id, site: true, part: SITE_PARTS.find((known) => known === id) ?? "form" })}
        className="fmv-parts"
      />
      {sheet.listed ? null : <p className="fmv-state">{W.hiddenSays}</p>}
      {part === "next" ? (
        <SiteNextPart sheet={sheet} />
      ) : part === "site" ? (
        <SitePart sheet={sheet} now={now} go={go} io={io} />
      ) : (
        <ReceivesPart />
      )}
      {renaming ? <RenameSheet io={io} open onClose={() => setRenaming(false)} /> : null}
    </CmPane>
  );
}

/** A site's form's sheet: read as it opens, said plainly while it is, and where it could not be. */
export function SiteFormSheet(props: {
  formId: string;
  part: FormPart;
  flash: ((flash: FrameFlash) => void) | null;
  listAgain: () => Promise<void>;
  go: Go;
}) {
  const { formId, part, flash, listAgain, go } = props;
  const read = useSiteFormSheet(formId);
  const again = async () => {
    await Promise.all([read.again(), listAgain()]);
  };
  if (!read.dto)
    return (
      <CmPane title={FORMS_WORDS.tab} onClose={() => go({ form: null })} testid="forms-site-sheet" className="fmv-pane">
        {read.failed ? (
          <EmptyState
            kind="page"
            glyph="note"
            title={FORMS_WORDS.unread.title}
            body={FORMS_WORDS.unread.body}
            action={{ label: FORMS_WORDS.unread.act, onClick: () => void again() }}
            testid="forms-site-unread"
          />
        ) : (
          <div className="route-reading" role="status" data-testid="forms-site-reading" />
        )}
      </CmPane>
    );
  return (
    <SiteSheetRead key={read.dto.id} sheet={read.dto} part={part} io={{ sheet: read.dto, again, flash }} go={go} />
  );
}
