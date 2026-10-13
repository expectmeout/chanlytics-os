/**
 * The notices a call they placed, or a reply the receptionist holds, leaves on a person's page (canvas A, C10; contracts
 * notices.ts personNoticesOf): the name they gave (under the name), an address they spelled out (Reach them), a next step
 * the receptionist noted (Up next), and a draft waiting in the thread (under their last words). Each is the kit's Notice
 * at its home: the fact, its source, one act, and × where it can be wrong.
 *
 * The data settles a notice (the name taken, an address on their page, a step standing, the draft sent). × is a
 * member's own hide, kept in this browser beside the person (a per-viewer convenience: the page draws the same without
 * it), never a word to anyone else.
 */
import { useState } from "react";
import { CALL_FACT_WORDS, PERSON_NAME_WORDS } from "@chanlytics/contracts";
import type { NoticeHome, NoticeVM } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Notice } from "../../../kit/notice/notice";
import { navigate } from "../../../legacy-verbs";
import { setPersonDetails, writePersonNote } from "../../people-detail";
import type { NoticeCtx } from "../ctx";

/** This browser's hidden notices, by person: `{ [personId]: noticeId[] }`. */
const HIDDEN_KEY = "chanlytics.person.hiddenNotices";

function hiddenOf(personId: string): string[] {
  try {
    const all = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || "{}") as Record<string, unknown>;
    const ids = all[personId];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function keepHidden(personId: string, ids: readonly string[]): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || "{}") as Record<string, unknown>;
    all[personId] = ids;
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(all));
  } catch {
    /* a browser that keeps nothing: the notice comes back on the next read */
  }
}

/** The notices a person's page hides in this browser, and the × that hides one more. */
function useHidden(personId: string): [readonly string[], (id: string) => void] {
  const [held, setHeld] = useState(() => ({ personId, ids: hiddenOf(personId) }));
  const ids = held.personId === personId ? held.ids : hiddenOf(personId);
  const hide = (id: string) => {
    const next = [...ids.filter((x) => x !== id), id];
    keepHidden(personId, next);
    setHeld({ personId, ids: next });
  };
  return [ids, hide];
}

/** The kinds this module draws; a signer's name, Combine and Same person? have homes of their own (signer.tsx, hero.tsx). */
const DRAWN_HERE = new Set(["use-call-name", "use-call-email", "note-call-step", "open-thread"]);

/** What a notice's act does, through the person's own doors; the page reads them again after. */
async function act(c: NoticeCtx, n: NoticeVM): Promise<void> {
  const d = n.act.do;
  if (d.kind === "open-thread") {
    navigate(d.to);
    return;
  }
  const W = CALL_FACT_WORDS;
  const r =
    d.kind === "use-call-name"
      ? await setPersonDetails(c.p.id, { name: d.name })
      : d.kind === "use-call-email"
        ? await setPersonDetails(c.p.id, { email: d.email })
        : d.kind === "note-call-step"
          ? await writePersonNote(c.p.id, { body: d.body })
          : null;
  if (!r) return;
  if (!r.ok) {
    c.flash({ tone: "danger", msg: <>{r.message || "That did not save."}</> });
    return;
  }
  c.flash({
    msg:
      d.kind === "use-call-name"
        ? PERSON_NAME_WORDS.named(d.name)
        : d.kind === "use-call-email"
          ? W.emailKept(d.email)
          : W.stepKept,
  });
  c.load();
}

/** One notice: the fact, its source, its act for a member who may record, and × where it can be wrong. */
function FactNotice({ c, n, onHide, line }: { c: NoticeCtx; n: NoticeVM; onHide: () => void; line: boolean }) {
  const [busy, setBusy] = useState(false);
  // Opening the thread is anyone's; the rest change the record.
  const may = n.act.do.kind === "open-thread" || c.canRecord;
  const press = async () => {
    if (busy) return;
    setBusy(true);
    await act(c, n);
    setBusy(false);
  };
  return (
    <Notice
      label={n.fact}
      fact={n.fact}
      source={n.source}
      line={line}
      act={
        may ? (
          <Button size="sm" aria-busy={busy || undefined} onClick={() => void press()} data-testid="person-notice-act">
            {n.act.label}
          </Button>
        ) : null
      }
      dismiss={n.dismiss ? { label: n.dismiss.label, onDismiss: onHide, testid: "person-notice-hide" } : null}
      testid={`person-notice-${n.act.do.kind}`}
    />
  );
}

/**
 * The notices of one home this module draws, those not hidden here. `line` draws each as the one-row form, under a list
 * of rows (a draft waiting under their last words).
 */
export function FactNotices({ c, home, line = false }: { c: NoticeCtx; home: NoticeHome; line?: boolean }) {
  const [hidden, hide] = useHidden(c.p.id);
  const here = c.p.notices.filter((n) => n.home === home && DRAWN_HERE.has(n.act.do.kind) && !hidden.includes(n.id));
  if (!here.length) return null;
  return (
    <div className="cl-prof-notices" data-home={home}>
      {here.map((n) => (
        <FactNotice key={n.id} c={c} n={n} line={line} onHide={() => hide(n.id)} />
      ))}
    </div>
  );
}

/** Whether a home has a notice this module would draw: a pane that is otherwise empty still draws for it. */
export function hasFactNotices(c: NoticeCtx, home: NoticeHome): boolean {
  return c.p.notices.some((n) => n.home === home && DRAWN_HERE.has(n.act.do.kind) && !hiddenOf(c.p.id).includes(n.id));
}
