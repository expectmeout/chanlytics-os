// Chanlytics — Settings › Business: the workspace's logo, in "Who you are" after its name (00407; Claude Video
// docs/2026-10-11-workspace-logo-plan.md).
//
// The row says the logo the one way it is ever seen: the circle, the logo over the workspace's initials, or the initials
// alone. Its act opens a small menu of what may be done: choose a picture from this device, use the one the business's
// own website declares (offered only where the website is the business's own, not a booking platform's or a social
// page), take it away. A picture chosen or found is made into the square here (picture.ts) and shown in the row's own
// circle with Save, or with Use it and Not this one when it was found; nothing is kept until then. Every word is
// contracts' (logo.ts); no file kind and no pixel count reaches an owner.

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  LOGO_CHOSEN_TYPES,
  LOGO_WORDS,
  logoFoundOn,
  logoLookupWords,
  siteHost,
  workspaceInitials,
  type LogoNote,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Face } from "../../../kit/face/face";
import { MoreMenu } from "../../../kit/more-menu/more-menu";
import { RecordRow } from "../../../kit/record/row";
import { gate } from "../../../legacy-verbs";
import type { LegacyFlash } from "../../../legacy-verbs";
import { activeWorkspaceNow, factsNow, workspacesNow } from "../shell";
import { blobOf, chosenOk, makePicture, type MadePicture } from "./picture";
import { logoVerbs } from "./verbs";

/** A picture made and not yet kept: where it was found, when it was, rather than chosen. */
type Draft = MadePicture & { found: string | null };

const NOTE_WORDS: Record<LogoNote, string> = { wide: LOGO_WORDS.wide, small: LOGO_WORDS.small };

/** A workspace as the boot's list says it, as far as this row reads it. */
interface Listed {
  id: string;
  name?: string;
  logo_url?: string | null;
}

const isListed = (w: unknown): w is Listed =>
  typeof w === "object" && w !== null && typeof Reflect.get(w, "id") === "string";

/** The workspace being looked at, drawn again when the list is read again (a save, a switch). */
function useWorkspace(): Listed | null {
  const [, drawAgain] = useState(0);
  useEffect(() => {
    const again = () => drawAgain((n) => n + 1);
    window.addEventListener("surface:workspace", again);
    return () => window.removeEventListener("surface:workspace", again);
  }, []);
  const list: unknown = workspacesNow();
  const rows = Array.isArray(list) ? list.filter(isListed) : [];
  return rows.find((w) => w.id === activeWorkspaceNow()) ?? null;
}

/**
 * What the row says under the circle: what is being done, what went wrong (a refused save is said over the picture it
 * did not keep), where a picture was found, what to know about it.
 */
function logoRowWords(busy: "looking" | "saving" | null, draft: Draft | null, said: string | null): string | null {
  if (busy === "looking") return LOGO_WORDS.looking;
  if (busy === "saving") return LOGO_WORDS.saving;
  if (said) return said;
  if (draft) {
    const lines = [draft.found ? `${logoFoundOn(draft.found)}.` : null, ...draft.notes.map((n) => NOTE_WORDS[n])];
    return lines.filter(Boolean).join(" ") || null;
  }
  return said;
}

export function BtLogoRow({ canEdit, flash }: { canEdit: boolean; flash: (flash: LegacyFlash) => void }) {
  const ws = useWorkspace();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"looking" | "saving" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  // What a save or a removal answered, shown until the list read again says the same.
  const [kept, setKept] = useState<{ url: string | null } | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const current = ws?.logo_url ?? null;
  useEffect(() => {
    if (kept && kept.url === current) setKept(null);
  }, [kept, current]);
  // A preview is a blob: the page lets it go when the picture is kept, set aside or replaced.
  useEffect(() => () => (draft ? URL.revokeObjectURL(draft.preview) : undefined), [draft]);

  const shown = draft ? draft.preview : kept ? kept.url : current;
  const ownSite = !!siteHost(factsNow()?.facts?.website?.value ?? null);
  const changeGate = gate("settings", "change the logo");

  const offer = (made: MadePicture | null, found: string | null) => {
    setSaid(made ? null : LOGO_WORDS.unusable);
    setDraft(made ? { ...made, found } : null);
  };
  const chosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0] ?? null;
    e.currentTarget.value = "";
    if (!file) return;
    if (!chosenOk(file)) return offer(null, null);
    offer(await makePicture(file), null);
  };
  const look = async () => {
    setDraft(null);
    setSaid(null);
    setBusy("looking");
    const r = await logoVerbs.lookup();
    setBusy(null);
    if (!r.ok) return setSaid(r.message);
    if (r.data.outcome !== "found") return setSaid(logoLookupWords(r.data.outcome));
    offer(await makePicture(blobOf(r.data.image.base64, r.data.image.content_type)), r.data.host);
  };
  const save = async () => {
    if (!draft || busy) return;
    setSaid(null);
    setBusy("saving");
    const r = await logoVerbs.save(draft.base64);
    setBusy(null);
    if (!r.ok) return setSaid(r.message || LOGO_WORDS.notSaved);
    setKept({ url: r.data.logo_url });
    setDraft(null);
    flash({ tone: "ok", msg: LOGO_WORDS.saved });
  };
  const remove = async () => {
    setDraft(null);
    setSaid(null);
    const r = await logoVerbs.remove();
    if (!r.ok) return setSaid(r.message || LOGO_WORDS.notSaved);
    setKept({ url: null });
    flash({ tone: "ok", msg: LOGO_WORDS.removed });
  };

  // The house menu the route already loads (kit/more-menu), not the Base UI one: this row is drawn with the workspace's
  // route, and a Base UI menu here moved its chunk out of every page into the route (#1558's first build, +69 KB).
  const items = [
    { label: LOGO_WORDS.choose, onClick: () => picker.current?.click(), gate: changeGate },
    ...(ownSite ? [{ label: LOGO_WORDS.fromWebsite, onClick: () => void look(), gate: changeGate }] : []),
    ...(shown && !draft
      ? [{ label: LOGO_WORDS.remove, onClick: () => void remove(), danger: true, gate: changeGate }]
      : []),
  ];

  return (
    <RecordRow
      id="logo"
      label={LOGO_WORDS.label}
      value={<Face initials={workspaceInitials(ws?.name)} photo={shown ?? undefined} size="lg" />}
      hint={logoRowWords(busy, draft, said)}
      // A member who may not change it reads it, as every row of the record is read, and is offered no act.
      act={
        canEdit
          ? {
              label: shown ? LOGO_WORDS.change : LOGO_WORDS.add,
              gate: changeGate,
              testid: "rec-row-act-logo",
              wrap: (_button, face) => (
                <MoreMenu
                  items={items}
                  face={face}
                  btnClass="rec-row-act"
                  testid="rec-row-act-logo"
                  title={LOGO_WORDS.menuLabel}
                  ariaLabel={`${shown ? LOGO_WORDS.change : LOGO_WORDS.add} — ${LOGO_WORDS.label}`}
                />
              ),
            }
          : null
      }
    >
      <input
        ref={picker}
        type="file"
        accept={LOGO_CHOSEN_TYPES.join(",")}
        hidden
        onChange={(e) => void chosen(e)}
        data-testid="bt-logo-picker"
      />
      {draft ? (
        <span className="bt-logo-acts">
          <Button size="sm" onClick={() => void save()} disabled={busy === "saving"} data-testid="bt-logo-save">
            {draft.found ? LOGO_WORDS.useIt : LOGO_WORDS.save}
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              setSaid(null);
              setDraft(null);
            }}
            data-testid="bt-logo-cancel"
          >
            {draft.found ? LOGO_WORDS.notThis : LOGO_WORDS.cancel}
          </Button>
        </span>
      ) : null}
    </RecordRow>
  );
}
