/**
 * Chanlytics — the business on record, as one form (moved from legacy/pages/business-record.jsx, decision 0015 step 11).
 *
 * Lives beside Settings › Integrations rather than inside it: this is the
 * only place a workspace states its legal identity, and every carrier
 * registration reads it. The fields, their words and their closed lists
 * come from contracts (business-record.ts) through `businessRecord` (record.ts),
 * so the form offers exactly what the carriers accept and nothing else.
 *
 * ONE QUESTION FIRST. There are two registrations, they ask different things,
 * and the narrow one cannot be withdrawn — so nothing is rendered until it is
 * known which one this is. That is three states, not two: a path, or the
 * question, or "still reading". A form that guessed from an empty tax-id box
 * would either demand an EIN of a business that has none, or quietly file the
 * permanent one-message-a-second registration for a business that does not
 * need it.
 *
 * Nothing here decides anything: which fields, what counts as complete, and
 * what the narrow path costs all come from the contract, so this page and the
 * route and the filing cannot disagree. Filing is its own button, because it
 * is the only thing in this product that costs money the moment it is pressed.
 *
 * The component keeps the state and the early returns; the fork, the form, a group, a field and the acts are plain
 * functions that return the JSX, called and not drawn, so the tree is the one the JSX drew.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { BusinessFieldVM, BusinessRecordDto, LineDto, RegistrationPath } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { FieldError } from "../../kit/field-error/field-error";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordField } from "../../kit/record/field";
import { canDo, gate, gateTitle, holdStill, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { businessRecord } from "./record";

const RECORD = businessRecord;

type Flash = (f: LegacyFlash) => void;
type Line = LineDto | null | undefined;
/** What is still wrong, by field, in the owner's words. */
type Problems = Partial<Record<string, string>>;
type SetField = (name: keyof BusinessRecordDto, value: string) => void;

const GROUPS: readonly BusinessFieldVM["group"][] = ["business", "address", "contact"];

interface ForkOptions {
  head: ReactNode;
  path: RegistrationPath | null;
  asking: boolean;
  owner: boolean;
  busy: boolean;
  filedPath: RegistrationPath | null;
  onChoose: (p: RegistrationPath) => void;
  onBack: () => void;
}

/** The fork. Shown until it is answered, and again when an owner reopens it. */
function forkView(opts: ForkOptions) {
  const { head, path, asking, owner, busy, filedPath, onChoose, onBack } = opts;
  return (
    <div className="set-row set-row-stack biz" data-testid="business-record">
      {head}
      <div className="biz-group" data-testid="biz-fork">
        <div className="biz-group-head">
          <span className="biz-group-title">{RECORD.question.title}</span>
          <span className="biz-group-sub">{RECORD.question.sub}</span>
        </div>
        {owner ? (
          <div className="biz-choices">
            {RECORD.paths.map((p) => (
              <Button
                key={p}
                className={`biz-choice${p === path ? " biz-choice-on" : ""}`}
                onClick={() => onChoose(p)}
                disabled={busy}
                aria-pressed={p === path}
                data-testid={`biz-path-${p}`}
              >
                <span className="biz-choice-label">{RECORD.pathWords[p].choice}</span>
                <span className="biz-hint">{RECORD.pathWords[p].sub}</span>
              </Button>
            ))}
          </div>
        ) : (
          <span className="set-row-hint">An owner answers this.</span>
        )}
        <span className="biz-hint">{RECORD.question.nudge}</span>
        <ul className="biz-limits" data-testid="biz-limits">
          {RECORD.limits().map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {filedPath && (
          <span className="set-row-hint">
            A registration is already filed as {RECORD.pathWords[filedPath].filed.toLowerCase()}. It cannot be withdrawn
            — changing this answer means a second filing, and a second fee.
          </span>
        )}
        {asking && (
          <div className="set-acts">
            <LinkButton onClick={(e) => holdStill(e && e.currentTarget, onBack)} data-testid="biz-fork-back">
              Back to the form
            </LinkButton>
          </div>
        )}
      </div>
    </div>
  );
}

interface FieldOptions {
  f: BusinessFieldVM;
  record: BusinessRecordDto;
  problem: string | null;
  disabled: boolean;
  onSet: SetField;
}

/** One field of the form: its label, the box its kind draws, and what is wrong with it or why it is asked. */
function fieldBox(opts: FieldOptions) {
  const { f, record, problem, disabled, onSet } = opts;
  const testid = `biz-${f.name}`;
  const label = (
    <>
      {f.label}
      {f.required ? "" : <span className="dim"> · optional</span>}
      {f.published ? <span className="dim"> · {RECORD.publicMark}</span> : ""}
    </>
  );
  const cell = `biz-cell${f.multiline ? " biz-cell-wide" : ""}`;
  if (!f.multiline && f.options) {
    // A native list, as it was: the kit's Select is Base UI's, and a list asked once at setup is not worth its weight on
    // the settings page (CI measured +48 KB gzipped for it).
    const problemId = `rec-${testid}-problem`;
    return (
      <div className={cell} key={f.name} data-testid={testid}>
        <div className="rec-field">
          <label>
            <span className="rec-field-label">{label}</span>
            <select
              className="rec-input"
              value={record[f.name] ?? ""}
              disabled={disabled}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? problemId : undefined}
              onChange={(e) => onSet(f.name, e.target.value)}
            >
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {RECORD.optionWords(o)}
                </option>
              ))}
            </select>
          </label>
          {problem ? (
            <FieldError id={problemId} message={problem} />
          ) : f.hint ? (
            <span className="rec-hint">{f.hint}</span>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className={cell} key={f.name}>
      <RecordField
        id={testid}
        testid={testid}
        label={label}
        value={record[f.name] ?? ""}
        onChange={(words) => onSet(f.name, words)}
        hint={f.hint}
        problem={problem ? <span data-testid={`${testid}-problem`}>{problem}</span> : undefined}
        rows={f.multiline ? 3 : null}
        placeholder={f.placeholder || ""}
        readOnly={disabled}
      />
    </div>
  );
}

interface GroupOptions {
  g: BusinessFieldVM["group"];
  fields: readonly BusinessFieldVM[];
  words: ReturnType<typeof RECORD.groupsFor>;
  record: BusinessRecordDto;
  problems: Problems;
  disabled: boolean;
  onSet: SetField;
}

/** One part of the form (the business, where it is, who signs), or nothing when this path asks none of it. */
function groupBlock(opts: GroupOptions) {
  const { g, fields, words, record, problems, disabled, onSet } = opts;
  const mine = fields.filter((f) => f.group === g);
  if (!mine.length) return null;
  return (
    <div className="biz-group" key={g}>
      <div className="biz-group-head">
        <span className="biz-group-title">{words[g].title}</span>
        <span className="biz-group-sub">{words[g].sub}</span>
      </div>
      <div className="biz-fields">
        {mine.map((f) => fieldBox({ f, record, problem: problems[f.name] || null, disabled, onSet }))}
      </div>
    </div>
  );
}

interface RecordActs {
  /** `reviewed`: the owner has answered the question asked before a change the carriers are reviewing. */
  save: (reviewed?: boolean) => Promise<void>;
  file: () => Promise<void>;
}

interface ActsOptions {
  record: BusinessRecordDto;
  /** The record as last read or saved: what a save is compared with. */
  saved: BusinessRecordDto | null;
  path: RegistrationPath;
  line: Line;
  owner: boolean;
  flash: Flash;
  setProblems: (found: Problems) => void;
  setBusy: (busy: boolean) => void;
  setArm: (arm: boolean) => void;
  setReview: (review: boolean) => void;
  setSaved: (record: BusinessRecordDto) => void;
}

/**
 * Whether a save asks first: while the carriers are reviewing the filing, a change to what the public page shows (they
 * check the registration against it, and a campaign waiting on them is filed from the record as it then stands). A change
 * to a box the page does not show (the mobile, the tax id) is asked nothing (the wiring's second audit, X4-3).
 */
function asksBeforeSaving(line: Line, saved: BusinessRecordDto | null, record: BusinessRecordDto): boolean {
  return (
    !!saved &&
    RECORD.filingOf(line ? [line] : []) === "in_review" &&
    RECORD.changed(saved, record).some(RECORD.isPublished)
  );
}

/** The form's two acts: keep the record (Save), and file the line with the carriers (File). */
function recordActs(opts: ActsOptions): RecordActs {
  const { record, saved, path, line, owner, flash, setProblems, setBusy, setArm, setReview, setSaved } = opts;
  const save = async (reviewed = false) => {
    if (!owner) return;
    const found = RECORD.problems(record, path);
    setProblems(found);
    // Each box says what it needs; the toast only counts them.
    const count = Object.keys(found).length;
    if (count) {
      flash({ tone: "warn", msg: <>Not saved — {count === 1 ? "1 field needs" : `${count} fields need`} a look.</> });
      return;
    }
    if (!reviewed && asksBeforeSaving(line, saved, record)) {
      setArm(false);
      setReview(true);
      return;
    }
    setReview(false);
    setBusy(true);
    const r = await RECORD.save(record, path);
    setBusy(false);
    // A saved record is good news, in the ok tone: it used to arrive as a red
    // toast. A refusal marks every field the route named, under its box.
    if (!r.ok) {
      setProblems(r.problems || {});
      flash(refusalToast(r, "Not saved"));
      return;
    }
    setSaved(record);
    flash({ msg: <>{r.message}</> });
  };
  const file = async () => {
    if (!owner || !line) return;
    setBusy(true);
    const r = await RECORD.register(line.id);
    setBusy(false);
    setArm(false);
    flash(r.ok ? { msg: <>{r.message}</> } : refusalToast(r, "Not filed"));
  };
  return { save, file };
}

interface ActsRowOptions {
  line: Line;
  path: RegistrationPath;
  ready: boolean;
  arm: boolean;
  review: boolean;
  busy: boolean;
  acts: RecordActs;
  onArm: (arm: boolean) => void;
  onReview: (review: boolean) => void;
}

/** Save, File, and the questions asked before a save the carriers are reviewing and before a filing. */
function actsRow(opts: ActsRowOptions) {
  const { line, path, ready, arm, review, busy, acts, onArm, onReview } = opts;
  return (
    <div className="set-acts">
      {review ? (
        <Confirm
          question={RECORD.review.question}
          detail={RECORD.review.detail}
          yes={RECORD.review.yes}
          no={RECORD.review.no}
          busy={busy}
          onYes={() => void acts.save(true)}
          onNo={() => onReview(false)}
          testid="biz-save-review"
        />
      ) : (
        <Button
          size="sm"
          variant="primary"
          onClick={() => void acts.save()}
          disabled={busy}
          data-testid="biz-save"
          {...gate("team", "fill in the business record")}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      )}
      {/*
            Not on a line the carriers SENT BACK. Resubmitting one is support's action
            (gate 6), so this button could only be refused there -- a dead button on the
            row a person opens straight after being told their filing was rejected.
            Saving their corrections is still theirs, and is what unblocks it.
          */}
      {ready && line && !arm && line.sms_state !== "rejected" && (
        <Button
          size="sm"
          onClick={() => onArm(true)}
          disabled={busy}
          data-testid="biz-file"
          {...gate("team", "file with the carriers")}
        >
          File with the carriers
        </Button>
      )}
      {line && line.sms_state === "rejected" && (
        <span className="set-row-hint" data-testid="biz-rejected">
          Save your corrections here — Chanlytics sends the registration back to the carriers for you, at no cost.
        </span>
      )}
      {arm && (
        <Confirm
          question="File with the carriers?"
          detail={RECORD.costWords[path]}
          yes="Yes, file it"
          no="Not yet"
          busy={busy}
          onYes={() => void acts.file()}
          onNo={() => onArm(false)}
          testid="biz-file"
        />
      )}
    </div>
  );
}

interface FormOptions {
  head: ReactNode;
  record: BusinessRecordDto;
  path: RegistrationPath;
  line: Line;
  /** The business's own page, once the saved record publishes it; null before. */
  page: string | null;
  owner: boolean;
  busy: boolean;
  arm: boolean;
  review: boolean;
  problems: Problems;
  acts: RecordActs;
  onSet: SetField;
  onAsk: () => void;
  onArm: (arm: boolean) => void;
  onReview: (review: boolean) => void;
}

/** What goes on the business's own page, before it publishes and once it does, with the link to it (the wiring's second audit, X4-4). */
function publicNote(page: string | null) {
  return (
    <span className="set-row-hint" data-testid="biz-public-note">
      {page ? RECORD.pageNote.live : RECORD.pageNote.before}
      {page ? (
        <>
          {" "}
          <LinkButton href={page} target="_blank" rel="noopener" data-testid="biz-public-link">
            {RECORD.pageNote.open}
          </LinkButton>
        </>
      ) : null}
    </span>
  );
}

/** The form itself, once the registration is known: the answer, what goes on the public page, each part of the form, the acts. */
function formView(opts: FormOptions) {
  const { head, record, path, line, page, owner, busy, arm, review, problems, acts, onSet, onAsk, onArm, onReview } =
    opts;
  const words = RECORD.groupsFor(path);
  const fields = RECORD.fieldsFor(path);
  const ready = Object.keys(RECORD.problems(record, path)).length === 0;
  return (
    <div className="set-row set-row-stack biz" data-testid="business-record">
      {head}
      {publicNote(page)}

      <div className="biz-answer" data-testid="biz-answer">
        <span className="biz-hint">
          {RECORD.pathWords[path].filed}. {RECORD.pathWords[path].sub}
        </span>
        {/* The short question takes the long form's place: the page holds still under the press (data-bits holdStill). */}
        {owner && (
          <LinkButton
            onClick={(e) => holdStill(e && e.currentTarget, onAsk)}
            disabled={busy}
            data-testid="biz-path-change"
          >
            Not right?
          </LinkButton>
        )}
      </div>

      {GROUPS.map((g) => groupBlock({ g, fields, words, record, problems, disabled: !owner || busy, onSet }))}

      {/* Save and File are the form's acts: a role that may not press them sees them gated, saying why, and the form
          says why once below. They were hidden under a sentence of the form's own (the one gate). */}
      {actsRow({ line, path, ready, arm, review, busy, acts, onArm, onReview })}
      {!owner && <span className="set-row-hint">{gateTitle("team", "fill in the business record")}</span>}
    </div>
  );
}

/**
 * A registration already with the carriers. It cannot be withdrawn, so the
 * answer stops being a choice and becomes a fact — one that can still be
 * changed, at the price of a second filing. Whether there is a filing is
 * contracts' one rule (recordFilingOf): a rehearsal against the free test
 * registry is none, so it never warns of a fee.
 */
function filedPathOf(line: Line): RegistrationPath | null {
  if (!line || RECORD.filingOf([line]) === "none") return null;
  return line.reg_sole_prop ? "sole_proprietor" : "standard";
}

export function BusinessRecordForm({ line, flash }: { line?: LineDto | null; flash: Flash }) {
  const [record, setRecord] = useState<BusinessRecordDto | null>(null);
  // null = nobody has answered. Seeded by the server for a record on file.
  const [path, setPath] = useState<RegistrationPath | null>(null);
  const [asking, setAsking] = useState(false);
  const [problems, setProblems] = useState<Problems>({});
  const [busy, setBusy] = useState(false);
  const [arm, setArm] = useState(false);
  // The record as last read or saved, which a save is compared with; the question asked before a change the carriers
  // are reviewing; and where the business's own page is (null while the workspace has none).
  const [saved, setSaved] = useState<BusinessRecordDto | null>(null);
  const [review, setReview] = useState(false);
  const [pageAt, setPageAt] = useState<string | null>(null);
  // A read that failed is its own state -- never an empty record, and never the
  // one-time question asked over a record that may well be on file.
  const [readFailed, setReadFailed] = useState<string | null>(null);
  const owner = canDo("team");

  const load = (isOn: () => boolean = () => true) =>
    RECORD.read().then((r) => {
      if (!isOn()) return;
      if (!r.ok) {
        setReadFailed(r.message || "The record could not be read.");
        return;
      }
      setReadFailed(null);
      // No website is guessed. Left empty, the filing names the page this
      // product publishes for the workspace (/b/<slug>), as the field's hint
      // says. The guess this replaced was saved as the website and filed with
      // the carriers: the opt-in page, of whichever workspace sorted first.
      // Nor the email: the box is on the public page, so it is an address the
      // owner chose to publish, never their sign-in filled in for them.
      setRecord(r.record ?? RECORD.empty());
      setSaved(r.record);
      setPageAt(r.page);
      setPath(r.path ?? null);
      setProblems(r.problems || {});
    });

  useEffect(() => {
    let on = true;
    void load(() => on);
    return () => {
      on = false;
    };
  }, []);

  if (!record && readFailed) {
    return (
      <FailedRead
        kind="line"
        what="the business on record"
        why={readFailed}
        body="Nothing was changed. Retry reads it again."
        onRetry={() => {
          setReadFailed(null);
          void load();
        }}
        testid="business-record-failed"
      />
    );
  }
  if (!record)
    return (
      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-hint">Reading what is on record…</span>
        </div>
      </div>
    );

  const set: SetField = (name, value) => setRecord((r) => (r ? { ...r, [name]: value } : r));
  // Picking the narrow path drops the tax id from the form, the same way the
  // save drops it from the row: a leftover value would keep failing a format
  // check on a box this path does not render.
  const choose = (p: RegistrationPath) => {
    setRecord((r) => (r ? RECORD.forPath(r, p) : r));
    setProblems({});
    setPath(p);
    setAsking(false);
  };

  const head = (
    <div className="set-row-info">
      <span className="set-row-label">Your business, as the carriers need it</span>
      <span className="set-row-hint">
        {RECORD.line(record.legal_name ? record : null)} The phone carriers ask this of every business before they let a
        number send texts. It is asked once and reused.
      </span>
    </div>
  );

  if (path === null || asking) {
    return forkView({
      head,
      path,
      asking,
      owner,
      busy,
      filedPath: filedPathOf(line),
      onChoose: choose,
      onBack: () => setAsking(false),
    });
  }

  const acts = recordActs({
    record,
    saved,
    path,
    line,
    owner,
    flash,
    setProblems,
    setBusy,
    setArm,
    setReview,
    setSaved,
  });
  return formView({
    head,
    record,
    path,
    line,
    page: pageAt && RECORD.publishes(saved) ? pageAt : null,
    owner,
    busy,
    arm,
    review,
    problems,
    acts,
    onSet: set,
    onAsk: () => setAsking(true),
    // Arming File puts the save's question away: one question at a time.
    onArm: (on) => {
      setArm(on);
      if (on) setReview(false);
    },
    onReview: setReview,
  });
}
