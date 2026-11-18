/**
 * A provider's contract, proved where the compiler reads it (sources.ts): each call answers a SourceReply of the shape
 * named for it, so the verdict on a reply (go on, rest, no access, gone) always reaches the one reader that acts on
 * it; no call is left out; and a provider's name, an item's kind and a reply's verdict are their closed sets and
 * nothing wider.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (schema-sets.ts). Nothing imports this file, so no build reaches
 * it; the package's `tsc --noEmit` compiles it, and a line that stops holding fails there.
 */
import type { Exactly, Holds } from "../shared/schema-sets";
import type {
  SOURCE_ITEM_KINDS,
  SOURCE_PROVIDERS,
  SourceBytesAddress,
  SourceChange,
  SourceChanges,
  SourceChannel,
  SourceChannelAsk,
  SourceChildren,
  SourceFolder,
  SourceItemKind,
  SourceItemRecord,
  SourceProvider,
  SourceProviderContract,
  SourceReply,
  SourceVerdict,
} from "./sources";

/** The contract's calls: everything on it but the provider's name. */
type Calls = Exclude<keyof SourceProviderContract, "provider">;

/** What one call of the contract answers, once it settles. */
type Answers<Call extends Calls> = Awaited<ReturnType<SourceProviderContract[Call]>>;

type _EachCallAnswersItsReply = [
  Holds<Exactly<Answers<"validateFolder">, SourceReply<SourceFolder>>>,
  Holds<Exactly<Answers<"getStartCursor">, SourceReply<string>>>,
  Holds<Exactly<Answers<"listChildren">, SourceReply<SourceChildren>>>,
  Holds<Exactly<Answers<"listChanges">, SourceReply<SourceChanges>>>,
  Holds<Exactly<Answers<"getItem">, SourceReply<SourceItemRecord>>>,
  Holds<Exactly<Answers<"openChannel">, SourceReply<SourceChannel>>>,
  Holds<Exactly<Answers<"closeChannel">, SourceReply<null>>>,
  Holds<Exactly<Answers<"getBytesAddress">, SourceReply<SourceBytesAddress>>>,
  // No call is left out above: a new one arrives with its line.
  Holds<
    Exactly<
      Calls,
      | "validateFolder"
      | "getStartCursor"
      | "listChildren"
      | "listChanges"
      | "getItem"
      | "openChannel"
      | "closeChannel"
      | "getBytesAddress"
    >
  >,
  // A channel is asked for with our id, its token and where it calls, and nothing of the provider's.
  Holds<Exactly<Parameters<SourceProviderContract["openChannel"]>[2], SourceChannelAsk>>,
  // It is closed by the two names its opening answered, and no more.
  Holds<Exactly<Parameters<SourceProviderContract["closeChannel"]>[1], Pick<SourceChannel, "id" | "resourceId">>>,
];

type _TheClosedSets = [
  // A provider's name and an item's kind are the sets the schema holds (schema-sets.ts holds the sets themselves).
  Holds<Exactly<SourceProviderContract["provider"], SourceProvider>>,
  Holds<Exactly<SourceProvider, (typeof SOURCE_PROVIDERS)[number]>>,
  Holds<Exactly<SourceItemRecord["kind"], SourceItemKind>>,
  Holds<Exactly<SourceItemKind, (typeof SOURCE_ITEM_KINDS)[number]>>,
  // A change's kind may be unknown (the feed gives ids), and is otherwise an item's.
  Holds<Exactly<SourceChange["kind"], SourceItemKind | null>>,
  // A reply's verdict is one of the four, and only a pace carries a rest.
  Holds<Exactly<SourceReply<unknown>["verdict"], SourceVerdict>>,
  Holds<Exactly<Extract<SourceReply<unknown>, { restMs: number }>["verdict"], "pace">>,
];
