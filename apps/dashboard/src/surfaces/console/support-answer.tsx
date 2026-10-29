/**
 * The one opened in Support (decision 0067): everything a person needs to answer it, top to bottom in the order they
 * use it. What it is (its kind, topic and state, their words, its code and when it came); where it stands (its promise,
 * what finishes it, whether the inbox has it); who sent it; their workspace as Home judges it, with its four facts, its
 * Setup's progress, who has it and its two doors; how to help (what to check first, the steps); and the reply with
 * their name in. The acts stand apart at the foot, the one coral act first: Answer in the inbox.
 *
 * Every word is contracts'. The workspace's Setup is the Console's own read by id (GET platform/tenants/:id, which its
 * Setup and lines tab reads too), read as a row is opened.
 */
import type { ReactNode } from "react";
import {
  SUPPORT_WORDS,
  consolePathOf,
  inboxSearchUrl,
  playbookOf,
  staffMay,
  staffName,
  supportWorkspaceOf,
  verdictPill,
  type PlaybookFill,
  type SupportRowVM,
} from "@chanlytics/contracts";
import { backOffice } from "@/legacy-bridge/platform";
import { Button } from "../kit/button/button";
import { CopyButton } from "../kit/copy-button/copy-button";
import { Face } from "../kit/face/face";
import { Icon } from "../kit/icon/icon";
import { LinkButton } from "../kit/link-button/link-button";
import { Meter } from "../kit/meter/meter";
import { Panel } from "../kit/panel/panel";
import { StatePill } from "../kit/pill/state-pill";
import { useConsoleRead, type Go } from "./parts";
import { consoleVerbs, type ConsoleMe, type ConsoleSupport } from "./verbs";

/** What the one opened can do, as the page wires it. */
export interface Acts {
  take: (r: SupportRowVM, take: boolean) => void;
  mark: (r: SupportRowVM, mark: "answered" | "done" | "reopened") => void;
  resend: (r: SupportRowVM) => void;
  move: (r: SupportRowVM) => void;
  busy: boolean;
}

const upperFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** One section of the one opened: its title, what stands beside it, and what it holds. */
function Section({
  title,
  aside = null,
  children,
  testid,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  testid: string;
}) {
  return (
    <section className="cs-a-section" data-testid={testid}>
      <div className="cs-a-section-head">
        <h3 className="cs-a-section-title">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A line of where it stands: its glyph and its words, in the tone that says how urgent. */
function StatusLine({ glyph, tone = null, children }: { glyph: string; tone?: string | null; children: ReactNode }) {
  return (
    <div className="cs-a-status-line" data-tone={tone ?? undefined}>
      <Icon name={glyph} size={13} />
      <span>{children}</span>
    </div>
  );
}

/** What it is: its kind, topic and state; their words; its code, copied as one press, and when it came. */
function Top({ r, inSheet }: { r: SupportRowVM; inSheet: boolean }) {
  return (
    <header className="cs-a-top">
      <div className="cs-a-labels">
        <StatePill kind="tone" value="plain" label={r.kindWords} />
        {r.topicWords !== r.kindWords && <StatePill kind="tone" value="plain" label={r.topicWords} />}
        <span className="cs-a-labels-end">
          <StatePill kind="tone" value={r.stateTone ?? "plain"} label={r.stateWords} />
        </span>
      </div>
      <h2 className="cs-a-title">{r.quoted ? `“${r.title}”` : r.title}</h2>
      <div className="cs-a-meta">
        {!inSheet && <span className="cs-a-code">{r.code}</span>}
        <CopyButton
          text={r.code}
          label={inSheet ? `${SUPPORT_WORDS.copy} ${r.code}` : SUPPORT_WORDS.copy}
          said={SUPPORT_WORDS.copied}
          testid="console-support-copy-code"
        />
        <span className="cs-a-meta-words">{r.sent}</span>
      </div>
    </header>
  );
}

/** Where it stands: the promise, what finishes an ask and whether it has, who answered, the inbox, the page. */
function Status({ r }: { r: SupportRowVM }) {
  return (
    <Panel variant="inset" size="sm" className="cs-a-status" data-testid="console-support-status">
      <StatusLine glyph="clock" tone={r.wait.tone}>
        {upperFirst(r.wait.words)}
      </StatusLine>
      {r.doneWhen && (
        <StatusLine glyph={r.doneNow ? "check" : "circle"} tone={r.doneNow ? "ok" : null}>
          {r.doneNow ? r.doneWhen : `${r.doneWhen} · ${SUPPORT_WORDS.notYet}`}
        </StatusLine>
      )}
      {r.answered && (
        <StatusLine glyph="check" tone="ok">
          {r.answered}
        </StatusLine>
      )}
      {r.unmailed && (
        <StatusLine glyph="alert" tone="warn">
          {r.unmailed}
        </StatusLine>
      )}
      {r.page && <StatusLine glyph="note">{SUPPORT_WORDS.sentFrom(r.page)}</StatusLine>}
      {r.error && <StatusLine glyph="alert">{`${SUPPORT_WORDS.alsoSent}: ${r.error}`}</StatusLine>}
    </Panel>
  );
}

/** Who sent it: their face, their name (or address), their role and since when, and their address to copy. */
function From({ r }: { r: SupportRowVM }) {
  const shown = r.name ?? r.email ?? "Someone signed out";
  const detail = [r.role, r.since].filter(Boolean).join(" · ");
  return (
    <Section title={SUPPORT_WORDS.from} testid="console-support-from">
      <div className="cs-a-person">
        <Face person={{ name: shown }} size="lg" />
        <div className="cs-a-person-words">
          <span className="cs-a-strong">{shown}</span>
          {r.name && r.email && <span className="cs-a-dim">{r.email}</span>}
          {detail && <span className="cs-a-dim">{detail}</span>}
        </div>
        {r.email && <CopyButton text={r.email} label={SUPPORT_WORDS.copyAddress} testid="console-support-copy-email" />}
      </div>
    </Section>
  );
}

/** Their Setup, read as the row opens: how far along, the next step, as their own Setup says it. */
function SetupProgress({ tenantId }: { tenantId: string }) {
  const read = useConsoleRead(() => consoleVerbs.tenant(tenantId), `support-setup/${tenantId}`);
  if (!read.data) return read.problem ? <span className="cs-a-dim">{SUPPORT_WORDS.setupFailed}</span> : null;
  const vm = backOffice.verbs.steps({ ...read.data.setup, tz: read.data.tenant.timezone, later: [], rests: {} });
  const next = vm.rows.find((s) => s.state !== "ready");
  const words = SUPPORT_WORDS.setupDone(vm.done, vm.total);
  return (
    <div className="cs-a-setup" data-testid="console-support-setup">
      <div className="cs-a-setup-head">
        <span className="cs-a-strong-sm">{words}</span>
        <span className="cs-a-dim">{next ? SUPPORT_WORDS.setupNext(next.title) : SUPPORT_WORDS.setupAll}</span>
      </div>
      <Meter
        size="sm"
        parts={[
          { share: vm.total ? vm.done / vm.total : 0, tone: "ok" },
          { share: vm.total ? 1 - vm.done / vm.total : 1, tone: "rest" },
        ]}
        aria-label={words}
      />
    </div>
  );
}

/** Their workspace as Home judges it: its verdict and line, four facts, its Setup, who has it, and its two doors. */
function Workspace({
  r,
  data,
  me,
  go,
  acts,
}: {
  r: SupportRowVM;
  data: ConsoleSupport;
  me: ConsoleMe;
  go: Go;
  acts: Acts;
}) {
  const ws = supportWorkspaceOf(data.book.tenants, r.tenantId, Date.now());
  const mine = r.claim === "You have it";
  const pill = ws ? verdictPill(ws.verdict) : null;
  const facts = ws
    ? ([
        [SUPPORT_WORDS.facts.plan, ws.facts.paying],
        [SUPPORT_WORDS.facts.answering, ws.facts.answering],
        [SUPPORT_WORDS.facts.texting, ws.facts.texting],
        [SUPPORT_WORDS.facts.heard, ws.facts.heard],
      ] as const)
    : [];
  return (
    <Section
      title={SUPPORT_WORDS.workspaceCard}
      aside={pill ? <StatePill kind="tone" value={pill.tone} label={pill.label} /> : null}
      testid="console-support-workspace"
    >
      <div className="cs-a-ws">
        <span className="cs-a-strong">{r.workspace}</span>
        {ws && <span className="cs-a-dim">{ws.sentence}</span>}
      </div>
      {facts.length > 0 && (
        <Panel as="section" variant="inset" size="sm" className="cs-a-facts">
          <dl className="cs-a-facts-grid">
            {facts.map(([label, value]) => (
              <div key={label} className="cs-a-fact">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}
      {r.tenantId && <SetupProgress tenantId={r.tenantId} />}
      {r.tenantId && (
        <div className="cs-a-claim">
          <span className="cs-a-dim">{r.claim ?? SUPPORT_WORDS.nobodyHasIt}</span>
          {(!r.claim || mine) && staffMay(me.role, "report_answered") && (
            <Button
              size="sm"
              variant={mine ? "quiet" : undefined}
              onClick={() => acts.take(r, !mine)}
              disabled={acts.busy}
              data-testid="console-support-take"
            >
              {mine ? "Let go" : "Take it"}
            </Button>
          )}
        </div>
      )}
      {r.slug && (
        <div className="cs-a-doors">
          <LinkButton
            onClick={() => go(consolePathOf("workspaces", r.slug))}
            data-testid="console-support-workspace-open"
          >
            {SUPPORT_WORDS.openWorkspace}
            <Icon name="arrow-right" size={12} />
          </LinkButton>
          <LinkButton
            onClick={() => go(consolePathOf("workspaces", r.slug, "lines"))}
            data-testid="console-support-setup-open"
          >
            {SUPPORT_WORDS.openSetup}
            <Icon name="arrow-right" size={12} />
          </LinkButton>
        </div>
      )}
    </Section>
  );
}

/** A playbook's steps, a command kept with the step that names it: an indented step is one to run as it is. */
function playbookStepsOf(steps: readonly string[]): { words: string; commands: string[] }[] {
  const out: { words: string; commands: string[] }[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (s.startsWith("  ") && last) last.commands.push(s.trim());
    else out.push({ words: s, commands: [] });
  }
  return out;
}

/** How to help: what to check first, then the steps, each command with its own copy. */
function HowToHelp({ r, fill }: { r: SupportRowVM; fill: PlaybookFill }) {
  const book = playbookOf(r);
  return (
    <Section
      title={SUPPORT_WORDS.howToHelp}
      aside={<span className="cs-a-dim">{book.title}</span>}
      testid="console-support-help"
    >
      <Panel variant="inset" size="sm" className="cs-a-check">
        <span className="cs-a-check-head">{SUPPORT_WORDS.checkFirst}</span>
        <span>{book.check}</span>
      </Panel>
      <ol className="cs-a-steps">
        {playbookStepsOf(book.steps(fill)).map((step) => (
          <li key={step.words}>
            <span>{step.words}</span>
            {step.commands.map((c) => (
              <div className="cs-a-cmd" key={c}>
                <code>{c}</code>
                <CopyButton text={c} label={SUPPORT_WORDS.copy} />
              </div>
            ))}
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** The reply, their name in, with its copy beside the title: copied into the inbox, never sent from here. */
function Reply({ r, fill }: { r: SupportRowVM; fill: PlaybookFill }) {
  const reply = playbookOf(r).reply(fill);
  return (
    <Section
      title={SUPPORT_WORDS.reply}
      aside={
        <CopyButton
          text={reply}
          label={SUPPORT_WORDS.copyReply}
          said={SUPPORT_WORDS.replyCopied}
          testid="console-support-copy-reply"
        />
      }
      testid="console-support-reply-section"
    >
      <Panel variant="inset" className="cs-a-reply" data-testid="console-support-reply">
        {reply}
      </Panel>
      <span className="cs-a-note">{SUPPORT_WORDS.replyNote}</span>
    </Section>
  );
}

/** The one opened: what it is, where it stands, who sent it, their workspace, how to help, and the reply. */
export function Answer({
  r,
  data,
  me,
  go,
  acts,
  inSheet = false,
}: {
  r: SupportRowVM;
  data: ConsoleSupport;
  me: ConsoleMe;
  go: Go;
  acts: Acts;
  /** In a phone's sheet, whose title says the code already. */
  inSheet?: boolean;
}) {
  const fill = { first: r.first, workspace: r.workspace, me: staffName(me.email), tenantId: r.tenantId };
  return (
    <div className="cs-a cs-a-open" data-testid="console-support-open">
      <Top r={r} inSheet={inSheet} />
      <Status r={r} />
      <From r={r} />
      <Workspace r={r} data={data} me={me} go={go} acts={acts} />
      <HowToHelp r={r} fill={fill} />
      <Reply r={r} fill={fill} />
    </div>
  );
}

/** What the one opened can do: Answer in the inbox, coral, and marking it beside it; the rest quiet under them. */
export function AnswerActs({
  r,
  data,
  me,
  acts,
}: {
  r: SupportRowVM;
  data: ConsoleSupport;
  me: ConsoleMe;
  acts: Acts;
}) {
  const may = staffMay(me.role, "report_answered");
  const inbox = inboxSearchUrl(data.inbox, r.kind === "ask" ? (r.email ?? r.workspace) : r.code);
  const open = r.state === "new" || r.state === "taken";
  const quiet = may && (!open || !!r.unmailed || r.kind === "question");
  return (
    <div className="cs-a-acts">
      <div className="cs-a-acts-main">
        {inbox ? (
          <Button
            variant="primary"
            href={inbox}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="console-support-inbox"
          >
            <Icon name="mail" size={13} />
            {r.kind === "ask" ? SUPPORT_WORDS.writeInInbox : SUPPORT_WORDS.answerInInbox}
          </Button>
        ) : (
          <CopyButton
            text={r.code}
            label={`Copy ${r.code}`}
            said={SUPPORT_WORDS.copied}
            testid="console-support-copy"
          />
        )}
        {may && open && (
          <Button onClick={() => acts.mark(r, "answered")} disabled={acts.busy} data-testid="console-support-answered">
            <Icon name="check" size={13} />
            {SUPPORT_WORDS.markAnswered}
          </Button>
        )}
        {may && r.state === "waiting" && r.byHand && (
          <Button onClick={() => acts.mark(r, "done")} disabled={acts.busy} data-testid="console-support-done">
            <Icon name="check" size={13} />
            {SUPPORT_WORDS.markDone}
          </Button>
        )}
      </div>
      {!inbox && <span className="cs-a-note">{SUPPORT_WORDS.noInbox}</span>}
      {quiet && (
        <div className="cs-a-acts-quiet">
          {!open && (
            <LinkButton onClick={() => acts.mark(r, "reopened")} data-testid="console-support-reopen">
              {SUPPORT_WORDS.reopen}
            </LinkButton>
          )}
          {r.unmailed && (
            <LinkButton onClick={() => acts.resend(r)} data-testid="console-support-resend">
              {SUPPORT_WORDS.sendAgain}
            </LinkButton>
          )}
          {r.kind === "question" && (
            <LinkButton onClick={() => acts.move(r)} data-testid="console-support-move">
              {SUPPORT_WORDS.moveToHealth}
            </LinkButton>
          )}
        </div>
      )}
    </div>
  );
}
