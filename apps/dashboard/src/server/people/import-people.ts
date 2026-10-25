import "server-only";
import { z } from "zod";
import { afterPersonRefused, normalizeEmail, normalizePhone, whyNotAPhone, whyNotAnEmail } from "@chanlytics/contracts";
import { importPerson, noteImport, personBeforeNote } from "@chanlytics/db";
import { recordDecision } from "../verbs";
import { log } from "../log";
import type { RouteContext } from "../with-route";

/**
 * A part of a business's own client list, brought in (POST contacts/import): each line through `import_person`, what a
 * client file says of the person beyond that through `person_before_note` (decision 0073, R22), one decision per part,
 * and the record of what was brought in (decision 0073, R23) where the page said which part it is.
 */

/** What a client file says of a person beyond who they are (contracts csv.ts ImportFacts), as the door takes it. */
const Facts = z
  .object({
    last_visit: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    visits: z.number().int().min(0).max(999_999).optional(),
    birthday: z
      .string()
      .regex(/^(\d{4}|-)-\d{2}-\d{2}$/)
      .optional(),
    notes: z.string().min(1).max(600).optional(),
  })
  .strict();

const Row = z.object({
  name: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(320).optional(),
  facts: Facts.optional(),
});

export const ImportBody = z.object({
  /** One id for the whole file, so the ledger's parts read as one import. */
  import_id: z.uuid(),
  rows: z.array(Row).min(1, "Nothing to import.").max(50, "Fifty at a time."),
  /** Which part of the file this is (decision 0073, R23): the record of what was brought in counts the file once. */
  part: z.object({ n: z.number().int().min(1), of: z.number().int().min(1) }).optional(),
  /** The tool the file came from, as the ledger and each person's "before" say it: vagaro, booksy. */
  via: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,39}$/)
    .optional(),
});
type ImportInput = z.infer<typeof ImportBody>;

/** The door's refusal of a person who asked to be forgotten (import_person, 00170): this row's own, so skipped like
 *  22023. Never 42501: PostgREST says that when the grant is gone, a fault in every row, which stops the part. */
const ERASED = "PE001";

interface ImportOut {
  added: number;
  existed: number;
  emails_set: number;
  skipped: { line: number; reason: string }[];
  failed: { line: number; message: string }[];
  stopped: boolean;
}

/** What the file says of a person beyond who they are: kept where nothing is. A refusal keeps the person, said in the log. */
async function keepBefore(
  ctx: RouteContext,
  tenantId: string,
  input: ImportInput,
  contactId: string,
  facts: z.infer<typeof Facts>,
): Promise<void> {
  const { notes, ...dates } = facts;
  try {
    await personBeforeNote(
      ctx.supabase,
      tenantId,
      contactId,
      { ...dates, ...(input.via ? { via: input.via } : {}) },
      notes ?? null,
    );
  } catch (e) {
    log.error("import_decision_failed", {
      tenant_id: tenantId,
      import_id: input.import_id,
      step: "before",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * The record of what was brought in (decision 0073, R23), one part at a time: the first part sets the counts, each part
 * after adds to them, and the last says done. A part that stopped says the file stopped. Never a refusal of the rows:
 * they are on file by now, and a ledger that will not take the note is said in the log.
 */
async function noteThePart(ctx: RouteContext, tenantId: string, input: ImportInput, out: ImportOut): Promise<void> {
  if (!input.part) return;
  const { n, of } = input.part;
  try {
    await noteImport(ctx.supabase, {
      tenantId,
      source: "clients_file",
      state: out.stopped ? "failed" : n >= of ? "done" : "running",
      counts: { people: out.added + out.existed, unreadable: out.skipped.length },
      add: n > 1,
      partsDone: n,
      partsTotal: of,
      via: input.via ?? null,
      error: out.stopped ? (out.failed[out.failed.length - 1]?.message ?? "The import stopped.") : null,
    });
  } catch (e) {
    log.error("import_decision_failed", {
      tenant_id: tenantId,
      import_id: input.import_id,
      step: "ledger",
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** One line through the door: added, found, or the reason it was skipped; a fault the door raises for every row stops the part. */
async function importLine(
  ctx: RouteContext,
  tenantId: string,
  input: ImportInput,
  r: z.infer<typeof Row>,
  line: number,
  out: ImportOut,
): Promise<void> {
  const phone = normalizePhone(r.phone ?? null);
  const email = normalizeEmail(r.email ?? null);
  if (!phone && !email) {
    const said = r.phone?.trim() ? whyNotAPhone(r.phone) : r.email?.trim() ? whyNotAnEmail(r.email) : null;
    out.skipped.push({ line, reason: said ?? "No number and no address." });
    return;
  }
  // What the row does not have is sent as empty, which the door reads as none: database.types.ts types the name, the
  // number and the address as strings, as it does set_person_email's address. No digest is sent: the door makes its own
  // (00263), since only the database holds the pepper. The name is not cut here: the door keeps its first 80
  // characters, and a cut by code unit could split an emoji in half (csv.ts says the same of the reader).
  const person = await importPerson(ctx.supabase, tenantId, { name: (r.name ?? "").trim(), phone, email });
  if (!person.ok) {
    if (afterPersonRefused(person.code) === "skip" || person.code === ERASED) {
      out.skipped.push({ line, reason: person.message });
      return;
    }
    out.failed.push({ line, message: person.message });
    out.stopped = true;
    return;
  }
  const { made } = person;
  if (made.existed) out.existed += 1;
  else out.added += 1;
  if (made.email === "set") out.emails_set += 1;
  if (r.facts) await keepBefore(ctx, tenantId, input, made.contact_id, r.facts);
}

/**
 * A part, brought in. A row the door refuses (22023, or PE001 for the erased) is skipped and said by its line in the
 * part, counted from 1; any other fault refuses every row and stops the part. One decision per part, subject the
 * workspace, with the counts and nothing that names a person; a decision the ledger will not take is logged, never
 * answered as a refusal of rows already on file.
 */
export async function importPeopleRows(ctx: RouteContext, tenantId: string, input: ImportInput): Promise<ImportOut> {
  const out: ImportOut = { added: 0, existed: 0, emails_set: 0, skipped: [], failed: [], stopped: false };
  for (const [i, r] of input.rows.entries()) {
    await importLine(ctx, tenantId, input, r, i + 1, out);
    if (out.stopped) break;
  }
  // The rows are the act; the decision is its record. Every row above went through import_person and is on file by
  // now, each in its own commit, so a decision the ledger will not take -- a lock timeout, a CHECK on decisions that a
  // migration has not widened yet -- must not come back as a refusal: with-route would turn the throw into a 500, the
  // sheet would draw a refusal and refresh nothing, and the owner would be told that people who are on file were
  // refused. The counts answer as they are; the failed record is said in the log, with the counts, and never a name.
  try {
    await recordDecision(ctx, tenantId, "workspace", tenantId, "import", {
      import_id: input.import_id,
      rows: input.rows.length,
      added: out.added,
      existed: out.existed,
      emails_set: out.emails_set,
      skipped: out.skipped.length,
      failed: out.failed.length,
    });
  } catch (e) {
    log.error("import_decision_failed", {
      tenant_id: tenantId,
      import_id: input.import_id,
      added: out.added,
      existed: out.existed,
      skipped: out.skipped.length,
      failed: out.failed.length,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  await noteThePart(ctx, tenantId, input, out);
  return out;
}
