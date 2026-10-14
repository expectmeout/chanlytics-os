/**
 * They wrote back…, asked: the five words an owner says a business's answer in (contracts OWNER_SAID_INTENTS), on a
 * lead's peek and on a To send row that answers an email before it (00428). Read through the one door a reply's reading
 * takes (reach_out_reply_said), by whichever page asks.
 */
import { useState } from "react";
import type { OwnerSaidIntent } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { reachOuts } from "./surface";

/** What more an owner may say with a not now (the day to write again) or a wrong person (who instead). */
export type SaidMore = { day?: string; refer_to?: string };

/**
 * What did they say?: the five words an owner says a business's answer in (OWNER_SAID_INTENTS). A not now asks the day
 * to write again and a wrong person who to write to instead, each of which may be left blank (the plan's own day, a step
 * that names nobody).
 */
export const RoSaidAsk = ({
  business,
  busy,
  onSay,
  testid,
}: {
  business: string;
  busy: boolean;
  onSay: (i: OwnerSaidIntent, more: SaidMore) => void;
  /** Where it stands, for its tests: the peek's (peek-reach-out-said) or a To send row's (ro-to-send-said). */
  testid: string;
}) => {
  const SW = reachOuts.words.REACH_OUT_SAID_WORDS;
  const [more, setMore] = useState<"not_now" | "wrong_person" | null>(null);
  const [value, setValue] = useState("");
  if (more) {
    const day = more === "not_now";
    const save = () => onSay(more, day ? { day: value || undefined } : { refer_to: value.trim() || undefined });
    return (
      <div role="group" aria-label={SW.ask(business)} data-testid={`${testid}-more`}>
        <p className="pk-alt-why">{SW.intents[more]}</p>
        <Field
          label={day ? SW.day : SW.referTo}
          type={day ? "date" : "text"}
          value={value}
          onValueChange={setValue}
          maxLength={day ? undefined : 120}
          readOnly={busy}
          data-testid={`${testid}-value`}
        />
        <div className="ro-send-acts">
          <Button size="sm" disabled={busy} onClick={save} data-testid={`${testid}-save`}>
            {busy ? SW.saving : SW.save}
          </Button>
          <Button
            size="sm"
            variant="quiet"
            disabled={busy}
            onClick={() => {
              setMore(null);
              setValue("");
            }}
          >
            {SW.back}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div role="group" aria-label={SW.ask(business)} data-testid={`${testid}-ask`}>
      <p className="pk-alt-why">{SW.ask(business)}</p>
      {/* The answers wrap on a line of their own (campaigns.css .ro-send-acts, the To send row's). */}
      <div className="ro-send-acts">
        {reachOuts.words.OWNER_SAID_INTENTS.map((i) => (
          <Button
            key={i}
            size="sm"
            disabled={busy}
            onClick={() => (i === "not_now" || i === "wrong_person" ? setMore(i) : onSay(i, {}))}
            data-testid={`${testid}-${i}`}
          >
            {SW.intents[i]}
          </Button>
        ))}
      </div>
    </div>
  );
};
