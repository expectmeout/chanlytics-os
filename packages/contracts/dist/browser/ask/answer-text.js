const TAG_CUT = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
export function cleanAnswer(raw) {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}
const NOT_AN_END = new Set(
  "mr mrs ms dr st sr sra srta jr vs no etc approx inc ltd co ave blvd mt ft jan feb mar apr jun jul aug sep sept oct nov dec ene abr ago dic".split(
    " "
  )
);
const HEADLINE_STOP = /[.!?]["'”’)\]]*\s+(?=[\p{Lu}\d¿¡"“'‘(])/gu;
export function firstSentence(s) {
  for (const m of s.matchAll(HEADLINE_STOP)) {
    const before = /[\p{L}.]+$/u.exec(s.slice(0, m.index))?.[0] ?? "";
    if (m[0][0] === "." && (before.length === 1 || before.includes(".") || NOT_AN_END.has(before.toLowerCase())))
      continue;
    const stop = m[0].trimEnd().length;
    return [s.slice(0, m.index + stop), s.slice(m.index + m[0].length)];
  }
  return [s, ""];
}
export function isUngrounded(answer, reads) {
  return reads === 0 && /\d/.test(answer);
}
export function sameQuestion(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}
export function nextNotAsked(next, asked) {
  return next.filter((q) => !asked.some((a) => sameQuestion(a, q)));
}
export function navigateLabel(nav, language) {
  if (!nav || !nav.to) return null;
  const es = language === "es";
  if (/^conversations\/cv-/.test(nav.to)) return es ? "Abrir la llamada" : "Open the call";
  if (/^inbox\/th-/.test(nav.to)) return es ? "Abrir el hilo" : "Open the thread";
  if (/^clients\/[0-9a-f-]{36}$/.test(nav.to)) return es ? "Abrir el perfil" : "Open the profile";
  return nav.label || (es ? "Abrir" : "Open");
}
export const FOLLOWUP_ECHO = [
  [/profile|perfil/i, /^clients\//],
  [/transcript|recording|grabaci|transcripci|the call|la llamada/i, /^conversations\/cv-/],
  [/thread|hilo|conversation/i, /^inbox\/th-/]
];
export const unquoted = (s) => (s ?? "").replace(/“[^”]*”|"[^"]*"|«[^»]*»/g, "\u2026").replace(/(^|[\s:(])'[^']*\s[^']*'/g, "$1\u2026");
const WRITE_CLAIMS = [
  /(?<!\b(?:should|shall|can|could|may|might|will|would|do|did)\s)\bI(?: have|['’]ve)? (?:sent|changed|updated|closed|snoozed|resolved|archived|invited|paused|deleted|approved|resumed|renamed|started|set up|turned on|scheduled|added|merged|recorded|replied|enrolled)\b(?!\s+(?:nothing|none|no)\b)/i,
  /\bhe (?:enviado|cambiado|actualizado|cerrado|aprobado|pausado|iniciado|configurado|programado|añadido|agregado|fusionado|registrado|respondido|inscrito)\b/i,
  /(?<![\p{L}\p{N}])aprob[eé](?![\p{L}\p{N}])/iu,
  /(?:^|[.!?]\s+)(?:all\s+)?done[,.!]/i
];
export const claimsWrite = (text) => WRITE_CLAIMS.some((re) => re.test(unquoted(text)));
const INLINE = /\*\*(.+?)\*\*|__(.+?)__|(?<![\p{L}\p{N}*])\*(?!\s)(.+?)(?<!\s)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?!\s)(.+?)(?<!\s)_(?![\p{L}\p{N}_])|\[([^\]\n]+)\]\(([^)\s]*)\)|`([^`\n]+)`/gu;
const DOOR = /^ask:([a-z][\w-]*(?:[/:?=&.%-][\w:/?=&.%-]*)?)$/i;
export function answerRuns(line) {
  const out = [];
  let at = 0;
  const plain = (s) => {
    if (s) out.push({ text: s });
  };
  for (const m of line.matchAll(INLINE)) {
    plain(line.slice(at, m.index));
    const [, b1, b2, i1, i2, link, target, code] = m;
    const to = link && target && !target.includes("//") ? DOOR.exec(target)?.[1] : void 0;
    if (b1 ?? b2) out.push(...answerRuns(b1 ?? b2 ?? "").map((r) => ({ ...r, bold: true })));
    else if (i1 ?? i2) out.push(...answerRuns(i1 ?? i2 ?? "").map((r) => ({ ...r, italic: true })));
    else if (link && to) out.push({ text: link, to });
    else plain(link ?? code ?? "");
    at = (m.index ?? 0) + m[0].length;
  }
  plain(line.slice(at));
  return out;
}
export function answerDoors(text, ground) {
  return text.replace(/\[([^\]\n]+)\]\(([^)\s]*)\)/g, (_, words, target) => {
    const to = target ? ground(target.replace(/^ask:/i, ""), words) : null;
    return to ? `[${words}](ask:${to})` : words;
  });
}
const LIST_LINE = /^(\s*)(?:([-*•])|(\d{1,2})[.)])\s+(.*)$/;
const QUOTE_LINE = /^\s*>\s?(.*)$/;
const CALLOUT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i;
const HEADING = /^#{1,6}\s+(.+?)\s*#*$/;
const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const NUMBER_CELL = /^[-+]?[$€£]?\d[\d,.\s]*(%|[kKmM]|\s?(?:min|h|s))?$/;
const LIST_DEPTH = 3;
const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
function listPointOf(line) {
  const m = LIST_LINE.exec(line);
  if (!m) return null;
  const [, lead = "", , number, words = ""] = m;
  return { indent: lead.replace(/\t/g, "  ").length, ordered: !!number, number: Number(number ?? 1), words };
}
const listFor = (point) => point.ordered && point.number > 1 ? { ordered: true, start: point.number, items: [] } : { ordered: point.ordered, items: [] };
function wordsListOf(lines) {
  const root = { ordered: false, items: [] };
  const stack = [];
  for (const raw of lines) {
    const point = listPointOf(raw);
    if (!point) {
      const last = stack.at(-1)?.list.items.at(-1);
      const quoted = QUOTE_LINE.exec(raw)?.[1]?.trim();
      if (last && quoted)
        last.runs.push({ text: " \u201C" }, ...answerRuns(quoted).map((r) => ({ ...r, italic: true })), {
          text: "\u201D"
        });
      else if (last) last.runs.push({ text: " " }, ...answerRuns(raw.trim()));
      continue;
    }
    const { indent } = point;
    while ((stack.at(-1)?.indent ?? -1) > indent) stack.pop();
    const top = stack.at(-1);
    const parent = top?.list.items.at(-1);
    let list;
    if (!top) {
      list = root;
      if (!root.items.length) Object.assign(root, listFor(point), { items: root.items });
      stack.push({ indent, list });
    } else if (indent > top.indent && parent && stack.length < LIST_DEPTH) {
      parent.sub = parent.sub ?? listFor(point);
      list = parent.sub;
      stack.push({ indent, list });
    } else list = top.list;
    list.items.push({ runs: answerRuns(point.words), sub: null });
  }
  return root;
}
function tableOf(headLine, bodyLines) {
  const head = cells(headLine);
  const rows = bodyLines.map((line) => {
    const r = cells(line);
    return head.map((_, k) => answerRuns(r[k] ?? ""));
  });
  const right = head.map((_, k) => rows.length > 0 && rows.every((r) => NUMBER_CELL.test(runsText(r[k] ?? []).trim())));
  return { kind: "table", head: head.map(answerRuns), rows, right };
}
function quoteOf(lines) {
  const said = lines.map((l) => QUOTE_LINE.exec(l)?.[1]?.trim() ?? "");
  const mark = CALLOUT.exec(said[0] ?? "");
  const rest = mark ? [mark[2] ?? "", ...said.slice(1)] : said;
  const runs = rest.filter(Boolean).map(answerRuns);
  if (!mark) return { kind: "quote", lines: runs };
  const tone = /^(NOTE|TIP)$/i.test(mark[1] ?? "") ? "note" : "warn";
  return { kind: "callout", tone, lines: runs };
}
export function answerBlocks(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const at = (i) => lines[i] ?? "";
  const blocks = [];
  let para = [];
  const endPara = () => {
    if (para.length) blocks.push({ kind: "text", lines: para });
    para = [];
  };
  for (let i = 0; i < lines.length; ) {
    const line = at(i);
    const heading = HEADING.exec(line.trim())?.[1];
    const first = listPointOf(line);
    if (!line.trim()) {
      endPara();
      i++;
    } else if (heading) {
      endPara();
      blocks.push({ kind: "heading", runs: answerRuns(heading) });
      i++;
    } else if (QUOTE_LINE.test(line)) {
      endPara();
      const run = [];
      for (; i < lines.length && QUOTE_LINE.test(at(i)); i++) run.push(at(i));
      const block = quoteOf(run);
      if (block.lines.length) blocks.push(block);
    } else if (TABLE_LINE.test(line) && TABLE_RULE.test(at(i + 1))) {
      endPara();
      const body = [];
      for (i += 2; i < lines.length && TABLE_LINE.test(at(i)); i++) body.push(at(i));
      blocks.push(tableOf(line, body));
    } else if (first) {
      endPara();
      const otherKind = (p) => !!p && p.indent <= first.indent && p.ordered !== first.ordered;
      const run = [];
      for (; i < lines.length && at(i).trim() && (LIST_LINE.test(at(i)) || /^\s+\S/.test(at(i))) && !(run.length && otherKind(listPointOf(at(i)))); i++)
        run.push(at(i));
      blocks.push({ kind: "list", list: wordsListOf(run) });
    } else {
      para.push(answerRuns(line.trim()));
      i++;
    }
  }
  endPara();
  return blocks;
}
export const opensWithBlock = (s) => /^\s*(?:#|[-*•]\s|\d{1,2}[.)]\s|\||>)/.test(s);
const runsText = (runs) => runs.map((r) => r.text).join("");
function listPlain(l, depth, spoken) {
  return l.items.flatMap((it, k) => {
    const mark = l.ordered ? `${(l.start ?? 1) + k}. ` : spoken ? "" : "\u2022 ";
    const pad = spoken ? "" : "  ".repeat(depth);
    return [`${pad}${mark}${runsText(it.runs)}`, ...it.sub ? listPlain(it.sub, depth + 1, spoken) : []];
  });
}
export function answerPlain(text, spoken = false) {
  const sep = spoken ? ", " : " \xB7 ";
  return answerBlocks(text).flatMap((b) => {
    if (b.kind === "text") return b.lines.map(runsText);
    if (b.kind === "heading") return [runsText(b.runs)];
    if (b.kind === "list") return listPlain(b.list, 0, spoken);
    if (b.kind === "quote") return b.lines.map((l) => spoken ? runsText(l) : `\u201C${runsText(l)}\u201D`);
    if (b.kind === "callout") return b.lines.map(runsText);
    return [b.head.map(runsText).join(sep), ...b.rows.map((r) => r.map(runsText).join(sep))];
  }).join("\n");
}
const NO_LIST = { style: "bullets", entries: [] };
function listLines(l) {
  return l.entries.map((e, i) => l.style === "numbers" ? `${i + 1}. ${e}` : l.style === "bullets" ? `\u2022 ${e}` : e);
}
export function answerText(a) {
  const own = a.form === "prose" || opensWithBlock(a.say.detail);
  const say = [a.say.headline, a.say.detail].filter(Boolean).join(own ? "\n" : " ");
  return answerPlain([say, ...listLines(a.show.list ?? NO_LIST)].filter(Boolean).join("\n"));
}
export function answerCopy(a) {
  const b = a.show.breakdown;
  return [
    answerText(a),
    ...b ? [`${b.total} ${b.label}: ${b.parts.map((p) => `${p.label} ${p.value}`).join(", ")}`] : [],
    ...a.show.figures.map((f) => `${[f.value, f.label].filter(Boolean).join(" ")}${f.note ? ` (${f.note})` : ""}`),
    ...a.show.items.map((it) => [it.title, it.meta, it.line].filter(Boolean).join(" \xB7 "))
  ].filter(Boolean).join("\n");
}
const sentences = (lines) => lines.map((l) => l.trim()).filter(Boolean).map((l) => /[.!?…:;,]$/.test(l) ? l : `${l}.`).join(" ");
export function listSpoken(l) {
  return sentences(l.entries.map((e, i) => l.style === "numbers" ? `${i + 1}. ${e}` : e));
}
export function answerSpoken(a) {
  const l = a.show.list ?? NO_LIST;
  const said = sentences([a.say.headline, ...answerPlain(a.say.detail, true).split("\n")]);
  return [said, listSpoken({ ...l, entries: l.entries.map((e) => answerPlain(e, true)) })].filter(Boolean).join(" ");
}
