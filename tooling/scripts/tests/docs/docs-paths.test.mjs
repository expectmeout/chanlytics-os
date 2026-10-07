/**
 * The paths the maps name open something.
 *
 * Seven passages are where a reader, a person or an agent, goes to find a thing: CLAUDE.md's canonical examples and
 * "Where new code goes", docs/architecture.md's "Where to look", docs/takeover.md's takeover test, answered,
 * docs/data-model.md's owner of each table (generated, and held to its generator by data-model.test.mjs), and the
 * interface kit's skill's two tables, "Where things are" and "The holds" (.claude/skills/chanlytics-interface).
 * Nothing checked the paths they name, so a file that moved left its map pointing at a hole, and a bare name sent a
 * reader to whichever of its files they found first.
 *
 * Every backticked path in them resolves in the tree the repository has (`git ls-files`, and each folder that holds
 * a tracked file): as written, from the root, or, when it starts as its passage's declaration here says, under the
 * declared prefix; the passage must say so in its own words, naming the prefix and each start (the takeover answers
 * write the dashboard's `src/` and `app/` from `apps/dashboard/`). A bare name is a path from the root like any
 * other, so `ask.ts` opens nothing. A glob resolves when it matches: `*` within a name, `**` across folders,
 * `<domain>` for any one name, and `{a,b}` each alternative on its own. A trailing slash asks for a folder; a `:line`
 * after a file is the file's.
 *
 * A token is a path when it has a slash or ends in a file's extension, and is not prose (it has a space), a URL or a
 * hash route (`/api/v1`, `#/clients`), a package (`@chanlytics/core`) or a call (`route()`). A table
 * (`sweep_status`), a column (`jobs.kind`) or a symbol (`ROLE_PERMS`) is a word, and is not checked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { repoFiles } from "../_ast.mjs";
import { readPage } from "../_ratchet.mjs";

/**
 * The passages, by page and heading. `under` declares where a short path in one is written from: a path that starts
 * with one of `starts` is under `prefix`, and the passage says both.
 */
const MAPS = [
  { page: "CLAUDE.md", heading: "The canonical example of each thing" },
  { page: "CLAUDE.md", heading: "Where new code goes" },
  { page: "docs/architecture.md", heading: "Where to look" },
  { page: "docs/data-model.md", heading: "Owners" },
  {
    page: "docs/takeover.md",
    heading: "The takeover test, answered",
    under: { prefix: "apps/dashboard/", starts: ["src/", "app/"] },
  },
  { page: ".claude/skills/chanlytics-interface/SKILL.md", heading: "Where things are" },
  { page: ".claude/skills/chanlytics-interface/SKILL.md", heading: "The holds" },
];

const EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|json|sql|md|css|html|ya?ml|example|sh)$/;
const LINE = /:\d+(-\d+)?$/;
const GLOB = /(\*\*\/?|\*|<[^>]+>)/;

/** Every tracked file, and every folder that holds one: the tree as the repository has it, not as a desk does. */
const FILES = repoFiles(["."], { keep: /./, drop: /(^|\/)(node_modules|\.git)\// });
/** The folders a file is in: `a/b/c.ts` is in `a` and `a/b`. */
const foldersOf = (f) =>
  f
    .split("/")
    .slice(0, -1)
    .map((_, i, parts) => parts.slice(0, i + 1).join("/"));
const FOLDERS = new Set(FILES.flatMap(foldersOf));
const ENTRIES = new Set([...FILES, ...FOLDERS]);

/** A passage: the lines under `## heading` to the next heading of its rank or above, fenced code left out. */
function passage(page, heading) {
  const lines = readPage(page).split("\n");
  const at = lines.indexOf(`## ${heading}`);
  if (at < 0) return null;
  const end = lines.findIndex((l, i) => i > at && /^#{1,2} /.test(l));
  return lines
    .slice(at + 1, end < 0 ? undefined : end)
    .join("\n")
    .replace(/^\s*```[^\n]*\n[\s\S]*?^\s*```[^\n]*$/gm, "");
}

/** Whether a backticked token names a path, rather than a word, a URL, a package or a call. */
const isPath = (t) =>
  !/\s/.test(t) &&
  !/^(\/|#|@|[a-z]+:\/\/)/.test(t) &&
  !/[\w$]\(/.test(t) &&
  (t.includes("/") || EXTENSION.test(t.replace(LINE, "")));

const pathsIn = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]).filter(isPath);

/** `{a,b}` expanded: each alternative is a path of its own. */
function expand(p) {
  const m = /\{([^{}]*)\}/.exec(p);
  if (!m) return [p];
  return m[1].split(",").flatMap((alt) => expand(p.slice(0, m.index) + alt + p.slice(m.index + m[0].length)));
}

/** A glob's expression: `**` across folders, `*` within a name, `<name>` any one name; the rest as written. */
function globOf(p) {
  const parts = p.split(GLOB).map((part, i) => {
    if (i % 2 === 0) return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    if (part === "**/") return "(?:[^/]+/)*";
    if (part === "**") return ".*";
    return part === "*" ? "[^/]*" : "[^/]+";
  });
  return new RegExp(`^${parts.join("")}$`);
}

/** Where a path may be: as written, and under the declared prefix when it starts as the declaration says. */
const placesOf = (p, under) => [p, ...(under?.starts.some((s) => p.startsWith(s)) ? [under.prefix + p] : [])];

/** Whether one path, its braces expanded, names an entry in one of its places; a trailing slash asks for a folder. */
function opens(p, under) {
  const folder = p.endsWith("/");
  const pool = folder ? FOLDERS : ENTRIES;
  return placesOf(p, under).some((place) => {
    const c = folder ? place.slice(0, -1) : place;
    if (!GLOB.test(c)) return pool.has(c);
    const re = globOf(c);
    return [...pool].some((e) => re.test(e));
  });
}

const resolves = (written, under) => expand(written.replace(LINE, "")).every((p) => opens(p, under));

/** A path that opens nothing, with what the tree holds that ends as it does, or by its last name: the fix is one. */
function hole(written, under) {
  const tail = written.replace(LINE, "").replace(/\/$/, "");
  const onDesk = placesOf(written.replace(LINE, ""), under).some((p) => fs.existsSync(path.join(ROOT, p)));
  if (!GLOB.test(tail) && onDesk) return `\`${written}\`: on this desk, not tracked: add it`;
  const endsAs = (name) => [...ENTRIES].filter((e) => e === name || e.endsWith(`/${name}`)).sort();
  const like = endsAs(tail).length > 0 ? endsAs(tail) : endsAs(tail.split("/").pop());
  if (like.length === 0) return `\`${written}\`: nothing as written, and nothing by that name`;
  const shown = like.length > 4 ? [...like.slice(0, 4), `and ${like.length - 4} more`] : like;
  return `\`${written}\`: nothing as written; the tree has ${shown.join(", ")}`;
}

test("what the maps' check reads as a path, and when a path opens something", () => {
  const paths = ["apps/edge", "route.ts", "a2p/", "packages/*/dist", "lib/log.ts:12", "apps/*/.env.example"];
  const words = ["route()", "sweep_status", "jobs.kind", "/api/v1", "#/clients", "@chanlytics/core", "export *"];
  assert.deepEqual(paths.filter(isPath), paths);
  assert.deepEqual(words.filter(isPath), []);
  const opened = [
    "tooling/scripts/tests/",
    "tooling/scripts/tests/_source.mjs",
    "tooling/scripts/tests/_source.mjs:21",
    "tooling/scripts/tests/_<helper>.mjs",
    "tooling/scripts/tests/_sou*.mjs",
    "tooling/**/_source.mjs",
    "tooling/scripts/tests/{_source,_ratchet}.mjs",
  ];
  assert.deepEqual(
    opened.filter((p) => !resolves(p)),
    [],
  );
  const holes = [
    "tooling/scripts/tests/_source.mjs/",
    "tests/_source.mjs",
    "_source.mjs",
    "tooling/scripts/tests/_nothing-*.mjs",
    "tooling/scripts/tests/{_source,_nothing}.mjs",
  ];
  assert.deepEqual(
    holes.filter((p) => resolves(p)),
    [],
  );
  const under = { prefix: "tooling/scripts/", starts: ["tests/"] };
  assert.ok(resolves("tests/_source.mjs", under), "a declared prefix opens a path that starts as declared");
  assert.ok(!resolves("_source.mjs", { prefix: "tooling/scripts/tests/", starts: ["tests/"] }), "and no other");
});

for (const { page, heading, under } of MAPS) {
  test(`${page}, "${heading}": every path it names opens something`, () => {
    const text = passage(page, heading);
    assert.ok(text !== null, `${page} has no "## ${heading}": the passage moved, and MAPS here moves with it`);
    const paths = pathsIn(text);
    assert.ok(paths.length > 0, `${page}, "${heading}" names no path: it was emptied, or this stopped seeing paths`);
    const problems = paths.filter((p) => !resolves(p, under)).map((p) => hole(p, under));
    if (under && !FOLDERS.has(under.prefix.replace(/\/$/, ""))) problems.push(`\`${under.prefix}\` is no folder`);
    const unsaid = under ? [under.prefix, ...under.starts].filter((s) => !text.includes(`\`${s}\``)) : [];
    if (unsaid.length > 0) {
      const said = `a path that starts ${under.starts.map((s) => `\`${s}\``).join(" or ")} is under \`${under.prefix}\``;
      problems.push(`the passage never says that ${said}: say it once, naming each`);
    }
    const from = under ? `, or ${under.starts.join(" and ")} from \`${under.prefix}\`` : "";
    assert.deepEqual(
      problems,
      [],
      `Write each path as the tree has it, from the repository's root${from}; a glob or a folder is fine when it matches.`,
    );
  });
}
