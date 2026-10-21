/**
 * The Console's reads and verbs (decision 0066), each through its route. Read on demand, as the back office was: a
 * surface would make every customer's browser fetch a page it will never be allowed to see. Every route answers 404 to
 * everybody but the platform's staff, and asks a staff session that has not shown its second factor to show it.
 *
 * A read that fails answers its refusal, which the screen says in its own card; a write answers its refusal's words
 * the same way. Nothing here decides who may do what: the routes do, and the screens draw what `staffMay` allows.
 */
import type {
  ClaimDto,
  ConsoleWhy,
  FindRowDto,
  PlatformActDto,
  PrivacyRequestDto,
  ReportKind,
  RequestKind,
  RequestStep,
  SupportKindFilter,
  SupportTopic,
  SupportView,
} from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { api } from "@/legacy-bridge/api";

export type ConsoleMe = Output<"GET platform/me">;
export type ConsoleHome = Output<"GET platform/home">;
export type ConsoleWorkspace = Output<"GET platform/workspaces/[slug]">;
export type ConsoleSupport = Output<"GET platform/support">;
type ConsoleBugs = Output<"GET platform/support/bugs">;

/** What Support's tools narrow the queue by, and how many pages of it are shown. */
export interface SupportAsk {
  view: SupportView;
  kind: SupportKindFilter;
  topic: SupportTopic | null;
  workspace: string | null;
  q: string;
  page: number;
}
type ConsoleTenant = Output<"GET platform/tenants/[id]">;

/** A read's answer, or why it could not be had, in a person's words; `missing` when the route said there is none. */
export type Read<T> = { ok: true; data: T } | { ok: false; message: string; missing: boolean };
/** A write's answer: what it returned, or its refusal's words (a form's fields beside them). */
type Wrote<T> = { ok: true; data: T } | { ok: false; message: string; fields: Record<string, string> };

const refusedFields = (details: unknown): Record<string, string> => {
  const f = details && typeof details === "object" ? (details as { fields?: unknown }).fields : null;
  return f && typeof f === "object" ? (f as Record<string, string>) : {};
};

type Answer<T> = { ok: true; data: T } | { ok: false; message: string; status?: number; details?: unknown };

const readAnswer = <T>(r: Answer<T>): Read<T> =>
  r.ok ? { ok: true, data: r.data } : { ok: false, message: r.message, missing: r.status === 404 };
const wroteAnswer = <T>(r: Answer<T>): Wrote<T> =>
  r.ok ? { ok: true, data: r.data } : { ok: false, message: r.message, fields: refusedFields(r.details) };

export const consoleVerbs = {
  me: async (): Promise<Read<ConsoleMe>> => readAnswer(await api()("GET platform/me")),
  home: async (): Promise<Read<ConsoleHome>> => readAnswer(await api()("GET platform/home")),
  workspace: async (slug: string): Promise<Read<ConsoleWorkspace>> =>
    readAnswer(await api()("GET platform/workspaces/[slug]", { params: { slug } })),
  /** A workspace's Setup as its owner sees it, and its events: the back office's read, by id. */
  tenant: async (id: string): Promise<Read<ConsoleTenant>> =>
    readAnswer(await api()("GET platform/tenants/[id]", { params: { id } })),
  find: async (q: string): Promise<Read<{ rows: FindRowDto[] }>> =>
    readAnswer(await api()("GET platform/find", { query: { q } })),
  support: async (a: SupportAsk): Promise<Read<ConsoleSupport>> =>
    readAnswer(
      await api()("GET platform/support", {
        query: {
          view: a.view,
          kind: a.kind,
          q: a.q,
          page: a.page,
          ...(a.topic ? { topic: a.topic } : {}),
          ...(a.workspace ? { workspace: a.workspace } : {}),
        },
      }),
    ),
  /** Health's bug reports: the last thirty days of "Something isn't working". */
  bugs: async (): Promise<Read<ConsoleBugs>> => readAnswer(await api()("GET platform/support/bugs")),
  /** A question answered or open again; an ask answered, done, or open again. One press: its reason is its code. */
  mark: async (body: {
    target: "report" | "ask";
    id: string;
    mark: "answered" | "done" | "reopened";
  }): Promise<Wrote<{ ok: true }>> => wroteAnswer(await api()("POST platform/support/mark", { body })),
  /** A report the inbox did not get, sent to it again. */
  resend: async (id: string): Promise<Wrote<{ mailed: boolean }>> =>
    wroteAnswer(await api()("POST platform/support/resend", { body: { id } })),
  /** A report moved between Support and Health. */
  move: async (id: string, kind: ReportKind): Promise<Wrote<{ kind: ReportKind }>> =>
    wroteAnswer(await api()("POST platform/support/kind", { body: { id, kind } })),
  requests: async (): Promise<Read<{ requests: PrivacyRequestDto[] }>> =>
    readAnswer(await api()("GET platform/requests")),
  acts: async (q: { who?: string; before?: string }): Promise<Read<{ rows: PlatformActDto[] }>> =>
    readAnswer(await api()("GET platform/acts", { query: { ...q, format: "rows" } })),
  actsCsv: async (): Promise<Read<string>> => {
    const r = await api()("GET platform/acts", { query: { format: "csv" } });
    return r.ok ? { ok: true, data: r.data.csv ?? "" } : { ok: false, message: r.message, missing: r.status === 404 };
  },
  fileRequest: async (body: {
    kind: RequestKind;
    workspace: string;
    asked_by: string;
    asked_at: string;
    why: ConsoleWhy;
  }): Promise<Wrote<{ request: PrivacyRequestDto }>> => wroteAnswer(await api()("POST platform/requests", { body })),
  step: async (body: {
    id: string;
    step: RequestStep | "close";
    done: boolean;
    why: ConsoleWhy;
  }): Promise<Wrote<{ request: PrivacyRequestDto }>> =>
    wroteAnswer(await api()("POST platform/requests/step", { body })),
  claim: async (tenantId: string, take: boolean): Promise<Wrote<{ claim: ClaimDto | null }>> =>
    wroteAnswer(await api()("POST platform/claims", { body: { tenant_id: tenantId, take } })),
};
