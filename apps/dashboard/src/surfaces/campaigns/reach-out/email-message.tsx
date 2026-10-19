/**
 * Campaigns › Templates: a reach-out's email as a message (One message, every channel, step 5; it was a read-only row
 * (reach-out/email-row.tsx), Part 4 PR 8, canvas board 14, F15, R19). A reach-out's emails are messages with one version,
 * the email, so each is a row among the templates, drawn by the same closed line a message is (templates/message-row-parts.tsx),
 * and opens in the pane beside the list on the same version view and the same editor (templates/version-view.tsx): its
 * subject (the first step's) and its words with the six slots as chips, a preview of how one business reads it with
 * examples in the slots, the check as it is typed, and a save that writes the step's own row through its chain's save
 * (POST templates/versions, which keeps what the reach-out's save guarantees: new words send what waits for the step back
 * to the check). It has no Remove, Rename or Hide of its own, no WhatsApp or Text version, and its chain's days, pace and
 * domains stay where the chain is: Edit the reach-out hands its chain as the reach_outs surface read it to the page, which
 * opens its sequence's record (`onEdit`), for a role that may change it; for anyone else, or a chain whose search is
 * gone, it opens the chain's own address. How many it has written is its chain's report, read
 * when the row opens (`useReachOutReport`, row.tsx; R23), and said only once read: nothing while it reads or when it
 * could not be read, never a 0 it did not read. Every sentence is contracts'. The rows are contracts' emailTemplateRowsOf
 * over the reach_outs surface's chains, which the settings surface's WhatsApp templates never hold.
 */
import {
  addressOf,
  REACH_OUT_LANGUAGE,
  REACH_OUT_SLOT_SET,
  fillSlots,
  reachOutExampleValues,
  reachOutRowName,
  reachOutRules,
  templateSentWords,
} from "@chanlytics/contracts";
import type { ReachOutChainDto } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { canDo, navigate } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { useSurface } from "../../use-surface";
import { CmPane } from "../parts/split";
import type { TemplateGroup } from "../templates/group";
import { closedLine } from "../templates/message-row-parts";
import { VersionView } from "../templates/version-view";
import type { VersionDraft } from "../templates/verbs";
import { tplLangLabel, tplOneLine, tplOwn } from "../templates/words";
import { useReachOutReport } from "./row";
import { reachOuts } from "./surface";

/** One email of a reach-out as Templates lists it: its words, and the chain and step that send it. */
type EmailMessage = ReturnType<typeof reachOuts.words.emailTemplateRowsOf>[number];

/** The slots as a row says them in one line of words: by their names, in braces, as a message's row says its own. */
const SLOT_NAMES = REACH_OUT_SLOT_SET.labels.map((label) => `{${label.toLowerCase()}}`);
const inOneLine = (words: string): string => tplOneLine(fillSlots(words, SLOT_NAMES, REACH_OUT_SLOT_SET));

/** What the email is called: its subject (the first step's), else its place in the chain. */
const titleOf = (t: EmailMessage): string => (t.subject && inOneLine(t.subject)) || reachOuts.words.stepLabel(t.step_n);

/** The mark an email wears, on its row and at the head of its pane. */
const emailMark = () => (
  <span className="mark msg-row-mark" data-kind="email" aria-hidden="true">
    <Icon name="mail" size={13} />
  </span>
);

interface RowProps {
  t: EmailMessage;
  open?: boolean;
  onOpen: () => void;
}

/** The email as one row of the list: its subject, its words, the Email channel, the chain that sends it and what it wrote. */
export function ReachOutEmailRow({ t, open = false, onOpen }: RowProps) {
  const [read] = useReachOutReport(t.root_id, open);
  const W = reachOuts.words;
  const written = open && read && read.state === "ok" ? W.emailRowWrittenOf(read.report, t.step_id) : null;
  const w = W.emailTemplateWords({ chainName: t.chain_name, stepN: t.step_n, afterDays: t.after_days });
  const g: TemplateGroup = { key: `e:${t.step_id}`, title: titleOf(t), purpose: w.chip, starter: null, rows: [] };
  return (
    <div
      className={`msg-row${open ? " is-open" : ""}`}
      data-template={reachOutRowName(t.step_id)}
      data-testid="reach-out-email"
    >
      {closedLine({
        g,
        offer: false,
        mark: emailMark(),
        tag: null,
        words: inOneLine(t.body),
        channels: w.chip,
        use: { words: w.sends, note: w.sendsNote, unused: false, sequence: t.root_id },
        present: [],
        // Said only once read: a count that was not read is no count, and a step that wrote none says so in words.
        sent: written === null ? null : templateSentWords({ count: written, lastAt: null }, "UTC", Date.now()),
        open,
        onOpen,
      })}
    </div>
  );
}

interface PaneProps {
  t: EmailMessage;
  /** Another act is under way: nothing here may start one. */
  busy: boolean;
  /** The save, answered with the server's word; null when it did not start (the page's one act at a time). */
  onSave: (draft: VersionDraft) => Promise<ApiResult<unknown> | null>;
  onClose: () => void;
  /** Edit the reach-out, for a role that may: its chain, whose sheet the page opens. */
  onEdit: (chain: ReachOutChainDto) => void;
}

/**
 * The email open, in the pane beside the list: its version view, on the reach-out's own slots and rules, and under it what
 * checks it and where the whole reach-out is changed.
 */
export function ReachOutEmailPane({ t, busy, onSave, onClose, onEdit }: PaneProps) {
  const chains = useSurface("reach_outs");
  const W = reachOuts.words;
  const w = W.emailTemplateWords({ chainName: t.chain_name, stepN: t.step_n, afterDays: t.after_days });
  const go = () => navigate(addressOf({ kind: "reach_out", id: t.root_id }));
  const chain = (chains || []).find((c) => c.root_id === t.root_id);
  const mayEdit = !!(chain && chain.search && canDo("approve"));
  // The six slots filled as one business would see them: made-up for what changes from business to business, and this
  // workspace's own name, booking link and signature, which a send fills with the same (a hole is said by its name).
  const own = tplOwn();
  const values = reachOutExampleValues({
    businessName: own.business_name,
    yourName: t.signed_by,
    bookingLink: own.booking_link,
  });
  const words = { subject: t.subject, body: t.body };
  return (
    <CmPane
      testid="reach-out-email-pane"
      mark={emailMark()}
      title={titleOf(t)}
      badge={<span className="chip msg-tag">{w.chip}</span>}
      sub={`${w.sends} · ${w.sendsNote}`}
      onClose={onClose}
    >
      <div className="msg-row-open tpl-read" data-testid="reach-out-email-body">
        <VersionView
          name={reachOutRowName(t.step_id)}
          channel="email"
          lang={{ id: REACH_OUT_LANGUAGE, label: tplLangLabel(REACH_OUT_LANGUAGE) }}
          row={{ id: t.template_id, words }}
          start={words}
          slots={REACH_OUT_SLOT_SET}
          values={values}
          rules={reachOutRules(t.step_n === 0)}
          neverCarried={null}
          starterHas={false}
          filed
          canWrite={canDo("approve")}
          busy={busy}
          onSave={onSave}
        />
        <RecordDisclosure id="reach-out-email-checks" label={w.checkLabel} testid="reach-out-email-checks">
          <p className="bc-excl-hint" data-testid="reach-out-email-check">
            {w.checkNote}
          </p>
        </RecordDisclosure>
        <div className="msg-card-foot">
          <span className="msg-card-spacer" />
          <Button size="sm" onClick={mayEdit && chain ? () => onEdit(chain) : go} data-testid="reach-out-email-edit">
            {w.edit}
          </Button>
        </div>
      </div>
    </CmPane>
  );
}
