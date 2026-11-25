/**
 * Base UI as the page tests stand in for it, loaded before every test file (`--import` in checks/test.mjs, beside the
 * network's stand-in).
 *
 * The suite runs under the react-server condition, where React has no client hooks and no createContext, so a Base UI
 * module fails as it loads (it makes a context at its top level). A surface that draws one of the kit's Base UI parts
 * (the Menu in a thread's header, say) imports it, and so could not be imported by its own page test. tsx loads the
 * dashboard's TSX as CommonJS, so the import is a `require`, which a loader hook never sees: this answers
 * `@base-ui/react/<part>` where the require is made, with the part's one namespace (`Menu`, `Dialog`, `RadioGroup`),
 * whose every member is a component that draws nothing, but the Dialog's, which draws what it is handed while it is open
 * (below). A page test finds the kit's component in the tree by its type
 * and reads its props, as it does the house's own; what Base UI does with them, a browser holds
 * (e2e/kit/kit-behaves.spec.ts), and so does the suite with its own bundled React (styles/kit-behaves.test.mjs, whose
 * esbuild resolves Base UI itself and never meets this).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import Module from "node:module";

const PART = /^@base-ui\/react\/([a-z-]+)$/;

const pascal = (part) =>
  part
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");

// Every member is a component that draws nothing; `then` is left alone so the module can be awaited.
const standIn = new Proxy({}, { get: (_, key) => (key === "then" ? undefined : () => null) });

// The Dialog draws what the kit's Sheet hands it while it is open, and nothing while it is shut: its head, its rows and
// its foot are in the tree as a browser draws them, so a page test reads and presses a sheet's Save and Close as it did
// the house's sheet's (kit/record/sheet.tsx draws through the kit's since 25 Nov 2026). Its wash draws nothing.
const drawn = ({ children }) => children ?? null;
// Shut, nothing of the sheet stands: the tree is walked as what the root drew (tests/_stub-react.mjs walk), as a page
// test reads a fold that is shut, so a shut sheet's parts are found nowhere.
const Root = ({ open, children }) => (open ? (children ?? null) : null);
Root.drawsOnlyWhatItRendered = true;
const DIALOG_PARTS = { Root, Backdrop: () => null };
const dialog = new Proxy({}, { get: (_, key) => (key === "then" ? undefined : (DIALOG_PARTS[key] ?? drawn)) });

const load = Module._load;
Module._load = function (request, ...rest) {
  const part = PART.exec(request);
  if (!part) return load.call(this, request, ...rest);
  return { __esModule: true, [pascal(part[1])]: part[1] === "dialog" ? dialog : standIn };
};
