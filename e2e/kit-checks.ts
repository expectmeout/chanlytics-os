/**
 * The kit gallery's checks as they run in the page: e2e/kit.spec.ts hands `kitChecks` to page.evaluate, as
 * tooling/scripts/checks/style-equality.mjs hands over its walk. It is one function, whole, because page.evaluate
 * sends a function's source and nothing it closes over: every helper it needs is declared inside it.
 *
 * A kit rule is a style rule of the stylesheet whose path ends `ask.sheet` (surfaces/kit/kit.css), read from the CSSOM,
 * inside the @media and @supports rules whose condition holds now, and never inside @starting-style or @keyframes. A
 * kit entry is a figure `[data-entry]` with no `data-source` (tooling/scripts/e2e-harness/kit-gallery.mjs), and what it
 * draws is every element in its `.gx-stage`.
 *
 *   classes  every name asked about is drawn by a kit entry;
 *   rules    every kit rule, whether its media holds now, whether its selectors are all a press's, and whether it
 *            matches an element of a kit entry: the spec unions three contexts;
 *   tokens   each declaration a kit rule makes with a var() is planted where it wins on an element (the cascade among
 *            the kit's rules: importance, specificity, order), on the longhands its tokens feed: each token it reads
 *            is written on the element, and those longhands, read before, planted and after, must change and then
 *            come back. A var() with no fallback must name a token defined there, and an entry some kit rule draws
 *            must read a token;
 *   twins    a kit entry and its source, element by element in document order: every longhand the kit rules matching
 *            the kit element set computes the same on both, but those in `data-except`, and with `data-boxes` each box
 *            stands within the tolerance, relative to its stage.
 * Motion (animation, transition and the caret) is read with the spec's still stylesheet off, since it stops them with
 * !important; everything else with it on, so a transition never shows a value on its way.
 */

export type Width = "desk" | "phone";

export type KitAsk =
  | { check: "classes"; classes: string[] }
  | { check: "rules"; sheet: string }
  | { check: "tokens"; sheet: string; width: Width; still: string }
  | { check: "twins"; sheet: string; width: Width; still: string; tolerance: number };

/** A rule of the kit's stylesheet as one context saw it. */
export type SeenRule = { key: string; selector: string; media: string; press: boolean; drawn: boolean };

export type KitAnswer = {
  /** What is wrong, each a sentence that names the entry, the element and what differs. */
  failures: string[];
  /** classes: the names no entry draws. */
  missing: string[];
  /** rules: every rule of the kit's stylesheet. */
  rules: SeenRule[];
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

  const PSEUDOS = ["::before", "::after", "::first-letter", "::placeholder"];
  const PRESS = /:(?:hover|active|focus|focus-visible|focus-within)(?![\w-])/i;
  const MOTION = /^(?:animation|transition)(?:-|$)|^caret-color$/;
  const LEGACY_ELEMENTS = ["before", "after", "first-letter", "first-line"];

  const answer: KitAnswer = {
    failures: [],
    missing: [],
    rules: [],
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
  // One selector of a list: what it matches with its pseudo-element taken off, and which pseudo-element it styles.
  const TAIL = /(?:::[\w-]+|:(?:before|after|first-letter|first-line))$/i;
  const shape = (text: string): Shape => {
    const m = text.match(TAIL);
    const base = m ? text.slice(0, m.index).trim() : text;
    return {
      text,
      base: !base || /[>+~]$/.test(base) ? `${base}*` : base,
      pseudo: m ? `::${m[0].replace(/^:+/, "").toLowerCase()}` : null,
      press: PRESS.test(text),
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
    const walk = (list: CSSRuleList, media: string[], holds: boolean, key: string) => {
      Array.from(list).forEach((r, i) => {
        const at = key ? `${key}.${i}` : `${i}`;
        if (r instanceof CSSStyleRule) {
          const selectors = parts(r.selectorText, ",").map(shape);
          out.push({ key: at, rule: r, media: media.join(" "), holds, order: out.length, selectors });
        } else if (r instanceof CSSMediaRule) {
          const text = r.media.mediaText;
          walk(r.cssRules, [...media, `@media ${text}`], holds && matchMedia(text).matches, at);
        } else if (r instanceof CSSSupportsRule) {
          walk(r.cssRules, [...media, `@supports ${r.conditionText}`], holds && CSS.supports(r.conditionText), at);
        } else if (r.constructor.name === "CSSLayerBlockRule") {
          walk((r as CSSGroupingRule).cssRules, media, holds, at);
        }
        // @starting-style, @keyframes, @font-face and the rest hold no kit rule.
      });
    };
    walk(sheet.cssRules, [], true, "");
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
      const live = r.selectors.filter((s) => !s.press);
      let drawn = false;
      for (const s of r.holds ? live : []) {
        try {
          drawn = drawn || Array.from(document.querySelectorAll(s.base)).some((el) => els.has(el));
        } catch {
          // The browser cannot match it, so nothing draws it.
        }
      }
      answer.rules.push({ key: r.key, selector: r.rule.selectorText, media: r.media, press: !live.length, drawn });
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
  // A longhand's computed value: the Typed OM's for an element, so a floor (a coarse pointer's 44px min-height) does
  // not hide what a rule set; a pseudo-element has none, and is read resolved.
  const read = (el: Element, pseudo: string | null, names: string[]) => {
    const cs = getComputedStyle(el, pseudo);
    if (pseudo) return names.map((n) => cs.getPropertyValue(n));
    const map = el.computedStyleMap();
    return names.map((n) => {
      if (n.startsWith("--")) return cs.getPropertyValue(n);
      try {
        const v = map.get(n);
        return v === null || v === undefined ? cs.getPropertyValue(n) : String(v);
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
  // a shadow, or a word no property of the kit takes as it is, which leaves the property invalid where it is read. A
  // word, not `initial`: an inherited property left invalid takes its parent's value, which is most often the same.
  const sentinel = (value: string) => {
    if (!value || /^(?:initial|inherit|unset|revert|revert-layer)$/i.test(value)) return "gx-planted";
    if (CSS.supports("color", value)) return "rgb(1, 2, 3)";
    if (/\d/.test(value) && CSS.supports("width", value)) return "7.5px";
    if (CSS.supports("transition-duration", value)) return "7ms";
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return "7";
    if (CSS.supports("box-shadow", value)) return "rgb(1, 2, 3) 0px 0px 0px 7px";
    return "gx-planted";
  };

  if (ask.check === "tokens") {
    type Plant = { entry: string; el: HTMLElement; pseudo: string | null; decl: Decl; names: string[]; at: string };
    const rules = kitRules().filter((r) => r.holds);
    const lost = new Set<string>();

    // For each longhand of an element (or of its pseudo-element), the declaration the cascade takes among the kit's
    // rules: the important one, then the most specific rule (at its most specific selector that matches), then the
    // latest rule, then the latest declaration in it.
    const winners = (hits: Hit[], pseudo: string | null) => {
      const mine = new Map<KitRule, number[]>();
      for (const h of hits) {
        if (h.sel.pseudo !== pseudo) continue;
        const was = mine.get(h.rule);
        if (!was || beats(h.sel.spec, was) > 0) mine.set(h.rule, h.sel.spec);
      }
      const won = new Map<string, { decl: Decl; rule: KitRule; spec: number[] }>();
      for (const [rule, spec] of mine) {
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
            if (order > 0) won.set(name, { decl, rule, spec });
          }
        }
      }
      // Each declaration that reads a token, with the longhands it takes.
      const byDecl = new Map<Decl, string[]>();
      for (const [name, w] of won)
        if (/var\(/.test(w.decl.value)) byDecl.set(w.decl, [...(byDecl.get(w.decl) ?? []), name]);
      return byDecl;
    };

    // Which of a declaration's longhands its tokens feed: `border: 1px solid var(--line)` feeds the colours and not the
    // widths, and another kit rule may take the colours (.btn-primary does). Found on an element of the check's own,
    // off the page, with the declaration written on it !important (inline and important, so no rule reaches it) and the
    // tokens at their values where it is read: each token planted alone, and every longhand that moves is fed.
    const shelf = document.createElement("div");
    shelf.setAttribute("aria-hidden", "true");
    shelf.style.cssText = "position: absolute; left: -10000px; top: 0; width: 0; height: 0; overflow: hidden;";
    const lab = shelf.appendChild(document.createElement("div"));
    const fedBy = (decl: Decl, names: string[], values: Map<string, string>) => {
      lab.style.cssText = "";
      for (const [n, v] of values) if (v) lab.style.setProperty(n, v);
      lab.style.setProperty(decl.prop, decl.value, "important");
      const real = read(lab, null, names);
      const fed = new Set<string>();
      for (const v of varsIn(decl.value)) {
        const was = values.get(v.name) ?? "";
        lab.style.setProperty(v.name, sentinel(was || v.fallback || ""));
        read(lab, null, names).forEach((value, i) => {
          if (value !== real[i]) fed.add(names[i]);
        });
        if (was) lab.style.setProperty(v.name, was);
        else lab.style.removeProperty(v.name);
      }
      return names.filter((n) => fed.has(n));
    };

    // What each entry reads: a plant for every declaration whose tokens draw something on one of its elements.
    const plansFor = (f: HTMLElement): Plant[] => {
      const entry = f.dataset.entry as string;
      const els = drawnBy(f);
      const hits = hitsOn(rules, new Set(els));
      const plans: Plant[] = [];
      for (const el of els) {
        for (const pseudo of [null, ...PSEUDOS]) {
          const at = `${pathOf(el, stageOf(f))}${pseudo ?? ""}`;
          const here = getComputedStyle(el, pseudo);
          for (const [decl, names] of winners(hits.get(el) ?? [], pseudo)) {
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
      if (!hits.size) answer.exempt.push(entry);
      else if (!plans.length) answer.failures.push(`${entry}: its kit rules read no token`);
      return plans;
    };

    // One plant: read, write each token on the element, read, put it back as it was, read.
    const plant = (p: Plant) => {
      const tokens = new Map<string, string>();
      for (const v of varsIn(p.decl.value)) {
        const now = getComputedStyle(p.el, p.pseudo).getPropertyValue(v.name).trim();
        tokens.set(v.name, sentinel(now || v.fallback || ""));
      }
      const kept = Array.from(tokens.keys(), (n) => [
        n,
        p.el.style.getPropertyValue(n),
        p.el.style.getPropertyPriority(n),
      ]);
      const before = read(p.el, p.pseudo, p.names);
      for (const [n, s] of tokens) p.el.style.setProperty(n, s);
      const planted = read(p.el, p.pseudo, p.names);
      for (const [n, value, priority] of kept) {
        if (value) p.el.style.setProperty(n, value, priority);
        else p.el.style.removeProperty(n);
      }
      const after = read(p.el, p.pseudo, p.names);
      answer.reads += 1;
      const said = [...tokens.keys()].join(", ");
      if (planted.every((v, i) => v === before[i]))
        answer.failures.push(
          `${p.entry}: ${p.at} ${p.decl.prop}: planting ${said} changed nothing (${p.names.join(", ")}: ${before.join(" | ")})`,
        );
      if (after.some((v, i) => v !== before[i]))
        answer.failures.push(`${p.entry}: ${p.at} ${p.decl.prop}: ${said} taken away, it did not come back`);
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
    const rules = kitRules().filter((r) => r.holds);
    type Pair = {
      entry: string;
      twin: string;
      k: Element;
      s: Element;
      pseudo: string | null;
      names: string[];
      at: string;
    };
    const pairs: Pair[] = [];
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
      const hits = hitsOn(rules, new Set(ks));
      ks.forEach((k, i) => {
        for (const pseudo of [null, ...PSEUDOS]) {
          const names = new Set<string>();
          for (const h of hits.get(k) ?? []) {
            if (h.sel.pseudo !== pseudo) continue;
            for (const n of Array.from(h.rule.rule.style)) if (!n.startsWith("--") && !except.has(n)) names.add(n);
          }
          const at = `${pathOf(k, stageOf(f))}${pseudo ?? ""}`;
          if (names.size) pairs.push({ entry, twin, k, s: ss[i], pseudo, names: [...names], at });
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
            answer.failures.push(
              `${entry}: ${pathOf(k, stageOf(f))}'s box ${mine.map((v) => v.toFixed(2)).join(" ")} against ` +
                `${theirs.map((v) => v.toFixed(2)).join(" ")} in ${twin} (left, top, width, height)`,
            );
        });
      }
    }
    const compare = (p: Pair, names: string[]) => {
      const mine = getComputedStyle(p.k, p.pseudo);
      const theirs = getComputedStyle(p.s, p.pseudo);
      for (const n of names) {
        const a = mine.getPropertyValue(n);
        const b = theirs.getPropertyValue(n);
        if (a !== b) answer.failures.push(`${p.entry}: ${p.at} ${n}: ${a} against ${b} in ${p.twin}`);
      }
    };
    pairs.forEach((p) =>
      compare(
        p,
        p.names.filter((n) => !MOTION.test(n)),
      ),
    );
    moving(ask.still, () =>
      pairs.forEach((p) =>
        compare(
          p,
          p.names.filter((n) => MOTION.test(n)),
        ),
      ),
    );
    return answer;
  }
  return answer;
}
