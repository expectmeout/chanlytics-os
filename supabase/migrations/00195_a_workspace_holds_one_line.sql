-- 00195 · A workspace holds one line.
--
-- One line per workspace in v1, and only the door said so: op:"buy" read the
-- workspace's lines, refused line_exists beside one being set up or
-- answering, line_failed_retry beside one that failed, and inserted. Two buys
-- in the same second both read nothing and both inserted; each queued its own
-- saga, and each saga bought its own number: two lines for one workspace, two
-- bills, one of them on no page. The only unique index was the number's
-- (lines_e164_live_idx, 00066), never the workspace's.
--
-- The rule is the database's now: a workspace holds at most one line that is
-- being set up or answers. The insert that loses the race fails on this index
-- (23505) and the door answers it as line_exists with the line that stands --
-- before a saga is queued for it, and before the carrier hears of it. A
-- retry's compare-and-swap (failed -> provisioning) is judged by the same
-- index, so a retry beside a live line is refused too.
--
-- A failed line is left out on purpose: it is retried in place (00097, 00106)
-- and the door keeps refusing a buy beside it (line_failed_retry); released,
-- the row is deleted (00106). The forwarded row a workspace keeps (00067,
-- 00173) stays at voice_state none and is not counted.

create unique index if not exists lines_one_live_per_tenant_idx
  on public.lines (tenant_id)
  where voice_state in ('provisioning', 'answering');
comment on index public.lines_one_live_per_tenant_idx is
  'One line per workspace: at most one row being set up or answering per tenant. The buy door answers its 23505 as line_exists with the line that stands.';
