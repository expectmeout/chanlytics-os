/**
 * A partner's terms are written twice: the database sets them (partners.share_bp's default, 00202, and partner_earn's
 * hold, paid_at + 30 days, 00207), and contracts says them before there is a row (PARTNER_SHARE_BP_DEFAULT and
 * PARTNER_HOLD_DAYS, what the offer and the ledger's words read). Nothing held the two equal (defect 33). This reads the
 * live column's default and runs the live partner_earn on a partner made for it, and holds each to the constant the
 * built contracts exports.
 *
 * Everything runs inside one transaction through the CLI that never commits, so no other suite's sweep reads the
 * partner, the workspace or the share it makes. SUPABASE_CLI names the binary when `supabase` is not on PATH;
 * SUPABASE_WORKDIR points it at an isolated stack.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DAY_MS, PARTNER_HOLD_DAYS, PARTNER_SHARE_BP_DEFAULT } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a partner"
      : false;

/**
 * A transaction on this machine's database that never commits: `body` runs inside a DO block that ends by raising what
 * it put in `seen`, as hex, so nothing it made is ever seen by the suites beside this one.
 */
function rolledBack(declare, body) {
  const sql = `do $$ declare seen jsonb := '{}'; ${declare} begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", "--local", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

const PAID_AT = "2026-08-03T12:00:00Z";
const AMOUNT_CENTS = 10_000;

test(
  "a new partner's share and a share's hold are the terms contracts states: the column's default and partner_earn's",
  { skip },
  () => {
    const seen = rolledBack(
      `v_user uuid := gen_random_uuid();
       v_tenant uuid;
       v_partner public.partners;
       v_earned jsonb;
       v_row public.partner_earnings;`,
      `insert into auth.users (id, instance_id, aud, role, email)
         values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                 'terms-' || v_user || '@example.com');
       insert into public.tenants (name, slug) values ('Partner terms', 'partner-terms-' || v_user)
         returning id into v_tenant;
       -- No share named: the column's default is what a new partner account starts with.
       insert into public.partners (user_id, code) values (v_user, 'terms-' || substr(md5(v_user::text), 1, 10))
         returning * into v_partner;
       insert into public.partner_tenants (tenant_id, partner_id, code_used) values (v_tenant, v_partner.id, v_partner.code);
       v_earned := public.partner_earn(v_tenant, 'in_terms_' || v_user, 'evt_terms_' || v_user, ${AMOUNT_CENTS}, 'usd',
                                       '${PAID_AT}'::timestamptz);
       select * into v_row from public.partner_earnings where id = (v_earned->>'id')::uuid;
       seen := jsonb_build_object(
         'column_default', (select column_default from information_schema.columns
                             where table_schema = 'public' and table_name = 'partners' and column_name = 'share_bp'),
         'share_bp', v_partner.share_bp,
         'row_share_bp', v_row.share_bp,
         'earned_cents', v_row.earned_cents,
         'state', v_row.state,
         'paid_at', v_row.paid_at,
         'payable_at', v_row.payable_at);`,
    );
    assert.equal(Number(seen.column_default), PARTNER_SHARE_BP_DEFAULT, `the column's default: ${seen.column_default}`);
    assert.equal(seen.share_bp, PARTNER_SHARE_BP_DEFAULT, "and what a partner made without one starts with");
    assert.equal(seen.row_share_bp, PARTNER_SHARE_BP_DEFAULT, "the share partner_earn wrote is at it");
    assert.equal(seen.earned_cents, Math.floor((AMOUNT_CENTS * PARTNER_SHARE_BP_DEFAULT) / 10_000));
    assert.equal(seen.state, "held", "a share starts held");
    assert.equal(Date.parse(seen.paid_at), Date.parse(PAID_AT));
    const heldDays = (Date.parse(seen.payable_at) - Date.parse(seen.paid_at)) / DAY_MS;
    assert.equal(heldDays, PARTNER_HOLD_DAYS, `payable ${seen.payable_at}, paid ${seen.paid_at}`);
  },
);
