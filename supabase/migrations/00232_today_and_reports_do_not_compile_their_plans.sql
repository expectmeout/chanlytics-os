-- 00232 · Today's and Reports' reads do not compile their plans.
--
-- metrics_summary (Today), report_series and campaign_series (Reports), and
-- first_replies, which the first two call, run plans whose estimated cost is
-- past jit_above_cost (100,000 by default). A SQL function's statements are
-- planned without the values it is called with, so first_replies' estimates
-- come from the whole platform's messages, and the others carry it. Past that
-- cost Postgres compiles the plan's expressions to machine code before running
-- it, on every call, and here compiling costs far more than it saves. Modelled
-- on Postgres 16 with JIT, its default, for a workspace of 10,050 people
-- beside twenty of 1,000:
--
--   metrics_summary, the day           2,609 ms with JIT     198 ms without
--   metrics_summary, 1,000 people      1,219 ms               43 ms
--   report_series, 30 days             4,320 ms              143 ms
--   first_replies, 30 days, 1,000      1,355 ms               18 ms
--   campaign_series, 30 days             224 ms               84 ms
--
-- Because the estimate is the platform's, so is the cost: once the platform is
-- large enough, the smallest workspace pays it on every read of Today. Each
-- function now runs with jit off. A function's `set` holds for every statement
-- it runs, cached or not, and for the functions it calls.
--
-- Whether production compiles today depends on its Postgres having the JIT
-- provider and on its setting (select pg_jit_available()); where it does not,
-- this changes nothing. #1226 (00223, 00224) and #1249 (00231) recreate these
-- functions with the same setting, so it holds whichever file is applied last.
--
-- Re-runnable: `alter function ... set` replaces the setting.

alter function public.metrics_summary(uuid, integer) set jit = off;
alter function public.report_series(uuid, integer) set jit = off;
alter function public.campaign_series(uuid, integer) set jit = off;
alter function public.first_replies(uuid, timestamptz) set jit = off;
