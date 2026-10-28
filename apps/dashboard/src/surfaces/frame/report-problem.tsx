/**
 * Get help (decisions 0066 and 0067): a member asks a person at Chanlytics for help, from Settings › Profile, a card
 * whose read failed ("Report this"), or the error screen (which leaves its error for after the reload that heals it).
 * They say what they need first: a question, help setting up, something that isn't working (where the failing doors
 * open it), or billing; the question under it and its example follow the pick. What they write goes with the page they
 * are on and the workspace the tab holds, and with "Something isn't working" the last error this page load caught (its
 * short id, its name, its first line); never what was on the page, nor anything of their customers. The answer is the
 * report's number and the promise, a person by email within one business day, with the line that helps meanwhile.
 *
 * The host mounts with the frame and opens the sheet through the kit's report door, so any card may offer it while the
 * frame is there and none offers a door that opens nothing.
 */
import { useLayoutEffect, useRef, useState } from "react";
import {
  REPORT_KINDS,
  REPORT_KIND_WORDS,
  REPORT_LIMITS,
  REPORT_WORDS,
  pageWords,
  reportProblemOf,
  type ReportKind,
} from "@chanlytics/contracts";
import { REPORT_AFTER_KEY, lastClientError } from "@/client/client-error";
import { api } from "@/legacy-bridge/api";
import { meNow } from "../legacy-verbs";
import { Button } from "../kit/button/button";
import { setReportDoor } from "../kit/empty/report-door";
import { Field, fieldProblem } from "../kit/field/field";
import { Icon } from "../kit/icon/icon";
import { Segmented } from "../kit/segmented/segmented";
import { Sheet } from "../kit/sheet/sheet";
import { shellAddress } from "./shell-routes";

type Caught = ReturnType<typeof lastClientError>;
type Phase =
  { at: "writing" } | { at: "sending" } | { at: "sent"; code: string; meanwhile: string | null } | { at: "failed" };

/** The workspace the address names (`/w/<slug>/…`), or none. */
const workspaceOnScreen = (): string | null => /^\/w\/([^/]+)/.exec(window.location.pathname)?.[1] ?? null;

/** What an error screen left for after its reload, once, read and forgotten: its error, or none caught; or nothing asked. */
function leftByAnErrorScreen(): { error: Caught } | null {
  try {
    const raw = window.sessionStorage.getItem(REPORT_AFTER_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(REPORT_AFTER_KEY);
    const said = JSON.parse(raw) as NonNullable<Caught> | { none: true };
    return { error: "id" in said ? said : null };
  } catch {
    return null;
  }
}

function ReportSheet({ error, opened, onClose }: { error: Caught; opened: ReportKind; onClose: () => void }) {
  const [kind, setKind] = useState<ReportKind>(opened);
  const [words, setWords] = useState("");
  const box = useRef<HTMLTextAreaElement | null>(null);
  const [phase, setPhase] = useState<Phase>({ at: "writing" });
  const email = meNow()?.email ?? null;
  const page = error?.page ?? shellAddress().route().split("/")[0] ?? null;
  const send = async () => {
    if (!words.trim()) return;
    setPhase({ at: "sending" });
    const body = reportProblemOf(kind, words, page, error, workspaceOnScreen());
    const r = await api()("POST support/report", { body, once: true });
    setPhase(r.ok ? { at: "sent", code: r.data.code, meanwhile: r.data.meanwhile } : { at: "failed" });
  };
  const sent = phase.at === "sent";
  const asked = REPORT_KIND_WORDS[kind];
  // The error rides only with "Something isn't working": a question is not a bug's.
  const shown = kind === "wrong" ? error : null;
  return (
    <Sheet
      open
      onClose={onClose}
      title={REPORT_WORDS.title}
      sub={REPORT_WORDS.sub}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      foot={
        sent ? (
          <Button onClick={onClose} data-testid="report-done">
            {REPORT_WORDS.done}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => void send()}
            disabled={!words.trim() || phase.at === "sending"}
            data-testid="report-send"
          >
            {phase.at === "sending" ? REPORT_WORDS.sending : REPORT_WORDS.send}
          </Button>
        )
      }
      initialFocus={box}
      testid="report-problem"
    >
      {sent ? (
        <div className="set-row" data-testid="report-sent">
          <div className="set-row-info">
            <span className="set-row-label">
              {REPORT_WORDS.sent} · {phase.code}
            </span>
            <span className="set-row-hint">{REPORT_WORDS.sentBody(email)}</span>
            {phase.meanwhile && (
              <span className="set-row-hint" data-testid="report-meanwhile">
                {REPORT_WORDS.meanwhile(phase.meanwhile)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <>
          <Segmented
            label={REPORT_WORDS.need}
            value={kind}
            onValueChange={setKind}
            options={REPORT_KINDS.map((k) => ({
              value: k,
              label: REPORT_KIND_WORDS[k].pick,
              hint: REPORT_KIND_WORDS[k].hint,
              testid: `report-kind-${k}`,
            }))}
          />
          <Field
            label={asked.label}
            value={words}
            onValueChange={setWords}
            placeholder={asked.placeholder}
            maxLength={REPORT_LIMITS.words}
            rows={5}
            ref={box}
            data-testid="report-words"
            {...fieldProblem(phase.at === "failed" ? REPORT_WORDS.failed : null)}
          />
          <div className="set-row">
            <div className="set-row-info">
              <span className="set-row-label">{REPORT_WORDS.sentWith}</span>
              <span className="set-row-hint" data-testid="report-page">
                {REPORT_WORDS.thisPage(pageWords(page))}
              </span>
              {shown && (
                <span className="set-row-hint" data-testid="report-error">
                  {REPORT_WORDS.theError(`${shown.id} · ${shown.name}`)}
                </span>
              )}
              <span className="set-row-hint">{REPORT_WORDS.privacy(email)}</span>
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}

/**
 * The frame's host: the kit's report door while the frame is mounted, and the sheet it opens, on the kind its door
 * named (a question from Settings; something that isn't working from a failed card or the error screen).
 */
export function ReportHost() {
  const [open, setOpen] = useState<{ error: Caught; kind: ReportKind } | null>(null);
  // Before the frame is painted, so a page's door to it (Profile's Get help) is in the page's first frame.
  useLayoutEffect(() => {
    setReportDoor((_what, kind) => setOpen({ error: lastClientError(), kind: kind ?? "how_to" }));
    const left = leftByAnErrorScreen();
    if (left) setOpen({ ...left, kind: "wrong" });
    return () => setReportDoor(null);
  }, []);
  return open ? <ReportSheet error={open.error} opened={open.kind} onClose={() => setOpen(null)} /> : null;
}
