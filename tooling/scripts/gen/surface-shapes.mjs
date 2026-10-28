#!/usr/bin/env node
/**
 * What each surface's value is shaped like, as a fingerprint the surface cache keeps beside its snapshot
 * (apps/dashboard/src/legacy-bridge/surface-cache.ts). A snapshot is painted before React draws, and a page drawn from a
 * value of another shape can throw or say something the database never did, so the cache was the build's own: every
 * deploy began cold, and on 27 Oct 2026 that was ten first loads of a day for one person (the Today load review). Now each
 * surface's snapshot is kept across a deploy that left its value's type alone, and dropped by one that changed it.
 *
 * The fingerprint is the value's type as the checker sees it, expanded all the way down (each object's properties by name,
 * each union's members, arrays, tuples, literals, a record's values), hashed. A type the checker cannot see into (`any`,
 * `unknown`) has no fingerprint: that surface's snapshot stays the build's, as every one was.
 *
 *   node tooling/scripts/gen/surface-shapes.mjs          # write the fingerprints
 *   node tooling/scripts/gen/surface-shapes.mjs --check  # exit 1 when they are stale
 *
 * The dashboard's typecheck runs the check, so a type changed without its fingerprint fails the build before any
 * snapshot of the old shape can be painted under the new code.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const OUT = "apps/dashboard/src/legacy-bridge/surfaces/shapes.generated.ts";
const VALUES = "apps/dashboard/src/surfaces/surface-values.ts";
const TSCONFIG = "apps/dashboard/tsconfig.json";

/** A program over the module that types every surface's value, and the checker over it. */
export function programOver(root) {
  const config = ts.getParsedCommandLineOfConfigFile(
    path.join(root, TSCONFIG),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      },
    },
  );
  const file = path.join(root, VALUES);
  return { program: ts.createProgram({ rootNames: [file], options: { ...config.options, noEmit: true } }), file };
}

/**
 * A type as a string the same type always spells the same way: what a snapshot of a value of it holds, as JSON carries
 * it. `opaque` is told of anything the checker cannot see into.
 */
export function shapeOf(checker, type, opaque) {
  const done = new Map();
  const walking = new Set();
  const F = ts.TypeFlags;
  const walk = (t) => {
    if (t.flags & (F.Any | F.Unknown)) {
      opaque();
      return "?";
    }
    if (t.flags & F.String) return "string";
    if (t.flags & F.Number) return "number";
    if (t.flags & F.Boolean) return "boolean";
    if (t.flags & F.BigInt) return "bigint";
    if (t.flags & F.Null) return "null";
    if (t.flags & (F.Undefined | F.Void)) return "undefined";
    if (t.flags & F.Never) return "never";
    if (t.flags & F.ESSymbolLike) return "symbol";
    if (t.flags & F.StringLiteral) return JSON.stringify(t.value);
    if (t.flags & F.NumberLiteral) return String(t.value);
    if (t.flags & F.BooleanLiteral) return t.intrinsicName;
    if (t.flags & F.BigIntLiteral) return `${t.value.negative ? "-" : ""}${t.value.base10Value}n`;
    if (t.flags & F.TemplateLiteral) return `\`${checker.typeToString(t)}\``;
    if (t.isUnion()) return [...new Set(t.types.map(walk))].sort().join("|");
    if (t.isIntersection()) return [...new Set(t.types.map(walk))].sort().join("&");
    if (t.flags & F.TypeParameter) return `<${checker.typeToString(t)}>`;
    if (!(t.flags & F.Object)) return `<${checker.typeToString(t)}>`;
    if (done.has(t)) return done.get(t);
    // A type that holds itself (a tree): said by name where it comes round again.
    if (walking.has(t)) return `@${checker.typeToString(t)}`;
    walking.add(t);
    let s;
    if (checker.isTupleType(t)) s = `[${checker.getTypeArguments(t).map(walk).join(",")}]`;
    else if (checker.isArrayType(t)) s = `${walk(checker.getTypeArguments(t)[0])}[]`;
    else if (fromTheLibrary(t)) {
      // Said by its name, and what it holds walked: a Map of rows is a Map of those rows.
      const args = t.objectFlags & ts.ObjectFlags.Reference ? checker.getTypeArguments(t) : [];
      s = `<${t.getSymbol().getName()}${args.length ? `<${args.map(walk).join(",")}>` : ""}>`;
    } else {
      const parts = checker
        .getPropertiesOfType(t)
        .filter((p) => !p.getName().startsWith("__@"))
        .map((p) => {
          // A mapped type's members (a Record's, a Partial's) have no declaration of their own: their type is the symbol's.
          return `${p.getName()}${p.flags & ts.SymbolFlags.Optional ? "?" : ""}:${walk(checker.getTypeOfSymbol(p))}`;
        })
        .sort();
      for (const info of checker.getIndexInfosOfType(t)) parts.push(`[${walk(info.keyType)}]:${walk(info.type)}`);
      // A function is no part of a snapshot: JSON carries none.
      if (checker.getSignaturesOfType(t, ts.SignatureKind.Call).length) parts.push("()");
      s = `{${parts.join(";")}}`;
    }
    walking.delete(t);
    done.set(t, s);
    return s;
  };
  return walk(type);
}

/**
 * A class or an interface the standard library declares (a Date, a Map), said by name: its methods are not what a snapshot
 * holds. Never one of its type helpers (Record, Partial, Readonly, Pick): those are walked, or a field changed inside a
 * record's rows would leave its fingerprint as it was.
 */
function fromTheLibrary(t) {
  const decl = t.getSymbol()?.declarations?.find((d) => ts.isInterfaceDeclaration(d) || ts.isClassDeclaration(d));
  return !!decl && /[\\/]typescript[\\/]lib[\\/]lib\./.test(decl.getSourceFile().fileName);
}

/** Each surface's fingerprint, by its key in SurfaceValues; null where its type hides something from the checker. */
export function fingerprints(root) {
  const { program, file } = programOver(root);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`${VALUES}: not in the program`);
  let values = null;
  ts.forEachChild(source, (n) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === "SurfaceValues") values = n;
  });
  if (!values) throw new Error(`${VALUES}: no SurfaceValues interface`);
  const out = {};
  for (const prop of checker
    .getPropertiesOfType(checker.getTypeAtLocation(values.name))
    .sort((a, b) => (a.getName() < b.getName() ? -1 : 1))) {
    let hidden = false;
    const at = prop.valueDeclaration ?? prop.declarations?.[0];
    const shape = shapeOf(checker, checker.getTypeOfSymbolAtLocation(prop, at), () => (hidden = true));
    out[prop.getName()] = hidden ? null : crypto.createHash("sha256").update(shape).digest("hex").slice(0, 16);
  }
  return out;
}

/** The generated module's text. */
export function generate(root) {
  const shapes = fingerprints(root);
  return [
    "/* Generated by tooling/scripts/gen/surface-shapes.mjs from apps/dashboard/src/surfaces/surface-values.ts — do not edit. */",
    "",
    "/**",
    " * Each surface's value's type, as a fingerprint (the generator says how): a snapshot the cache holds is drawn under",
    " * a build whose fingerprint for it is the same. Null where the type hides something from the checker: that surface's",
    " * snapshot is the build's alone.",
    " */",
    "export const SURFACE_SHAPES: Readonly<Record<string, string | null>> = {",
    ...Object.entries(shapes).map(([k, v]) => `  ${k}: ${v === null ? "null" : JSON.stringify(v)},`),
    "};",
    "",
  ].join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const text = generate(root);
  const at = path.join(root, OUT);
  const was = fs.existsSync(at) ? fs.readFileSync(at, "utf8").replace(/\r\n/g, "\n") : null;
  if (process.argv.includes("--check")) {
    if (was !== text) {
      console.error(
        `${OUT} is stale: a surface's value changed its type. Run: node tooling/scripts/gen/surface-shapes.mjs`,
      );
      process.exit(1);
    }
  } else if (was !== text) fs.writeFileSync(at, text);
}
