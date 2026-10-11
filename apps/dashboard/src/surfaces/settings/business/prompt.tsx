// Chanlytics — Settings › Business: what your receptionist is told.
//
// The last piece of the old page, rebuilt (docs/superpowers/specs/2026-09-20-business-tab-design.md §5; the plan's
// Phase 5; the canvas's Prompt board). It was PromptPreview in settings.jsx: a 4,345-character <pre> behind a Show
// toggle, with the count as the first thing under its heading. Every block in that text was written by one row of this
// page, so here the prompt is a table of contents: each block named for the row that wrote it, with its share of
// everything the receptionist reads, and a door back to that row. Which is also the only way an owner sees that the
// services and their own words are most of what it reads -- the thing that made a prompt halving invisible when it
// happened to a live salon.
//
// Built to the owner's 22 September rule (the plan's Task 4.0): a block's cost is a SHARE, drawn as one thin bar on its
// line (the kit's meter), whose name for a screen reader is the exact count; never a number on the glass. Each block is
// a line that opens onto its words (Ruben, 10 Oct 2026, the sheets in one shape), so the lines are the contents. The
// prompt is set in the page's own face. No colour, no pill, no gradient.
//
// Three things, read as the page draws:
//   useBtPromptSheet  the sheet's hold on the fold registry and the channel it shows, which the PAGE holds
//                     (tab.tsx, before every card), so the told section at rest can say the channel last
//                     chosen and the sheet is the one thing that comes and goes;
//   BtPromptTold      the told section at rest: its title, one muted phrase and the door;
//   BtPromptSheet     the sheet, drawn by the page's one sheet slot (tab.tsx BtSheetSlot) only while the
//                     registry has it open, and holding no hook of its own beside the kit's RecordSheet and the
//                     folding rows its blocks are, which hold whether each is open.
//
// The page composes and never derives. The text is the server's (composedPrompt, the settings read's
// preview, composed by the function the edge runs); the cut, the notes, the shares and every sentence with a number in
// it are contracts' (promptBlocks, promptCostWords, promptTotalWords, PROMPT_READERS, PROMPT_NOW,
// through BUSINESS_TAB). Which row on this page wrote a block is this file's (BTP_DOORS): it is the page's
// shape, not the prompt's.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { navigate } from "../../legacy-verbs";
import { Meter } from "../../kit/meter/meter";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordSheet } from "../../kit/record/sheet";
import { RecordToggleGroup } from "../../kit/record/field";
import { composedPrompt } from "./shell";

type PromptChannel = "whatsapp" | "voice";
type PromptBlock = ReturnType<typeof BUSINESS_TAB.promptBlocks>[number];
/** What the prompt was composed from: the stored brain, as the cut asks for it. */
type PromptFrom = Parameters<typeof BUSINESS_TAB.promptBlocks>[2];

/** The sheet's hold on the registry and the channel it shows (useBtPromptSheet's answer). */
export interface BtPromptHold {
  open: boolean;
  request: () => boolean;
  close: () => void;
  channel: PromptChannel;
  setChannel: (channel: PromptChannel) => void;
}

/** A row of this page that wrote a block: opened by its id, or a tab elsewhere. */
type PromptDoor = { id: string; words: string } | { to: string; words: string };

/**
 * The row on this page that wrote each block, by the id the fold registry opens it by, and what its door says. The
 * name row stands for Who you are: the block opens with the name, and the rows that write the rest of it (the voice,
 * the languages, the address, the link) are each one line of it. The platform's block has no row to open: Chanlytics
 * writes it for every workspace, and its note says so. The Autonomy tab's rules open that tab.
 */
const BTP_DOORS: Record<string, PromptDoor | undefined> = {
  identity: { id: "name", words: "Change" },
  hours: { id: "hours", words: "Change" },
  closures: { id: "closures", words: "Change" },
  services: { id: "services", words: "Open the list" },
  notes: { id: "notes", words: "Change" },
  booking_rules: { id: "booking_rules", words: "Change" },
  handoff: { id: "escalate_when", words: "Change" },
  extra_instructions: { id: "extra_instructions", words: "Change" },
  guardrails: { id: "guardrails", words: "Change" },
  autonomy: { to: "admin/autonomy", words: "Open Autonomy" },
};

const BTP_CHANNELS: { value: PromptChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "voice", label: "Phone" },
];

/**
 * The sheet's hold on the fold registry, and the channel it shows. Called by the page on every draw, before any card:
 * the registry opens one editor or sheet at a time, so the told section's door is a request like any row's act, and a
 * block's door back to its row is a request that gives way at once (there is nothing typed here to ask about). Counted
 * on the page as a fold is (the kit's RecordFold drawn), so a page that goes lets go of an open sheet, and it does not
 * open again with the tab.
 */
export const useBtPromptSheet = (): BtPromptHold => {
  const fold = useRecordFold("prompt", { dirty: false });
  const [channel, setChannel] = useState<PromptChannel>("whatsapp");
  useEffect(() => recFolds.drawn("prompt"), []);
  return { open: fold.open, request: fold.request, close: fold.close, channel, setChannel };
};

/** The text of what the receptionist is told on a channel, as the settings read composed it; null with none. */
const btpComposed = (channel: PromptChannel) => {
  const compose = composedPrompt();
  return compose ? compose(channel) : null;
};

/**
 * The told section at rest: its title, who reads it on the channel last chosen, and the door. Nothing else: no count,
 * no text, no toggle (Task 4.0's rule). A workspace the server composed nothing for draws nothing here, since an empty
 * section would say the receptionist is told nothing, which is a different claim. Hookless.
 */
export const BtPromptTold = ({ prompt }: { prompt: BtPromptHold | null }) => {
  const tab = BUSINESS_TAB;
  if (!prompt || !tab.PROMPT_READERS || !btpComposed(prompt.channel)) return null;
  return (
    <section className="rec-card bt-told" data-testid="rec-card-told" aria-labelledby="bt-told-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-told-title">
          What your receptionist is told
        </h2>
        <span className="rec-card-sub">{tab.PROMPT_READERS[prompt.channel]}</span>
        <button
          type="button"
          className="bt-link bt-told-open"
          onClick={prompt.request}
          aria-describedby="bt-told-title"
          data-rec-act="prompt"
          data-testid="rec-prompt-open"
        >
          Read it
        </button>
      </div>
    </section>
  );
};

/**
 * A block's door back to the row that wrote it. A row of this page is asked for through the registry, which closes
 * this sheet and opens that row's fold, inline editor or sheet; the fold takes focus as it opens. The Autonomy tab's
 * rules go to that tab. A role that may not change the business is offered none, as no row of this page offers it an
 * act: the editor behind it would not open.
 */
const btpDoor = (block: PromptBlock, prompt: BtPromptHold, canEdit: boolean): ReactNode => {
  const door = canEdit ? BTP_DOORS[block.row] : null;
  if (!door) return null;
  const go = () => {
    if ("to" in door) {
      prompt.close();
      navigate(door.to);
      return;
    }
    recFolds.request(door.id);
  };
  return (
    <button
      type="button"
      className="bt-link bt-prompt-door"
      onClick={go}
      aria-describedby={`bt-prompt-label-${block.id}`}
      data-testid={`rec-prompt-door-${block.id}`}
    >
      {door.words}
    </button>
  );
};

/**
 * A block's line: its name, whose words they are (its note, as contracts wrote it), and its share of everything the
 * receptionist reads as one thin bar (the kit's meter), never a number on the glass: the exact count is the bar's name
 * for a screen reader (the owner's rule of 22 Sep).
 */
const btpLine = (b: { id: string; label: ReactNode; note?: string | null; chars?: number }, total: number) => (
  <>
    <span className="bt-disc-name" id={`bt-prompt-label-${b.id}`}>
      {b.label}
    </span>
    {b.note ? <span className="bt-disc-sub">{b.note}</span> : null}
    {typeof b.chars === "number" && total > 0 ? (
      <Meter
        size="sm"
        className="bt-prompt-share"
        parts={[
          { share: b.chars, color: "var(--ink-dim)" },
          { share: Math.max(0, total - b.chars), tone: "rest" },
        ]}
        aria-label={BUSINESS_TAB.promptCostWords(b.chars, total)}
        data-testid={`rec-prompt-share-${b.id}`}
      />
    ) : null}
  </>
);

/**
 * The sheet: the kit's RecordSheet, a modal dialog beside the page, from the bottom on a phone.
 *
 *   head      "What your receptionist is told". Who reads it is the channel chosen under it, so no line under the title.
 *   tools     the channel, WhatsApp or Phone, as the kit's toggle group: the two are not the same text.
 *   blocks    each a line that opens onto its words (the kit's RecordDisclosure): its name, whose words they are, and its
 *             share as one thin bar; opened, its door back to its row and its text in the page's own face with its line
 *             breaks. Keyed by its id, not its row (the platform's text is drawn twice on a call). The lines are the
 *             contents: the rail of names beside the blocks, and a phone's share under every label, went (Ruben, 10 Oct
 *             2026: the sheets "too wordy, too explanatory, too cluttered"). The whole prompt's length is said once,
 *             for a screen reader.
 *   now       what is sent beside the prompt, rebuilt every time, as a line of its own after them.
 *   foot      Done: there is nothing here to save. Shown on a phone, where the head's Close steps out of sight.
 *
 * Focus, Escape and the Tab ring are the kit's: it opens on the sheet, Escape and either Close close it, and focus goes
 * back to the told section's door. Hookless beside the kit's sheet and the lines', which hold whether each is open.
 */
export const BtPromptSheet = ({
  prompt,
  brain,
  canEdit = true,
}: {
  prompt: BtPromptHold;
  brain: PromptFrom;
  canEdit?: boolean;
}) => {
  const tab = BUSINESS_TAB;
  const channel = prompt.channel;
  const composed = btpComposed(channel);
  if (!composed || !tab.promptBlocks) return null;
  const blocks = tab.promptBlocks(composed.text, channel, brain);
  const total = composed.text.length;
  const body = (
    <div className="bt-prompt bt-stack">
      <span className="rec-sr" data-testid="rec-prompt-total">
        {tab.promptTotalWords(total)}
      </span>
      {blocks.map((b) => (
        <RecordDisclosure
          key={`${channel}-${b.id}`}
          id={`bt-prompt-block-${b.id}`}
          label={btpLine(b, total)}
          testid={`rec-prompt-block-${b.id}`}
        >
          {btpDoor(b, prompt, canEdit)}
          <p className="bt-prompt-block-text">{b.text}</p>
        </RecordDisclosure>
      ))}
      <RecordDisclosure
        key={`${channel}-now`}
        id="bt-prompt-now"
        label={btpLine({ id: "now", label: tab.PROMPT_NOW.label[channel], note: tab.PROMPT_NOW.why[channel] }, total)}
        testid="rec-prompt-now"
      >
        <p className="bt-prompt-block-text">{composed.now}</p>
      </RecordDisclosure>
    </div>
  );
  return (
    <RecordSheet
      id="prompt"
      title="What your receptionist is told"
      className="bt-prompt-sheet"
      fit
      onClose={prompt.close}
      tools={
        <RecordToggleGroup
          label="Which receptionist"
          value={channel}
          options={BTP_CHANNELS}
          onChange={prompt.setChannel}
          testid="rec-prompt-channel"
        />
      }
      foot={
        // The kit's pair attribute (kit.css data-foot-pair): on a phone the foot's one act takes the foot's width, as
        // Save and Cancel share it.
        <span data-foot-pair>
          <button type="button" className="btn btn-sm bt-prompt-close" onClick={prompt.close}>
            Done
          </button>
        </span>
      }
    >
      {body}
    </RecordSheet>
  );
};
