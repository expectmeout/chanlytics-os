/**
 * The notices whose home is the name (decision 0052, canvas A §3): a reply's signer offered as their name (the shared
 * NameOffer, name-offer.tsx, which the Inbox's header draws too), and Combine, the record we wrote to and the person who
 * answered from another address at the same business. Every word is contracts'.
 */
import { WORKS_AT_WORDS } from "@chanlytics/contracts";
import type { NoticeVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Notice } from "../../kit/notice/notice";
import { NameOffer, putNameBack as putBack } from "./name-offer";
import { FactNotices } from "./notices/fact-notices";
import type { PageCtx } from "./ctx";

/** Undo of a name taken, from the page: the business's name back (or none), and the page read again. */
export function putNameBack(c: PageCtx): Promise<void> {
  return putBack(c.p.id, c.flash, c.load);
}

/**
 * Combine (0052, amending 0028): the record we wrote to and the person who answered from another address at the same
 * business. The press opens the Combine sheet on the pair (sheets/combine-sheet.tsx), the owner's act; any other ask
 * on the page closes first, one question at a time.
 */
function CombineNotice({ c, n }: { c: PageCtx; n: NoticeVM }) {
  if (n.act.do.kind !== "combine") return null;
  const act = n.act.do;
  return (
    <Notice
      label={n.fact}
      fact={n.fact}
      source={n.source}
      act={
        c.isOwner ? (
          <Button
            size="sm"
            title={WORKS_AT_WORDS.combine}
            onClick={() => {
              c.setDel({ open: false, typed: "", busy: false, error: null });
              c.setMerge({ open: false, pick: null, typed: "", busy: false, error: null });
              c.setCombine({ act, busy: false, error: null });
            }}
            data-testid="person-combine"
          >
            {n.act.label}
          </Button>
        ) : null
      }
      testid="person-combine-notice"
    />
  );
}

/** The notices whose home is the name: a signer's name, Combine, and the name they gave on a call (fact-notices.tsx). */
export function NameNotices({ c }: { c: PageCtx }) {
  const here = c.p.notices.filter(
    (n) => n.home === "name" && (n.act.do.kind === "use-name" || n.act.do.kind === "combine"),
  );
  const called = <FactNotices c={c} home="name" />;
  if (!here.length) return called;
  return (
    <div className="cl-prof-notices">
      {here.map((n) =>
        n.act.do.kind === "use-name" ? (
          <NameOffer
            key={n.id}
            personId={c.p.id}
            messageId={n.act.do.messageId}
            name={c.p.head.signer?.name ?? ""}
            fact={n.fact}
            source={n.source}
            canRecord={c.canRecord}
            say={c.flash}
            onChanged={c.load}
          />
        ) : (
          <CombineNotice key={n.id} c={c} n={n} />
        ),
      )}
      {called}
    </div>
  );
}
