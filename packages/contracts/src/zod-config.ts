import { z } from "zod";

/**
 * No code from strings, anywhere -- and FIRST.
 *
 * zod 4 decides per object schema, at the moment the schema is BUILT, whether
 * to compile its parser with the Function constructor: `jit = !config.jitless`
 * is read inside `z.object()`. So this setting has to run before the first
 * schema in the graph is defined, and an ES module's imports are evaluated
 * before its own body -- a `z.config()` at the top of index.ts ran after every
 * schema it re-exports had already been built with jit on. This module is the
 * first import of index.ts, and the dashboard's instrumentation-client runs
 * the same line before any of its own code, so no zod instance ever probes
 * `Function("")` or compiles a parser from a string.
 *
 * Why it matters: under a Content-Security-Policy without 'unsafe-eval' the
 * probe and every compile are violations the browser reports -- six per page
 * in the nightly -- and under a report-only policy the probe does not throw,
 * so zod never falls back on its own. The interpreted parsers are the same
 * parsers; at this size the compiled path buys nothing.
 */
z.config({ jitless: true });
