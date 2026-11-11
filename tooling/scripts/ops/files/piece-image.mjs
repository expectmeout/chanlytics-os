/**
 * Put the video template's machine image on record for its edition (prod-script bar): dry-run DEFAULT, a JSON backup of the
 * row it would replace before any write, idempotent, --apply to execute.
 *
 * A made video is drawn on a machine started from a saved image (tooling/video/README.md, decision 0122). `node image.mjs build`
 * there builds the image and prints its id and the hash of the template it holds. This writes that image to `piece_images`
 * under the template's edition (contracts PIECE_TEMPLATE), which is where the job that draws reads it (edge piece-make.ts).
 *
 * It refuses an image that was not built from the template this tree draws with: the storyboard a person agrees to is drawn
 * from this tree's numbers, and the video must be the one it showed. A dry run reads what is on record for the edition and
 * says what it would write; an apply writes the backup of the row it replaces, then the row. A second apply finds nothing to do.
 *
 * Needs 00613 applied: it reads the table first and stops without it.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage:
 *   node --import tsx tooling/scripts/ops/files/piece-image.mjs <snapshot id> <hash>
 *   node --import tsx tooling/scripts/ops/files/piece-image.mjs <snapshot id> <hash> --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PIECE_TEMPLATE } from "@chanlytics/contracts";
import { findPieceImage, keepPieceImage } from "@chanlytics/db/files";
import { templateHash } from "../../../video/template-hash.mjs";

/** An image's id as the machines' platform gives one. */
const IMAGE_ID = /^snap_[A-Za-z0-9]{8,100}$/;

/**
 * What recording an image would do. Refused, with what to do instead; or the row to write (null where that very image is on
 * record already) and the row it replaces. `tree` is the hash of the template as this checkout holds it.
 */
export function planImage(template, tree, given, current) {
  if (!IMAGE_ID.test(given.snapshotId ?? ""))
    return { ok: false, why: "name the image by its id, as `image.mjs build` printed it (snap_…)" };
  if (tree !== template.hash)
    return {
      ok: false,
      why: `the template in this tree hashes to ${tree} and PIECE_TEMPLATE says ${template.hash}: write the hash beside its edition first (tooling/video/README.md)`,
    };
  if (given.hash !== template.hash)
    return {
      ok: false,
      why: `that image holds template ${given.hash || "(no hash given)"}, and edition ${template.edition} is ${template.hash}: build the image from this tree`,
    };
  if (current && current.snapshot_id === given.snapshotId && current.hash === template.hash)
    return { ok: true, write: null, replaces: null };
  return {
    ok: true,
    write: { edition: template.edition, snapshotId: given.snapshotId, hash: template.hash },
    replaces: current ?? null,
  };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  const given = { snapshotId: args[0] ?? "", hash: args[1] ?? "" };
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let current;
  try {
    current = await findPieceImage(db, PIECE_TEMPLATE.edition);
  } catch (e) {
    console.error(`00613 is not applied here: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  console.log(
    current
      ? `on record for edition ${PIECE_TEMPLATE.edition}: ${current.snapshot_id} (template ${current.hash})`
      : `nothing on record for edition ${PIECE_TEMPLATE.edition}`,
  );
  const plan = planImage(PIECE_TEMPLATE, templateHash(), given, current);
  if (!plan.ok) {
    console.error(`refused: ${plan.why}`);
    process.exit(1);
  }
  if (!plan.write) {
    console.log("that image is on record already: nothing to write.");
    return;
  }
  console.log(`would write: edition ${plan.write.edition} -> ${plan.write.snapshotId} (template ${plan.write.hash})`);
  if (!apply) {
    console.log("Dry run only: nothing was written. Re-run with --apply to execute.");
    return;
  }

  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backups");
  mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `piece-image-${stamp}.json`);
  writeFileSync(
    backupPath,
    `${JSON.stringify({ edition: PIECE_TEMPLATE.edition, replaced: plan.replaces }, null, 2)}\n`,
  );
  console.log(`backup: the row replaced (${plan.replaces ? plan.replaces.snapshot_id : "none"}) -> ${backupPath}`);

  await keepPieceImage(db, plan.write);
  const kept = await findPieceImage(db, PIECE_TEMPLATE.edition);
  if (kept?.snapshot_id !== plan.write.snapshotId) {
    console.error("the row did not read back as written");
    process.exit(1);
  }
  console.log(`written: edition ${plan.write.edition} is drawn on ${kept.snapshot_id}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
