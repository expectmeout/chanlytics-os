/**
 * Settings › Business, the pane (moved from legacy/pages/settings.jsx with the frame, decision 0015 step 11): the
 * Business tab over a workspace's record, the card that sets a receptionist up where there is none, a configuration only
 * Chanlytics can repair, and the owner's own copy of its records. The old Business card's rows went with the card (Task
 * 3.7): a fact with where it came from, the two numbers the receptionist decides and the workspace's timezone are rows
 * of the Business tab now, each edited where it is stated (business/who.tsx, business/open.tsx), over the tab's own saver
 * (business/saver.ts).
 */
import { useEffect, useState } from "react";
import { BROKEN_CONFIG_WORDS, EXPORT_HOLDS_WORDS, exportLeftOutWords } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordTip } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { askAbout, canDo, gate, hrefOf, navigate, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { BtCreateCard } from "../business/create";
import { setupVerbs } from "../../setup/surface";
import { settingsNow, setupNow } from "../business/shell";
import { BusinessTab, type BusinessPart } from "../business/tab";

type Flash = (f: LegacyFlash) => void;

/**
 * What the file holds, said behind the mark beside the link and to a screen reader: what is in it, and what it leaves out,
 * both from contracts' EXPORT_OF, which the file is written by (the wiring's second audit, R14 X1: the card said
 * "everything", above "Delete this workspace", when the file was the customer record alone).
 */
const DATA_HOLDS = `${EXPORT_HOLDS_WORDS} ${exportLeftOutWords()}`;

/**
 * The owner's own copy of the workspace's records, and the one thing this page cannot do.
 *
 * The privacy page has said "an owner can export a workspace's data" since it was written, and no page offered it: three
 * partial exports (everyone as a CSV on People, one thread, one call) were the whole of it. This is the door the
 * sentence promised -- one file, with a section for every kind of record, and what it leaves out named at its end. Owners
 * only, like the CSV. Deletion is deliberately not a button: it is a request answered by a person, as the same page says.
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
        <span className="rec-card-sub">Your workspace's records, in one file you keep.</span>
      </div>
      <RecordRow
        id="data-export"
        label="Download your records"
        value={
          <span className="set-data-val">
            {href && (
              <a
                className="bt-link"
                href={href}
                download
                data-testid="set-export-all"
                title="Your workspace's records as one JSON file"
                {...gate("export", "download the workspace's data")}
              >
                Download (JSON)
              </a>
            )}
            <RecordTip
              text={DATA_HOLDS}
              label={`What the file holds: ${DATA_HOLDS.charAt(0).toLowerCase()}${DATA_HOLDS.slice(1)}`}
            />
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
  const W = BROKEN_CONFIG_WORDS;
  const repairAsked = setupNow()?.dto?.requests?.repair ?? null;
  const askRepair = async () => {
    if (!canDo("approve")) return;
    const r = await setupVerbs.request("repair");
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
      <section className="rec-card set-card">
        <div className="rec-card-head">
          <h2 className="rec-card-title">Business</h2>
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
            <Button
              size="sm"
              onClick={() => void askRepair()}
              data-testid="settings-broken-ask"
              {...gate("approve", "ask for a repair")}
            >
              {W.ask}
            </Button>
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
    <section className="rec-card set-card">
      <div className="rec-card-head">
        <h2 className="rec-card-title">Business</h2>
        {/* The mockup's compose flow asks an assistant to update details it has no way to write. */}
        <Button
          size="sm"
          variant="quiet"
          onClick={() => askAbout({ mode: "compose", prompt: "Update our business details: " })}
        >
          <Icon name="edit" size={11} /> Edit
        </Button>
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
            <LinkButton title="Availability rules live on the Calendar" onClick={() => navigate("calendar")}>
              Edit on Calendar <Icon name="arrow-right" size={10} />
            </LinkButton>
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

export function PaneWorkspace({
  flash,
  row = null,
  part = "workspace",
}: {
  flash: Flash;
  row?: string | null;
  /** Which of the business's pages: Details (`workspace`), Hours & booking, or How it answers (tabs.ts). */
  part?: BusinessPart;
}) {
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
   * to be opened before the other could be corrected. Each of the business's pages draws its part of the record, its
   * rows and their editors, and says why once to a role that may not change it. What the receptionist is told is How it
   * answers' (business/prompt.tsx: a told section at rest and the sheet it opens), and the owner's copy of everything is
   * Billing's (WorkspaceData, drawn there since the split of 17 Oct 2026).
   */
  if (real) return <BusinessTab flash={flash} open={row} part={part} />;
  /* Nothing set up yet: the empty state, and the fold that sets a receptionist up from it (business/create.tsx).
     Provisioning inserts an EMPTY tenant_config row (migration 00017), so this is the first thing every new owner sees. */
  if (unconfigured) return <BtCreateCard flash={flash} />;
  return <DemoBusiness />;
}
