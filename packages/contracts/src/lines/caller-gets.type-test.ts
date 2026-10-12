/**
 * The standing values' tone is the product's tone vocabulary (shell/tone.ts), proved where the compiler reads it.
 *
 * caller-gets.ts imports nothing -- the phone app's program reaches it through chrome.ts and billing.ts, and a type
 * import of shell/tone.ts there brought that module's whole graph into a stricter program than contracts' own -- so its
 * tone is a local union. This holds the union to the vocabulary: a tone that is not one of the six, or a value that
 * stops being assignable where chrome.ts and Connections read it, is a compile error here.
 *
 * A type test: the positives are `Holds<Within<…>>` (schema-sets.ts), and each line under `@ts-expect-error <why>` must
 * not compile. Nothing imports this file, so no build reaches it; the package's `tsc --noEmit` compiles it.
 */
import type { Tone } from "../shell/tone";
import type { Holds, Within } from "../shared/schema-sets";
import type { CallerGets } from "./caller-gets";

type _CallerTone = [
  // Every tone a standing value carries is a tone a pill can draw.
  Holds<Within<CallerGets["tone"], Tone>>,
  // @ts-expect-error a tone outside the vocabulary is not one a standing value may carry
  Holds<Within<"loud", CallerGets["tone"]>>,
];
