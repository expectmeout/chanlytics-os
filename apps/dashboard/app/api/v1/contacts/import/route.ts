import { z } from "zod";
import {
  afterPersonRefused,
  erasedEmailHash,
  erasedPhoneHash,
  normalizeEmail,
  normalizePhone,
  whyNotAPhone,
  whyNotAnEmail,
} from "@chanlytics/contracts";
import { workspace, write } from "@/server/route";
import { recordDecision } from "@/server/verbs";

const Row = z.object({
  name: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(320).optional(),
});
const Body = z.object({
  /** One id for the whole file, so the ledger's parts read as one import. */
  import_id: z.string().uuid(),
  rows: z.array(Row).min(1, "Nothing to import.").max(50, "Fifty at a time."),
});

/**
 * POST /api/v1/contacts/import -- { import_id, rows[≤50] }: a part of a business's own client list.
 *
 * Owner only, in its own bucket. Each row is normalised here on the one phone rule and the one email rule (the door
 * refuses the same things and says less), and the digests of the number and the address are computed here, keyed to
 * the workspace as the erasure keyed them, so the door can leave the erased erased. Each row then goes through
 * `import_person`: found by number then address, fills only what is empty, never a yes. A row the door refuses (22023,
 * or 42501 for the erased) is skipped and said by its line in the part, counted from 1; any other fault refuses every
 * row and stops the part. One decision per part, subject the workspace, with the counts and nothing that names a person.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "person_import",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const tenantId = member.tenantId;
    const out = {
      added: 0,
      existed: 0,
      emails_set: 0,
      skipped: [] as { line: number; reason: string }[],
      failed: [] as { line: number; message: string }[],
      stopped: false,
    };
    for (const [i, r] of input.rows.entries()) {
      const line = i + 1;
      const phone = normalizePhone(r.phone ?? null);
      const email = normalizeEmail(r.email ?? null);
      if (!phone && !email) {
        const said = r.phone?.trim() ? whyNotAPhone(r.phone) : r.email?.trim() ? whyNotAnEmail(r.email) : null;
        out.skipped.push({ line, reason: said ?? "No number and no address." });
        continue;
      }
      // What the row does not have is sent as empty, which the door reads as none: database.types.ts types the name,
      // the number and the address as strings, as it does set_person_email's address. A digest is sent only for what
      // the row has; left out, it is the door's default of none. The name is not cut here: the door keeps its first
      // 80 characters, and a cut by code unit could split an emoji in half (csv.ts says the same of the reader).
      const { data, error } = await ctx.supabase.rpc("import_person", {
        p_tenant_id: tenantId,
        p_name: (r.name ?? "").trim(),
        p_phone_e164: phone ?? "",
        p_email: email ?? "",
        p_phone_digest: phone ? await erasedPhoneHash(tenantId, phone) : undefined,
        p_email_digest: email ? await erasedEmailHash(tenantId, email) : undefined,
      });
      if (error) {
        if (afterPersonRefused(error.code) === "skip" || error.code === "42501") {
          out.skipped.push({ line, reason: error.message });
          continue;
        }
        out.failed.push({ line, message: error.message });
        out.stopped = true;
        break;
      }
      const made = data as { contact_id: string; existed: boolean; email: "set" | "kept" | "taken" | null };
      if (made.existed) out.existed += 1;
      else out.added += 1;
      if (made.email === "set") out.emails_set += 1;
    }
    await recordDecision(ctx, tenantId, "workspace", tenantId, "import", {
      import_id: input.import_id,
      rows: input.rows.length,
      added: out.added,
      existed: out.existed,
      emails_set: out.emails_set,
      skipped: out.skipped.length,
      failed: out.failed.length,
    });
    return out;
  },
});
