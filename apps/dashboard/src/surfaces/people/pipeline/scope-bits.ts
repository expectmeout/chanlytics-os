/**
 * What the Pipeline's page keeps around its state (moved from the top of legacy/pages/pipeline-scope.jsx, decision 0015):
 * the sort it opens in, the columns beside an open peek, the acts People's bar keeps, the two layouts and the first one
 * chosen, the peek's focus rule, who may record a deal, and the way a send from the peek's card reaches their thread.
 */
import { mayAtLeast } from "../../legacy-verbs";

// The order the page opens in: Stage, the Pipeline's own (contracts pipelineOf), until the member picks a heading.
export const PIPE_SORT = { by: "stage", dir: "asc" } as const;
export const PIPE_CTX = {};
// Beside an open peek on a desk the table keeps who and where it stands in a word: at 1280, beside the sidebar and the
// rail, the rows have some 350px left of the peek, which holds those two and not the value, which the peek's card says
// at its head. And of People's acts on a selection the Pipeline keeps its lists and its export, after its own Mark as
// passed.
export const PIPE_PEEK_KEEPS = new Set(["name", "chip"]);
export const PIPE_BULK_ACTS = ["lists", "export"];

// The first layout a member who never chose one gets: what #941 kept in this browser, read once, else the list. The
// choice itself is the member's saved view now (usePlControls extraDefaults), and nothing writes the old key again.
export const PIPE_LAYOUTS: readonly string[] = ["list", "board"];
export const pipeFirstLayout = (): string => {
  try {
    return window.localStorage && window.localStorage.getItem("pipeline.view") === "board" ? "board" : "list";
  } catch {
    return "list";
  }
};

// The peek's focus rule, the lead peek's: focus moves into the peek as it opens, and back to the row (the cursor's,
// `person-<id>`, the table's own id from its noun) as it closes, so Tab carries on from where the member was.
export const pipePeekFocus = (peekId: string | null, cursor: string | null) => {
  const doc = window.document;
  if (!doc || !doc.getElementById) return;
  const el = peekId ? doc.getElementById("pipeline-peek-close") : cursor && doc.getElementById(`person-${cursor}`);
  if (el && el.focus) el.focus({ preventScroll: true });
};

// Whether this member may record a deal: an owner or an operator, as the person page decides it (client-profile.jsx).
// Whoever acts in the workspace: the roles contracts ROLE_PERMS gives `approve` (owner, operator, and the partner, 0012).
export const pipeCanRecord = (): boolean => mayAtLeast("operator");

// A send from the peek's card opens their thread with the words in the box where free text can go: the person page's
// own path (client-profile.jsx openWith), and the thread reads the same key as it opens (inbox-thread.jsx).
export const pipeComposeIn = (
  person: { openThread: string | null } | null,
  text: string | null,
  nav: (to: string) => void,
) => {
  if (!person || !person.openThread) return;
  if (text) {
    try {
      sessionStorage.setItem(
        "chanlytics-compose",
        JSON.stringify({ threadId: person.openThread.replace(/^inbox\//, ""), text }),
      );
    } catch {
      /* nothing to carry */
    }
  }
  nav(person.openThread);
};

// Where a thread is, as the shell's route builders say it (data/constants.jsx CHANLY.R.thread): a row's menu and the peek
// open their conversation by it.
export const pipeThreadRoute = (id: string | null): string => `inbox/${String(id)}`;
