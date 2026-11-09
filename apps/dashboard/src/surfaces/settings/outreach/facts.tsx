/**
 * Cold email: Facts your emails can use, the only claims Ask may make about the business, word for word, one an email.
 * At rest each is a row with how many emails carried it (the read's count of the steps whose words hold it); each row's
 * Change opens the one fold of the list, and Add a fact opens it on a box to type in. An empty box is no fact: the save
 * drops it. The fold's id stays `proof`, as Ask's cards and old addresses name it.
 */
import { useState } from "react";
import { REACH_OUT_LIMITS, REACH_OUT_SETTINGS_WORDS, textOrEmpty } from "@chanlytics/contracts";
import { gate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { RecordBox } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { BtFold } from "../business/gestures/fold";
import { roomSaid, type BoxFields } from "./box";
import { OutreachCard, type OutreachShared } from "./card";

const FACT_WORDS = REACH_OUT_SETTINGS_WORDS.facts;

/** The facts as the fold edits them: one box a fact, a remove beside each, and an add while there is room. */
const FactRows = ({ f }: { f: BoxFields }) => {
  const facts = Array.isArray(f.draft) ? f.draft.map(textOrEmpty) : [];
  const put = (next: string[], keys: string[]) => f.update(() => next, keys);
  // The one empty box a list with nothing in it opens on has nothing to take away.
  const alone = facts.length === 1 && !facts[0]?.trim();
  return (
    <div className="ro-claims" data-testid="rec-proof-rows">
      {facts.map((fact, index) => {
        const room = roomSaid(fact.length, REACH_OUT_LIMITS.claim);
        return (
          <div className="ro-claim" key={index} data-testid={`rec-claim-${index}`}>
            <RecordBox
              id={`ro-claim-${index}`}
              label={FACT_WORDS.fact(index + 1)}
              rows={2}
              className="rec-input-grows"
              value={fact}
              placeholder={FACT_WORDS.placeholder}
              onChange={(v) =>
                put(
                  facts.map((c, j) => (j === index ? v : c)),
                  [`claim-${index}`],
                )
              }
              problem={f.problems[`claim-${index}`] || null}
              readOnly={f.readOnly}
            />
            {alone ? null : (
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                aria-label={FACT_WORDS.remove(index + 1)}
                {...f.press(() =>
                  put(
                    facts.filter((_, j) => j !== index),
                    ["proof"],
                  ),
                )}
                data-testid={`rec-claim-remove-${index}`}
              >
                <Icon name="x" size={12} />
              </Button>
            )}
            {room ? <span className="rec-hint">{room}</span> : null}
          </div>
        );
      })}
      {facts.length < REACH_OUT_LIMITS.claims ? (
        <Button size="sm" {...f.press(() => put([...facts, ""], ["proof"]))} data-testid="rec-proof-add">
          <Icon name="plus" size={12} /> {FACT_WORDS.add}
        </Button>
      ) : null}
      <FieldError id="ro-proof-problem" message={f.problems.proof || null} testid="rec-proof-problem" />
      <p className="bt-fold-note" data-testid="rec-proof-rule">
        {FACT_WORDS.foot} {FACT_WORDS.reach}
      </p>
    </div>
  );
};

export function FactsCard(shared: OutreachShared) {
  const facts = (shared.config.reach_out?.proof ?? []).map(textOrEmpty).filter((c) => c.trim());
  const sends = (text: string) => shared.read?.claims.find((c) => c.text === text)?.sends ?? 0;
  const [adding, setAdding] = useState(false);
  return (
    <OutreachCard id="facts" title={FACT_WORDS.title}>
      <BtFold<unknown>
        canEdit={shared.canEdit}
        flash={shared.flash}
        saver={shared.saver}
        id="proof"
        label={FACT_WORDS.title}
        channel={null}
        gate={gate("settings", "change the facts your emails can use")}
        opensOn={adding || !facts.length ? [...facts, ""] : null}
        rest={({ request, can }) => (
          <>
            {facts.map((fact, index) => (
              <RecordRow
                key={index}
                id={index === 0 ? "proof" : `proof-${index}`}
                label={fact}
                stacked
                value={<span data-testid={`rec-row-proof-${index}-meta`}>{FACT_WORDS.count(sends(fact))}</span>}
                act={
                  shared.canEdit && can
                    ? {
                        label: "Change",
                        icon: "pencil",
                        onClick: () => {
                          setAdding(false);
                          request();
                        },
                      }
                    : null
                }
              />
            ))}
            {shared.canEdit && can && facts.length < REACH_OUT_LIMITS.claims ? (
              <RecordRow
                id={facts.length ? "proof-add" : "proof"}
                label={FACT_WORDS.add}
                act={{
                  label: FACT_WORDS.add,
                  icon: "plus",
                  onClick: () => {
                    setAdding(true);
                    request();
                  },
                }}
              />
            ) : null}
            <p className="bt-fold-note" data-testid="rec-proof-foot">
              {FACT_WORDS.foot}
            </p>
          </>
        )}
        body={(f) => <FactRows f={f} />}
      />
    </OutreachCard>
  );
}
