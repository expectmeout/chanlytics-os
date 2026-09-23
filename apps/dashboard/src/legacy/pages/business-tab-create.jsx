/* global React */
// Chanlytics — Settings › Business, on a workspace with no receptionist yet.
//
// Provisioning gives every new workspace an EMPTY config (migration 00017), and the form this page replaced was the
// one way to set a receptionist up from inside the product: its create path asked for the three things it cannot
// answer anyone without -- the business's name, a number to give out, and the booking link -- and saved them with the
// product's own opening lines and messages (contracts newReceptionistDefaults). This card is that path as a fold of
// the page (BtFold, business-tab-gestures.jsx; what it writes is business-tab-folds.jsx's "receptionist" fold): at
// rest, the empty state the old card said, whose "Set up the receptionist" opens the fold in its place. Once the
// server takes the save the settings surface is read again, and the pane draws the record (PaneWorkspace,
// settings.jsx). Everything else the old form asked on the same screen is a row of the page from then on.
//
// Below it, the workspace's timezone: the workspace's and not the receptionist's, it decides what "today" means on
// every page from the first day, so it can be set before a receptionist exists (S13). It is When you're open's own
// row (window.BtZoneRow, business-tab-open.jsx), not a copy of it.
//
// And the fold asks how customers buy (docs/decisions/0008, "One switch"), with "They book an appointment" chosen
// until someone chooses otherwise: What you offer's own choice (window.btSellsByChoice, business-tab-offer.jsx). The
// answer is the workspace's too, so the create save never carries it; once the server has taken the receptionist, it
// goes through the workspace's own door (business-tab-save.jsx `sellsBy`, PATCH workspaces), as What you offer's row
// saves it.
//
// Loaded after business-tab-services.jsx and before business-tab.jsx (both load lists), and read by PaneWorkspace as
// window.BtCreateCard. Its top-level names are btc-prefixed, it holds no hook of its own (the fold and the rows hold
// theirs, drawn on every render), and no pattern in it holds an object rest, for the reasons business-tab-save.jsx
// gives.

/**
 * The create path's three fields, in the old form's order: the name, the number to give out, the booking link. Each
 * box is named by its visible label. The number is the Who you are row's own box (window.btPublishedBox), so the
 * choice between the line and a different number, and what each costs, are written once. Under them, how customers
 * buy, named by its question and chosen as `buys.first` says until a choice is made (the draft's `sells_by`, which no
 * write of the receptionist fold reads: business-tab-folds.jsx writes its own paths and nothing else).
 */
const BtcFields = ({ draft, update, problems, readOnly, line, handoff, buys }) => {
  const d = draft || {};
  const number = window.btPublishedBox({ line, handoff, testid: "rec-create-number" });
  return (
    <>
      <window.RecordField
        id="bt-create-name"
        label="Business name"
        value={d.name}
        onChange={(v) => update((was) => ({ ...was, name: v }), ["name"])}
        problem={problems.name || null}
        placeholder="The name customers know you by"
        autoComplete="organization"
        readOnly={readOnly || undefined}
        testid="rec-create-name"
      />
      <div className="bt-create-number" role="group" aria-labelledby="bt-create-number-label" data-testid="rec-create-number">
        <span className="rec-field-label" id="bt-create-number-label">Tell customers to call</span>
        {number({
          draft: { own: d.own, typed: d.typed },
          // With no line to follow, a number typed IS the number: `own` means the line only where there is one, and
          // a draft that kept it true would store no number at all. That normalising is what lets the fold's write
          // read `own` alone (business-tab-folds.jsx says so where it writes the key).
          set: (n) => update((was) => ({ ...was, own: line ? n.own : false, typed: n.typed }), ["number"]),
          problem: problems.number || null,
          field: { id: "bt-create-number", label: null, "aria-labelledby": "bt-create-number-label", readOnly: readOnly || undefined },
          gate: null,
          readOnly,
        })}
      </div>
      <window.RecordField
        id="bt-create-link"
        label="Booking link"
        value={d.link}
        onChange={(v) => update((was) => ({ ...was, link: v }), ["link"])}
        problem={problems.link || null}
        hint="Sent instead of confirming an appointment itself."
        placeholder="https://your-booking-page.com"
        inputMode="url"
        autoComplete="url"
        readOnly={readOnly || undefined}
        testid="rec-create-link"
      />
      {buys && window.btSellsByChoice ? window.btSellsByChoice({
        id: "bt-create-sells-by",
        vm: buys,
        value: d.sells_by || buys.first,
        set: (v) => update((was) => ({ ...was, sells_by: v }), ["sells_by"]),
        readOnly,
        label: true,
        testid: "rec-create-sells-by",
      }) : null}
    </>
  );
};

/**
 * The workspace's answer to how its customers buy, sent once the receptionist is set up (BtFold's `after`), and only
 * where it is not the one stored: through the workspace's own door, as What you offer's row sends it. Its toast is not
 * said, since the receptionist's toast says the one act; a refusal is, in the server's words, and the answer can be
 * given again on the Business tab's row.
 */
const btcSendAnswer = ({ draft, stored, buys, flash }) => {
  const next = (draft && draft.sells_by) || buys.first;
  const door = window.__businessTabSave.sellsBy;
  if (next === stored || !door) return;
  door.save({ answer: next, said: null, done: null, flash: (f) => { if (f && f.tone === "danger") flash(f); } });
};

/**
 * The card a workspace with no receptionist is shown. A role that may not change the business reads the empty state
 * with its act gated, saying why at the press, as the old card's did; the fold never opens for it.
 */
const BtCreateCard = ({ flash = () => {} }) => {
  const S = window.__businessTabSave;
  const F = ((window.__FACTS || {}).facts) || {};
  // The line it answers, and the transfer number, as the settings read resolved them: the number's box and its check
  // are the Who you are row's, and ask both.
  const line = (F.voice_line && F.voice_line.value) || "";
  const handoff = (F.handoff_number && F.handoff_number.value) || null;
  const canEdit = !window.canDo || window.canDo("settings");
  const gate = window.gate("settings", "set up the receptionist");
  const Fold = window.BtFold;
  // How customers buy, as the workspace list carries it, and its words (contracts sellsByVM); none without the bridge.
  const tab = window.__businessTab || {};
  const stored = window.btSellsByNow ? window.btSellsByNow() : null;
  const buys = tab.sellsByVM ? tab.sellsByVM(stored) : null;
  return (
    <section className="rec-card" data-testid="rec-card-create" aria-labelledby="bt-create-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-create-title">Business</h2>
      </div>
      <Fold
        id="receptionist"
        label="Set up your receptionist"
        hint="The three things it cannot answer anyone without."
        // No preview is composed for a workspace with no receptionist, so nothing is said it will be told.
        channel={null}
        said={<>Saved — the receptionist picks these up within a minute</>}
        canEdit={canEdit}
        gate={gate}
        flash={flash}
        saver={S.saver}
        check={(d) => {
          const bad = S.CHECK_OF.phone_display({ own: !!(d && d.own), typed: (d && d.typed) || "" }, line);
          return bad ? { number: bad } : {};
        }}
        rest={({ request, can }) => (
          <window.EmptyState
            kind="card"
            glyph="agents"
            title="This workspace has no receptionist yet"
            body="Nothing has been set up for it — no business name, no phone line, no booking link — so nothing is answering your customers yet."
            // Offered only where there is something read to save onto, as a row's act is: the press would otherwise
            // open nothing, the fold having no draft to work out.
            action={can ? { label: "Set up the receptionist", onClick: request, gate, recAct: "receptionist", testid: "rec-create-open" } : null}
          />
        )}
        body={(f) => <BtcFields {...f} line={line} handoff={handoff} buys={buys} />}
        after={buys ? (draft) => btcSendAnswer({ draft, stored, buys, flash }) : null}
      />
      <window.BtZoneRow brain={{}} canEdit={canEdit} gate={window.gate("settings", "change the timezone")} flash={flash} />
    </section>
  );
};

Object.assign(window, { BtCreateCard });
