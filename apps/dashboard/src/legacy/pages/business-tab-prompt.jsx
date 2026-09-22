/* global React, Icon */
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
// Built to the owner's 22 September rule (the plan's Task 4.0): a block's cost is a SHARE, drawn as one thin bar in
// the contents and, on a phone, where there is no room for the contents, as contracts' share words on the block's own
// head. The exact count is in the entry's accessible description and its tip, never on the glass. The prompt is set in
// the page's own face. No colour, no pill, no gradient.
//
// Three things, read from window as the page draws:
//   useBtPromptSheet  the sheet's hold on the fold registry and the channel it shows, which the PAGE holds
//                     (business-tab.jsx, before every card), so the told section at rest can say the channel last
//                     chosen and the sheet is the one thing that comes and goes;
//   BtPromptTold      the told section at rest: its title, one muted phrase and the door;
//   BtPromptSheet     the sheet, drawn by the page's one sheet slot (business-tab.jsx BtSheetSlot) only while the
//                     registry has it open, and holding no hook of its own beside the kit's RecordSheet: the stub
//                     React keeps every hook on the page as a cell in one order, and the slot is the page's last.
//
// The page composes and never derives. The text is the server's (window.__composedPrompt, the settings read's
// preview, composed by the function the edge runs); the cut, the notes, the shares and every sentence with a number in
// it are contracts' (promptBlocks, blockShareWords, promptCostWords, promptTotalWords, PROMPT_READERS, PROMPT_NOW,
// through window.__businessTab). Which row on this page wrote a block is this file's (BTP_DOORS): it is the page's
// shape, not the prompt's.
//
// Loaded after business-tab-services.jsx and before business-tab.jsx in both load lists. Its top-level names are
// btp-prefixed, and no pattern in it holds an object rest, for the reasons business-tab-save.jsx gives.

const { useState: useBtpState, useEffect: useBtpEffect } = React;

/**
 * The row on this page that wrote each block, by the id the fold registry opens it by, and what its door says. The
 * name row stands for Who you are: the block opens with the name, and the rows that write the rest of it (the voice,
 * the languages, the address, the link) are each one line of it. The platform's block has no row to open: Chanlytics
 * writes it for every workspace, and its note says so. The Autonomy tab's rules open that tab.
 */
const BTP_DOORS = {
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

const BTP_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "voice", label: "Phone" },
];

/**
 * The sheet's hold on the fold registry, and the channel it shows. Called by the page on every draw, before any card:
 * the registry opens one editor or sheet at a time, so the told section's door is a request like any row's act, and a
 * block's door back to its row is a request that gives way at once (there is nothing typed here to ask about). Counted
 * on the page as a fold is (record-fold.jsx drawn), so a page that goes lets go of an open sheet, and it does not open
 * again with the tab.
 */
const useBtPromptSheet = () => {
  const fold = window.useRecordFold("prompt", { dirty: false });
  const [channel, setChannel] = useBtpState("whatsapp");
  useBtpEffect(() => (window.__recordFolds && window.__recordFolds.drawn ? window.__recordFolds.drawn("prompt") : undefined), []);
  return { open: fold.open, request: fold.request, close: fold.close, channel, setChannel };
};

/** The text of what the receptionist is told on a channel, as the settings read composed it; null with none. */
const btpComposed = (channel) => (window.__composedPrompt ? window.__composedPrompt(channel) : null);

/**
 * The told section at rest: its title, who reads it on the channel last chosen, and the door. Nothing else: no count,
 * no text, no toggle (Task 4.0's rule). A workspace the server composed nothing for draws nothing here, since an empty
 * section would say the receptionist is told nothing, which is a different claim. Hookless.
 */
const BtPromptTold = ({ prompt }) => {
  const tab = window.__businessTab || {};
  if (!prompt || !tab.PROMPT_READERS || !btpComposed(prompt.channel)) return null;
  return (
    <section className="rec-card bt-told" data-testid="rec-card-told" aria-labelledby="bt-told-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-told-title">What your receptionist is told</h2>
        <span className="rec-card-sub">{tab.PROMPT_READERS[prompt.channel]}</span>
        <button
          type="button" className="bt-link bt-told-open" onClick={prompt.request} aria-describedby="bt-told-title"
          data-rec-act="prompt" data-testid="rec-prompt-open"
        >Read it</button>
      </div>
    </section>
  );
};

/** Take the reader to a block: scrolled to the top of the sheet's body, and focused there so a keyboard reads on from it. */
const btpShow = (id) => {
  const el = document.getElementById ? document.getElementById(`bt-prompt-block-${id}`) : null;
  if (!el) return;
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  if (el.focus) el.focus({ preventScroll: true });
};

/**
 * A block's door back to the row that wrote it. A row of this page is asked for through the registry, which closes
 * this sheet and opens that row's fold, inline editor or sheet; the fold takes focus as it opens. The Autonomy tab's
 * rules go to that tab. A role that may not change the business is offered none, as no row of this page offers it an
 * act: the editor behind it would not open.
 */
const btpDoor = (block, prompt, canEdit) => {
  const door = canEdit ? BTP_DOORS[block.row] : null;
  if (!door) return null;
  const go = () => {
    if (door.to) {
      prompt.close();
      if (window.CHANLY && window.CHANLY.nav) window.CHANLY.nav(door.to);
      return;
    }
    if (window.__recordFolds) window.__recordFolds.request(door.id);
  };
  return (
    <button
      type="button" className="bt-link bt-prompt-door" onClick={go} aria-describedby={`bt-prompt-label-${block.id}`}
      data-testid={`rec-prompt-door-${block.id}`}
    >{door.words}</button>
  );
};

/**
 * The sheet: the kit's RecordSheet (record-sheet.jsx), a modal dialog beside the page, from the bottom on a phone.
 *
 *   head      "What your receptionist is told", and one muted line: who reads it, on the channel shown. No count.
 *   tools     the channel, WhatsApp or Phone, as the kit's toggle group: the two are not the same text.
 *   contents  "Written by": an entry per block, labelled by its row, with ONE quiet indicator of what it costs -- a thin
 *             bar as long as its share -- and the exact count in its description and its tip. The whole prompt's length
 *             is the contents' own name. An entry takes the reader to its block. Not drawn on a phone (settings.css).
 *   blocks    each keyed by its id, not its row (the platform's text is drawn twice on a call): its label, its share in
 *             words (shown on a phone only, where the contents are not), its door back to its row, its text in the
 *             page's own face with its line breaks, and its note as contracts wrote it.
 *   now       what is sent beside the prompt, rebuilt every time, under a dashed rule with the reason it is apart.
 *   foot      Close: there is nothing here to save. Shown on a phone, where the head's Close is a reach.
 *
 * Focus, Escape and the Tab ring are the kit's: it opens on the sheet, Escape and either Close close it, and focus goes
 * back to the told section's door. Hookless beside the kit's sheet, which is the last thing it draws.
 */
const BtPromptSheet = ({ prompt, brain, canEdit = true }) => {
  const tab = window.__businessTab || {};
  const channel = prompt.channel;
  const composed = btpComposed(channel);
  if (!composed || !tab.promptBlocks) return null;
  const blocks = tab.promptBlocks(composed.text, channel, brain);
  const total = composed.text.length;
  const cost = (b) => tab.promptCostWords(b.chars, total);
  const contents = (
    <nav
      className="bt-prompt-rail" aria-labelledby="bt-prompt-rail-title bt-prompt-total" data-testid="rec-prompt-contents"
    >
      <h3 className="bt-prompt-rail-title" id="bt-prompt-rail-title">Written by</h3>
      <span className="rec-sr" id="bt-prompt-total">{tab.promptTotalWords(total)}</span>
      <ol className="bt-prompt-entries">
        {blocks.map((b) => (
          <li key={b.id}>
            <button
              type="button" className="bt-prompt-entry" onClick={() => btpShow(b.id)} title={cost(b)}
              aria-describedby={`bt-prompt-cost-${b.id}`} data-testid={`rec-prompt-entry-${b.id}`}
            >
              <span className="bt-prompt-entry-label">{b.label}</span>
              <span className="bt-prompt-bar" aria-hidden="true">
                <span className="bt-prompt-bar-fill" style={{ width: `${b.share * 100}%` }} />
              </span>
            </button>
            {/* Beside the button, not in it: text inside a button, hidden or not, is part of its name, and the count
                was heard twice, as the name and again as the description. */}
            <span className="rec-sr" id={`bt-prompt-cost-${b.id}`}>{cost(b)}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
  const body = (
    <div className="bt-prompt">
      {contents}
      <div className="bt-prompt-blocks">
        {blocks.map((b) => (
          <section
            key={b.id} id={`bt-prompt-block-${b.id}`} className="bt-prompt-block" tabIndex={-1}
            aria-labelledby={`bt-prompt-label-${b.id}`} data-testid={`rec-prompt-block-${b.id}`}
          >
            <header className="bt-prompt-block-head">
              <h3 className="bt-prompt-block-label" id={`bt-prompt-label-${b.id}`}>{b.label}</h3>
              <span className="bt-prompt-block-share">{tab.blockShareWords(b.chars, total)}</span>
              {btpDoor(b, prompt, canEdit)}
            </header>
            <p className="bt-prompt-block-text">{b.text}</p>
            {b.note ? <p className="bt-prompt-block-note">{b.note}</p> : null}
          </section>
        ))}
        <section className="bt-prompt-now" aria-labelledby="bt-prompt-now-label" data-testid="rec-prompt-now">
          <h3 className="bt-prompt-block-label" id="bt-prompt-now-label">{tab.PROMPT_NOW.label[channel]}</h3>
          <p className="bt-prompt-block-text">{composed.now}</p>
          <p className="bt-prompt-block-note">{tab.PROMPT_NOW.why}</p>
        </section>
      </div>
    </div>
  );
  return (
    <window.RecordSheet
      id="prompt"
      title="What your receptionist is told"
      sub={tab.PROMPT_READERS[channel]}
      className="bt-prompt-sheet"
      onClose={prompt.close}
      tools={(
        <window.RecordToggleGroup
          label="Which receptionist" value={channel} options={BTP_CHANNELS} onChange={prompt.setChannel}
          testid="rec-prompt-channel"
        />
      )}
      foot={<button type="button" className="btn btn-sm bt-prompt-close" onClick={prompt.close}>Close</button>}
    >
      {body}
    </window.RecordSheet>
  );
};

Object.assign(window, { useBtPromptSheet, BtPromptTold, BtPromptSheet });
