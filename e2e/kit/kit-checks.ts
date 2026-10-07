/**
 * The kit gallery's checks as they run in the page: e2e/kit/kit.spec.ts hands `kitChecks` to page.evaluate, as
 * tooling/scripts/checks/style-equality.mjs hands over its walk. It is one function, whole, because page.evaluate
 * sends a function's source and nothing it closes over: every helper it needs is declared inside it, and what it must
 * know comes in its question.
 *
 * A kit rule is a style rule of the stylesheet whose path ends `ask.sheet` (surfaces/kit/kit.css), read from the
 * CSSOM, inside the @media and @supports rules and @layer blocks whose condition holds now, and never inside
 * @starting-style or @keyframes. A group whose condition the checks cannot judge here (@container, @scope, a rule
 * nested in a rule) is named as a failure, never skipped. A kit entry is a figure `[data-entry]` with no
 * `data-source` (tooling/scripts/e2e-harness/kit-gallery.mjs), and what it draws is every element in its `.gx-stage`.
 * A press is one of `ask.presses` (:hover, :active, a :focus): a selector that needs one, outside a :not(), is a
 * press's. The spec forces every press on every element of every entry at once (CDP CSS.forcePseudoState) for the
 * questions it asks `pressed`.
 *
 *   classes  every name asked about is drawn by a kit entry;
 *   rules    each selector of each kit rule, alone: whether its media holds now and whether it matches an element of a
 *            kit entry. A press's is judged only where the presses are forced. The spec unions its runs;
 *   tokens   each declaration a kit rule makes with a var() is planted where it wins, on an element or on a
 *            pseudo-element a kit selector names (the cascade among the kit's rules: importance, specificity,
 *            order): each token it reads is written on the element, and every longhand those tokens feed, read
 *            before, planted and after, must change and then come back; a longhand another rule keeps is named.
 *            A number is planted twice over, so a value clamped to its range (an opacity at 1) still moves.
 *            Pressed, only a press rule's declarations are planted; asked with `media`, only those of a rule in a
 *            group whose condition names it (a reduced-motion run's). A var() with no fallback must name a token
 *            defined there, and an entry some kit rule draws must read a token;
 *   twins    a kit entry and its source, element by element in document order: every longhand each pair computes (the
 *            physical ones: a logical one says one of them again) must be the same on both, but those in
 *            `data-except`, whatever rule sets it, and so must their pseudo-elements' (the ones either side draws, a
 *            first letter, a list item's marker, a placeholder shown, and any a kit selector names); with
 *            `data-boxes` each box must stand within the tolerance, relative to its stage. An element's values are
 *            the computed ones (Typed OM); a pseudo-element's are the browser's resolved values, the laid-out ones
 *            held to the tolerance as the recorder holds them.
 * Motion (animation, transition and the caret) is read with the spec's still stylesheet off, since it stops them with
 * !important; everything else with it on, so a transition never shows a value on its way.
 *
 * `toastsOverFeet` is a function of its own, for the same reason: it asks, of each kit entry that draws an open sheet
 * and a toast, whether the toast stands on the sheet's foot, where its Save is. So are `focusRings`, which focuses each
 * control an entry draws as a key does and asks whether a ring is drawn, and `placeEntry` with `groundsUnder`, which
 * read each word an entry draws and its contrast on the ground drawn under it, shot by the spec with the words hidden.
 *
 * What they cannot see, so a pull request does not claim it: a declaration another kit rule outranks on every element
 * it would draw is never planted; the presses are forced all at once, so a selector that needs one element pressed and
 * its neighbour not is judged only unpressed; a token a kit rule declares on a pseudo-element cannot be planted from
 * the element, so its reader is named as unchanged.
 */

/** Why the spec skips anywhere but on the harness's kit record. skip-ceiling.test.mjs holds it among the deliberate. */
export const KIT_SKIP_REASON =
  "the kit's gallery is the local harness's alone: set E2E_SCENARIO=kit, as `corepack pnpm e2e:local -- e2e/kit/kit.spec.ts --scenario=kit` does";

/** The states a person's press puts an element in, which the spec forces and the checks read a selector for. */
export const PRESSES = ["hover", "active", "focus", "focus-visible", "focus-within"];

export type Width = "desk" | "phone";

export type KitAsk =
  | { check: "classes"; classes: string[] }
  | { check: "rules"; sheet: string; presses: string[]; pressed: boolean }
  | {
      check: "tokens";
      sheet: string;
      presses: string[];
      pressed: boolean;
      width: Width;
      still: string;
      /** Plant only the declarations of rules inside a group whose condition names this: a reduced-motion run's. */
      media?: string;
    }
  | { check: "twins"; sheet: string; width: Width; still: string; tolerance: number; laidOut: string[] };

/** One selector of a rule of the kit's stylesheet, as one run saw it. */
export type SeenSelector = {
  /** The rule's place in the sheet, and the selector's in its list. */
  key: string;
  selector: string;
  /** The rule's whole list of selectors. */
  rule: string;
  media: string;
  press: boolean;
  /** Whether this run judged it: a press's only where the presses are forced. */
  judged: boolean;
  drawn: boolean;
};

export type KitAnswer = {
  /** What is wrong, each a sentence that names the entry, the element and what differs. */
  failures: string[];
  /** classes: the names no entry draws. */
  missing: string[];
  /** rules: every selector of every rule of the kit's stylesheet; how many style rules it holds. */
  selectors: SeenSelector[];
  rules: number;
  /** tokens: the plants made, all told and by entry; the entries no kit rule draws yet. */
  reads: number;
  readsBy: Record<string, number>;
  exempt: string[];
  /** twins: the pairs of elements compared. */
  pairs: number;
  /** The gallery as the page has it. */
  families: number;
  entries: number;
  kitEntries: number;
  twins: number;
};

export function kitChecks(ask: KitAsk): KitAnswer {
  type Shape = { text: string; base: string; pseudo: string | null; press: boolean; spec: number[] };
  type KitRule = { key: string; rule: CSSStyleRule; media: string; holds: boolean; order: number; selectors: Shape[] };
  type Hit = { rule: KitRule; sel: Shape };
  type Decl = { prop: string; value: string; important: boolean; index: number };

  const presses = "presses" in ask ? ask.presses : [];
  const PRESS = presses.length ? new RegExp(`:(?:${presses.join("|")})(?![\\w-])`, "i") : null;
  const pressed = "pressed" in ask && ask.pressed;
  const only = ask.check === "tokens" ? ask.media : undefined;
  const MOTION = /^(?:animation|transition)(?:-|$)|^caret-color$/;
  const LEGACY_ELEMENTS = ["before", "after", "first-letter", "first-line"];

  const answer: KitAnswer = {
    failures: [],
    missing: [],
    selectors: [],
    rules: 0,
    reads: 0,
    readsBy: {},
    exempt: [],
    pairs: 0,
    families: document.querySelectorAll("[data-family]").length,
    entries: 0,
    kitEntries: 0,
    twins: 0,
  };
  const figures = Array.from(document.querySelectorAll<HTMLElement>("[data-entry]"));
  const kitFigures = figures.filter((f) => !f.hasAttribute("data-source"));
  answer.entries = figures.length;
  answer.kitEntries = kitFigures.length;
  answer.twins = kitFigures.filter((f) => !!f.dataset.twin).length;
  const stageOf = (f: Element) => f.querySelector(":scope > .gx-stage");
  const drawnBy = (f: Element): Element[] => Array.from(stageOf(f)?.querySelectorAll("*") ?? []);
  const otherWidth = (f: HTMLElement) => "width" in ask && !!f.dataset.width && f.dataset.width !== ask.width;

  if (ask.check === "classes") {
    answer.missing = ask.classes.filter(
      (name) => !kitFigures.some((f) => stageOf(f)?.querySelector(`.${CSS.escape(name)}`)),
    );
    answer.failures = answer.missing.map((name) => `.${name} is drawn by no entry`);
    return answer;
  }

  /* ---- selectors and declarations, as text ---- */

  // Where a string that opens at `i` closes.
  const stringEnd = (text: string, i: number) => {
    let j = i + 1;
    while (j < text.length && text[j] !== text[i]) j += text[j] === "\\" ? 2 : 1;
    return j;
  };
  // Where the bracket that opens at `i` closes, past strings and the brackets inside it.
  const closing = (text: string, i: number) => {
    const open = text[i];
    const shut = open === "(" ? ")" : "]";
    let depth = 0;
    for (let j = i; j < text.length; j += 1) {
      const c = text[j];
      if (c === '"' || c === "'") j = stringEnd(text, j);
      else if (c === "\\") j += 1;
      else if (c === open) depth += 1;
      else if (c === shut && --depth === 0) return j;
    }
    return text.length;
  };
  // The top-level parts of a list: a selector list at its commas, a declaration block at its semicolons.
  const parts = (text: string, at: string): string[] => {
    const out: string[] = [];
    let from = 0;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (c === '"' || c === "'") i = stringEnd(text, i);
      else if (c === "(" || c === "[") i = closing(text, i);
      else if (c === at) {
        out.push(text.slice(from, i).trim());
        from = i + 1;
      }
    }
    out.push(text.slice(from).trim());
    return out.filter(Boolean);
  };
  const identEnd = (text: string, i: number) => {
    let j = i;
    while (j < text.length && (/[\w-]/.test(text[j]) || text.charCodeAt(j) > 127 || text[j] === "\\"))
      j += text[j] === "\\" ? 2 : 1;
    return j;
  };
  const beats = (x: number[], y: number[]) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  // A selector's specificity as Selectors 4 counts it: :where() adds nothing, :is(), :not() and :has() their most
  // specific argument, :nth-child(… of S) a class and S, and a pseudo-element counts as a type.
  const specificity = (sel: string): number[] => {
    const s = [0, 0, 0];
    const add = (t: number[]) => {
      s[0] += t[0];
      s[1] += t[1];
      s[2] += t[2];
    };
    const most = (list: string) =>
      parts(list, ",")
        .map(specificity)
        .reduce((m, t) => (beats(t, m) > 0 ? t : m), [0, 0, 0]);
    let i = 0;
    while (i < sel.length) {
      const c = sel[i];
      if (c === "#") {
        s[0] += 1;
        i = identEnd(sel, i + 1);
      } else if (c === ".") {
        s[1] += 1;
        i = identEnd(sel, i + 1);
      } else if (c === "[") {
        s[1] += 1;
        i = closing(sel, i) + 1;
      } else if (c === ":") {
        const element = sel[i + 1] === ":";
        const start = i + (element ? 2 : 1);
        const end = identEnd(sel, start);
        const name = sel.slice(start, end).toLowerCase();
        let args = "";
        i = end;
        if (sel[end] === "(") {
          const shut = closing(sel, end);
          args = sel.slice(end + 1, shut);
          i = shut + 1;
        }
        if (element || LEGACY_ELEMENTS.includes(name)) s[2] += 1;
        else if (name === "is" || name === "not" || name === "has" || name === "matches") add(most(args));
        else if ((name === "nth-child" || name === "nth-last-child") && / of /i.test(args)) {
          s[1] += 1;
          add(most(args.slice(args.search(/ of /i) + 4)));
        } else if (name !== "where") s[1] += 1;
      } else if (/[A-Za-z_\\]/.test(c) || c.charCodeAt(0) > 127) {
        s[2] += 1;
        i = identEnd(sel, i);
      } else i += 1;
    }
    return s;
  };
  // One selector of a list: what it matches with its pseudo-element taken off, which pseudo-element it styles, and
  // whether it needs a press (outside a :not(), where one only says what is not pressed).
  const TAIL = /(?:::[\w-]+(?:\([^()]*\))?|:(?:before|after|first-letter|first-line))$/i;
  const NOT = /:not\((?:[^()]|\([^()]*\))*\)/gi;
  const shape = (text: string): Shape => {
    const m = text.match(TAIL);
    const base = m ? text.slice(0, m.index).trim() : text;
    const tail = m ? m[0].replace(/^:+/, "") : "";
    const open = tail.indexOf("(");
    return {
      text,
      base: !base || /[>+~]$/.test(base) ? `${base}*` : base,
      pseudo: m
        ? `::${open < 0 ? tail.toLowerCase() : `${tail.slice(0, open).toLowerCase()}${tail.slice(open)}`}`
        : null,
      press: !!PRESS && PRESS.test(text.replace(NOT, "")),
      spec: specificity(text),
    };
  };

  /* ---- the kit's rules ---- */

  const kitRules = (): KitRule[] => {
    const sheet = Array.from(document.styleSheets).find(
      (s) => !!s.href && new URL(s.href).pathname.endsWith(ask.sheet),
    );
    if (!sheet) throw new Error(`the page links no stylesheet at …${ask.sheet}`);
    const out: KitRule[] = [];
    const head = (r: CSSRule) => r.cssText.slice(0, Math.max(0, r.cssText.indexOf("{"))).trim();
    const walk = (list: CSSRuleList, media: string[], holds: boolean, key: string) => {
      Array.from(list).forEach((r, i) => {
        const at = key ? `${key}.${i}` : `${i}`;
        const kind = r.constructor.name;
        if (r instanceof CSSStyleRule) {
          if (r.cssRules && r.cssRules.length)
            answer.failures.push(`${r.selectorText}: kit.css nests rules in it, which the checks do not read`);
          const selectors = parts(r.selectorText, ",").map(shape);
          out.push({ key: at, rule: r, media: media.join(" "), holds, order: out.length, selectors });
        } else if (r instanceof CSSMediaRule) {
          const text = r.media.mediaText;
          walk(r.cssRules, [...media, `@media ${text}`], holds && matchMedia(text).matches, at);
        } else if (r instanceof CSSSupportsRule) {
          walk(r.cssRules, [...media, `@supports ${r.conditionText}`], holds && CSS.supports(r.conditionText), at);
        } else if (kind === "CSSLayerBlockRule") {
          walk((r as CSSGroupingRule).cssRules, media, holds, at);
        } else if (kind === "CSSStartingStyleRule" || r instanceof CSSKeyframesRule) {
          // Where a transition starts from, and a motion's frames: no rule an entry is drawn by.
        } else if ("cssRules" in r) {
          answer.failures.push(`${head(r)}: kit.css holds a ${kind} the checks cannot judge here, so none reads it`);
        }
        // Anything else holds no style rule: @font-face, @property, @import, a @layer statement.
      });
    };
    walk(sheet.cssRules, [], true, "");
    answer.rules = out.length;
    return out;
  };

  // The kit rules that match each of `els`, by the selectors of theirs that do.
  const hitsOn = (rules: KitRule[], els: Set<Element>) => {
    const out = new Map<Element, Hit[]>();
    for (const rule of rules) {
      for (const sel of rule.selectors) {
        let found: Element[] = [];
        try {
          found = Array.from(document.querySelectorAll(sel.base));
        } catch {
          answer.failures.push(`${rule.rule.selectorText}: the browser cannot match ${sel.base}`);
        }
        for (const el of found) if (els.has(el)) out.set(el, [...(out.get(el) ?? []), { rule, sel }]);
      }
    }
    return out;
  };

  if (ask.check === "rules") {
    const els = new Set(kitFigures.flatMap(drawnBy));
    for (const r of kitRules()) {
      r.selectors.forEach((s, i) => {
        const judged = pressed || !s.press;
        let drawn = false;
        if (judged && r.holds) {
          try {
            drawn = Array.from(document.querySelectorAll(s.base)).some((el) => els.has(el));
          } catch {
            // The browser cannot match it, so nothing draws it.
          }
        }
        answer.selectors.push({
          key: `${r.key}/${i}`,
          selector: s.text,
          rule: r.rule.selectorText,
          media: r.media,
          press: s.press,
          judged,
          drawn,
        });
      });
    }
    return answer;
  }

  /* ---- reading what an element computes ---- */

  const pathOf = (el: Element, stage: Element | null) => {
    const out: string[] = [];
    for (let e: Element | null = el; e && e !== stage; e = e.parentElement)
      out.unshift(`${e.localName}${Array.from(e.classList, (c) => `.${c}`).join("")}`);
    return out.join(" > ");
  };
  // Longhands' computed values: the Typed OM's for an element (every value of a list, not its first), so what the
  // layout makes of a value (a coarse pointer's 44px floor, a percentage's pixels) does not hide what a rule set; a
  // pseudo-element has none, and is read resolved.
  const read = (el: Element, pseudo: string | null, names: string[]) => {
    const cs = getComputedStyle(el, pseudo);
    if (pseudo) return names.map((n) => cs.getPropertyValue(n));
    const map = el.computedStyleMap();
    return names.map((n) => {
      if (n.startsWith("--")) return cs.getPropertyValue(n);
      try {
        const all = map.getAll(n);
        return all.length ? all.map(String).join(", ") : cs.getPropertyValue(n);
      } catch {
        return cs.getPropertyValue(n);
      }
    });
  };
  // The still stylesheet (the element whose id is `stillId`) off for `run`: motion is read as the kit's rules write it.
  const moving = (stillId: string, run: () => void) => {
    const still = (document.getElementById(stillId) as HTMLStyleElement | null)?.sheet;
    if (still) still.disabled = true;
    try {
      run();
    } finally {
      if (still) still.disabled = false;
    }
  };

  /* ---- tokens ---- */

  const probe = document.createElement("div");
  const longhands = new Map<string, string[]>();
  const longhandsOf = (prop: string) => {
    if (prop.startsWith("--")) return [prop];
    if (!longhands.has(prop)) {
      probe.style.cssText = "";
      probe.style.setProperty(prop, "initial");
      const out = Array.from(probe.style);
      longhands.set(prop, out.length ? out : [prop]);
    }
    return longhands.get(prop) as string[];
  };
  const declared = new Map<CSSStyleRule, Decl[]>();
  const declarationsOf = (rule: CSSStyleRule): Decl[] => {
    if (!declared.has(rule)) {
      const decls = parts(rule.style.cssText, ";").map((d, index) => {
        const colon = d.indexOf(":");
        const prop = d.slice(0, colon).trim();
        const said = d.slice(colon + 1).trim();
        const important = /!\s*important$/i.test(said);
        return {
          prop: prop.startsWith("--") ? prop : prop.toLowerCase(),
          value: important ? said.replace(/!\s*important$/i, "").trim() : said,
          important,
          index,
        };
      });
      declared.set(rule, decls);
    }
    return declared.get(rule) as Decl[];
  };
  // Each var() in a value: the token it reads, and the words it falls back on, if any.
  const varsIn = (value: string) =>
    Array.from(value.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g), (m) => {
      const open = (m.index ?? 0) + 3;
      return {
        name: m[1],
        fallback: m[2]
          ? value
              .slice(open + 1, closing(value, open))
              .split(",")
              .slice(1)
              .join(",")
              .trim()
          : null,
      };
    });
  // What a token is planted as, following its value where the element stands: a colour, a length, a time, a number,
  // a shadow, or a word no property of the kit takes as it is (not `initial`: an inherited property left invalid takes
  // its parent's value, which is most often the same). Two sets, the second for what the first cannot move: a number
  // over 1 is an opacity's 1, so the second number is under it.
  const SENTINELS = [
    {
      colour: "rgb(1, 2, 3)",
      length: "7.5px",
      time: "7ms",
      number: "7",
      shadow: "rgb(1, 2, 3) 0px 0px 0px 7px",
      word: "gx-planted",
    },
    {
      colour: "rgb(4, 5, 6)",
      length: "9.25px",
      time: "9ms",
      number: "0.37",
      shadow: "rgb(4, 5, 6) 0px 0px 0px 9px",
      word: "gx-planted-again",
    },
  ];
  const sentinel = (value: string, pass: number) => {
    const s = SENTINELS[pass];
    if (!value || /^(?:initial|inherit|unset|revert|revert-layer)$/i.test(value)) return s.word;
    if (CSS.supports("color", value)) return s.colour;
    if (/\d/.test(value) && CSS.supports("width", value)) return s.length;
    if (CSS.supports("transition-duration", value)) return s.time;
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return s.number;
    if (CSS.supports("box-shadow", value)) return s.shadow;
    return s.word;
  };

  if (ask.check === "tokens") {
    type Plant = { entry: string; el: HTMLElement; pseudo: string | null; decl: Decl; names: string[]; at: string };
    const rules = kitRules().filter((r) => r.holds);
    const lost = new Set<string>();

    // For each longhand of an element (or of one of its pseudo-elements), the declaration the cascade takes among the
    // kit's rules: the important one, then the most specific rule (at its most specific selector that matches), then
    // the latest rule, then the latest declaration in it. Each declaration that reads a token comes back with the
    // longhands it takes, and whether its rule matched there through a press.
    const winners = (hits: Hit[]) => {
      const mine = new Map<KitRule, { spec: number[]; press: boolean }>();
      for (const h of hits) {
        const was = mine.get(h.rule);
        mine.set(h.rule, {
          spec: was && beats(was.spec, h.sel.spec) >= 0 ? was.spec : h.sel.spec,
          press: !!was?.press || h.sel.press,
        });
      }
      const won = new Map<string, { decl: Decl; rule: KitRule; spec: number[]; press: boolean }>();
      for (const [rule, { spec, press }] of mine) {
        for (const decl of declarationsOf(rule.rule)) {
          if (!decl.value) lost.add(`${rule.rule.selectorText} ${decl.prop}`);
          for (const name of longhandsOf(decl.prop)) {
            const was = won.get(name);
            const order = was
              ? Number(decl.important) - Number(was.decl.important) ||
                beats(spec, was.spec) ||
                rule.order - was.rule.order ||
                decl.index - was.decl.index
              : 1;
            if (order > 0) won.set(name, { decl, rule, spec, press });
          }
        }
      }
      const byDecl = new Map<Decl, { names: string[]; press: boolean; media: string }>();
      for (const [name, w] of won) {
        if (!/var\(/.test(w.decl.value)) continue;
        const d = byDecl.get(w.decl) ?? { names: [], press: w.press, media: w.rule.media };
        d.names.push(name);
        byDecl.set(w.decl, d);
      }
      return byDecl;
    };

    // Which of a declaration's longhands its tokens feed: `border: 1px solid var(--line)` feeds the colours and not the
    // widths, and another kit rule may take the colours (.btn-primary does). Found on an element of the check's own,
    // off the page, with the declaration written on it !important (inline and important, so no rule reaches it) and the
    // tokens at their values where it is read: each token planted alone, in both sets, and each longhand that moves is
    // fed.
    const shelf = document.createElement("div");
    shelf.setAttribute("aria-hidden", "true");
    shelf.style.cssText = "position: absolute; left: -10000px; top: 0; width: 0; height: 0; overflow: hidden;";
    const lab = shelf.appendChild(document.createElement("div"));
    const fedBy = (decl: Decl, names: string[], values: Map<string, string>) => {
      const fed = new Set<string>();
      for (const pass of [0, 1]) {
        lab.style.cssText = "";
        for (const [n, v] of values) if (v) lab.style.setProperty(n, v);
        lab.style.setProperty(decl.prop, decl.value, "important");
        const real = read(lab, null, names);
        for (const v of varsIn(decl.value)) {
          const was = values.get(v.name) ?? "";
          lab.style.setProperty(v.name, sentinel(was || v.fallback || "", pass));
          read(lab, null, names).forEach((value, i) => {
            if (value !== real[i]) fed.add(names[i]);
          });
          if (was) lab.style.setProperty(v.name, was);
          else lab.style.removeProperty(v.name);
        }
      }
      return names.filter((n) => fed.has(n));
    };

    // What an entry reads: a plant for every declaration whose tokens draw something on one of its elements.
    const plansFor = (f: HTMLElement): Plant[] => {
      const entry = f.dataset.entry as string;
      const els = drawnBy(f);
      const hits = hitsOn(rules, new Set(els));
      const plans: Plant[] = [];
      for (const el of els) {
        const byPseudo = new Map<string | null, Hit[]>();
        for (const h of hits.get(el) ?? []) byPseudo.set(h.sel.pseudo, [...(byPseudo.get(h.sel.pseudo) ?? []), h]);
        for (const [pseudo, list] of byPseudo) {
          const at = `${pathOf(el, stageOf(f))}${pseudo ?? ""}`;
          const here = getComputedStyle(el, pseudo);
          if (!here.length) {
            answer.failures.push(`${entry}: ${at}: the browser reads no style for it, so nothing there can be planted`);
            continue;
          }
          for (const [decl, { names, press, media }] of winners(list)) {
            if ((pressed && !press) || (only && !media.includes(only))) continue;
            const values = new Map<string, string>();
            for (const v of varsIn(decl.value)) {
              values.set(v.name, here.getPropertyValue(v.name).trim());
              if (v.fallback === null && !values.get(v.name))
                answer.failures.push(`${entry}: ${at} ${decl.prop} reads ${v.name}, which is not defined there`);
            }
            // None, where the kit's own rules take every longhand the tokens feed.
            const fed = fedBy(decl, names, values);
            if (fed.length) plans.push({ entry, el: el as HTMLElement, pseudo, decl, names: fed, at });
          }
        }
      }
      answer.readsBy[entry] = plans.length;
      if (!pressed && !only && !hits.size) answer.exempt.push(entry);
      else if (!pressed && !only && !plans.length) answer.failures.push(`${entry}: its kit rules read no token`);
      return plans;
    };

    // One plant: read; write each token on the element, in the first set and then, for what did not move, the second;
    // read; put each back as it was; read. Every longhand must move, and come back.
    const plant = (p: Plant) => {
      const values = new Map<string, string>();
      for (const v of varsIn(p.decl.value))
        values.set(v.name, getComputedStyle(p.el, p.pseudo).getPropertyValue(v.name).trim() || v.fallback || "");
      const before = read(p.el, p.pseudo, p.names);
      const moved = new Set<string>();
      let back = true;
      for (const pass of [0, 1]) {
        if (moved.size === p.names.length) break;
        const kept = Array.from(values.keys(), (n) => [
          n,
          p.el.style.getPropertyValue(n),
          p.el.style.getPropertyPriority(n),
        ]);
        for (const [n, v] of values) p.el.style.setProperty(n, sentinel(v, pass));
        read(p.el, p.pseudo, p.names).forEach((v, i) => {
          if (v !== before[i]) moved.add(p.names[i]);
        });
        for (const [n, value, priority] of kept) {
          if (value) p.el.style.setProperty(n, value, priority);
          else p.el.style.removeProperty(n);
        }
        if (read(p.el, p.pseudo, p.names).some((v, i) => v !== before[i])) back = false;
      }
      answer.reads += 1;
      const said = [...values.keys()].join(", ");
      const kept = p.names.flatMap((n, i) => (moved.has(n) ? [] : [`${n} at ${before[i]}`]));
      if (kept.length === p.names.length)
        answer.failures.push(
          `${p.entry}: ${p.at} ${p.decl.prop}: planting ${said} changed nothing (${kept.join(", ")})`,
        );
      else if (kept.length)
        answer.failures.push(
          `${p.entry}: ${p.at} ${p.decl.prop}: planting ${said} left ${kept.join(", ")}: another rule keeps it`,
        );
      if (!back) answer.failures.push(`${p.entry}: ${p.at} ${p.decl.prop}: ${said} taken away, it did not come back`);
    };

    document.body.appendChild(shelf);
    try {
      const plans = kitFigures.filter((f) => !otherWidth(f)).flatMap(plansFor);
      const motion = (p: Plant) => p.names.some((n) => MOTION.test(n));
      plans.filter((p) => !motion(p)).forEach(plant);
      moving(ask.still, () => plans.filter(motion).forEach(plant));
    } finally {
      shelf.remove();
    }
    for (const what of lost)
      answer.failures.push(
        `${what}: the CSSOM keeps no words for it, a var() shorthand overridden in part in its own rule, so no plant can read it`,
      );
    return answer;
  }

  /* ---- twins ---- */

  if (ask.check === "twins") {
    const LIMIT = 25;
    const rules = kitRules().filter((r) => r.holds);
    // Every longhand the browser computes, but the logical ones (inline-size, padding-inline-start…): in this page's
    // one writing mode each says a physical one again, and writing-mode and direction are compared themselves, so a
    // twin's `except` names the physical longhand alone.
    const LOGICAL =
      /(?:^|-)(?:inline|block)(?:-|$)|^border-(?:start|end)-(?:start|end)-radius$|^corner-(?:start|end)-(?:start|end)-shape$/;
    const root = getComputedStyle(document.documentElement);
    const every: string[] = [];
    for (let i = 0; i < root.length; i += 1)
      if (!root[i].startsWith("--") && !LOGICAL.test(root[i])) every.push(root[i]);
    const laid = new Set(ask.laidOut);
    const within = (a: string, b: string) => Math.abs(Number(a) - Number(b)) <= ask.tolerance + Number.EPSILON;
    // Two laid-out values that say the same but for lengths within the tolerance ("12.5px 8px"), as the recorder holds a
    // pseudo-element's.
    const nearly = (a: string, b: string) => {
      const x = a.split(/(-?\d*\.?\d+)px/);
      const y = b.split(/(-?\d*\.?\d+)px/);
      return x.length === y.length && x.every((s, i) => (i % 2 ? within(s, y[i]) : s === y[i]));
    };
    const draws = (el: Element, pseudo: string) =>
      !["none", "normal"].includes(getComputedStyle(el, pseudo).getPropertyValue("content"));
    const shows = (el: Element) =>
      (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !!el.placeholder && !el.value;
    // The pseudo-elements a pair is compared by: the ones either side draws, a first letter, a list item's marker, a
    // placeholder shown, and any a kit selector names for the kit's element.
    const pseudosOf = (k: Element, s: Element, named: Iterable<string>) => {
      const out = new Set<string>(["::first-letter", ...named]);
      for (const p of ["::before", "::after"]) if (draws(k, p) || draws(s, p)) out.add(p);
      if ([k, s].some((el) => getComputedStyle(el).display.includes("list-item"))) out.add("::marker");
      if (shows(k) || shows(s)) out.add("::placeholder");
      return [...out];
    };

    type Compare = { entry: string; twin: string; at: string; k: Element; s: Element; pseudo: string | null };
    const found = new Map<string, string[]>();
    const say = (entry: string, line: string) => found.set(entry, [...(found.get(entry) ?? []), line]);
    // One element's or pseudo-element's longhands, both sides: a pseudo-element's difference where its element's same
    // longhand differs too, computed or as the layout resolves it (a line height from a size), is the element's, said
    // once.
    // A longhand that takes the text's colour (a border's, an outline's, the caret's: currentcolor) and differs by the
    // colour's own two values is the colour's difference, said once, on `color`.
    const colourOf = (el: Element, pseudo: string | null) => read(el, pseudo, ["color"])[0];
    const compare = (c: Compare, names: string[], differs: Set<string>) => {
      const mine = read(c.k, c.pseudo, names);
      const theirs = read(c.s, c.pseudo, names);
      if (!c.pseudo) {
        const a = getComputedStyle(c.k);
        const b = getComputedStyle(c.s);
        for (const n of names) if (a.getPropertyValue(n) !== b.getPropertyValue(n)) differs.add(n);
      }
      const colours = [colourOf(c.k, c.pseudo), colourOf(c.s, c.pseudo)];
      const followsColour = (n: string, i: number) =>
        n !== "color" && colours[0] !== colours[1] && mine[i] === colours[0] && theirs[i] === colours[1];
      names.forEach((n, i) => {
        if (mine[i] === theirs[i] || followsColour(n, i)) return;
        if (c.pseudo && (differs.has(n) || (laid.has(n) && nearly(mine[i], theirs[i])))) return;
        if (!c.pseudo) differs.add(n);
        say(c.entry, `${c.entry}: ${c.at} ${n}: ${mine[i]} against ${theirs[i]} in ${c.twin}`);
      });
    };
    const later: (() => void)[] = [];
    for (const f of kitFigures) {
      const twin = f.dataset.twin;
      if (!twin || otherWidth(f)) continue;
      const entry = f.dataset.entry as string;
      const source = figures.find((x) => x.dataset.entry === twin && x.hasAttribute("data-source"));
      if (!source) {
        answer.failures.push(`${entry}: its twin ${twin} is no source entry on the page`);
        continue;
      }
      const ks = drawnBy(f);
      const ss = drawnBy(source);
      if (ks.length !== ss.length) {
        answer.failures.push(`${entry}: ${ks.length} elements against ${ss.length} in ${twin}`);
        continue;
      }
      answer.pairs += ks.length;
      const except = new Set((f.dataset.except ?? "").split(/\s+/).filter(Boolean));
      const names = every.filter((n) => !except.has(n));
      const still = names.filter((n) => !MOTION.test(n));
      const motion = names.filter((n) => MOTION.test(n));
      const hits = hitsOn(rules, new Set(ks));
      ks.forEach((k, i) => {
        const s = ss[i];
        const at = pathOf(k, stageOf(f));
        const differs = new Set<string>();
        const own: Compare = { entry, twin, at, k, s, pseudo: null };
        compare(own, still, differs);
        later.push(() => compare(own, motion, differs));
        const named = (hits.get(k) ?? []).flatMap((h) => (h.sel.pseudo ? [h.sel.pseudo] : []));
        for (const pseudo of pseudosOf(k, s, named)) {
          if (!getComputedStyle(k, pseudo).length || !getComputedStyle(s, pseudo).length) {
            say(entry, `${entry}: ${at}${pseudo}: the browser reads no style for it, so it cannot be compared`);
            continue;
          }
          const c: Compare = { entry, twin, at: `${at}${pseudo}`, k, s, pseudo };
          compare(c, still, differs);
          later.push(() => compare(c, motion, differs));
        }
      });
      if (f.dataset.boxes === "true") {
        const kStage = (stageOf(f) as Element).getBoundingClientRect();
        const sStage = (stageOf(source) as Element).getBoundingClientRect();
        ks.forEach((k, i) => {
          const a = k.getBoundingClientRect();
          const b = ss[i].getBoundingClientRect();
          const mine = [a.left - kStage.left, a.top - kStage.top, a.width, a.height];
          const theirs = [b.left - sStage.left, b.top - sStage.top, b.width, b.height];
          if (mine.some((v, j) => Math.abs(v - theirs[j]) > ask.tolerance + Number.EPSILON))
            say(
              entry,
              `${entry}: ${pathOf(k, stageOf(f))}'s box ${mine.map((v) => v.toFixed(2)).join(" ")} against ` +
                `${theirs.map((v) => v.toFixed(2)).join(" ")} in ${twin} (left, top, width, height)`,
            );
        });
      }
    }
    moving(ask.still, () => later.forEach((run) => run()));
    for (const [entry, lines] of found) {
      answer.failures.push(...lines.slice(0, LIMIT));
      if (lines.length > LIMIT) answer.failures.push(`${entry}: and ${lines.length - LIMIT} more differences`);
    }
    return answer;
  }
  return answer;
}

/**
 * Where a toast raised over an open sheet stands on the sheet's foot, the Save a person reaches for straight after the
 * act the toast confirms: in each kit entry that draws an open sheet with a foot and a toast, how many toasts were
 * compared with a foot, and a sentence for each whose box meets the foot's, naming the entry and both boxes (left, top,
 * right, bottom). A sheet on its way out (data-leaving) is none a toast has to clear.
 */
export function toastsOverFeet(): { pairs: number; over: string[] } {
  const found = { pairs: 0, over: [] as string[] };
  const edges = (r: DOMRect) => [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)).join(" ");
  const meet = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const figure of Array.from(document.querySelectorAll<HTMLElement>("[data-entry]:not([data-source])"))) {
    const foot = figure.querySelector(".sheet:not([data-leaving]) .rec-sheet-foot");
    if (!foot) continue;
    for (const toast of Array.from(figure.querySelectorAll(".pp-toast"))) {
      found.pairs += 1;
      const [t, f] = [toast.getBoundingClientRect(), foot.getBoundingClientRect()];
      if (meet(t, f))
        found.over.push(`${figure.dataset.entry}: a toast (${edges(t)}) on the sheet's foot (${edges(f)})`);
    }
  }
  return found;
}

/**
 * Whether a key's focus shows on every control a kit entry draws, the look's promise to keep the house's ring
 * (components.css, NUANCE PASS). Each element of a kit entry a key can reach (a button, a link, a field, a tabindex of
 * 0 or more) is focused as a key focuses it: focus() on a page no pointer has pressed, which the browser counts as a
 * key's focus, and which is checked (:focus-visible). It must change its box-shadow or its outline, or an ancestor's
 * inside its entry's stage must (a field's ring is its box's, drawn by :focus-within). Each that changes neither is a
 * sentence. What it cannot see: a ring drawn by a border or a ground alone, and whether the ring stands out from what
 * is under it.
 */
export function focusRings(): { focusables: number; failures: string[] } {
  const found = { focusables: 0, failures: [] as string[] };
  const REACHABLE =
    'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), ' +
    'textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
  const RING = ["box-shadow", "outline-style", "outline-width", "outline-color"];
  const name = (el: Element) => `${el.localName}${Array.from(el.classList, (c) => `.${c}`).join("")}`;
  for (const figure of Array.from(document.querySelectorAll<HTMLElement>("[data-entry]:not([data-source])"))) {
    const stage = figure.querySelector(":scope > .gx-stage");
    if (!stage) continue;
    for (const el of Array.from(stage.querySelectorAll<HTMLElement>(REACHABLE))) {
      if (el.closest("[inert], [hidden]") || !el.getClientRects().length) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      const chain: Element[] = [];
      for (let e: Element | null = el; e && e !== stage; e = e.parentElement) chain.push(e);
      const read = () =>
        chain.map((e) => {
          const cs = getComputedStyle(e);
          return RING.map((p) => cs.getPropertyValue(p)).join(" | ");
        });
      const at = `${figure.dataset.entry}: ${[...chain].reverse().map(name).join(" > ")}`;
      const rest = read();
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) {
        found.failures.push(`${at} takes no focus`);
        continue;
      }
      found.focusables += 1;
      if (!el.matches(":focus-visible")) found.failures.push(`${at} is focused, but not as a key focuses it`);
      else if (read().every((v, i) => v === rest[i])) found.failures.push(`${at} draws no ring when a key focuses it`);
      el.blur();
    }
  }
  return found;
}

/** A word of a kit entry as the contrast check reads it (placeEntry): what draws it, and its box inside the shot. */
export type KitWord = {
  at: string;
  text: string;
  /** Its colour as the browser resolves it, sRGB 0 to 255 and an alpha 0 to 1. */
  rgba: number[];
  /** The opacity it is drawn at: its own element's times every ancestor's. */
  opacity: number;
  /** 24px, or 18.66px at a bold weight: WCAG's large text, which needs 3:1. */
  large: boolean;
  /** Inside a control that cannot be used (disabled, aria-disabled, a role's gate), which WCAG does not hold. */
  exempt: boolean;
  /** Left, top, right, bottom, in CSS pixels from the shot's corner. */
  box: number[];
};

/** The class that hides every word of the gallery's entries while the contrast check shoots what is under them. */
export const NO_WORDS = "gx-no-words";
export const NO_WORDS_CSS =
  `html.${NO_WORDS} [data-entry] > .gx-stage, html.${NO_WORDS} [data-entry] > .gx-stage *, ` +
  `html.${NO_WORDS} [data-entry] > .gx-stage *::before, html.${NO_WORDS} [data-entry] > .gx-stage *::after ` +
  "{ color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; " +
  "text-decoration-color: transparent !important; }";

/**
 * One kit entry, brought to the top of the window, where the look's strongest light stands (the blue pool: the ground
 * a light look's dark words and a dark look's light words read worst on), and its words read for the contrast check:
 * each text of the entry that says a letter or a number and is seen (the element at the middle of the words is theirs,
 * or holds them: words behind a wash, a sheet or a picture are not on their own ground), with its colour, opacity, size
 * and box in the shot. Then the words are hidden (NO_WORDS), so what the spec shoots next is the ground alone;
 * groundsUnder shows them again.
 */
export function placeEntry(ask: { entry: string; hide: string }): {
  clip: { x: number; y: number; width: number; height: number } | null;
  words: KitWord[];
} {
  const entry = ask.entry;
  const figure = document.querySelector(`[data-entry="${CSS.escape(entry)}"]`);
  const stage = figure?.querySelector(":scope > .gx-stage");
  if (!stage) return { clip: null, words: [] };
  window.scrollTo(0, window.scrollY + stage.getBoundingClientRect().top - 8);
  const s = stage.getBoundingClientRect();
  const x = Math.max(0, Math.floor(s.left));
  const y = Math.max(0, Math.floor(s.top));
  const width = Math.min(innerWidth, Math.ceil(s.right)) - x;
  const height = Math.min(innerHeight, Math.ceil(s.bottom)) - y;
  if (width < 2 || height < 2) return { clip: null, words: [] };
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const rgba = (c: string) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const name = (el: Element) => `${el.localName}${Array.from(el.classList, (c) => `.${c}`).join("")}`;
  const words: KitWord[] = [];
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").trim();
    const el = n.parentElement;
    if (!el || !/[\p{L}\p{N}]/u.test(text)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    const box = [Math.max(r.left, x), Math.max(r.top, y), Math.min(r.right, x + width), Math.min(r.bottom, y + height)];
    if (box[2] - box[0] < 2 || box[3] - box[1] < 4) continue;
    const hit = document.elementFromPoint((box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
    // Its own element, or one holding it: a child over the words (a face's picture over its initials) hides them.
    if (!hit || !(hit === el || hit.contains(el))) continue;
    let opacity = 1;
    for (let e: Element | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    const size = parseFloat(cs.fontSize);
    const chain: Element[] = [];
    for (let e: Element | null = el; e && e !== stage; e = e.parentElement) chain.unshift(e);
    words.push({
      at: `${entry}: ${chain.map(name).join(" > ")}`,
      text: text.slice(0, 32),
      rgba: rgba(cs.color),
      opacity,
      large: size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700),
      exempt: !!el.closest(':disabled, [aria-disabled="true"], [data-gated]'),
      box: box.map((v, i) => Math.round(v - (i % 2 ? y : x))),
    });
  }
  document.documentElement.classList.add(ask.hide);
  return { clip: { x, y, width, height }, words };
}

/**
 * Each word's contrast on what was drawn under it, from the shot the spec took with the words hidden (placeEntry): the
 * ground is the median, by luminance, of the pixels in the words' box; the words are their colour laid over it at their
 * alpha and opacity; the ratio is WCAG's. `width` is the shot's in CSS pixels, so a shot taken at a device scale over
 * 1 is read where the words are. Shows the words again first.
 */
export async function groundsUnder(ask: { png: string; width: number; words: KitWord[]; hide: string }) {
  document.documentElement.classList.remove(ask.hide);
  const bytes = Uint8Array.from(atob(ask.png), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const scale = bitmap.width / ask.width;
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (p: number[]) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (hi + 0.05) / (lo + 0.05);
  };
  return ask.words.map((w) => {
    const px: number[][] = [];
    const [left, top, right, bottom] = w.box.map((v) => Math.round(v * scale));
    for (let y = Math.max(0, top); y < Math.min(bitmap.height, bottom); y += 1)
      for (let x = Math.max(0, left); x < Math.min(bitmap.width, right); x += 1) {
        const i = (y * bitmap.width + x) * 4;
        px.push([data[i], data[i + 1], data[i + 2]]);
      }
    if (!px.length) return { ...w, ratio: null, ground: null, need: w.large ? 3 : 4.5 };
    px.sort((a, b) => lum(a) - lum(b));
    const ground = px[Math.floor(px.length / 2)];
    const a = w.rgba[3] * w.opacity;
    const fg = ground.map((c, k) => w.rgba[k] * a + c * (1 - a));
    return { ...w, ratio: Math.round(ratio(fg, ground) * 100) / 100, ground, need: w.large ? 3 : 4.5 };
  });
}
