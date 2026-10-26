/**
 * The edge's doors: every file under apps/edge/api is one, and answers the methods it exports. The tests that run every
 * door (edge/request-id-doors.test.mjs) and the one that pins who may knock on each (edge/doors/door-policy.test.mjs)
 * read this one list, so a door one of them knows the other knows too.
 */
import { repoFiles } from "../../_ast.mjs";

/** The handlers a door may export, each named for the method it answers. */
export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/**
 * Every file under apps/edge/api the repository has, as a repo-relative path, in order: one door each. The set is
 * `git ls-files`, as _ast.mjs reads it, so a checkout and a desk read the same doors: a door not yet added to git is
 * not one, and another session's untracked file is never pinned.
 */
export function doorFiles() {
  return repoFiles(["apps/edge/api"], { keep: /\.ts$/ }).sort();
}

/** The path a door answers at, as the platform routes its file (`apps/edge/api/admin/lines.ts`: `/api/admin/lines`). */
export const doorPath = (file) => file.replace(/^apps\/edge/, "").replace(/\.ts$/, "");
