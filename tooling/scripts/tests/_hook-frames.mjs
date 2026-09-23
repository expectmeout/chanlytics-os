/**
 * Where a hook keeps its state, for the stub Reacts the page tests draw on.
 *
 * The stubs kept every hook's cell by the order hooks were called in across a whole draw -- the page's, then each
 * child's as the draw reached it -- so a component drawn only some of the time (a sheet, one scope's view) moved the
 * cell of every hook after it. The pages were written around that: every hook People and Leads need declared in one
 * component, in one order, and sheets with no state of their own. React keeps a component's state where the component
 * sits: under its parent, by its type and key, among its siblings of that type. So do these frames, and a component
 * the stub draws keeps its own state whatever else is drawn around it.
 *
 * A test calling a component itself (`window.ClientsA(props)`) draws at the root; `begin()` starts a draw where the
 * stubs set `seq = 0`, and `called()` is how many hooks have been called since, where the tests read `seq`.
 *
 *   const frames = hookFrames();
 *   createElement: (type, p, ...kids) => { ...; if (typeof type === "function") node.rendered = frames.render(type, props); }
 *   useState: (init) => { const k = frames.key(); ... cells[k] ... }
 */
export function hookFrames() {
  const frame = (key) => ({ key, hook: 0, kids: new Map() });
  const stack = [];
  let root = frame("");
  let calls = 0;
  const top = () => stack[stack.length - 1] ?? root;
  return {
    /** A draw begins: the test's own calls start again at the root. */
    begin() {
      root = frame("");
      calls = 0;
    },
    /** Draw a component in a frame of its own, keyed by where it sits: its parent, its type, its key or its turn. */
    render(type, props) {
      const parent = top();
      const name = type.displayName || type.name || "component";
      let slot;
      if (props && props.key !== undefined && props.key !== null) slot = `[${String(props.key)}]`;
      else {
        const n = parent.kids.get(name) ?? 0;
        parent.kids.set(name, n + 1);
        slot = `#${n}`;
      }
      stack.push(frame(`${parent.key}/${name}${slot}`));
      try {
        return type(props);
      } finally {
        stack.pop();
      }
    },
    /** The cell the next hook of the component being drawn keeps its state in. */
    key() {
      calls += 1;
      const f = top();
      return `${f.key}:${f.hook++}`;
    },
    /** How many hooks have been called since the draw began: what a test that counts hooks reads. */
    called() {
      return calls;
    },
  };
}
