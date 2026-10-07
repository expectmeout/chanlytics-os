/**
 * Runs once when a server instance starts, before it answers a request (Next's instrumentation convention; never
 * during the build). One job: whether this instance's environment lets it serve.
 *
 * A production deployment missing what it cannot serve without (src/server/env.ts, REQUIRED_IN_PRODUCTION), or holding
 * one of those in a form nobody can read, logs one line, `env_invalid`, naming the variables and never their values,
 * and throws. Next rethrows what `register` throws, so the instance never serves: every request fails loudly at once,
 * rather than one feature at a time on the first use of a missing secret. A variable that is set and unreadable but not
 * required reads as unset everywhere and says so, `env_unreadable`, on any deployment. A preview or a laptop is never
 * refused.
 *
 * The Node.js runtime only: the dashboard has no Edge-runtime code, and the logger is Node's.
 */
import { bootProblems, env, isProduction, REQUIRED_IN_PRODUCTION } from "./src/server/env";

export async function register(): Promise<void> {
  if (env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./src/server/log");
  const problems = bootProblems();
  const required = new Set<string>(REQUIRED_IN_PRODUCTION);
  const unreadable = problems.malformed.filter((name) => !required.has(name));
  if (unreadable.length) log.warn("env_unreadable", { names: unreadable });
  if (!isProduction()) return;
  const blocking = [...problems.missing, ...problems.malformed.filter((name) => required.has(name))];
  if (!blocking.length) return;
  log.error("env_invalid", { missing: problems.missing, malformed: problems.malformed });
  throw new Error(`env_invalid: this production deployment cannot serve without ${blocking.join(", ")}`);
}
