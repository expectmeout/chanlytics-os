/**
 * Stylesheets as the page tests stand in for them, loaded before every test file (`--import` in checks/test.mjs, beside
 * Base UI's and the network's stand-ins).
 *
 * A module that is loaded on demand brings its own rules with it (`import "./sheet.css"`), so no page pays for them
 * before it is opened: the bundler turns the import into the stylesheet the chunk links. The suite has no bundler: tsx
 * loads the dashboard's TSX as CommonJS, and a `.css` file required that way is read as JavaScript and fails at its
 * first rule. This answers a stylesheet's require with an empty module, as a bundler's import answers nothing a page
 * reads. What the rules do is the browser's to hold (e2e/, and styles/*.test.mjs, which read the stylesheets as text).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import Module from "node:module";

Module._extensions[".css"] = (module) => {
  module.exports = {};
};
