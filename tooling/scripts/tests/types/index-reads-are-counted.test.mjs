/**
 * Index reads the compiler lets pass may only fall, file by file.
 *
 * `noUncheckedIndexedAccess` types `rows[0]`, `table[key]` and a regex's `m[1]` as `T | undefined`, so a read that can
 * miss has to say what happens when it does. The strict base (tsconfig.base.json) turns it on; a project whose reads
 * are not guarded yet turns it off in its own tsconfig (core, contracts and the dashboard, on the day this landed:
 * the edge, db, channels, jobs and the phone app were guarded that day). Each project that waits is compiled here with
 * the flag on, and every error it would raise is held per file against baselines/unchecked-index.json, by the rule
 * every ratchet banks by (_ratchet.mjs): more in a file, or a file the baseline does not name, fails; fewer fails
 * until it is banked with `UPDATE_BASELINES=1`. The measure is UNCHECKED_INDEX, in _measures.mjs, where the register
 * (repo/debt-register.test.mjs) reads it too; every-tsconfig-extends-the-base.test.mjs holds that no project turns off
 * anything else.
 *
 * Its own file, as routes/wire-casing.test.mjs is: it builds three programs with the type checker, which the syntax
 * trees' ratchets (repo/code-health-ratchets.test.mjs) do not need.
 */
import { ratchet } from "../_ratchet.mjs";
import { UNCHECKED_INDEX } from "../_measures.mjs";

ratchet(UNCHECKED_INDEX);
