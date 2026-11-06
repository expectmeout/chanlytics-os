/**
 * Ask's Line in the states a person sees it in, on the dashboard's React and the app's own stylesheets, for the harness's
 * `ask` record (server.mjs serves it at the workspace's address; docs/runbook.md, "Prove a style change"). What the kit's
 * gallery is for the kit, this is for Ask: the recorder (tooling/scripts/checks/style-equality.mjs) opens each state at a
 * desk and a phone, dark and light, so a change that must move nothing on Ask's screen can be proved to.
 *
 *   node --import tsx tooling/scripts/e2e-harness/server.mjs 3211 ask     # http://localhost:3211/#/card ; t turns the theme
 *
 * It draws the real AskReal, opened as the shell opens it (`ask:seed`), over the bridge's real palette with Ask's routes
 * scripted (ask-states-world.ts). A state is an address, and the Line is made afresh for each. The dashboard's `tsc
 * --noEmit` compiles this file and the world, so a change to the Line's props or Ask's calls fails `pnpm -r typecheck`.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AskReal } from "@/surfaces/ask/line/line";
import { holdAsk } from "@/surfaces/frame-verbs";
import { askWorld, DROPPED, STREAMING, type AskSeed } from "./ask-states-world";

/** Each state, by its address: how its Line is opened, and what is pressed once it stands. */
const STATES: Record<string, { seed?: AskSeed; then?: () => void }> = {
  rest: {},
  earlier: { then: () => press("ask-earlier") },
  typing: { then: () => type("calendar") },
  scoped: { seed: { about: { kind: "person", id: "c-ana", label: "Ana Reyes" } } },
  answer: { seed: { thread: "th-answer" } },
  streaming: { seed: { prompt: STREAMING } },
  card: { seed: { thread: "th-card" } },
  receipt: { seed: { thread: "th-receipt" } },
  failed: { seed: { prompt: DROPPED } },
  latest: { seed: { thread: "th-long" }, then: () => scrollUp() },
  deleting: { then: () => (press("ask-earlier"), later(() => press("ask-row-del"))) },
  listening: { then: () => hold("ask-talk") },
};

const later = (fn: () => void) => setTimeout(fn, 200);
const at = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const press = (id: string) => at(id)?.click();

/** Words in the field, as a person types them: through the field's own setter, which React hears. */
function type(words: string) {
  const field = at("ask-input") as HTMLTextAreaElement | null;
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!field || !set) return;
  set.call(field, words);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The thread scrolled back to its top, its newest question out of sight below. */
function scrollUp() {
  const body = document.querySelector<HTMLElement>(".ask-line-body");
  if (!body) return;
  later(() => {
    body.scrollTop = 0;
    body.dispatchEvent(new Event("scroll"));
  });
}

/** A press held on the mic, as a finger or a mouse holds it. */
function hold(id: string) {
  at(id)?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
}

/** The browser's recogniser, standing still: it listens and hears nothing, so a held mic stays held. */
class StillRecogniser {
  start() {}
  stop() {}
  abort() {}
}

/** What the Line reads of the page it stands on: the Today every state is opened over, and Ask's scripted calls. */
function standIn() {
  Object.assign(window, {
    SpeechRecognition: StillRecogniser,
    __shell: { route: () => "today", href: (r: string) => `#/${r}`, go() {}, hear: () => () => undefined },
  });
  holdAsk(askWorld(window));
  // A phone's Line takes an entry in the history as it opens and goes back over it as it closes; here a state changes
  // by its address, which a step back would undo.
  window.history.pushState = () => undefined;
  window.history.back = () => undefined;
  // A thread's glide to its newest question runs on the browser's own clock, which the recorder's does not stop, so two
  // recordings would catch it at two places: here it lands at once.
  Element.prototype.scrollTo = function (this: Element, to?: ScrollToOptions | number) {
    this.scrollTop = typeof to === "object" ? (to.top ?? 0) : 0;
  };
}

const stateOf = () => location.hash.replace(/^#\/?/, "") || "rest";

/** One state: the Line made closed, sent what the shell sends, then opened, and pressed where the state says. */
function State({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const state = STATES[name];
  useEffect(() => {
    if (!state) return undefined;
    if (state.seed) window.dispatchEvent(new CustomEvent("ask:seed", { detail: state.seed }));
    setOpen(true);
    const pressed = state.then ? later(state.then) : undefined;
    return () => clearTimeout(pressed);
  }, [state]);
  if (!state) return <p>No state {name}</p>;
  return <AskReal open={open} onClose={() => undefined} />;
}

function Page() {
  const [name, setName] = useState(stateOf);
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const moved = () => {
      sessionStorage.clear();
      setName(stateOf());
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "t") setTheme((was) => (was === "dark" ? "light" : "dark"));
    };
    window.addEventListener("hashchange", moved);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("hashchange", moved);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => document.documentElement.setAttribute("data-theme", theme), [theme]);
  return (
    <div className="app-root" data-theme={theme} data-look="glass">
      <State key={name} name={name} />
    </div>
  );
}

standIn();
const root = document.getElementById("root");
if (root) createRoot(root).render(<Page />);
