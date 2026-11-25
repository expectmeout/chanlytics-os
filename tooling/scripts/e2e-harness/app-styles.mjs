/**
 * The app's faces and stylesheets, as a page outside the app links them: the kit's gallery, the page that runs the kit's
 * components and Ask's states (kit-gallery.mjs), each served by the harness (server.mjs). The app names its faces through
 * next/font (app/layout.tsx) and links its stylesheets in the order src/styles/sheets.json lists them, after the tokens
 * (each page its own part of each: src/styles/page-sheets.ts); a page the harness serves has neither, so it links the
 * faces from Google Fonts and each of those stylesheets whole, in that order, at its path from src/, where the harness
 * serves it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/dashboard/src");
/** The frame's own rules, the last of the list the harness links: it serves them after every stylesheet (server.mjs appRules). */
const APP_RULES = "bridge/frame.css";

/** The faces the app names (Geist, Geist Mono and Mona Sans), from Google Fonts, its two hosts reached for first. */
const FONT_LINKS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com" />',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
  '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&family=Mona+Sans:wght@200..900&display=swap" rel="stylesheet" />',
];

/**
 * The stylesheets the app links, in its order, each as a path from src/: the tokens (app/globals.css brings them to
 * every document, first), then the frame's list (src/styles/sheets.json) up to the frame's own rules. What the list
 * holds past those is never a harness page's: the lead map's, which the map links for itself, and the Console's. The
 * tokens' and the shell's are under styles/; the kit's and Campaigns' live with their surface (a moved surface keeps its
 * rules in its own folder).
 */
export const appStylesheets = () => {
  const { sheets } = JSON.parse(fs.readFileSync(path.join(SRC, "styles/sheets.json"), "utf8"));
  return ["styles/tokens.css", ...sheets.slice(0, sheets.indexOf(APP_RULES)).filter((row) => typeof row === "string")];
};

/** A page's links, in its head: the faces first, then every stylesheet the app imports, in the app's order. */
export const styleLinks = () => [
  ...FONT_LINKS,
  ...appStylesheets().map((sheet) => `<link rel="stylesheet" href="${sheet}" />`),
];
