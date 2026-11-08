/**
 * asJson takes what JSON carries and refuses what it does not, proved where the compiler reads it (json.ts): an interface
 * of words, numbers, lists and nested objects is a JSON value, a field left out is left out, and a Date, a function or a
 * bigint anywhere in it does not compile.
 *
 * A type test: each line under `@ts-expect-error <why>` must not compile. Nothing imports this file, so no build reaches
 * it and nothing runs it.
 */
import { asJson } from "./json";

interface Sent {
  to: string;
  count: number;
  held: boolean;
  why: string | null;
  note?: string;
  parts: { name: string; at: number }[];
  by: { model: string } | null;
}

declare const sent: Sent;
void asJson(sent);
void asJson([sent, sent]);
void asJson({ ...sent, note: undefined });

declare const dated: { at: Date };
// @ts-expect-error a Date is no JSON value: JSON.stringify writes it as a string the reader never asked for
void asJson(dated);

declare const deep: { parts: { done: () => void }[] };
// @ts-expect-error a function is no JSON value, however deep: JSON.stringify drops it
void asJson(deep);

declare const big: { bytes: bigint };
// @ts-expect-error a bigint is no JSON value: JSON.stringify throws on it
void asJson(big);
