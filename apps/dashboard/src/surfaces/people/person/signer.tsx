/**
 * The notices whose home is the name (decision 0052, canvas A §3): a reply's signer offered as their name (the shared
 * NameOffer, name-offer.tsx, which the Inbox's header draws too), and Combine, the record we wrote to and the person who
 * answered from another address at the same business. Every word is contracts'.
 */
import { WORKS_AT_WORDS } from "@chanlytics/contracts";
import type { NoticeVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { NameOffer, putNameBack as putBack } from "./name-offer";
import type { PageCtx } from "./ctx";

/** Undo of a name taken, from the page: the business's name back (or none), and the page read again. */
export function putNameBack(c: PageCtx): Promise<void> {
  return putBack(c.p.id, c.flash, c.load);
}

/**
 * Combine (0052, amending 0028): the record we wrote to and the person who answered from another address at the same
 * business. The press opens the merge box with the other record chosen (the owner's act, its name typed, as Merge asks).
 */
function CombineNotice({ c, n }: { c: PageCtx; n: NoticeVM }) {
  if (n.act.do.kind !== "combine") return null;
  const otherId = n.act.do.otherId;
  return (
    <div className="cl-prof-notice" role="group" aria-label={n.fact} data-testid="person-combine-notice">
      <span className="cl-prof-notice-fact">{n.fact}</span>
      {c.isOwner ? (
        <span className="cl-prof-notice-acts">
          <Button
            size="sm"
            title={WORKS_AT_WORDS.combine}
            onClick={() => {
              c.setDel({ open: false, typed: "", busy: false, error: null });
              c.setMerge({ open: true, pick: otherId, typed: "", busy: false, error: null });
            }}
            data-testid="person-combine"
          >
            {n.act.label}
          </Button>
        </span>
      ) : null}
    </div>
  );
}

/** The notices whose home is the name: a signer's name, and Combine. */
export function NameNotices({ c }: { c: PageCtx }) {
  const here = c.p.notices.filter((n) => n.home === "name");
  if (!here.length) return null;
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
    </div>
  );
}
