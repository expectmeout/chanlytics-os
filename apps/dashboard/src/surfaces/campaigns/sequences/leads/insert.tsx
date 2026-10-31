/**
 * The step sheet's Insert list (the lead-to-sequence canvas's board C, "Writing a step"): each value the email may name,
 * under About them and About you, with what it holds for the lead previewed, or what stands in its place (found per lead,
 * written for each, not set). A press puts the value in the box last used, at its caret (the editor's seats). A value of
 * yours that is not set holds every email that names it, so it says so, with Add: the booking link is put in here and kept
 * in Settings (the settings verb, its receipt and undo), the name it signs with here and kept on the sequence (How it
 * runs' Signed), a business name in Settings itself.
 *
 * Drawn in the sheet, not as a menu's popup: the sheet is modal, and a popup opens outside its trap.
 */
import { useState } from "react";
import {
  LEAD_BUILD_WORDS as W,
  addressOf,
  describeSettingsChange,
  leadInsertRowsOf,
  type LeadInsertRowVM,
  type SlotLead,
  type SlotWorkspace,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { LinkButton } from "../../../kit/link-button/link-button";
import { cx } from "../../../kit/variants";
import { focusAsDrawn, gate, navigate, type LegacyFlash } from "../../../legacy-verbs";
import type { SlotSeats } from "../../templates/slots/slot-seats";
import { pressed } from "../verbs";

interface InsertProps {
  lead: SlotLead | null;
  workspace: SlotWorkspace;
  /** Whether this step offers {{their preview}}, or why not (contracts leadPreviewOfferOf). */
  preview: { offered: boolean; why: string | null };
  seats: SlotSeats;
  flash: (f: LegacyFlash) => void;
  /** The name the sequence signs with, as it is typed: saved with the chain. */
  onSigned: (name: string) => void;
}

/** One value's row: its label, and what it holds here, or that it is not set with its Add. */
function InsertRow({ row, onPut, onAdd }: { row: LeadInsertRowVM; onPut: () => void; onAdd: () => void }) {
  return (
    <li className="ld-ins-row" data-testid={`ld-insert-${row.key.replace(/ /g, "-")}`}>
      <LinkButton className="ld-ins-put" onClick={onPut}>
        {row.label}
      </LinkButton>
      {row.look === "unset" ? (
        <span className="ld-ins-v is-unset">
          {W.notSet} ·{" "}
          <LinkButton onClick={onAdd} data-testid={`ld-insert-add-${row.key.replace(/ /g, "-")}`}>
            {W.add}
          </LinkButton>
        </span>
      ) : (
        <span className={cx("ld-ins-v", row.look === "later" && "is-later")}>{row.value}</span>
      )}
    </li>
  );
}

/** The booking link put in from the step: kept in Settings by the settings verb. */
function BookingLinkField({ flash, onDone }: { flash: (f: LegacyFlash) => void; onDone: () => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const change = { op: "set_booking_link" as const, link: link.trim() };
    setBusy(true);
    const ok = await pressed("settings", { change, summary: describeSettingsChange(change) }, flash, () => undefined);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="ld-ins-add" data-testid="ld-booking-link">
      <Field
        label={W.bookingLink}
        type="url"
        inputMode="url"
        value={link}
        placeholder="https://"
        onValueChange={setLink}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- Add opened it to type the link
        autoFocus={focusAsDrawn()}
        data-testid="ld-booking-link-field"
      />
      <Button
        size="sm"
        variant="primary"
        disabled={busy || !link.trim()}
        onClick={() => void save()}
        data-testid="ld-booking-link-save"
        {...gate("settings")}
      >
        {W.bookingSave}
      </Button>
    </div>
  );
}

export function LeadInsert({ lead, workspace, preview, seats, flash, onSigned }: InsertProps) {
  const rows = leadInsertRowsOf(lead, workspace, preview);
  const [adding, setAdding] = useState<"booking link" | "your name" | null>(null);
  const group = (g: LeadInsertRowVM["group"]) =>
    rows
      .filter((r) => r.group === g)
      .map((r) => (
        <InsertRow
          key={r.key}
          row={r}
          onPut={() => seats.add(r.key)}
          onAdd={() =>
            r.key === "booking link" || r.key === "your name"
              ? setAdding(r.key)
              : navigate(addressOf({ kind: "facts" }))
          }
        />
      ));
  return (
    <div className="ld-ins" data-testid="ld-insert">
      <p className="ld-ins-k">{W.aboutThem}</p>
      <ul className="ld-ins-list">{group("them")}</ul>
      {preview.why ? (
        <p className="ld-note" data-testid="ld-insert-no-preview">
          {preview.why}
        </p>
      ) : null}
      <p className="ld-ins-k">{W.aboutYou}</p>
      <ul className="ld-ins-list">{group("you")}</ul>
      {adding === "booking link" ? <BookingLinkField flash={flash} onDone={() => setAdding(null)} /> : null}
      {adding === "your name" ? (
        <div className="ld-ins-add" data-testid="ld-signed">
          <Field
            label={W.runs.signed}
            value={workspace.yourName ?? ""}
            maxLength={60}
            // eslint-disable-next-line jsx-a11y-x/no-autofocus -- Add opened it to type the name
            autoFocus={focusAsDrawn()}
            onValueChange={onSigned}
            data-testid="ld-signed-field"
          />
        </div>
      ) : null}
    </div>
  );
}
