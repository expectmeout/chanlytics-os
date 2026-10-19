/**
 * Ask's Line: its pages, the five legacy/pages/ask-*.jsx in the order each reads the one before it, after the parts only
 * they draw are published (line-globals.ts, which evaluates first, as seed-globals.ts does before the manifest). A
 * chunk of its own, fetched by line.tsx; the frame carries none of it.
 */
import "./line-globals";
import "@/legacy/pages/ask-text.jsx";
import "@/legacy/pages/ask-hooks.jsx";
import "@/legacy/pages/ask-turn.jsx";
import "@/legacy/pages/ask-home.jsx";
import "@/legacy/pages/ask-real.jsx";

export {};
