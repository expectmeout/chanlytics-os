/**
 * A change in place is a patch, typed as its columns are (contracts PlaybookPatch): what checkPlaybookPatch answers it
 * sets and what each field held are that type and no looser, and the row it is judged against holds a state that is
 * running or paused, so a value of another type can never ride through as a field of the patch. Its answer once rode on
 * an untyped record, which a state of 5 passed.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts), and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * package's `tsc --noEmit` fails. Nothing imports this file, so no build reaches it.
 */
import type { Exactly, Holds, PlaybookPatch, PlaybookState, Within } from "@chanlytics/contracts";
import type { PlaybookPatchRow, checkPlaybookPatch } from "./check-playbook";

/** What a change answers: the fields it sets, and what each of them held. */
type Judged = Awaited<ReturnType<typeof checkPlaybookPatch>>;

/** A row read as the database's types read it, its state a bare string. */
type Unchecked = Omit<PlaybookPatchRow, "state"> & { state: string };

type _Patch = [
  Holds<Exactly<Judged["set"], PlaybookPatch>>,
  Holds<Exactly<Judged["was"], PlaybookPatch>>,
  Holds<Exactly<PlaybookPatchRow["state"], PlaybookState>>,
  // @ts-expect-error a state of another type is no field of a patch
  Holds<Within<{ state: number }, PlaybookPatch>>,
  // @ts-expect-error a row whose state is any string is not judged until its state is checked
  Holds<Within<Unchecked, PlaybookPatchRow>>,
];
