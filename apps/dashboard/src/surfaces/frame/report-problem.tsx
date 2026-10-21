/**
 * Report a problem (decision 0066): a member tells a person at Chanlytics what went wrong, from a card whose read failed
 * ("Report this"), the error screen (which leaves its error for after the reload that heals it), or Settings › Profile.
 * What they write goes with the page they are on and the last error this page load caught (its short id, its name, its
 * first line), and the workspace the tab holds; never what was on the page, nor anything of their customers. The answer
 * is the report's number, which the sheet says, and a person replies by email.
 *
 * The host mounts with the frame and opens the sheet through the kit's report door, so any card may offer it while the
 * frame is there and none offers a door that opens nothing.
 */
import { useEffect, useRef, useState } from "react";
import { REPORT_LIMITS, REPORT_WORDS, pageWords, reportProblemOf } from "@chanlytics/contracts";
import { REPORT_AFTER_KEY, lastClientError } from "@/client/client-error";
import { api } from "@/legacy-bridge/api";
import { meNow } from "../legacy-verbs";
import { Button } from "../kit/button/button";
import { reportDoor } from "../kit/empty/report-door";
import { Field, fieldProblem } from "../kit/field/field";
import { Icon } from "../kit/icon/icon";
import { Sheet } from "../kit/sheet/sheet";
import { shellAddress } from "./shell-routes";

type Caught = ReturnType<typeof lastClientError>;
type Phase = { at: "writing" } | { at: "sending" } | { at: "sent"; code: string } | { at: "failed" };

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

function ReportSheet({ error, onClose }: { error: Caught; onClose: () => void }) {
  const [words, setWords] = useState("");
  const box = useRef<HTMLTextAreaElement | null>(null);
  const [phase, setPhase] = useState<Phase>({ at: "writing" });
  const email = meNow()?.email ?? null;
  const page = error?.page ?? shellAddress().route().split("/")[0] ?? null;
  const send = async () => {
    if (!words.trim()) return;
    setPhase({ at: "sending" });
    const body = reportProblemOf(words, page, error, workspaceOnScreen());
    const r = await api()("POST support/report", { body, once: true });
    setPhase(r.ok ? { at: "sent", code: r.data.code } : { at: "failed" });
  };
  const sent = phase.at === "sent";
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
          </div>
        </div>
      ) : (
        <>
          <Field
            label={REPORT_WORDS.label}
            value={words}
            onValueChange={setWords}
            placeholder={REPORT_WORDS.placeholder}
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
              {error && (
                <span className="set-row-hint" data-testid="report-error">
                  {REPORT_WORDS.theError(`${error.id} · ${error.name}`)}
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

/** The frame's host: the kit's report door while the frame is mounted, and the sheet it opens. */
export function ReportHost() {
  const [open, setOpen] = useState<{ error: Caught } | null>(null);
  useEffect(() => {
    reportDoor.open = () => setOpen({ error: lastClientError() });
    const left = leftByAnErrorScreen();
    if (left) setOpen(left);
    return () => {
      reportDoor.open = null;
    };
  }, []);
  return open ? <ReportSheet error={open.error} onClose={() => setOpen(null)} /> : null;
}
