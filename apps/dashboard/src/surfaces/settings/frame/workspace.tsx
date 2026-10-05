/**
 * Settings › Business, the pane (moved from legacy/pages/settings.jsx with the frame, decision 0015 step 11): the
 * Business tab over a workspace's record, the card that sets a receptionist up where there is none, a configuration only
 * Chanlytics can repair, and the owner's own copy of everything. The old Business card's rows went with the card (Task
 * 3.7): a fact with where it came from, the two numbers the receptionist decides and the workspace's timezone are rows
 * of the Business tab now, each edited where it is stated (business/who.tsx, business/open.tsx), over the tab's own saver
 * (business/saver.ts).
 */
import { useEffect, useState } from "react";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { RecordRow } from "../../kit/record/row";
import { askAbout, canDo, gate, hrefOf, navigate, refusalToast, showTip, type LegacyFlash } from "../../legacy-verbs";
import { BtCreateCard } from "../business/create";
import { brokenConfigWords, settingsNow, setupApi, setupNow } from "../business/shell";
import { BusinessTab } from "../business/tab";

type Flash = (f: LegacyFlash) => void;

/** What the file holds, said behind the mark beside the link and to a screen reader. */
const DATA_HOLDS =
  "People, conversations with their messages, calls with their transcripts, and every consent change with who recorded it. Call audio is not included: it is removed on the schedule the privacy policy states, and the transcript is here.";

/**
 * The owner's own copy of everything, and the one thing this page cannot do.
 *
 * The privacy page has said "an owner can export a workspace's data" since it was written, and no page offered it: three
 * partial exports (everyone as a CSV on People, one thread, one call) were the whole of it. This is the door the
 * sentence promised -- one file: people, conversations with their messages, calls with their transcripts, and every
 * consent change with who recorded it. Owners only, like the CSV. Deletion is deliberately not a button: it is a request
 * answered by a person, as the same page says.
 */
export function WorkspaceData() {
  // Offered to every role and gated for the ones that may not take it (the one gate). The link was absent for them,
  // under a sentence of the card's own.
  const href = hrefOf("GET export");
  // The record kit's card and rows, as every card of the Business tab above it: it stood apart in the person page's
  // attribute list, the one card on the tab in another shape (23 Sep).
  return (
    <section className="rec-card set-data" data-testid="set-data" aria-labelledby="set-data-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="set-data-title">
          Your data
        </h2>
        <span className="rec-card-sub">Everything this workspace holds, in one file you keep.</span>
      </div>
      <RecordRow
        id="data-export"
        label="Download everything"
        value={
          <span className="set-data-val">
            {href && (
              <a
                className="bt-link"
                href={href}
                download
                data-testid="set-export-all"
                title="People, conversations, calls and consent history as one JSON file"
                {...gate("export", "download the workspace's data")}
              >
                Download (JSON)
              </a>
            )}
            <button
              type="button"
              className="set-mark"
              data-tip={DATA_HOLDS}
              aria-label={`What the file holds: ${DATA_HOLDS.charAt(0).toLowerCase()}${DATA_HOLDS.slice(1)}`}
              onClick={(e) => showTip(e.currentTarget)}
            >
              <Icon name="info" size={12} />
            </button>
          </span>
        }
      />
      <RecordRow
        id="data-delete"
        label="Delete this workspace"
        value={
          <span className="set-team-mail">
            Write to <a href="mailto:hi@chanlytics.com">hi@chanlytics.com</a> from the owner's address. Its data is
            removed within 30 days, as the{" "}
            <a href="/privacy" target="_blank" rel="noreferrer">
              privacy policy
            </a>{" "}
            says.
          </span>
        }
      />
    </section>
  );
}

/** Only Chanlytics can repair a broken configuration (S8): the card asks for the repair, and once asked says when. */
function BrokenConfig({ issues, flash }: { issues: readonly string[]; flash: Flash }) {
  const W = brokenConfigWords();
  const repairAsked = setupNow()?.dto?.requests?.repair ?? null;
  if (!W) return null;
  const askRepair = async () => {
    const setup = setupApi();
    if (!canDo("approve") || !setup) return;
    const r = await setup.request("repair");
    flash(
      r.ok
        ? {
            msg: r.already ? (
              <>Already asked — a person at Chanlytics has it.</>
            ) : (
              <>We got it — a person at Chanlytics will repair your settings and reach you by email.</>
            ),
          }
        : refusalToast(r, "Request not sent"),
    );
  };
  return (
    <>
      <section className="fl-card set-card">
        <div className="fl-card-head">
          <h2 className="fl-card-title">Business</h2>
        </div>
        <FailedRead kind="card" title={W.title} body={W.body} testid="settings-broken">
          <ul className="set-broken-issues">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          {repairAsked ? (
            <span className="set-row-hint" data-testid="settings-broken-requested">
              {W.requested(repairAsked, Date.now())}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void askRepair()}
              data-testid="settings-broken-ask"
              {...gate("approve", "ask for a repair")}
            >
              {W.ask}
            </button>
          )}
        </FailedRead>
      </section>
    </>
  );
}

/**
 * No settings read behind the page at all: the standalone mockup, which drew the demo's business. `real` was doing two
 * jobs, and a workspace with no brain fell to this branch and showed a real owner Serenity Spa's invented name, phone,
 * therapists and 9-6 seven-day hours, on a surface classified real.
 */
function DemoBusiness() {
  return (
    <section className="fl-card set-card">
      <div className="fl-card-head">
        <h2 className="fl-card-title">Business</h2>
        {/* The mockup's compose flow asks an assistant to update details it has no way to write. */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => askAbout({ mode: "compose", prompt: "Update our business details: " })}
        >
          <Icon name="edit" size={11} /> Edit
        </button>
      </div>
      <div className="cl-prof-attr-list">
        <div className="cl-prof-attr">
          <span className="cl-prof-attr-key">Name</span>
          <span className="cl-prof-attr-val">Serenity Spa</span>
        </div>
        <div className="cl-prof-attr">
          <span className="cl-prof-attr-key">Workspace</span>
          <span className="cl-prof-attr-val">Chanlytics Sales · Professional</span>
        </div>
        <div className="cl-prof-attr">
          <span className="cl-prof-attr-key">Hours</span>
          <span className="cl-prof-attr-val" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Mon–Sun · 9:00 AM – 6:00 PM
            <button
              className="cl-bucket-link"
              title="Availability rules live on the Calendar"
              onClick={() => navigate("calendar")}
            >
              Edit on Calendar <Icon name="arrow-right" size={10} />
            </button>
          </span>
        </div>
        <div className="cl-prof-attr">
          <span className="cl-prof-attr-key">Phone line</span>
          <span className="cl-prof-attr-val">+1 (415) 555-0100</span>
        </div>
        <div className="cl-prof-attr">
          <span className="cl-prof-attr-key">Staff</span>
          <span className="cl-prof-attr-val">Lena Park · Jay Rivera</span>
        </div>
      </div>
    </section>
  );
}

export function PaneWorkspace({ flash }: { flash: Flash }) {
  // Drawn again whenever the settings surface is read again: after a save, a conflict's re-read, a Retry. Only Autonomy
  // and Notifications listened, so this card kept the values from before a save until something else happened to
  // repaint it (D7).
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("surface:settings", bump);
    // And when Setup is read again: a broken configuration's card says when a repair was asked for (S8), and the ask is Setup's.
    window.addEventListener("surface:setup", bump);
    return () => {
      window.removeEventListener("surface:settings", bump);
      window.removeEventListener("surface:setup", bump);
    };
  }, []);
  const settings = settingsNow() || null;
  const config = settings?.config as { brain?: unknown } | null | undefined;
  const S = (config && config.brain) || null;
  const real = !!S;
  /**
   * "No configuration" is NOT "show the demo".
   *
   * `real` was doing two jobs: is this a live workspace, and do we have its details. A workspace with no brain fell to
   * the mockup branch and rendered Serenity Spa's invented name, phone, therapists and 9–6 seven-day hours to a real
   * owner, on a surface classified real, under a live pill.
   *
   * That is not hypothetical: migration 00017 provisions every new tenant with an EMPTY tenant_config row, so it was the
   * first thing each new owner saw — and a config the parser refuses collapses to {} on read and lands here too. The same
   * bug on the team card one row below shipped once already.
   */
  const connected = !!settings;
  const unconfigured = connected && !real;
  // And "broken" is a third thing. The server now says so instead of handing back {} — which landed here as
  // `unconfigured` and offered a form whose save would have replaced the broken row with its few fields.
  if (settings && settings.broken) return <BrokenConfig issues={settings.broken.issues} flash={flash} />;
  /**
   * The record: every fact is a row, and a row is edited where it is stated (business/tab.tsx, the spec
   * docs/superpowers/specs/2026-09-20-business-tab-design.md). What stood here was two surfaces that disagreed about
   * what exists -- a card showing nine facts, and a form editing about twenty-five behind one Save -- and one of them had
   * to be opened before the other could be corrected. The page draws the head, who last changed it, the standing line,
   * every row and its editor, and says why once to a role that may not change it. What the receptionist is told is the
   * page's own since Phase 5 (business/prompt.tsx: a told section at rest and the sheet it opens), and the owner's copy
   * of everything is below it.
   */
  if (real) {
    return (
      <>
        <BusinessTab flash={flash} />
        <WorkspaceData />
      </>
    );
  }
  /* Nothing set up yet: the empty state, and the fold that sets a receptionist up from it (business/create.tsx).
     Provisioning inserts an EMPTY tenant_config row (migration 00017), so this is the first thing every new owner sees. */
  if (unconfigured) return <BtCreateCard flash={flash} />;
  return <DemoBusiness />;
}
