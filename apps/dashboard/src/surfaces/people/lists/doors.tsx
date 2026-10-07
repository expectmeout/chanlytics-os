/**
 * A list's acts, one door each, for a desktop's title line and the phone's sheet alike (moved whole from
 * legacy/pages/people.jsx, decision 0015): what the door answered, and the sentence to show where it refused. Rename and
 * delete were written into their two components, and a list made with people on it into two more (Save these, the bulk
 * bar's New list); the phone's sheet would have been a fifth copy. Somebody the business meets before they ever write
 * or call is added the same way, the desktop's form and the phone's sheet alike.
 */
import type { ListRule } from "@chanlytics/contracts";
import { refusalToast } from "../../legacy-verbs";
import { addPerson } from "../people-detail";
import { lists } from "../people-lists";
import { plMadeId } from "../words";
import type { Flash } from "../types";

export async function plRenameList(
  list: { id: string },
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await lists.rename(list.id, name);
  return r.ok ? { ok: true } : { ok: false, error: r.message || "Could not rename the list." };
}

/** What a delete answered when it took: whether it archived instead, what paused, and what reads the list. */
export interface DeleteAnswer {
  ok: true;
  archived: boolean;
  paused: string[];
  readBy: string[];
}

/**
 * Deleted, or archived (00169, decision 0009): a list a playbook runs on, or another list reads, is archived instead,
 * and the answer says what paused and what reads it, for the page to say.
 */
export async function plDeleteList(list: { id: string }): Promise<DeleteAnswer | { ok: false; error: string }> {
  const r = await lists.remove(list.id);
  if (!r.ok) return { ok: false, error: r.message || "The list could not be deleted." };
  const d = (r.data || {}) as { archived?: boolean; paused?: string[]; read_by?: string[] };
  return { ok: true, archived: !!d.archived, paused: d.paused || [], readBy: d.read_by || [] };
}

/** What the page says when a delete archived instead: why, what paused, and where it comes back from. */
export const plArchivedWords = (name: string, r: { paused: string[]; readBy: string[] }) => (
  <>
    <b>{name}</b>
    {" is archived, not deleted: "}
    {r.paused.length ? (
      <>{r.paused.join(", ")} paused</>
    ) : r.readBy.length ? (
      <>{r.readBy.join(", ")} reads it</>
    ) : (
      <>a playbook runs on it</>
    )}
    . It comes back from Archived under your lists.
  </>
);

type Filled = Awaited<ReturnType<typeof lists.add>> | { ok: false; message: string };
/** A list made and filled: the refusal's words where the make was refused, else what the fill answered and the list's id. */
type ListWith = { ok: false; message: string } | { ok: true; filled: Filled; id: string | null };

/**
 * Made, then filled. A list whose filling the server refused (more people than it takes at once, say) is taken back, so
 * no empty list is left behind.
 */
export async function plMakeListWith(name: string, ids: string[]): Promise<ListWith> {
  const made = await lists.create(name);
  if (!made.ok) return { ok: false, message: made.message };
  const id = plMadeId(made, name);
  const filled = id
    ? await lists.add(id, ids)
    : ({ ok: false, message: "The list was made but not found again." } as const);
  if (!filled.ok && id) await lists.remove(id);
  return { ok: true, filled, id };
}

/** Undoing a list made with its people deletes the list; the people stay. */
export const plUndoList = async (id: string | null, name: string, flash: Flash): Promise<void> => {
  // A list made and filled has its id (a fill that had none did not go): there is nothing to take back without one.
  if (id === null) return;
  const u = await lists.remove(id);
  if (!u.ok) flash(refusalToast(u, `${name} is still there`));
};

/**
 * Everyone shown, kept as a list by hand -- a filter frozen into something a broadcast can reach later. A view with a
 * rule behind it -- one of People's lists, a smart list, Needs you -- is kept as a list that keeps itself current by
 * default (decision 0009): with one of People's open, that is the copy an owner then changes.
 */
export async function plMakeRuleList(
  name: string,
  rule: ListRule,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const made = await lists.create(name, rule);
  return made.ok
    ? { ok: true, id: plMadeId(made, name) }
    : { ok: false, error: made.message || "Could not make the list." };
}
export const plRuleMadeWords = (name: string) => (
  <>
    <b>{name}</b> made. It keeps itself current — change who is on it any time.
  </>
);

/**
 * Somebody the business meets before they ever write or call, added by hand through the door the calendar sweep uses: a
 * number already here opens that person rather than making a second one.
 */
export async function plAddPerson({
  name,
  phone,
}: {
  name: string;
  phone: string;
}): Promise<{ ok: true; id: string; existed: boolean } | { ok: false; error: string }> {
  const r = await addPerson({ phone: phone.trim(), ...(name.trim() ? { name: name.trim() } : {}) });
  if (r.ok) return { ok: true, id: r.data.contact_id, existed: !!r.data.existed };
  // The field's own sentence where the route named one, else the refusal's.
  return { ok: false, error: (r.fields && Object.values(r.fields)[0]) || r.message || "Could not add them." };
}
export const plAddedWords = ({ name, phone }: { name: string; phone: string }, existed: boolean) =>
  existed ? (
    <>
      <b>{name.trim() || phone.trim()}</b> was already here — opened
    </>
  ) : (
    <>
      <b>{name.trim() || phone.trim()}</b> added
    </>
  );
