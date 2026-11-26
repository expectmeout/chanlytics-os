/**
 * Whether a screen says what docs/words.md says: the words a person reads, read from the syntax tree, held to the
 * list of words that never reach a screen (_screen-words.mjs) and to the voice. The numbers check:debt holds
 * (WORD_RATCHETS), counted by who reads them; words.test.mjs holds what each one means.
 *
 * What a person reads is a string, a template's own text or a JSX text that is words: it holds a space between
 * letters, or opens with a capital (a label). An id, a key, a class, a route, a type and an unread attribute are not
 * (_ast.mjs idPlace), and neither is what only a developer reads: a thrown Error's text, a log line, a query, a
 * schema's note to the model. A line that must keep a word says why beside it, `screen-word: <why>`: on the line, in
 * the comment line over it, or in the comment over the declaration it stands in.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import ts from "typescript";
import { idPlace, parse, repoFiles } from "../../_ast.mjs";
import { FAMILIES, neverOnAScreen, voiceMarksIn } from "./_screen-words.mjs";

/** A route's key, `POST calendar/visits/[id]`: an id with a space in it, never a word. */
const ROUTE_KEY = /^(GET|POST|PUT|PATCH|DELETE) \S+$/;
/** A query, a style or a pattern written as a string: code a person never reads. */
const CODE_TEXT =
  /^\s*(select|insert into|update|delete from|with|create|alter|drop|grant|set local)\s|^(var|calc|rgba?|hsla?|translate[XY]?|scale|rotate|url|linear-gradient)\(|=>|^\s*[{[<(]|\$\d|::[a-z]/i;
/**
 * What a developer reads, by what it is handed to: an error's own text and a log line never reach an answer (decision
 * 0114), and neither do the notes a page's reads keep on why each table is left out (`declareReads`).
 */
const DEVELOPER_CALL =
  /^(Error|TypeError|RangeError|SyntaxError|DbFailure|causedBy|logFailure|logAndGoOn|invariant|assert|describe|it|test|declareReads)$|^(log|logger|console|assert)\b|\.(debug|info|warn|error|describe)$/;
/** A value a key holds as an id, whatever its words: a class, an address, a kind. */
const ID_KEY =
  /^(className|class|id|key|testId|testid|href|to|route|path|event|code|kind|type|variant|tone|icon|slug)$/;
/** A declaration named for what a model is told: its words are a prompt's, and no person reads them. */
const MODEL_NAME = /prompt|system|instruction/i;

const declaredName = (p) =>
  (ts.isVariableDeclaration(p) ||
    ts.isFunctionDeclaration(p) ||
    ts.isMethodDeclaration(p) ||
    ts.isPropertyAssignment(p)) &&
  p.name
    ? p.name.getText()
    : null;

/** Whether a string is said to a model where it stands: inside a declaration named for a prompt, at any depth. */
function modelPlace(node) {
  for (let p = node.parent; p; p = p.parent) {
    const name = declaredName(p);
    if (name && MODEL_NAME.test(name)) return true;
  }
  return false;
}

/** The entities a JSX text may write, as the screen draws each one. */
const ENTITIES = {
  amp: "&",
  apos: "'",
  quot: '"',
  lt: "<",
  gt: ">",
  nbsp: " ",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  middot: "·",
  mdash: "—",
  ndash: "–",
};

/** A JSX text as a person reads it: `Couldn&apos;t` is Couldn't, with no semicolon in it, and `&mdash;` is a dash. */
export const drawnText = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) =>
    name[0] === "#"
      ? String.fromCodePoint(/^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10))
      : (ENTITIES[name] ?? entity),
  );

/** Whether text is words: letters with a space between them, or a label that opens with a capital. */
export function isWords(text) {
  const t = text.trim();
  if (!/[A-Za-z]{2}/.test(t) || ROUTE_KEY.test(t) || CODE_TEXT.test(t)) return false;
  return /[A-Za-z]\s+[A-Za-z(“"']/.test(t) || /^[A-Z][a-z]/.test(t);
}

/** Whether text is prose: mostly whole words, so its length and its punctuation are a sentence's and not a list of ids. */
export function isProse(text) {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length < 3) return false;
  const wordy = tokens.filter((w) => /^[“"'(]?[A-Za-z][A-Za-z'’-]*[”"').,!?…:;]*$/.test(w)).length;
  return wordy / tokens.length >= 0.7;
}

const calleeOf = (call) => {
  const e = call.expression;
  return ts.isIdentifier(e) ? e.text : e.getText().replace(/\s+/g, "");
};

/** Whether a string is a developer's where it stands: handed to an Error, a log, a test or a schema's note, tagged, or an id's value. */
function developerPlace(node) {
  for (let n = node; n.parent; n = n.parent) {
    const p = n.parent;
    if (ts.isTaggedTemplateExpression(p)) return true;
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression !== n)
      return DEVELOPER_CALL.test(calleeOf(p));
    if (ts.isPropertyAssignment(p) && p.initializer === n && n === node && ID_KEY.test(p.name.getText())) return true;
    if (ts.isJsxAttribute(p) || ts.isJsxElement(p) || ts.isBlock(p) || ts.isSourceFile(p)) return false;
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p)) return false;
  }
  return false;
}

/** The doors a server's words leave by for a person: a refusal's own sentence, and the field an answer says it in. */
const REFUSAL_CALL = /^(AppError|refuse)$/;
const REFUSAL_KEY = /^(message|detail|error)$/;

/** Whether a string is a refusal's words where it stands: handed to AppError or refuse, or the value of a message, a detail or an error. */
function refusalPlace(node) {
  for (let n = node; n.parent; n = n.parent) {
    const p = n.parent;
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression !== n) return REFUSAL_CALL.test(calleeOf(p));
    if (ts.isPropertyAssignment(p) && p.initializer === n) return REFUSAL_KEY.test(p.name.getText());
    if (ts.isBlock(p) || ts.isSourceFile(p)) return false;
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isFunctionDeclaration(p)) return false;
  }
  return false;
}

/** What a `screen-word: <why>` over it keeps whole: a statement, a declaration, a property, an element of the markup. */
const keepsItsWords = (p) =>
  ts.isStatement(p) ||
  ts.isVariableDeclaration(p) ||
  ts.isPropertyAssignment(p) ||
  ts.isMethodDeclaration(p) ||
  ts.isJsxElement(p) ||
  ts.isJsxSelfClosingElement(p);

/**
 * Every run of words a file says to a person, as `{ line, text }`: a string or a template's own text (its `${…}` code
 * is no word, and reads as "…") outside an id's place, a developer's and a model's, and a JSX text. `only` narrows the
 * strings to a place (a refusal's). Words keep their place in the count's blind spot when a comment says why,
 * `screen-word: <why>`: on their line, on the comment line over it, or in the comment over the statement, the
 * declaration or the property they stand in, which keeps every word inside it.
 */
export function wordsReadIn(sf, { only = () => true } = {}) {
  const lines = sf.text.split(/\r?\n/);
  const saysWhy = (p) =>
    (ts.getLeadingCommentRanges(sf.text, p.getFullStart()) ?? []).some((c) =>
      /screen-word:/.test(sf.text.slice(c.pos, c.end)),
    );
  const kept = (node) => {
    const at = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    const above = (lines[at - 1] ?? "").trim();
    if (/screen-word:/.test(lines[at] ?? "") || (/^(\/\/|\/\*|\*|\{\/\*)/.test(above) && /screen-word:/.test(above)))
      return true;
    for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) if (keepsItsWords(p) && saysWhy(p)) return true;
    return false;
  };
  const out = [];
  const say = (node, raw) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!isWords(text) || kept(node)) return;
    out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text });
  };
  const read = (n) => !idPlace(n) && !developerPlace(n) && !modelPlace(n) && only(n);
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (read(n)) say(n, n.text);
    } else if (ts.isTemplateExpression(n)) {
      if (read(n)) say(n, [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join("…"));
    } else if (ts.isJsxText(n) && only(n)) say(n, drawnText(n.text));
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The words a server's file hands a person: a refusal's sentence, an answer's message, detail or error. */
export const refusalWordsIn = (sf) => wordsReadIn(sf, { only: (n) => !ts.isJsxText(n) && refusalPlace(n) });

const counted = (runs, families) => {
  const out = {};
  for (const { text } of runs)
    for (const { family } of neverOnAScreen(text, families)) out[family] = (out[family] ?? 0) + 1;
  return out;
};

/** A file's words that never reach a screen, counted by family (`{ ai: 2, retired: 1 }`), of the families asked for. */
export const screenWordsIn = (sf, families = FAMILIES) => counted(wordsReadIn(sf), families);

/** The same count of a server's file, over the words it hands a person alone. */
export const refusalScreenWordsIn = (sf, families = FAMILIES) => counted(refusalWordsIn(sf), families);

/** A file's marks of the voice, counted by mark. A sentence's punctuation and length are read only of prose. */
export function voiceMarksOf(sf) {
  const out = {};
  for (const { text } of wordsReadIn(sf)) {
    const marks = voiceMarksIn(text);
    if (!isProse(text)) for (const mark of ["emDash", "semicolon", "long", "sentences"]) delete marks[mark];
    for (const [mark, n] of Object.entries(marks)) out[mark] = (out[mark] ?? 0) + n;
  }
  return out;
}

/**
 * Where a `title=` is the browser's tooltip: on an element the browser draws (a lower-case tag); on a part of Base UI
 * (`Tabs.Tab`, `Menu.Item`), which hands its element every prop it does not know; or on a kit control that hands its
 * `title` on the same way (Button, IconButton, LinkButton, LinePress, Press, RecordField). A component's own `title` prop
 * (a sheet's, an empty state's) is its heading, not a tooltip.
 */
const DRAWS_ITS_TITLE = /^([a-z][\w.-]*|[A-Z]\w*\.[A-Z]\w*|Button|IconButton|LinkButton|LinePress|Press|RecordField)$/;
/** A frame's title is its name, the words a screen reader says as focus enters it (WCAG 4.1.2), not a tooltip. */
const NAMED_BY_ITS_TITLE = new Set(["iframe"]);

/** The markup the browser-tooltips measure reads: the dashboard's TSX, but what nobody reads (its tests, its types). */
export const markupFiles = () =>
  repoFiles(["apps/dashboard/src", "apps/dashboard/app"]).filter((f) => /\.tsx$/.test(f) && !NOT_READ.test(f));

/** How many `title=` a file writes on an element: the browser's own tooltip, which a phone never shows. */
export function titleTooltipsIn(sf) {
  let n = 0;
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText() === "title") {
      const tag = node.parent.parent.tagName.getText();
      if (DRAWS_ITS_TITLE.test(tag) && !NAMED_BY_ITS_TITLE.has(tag)) n += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/* ---- Who reads a file's words (docs/words.md, "Who reads it") ---- */

const NOT_READ = /\.d\.ts$|\.generated\.|database\.types\.ts$|\.type-test\.|(^|\/)test\/|\.test\.|\.spec\./;

/**
 * Who reads the words a file writes, first match wins. Nobody reads on a page a module of notes the code keeps for
 * itself (what a page refreshes and why, where a record's page is), the legal pages a lawyer words, a module that only
 * speaks to a model (the receptionist's composed prompt, the lead judge, a file's look and sound, a whisper), or what
 * callers hear (decision 0051). Staff read the Console, where the code's words are allowed.
 * A customer reads the pages Chanlytics hosts for a business (consent, a preview): filed words, bound by the code's and
 * the providers' lists alone. What AI is taught is its instructions and its tools. An owner or a member reads every
 * page and view model else, and the server's words on those pages.
 */
export const AUDIENCES = [
  [
    "nobody",
    /^apps\/dashboard\/src\/bridge\/(refresh-map|surface-data|surface-registry)\.ts$|^apps\/dashboard\/src\/surfaces\/.*(\/|-)surface\.ts$|^packages\/contracts\/src\/activity\/(subjects|record-address)\.ts$|^packages\/contracts\/src\/shell\/route-prefetch\.ts$|^apps\/dashboard\/app\/(privacy|terms|data-deletion)\/|^packages\/contracts\/src\/(config\/workspace-config\/|files\/(look|sound)\.ts$|leads\/(judge|ideas-ask)\.ts$|voice\/(whisper|greeting)\.ts$)/,
  ],
  [
    "staff",
    /^apps\/dashboard\/src\/surfaces\/console\/|^apps\/dashboard\/app\/\(os\)\/console\/|^packages\/contracts\/src\/console\/|^packages\/contracts\/src\/workspace\/platform[\w-]*\.ts$|^packages\/contracts\/src\/voice\/call-endings-platform\.ts$/,
  ],
  ["customer", /^apps\/dashboard\/src\/yes\/|^packages\/contracts\/src\/(consent|previews)\//],
  ["taught", /^apps\/dashboard\/src\/server\/ask\/|^packages\/contracts\/src\/ask\/skills\//],
  [
    "owner",
    /^apps\/dashboard\/src\/(surfaces|client|auth|bridge)\/|^apps\/dashboard\/app\/(?!api\/)|^packages\/contracts\/src\//,
  ],
  [
    "server",
    /^apps\/dashboard\/src\/server\/|^apps\/dashboard\/app\/api\/|^packages\/(core|jobs|channels)\/src\/|^apps\/edge\/(lib|api)\//,
  ],
];

export const audienceOf = (file) => AUDIENCES.find(([, at]) => at.test(file))?.[0] ?? null;

const READ_TREES = ["apps/dashboard/src", "apps/dashboard/app", "apps/edge/lib", "apps/edge/api", "packages"];

/** Each file an audience reads, by its repo-relative path. */
export const filesReadBy = (audience) =>
  repoFiles(READ_TREES).filter((f) => /\.tsx?$/.test(f) && !NOT_READ.test(f) && audienceOf(f) === audience);

const perFile = (files, count) =>
  Object.fromEntries(files.map((f) => [f, count(parse(f))]).filter(([, n]) => Object.keys(n).length > 0));

export const WORD_RATCHETS = [
  {
    name: "words that never reach a screen, on the pages",
    file: "screen-words.json",
    measure: () => perFile(filesReadBy("owner"), (sf) => screenWordsIn(sf)),
    advice:
      "docs/words.md says what to write instead: AI, Conversation, Campaign, Couldn't, what a provider's word means for the owner. A line that must keep its word says why beside it, `screen-word: <why>`.",
  },
  {
    name: "marks of a system's voice, on the pages",
    file: "screen-voice.json",
    measure: () => perFile(filesReadBy("owner"), voiceMarksOf),
    advice:
      'docs/words.md, "The voice": no "we", no apology, tap and never click, a " · " or a new line where a dash or a semicolon stood, "Goal" and not "Your goal", and a line past 120 characters or three sentences goes behind Why.',
  },
  {
    name: "words that never reach a screen, in what the server says",
    file: "server-words.json",
    measure: () => perFile(filesReadBy("server"), (sf) => refusalScreenWordsIn(sf)),
    advice:
      "A refusal's sentence (AppError, refuse) and an answer's message, detail or error are read on the same screen as the page: docs/words.md binds them. An Error's own text, a log line and a page to staff are not counted.",
  },
  {
    name: "words AI is taught that never reach a screen",
    file: "taught-words.json",
    measure: () => perFile(filesReadBy("taught"), (sf) => screenWordsIn(sf, ["ai", "code", "provider", "retired"])),
    advice:
      "What AI answers is the most-read text in the product, and it says what its instructions and its tools' words say: teach it docs/words.md's words.",
  },
  {
    name: "the code's and the providers' words on a customer's page",
    file: "customer-words.json",
    measure: () => perFile(filesReadBy("customer"), (sf) => screenWordsIn(sf, ["code", "provider"])),
    advice:
      "A customer reads the business, not Chanlytics: no word of the code's or a provider's (docs/words.md, \"Who reads it\").",
  },
  {
    name: "browser tooltips: title= on an element",
    file: "title-tooltips.json",
    measure: () =>
      Object.fromEntries(
        markupFiles()
          .map((f) => [f, titleTooltipsIn(parse(f))])
          .filter(([, n]) => n > 0),
      ),
    advice:
      "A phone shows no title=, and nothing important lives only in one: name the control for a screen reader (its words or an aria-label) and say its hint in the house's tip (data-tip, frame/tip.ts), which shows on hover, on focus and under a tap.",
  },
];
