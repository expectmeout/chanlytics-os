/**
 * Let AI do more (Working for you, 21 Nov 2026, W10): a kind of thing AI found. Where AI still asks you first about a kind
 * of message, and every draft it held for you of that kind in the last 30 days went exactly as it wrote it (Autonomy's own
 * evidence, decision 0063: none rewritten, none stopped, none you answered first), one line says so, and one press moves
 * that row of Autonomy a step: Replies to "holds it, and sends it unless you stop it", a kind with no such step to "sends
 * it". What changed is said back in the rule's own words (POLICY_MODE_WORDS), with an Undo. Not now rests it a week.
 * Read once as the page is drawn, never for a viewer, and nothing where the read fails: it says nothing it can't back.
 */
import { useEffect, useState } from "react";
import {
  HELD_DRAFTS_DAYS,
  POLICY_CLASS_MODES,
  POLICY_MODE_WORDS,
  heldDraftsByClass,
  type HeldDraftsClass,
  type PolicyMode,
} from "@chanlytics/contracts";
import { apiFor } from "@/bridge/api";
import { uiRows } from "@/bridge/policy-store";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { autonomyVerbs } from "../../settings/autonomy/verbs";
import { AI_WORDS } from "../model/ai";
import { useRests } from "../need-you/rests";
import { useMoved, useToast } from "../shell";
import { CalmList, CalmOpen, CalmRow } from "./lines";

const MORE_WORDS = AI_WORDS.more;

/** How many drafts of a kind, every one sent as written, make it worth asking whether AI may send them. */
const MIN_HELD = 5;

/** What the line offers: the Autonomy row, what it is called, how many went as written, and the step it would take. */
interface MoreOffer {
  cls: HeldDraftsClass;
  label: string;
  sent: number;
  from: PolicyMode;
  to: PolicyMode;
}

/** The step a row would take from asking you: holding it where the row can, else sending it. */
const stepFrom = (cls: HeldDraftsClass): PolicyMode => (POLICY_CLASS_MODES[cls].includes("veto") ? "veto" : "auto");

/**
 * The first row that asks you first and whose held drafts all went as written, enough of them; null where none.
 * Exported so a test holds the evidence it asks for.
 */
export function offerOf(read: {
  policies: readonly { class: string; mode: string }[];
  held: Parameters<typeof heldDraftsByClass>[0] | null;
  role: Parameters<typeof uiRows>[0]["role"];
}): MoreOffer | null {
  if (!read.held || read.role === "viewer") return null;
  const held = heldDraftsByClass(read.held);
  const rows = uiRows({ rows: read.policies.map((p) => ({ ...p, limits: {} })), role: read.role });
  for (const cls of ["faq", "booking", "reply"] as const) {
    const count = held[cls];
    const mode = read.policies.find((p) => p.class === cls)?.mode;
    if (mode !== "ask" || !count || count.held < MIN_HELD || count.sent !== count.held) continue;
    const label = rows.find((r) => r.cls === cls)?.label ?? cls;
    return { cls, label, sent: count.sent, from: "ask", to: stepFrom(cls) };
  }
  return null;
}

/** The offer, read once as the page draws; null until read, and where there is none. */
function useMoreOffer(): MoreOffer | null {
  const [offer, setOffer] = useState<MoreOffer | null>(null);
  useEffect(() => {
    let live = true;
    void apiFor(window)("GET policies").then((r) => {
      if (live && r.ok) setOffer(offerOf({ policies: r.data.policies, held: r.data.held, role: r.data.role }));
    });
    return () => {
      live = false;
    };
  }, []);
  return offer;
}

/** The line, where AI could do more: what it found, and under it Let AI and Not now. */
export function LetAiDoMore() {
  const offer = useMoreOffer();
  // What the member set aside comes with the morning's read: the line is drawn once it is in, and again as it moves.
  useMoved("ask_morning");
  const { rests, rest, known } = useRests();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toastNode, flash] = useToast();
  if (!offer || done || !known || rests(`more:${offer.cls}`)) return toastNode;
  const set = async (mode: PolicyMode) => autonomyVerbs.setPolicy(offer.cls, mode, {});
  const letIt = async () => {
    if (busy) return;
    setBusy(true);
    const answer = await set(offer.to);
    setBusy(false);
    if (!answer.ok) {
      flash({ tone: "danger", msg: <>{answer.message}</> });
      return;
    }
    setDone(true);
    flash({
      msg: <>{MORE_WORDS.said(offer.label, POLICY_MODE_WORDS[offer.to].does)}</>,
      undo: async () => {
        const back = await set(offer.from);
        if (!back.ok) {
          flash({ tone: "danger", msg: <>{back.message}</> });
          return;
        }
        setDone(false);
      },
    });
  };
  return (
    <>
      <CalmList label={MORE_WORDS.name(offer.label)} testid="today-more">
        <CalmRow
          first={{ mark: <Icon name="three" size={14} /> }}
          name={MORE_WORDS.name(offer.label)}
          said={MORE_WORDS.sub(offer.sent, HELD_DRAFTS_DAYS)}
          press={() => setOpen(!open)}
          open={open}
          under={
            <CalmOpen open={open}>
              <div className="calm-under">
                <div className="calm-under-acts">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void letIt()}
                    aria-disabled={busy || undefined}
                    data-testid="today-more-let"
                  >
                    {MORE_WORDS.letIt}
                  </Button>
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => void rest({ key: `more:${offer.cls}`, flash })}
                    data-testid="today-more-not-now"
                  >
                    {MORE_WORDS.notNow}
                  </Button>
                </div>
              </div>
            </CalmOpen>
          }
          testid="today-more-line"
        />
      </CalmList>
      {toastNode}
    </>
  );
}
