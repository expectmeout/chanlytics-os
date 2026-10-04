/**
 * The package's entry for the schemas a page loads only when it needs one (`@chanlytics/contracts/write-rules`): the
 * save's own rules for a workspace's config, which the Business tab judges a fold's draft by, and the waitlist's.
 *
 * The browser's entry (browser.generated.ts) carries no classic zod, so a page that reads a word or a limit loads
 * none of it (decision 0024). These two are written in zod's classic API and are the server's rules too, so the page
 * asks for them by import() when it will judge a draft, and the 89 KB arrives then, never with the page.
 */
// First, before any schema below is built: zod-config.ts says why the order matters.
import "./zod-config";
export { TenantConfigWriteSchema } from "./config/workspace-config/config-schema";
export { SignupSchema } from "./workspace/signup-schema";
