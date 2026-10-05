/**
 * The ledger: the runs by state and what went, the week ahead, the runs, and the section that gets a yes (moved from
 * legacy/pages/broadcasts.jsx, decision 0015). Plain functions that return the elements they draw, called from
 * BroadcastsReal with the page's state.
 */
import { CAMPAIGN_ROOMS } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { EmptyState } from "../../../kit/empty/empty";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { gate, navigate } from "../../../legacy-verbs";
import { composeRoute } from "../../home/address";
import { NewMessageLabel } from "../../home/new-label";
import { BcBand, BcHistoryStats, BcWeek } from "../ledger";
import { CmHead } from "../../parts/head";
import type { BcBase, BcV } from "./types";

// Get their yes: the QR and the phrase, folded to its one line under the runs.
function bcOptIn({ data, yesOpen, setYesOpen, flash }: Pick<BcBase, "data" | "yesOpen" | "setYesOpen" | "flash">) {
  const optIn = data.optIn;
  const link = optIn && optIn.link;
  return (
    link && (
      <section id="bc-optin" className="ct-section bc-optin" data-testid="bc-optin">
        {/* Folded to its one line under the runs, open where the address asks for it (broadcasts/get-yes, which
              every "nobody has said yes to offers" door lands on) or a press opens it. Open on every visit, it
              was 194px of a desk and 543px of a phone under the runs. */}
        <details
          className="bc-yes"
          open={yesOpen}
          onToggle={(e) => setYesOpen(!!(e && e.currentTarget && e.currentTarget.open))}
        >
          <summary className="bc-yes-head" data-testid="bc-optin-toggle">
            <span className="bc-yes-k">Get their yes</span>
            <span className="bc-yes-note">only people who said yes get a broadcast</span>
            <Icon name="chevron-down" size={12} />
          </summary>
          <div className="bc-optin-body">
            <img
              className="bc-optin-qr"
              src={optIn.qrPath as string}
              alt={`QR code that opens WhatsApp with “${optIn.phrase}” ready to send`}
              width={120}
              height={120}
            />
            <div className="bc-optin-text">
              {/* What it does, in two short sentences where two paragraphs stood: the code, the words it sends, and how a
                  yes is undone. */}
              <p>
                A scan or a tap opens WhatsApp with <b>{optIn.phrase}</b> ready to send, and sending it records their
                yes. <b>{optIn.phraseEs}</b> works in Spanish; STOP undoes it.
              </p>
              <div className="bc-chips">
                {/* The code with the words a customer needs before scanning it, on one printable sheet: a bare
                    code on a desk says nothing about whose messages, what they are, or how to stop them. */}
                {optIn.pageUrl && (
                  <a
                    className="btn btn-sm btn-primary"
                    href={`${optIn.pageUrl}/sign`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="bc-optin-sign"
                  >
                    Print a desk sign
                  </a>
                )}
                <Button
                  size="sm"
                  data-testid="bc-optin-copy"
                  onClick={() => {
                    if (navigator.clipboard)
                      void navigator.clipboard.writeText(link).then(() => flash({ msg: <>Link copied</> }));
                  }}
                >
                  Copy link
                </Button>
                <a className="btn btn-sm" href={optIn.qrPath as string} download="say-yes-to-offers.svg">
                  Download QR
                </a>
                <a className="cl-bucket-link" href={link} target="_blank" rel="noreferrer">
                  Open the link
                </a>
              </div>
              {optIn.pageUrl && (
                <p className="bc-optin-page" data-testid="bc-optin-page">
                  Your sign-up page,{" "}
                  <a className="cl-bucket-link" href={optIn.pageUrl} target="_blank" rel="noreferrer">
                    {optIn.pageUrl.replace("https://", "")}
                  </a>
                  , has the same code with the wording the phone carriers ask for. On paper, print{" "}
                  <a
                    className="cl-bucket-link"
                    href={`${optIn.pageUrl}/form`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="bc-optin-form"
                  >
                    the sign-up form
                  </a>{" "}
                  and record each signed box on their profile as “Sign-up form”.
                </p>
              )}
            </div>
          </div>
        </details>
      </section>
    )
  );
}

// The ledger, the page's list: its head (the runs by state, what went, the week ahead), the runs, and the section that gets a yes.
/** `glass`: the page's act as the canvas draws it in Glass, a capsule of the control layer; coral is the composer's. */
export function bcLedger(v: BcV, glass = false) {
  const { rows, band, setBand, data, origin, setOrigin, now, runs, runCard, sentN, recent } = v;
  // New message is the home's one door to the composer, at its address (`campaigns/new`): the same sheet, the same name, and Back
  // closes it, whichever room it is pressed in.
  const write = () => navigate(composeRoute("once"));
  return (
    <div className="bc-list">
      {/* The page's act and, in Glass, the frame's head: Sent is a room of Campaigns' home (crumbs Campaigns › Sent, no strip
          of tabs), so the head names it. It says no sentence: a sentence is drawn in the frame's <p>, where a strip of filters is not
          phrasing and in Glass is not drawn at all on a desk. The runs by state, each its own filter -- "waiting on you"
          is the one that is warn -- are the list's head, and what went out under them. It was a headline, a sentence
          about the ledger, a flag saying "1 waiting on you" and, under them, a card saying it again beside a bar of the
          same numbers. */}
      <CmHead
        title="Sent"
        testid="bc-head"
        right={
          <Button
            variant={glass ? "secondary" : "primary"}
            onClick={write}
            data-testid="bc-new"
            {...gate("approve", "send a message")}
          >
            <Icon name="plus" size={12} /> <NewMessageLabel />
          </Button>
        }
      />
      <BcBand rows={rows} band={band} onBand={setBand} />
      <BcHistoryStats
        rows={rows}
        more={data.more}
        replyWindow={data.replyWindow}
        origin={origin}
        onOrigin={setOrigin}
        counted
      />
      {rows.length > 0 && <BcWeek rows={rows} now={now} />}
      <div className="bc-runs" data-testid="bc-runs">
        {runs.map(runCard)}
        {!band && sentN > recent.filter((r) => r.state === "sent").length && (
          <LinkButton className="bc-runs-more" onClick={() => setBand("sent")} data-testid="bc-runs-more">
            All {sentN} sent <Icon name="arrow-right" size={11} />
          </LinkButton>
        )}
        {band && runs.length === 0 && (
          <EmptyState
            kind="line"
            title={
              origin === "playbook"
                ? "No playbook has run yet."
                : origin === "hand"
                  ? "Nothing sent by hand yet."
                  : "Nothing here."
            }
          />
        )}
      </div>
      {rows.length === 0 && (
        <EmptyState
          kind="card"
          glyph="send"
          title="Nothing sent or queued yet"
          body="Every run lands here — the ones you send, and the ones your playbooks send."
          action={{
            label: CAMPAIGN_ROOMS.newMessage,
            onClick: write,
            gate: { ...gate("approve", "send a message") },
          }}
          testid="bc-empty"
        />
      )}
      {bcOptIn(v)}
    </div>
  );
}
