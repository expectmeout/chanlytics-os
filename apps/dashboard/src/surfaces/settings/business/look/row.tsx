// Chanlytics — Settings › Business: the workspace's colour, in "Who you are" after its logo (00490, decision 0075).
//
// The row says the colour the one way it is ever seen: a swatch and its hex, or none. Change opens the picker, the acts,
// and under them the very email a customer gets (contracts signupConfirmEmailHtml, drawn with the draft), so what is
// previewed is what is sent. Nothing is kept until Save; "Use ink instead" takes the colour away. Every word is
// contracts' (look.ts); the picker is the kit's field with the browser's own colour input.

import { useEffect, useState } from "react";
import { LOOK_WORDS, signupConfirmEmailHtml } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { RecordField } from "../../../kit/record/field";
import { RecordRow } from "../../../kit/record/row";
import { gate } from "../../../legacy-verbs";
import type { LegacyFlash } from "../../../legacy-verbs";
import { useWorkspace } from "../logo/row";
import { lookVerbs } from "./verbs";

/** The colour the picker opens on where the workspace has none: ink, which is what a letter wears then. */
const PICKER_START = "#1f2026";

/** The email as the draft would send it: the sign-up confirmation, with this workspace's name and logo. */
function letterPreviewOf(name: string, logo: string | null, accent: string | null): string {
  return signupConfirmEmailHtml({ business: name, link: "#", look: { business: name, logo_url: logo, accent } });
}

export function BtColourRow({ canEdit, flash }: { canEdit: boolean; flash: (flash: LegacyFlash) => void }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(PICKER_START);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  // What a save or a removal answered, shown until the list read again says the same.
  const [kept, setKept] = useState<{ accent: string | null } | null>(null);

  const listed = ws?.accent ?? null;
  useEffect(() => {
    if (kept && kept.accent === listed) setKept(null);
  }, [kept, listed]);
  const current = kept ? kept.accent : listed;
  const changeGate = gate("settings", LOOK_WORDS.gate);

  const begin = () => {
    setDraft(current ?? PICKER_START);
    setSaid(null);
    setOpen(true);
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const r = await lookVerbs.save(draft.toLowerCase());
    setBusy(false);
    if (!r.ok) return setSaid(r.message || LOOK_WORDS.notSaved);
    setKept({ accent: r.data.accent });
    setOpen(false);
    flash({ tone: "ok", msg: LOOK_WORDS.saved });
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const r = await lookVerbs.remove();
    setBusy(false);
    if (!r.ok) return setSaid(r.message || LOOK_WORDS.notSaved);
    setKept({ accent: null });
    setOpen(false);
    flash({ tone: "ok", msg: LOOK_WORDS.removed });
  };

  const name = ws?.name ?? "";
  return (
    <RecordRow
      id="accent"
      label={LOOK_WORDS.label}
      value={
        current ? (
          <span className="bt-look-swatch">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <rect width="18" height="18" rx="5" fill={current} />
            </svg>
            <span className="tabular">{current}</span>
          </span>
        ) : null
      }
      empty={LOOK_WORDS.none}
      hint={said ?? LOOK_WORDS.hint}
      // A member who may not change it reads it, as every row of the record is read, and is offered no act.
      act={
        canEdit && !open
          ? {
              label: current ? LOOK_WORDS.change : LOOK_WORDS.add,
              gate: changeGate,
              onClick: begin,
              testid: "rec-row-act-accent",
            }
          : null
      }
    >
      {open ? (
        <div className="bt-look-editor" data-testid="bt-look-editor">
          <RecordField
            id="bt-accent"
            label={LOOK_WORDS.label}
            type="color"
            value={draft}
            onChange={setDraft}
            testid="bt-accent-field"
          />
          <span className="bt-logo-acts">
            <Button size="sm" onClick={() => void save()} disabled={busy} data-testid="bt-accent-save">
              {busy ? LOOK_WORDS.saving : LOOK_WORDS.save}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setOpen(false)} data-testid="bt-accent-cancel">
              {LOOK_WORDS.cancel}
            </Button>
            {current ? (
              <Button
                size="sm"
                variant="quiet"
                tone="danger"
                onClick={() => void remove()}
                data-testid="bt-accent-remove"
              >
                {LOOK_WORDS.remove}
              </Button>
            ) : null}
          </span>
          <p className="bt-inline-note">{LOOK_WORDS.previewSub}</p>
          <iframe
            className="bt-look-preview"
            title={LOOK_WORDS.preview}
            sandbox=""
            srcDoc={letterPreviewOf(name, ws?.logo_url ?? null, draft)}
            data-testid="bt-look-preview"
          />
        </div>
      ) : null}
    </RecordRow>
  );
}
