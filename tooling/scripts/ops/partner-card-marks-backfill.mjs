/**
 * Keep the card mark of every subscription that started before 00203 (prod-script bar): dry-run DEFAULT, a JSONL
 * backup of every planned row before any write, idempotent, --apply to execute.
 *
 * The partner sweep (0012, 00203) holds a workspace for review when the card that pays for it also pays for a
 * workspace the partner owns. It reads billing_card_marks, which the Stripe webhook writes as each subscription is
 * applied, so a subscription that started before 00203 and has not changed since has no mark, and the check cannot
 * see it: a partner's own older workspace, paying yearly, and a "business" they bring on the same card would pass.
 * This reads each such subscription from Stripe, with its default payment method, and writes the mark through the
 * same door the webhook uses (billing_card_mark) and the same fingerprint (cardFingerprintOf). A second apply finds
 * only the subscriptions whose card Stripe does not say.
 *
 * --rejudge (with --apply) also puts every workspace the sweep judged qualified back to be judged again, so the
 * check runs once with the marks in place. Only the sweep's own decisions (standing_by null): a person's stays.
 * Shares already payable or paid are not touched; a workspace judged again is held for review, or qualified again.
 *
 * Needs 00203 applied: it checks for billing_card_marks first and stops without it.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
 * Usage:
 *   node --import tsx tooling/scripts/ops/partner-card-marks-backfill.mjs
 *   node --import tsx tooling/scripts/ops/partner-card-marks-backfill.mjs --apply
 *   node --import tsx tooling/scripts/ops/partner-card-marks-backfill.mjs --apply --rejudge
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cardFingerprintOf } from "../../../apps/edge/lib/partners/earnings.ts";

/** The subscriptions to mark: a subscription to read, and no mark kept for its workspace yet. */
export function planCardMarks(accounts, markedTenantIds) {
  const marked = new Set(markedTenantIds);
  return accounts
    .filter((a) => a.stripe_subscription_id && !marked.has(a.tenant_id))
    .map((a) => ({ tenant_id: a.tenant_id, subscription: a.stripe_subscription_id }));
}

/** Each planned subscription's card, as Stripe fingerprints it; a read that fails, or says no card, is said. */
export async function readFingerprints(plan, retrieve) {
  const found = [];
  const missed = [];
  for (const p of plan) {
    try {
      const sub = await retrieve(p.subscription);
      const fingerprint = cardFingerprintOf(sub);
      if (fingerprint) found.push({ ...p, fingerprint });
      else missed.push({ ...p, why: "Stripe says no card on its default payment method" });
    } catch (e) {
      missed.push({ ...p, why: `read: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return { found, missed };
}

/** The apply's write, through the webhook's own door; counted. */
export async function writeCardMarks(db, found) {
  const written = [];
  const skipped = [];
  for (const f of found) {
    const { error } = await db.rpc("billing_card_mark", { p_tenant_id: f.tenant_id, p_fingerprint: f.fingerprint });
    if (error) skipped.push({ tenant_id: f.tenant_id, why: `write: ${error.message}` });
    else written.push(f);
  }
  return { written, skipped };
}

/** The sweep's own qualified decisions, back to be judged: guarded on the state they were read in, and counted. */
export async function rejudge(db, links) {
  const again = [];
  for (const l of links) {
    const { data, error } = await db
      .from("partner_tenants")
      .update({ standing: null, standing_why: null, standing_at: null, checks: {} })
      .eq("tenant_id", l.tenant_id)
      .eq("standing", "qualified")
      .is("standing_by", null)
      .select("tenant_id");
    if (!error && data?.length) again.push(l.tenant_id);
  }
  return again;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.STRIPE_SECRET_KEY) {
    console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STRIPE_SECRET_KEY required");
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const again = process.argv.includes("--rejudge");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const table = await db.from("billing_card_marks").select("tenant_id").limit(1);
  if (table.error) {
    console.error(`00203 is not applied here: ${table.error.message}`);
    process.exit(1);
  }

  const accounts = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("billing_accounts")
      .select("tenant_id, stripe_subscription_id")
      .not("stripe_subscription_id", "is", null)
      .order("tenant_id", { ascending: true })
      .range(from, from + 499);
    if (error) {
      console.error(`read billing_accounts: ${error.message}`);
      process.exit(1);
    }
    accounts.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const marks = await db.from("billing_card_marks").select("tenant_id");
  if (marks.error) {
    console.error(`read billing_card_marks: ${marks.error.message}`);
    process.exit(1);
  }
  const plan = planCardMarks(
    accounts,
    (marks.data ?? []).map((m) => m.tenant_id),
  );
  const judged = again
    ? ((
        await db
          .from("partner_tenants")
          .select("tenant_id, partner_id, standing, standing_at, checks")
          .eq("standing", "qualified")
          .is("standing_by", null)
      ).data ?? [])
    : [];
  console.log(`${plan.length} subscriptions with no card mark.${again ? ` ${judged.length} to judge again.` : ""}`);
  if (!plan.length && !judged.length) return;

  const { stripe } = await import("../../../apps/edge/lib/billing/billing.ts");
  const s = stripe();
  if (!s) {
    console.error("Stripe is not configured (STRIPE_SECRET_KEY).");
    process.exit(2);
  }
  const retrieve = (id) => s.subscriptions.retrieve(id, { expand: ["default_payment_method"] });
  const { found, missed } = await readFingerprints(plan, retrieve);

  if (!apply) {
    for (const f of found) console.log(`  ${f.tenant_id}  ${f.subscription}  would be marked`);
    for (const m of missed) console.log(`  ${m.tenant_id}  ${m.subscription}  ${m.why}`);
    console.log(`\n${found.length} of ${plan.length} would be marked. Dry run only: nothing was written.`);
    console.log("Re-run with --apply to execute (and --rejudge to judge the sweep's qualified workspaces again).");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `partner-card-marks-backfill-${stamp}.jsonl`);
  writeFileSync(
    backupPath,
    [...found.map((f) => ({ mark: f })), ...judged.map((j) => ({ standing: j }))]
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n",
  );
  console.log(`backup: ${found.length} marks and ${judged.length} standings -> ${backupPath}`);

  const { written, skipped } = await writeCardMarks(db, found);
  for (const w of written) console.log(`  marked ${w.tenant_id}`);
  for (const k of skipped) console.log(`  skipped ${k.tenant_id}  ${k.why}`);
  const rejudged = again ? await rejudge(db, judged) : [];
  console.log(
    `\n${written.length} marked, ${skipped.length} skipped, ${missed.length} with no card Stripe would say.${again ? ` ${rejudged.length} back to be judged by tonight's sweep.` : ""}`,
  );
  if (skipped.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
