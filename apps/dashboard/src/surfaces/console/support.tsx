/**
 * Support, the help desk (decision 0067; the second pass of the Support review, 21 Oct 2026): who needs a person, the
 * one you are helping open beside them, and how to help. One queue of questions and setup asks, late first and then
 * the oldest, each with its promise (a person answers within one business day), its topic and its state; views of
 * what needs a person, what waits on the workspace and what was answered; a kind, a topic, a workspace and words to
 * narrow it. Beside it, the one opened: their words, who and their workspace with Take it, the topic's playbook, a
 * reply with their name in, and the one coral act, Answer in the inbox. The bug reports are Health's, and a line says
 * how many went there.
 *
 * Keys on a desk: ↑↓ move, Enter opens, Esc closes, T takes the workspace, A copies the reply, M marks it answered. On
 * a phone the queue is rows and the one opened is a sheet. Every sentence is contracts'.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  SUPPORT_KIND_FILTERS,
  SUPPORT_KIND_FILTER_WORDS,
  SUPPORT_VIEWS,
  SUPPORT_VIEW_WORDS,
  SUPPORT_WORDS,
  consolePathOf,
  inboxHomeUrl,
  inboxSearchUrl,
  playbookOf,
  staffMay,
  staffName,
  supportQueueOf,
  supportSentence,
  supportWorkspaceOf,
  verdictPill,
  type SupportKindFilter,
  type SupportRowVM,
  type SupportTopic,
  type SupportView,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { CopyButton } from "../kit/copy-button/copy-button";
import { PageHead } from "../kit/head/page-head";
import { Icon } from "../kit/icon/icon";
import { LinkButton } from "../kit/link-button/link-button";
import { Meter } from "../kit/meter/meter";
import { StatePill } from "../kit/pill/state-pill";
import { Search } from "../kit/search/search";
import { Segmented } from "../kit/segmented/segmented";
import { Select } from "../kit/select/select";
import { Sheet } from "../kit/sheet/sheet";
import { SubTabs } from "../kit/sub-tabs/sub-tabs";
import { NoneRow, ScreenFailed, ScreenReading, useConsoleRead, viewerZone, type Flash, type Go } from "./parts";
import { consoleVerbs, type ConsoleMe, type ConsoleSupport, type SupportAsk } from "./verbs";

/** Where the one opened stands beside the queue: from the kit's 900px down, it is a sheet over it. */
const BESIDE = "(min-width: 901px)";
function hearWidth(changed: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const m = window.matchMedia(BESIDE);
  m.addEventListener("change", changed);
  return () => m.removeEventListener("change", changed);
}
const besideFits = (): boolean => !!window.matchMedia && window.matchMedia(BESIDE).matches;
const useBeside = (): boolean => useSyncExternalStore(hearWidth, besideFits, () => true);

/** How long the search waits for typing to stop before it reads again. */
const SEARCH_WAIT_MS = 250;

/** A key pressed where it types is the field's, never the queue's. */
const typingIn = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** The code a link opened Support on (`?open=R-1044`), read once. */
function codeInAddress(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("open");
  } catch {
    return null;
  }
}

const chevron = <Icon name="chevron-down" size={12} />;

/* ----------------------------------------------------------------------------------------------- the queue */

/** A row's Waiting cell: its words over the promise's bar, red past its day. */
function WaitCell({ r }: { r: SupportRowVM }) {
  return (
    <div className="cs-q-wait" data-tone={r.wait.tone ?? undefined}>
      <span className="cs-q-wait-words">{r.wait.words}</span>
      {r.wait.part !== null && (
        <Meter
          size="sm"
          parts={[
            { share: r.wait.part, tone: r.wait.tone ? "warn" : "read" },
            { share: 1 - r.wait.part, tone: "rest" },
          ]}
          aria-label={r.wait.words}
        />
      )}
    </div>
  );
}

/** The queue: four columns on a desk (what, topic, waiting, state), rows on a phone; one picked at a time. */
function Queue({
  rows,
  picked,
  onOpen,
}: {
  rows: readonly SupportRowVM[];
  picked: string | null;
  onOpen: (key: string) => void;
}) {
  return (
    <div className="cs-q">
      <div className="cs-q-head" aria-hidden="true">
        <span>{SUPPORT_WORDS.columns.what}</span>
        <span>{SUPPORT_WORDS.columns.topic}</span>
        <span>{SUPPORT_WORDS.columns.waiting}</span>
        <span>{SUPPORT_WORDS.columns.state}</span>
      </div>
      <div
        className="cs-q-list"
        role="listbox"
        aria-label={SUPPORT_WORDS.title}
        aria-activedescendant={picked ? `cs-q-${picked}` : undefined}
        tabIndex={0}
        data-testid="console-support-queue"
      >
        {rows.map((r) => (
          <div
            key={r.key}
            id={`cs-q-${r.key}`}
            className="cs-q-row"
            role="option"
            aria-selected={picked === r.key}
            tabIndex={-1}
            onClick={() => onOpen(r.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(r.key);
              }
            }}
            data-testid={`console-support-row-${r.code}`}
          >
            <div className="cs-q-what">
              <span className="cs-q-title">{r.quoted ? `“${r.title}”` : r.title}</span>
              <span className="cs-q-meta">{[r.kindWords, r.workspace, r.who].join(" · ")}</span>
            </div>
            <span className="cs-q-topic">{r.topicWords}</span>
            <WaitCell r={r} />
            <span className="cs-q-state">
              <StatePill kind="tone" value={r.stateTone ?? "plain"} label={r.stateWords} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- the one opened */

/** One block of the one opened: its small heading and what it holds. */
function Part({ head, aside = null, children }: { head?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="cs-a-part">
      {head ? (
        <div className="cs-a-head">
          <span className="cs-a-label">{head}</span>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** What the one opened can do, as the page wires it. */
interface Acts {
  take: (r: SupportRowVM, take: boolean) => void;
  mark: (r: SupportRowVM, mark: "answered" | "done" | "reopened") => void;
  resend: (r: SupportRowVM) => void;
  move: (r: SupportRowVM) => void;
  busy: boolean;
}

/** Who they are, their workspace as Home judges it, who has it, and its two doors. */
function WhoAndWhere({
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
  return (
    <>
      <Part head={SUPPORT_WORDS.from}>
        <span className="cs-a-strong">{r.who}</span>
        {r.since && <span className="cs-a-dim">{r.since}</span>}
        {r.email && (
          <span className="cs-a-line">
            <span className="cs-a-dim">{r.email}</span>
            <CopyButton text={r.email} label="Copy" testid="console-support-copy-email" />
          </span>
        )}
      </Part>
      <Part
        head={SUPPORT_WORDS.workspaceCard}
        aside={
          ws ? (
            <StatePill kind="tone" value={verdictPill(ws.verdict).tone} label={verdictPill(ws.verdict).label} />
          ) : null
        }
      >
        <span className="cs-a-strong">{r.workspace}</span>
        {ws && <span className="cs-a-dim">{ws.sentence}</span>}
        {ws && (
          <span className="cs-a-dim">
            {[
              `Plan: ${ws.facts.paying}`,
              `Answering: ${ws.facts.answering}`,
              `Texting: ${ws.facts.texting}`,
              `Heard from: ${ws.facts.heard}`,
            ].join(" · ")}
          </span>
        )}
        {r.tenantId && (
          <span className="cs-a-line">
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
          </span>
        )}
        {r.slug && (
          <span className="cs-a-line">
            <LinkButton onClick={() => go(consolePathOf("workspaces", r.slug))} data-testid="console-support-workspace">
              {SUPPORT_WORDS.openWorkspace}
            </LinkButton>
            <LinkButton
              onClick={() => go(consolePathOf("workspaces", r.slug, "lines"))}
              data-testid="console-support-setup"
            >
              {SUPPORT_WORDS.openSetup}
            </LinkButton>
          </span>
        )}
      </Part>
    </>
  );
}

/** The one opened: their words, who and where, how to help, the reply, and what to do. */
function Answer({
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
  const book = playbookOf(r);
  const fill = { first: r.first, workspace: r.workspace, me: staffName(me.email), tenantId: r.tenantId };
  return (
    <div className="cs-a" data-testid="console-support-open">
      <Part>
        <span className="cs-a-line">
          {!inSheet && <span className="cs-a-code">{r.code}</span>}
          <CopyButton text={r.code} label="Copy" said={SUPPORT_WORDS.copied} testid="console-support-copy-code" />
          <span className="cs-a-dim">{r.sent}</span>
        </span>
        <p className="cs-a-words">{r.quoted ? `“${r.title}”` : r.title}</p>
        {r.page && <span className="cs-a-dim">{`From ${r.page}`}</span>}
        {r.doneWhen && <span className="cs-a-dim">{r.doneWhen}</span>}
        {r.answered && <span className="cs-a-dim">{r.answered}</span>}
        {r.unmailed && <span className="cs-a-warn">{r.unmailed}</span>}
        {r.error && <span className="cs-a-dim">{`${SUPPORT_WORDS.alsoSent}: ${r.error}`}</span>}
      </Part>
      <WhoAndWhere r={r} data={data} me={me} go={go} acts={acts} />
      <Part head={`${SUPPORT_WORDS.howToHelp} · ${book.title}`}>
        <span className="cs-a-check">{`${SUPPORT_WORDS.checkFirst}: ${book.check}`}</span>
        <ol className="cs-a-steps">
          {book.steps(fill).map((s) => (
            // A step indented as a command is one to run as it is: drawn as code, its dashes never joined.
            <li key={s}>{s.startsWith("  ") ? <code className="cs-a-cmd">{s.trim()}</code> : s}</li>
          ))}
        </ol>
      </Part>
      <Part head={SUPPORT_WORDS.reply} aside={<span className="cs-a-dim">{SUPPORT_WORDS.replyNote}</span>}>
        <p className="cs-a-reply" data-testid="console-support-reply">
          {book.reply(fill)}
        </p>
      </Part>
    </div>
  );
}

/** What the one opened can do: Answer in the inbox, coral; copy the reply; mark it; and the rest, quiet. */
function AnswerActs({ r, data, me, acts }: { r: SupportRowVM; data: ConsoleSupport; me: ConsoleMe; acts: Acts }) {
  const may = staffMay(me.role, "report_answered");
  const book = playbookOf(r);
  const reply = book.reply({ first: r.first, workspace: r.workspace, me: staffName(me.email), tenantId: r.tenantId });
  const inbox = inboxSearchUrl(data.inbox, r.kind === "ask" ? (r.email ?? r.workspace) : r.code);
  const open = r.state === "new" || r.state === "taken";
  return (
    <div className="cs-a-acts">
      <div className="cs-acts">
        {inbox ? (
          <Button
            variant="primary"
            href={inbox}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="console-support-inbox"
          >
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
        <CopyButton
          text={reply}
          label={SUPPORT_WORDS.copyReply}
          said={SUPPORT_WORDS.replyCopied}
          testid="console-support-copy-reply"
        />
        {may && open && (
          <Button
            variant="quiet"
            onClick={() => acts.mark(r, "answered")}
            disabled={acts.busy}
            data-testid="console-support-answered"
          >
            {SUPPORT_WORDS.markAnswered}
          </Button>
        )}
        {may && r.state === "waiting" && r.byHand && (
          <Button
            variant="quiet"
            onClick={() => acts.mark(r, "done")}
            disabled={acts.busy}
            data-testid="console-support-done"
          >
            {SUPPORT_WORDS.markDone}
          </Button>
        )}
      </div>
      {!inbox && <span className="cs-a-dim">{SUPPORT_WORDS.noInbox}</span>}
      {may && (
        <div className="cs-acts">
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

/* -------------------------------------------------------------------------------------------------- the screen */

/** The tools: the views with their counts, then a kind, a topic, a workspace and words. */
function Tools({
  ask,
  set,
  data,
  q,
  setQ,
}: {
  ask: SupportAsk;
  set: (next: Partial<SupportAsk>) => void;
  data: ConsoleSupport | null;
  q: string;
  setQ: (q: string) => void;
}) {
  const c = data?.counts;
  const home = inboxHomeUrl(data?.inbox);
  return (
    <>
      <div className="cs-tools">
        <SubTabs
          label={SUPPORT_WORDS.views}
          value={ask.view}
          onSelect={(id) => set({ view: id as SupportView, page: 1 })}
          tabs={SUPPORT_VIEWS.map((v) => ({
            id: v,
            label: SUPPORT_VIEW_WORDS[v],
            ...(c ? { count: c.views[v] } : {}),
            ...(v === "needs" && c?.late ? { tone: "warn" as const } : {}),
            testid: `console-support-view-${v}`,
          }))}
          dense
        />
        <span className="cs-tools-end">
          {home && (
            <Button
              size="sm"
              variant="quiet"
              href={home}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="console-support-open-inbox"
            >
              {SUPPORT_WORDS.openInbox}
            </Button>
          )}
        </span>
      </div>
      <div className="cs-tools cs-tools-narrow">
        <Segmented
          label={SUPPORT_WORDS.kinds}
          value={ask.kind}
          onValueChange={(kind: SupportKindFilter) => set({ kind, page: 1 })}
          options={SUPPORT_KIND_FILTERS.map((k) => ({
            value: k,
            label: c ? `${SUPPORT_KIND_FILTER_WORDS[k]} ${c.kinds[k]}` : SUPPORT_KIND_FILTER_WORDS[k],
            testid: `console-support-kind-${k}`,
          }))}
        />
        <span className="cs-tools-pick">
          <Select
            value={ask.topic ?? ""}
            onValueChange={(t: string) => set({ topic: (t || null) as SupportTopic | null, page: 1 })}
            options={[
              { value: "", label: SUPPORT_WORDS.anyTopic },
              ...(c?.topics ?? []).map((t) => ({ value: t.topic, label: t.words, meta: String(t.n) })),
            ]}
            chevron={chevron}
            label={SUPPORT_WORDS.topic}
            data-testid="console-support-topic"
          />
        </span>
        <span className="cs-tools-pick">
          <Select
            value={ask.workspace ?? ""}
            onValueChange={(w: string) => set({ workspace: w || null, page: 1 })}
            options={[
              { value: "", label: SUPPORT_WORDS.anyWorkspace },
              ...(c?.workspaces ?? []).map((w) => ({ value: w.slug, label: w.name, meta: String(w.n) })),
            ]}
            chevron={chevron}
            label={SUPPORT_WORDS.workspace}
            data-testid="console-support-workspace-filter"
          />
        </span>
        <Search
          label={SUPPORT_WORDS.search}
          value={q}
          onChange={setQ}
          testid="console-support-search"
          className="cs-tools-words"
        />
      </div>
    </>
  );
}

/** The presses the one opened offers, each followed by the queue read again, and what each says once done. */
function useSupportActs(flash: Flash, again: () => void): Acts & { said: (ok: boolean, words: string) => void } {
  const [busy, setBusy] = useState(false);
  const said = (ok: boolean, words: string) => flash({ tone: ok ? "ok" : "danger", msg: <>{words}</> });
  const after = async <T,>(
    run: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>,
    words: string,
  ): Promise<void> => {
    setBusy(true);
    const r = await run();
    setBusy(false);
    said(r.ok, r.ok ? words : r.message);
    if (r.ok) again();
  };
  return {
    busy,
    said,
    take: (r, take) =>
      r.tenantId
        ? void after(() => consoleVerbs.claim(r.tenantId ?? "", take), take ? "Yours for four hours." : "Let go.")
        : undefined,
    mark: (r, mark) =>
      void after(
        () => consoleVerbs.mark({ target: r.kind === "ask" ? "ask" : "report", id: r.id, mark }),
        mark === "reopened"
          ? SUPPORT_WORDS.reopenedSaid
          : mark === "done"
            ? SUPPORT_WORDS.doneSaid
            : r.kind === "ask"
              ? SUPPORT_WORDS.waitingSaid
              : SUPPORT_WORDS.answeredSaid,
      ),
    resend: (r) => void after(() => consoleVerbs.resend(r.id), SUPPORT_WORDS.resentSaid),
    move: (r) => void after(() => consoleVerbs.move(r.id, "wrong"), SUPPORT_WORDS.movedSaid),
  };
}

/**
 * The row picked, and whether it is open: the one a link named once it is read; else, on a desk, the first, so the
 * side is never empty while rows wait; and a row that leaves the view (answered, moved) hands its place to the next.
 */
function usePicked(rows: readonly SupportRowVM[], beside: boolean) {
  const [picked, setPicked] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const wanted = useRef(codeInAddress());
  const at = useRef(0);
  useEffect(() => {
    if (!rows.length) return;
    const want = wanted.current ? rows.find((r) => r.code === wanted.current) : null;
    if (want) {
      wanted.current = null;
      setPicked(want.key);
      setOpened(true);
      return;
    }
    const still = rows.findIndex((r) => r.key === picked);
    if (still >= 0) at.current = still;
    else setPicked(beside ? (rows[Math.min(at.current, rows.length - 1)]?.key ?? null) : null);
  }, [rows, picked, beside]);
  return { picked, setPicked, opened, setOpened };
}

type Picked = ReturnType<typeof usePicked>;
type SupportActs = ReturnType<typeof useSupportActs>;

/** The desk's keys, while no field has them and no sheet is open over the queue. */
function useQueueKeys({
  rows,
  p,
  beside,
  acts,
  me,
}: {
  rows: readonly SupportRowVM[];
  p: Picked;
  beside: boolean;
  acts: SupportActs;
  me: ConsoleMe;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target)) return;
      if (!beside && p.opened) return;
      const here = rows.findIndex((r) => r.key === p.picked);
      const r = here >= 0 ? rows[here] : null;
      const step = (by: number) => {
        const next = rows[Math.max(0, Math.min(rows.length - 1, here + by))];
        if (next) p.setPicked(next.key);
      };
      const key = e.key.toLowerCase();
      if (e.key === "ArrowDown") step(1);
      else if (e.key === "ArrowUp") step(-1);
      else if (e.key === "Enter" && r) p.setOpened(true);
      else if (e.key === "Escape") p.setOpened(false);
      else if (key === "t" && r && !r.claim) acts.take(r, true);
      else if (key === "a" && r) {
        // No button was pressed to say it in place, so the page says it.
        const fill = { first: r.first, workspace: r.workspace, me: staffName(me.email), tenantId: r.tenantId };
        void navigator.clipboard?.writeText(playbookOf(r).reply(fill)).then(
          () => acts.said(true, SUPPORT_WORDS.replyCopied),
          () => undefined,
        );
      } else if (key === "m" && r && (r.state === "new" || r.state === "taken")) acts.mark(r, "answered");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

/** The queue's card: its rows, or what an empty view says, and how many are shown with Older under them. */
function QueueCard({
  rows,
  data,
  ask,
  set,
  busy,
  beside,
  p,
}: {
  rows: readonly SupportRowVM[];
  data: ConsoleSupport;
  ask: SupportAsk;
  set: (next: Partial<SupportAsk>) => void;
  busy: boolean;
  beside: boolean;
  p: Picked;
}) {
  const filtered = !!(ask.topic || ask.workspace || ask.q || ask.kind !== "all");
  return (
    <section className="rec-card set-card cs-desk-list">
      {rows.length === 0 ? (
        <NoneRow
          words={
            filtered
              ? SUPPORT_WORDS.noneMatch
              : ask.view === "needs" && data.quiet
                ? data.quiet
                : SUPPORT_WORDS.noneInView[ask.view]
          }
          testid="console-support-none"
        />
      ) : (
        <Queue
          rows={rows}
          picked={p.picked}
          onOpen={(k) => {
            p.setPicked(k);
            p.setOpened(true);
          }}
        />
      )}
      <div className="cs-q-foot">
        <span className="cs-key">
          {SUPPORT_WORDS.shown(rows.length)}
          {beside ? ` · ${SUPPORT_WORDS.keys}` : ""}
        </span>
        {data.more && (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => set({ page: ask.page + 1 })}
            disabled={busy}
            data-testid="console-support-older"
          >
            {SUPPORT_WORDS.older}
          </Button>
        )}
      </div>
    </section>
  );
}

export function SupportScreen({ me, go, flash }: { me: ConsoleMe; go: Go; flash: Flash }) {
  const [ask, setAsk] = useState<SupportAsk>({
    view: "needs",
    kind: "all",
    topic: null,
    workspace: null,
    q: "",
    page: 1,
  });
  const [q, setQ] = useState("");
  const beside = useBeside();
  const set = useCallback((next: Partial<SupportAsk>) => setAsk((a) => ({ ...a, ...next })), []);

  // The search reads again once typing stops.
  useEffect(() => {
    const t = window.setTimeout(() => set({ q, page: 1 }), SEARCH_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [q, set]);

  const read = useConsoleRead(() => consoleVerbs.support(ask), `support/${JSON.stringify(ask)}`);
  const data = read.data;
  const rows = useMemo(
    () => (data ? supportQueueOf(data.book, { me: me.user_id, nowMs: Date.now(), zone: viewerZone() }) : []),
    [data, me.user_id],
  );
  const p = usePicked(rows, beside);
  const acts = useSupportActs(flash, read.again);
  useQueueKeys({ rows, p, beside, acts, me });
  const row = rows.find((r) => r.key === p.picked) ?? null;
  const sentence = data ? supportSentence(data.counts, data.answered_ms) : SUPPORT_WORDS.sub;
  return (
    <div className="cs-screen cs-support" data-testid="console-support">
      <PageHead title={SUPPORT_WORDS.title} sentence={sentence} />
      <Tools ask={ask} set={set} data={data} q={q} setQ={setQ} />
      {data && data.to_health ? (
        <div className="cs-held" data-testid="console-support-to-health">
          {SUPPORT_WORDS.toHealth(data.to_health)}{" "}
          <LinkButton onClick={() => go(consolePathOf("health"))}>{SUPPORT_WORDS.openHealth}</LinkButton>
        </div>
      ) : null}
      {!data &&
        (read.problem ? (
          <ScreenFailed
            what={SUPPORT_WORDS.failed}
            why={read.problem}
            busy={read.busy}
            again={read.again}
            testid="console-support-failed"
          />
        ) : (
          <ScreenReading />
        ))}
      {data && (
        <div className="cs-desk" data-beside={beside && row ? "true" : undefined}>
          <QueueCard rows={rows} data={data} ask={ask} set={set} busy={read.busy} beside={beside} p={p} />
          {beside && row && (
            <aside className="rec-card set-card cs-desk-side" aria-label={row.code}>
              <Answer r={row} data={data} me={me} go={go} acts={acts} />
              <AnswerActs r={row} data={data} me={me} acts={acts} />
            </aside>
          )}
        </div>
      )}
      {!beside && data && row && (
        <Sheet
          open={p.opened}
          onClose={() => p.setOpened(false)}
          title={row.code}
          sub={row.workspace}
          close={{ label: SUPPORT_WORDS.close, glyph: <Icon name="x" size={13} /> }}
          foot={<AnswerActs r={row} data={data} me={me} acts={acts} />}
          testid="console-support-sheet"
        >
          <Answer r={row} data={data} me={me} go={go} acts={acts} inSheet />
        </Sheet>
      )}
    </div>
  );
}
