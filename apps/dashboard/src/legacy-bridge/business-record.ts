/**
 * The business on record, on the classic page: what is saved, what is
 * still wrong with it in the owner's words, and the two verbs — save it,
 * and file the line with the carriers.
 *
 * Read on demand rather than as a surface: the form is opened by one
 * person, on one row, once. Filing is the only verb in this product that
 * costs the workspace money the moment it is pressed, so it is asked for
 * plainly and never chained onto the save. After either lands, the refresh
 * map re-reads Setup, whose rows state these facts.
 */
import {
  businessRecordProblems,
  emptyBusinessRecord,
  businessFieldsFor,
  businessGroupWordsFor,
  businessRecordLine,
  registrationPathOf,
  businessRecordForPath,
  soleProprietorLimits,
  industryWords,
  REGISTRATION_PATHS,
  REGISTRATION_QUESTION,
  REGISTRATION_PATH_WORDS,
  REGISTRATION_COST_WORDS,
  type BusinessRecordDto,
  type RegistrationPath,
} from "@chanlytics/contracts";
import { api } from "./api";

export interface BusinessRecordApi {
  /**
   * What is on record, what is still wrong with it, and which registration it
   * is for — `path: null` when there is nothing on file and nobody has answered
   * the question yet.
   */
  read(): Promise<{
    ok: boolean;
    record: BusinessRecordDto | null;
    path: RegistrationPath | null;
    problems: Record<string, string>;
    message: string;
  }>;
  /** Keep it, for the registration the owner said it is for. Owners only; the route says so. */
  save(
    record: BusinessRecordDto,
    path: RegistrationPath,
  ): Promise<{ ok: boolean; message: string; title?: string; problems: Record<string, string> }>;
  /** File this line with the carriers. Costs money, so the page asks first. */
  register(lineId: string): Promise<{ ok: boolean; pending: boolean; message: string }>;
  /** The fields this registration asks for, their words and their closed lists. */
  fieldsFor: typeof businessFieldsFor;
  groupsFor: typeof businessGroupWordsFor;
  /** The fork: the question, the two answers, and what each one means. */
  paths: typeof REGISTRATION_PATHS;
  question: typeof REGISTRATION_QUESTION;
  pathWords: typeof REGISTRATION_PATH_WORDS;
  costWords: typeof REGISTRATION_COST_WORDS;
  /** What the narrow registration gives up — said before it is filed, never after. */
  limits: typeof soleProprietorLimits;
  /** Which registration a saved record is on. */
  pathOf: typeof registrationPathOf;
  /** The record as a path files it — the same normalising the save does, so the form never shows a problem on a box it does not render. */
  forPath: typeof businessRecordForPath;
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

export function installBusinessRecord(win: Window = window): void {
  win.__businessRecord = {
    async read() {
      const r = await api()("GET business-record");
      if (!r.ok) return { ok: false, record: null, path: null, problems: {}, message: r.message };
      return { ok: true, record: r.data.record, path: r.data.path, problems: r.data.problems, message: "" };
    },
    async save(record, path) {
      const r = await api()("PUT business-record", { body: { record, path } });
      if (r.ok) return { ok: true, message: "Saved. The carriers see this when you file.", problems: {} };
      // The route names every field it refuses, so the form marks each box.
      return { ok: false, message: r.message, title: r.title, problems: { ...(r.fields ?? {}) } };
    },
    async register(lineId) {
      const r = await api()("POST lines/register", { body: { line_id: lineId } });
      if (!r.ok) return { ok: false, pending: false, message: r.message };
      const pending = r.data.pending === true;
      return {
        ok: r.data.ok === true || pending,
        pending,
        message: pending
          ? "Filed. The carriers have your brand; texting switches on by itself when they are through."
          : r.data.ok
            ? "Filed with the carriers. This page updates by itself."
            : (r.data.error ?? "The carriers did not accept it."),
      };
    },
    fieldsFor: businessFieldsFor,
    groupsFor: businessGroupWordsFor,
    paths: REGISTRATION_PATHS,
    question: REGISTRATION_QUESTION,
    pathWords: REGISTRATION_PATH_WORDS,
    costWords: REGISTRATION_COST_WORDS,
    limits: soleProprietorLimits,
    pathOf: registrationPathOf,
    forPath: businessRecordForPath,
    empty: emptyBusinessRecord,
    problems: businessRecordProblems,
    line: businessRecordLine,
    optionWords: (value) => (/^[A-Z_]+$/.test(value) ? industryWords(value) : value),
  };
}
