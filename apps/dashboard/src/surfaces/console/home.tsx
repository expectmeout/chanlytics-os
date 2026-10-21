/**
 * Home (decision 0066, the canvas's Home board): what needs a person at Chanlytics now. The workspaces that need us and
 * those waiting on their owners, each with who on the team has it; what came in this week (members' questions, and
 * the asks setup cannot do yet; a bug report is Health's); the four numbers; who is waiting to get in; and what is due
 * (the requests' clocks, the questions and asks past their day, the partners' workspaces held for a person). Every
 * sentence is contracts'.
 */
import type { ReactNode } from "react";
import {
  CONSOLE_WORDS,
  SUPPORT_WORDS,
  cameInOf,
  consoleGroups,
  consoleNumbersOf,
  consolePathOf,
  homeSentence,
  requestsInOrder,
  supportPathOf,
  supportQueueOf,
  type ClaimDto,
  type PlatformRowVM,
  type PrivacyRequestVM,
  type SupportRowVM,
} from "@chanlytics/contracts";
import { backOffice } from "@/legacy-bridge/platform";
import { AttnRow } from "../kit/attention/attn-row";
import { Figure } from "../kit/figure/figure";
import { PageHead } from "../kit/head/page-head";
import { pageDatelineParts } from "../kit/head/dateline";
import { LinkButton } from "../kit/link-button/link-button";
import { PlatformQueueCard } from "./waiting";
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
import { WorkspaceRow } from "./rows";
import { consoleVerbs, type ConsoleHome, type ConsoleMe } from "./verbs";

/** How many rows of what came in Home shows; Support holds the rest. */
const CAME_IN_SHOWN = 6;

export function HomeScreen({ me, go, flash }: { me: ConsoleMe; go: Go; flash: Flash }) {
  const read = useConsoleRead(consoleVerbs.home, "home");
  if (!read.data)
    return read.problem ? (
      <ScreenFailed what="Home" why={read.problem} busy={read.busy} again={read.again} testid="console-home-failed" />
    ) : (
      <ScreenReading />
    );
  return <Home home={read.data} me={me} go={go} flash={flash} again={read.again} />;
}

/** What a row of Home needs besides itself: who is looking, where to go, what to say, and how to read again. */
type Around = { me: ConsoleMe; go: Go; flash: Flash; again: () => void };

/** A group of workspaces, each with who on the team has it: Needs us offers Take it, the rest open. */
function WorkspaceGroup({
  title,
  rows,
  claims,
  none,
  takes = false,
  aside = null,
  testid,
  around,
}: {
  title: string;
  rows: PlatformRowVM[];
  claims: Map<string, ClaimDto>;
  none: string;
  takes?: boolean;
  aside?: ReactNode;
  testid: string;
  around: Around;
}) {
  return (
    <ScreenSection title={title} sub={`${rows.length}`} aside={aside} testid={testid}>
      <div className="cl-attn-list">
        {rows.length === 0 && <NoneRow words={none} />}
        {rows.map((r) => (
          <WorkspaceRow
            key={r.tenantId}
            row={r}
            claim={claims.get(r.tenantId) ?? null}
            me={around.me}
            go={around.go}
            flash={around.flash}
            onClaimed={around.again}
            takes={takes}
          />
        ))}
      </div>
    </ScreenSection>
  );
}

/** The numbers, who is waiting to get in, and what is due: Home's side. */
function HomeSide({
  home,
  rows,
  requests,
  late,
  around,
}: {
  home: ConsoleHome;
  rows: PlatformRowVM[];
  requests: PrivacyRequestVM[];
  late: SupportRowVM[];
  around: Around;
}) {
  const P = backOffice.verbs;
  const held = (home.partners?.workspaces ?? []).filter((w) => w.standing === "review");
  const nameOf = new Map(rows.map((r) => [r.tenantId, r.name]));
  const queue = home.queue ? P.queue(home.queue) : null;
  return (
    <div className="cs-column cs-side">
      <ScreenSection title="The numbers" testid="console-home-numbers">
        <div className="cs-figures">
          {consoleNumbersOf(home.numbers).map((n) => (
            <Figure
              key={n.label}
              label={n.label}
              value={n.value}
              meta={n.sub}
              look="tile"
              {...(n.tone === "warn" ? { tone: "warn" as const } : {})}
            />
          ))}
        </div>
      </ScreenSection>
      {queue && (
        <PlatformQueueCard waiting={queue} P={P} role={around.me.role} onDone={around.again} flash={around.flash} />
      )}
      <ScreenSection
        title="Due"
        sub={home.support === null ? CONSOLE_WORDS.failed : `${requests.length + late.length + held.length}`}
        testid="console-home-due"
      >
        <div className="cl-attn-list">
          {requests.length + late.length + held.length === 0 && <NoneRow words="Nothing is due." />}
          {late.map((r) => (
            <AttnRow
              key={r.key}
              glyph={r.kind === "ask" ? "user" : "chat"}
              name={r.kind === "ask" ? r.title : `${r.workspace} asked`}
              meta={[r.code, r.topicWords].join(" · ")}
              sentence={r.kind === "ask" ? r.who : `“${r.title}”`}
              status={[r.wait.words]}
              tone="danger"
              onOpen={() => around.go(supportPathOf(r.code))}
              testid={`console-due-${r.code}`}
            />
          ))}
          {requests.map((q) => (
            <AttnRow
              key={q.id}
              glyph="note"
              name={`${q.title} · ${q.workspace}`}
              meta={q.code}
              sentence={q.next ? `Next: ${q.steps.find((s) => s.step === q.next)?.title ?? ""}` : "Every step is done."}
              status={[q.clock.words]}
              tone={q.clock.tone}
              onOpen={() => around.go(consolePathOf("requests"))}
              testid={`console-due-${q.code}`}
            />
          ))}
          {held.map((w) => (
            <AttnRow
              key={w.tenant_id}
              glyph="users"
              name={`${nameOf.get(w.tenant_id) ?? "A workspace"}'s partner share`}
              sentence={P.partnerStanding(w).standing}
              status={["Rule on it"]}
              onOpen={() => around.go(consolePathOf("partners"))}
              testid={`console-due-partner-${w.tenant_id}`}
            />
          ))}
        </div>
      </ScreenSection>
    </div>
  );
}

function Home({
  home,
  me,
  go,
  flash,
  again,
}: {
  home: ConsoleHome;
  me: ConsoleMe;
  go: Go;
  flash: Flash;
  again: () => void;
}) {
  const now = Date.now();
  const around: Around = { me, go, flash, again };
  const rows = backOffice.verbs.rows(home.tenants);
  const groups = consoleGroups(rows);
  const needsUs = groups.find((g) => g.group === "needs_us")?.rows ?? [];
  const waiting = groups.find((g) => g.group === "waiting")?.rows ?? [];
  const claims = new Map((home.claims ?? []).map((c) => [c.tenant_id, c]));
  const cameIn = cameInOf(home.reports ?? [], home.asks ?? [], now);
  const requests = requestsInOrder(home.requests ?? [], now, viewerZone());
  // The questions and asks past their day: the server sent these alone, so every row it built is one.
  const late = home.support ? supportQueueOf(home.support, { me: me.user_id, nowMs: now, zone: viewerZone() }) : [];
  const first = requests[0];
  const due =
    [
      ...(late.length ? [SUPPORT_WORDS.due(late.length)] : []),
      ...(first
        ? [
            `${requests.length} request${requests.length === 1 ? "" : "s"} due · the nearest ${first.clock.words.toLowerCase()}`,
          ]
        : []),
    ].join(" · ") || null;
  return (
    <div className="cs-home" data-testid="console-home">
      <PageHead
        dateline={pageDatelineParts(now, viewerZone()).day}
        title="Home"
        sentence={homeSentence({ needsUs: needsUs.length, waiting: waiting.length, cameIn: cameIn.length, due })}
      />
      <div className="cs-columns">
        <div className="cs-column">
          <WorkspaceGroup
            title="Needs us"
            rows={needsUs}
            claims={claims}
            none="Nothing needs us right now."
            takes
            aside={
              <LinkButton onClick={() => go(consolePathOf("workspaces"))} data-testid="console-home-every">
                {CONSOLE_WORDS.every}
              </LinkButton>
            }
            testid="console-home-needs"
            around={around}
          />
          <WorkspaceGroup
            title="Waiting on them"
            rows={waiting}
            claims={claims}
            none="No workspace is waiting on its owner."
            testid="console-home-waiting"
            around={around}
          />
          <ScreenSection
            title="Came in"
            sub={home.reports === null || home.asks === null ? CONSOLE_WORDS.failed : `${cameIn.length} this week`}
            aside={
              <LinkButton onClick={() => go(consolePathOf("support"))} data-testid="console-home-support">
                {SUPPORT_WORDS.title}
              </LinkButton>
            }
            testid="console-home-came-in"
          >
            <div className="cl-attn-list">
              {cameIn.length === 0 && <NoneRow words={SUPPORT_WORDS.cameInNone} />}
              {cameIn.slice(0, CAME_IN_SHOWN).map((c) => (
                <AttnRow
                  key={c.key}
                  glyph={c.kind === "report" ? "chat" : "user"}
                  name={c.title}
                  meta={[c.workspace, c.when].join(" · ")}
                  sentence={c.detail}
                  status={c.code ? [c.code] : []}
                  onOpen={() => go(c.code ? supportPathOf(c.code) : consolePathOf("support"))}
                  testid={`console-came-in-${c.key}`}
                />
              ))}
            </div>
          </ScreenSection>
        </div>
        <HomeSide home={home} rows={rows} requests={requests} late={late} around={around} />
      </div>
    </div>
  );
}
