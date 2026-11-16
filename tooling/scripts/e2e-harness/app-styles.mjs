/**
 * The app's faces and stylesheets, as a page outside the app links them: the kit's gallery, the page that runs the kit's
 * components and Ask's states (kit-gallery.mjs), each served by the harness (server.mjs). The app names its faces through
 * next/font (app/layout.tsx) and takes its stylesheets by import (bridge/frame.css); a page the harness serves has
 * neither, so it links the faces from Google Fonts and each stylesheet frame.css imports, in its order, at its path from
 * src/, where the harness serves it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/dashboard/src");
const BRIDGE = path.join(SRC, "bridge");

/** The faces the app names (Geist, Geist Mono and Mona Sans), from Google Fonts, its two hosts reached for first. */
const FONT_LINKS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com" />',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
  '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&family=Mona+Sans:wght@200..900&display=swap" rel="stylesheet" />',
];

/**
 * The stylesheets the app imports, in its order, each as a path from src/: the shell's one entry, bridge/frame.css
 * (Next orders nothing across imports, so one file does). The tokens' and the shell's are under styles/; the kit's and
 * Campaigns' live with their surface (a moved surface keeps its rules in its own folder).
 */
export const appStylesheets = () =>
  [...fs.readFileSync(path.join(BRIDGE, "frame.css"), "utf8").matchAll(/^@import "([^"]+)";/gm)].map((m) =>
    path.relative(SRC, path.resolve(BRIDGE, m[1])).split(path.sep).join("/"),
  );

/** A page's links, in its head: the faces first, then every stylesheet the app imports, in the app's order. */
export const styleLinks = () => [
  ...FONT_LINKS,
  ...appStylesheets().map((sheet) => `<link rel="stylesheet" href="${sheet}" />`),
];
