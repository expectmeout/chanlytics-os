/**
 * The owner's own words about a person (PUT /api/v1/contacts/:id/details): what to call them, the notes the
 * receptionist reads before it answers them, the address they can be written to, and the proposal the receptionist
 * sends them when they ask about price (00154): a web address, never a file, its figures never stated. Through four
 * definer doors that each record an event, so the profile can say who changed what. The route declares who may (owner
 * or operator, where the person lives: contactScope) and how often.
 *
 * Every field is judged before anything is read or written: the address by the one normalizer (normalizeEmail), so
 * the refusal names which kind of not-an-address it was, and the proposal link the same way (normalizeLink). The doors
 * hold the stored shapes and the one-address-per-workspace rule (00125), and a door's refusal for a second person with
 * the same address is already in the owner's words.
 *
 * The address goes first. Each door commits on its own, and the address's is the one that refuses in practice
 * (another person here has it): asked with a name beside it (an Ask details card), a refusal leaves the name as it
 * was rather than half the change made. The name is cut to its door's 80, so that door does not refuse.
 *
 * The answer says what the name and the address held before this write (`was`), each only where this request changed
 * it: an undo puts back what was there at the write, never what a card read when it was proposed.
 */
import { z } from "zod";
import { AppError, normalizeEmail, normalizeLink, whyNotALink, whyNotAnEmail } from "@chanlytics/contracts";
import { personRow } from "@chanlytics/db";
import type { contactScope } from "@/server/verbs";
import { dbRefusal, type RouteContext } from "@/server/with-route";

/** Any field alone; an empty string clears it. */
export const PersonDetailsChange = z
  .object({
    name: z.string().optional(),
    notes: z.string().optional(),
    email: z.string().max(320).optional(),
    proposal: z.string().max(600).optional(),
  })
  .refine(
    (b) => b.name !== undefined || b.notes !== undefined || b.email !== undefined || b.proposal !== undefined,
    "Send a name, notes, an email address or a proposal link.",
  );

/** The person a contactScope route acts on, as the scope read them. */
type ContactRow = Awaited<ReturnType<typeof contactScope.load>>;

interface PersonDetailsAnswer {
  contact_id: string;
  name?: string | null;
  notes?: string | null;
  email?: string | null;
  proposal_url?: string | null;
  /** What the name and the address held before this write, each only where this request changed it; empty is none. */
  was?: { name?: string; email?: string };
}

/** The address as it is stored, null to clear it; refused in the words of what kind of not-an-address it was. */
function emailToStore(typed: string): string | null {
  const email = typed ? normalizeEmail(typed) : null;
  if (typed && !email) throw new AppError("validation", whyNotAnEmail(typed) ?? "That is not an email address.");
  return email;
}

/** The proposal's web address as it is stored, null to clear it; refused in the words of why it is not one. */
function linkToStore(typed: string): string | null {
  const url = typed ? normalizeLink(typed) : null;
  if (typed && !url) throw new AppError("validation", whyNotALink(typed) ?? "That is not a web address.");
  return url;
}

/** What a door stored, by the field it answers with. 23505 is its own word for "another person here already has that address" (dbRefusal: a conflict). */
function whatTheDoorStored<F extends string>(
  answer: { data: unknown; error: Parameters<typeof dbRefusal>[0] | null },
  field: F,
): string | null {
  if (answer.error) throw dbRefusal(answer.error);
  return ((answer.data ?? {}) as Partial<Record<F, string | null>>)[field] ?? null;
}

export async function setPersonDetails(
  ctx: RouteContext,
  contact: ContactRow,
  input: z.infer<typeof PersonDetailsChange>,
): Promise<PersonDetailsAnswer> {
  const id = contact.id;
  const email = input.email === undefined ? undefined : emailToStore(input.email.trim());
  const proposal = input.proposal === undefined ? undefined : linkToStore(input.proposal.trim());
  const name = input.name?.trim().slice(0, 80);
  const notes = input.notes?.trim().slice(0, 600);
  const out: PersonDetailsAnswer = { contact_id: id };
  if (name !== undefined || email !== undefined) {
    // As the People list reads them, once, before the first door runs.
    const stood = await personRow(ctx.supabase, contact.tenant_id, id);
    if (stood)
      out.was = {
        ...(name !== undefined ? { name: stood.display_name ?? "" } : {}),
        ...(email !== undefined ? { email: stood.email ?? "" } : {}),
      };
  }
  // The session's doors, called on the client itself: a bound copy of its rpc made the compiler weigh every function's
  // overload at once, which 00497's doors took past its depth (TS2589).
  const db = ctx.supabase;
  if (email !== undefined)
    out.email = whatTheDoorStored(
      await db.rpc("set_person_email", { p_contact_id: id, p_email: email ?? "" }),
      "email",
    );
  if (name !== undefined)
    out.name = whatTheDoorStored(await db.rpc("set_person_name", { p_contact_id: id, p_name: name }), "name");
  if (notes !== undefined)
    out.notes = whatTheDoorStored(await db.rpc("set_person_notes", { p_contact_id: id, p_notes: notes }), "notes");
  if (proposal !== undefined)
    out.proposal_url = whatTheDoorStored(
      await db.rpc("set_person_proposal", { p_contact_id: id, p_url: proposal ?? "" }),
      "proposal_url",
    );
  return out;
}
