/** Where this browser keeps the workspace it last used (bridge/workspace.ts), which the home sends a tab on to. */
export const LAST_WORKSPACE_STORAGE = "chanlytics.workspace";

/**
 * The home sends a tab on to the workspace this browser last used before anything of the app has run. A phone's installed app
 * opens at the home (app/manifest.ts `start_url`), and this waited for the frame's whole code to come and run, only to leave it
 * as a new document that loaded it again: Today drawn at 3.8 s from the home against 2.4 s from its own address, at a phone's
 * pace (production, 6 Nov 2026), which no page's measure counts, since each starts with its own document. A browser that remembers none (a first
 * sign-in, a cleared browser), and an address with anything after it, are still the home's to work out (FrameHost).
 * home-boot.test.mjs holds it to `homeHref`'s own answer.
 */
export function homeBootScript(): string {
  return [
    'try{if(location.pathname==="/"&&!location.search&&!location.hash){',
    `var l=localStorage.getItem(${JSON.stringify(LAST_WORKSPACE_STORAGE)});`,
    'if(l)location.replace("/w/"+encodeURIComponent(l))}}catch(e){}',
  ].join("");
}
