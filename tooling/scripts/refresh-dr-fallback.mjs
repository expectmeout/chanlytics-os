/**
 * Print the disaster-recovery fallback, as the values an operator sets.
 *
 * WHAT THE FALLBACK IS. `apps/edge/lib/tenant-fallback.ts` is what the
 * receptionist answers with when the control plane cannot be READ, for the
 * env-default tenant alone. It has to hold that workspace's words while the
 * database holding them is the thing that is down.
 *
 * WHY THIS NO LONGER WRITES A FILE. It used to rewrite a TypeScript literal:
 * the workspace's name, its booking link, its greeting, the number it
 * publishes and its owner's address, checked into git, where every
 * contributor and every clone carried them and a golden test existed only to
 * keep the copy in step. The profile is configuration, so it now lives in the
 * environment of the deployment that answers for that customer, beside the
 * credentials it has always sat next to. This script reads the row and prints
 * the three values to set. It WRITES NOTHING — no file, no backup, no
 * --apply — so there is nothing to review but the paste.
 *
 *   node tooling/scripts/refresh-dr-fallback.mjs
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment, plus
 * DR_TENANT_ID (the env-default tenant: the one whose WhatsApp channel carries
 * WHATSAPP_PHONE_ID, and the only tenant allowed to fall back at all) -- or, on
 * a laptop that holds no key, --from <file>: the tenant_config row as JSON
 * ({ config, version, updated_at }), which the CLI's linked read produces
 * without one:
 *
 *   npx supabase db query --linked "select row_to_json(r) from (select config, version, updated_at from tenant_config where tenant_id = '<id>') r"
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseTenantConfigResult } from "@chanlytics/contracts";

const FROM = (() => { const i = process.argv.indexOf("--from"); return i >= 0 ? process.argv[i + 1] : null; })();
const TENANT = process.env.DR_TENANT_ID;
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!FROM && (!URL_ || !KEY)) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to read the live config, or --from <file> holding the row.");
  process.exit(1);
}
if (!FROM && !TENANT) {
  console.error("DR_TENANT_ID is needed: the env-default tenant, whose WhatsApp channel carries WHATSAPP_PHONE_ID. No workspace is named in this repository.");
  process.exit(1);
}

const { data, error } = FROM
  ? { data: JSON.parse(fs.readFileSync(FROM, "utf8")), error: null }
  : await createClient(URL_, KEY, { auth: { persistSession: false } }).from("tenant_config").select("config, version, updated_at").eq("tenant_id", TENANT).single();
if (error) { console.error(`reading the live config: ${error.message}`); process.exit(1); }

const brain = data.config?.brain;
if (!brain) { console.error("that tenant has no brain config; there is nothing for the receptionist to fall back to."); process.exit(1); }

// The SAME door the edge reads the variable through (tenant-fallback.ts, which
// parses it with parseTenantConfigResult exactly as tenant-runtime.ts parses
// the stored row). A value printed here that the edge would refuse is a
// fallback that silently becomes the neutral default at the worst moment, so
// it is refused here instead, naming the field.
const parsed = parseTenantConfigResult({ brain });
if (!parsed.ok) {
  console.error("the stored brain does not parse, so the edge would refuse it too:");
  for (const issue of parsed.issues.slice(0, 10)) console.error(`  ${issue}`);
  process.exit(1);
}

const notifications = data.config?.notifications ?? {};
const emails = Array.isArray(notifications.escalation_emails) ? notifications.escalation_emails : [];

console.log(`Set these three variables in the chanlytics-messaging Vercel project's environment (Production
scope, the same place WHATSAPP_PHONE_ID and RESEND_API_KEY live), then REDEPLOY: the edge reads
them once at module load, so an env change alone does not reach a running deployment. Until they
are set, the env-default tenant's disaster-recovery answer is the neutral built-in one — it names
no business, quotes no link and no number, and says a person will follow up. This script writes
nothing: there is no file to commit and no backup to delete.
`);

console.log(`live config     v${data.version ?? "?"}, updated ${String(data.updated_at ?? "").slice(0, 16)}`);
console.log(`business        ${brain.business_name}`);
console.log(`phone_display   ${brain.phone_display == null ? "(absent — follows the provisioned line)" : JSON.stringify(brain.phone_display)}`);
console.log(`system_prompt   ${brain.system_prompt.length} characters`);
console.log("");

// One line each, JSON as compact as it goes: these are pasted into a form
// field, and a pretty-printed prompt would arrive with its newlines mangled.
console.log(`DR_FALLBACK_BRAIN_JSON=${JSON.stringify(brain)}`);
console.log(`DR_FALLBACK_ESCALATION_EMAILS=${emails.join(",")}`);
console.log(`DR_FALLBACK_FROM=${notifications.from ?? ""}`);
console.log("");
if (!emails.length) console.log("NOTE: this workspace configures no escalation_emails. Left empty, notices fall to the platform's own LEAD_TO.");
if (!notifications.from) console.log("NOTE: this workspace configures no notifications.from. Left empty, notices leave from LEAD_FROM.");
