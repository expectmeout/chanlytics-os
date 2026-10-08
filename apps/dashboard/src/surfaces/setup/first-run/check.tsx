/**
 * Check (canvas R2, V2, P2; moved from legacy/pages/first-run.jsx, decision 0015): what the receptionist answers from, in
 * the Business tab's own rows, over the settings read's brain -- the week and its clock, where the business is, its
 * website; how customers buy, the booking link (for a business that books) and the rules it keeps (the price rule shown as
 * its default); what it offers and the languages it speaks. Each row saves through the tab's one saver, and a sheet opens
 * over the first run as it does over the tab. How customers buy is the tab's own choice, drawn open and saved at once
 * through the workspace's door; until it is said, the first answer is shown, and Looks right sends it (FirstRun). With no
 * receptionist yet: an owner's one press, or who sets it up. `canEdit` is whether the role may change the business, as the
 * tab asks it.
 *
 * The Business tab's rows are Settings' (pages/business-tab-*.jsx), borrowed by name through setup/shell.ts until the
 * Business tab moves (step 11).
 */
import { useState, type RefObject, type ReactNode } from "react";
import {
  bookingLinkOptional,
  bookingLinkRowWords,
  FIRST_RUN_HELPERS,
  type FIRST_RUN_WORDS,
  type FirstRunCheckVM,
} from "@chanlytics/contracts";
import type { SettingsRecord } from "@/legacy-bridge/surfaces/settings";
import { FailedRead } from "../../kit/empty/empty";
import { recFolds } from "../../kit/record/registry";
import { gate, surfaceFailed, type LegacyFlash } from "../../legacy-verbs";
import { businessPart, businessTabSave, sellsByChoice, type BusinessPart, type BusinessTabSave } from "../shell";
import { brainOf, sellsByAnswer, sendAnswer, type CardBrain } from "./inputs";
import { FrChips } from "./chips";
import { useSettled, type SettledEntry } from "./settle";

type CheckWords = (typeof FIRST_RUN_WORDS)["check"];

interface CheckProps {
  check: FirstRunCheckVM;
  W: CheckWords;
  flash: (f: LegacyFlash) => void;
  make: () => void;
  making: boolean;
  go: (to: string) => void;
  canEdit: boolean;
  held: RefObject<SettledEntry | null>;
  settings: SettingsRecord | null;
}

/** A part of the Business tab, by the name Settings' JSX publishes it under: drawn where the call stands, as the JSX did. */
const part = (name: Parameters<typeof businessPart>[0]): BusinessPart => businessPart(name) as BusinessPart;

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
          {making ? check.make.busy : check.make.cta}
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
  const ServicesRow = part("BtServicesRow");
  const LanguagesRow = part("BtLanguagesRow");
  return (
    <section className="rec-card fr-check-group" aria-label={W.groups.offer}>
      <ServicesRow brain={brain} canEdit={canEdit} saver={saver} />
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
      <LanguagesRow
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

export const FrCheck = ({ check, W, flash, make, making, go, canEdit, held, settings }: CheckProps) => {
  // How customers buy, as the owner is choosing it: shown at once, sent once the keys settle, and let go of once the
  // answer is taken or refused.
  const [soon, setSoon] = useState<string | null>(null);
  const settled = useSettled(held);
  const brain = brainOf(settings && settings.config);
  // The settings read's brain draws the rows. None there: the owner's press, who sets it up, or, set up and not read back
  // yet, the read on its way; and a read that failed, its retry.
  if (!settings || !brain) return noBrain(check, W, make, making);
  const S = businessTabSave() as BusinessTabSave;
  const saver = S.saver;
  const base = saver.base();
  const rows = { brain, base, canEdit, flash, saver };
  const answer = sellsByAnswer();
  const door = S.sellsBy;
  const choice = sellsByChoice();
  // The booking link is asked of a business that books (the spec's "only for businesses that book"). One that quotes has
  // none by right (contracts bookingLinkOptional), and its row is drawn only while it has a link to show; in its place,
  // what it does without one, in the row's own words (bookingLinkRowWords).
  const quotes = bookingLinkOptional(answer.shown);
  const linkRow = !quotes || !!brain.booking_link;
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
  const HoursRow = part("BtHoursRow");
  const ZoneRow = part("BtZoneRow");
  const AddressRow = part("BtAddressRow");
  const WebsiteRow = part("BtWebsiteRow");
  const BookingLinkRow = part("BtBookingLinkRow");
  const RulesRow = part("BtRulesRow");
  const find = check.find;
  return (
    <div className="fr-check" data-testid="fr-check">
      <section className="rec-card fr-check-group" aria-label={W.groups.facts}>
        <HoursRow
          brain={brain}
          prompt={settings.prompt || null}
          canEdit={canEdit}
          flash={flash}
          saver={saver}
          note={note}
        />
        <ZoneRow brain={brain} canEdit={canEdit} flash={flash} />
        <AddressRow {...rows} />
        <WebsiteRow {...rows} />
      </section>
      <section className="rec-card fr-check-group" aria-label={W.groups.buys}>
        {choice ? (
          <div className="fr-check-buys">
            {choice({
              id: "fr-sells-by",
              vm: answer.vm,
              value: soon || answer.shown,
              set: (next) => {
                setSoon(next);
                const refused = (f: unknown) => {
                  if (f && typeof f === "object" && Reflect.get(f, "tone") === "danger") setSoon(null);
                  flash(f as LegacyFlash);
                };
                settled({
                  next,
                  send: () => {
                    if (!sendAnswer(next, refused, () => setSoon(null))) setSoon(null);
                  },
                });
              },
              readOnly: !canEdit || !door || door.pending(),
              label: true,
              testid: "fr-sells-by",
            })}
            {!linkRow ? (
              <p className="fr-note" data-testid="fr-check-quotes">
                {bookingLinkRowWords(answer.shown).hint}
              </p>
            ) : null}
          </div>
        ) : null}
        {linkRow ? (
          <BookingLinkRow
            {...rows}
            other={
              offered
                ? { value: offered, sentence: W.bookingPage.found(offered), use: offered, useLabel: W.bookingPage.use }
                : null
            }
          />
        ) : null}
        <RulesRow {...rows} config={settings.config} />
      </section>
      {offerCard({ W, brain, rows, canEdit, flash, saver, chips })}
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
