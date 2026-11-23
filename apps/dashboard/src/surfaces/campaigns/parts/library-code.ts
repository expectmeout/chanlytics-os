/**
 * Content's Library (content/library.tsx), Files' own library: a chunk of its own, asked for the first time the Library is shown, so
 * Made's first load carries none of it, and fetched beside the frame's own code where a load opens on it (home/opening.ts).
 * Here, apart from Content's page, so the opening can ask for it without asking for the page.
 */
import { codeOnce } from "@/lib/code-once";
import { partNow } from "@/lib/use-code";

export const libraryCode = codeOnce(() => import("../content/library"));

/** The Library as a mount draws it (lib/use-code.ts partNow): itself where its code is in, else the lazy part. */
export const libraryNow = partNow(libraryCode, (m) => m.default);
