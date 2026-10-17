// Chanlytics — Settings › How it answers: its two cards, and the two rows Autonomy's Limits draws.
//
// How it answers was one card of eight rows that held the receptionist's limits too (Ruben, 17 Oct 2026, the "Settings,
// split" canvas). Its rows are answers.tsx's folds, composed here: How it talks and What it knows on How it answers, and
// the rules it always keeps and how it hands you a customer on Autonomy (tab.tsx BusinessLimitRows). Hookless: each
// fold holds its own.

import type { ReactNode } from "react";
import {
  BtLanguagesRow,
  BtRulesRow,
  btaFacts,
  fallbacksFold,
  handoffFold,
  notesFold,
  ownWordsFold,
  toneFold,
  type Shared,
} from "./answers";
import { greetingFold } from "./phone/greeting";
import type { Brain, Config } from "./save";

type CardProps = Shared & { brain: Brain; base?: Config | null; config?: Config | null };

/** A card of How it answers: its title and line over its rows (`id` names its test id and its title's). */
const btaCard = (id: string, title: string, sub: string, rows: ReactNode) => (
  <section className="rec-card" data-testid={`rec-card-${id}`} aria-labelledby={`bt-${id}-title`}>
    <div className="rec-card-head">
      <h2 className="rec-card-title" id={`bt-${id}-title`}>
        {title}
      </h2>
      <span className="rec-card-sub">{sub}</span>
    </div>
    {rows}
  </section>
);

/**
 * How it talks: its voice, what callers hear first where the workspace answers calls (decision 0051), and the
 * languages. The first card of How it answers (Ruben, 17 Oct 2026, the "Settings, split" canvas), which was one card of
 * eight rows that held its limits too. What a fold opens with and saves onto is the saver's base (BtFold asks for it).
 */
export const BtTalksCard = ({ brain, base = null, config = null, canEdit, flash, saver }: CardProps) => {
  const shared = { canEdit, flash, saver };
  const a = btaFacts(brain, base, config);
  return btaCard(
    "answers",
    "How it talks",
    "Its voice, and the words it opens with",
    <>
      {toneFold(shared, a.tone)}
      {a.calls ? greetingFold(shared, brain) : null}
      <BtLanguagesRow brain={brain} {...shared} />
    </>,
  );
};

/** What it knows beyond Details: the things it should know, your own words, and the messages when it cannot answer. */
export const BtKnowsCard = ({ brain, base = null, config = null, canEdit, flash, saver }: CardProps) => {
  const shared = { canEdit, flash, saver };
  const a = btaFacts(brain, base, config);
  return btaCard(
    "knows",
    "What it knows",
    "Beyond the facts on Details",
    <>
      {notesFold(shared, a.notes)}
      {ownWordsFold(shared, a.ownOpening)}
      {fallbacksFold(shared, a)}
    </>,
  );
};

/**
 * The rules it always keeps and how it hands you a customer: limits, on Autonomy's Limits card (tab.tsx
 * BusinessLimitRows), since a rule about prices lived on two tabs. `base` is what the rules fold judges by.
 */
export const BtLimitRows = ({ brain, base = null, config = null, canEdit, flash, saver }: CardProps) => {
  const shared = { canEdit, flash, saver };
  return (
    <>
      <BtRulesRow brain={brain} base={base} config={config} {...shared} />
      {handoffFold(shared, btaFacts(brain, base, config))}
    </>
  );
};
