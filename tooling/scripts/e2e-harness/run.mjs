/**
 * A signed-in Playwright spec, run locally against the harness rather than a deployment.
 *
 *   corepack pnpm e2e:local -- e2e/settings/settings-business.spec.ts
 *   corepack pnpm e2e:local -- e2e/settings/settings-business.spec.ts --scenario=salon
 *   corepack pnpm e2e:local -- e2e/settings/settings-business.spec.ts --scenario=salon --grep "fits a phone"
 *   corepack pnpm e2e:local -- e2e/kit/kit.spec.ts --scenario=kit
 *
 * It starts the harness on a FREE port (never a fixed one: a developer machine has its own servers, and a port
 * already taken would fail as something far stranger), sets the four environment variables e2e/session.ts needs so
 * `signIn()` mints its cookie against the harness, runs the REAL spec unmodified, and stops the server whatever the
 * run did. The keys are stand-ins: no key of any kind is needed, and nothing leaves the machine.
 *
 * Anything after the spec is passed to Playwright as it stands, so `--grep`, `--headed` and the rest work. Two
 * defaults, each overridable by passing the flag yourself:
 *   --timeout=120000  the harness compiles the legacy tree with Babel in the browser, which is slower than the built
 *                     bundle production serves, so a test needs longer here than the config's own 45s;
 *   --retries=0       the config retries once locally, which is right against a deployment over a network and wrong
 *                     here: a mutation run asks whether the journey WENT RED, and a retry that passes turns a caught
 *                     mutant into a flake. A failure on the harness should be a failure.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startHarness } from "./server.mjs";
import { OWNER, SCENARIOS } from "./scenarios.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PLAYWRIGHT = path.join(REPO, "node_modules/@playwright/test/cli.js");
const DEFAULT_SPEC = "e2e/settings/settings-business.spec.ts";

// `pnpm e2e:local -- <spec>` hands the `--` along with the rest; passed on to Playwright it ends its option parsing
// and the spec after it is read as nothing at all, so the WHOLE suite runs. It is pnpm's separator, not an argument.
const argv = process.argv.slice(2).filter((a) => a !== "--");
const scenarioArg = argv.find((a) => a.startsWith("--scenario="));
const name = scenarioArg ? scenarioArg.slice("--scenario=".length) : "nightly";
if (!SCENARIOS.includes(name)) {
  console.error(`no scenario "${name}": ${SCENARIOS.join(", ")}`);
  process.exit(2);
}
// Everything else goes to Playwright AS IT STANDS, in the order it was given: a flag and its own argument
// (`--grep "fits a phone"`) are two words, and taking them apart to sort them would drop the second.
const rest = argv.filter((a) => a !== scenarioArg);
const has = (flag) => rest.some((a) => a === flag || a.startsWith(`${flag}=`));
const spec = rest.some((a) => a.endsWith(".spec.ts")) ? [] : [DEFAULT_SPEC];

const harness = await startHarness({ name });
console.log(`the ${name} record on ${harness.url}`);

const run = spawn(
  process.execPath,
  [
    PLAYWRIGHT,
    "test",
    ...spec,
    ...(has("--retries") ? [] : ["--retries=0"]),
    ...(has("--timeout") ? [] : ["--timeout=120000"]),
    ...rest,
  ],
  {
    cwd: REPO,
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_BASE_URL: harness.url,
      // Which record the harness shows: a spec that only one record draws (e2e/kit/kit.spec.ts) skips on the others.
      E2E_SCENARIO: name,
      // signIn() reads these four; the harness answers the two auth calls it makes with them, and checks neither.
      NEXT_PUBLIC_SUPABASE_URL: harness.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "harness-anon",
      SUPABASE_SERVICE_ROLE_KEY: "harness-not-a-key",
      E2E_USER_EMAIL: OWNER.email,
    },
  },
);

const code = await new Promise((resolve) => run.on("exit", (c, signal) => resolve(signal ? 1 : (c ?? 1))));
await harness.close();
process.exit(code);
