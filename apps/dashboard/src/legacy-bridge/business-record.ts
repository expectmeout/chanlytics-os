/**
 * The business on record, on the classic page: what is saved, what is
 * still wrong with it in the owner's words, and the two verbs — save it,
 * and file the line with the carriers.
 *
 * Read on demand rather than as a surface: the form is opened by one
 * person, on one row, once. Filing is the only verb in this product that
 * costs the workspace money the moment it is pressed, so it is asked for
 * plainly and never chained onto the save.
 */
import { businessRecordProblems, emptyBusinessRecord, BUSINESS_FIELDS, BUSINESS_GROUP_WORDS, businessRecordLine, industryWords, type BusinessRecordDto } from "@chanlytics/contracts";
import { scoped } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { setupOverride } from "./setup";

export interface BusinessRecordApi {
  /** What is on record, and what is still wrong with it. */
  read(): Promise<{ ok: boolean; record: BusinessRecordDto | null; problems: Record<string, string>; message: string }>;
  /** Keep it. Owners only; the route says so. */
  save(record: BusinessRecordDto): Promise<{ ok: boolean; message: string }>;
  /** File this line with the carriers. Costs money, so the page asks first. */
  register(lineId: string): Promise<{ ok: boolean; pending: boolean; message: string }>;
  /** The fields, their words and their closed lists. */
  fields: typeof BUSINESS_FIELDS;
  groups: typeof BUSINESS_GROUP_WORDS;
  empty: typeof emptyBusinessRecord;
  problems: typeof businessRecordProblems;
  line: typeof businessRecordLine;
  optionWords: (value: string) => string;
}

declare global {
  interface Window {
    __businessRecord?: BusinessRecordApi;
  }
}

async function send<T>(path: string, method: string, body?: unknown): Promise<{ ok: boolean; data: T | null; message: string }> {
  try {
    const res = await fetch(scoped(path), {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null;
    if (!j || j.ok !== true) return { ok: false, data: null, message: j?.error?.message ?? "That did not go through. Try again in a moment." };
    return { ok: true, data: (j.data ?? null) as T | null, message: "" };
  } catch {
    return { ok: false, data: null, message: "The connection dropped. Try again in a moment." };
  }
}

export function installBusinessRecord(win: Window = window): void {
  win.__businessRecord = {
    async read() {
      const r = await send<{ record: BusinessRecordDto | null; problems: Record<string, string> }>("/api/v1/business-record", "GET");
      return { ok: r.ok, record: r.data?.record ?? null, problems: r.data?.problems ?? {}, message: r.message };
    },
    async save(record) {
      const r = await send<{ record: unknown }>("/api/v1/business-record", "PUT", record);
      if (r.ok) await refreshSurfaces([setupOverride]);
      return { ok: r.ok, message: r.ok ? "Saved. The carriers see this when you file." : r.message };
    },
    async register(lineId) {
      const r = await send<{ ok: boolean; pending: boolean; error: string | null }>("/api/v1/lines/register", "POST", { line_id: lineId });
      if (r.ok) await refreshSurfaces([setupOverride]);
      const pending = r.data?.pending === true;
      return {
        ok: r.ok && (r.data?.ok === true || pending),
        pending,
        message: !r.ok
          ? r.message
          : pending
            ? "Filed. The carriers have your brand; texting switches on by itself when they are through."
            : r.data?.ok
              ? "Filed with the carriers. This page updates by itself."
              : r.data?.error ?? "The carriers did not accept it.",
      };
    },
    fields: BUSINESS_FIELDS,
    groups: BUSINESS_GROUP_WORDS,
    empty: emptyBusinessRecord,
    problems: businessRecordProblems,
    line: businessRecordLine,
    optionWords: (value) => (/^[A-Z_]+$/.test(value) ? industryWords(value) : value),
  };
}
