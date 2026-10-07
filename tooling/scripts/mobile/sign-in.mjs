/**
 * Signs the phone app in as the e2e owner, the nightly's own account in its own workspace of made-up people, with no
 * password and no email: a session minted over the API as the Playwright suite mints one (e2e/session.ts), its cookies
 * set in the app's WebView through DevTools, and the page sent to the site's home, which opens the owner's workspace.
 * The app then sees a person signed in, exactly as after its email door.
 *
 *   node --env-file=apps/dashboard/.env.local --import tsx tooling/scripts/mobile/sign-in.mjs
 *
 * Needs E2E_USER_EMAIL beside the three keys e2e/session.ts reads, and a preview or development build (DevTools). An
 * app already signed in is left as it is. A sign-out anywhere signs the account out of every device (the site's
 * sign-out is global), and the nightly signs this one out, so a walk that finds the sign-in screen runs this again.
 */
import { pathToFileURL } from "node:url";
import { sessionCookies } from "../../../e2e/session.ts";
import { appPid, device, devtools, installed, onScreen, pagesNow, startApp, tap, waitFor } from "./device.mjs";

/** The sign-in screen's way to the email door: its words beside Apple's or Google's button, and alone. */
const EMAIL_DOOR = /^(Use your email instead|Sign in with your email)$/;
const IN_A_WORKSPACE = /\/w\/[^/#?]+/;
const LAUNCH_MS = 60_000;
const SIGN_IN_MS = 60_000;

/** Where the app stands: at the sign-in screen, or on a workspace's page (signed in), or neither yet. */
async function whereTheAppIs() {
  const [door] = onScreen(EMAIL_DOOR);
  if (door) return { door };
  const page = (await pagesNow()).find((p) => IN_A_WORKSPACE.test(p.url));
  return page ? { page } : null;
}

/** Signs the app in, when it is not already; answers the address of the workspace page it lands on. */
export async function signInTheApp() {
  device();
  if (!installed()) throw new Error("the app is not installed: install a preview APK (docs/runbook.md)");
  if (!appPid()) startApp();
  const at = await waitFor("the sign-in screen or a workspace's page", whereTheAppIs, LAUNCH_MS);
  if (at.page) return at.page.url;

  tap(at.door);
  const login = await waitFor(
    "the email door's page",
    async () => (await pagesNow()).find((p) => new URL(p.url).pathname === "/login") ?? null,
    LAUNCH_MS,
  );
  const origin = new URL(login.url).origin;
  const cookies = await sessionCookies(new URL(origin));
  const page = devtools(login.webSocketDebuggerUrl);
  try {
    // The jar is emptied first. A signed-out app still holds the session a sign-out elsewhere revoked, under the same
    // name but keyed apart from the new one, and after the next restart the page read the dead one: the app came back
    // signed out. A person's own sign-in replaces the old cookie; this one has to take it away.
    await page.send("Network.clearBrowserCookies");
    for (const cookie of cookies) await page.send("Network.setCookie", cookie);
    await page.send("Page.navigate", { url: `${origin}/` });
  } finally {
    page.close();
  }
  const signedIn = await waitFor(
    "a workspace's page, signed in",
    async () => (await pagesNow()).find((p) => IN_A_WORKSPACE.test(p.url)) ?? null,
    SIGN_IN_MS,
  );
  return signedIn.url;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(`signed in: ${await signInTheApp()}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
