import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { listEveryoneOnce, findOnePerson } from "@/server/people/people";
import { getTenantFacts } from "@/server/shared/tenant";
import { attachmentStream, dateTag, personLabel, safeName } from "@/server/shared/export-file";
import { BUNDLE_PAGE, personBundle, workspaceBundle, type BundleReaders } from "@/server/export/bundle";
import { personSections, workspaceSections } from "@/server/export/workspace-sections";
import { recordDecision } from "@/server/shared/verbs";
import { log } from "@/server/shared/log";
import { customerRecord } from "@/server/export/customer-record";

const Query = z.object({
  /**
   * One person's own copy, by their id (the wiring's second audit, R14 X5): "Download their records" on their page, for
   * when they ask what the business holds. Without it, the workspace's.
   */
  person: z.uuid().optional(),
});

/**
 * A large workspace's copy is minutes of reads: five, a budget of its own rather than the host's default, which could end a
 * copy part-way with the ledger already saying it was taken (the wiring's second audit, R14 X7).
 */
export const maxDuration = 300;

/**
 * GET /api/v1/export -- the workspace's own copy, as one JSON file: people, conversations with their messages and the
 * files customers sent, calls with their transcripts, the consent history, then a section for every other kind of record
 * (contracts EXPORT_OF), what each section counted and what the file does not hold. The privacy page has promised this
 * since it was written. Owners only, like the people CSV: it is the whole customer record. Read under the owner's own
 * session, page by page, and streamed, so a workspace of any size downloads without being held whole.
 *
 * GET /api/v1/export?person=<id> -- one person's own copy (R14 X5), the same file of them alone: their row, their
 * threads and the files they sent, their calls, every change to their answers, and the sections contracts
 * PERSON_EXPORT_SECTIONS names, each read for them, with what it leaves out of the workspace's and why. The owner's, as
 * the workspace's is: it is their whole record. The ledger says who took it, on their page and in the activity log.
 */
export const GET = read({
  scope: workspace,
  fresh: true,
  role: "owner",
  rate: "export",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const { supabase, userId } = ctx;
    const tenantId = member.tenantId;
    const person = input?.person;
    const { name, timezone } = await getTenantFacts(supabase, tenantId);
    const now = new Date();
    const opts = { workspaceId: tenantId, business: name, tz: timezone, exportedAt: now, page: BUNDLE_PAGE };
    if (person) {
      // Their row first: a person who is not in this workspace, or was erased or merged away, has no copy to take.
      const them = await findOnePerson(ctx, tenantId, person);
      if (!them) throw new AppError("not_found", "Person not found.");
      log.info("export.person", { user: userId, tenant_id: tenantId, person });
      // On the ledger before the first byte, on them: their page says who took a copy of their records, and when.
      await recordDecision(ctx, tenantId, "contact", person, "export", { what: "person" });
      return attachmentStream(
        `person-${safeName(personLabel(them))}-${dateTag(now, timezone)}.json`,
        personBundle(
          {
            ...customerRecord(ctx, tenantId, person),
            // Their row: the one page.
            people: () => [[them]],
            ...personSections(supabase, tenantId, person),
          },
          { ...opts, personId: person },
        ),
        "application/json",
      );
    }
    const readers: BundleReaders = {
      ...customerRecord(ctx, tenantId),
      // Paged: one people_list call is capped at 1000 in the database, and this
      // bundle is streamed precisely so a workspace of any size downloads whole.
      // Not by offset, as the other sections are: People's order moves as
      // someone writes, so each person is read exactly once (listEveryoneOnce).
      people: () => listEveryoneOnce(ctx, tenantId),
      ...workspaceSections(supabase, tenantId),
    };
    log.info("export.workspace", { user: userId, tenant_id: tenantId });
    // On the ledger before the first byte: the copy exists once this returns.
    await recordDecision(ctx, tenantId, "workspace", tenantId, "export", { what: "workspace" });
    return attachmentStream(
      `workspace-${safeName(name)}-${dateTag(now, timezone)}.json`,
      workspaceBundle(readers, opts),
      "application/json",
    );
  },
});
