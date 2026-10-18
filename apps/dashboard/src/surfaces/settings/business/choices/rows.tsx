// Chanlytics — Settings: two of an owner's questions, asked once each (the Settings wiring review, 18 Oct 2026).
//
// When someone wants to book (Hours & booking's Booking card) and when someone asks a price (Autonomy's Limits) were two
// and three controls on two pages: the booking requests switch in the booking tool's fold and the Book · reschedule row
// of the matrix; the price rule among the rules it keeps and the Service & pricing row of the matrix. Each is one row
// now, its value a menu of the three answers, each saying what it does, as a phone's matrix row is (autonomy/matrix.tsx
// PolPhoneRows). A pick goes at once, as a mode's dot does.
//
// Every word, the reading of the stored fields and the writes that move them are contracts' (business-tab/choices.ts);
// the facts are read here as the ability card reads them (can.tsx: BUSINESS_TAB's offersBookingLink, bookingHeld and
// takesBookingRequests over the settings read and the policies it carries), so the row and What it can do never say two
// things. A policy's write reads the settings again (refresh-map PUT policies), which draws the page again.

import { useState, type ReactNode } from "react";
import {
  BOOKING_CHOICES,
  BOOKING_CHOICE_WORDS,
  PRICE_CHOICES,
  PRICE_CHOICE_WORDS,
  bookingChoiceNeeds,
  bookingChoiceOf,
  bookingChoiceWrites,
  heldDraftsByClass,
  heldDraftsLine,
  policyAskClass,
  priceChoiceOf,
  priceChoiceWrites,
  type BusinessProfile,
  type ChoiceWrite,
} from "@chanlytics/contracts";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { MoreMenu } from "../../../kit/more-menu/more-menu";
import { RecordRow } from "../../../kit/record/row";
import { gate, showTip, type LegacyFlash } from "../../../legacy-verbs";
import { btoStoredZone } from "../open";
import type { Brain, Config } from "../save";
import { businessTabSave } from "../saver";
import { policiesNow } from "../shell";
import { choiceRun } from "./run";

type Flash = (flash: LegacyFlash) => void;
/** One answer in the menu, as the kit's menu takes it. */
type MenuItem = NonNullable<Parameters<typeof MoreMenu>[0]["items"]>[number];

/** The held drafts the policies read carries, as contracts counts them by class. */
type HeldRows = Parameters<typeof heldDraftsByClass>[0];

/** The policies the settings read carries, as the runtime reads them (class to mode), or null while none is read. */
function policyMap(): { map: Record<string, { mode: string }>; held: HeldRows } | null {
  const p = policiesNow() as { rows?: { class?: string; mode?: string }[]; held?: HeldRows } | null | undefined;
  if (!p || !Array.isArray(p.rows)) return null;
  const map: Record<string, { mode: string }> = {};
  for (const r of p.rows) if (r && r.class && r.mode) map[r.class] = { mode: r.mode };
  return { map, held: Array.isArray(p.held) ? p.held : [] };
}

/** An answer that cannot be chosen yet: said where it is pressed, as a held tick says it (notifications/grid.tsx). */
const notYet = (why: string) => ({
  "aria-disabled": true,
  "data-tip": why,
  onClick: (e: { currentTarget: Element }) => showTip(e.currentTarget),
});

interface ChoiceRowProps<C extends string> {
  id: string;
  label: string;
  choices: readonly C[];
  current: C;
  words: Record<C, { label: string; says: string }>;
  needs: (c: C) => string | null;
  /** The held drafts' line under the row, where the row's class holds a draft (decision 0063). */
  hint: string | null;
  canEdit: boolean;
  /** The role's gate for the change. */
  gateWords: string;
  pick: (c: C) => Promise<void>;
}

/**
 * One question as a row: its answer as the value, and its answers in a menu, each saying what it does. Shared with
 * Details' word for a booking (offer.tsx BtWordRow), the third question asked this way.
 */
export function ChoiceRow<C extends string>(p: ChoiceRowProps<C>) {
  const [busy, setBusy] = useState(false);
  const g = gate("settings", p.gateWords);
  const gated = busy ? "Saving — wait for this one to land." : g["aria-disabled"] ? String(g["data-tip"]) : null;
  const items: MenuItem[] = [
    { header: p.label },
    ...p.choices.map((c) => {
      const why = c === p.current ? null : p.needs(c);
      return {
        label: p.words[c].label,
        meta: why ?? p.words[c].says,
        metaBelow: true,
        checked: c === p.current,
        onClick: () => {
          if (c === p.current) return;
          setBusy(true);
          void p.pick(c).finally(() => setBusy(false));
        },
        ...(why ? { gate: notYet(why) } : {}),
      };
    }),
  ];
  const value: ReactNode = p.canEdit ? (
    <MoreMenu
      items={items}
      label={p.words[p.current].label}
      title={`${p.label}: ${p.words[p.current].label}`}
      btnClass="bt-link"
      align="right"
      escape
      gated={gated}
      testid={`${p.id}-menu`}
    />
  ) : (
    p.words[p.current].label
  );
  return <RecordRow id={p.id} label={p.label} hint={p.hint} value={value} />;
}

/** The writes a pick makes, then the one toast that says what is so now; a refusal is said by the write refused. */
async function chosen(row: string, writes: ChoiceWrite[], saved: string, flash: Flash) {
  if (await choiceRun.run(row, writes, flash)) flash({ msg: saved });
}

/** When someone wants to book: they book with the link, it offers times and you confirm, or you reply to each one. */
export function BtBookingChoiceRow({
  brain,
  config,
  canEdit,
  flash,
}: {
  brain: Brain;
  config: Config | null;
  canEdit: boolean;
  flash: Flash;
}) {
  const read = policyMap();
  if (!read) return null;
  const switchOn = config?.features?.booking_requests === true;
  const held = BUSINESS_TAB.bookingHeld(read.map);
  const linkInChat = BUSINESS_TAB.offersBookingLink(brain);
  const takes = BUSINESS_TAB.takesBookingRequests({ switchOn, linkInChat, bookingHeld: held });
  const calendar = !!config?.calendar?.ical_url;
  const facts = { switchOn, held, linkInChat, takes, calendar };
  return (
    <ChoiceRow
      id="booking_choice"
      label={BOOKING_CHOICE_WORDS.label}
      choices={BOOKING_CHOICES}
      current={bookingChoiceOf(facts)}
      words={BOOKING_CHOICE_WORDS.options}
      needs={(c) => bookingChoiceNeeds(c, facts)}
      hint={heldDraftsLine(heldDraftsByClass(read.held).booking)}
      canEdit={canEdit}
      gateWords="change what happens when someone wants to book"
      pick={(to) => chosen("booking_choice", bookingChoiceWrites(to, facts), BOOKING_CHOICE_WORDS.saved(to), flash)}
    />
  );
}

/** When someone asks a price: the prices you wrote, never a price, or every such question handed to you. */
export function BtPriceChoiceRow({ canEdit, flash }: { canEdit: boolean; flash: Flash }) {
  const read = policyMap();
  // The rules the next save goes on, as the rules fold judges by: Autonomy's Limits and the first run's Check draw it.
  const base = businessTabSave.saver.base();
  if (!read || !base) return null;
  const brain = base.brain;
  const facts = {
    neverQuote: BUSINESS_TAB.guardrailsInForce(brain?.profile?.guardrails).never_quote_prices,
    // Layer two's own question: a pricing question held for a person under the Service & pricing row.
    handed: policyAskClass(read.map, "pricing") === "faq",
  };
  const current = priceChoiceOf(facts);
  // Saying the prices you wrote, the row says which they are (decision 0051): read off what is written as the composer
  // reads it, in the zone the prompt is composed with and at this moment, so an ended note's price is not listed.
  // Otherwise the held drafts' line, where a question waits for a person.
  const hint =
    current === "written"
      ? BUSINESS_TAB.pricesWrittenWords(
          BUSINESS_TAB.allowedPrices(
            {
              business_name: brain?.business_name ?? "",
              // As the rules row reads the stored profile (answers.tsx btaComposes): the composer's own shape.
              profile: {
                ...((brain?.profile || {}) as BusinessProfile),
                guardrails: { ...(brain?.profile?.guardrails || {}), never_quote_prices: false },
              },
            },
            btoStoredZone(),
            new Date(),
          ),
        )
      : heldDraftsLine(heldDraftsByClass(read.held).faq);
  return (
    <ChoiceRow
      id="price_choice"
      label={PRICE_CHOICE_WORDS.label}
      choices={PRICE_CHOICES}
      current={current}
      words={PRICE_CHOICE_WORDS.options}
      needs={() => null}
      hint={hint}
      canEdit={canEdit}
      gateWords="change what it says when someone asks a price"
      pick={(to) => chosen("price_choice", priceChoiceWrites(to, facts), PRICE_CHOICE_WORDS.saved(to), flash)}
    />
  );
}
