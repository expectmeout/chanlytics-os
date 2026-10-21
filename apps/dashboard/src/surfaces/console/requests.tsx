/**
 * Requests (decision 0066, the canvas's Requests board): what the data-deletion page promises, kept with its clock. A
 * request is filed as it came in to the inbox, each step is marked as it is done, and it is closed once every step is.
 * Each of those is an act, asking why. The delete itself stays the script (REQUEST_WORDS.scriptNote); this keeps the
 * promise's thirty days, open ones first, the nearest due first.
 */
import { useState } from "react";
import {
  REQUEST_KINDS,
  REQUEST_KIND_WORDS,
  REQUEST_WORDS,
  consolePathOf,
  requestDayWords,
  requestsInOrder,
  staffMay,
  type ConsoleWhy,
  type PrivacyRequestVM,
  type RequestKind,
  type RequestStep,
  zoneDayKey,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Field, fieldProblem } from "../kit/field/field";
import { PageHead } from "../kit/head/page-head";
import { Icon } from "../kit/icon/icon";
import { LinkButton } from "../kit/link-button/link-button";
import { Segmented } from "../kit/segmented/segmented";
import { Sheet } from "../kit/sheet/sheet";
import {
  NoneRow,
  ScreenFailed,
  ScreenReading,
  ScreenSection,
  useConsoleRead,
  viewerZone,
  type Flash,
  type Go,
} from "./parts";
import { consoleVerbs, type ConsoleMe } from "./verbs";
import { WhyAsk } from "./why";

/** A step armed: which, and whether it is being marked done or undone; or the request's close. */
type Armed = { step: RequestStep | "close"; done: boolean };

function RequestCard({
  q,
  may,
  go,
  flash,
  onChanged,
}: {
  q: PrivacyRequestVM;
  may: boolean;
  go: Go;
  flash: Flash;
  onChanged: () => void;
}) {
  const [arm, setArm] = useState<Armed | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (a: Armed, why: ConsoleWhy) => {
    setBusy(true);
    const r = await consoleVerbs.step({ id: q.id, step: a.step, done: a.done, why });
    setBusy(false);
    setArm(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.ok ? "Written down." : r.message}</> });
    if (r.ok) onChanged();
  };
  const allDone = q.steps.every((s) => s.doneAt);
  return (
    <ScreenSection
      title={`${q.title} · ${q.workspace}`}
      sub={`${q.code} · ${q.clock.words}`}
      aside={
        q.slug ? (
          <LinkButton
            onClick={() => go(consolePathOf("workspaces", q.slug))}
            data-testid={`console-request-open-${q.code}`}
          >
            {q.workspace}
          </LinkButton>
        ) : null
      }
      testid={`console-request-${q.code}`}
    >
      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-hint">
            {q.asked}
            {q.ticket ? ` · ${q.ticket}` : ""}
            {q.note ? ` · ${q.note}` : ""}
          </span>
        </div>
      </div>
      {q.steps.map((s) => (
        <div className="set-row" key={s.step} data-testid={`console-request-${q.code}-${s.step}`}>
          <div className="set-row-info">
            <span className="set-row-label">
              <Icon name={s.doneAt ? "check" : "dot"} size={12} /> {s.title}
            </span>
            <span className="set-row-hint">{s.says}</span>
            {arm && arm.step === s.step && (
              <WhyAsk
                question={arm.done ? `Mark “${s.title}” done?` : `Mark “${s.title}” not done?`}
                yes={arm.done ? REQUEST_WORDS.markDone : REQUEST_WORDS.undo}
                busy={busy}
                onYes={(why) => void run(arm, why)}
                onNo={() => setArm(null)}
                testid={`console-request-${q.code}-${s.step}`}
              />
            )}
          </div>
          {q.open && may && !arm && (
            <Button
              size="sm"
              variant={s.doneAt ? "quiet" : undefined}
              onClick={() => setArm({ step: s.step, done: !s.doneAt })}
              data-testid={`console-request-${q.code}-${s.step}-arm`}
            >
              {s.doneAt ? REQUEST_WORDS.undo : REQUEST_WORDS.markDone}
            </Button>
          )}
        </div>
      ))}
      {q.open && may && allDone && (
        <div className="set-row">
          <div className="set-row-info">
            {arm?.step === "close" ? (
              <WhyAsk
                question={`Close ${q.code}?`}
                detail="Every step is done. A closed request changes no more."
                yes={REQUEST_WORDS.close}
                busy={busy}
                onYes={(why) => void run({ step: "close", done: true }, why)}
                onNo={() => setArm(null)}
                testid={`console-request-${q.code}-close`}
              />
            ) : (
              <span className="set-row-hint">Every step is done.</span>
            )}
          </div>
          {arm?.step !== "close" && (
            <Button
              size="sm"
              onClick={() => setArm({ step: "close", done: true })}
              data-testid={`console-request-${q.code}-close-arm`}
            >
              {REQUEST_WORDS.close}
            </Button>
          )}
        </div>
      )}
    </ScreenSection>
  );
}

/** Filing a request as it came in: what they asked, which workspace, who and when, and why it is filed. */
function FileSheet({
  open,
  onClose,
  onFiled,
  flash,
}: {
  open: boolean;
  onClose: () => void;
  onFiled: () => void;
  flash: Flash;
}) {
  const [kind, setKind] = useState<RequestKind>("delete_workspace");
  const [workspace, setWorkspace] = useState("");
  const [askedBy, setAskedBy] = useState("");
  const [askedOn, setAskedOn] = useState(() => zoneDayKey(Date.now(), viewerZone()));
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const whole = !!workspace.trim() && askedBy.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(askedOn);
  const file = async (why: ConsoleWhy) => {
    setBusy(true);
    const r = await consoleVerbs.fileRequest({
      kind,
      workspace: workspace.trim().toLowerCase(),
      asked_by: askedBy.trim(),
      asked_at: new Date(`${askedOn}T12:00:00Z`).toISOString(),
      why,
    });
    setBusy(false);
    if (!r.ok) {
      setFields(r.fields);
      return flash({ tone: "danger", msg: <>{r.message}</> });
    }
    flash({
      tone: "ok",
      msg: <>{`Filed. Its thirty days end ${requestDayWords(r.data.request.due_at, viewerZone())}.`}</>,
    });
    setWorkspace("");
    setAskedBy("");
    setFields({});
    onFiled();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={REQUEST_WORDS.file}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      testid="console-request-file"
    >
      <div className="cs-filing">
        <Segmented
          label={REQUEST_WORDS.kind}
          value={kind}
          onValueChange={setKind}
          options={REQUEST_KINDS.map((k) => ({
            value: k,
            label: REQUEST_KIND_WORDS[k],
            testid: `console-request-kind-${k}`,
          }))}
        />
        <Field
          label={REQUEST_WORDS.workspace}
          hint={REQUEST_WORDS.workspaceHint}
          value={workspace}
          onValueChange={setWorkspace}
          spellCheck={false}
          data-testid="console-request-workspace"
          {...fieldProblem(fields.workspace)}
        />
        <Field
          label={REQUEST_WORDS.askedBy}
          hint={REQUEST_WORDS.askedByHint}
          value={askedBy}
          onValueChange={setAskedBy}
          inputMode="email"
          spellCheck={false}
          data-testid="console-request-asked-by"
        />
        <Field
          label={REQUEST_WORDS.askedAt}
          type="date"
          value={askedOn}
          onValueChange={setAskedOn}
          data-testid="console-request-asked-at"
        />
        <WhyAsk
          question={REQUEST_WORDS.file}
          detail="Its thirty days are counted from when they asked."
          yes="File it"
          whole={whole}
          busy={busy}
          onYes={(why) => void file(why)}
          onNo={onClose}
          testid="console-request-file"
        />
      </div>
    </Sheet>
  );
}

export function RequestsScreen({ me, go, flash }: { me: ConsoleMe; go: Go; flash: Flash }) {
  const read = useConsoleRead(consoleVerbs.requests, "requests");
  const [filing, setFiling] = useState(false);
  const may = staffMay(me.role, "request_step");
  const all = requestsInOrder(read.data?.requests ?? [], Date.now(), viewerZone());
  const open = all.filter((q) => q.open);
  const closed = all.filter((q) => !q.open);
  return (
    <div className="cs-screen" data-testid="console-requests">
      <PageHead title={REQUEST_WORDS.title} sentence={REQUEST_WORDS.sub} />
      <div className="cs-tools">
        <span className="set-row-hint">{REQUEST_WORDS.scriptNote}</span>
        {staffMay(me.role, "request_file") && (
          <Button size="sm" onClick={() => setFiling(true)} data-testid="console-request-file-open">
            {REQUEST_WORDS.file}
          </Button>
        )}
      </div>
      {!read.data &&
        (read.problem ? (
          <ScreenFailed
            what="the requests"
            why={read.problem}
            busy={read.busy}
            again={read.again}
            testid="console-requests-failed"
          />
        ) : (
          <ScreenReading />
        ))}
      {read.data && open.length === 0 && (
        <ScreenSection title={REQUEST_WORDS.open} testid="console-requests-none">
          <NoneRow words={REQUEST_WORDS.none} />
        </ScreenSection>
      )}
      {open.map((q) => (
        <RequestCard key={q.id} q={q} may={may} go={go} flash={flash} onChanged={read.again} />
      ))}
      {closed.length > 0 && (
        <ScreenSection title={REQUEST_WORDS.done} sub="Closed in the last thirty days" testid="console-requests-closed">
          {closed.map((q) => (
            <NoneRow key={q.id} words={`${q.code} · ${q.title} · ${q.workspace} · ${q.clock.words}`} />
          ))}
        </ScreenSection>
      )}
      <FileSheet
        open={filing}
        onClose={() => setFiling(false)}
        onFiled={() => {
          setFiling(false);
          read.again();
        }}
        flash={flash}
      />
    </div>
  );
}
