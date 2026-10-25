/**
 * Check (canvas R2, V2, P2; moved from legacy/pages/first-run.jsx, decision 0015): what the receptionist answers from, in
 * the Business tab's own rows, over the settings read's brain -- the week and its clock, where the business is, its
 * website; the booking link (optional for every business: with none, its receptionist takes their details) and the
 * rules it keeps (the price rule shown as its default); what it offers and the languages it speaks. Each row saves
 * through the tab's one saver, and a sheet opens over the first run as it does over the tab. Nothing of how customers buy
 * is asked (0008, amended 18 Oct 2026: every workspace has deals). With no receptionist yet: an owner's one press, or who
 * sets it up. `canEdit` is whether the role may change the business, as the
 * tab asks it.
 *
 * The Business tab's rows are Settings' own, imported through setup/shell.ts (which says why their props are loose there)
 * until the Business tab moves (step 11).
 */
import type { ReactNode } from "react";
import { FIRST_RUN_HELPERS, type FIRST_RUN_WORDS, type FirstRunCheckVM } from "@chanlytics/contracts";
import type { SettingsRecord } from "@/legacy-bridge/surfaces/settings";
import { FailedRead } from "../../kit/empty/empty";
import { recFolds } from "../../kit/record/registry";
import { gate, surfaceFailed, type LegacyFlash } from "../../legacy-verbs";
import { BtPriceChoiceRow } from "../../settings/business/choices/rows";
import {
  BtAddressRow,
  BtBookingLinkRow,
  BtHoursRow,
  BtLanguagesRow,
  BtRulesRow,
  BtServicesRow,
  BtWebsiteRow,
  BtZoneRow,
  businessTabSave,
  type BusinessTabSave,
} from "../shell";
import { brainOf, type CardBrain } from "./inputs";
import { FrChips } from "./chips";
import { SteadyLabel } from "./parts";

type CheckWords = (typeof FIRST_RUN_WORDS)["check"];

interface CheckProps {
  check: FirstRunCheckVM;
  W: CheckWords;
  flash: (f: LegacyFlash) => void;
  make: () => void;
  making: boolean;
  go: (to: string) => void;
  canEdit: boolean;
  settings: SettingsRecord | null;
  /**
   * The two things only the owner knows (decision 0073, canvas 2): walk-ins, drawn in a card of their own with the price
   * row moved beside them out of the booking card. Absent, the price row stays with the booking link, as it was.
   */
  onlyYou?: ReactNode;
  /** What the Business Profile and the website said (decision 0073, R10, R17), offered after what it offers. */
  found?: ReactNode;
}

/** No brain read yet: the owner's press, who sets it up, the read on its way, or a read that failed and its retry. */
function noBrain(check: FirstRunCheckVM, W: CheckWords, make: () => void, making: boolean): ReactNode {
  if (check.make) {
    return (
      <div className="fr-make" data-testid="fr-check-make">
        <p className="fr-note">{check.make.sentence}</p>
        <button
          type="button"
          className="btn btn-lg btn-primary"

          onClick={make}
          disabled={making}
          aria-busy={making || undefined}
          data-testid="fr-check-make-press"
          {...gate("settings", "set up the receptionist")}
        >
          <SteadyLabel busy={making} idle={check.make.cta} doing={check.make.busy} />
        </button>
      </div>
    );
  }
  if (check.waiting)
    return (
      <p className="fr-note" data-testid="fr-check-waiting">
        {check.waiting}
      </p>
    );
  if (surfaceFailed("admin", "workspace")) {
    return (
      <FailedRead
        kind="card"
        what={W.failedWhat}
        surface="settings"
        testid="fr-check-failed"
        retryTestid="fr-check-retry"
      />
    );
  }
  return (
    <p className="fr-reading" data-testid="fr-check-reading">
      {W.reading}
    </p>
  );
}

/** What it offers and the languages it speaks: the tab's two rows, each with its chips. */
function offerCard(o: {
  W: CheckWords;
  brain: CardBrain;
  rows: Record<string, unknown>;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
  saver: BusinessTabSave["saver"];
  chips: ReturnType<typeof FIRST_RUN_HELPERS.chips>;
}) {
  const { W, brain, rows, canEdit, flash, saver, chips } = o;
  const C = W.chips;
  return (
    <section className="rec-card fr-check-group" aria-label={W.groups.offer}>
      <BtServicesRow brain={brain} canEdit={canEdit} saver={saver} />
      {chips.services.chips.length || chips.services.full ? (
        <FrChips
          list="services"
          label={C.services}
          set={chips.services}
          doing="change your services"
          canEdit={canEdit}
          flash={flash}
          words={C}
          more={{ label: C.ownService, onClick: () => void recFolds.request("services") }}
          moreTestid="fr-chip-own-service"
        />
      ) : null}
      <BtLanguagesRow
        {...rows}
        rest={({ request: open, can }: { request: () => void; can: boolean }) => (
          <FrChips
            list="languages"
            label={C.languages}
            set={chips.languages}
            doing="change the languages it speaks"
            canEdit={canEdit}
            flash={flash}
            words={C}
            more={can ? { label: C.otherLanguage, onClick: open, act: "languages" } : null}
            moreTestid="fr-chip-other-language"
          />
        )}
      />
    </section>
  );
}

export const FrCheck = ({
  check,
  W,
  flash,
  make,
  making,
  go,
  canEdit,
  settings,
  onlyYou = null,
  found = null,
}: CheckProps) => {
  const brain = brainOf(settings && settings.config);
  // The settings read's brain draws the rows. None there: the owner's press, who sets it up, or, set up and not read back
  // yet, the read on its way; and a read that failed, its retry.
  if (!settings || !brain) return noBrain(check, W, make, making);
  const S = businessTabSave;
  const saver = S.saver;
  const base = saver.base();
  const rows = { brain, base, canEdit, flash, saver };
  const note = check.unsure ? (
    <span className="fr-unsure" data-testid="fr-check-unsure">
      {check.unsure}
    </span>
  ) : null;
  // What it offers and the languages it speaks, as chips over the config the next save goes on: a tap is on at once.
  const brainNow = brainOf(base) || brain;
  // The booking page the website names (3c-4), offered while no link is on the config the next save goes on (contracts'
  // one test): taken in the row's own press, or a link typed into the row, it goes at once.
  const offered = FIRST_RUN_HELPERS.bookingPageOffered(check.bookingPage, !!brainNow.booking_link);
  const profile = brainNow.profile || {};
  const chips = FIRST_RUN_HELPERS.chips({ type: check.type, services: profile.services, languages: profile.languages });
  const find = check.find;
  return (
    <div className="fr-check" data-testid="fr-check">
      <section className="rec-card fr-check-group" aria-label={W.groups.facts}>
        <BtHoursRow
          brain={brain}
          prompt={settings.prompt || null}
          canEdit={canEdit}
          flash={flash}
          saver={saver}
          note={note}
        />
        <BtZoneRow brain={brain} canEdit={canEdit} flash={flash} />
        <BtAddressRow {...rows} />
        <BtWebsiteRow {...rows} />
      </section>
      <section className="rec-card fr-check-group" aria-label={W.groups.booking}>
        <BtBookingLinkRow
          {...rows}
          other={
            offered
              ? { value: offered, sentence: W.bookingPage.found(offered), use: offered, useLabel: W.bookingPage.use }
              : null
          }
        />
        {onlyYou ? null : <BtPriceChoiceRow canEdit={canEdit} flash={flash} />}
        <BtRulesRow {...rows} config={settings.config} />
      </section>
      {offerCard({ W, brain, rows, canEdit, flash, saver, chips })}
      {found}
      {onlyYou ? (
        <section className="rec-card fr-check-group fr-only-you" aria-label={W.onlyYou} data-testid="fr-only-you">
          <h2 className="fr-sub">{W.onlyYou}</h2>
          {onlyYou}
          <BtPriceChoiceRow canEdit={canEdit} flash={flash} />
        </section>
      ) : null}
      {find ? (
        <p className="fr-note">
          <button type="button" className="link-btn" onClick={() => go(find.to)} data-testid="fr-check-find">
            {find.label}
          </button>
        </p>
      ) : null}
    </div>
  );
};
