/**
 * Cold email: How your emails end. Four rows said one thing, so it is one row, drawn as it is sent, and one sheet: the
 * name, what goes under it, and the phone, each one key of the config's reach_out section. What the law asks for under
 * them is code's (contracts emailFoot), and the row can no longer claim an address the business has not added: a send
 * with none is held (`no_business_address`), and the row says so first.
 */
import {
  REACH_OUT_LIMITS,
  REACH_OUT_SETTINGS_WORDS,
  WHY_FROM_MAPS,
  emailFoot,
  hasFootAddress,
  reachOutSignatureOf,
  textOrEmpty,
} from "@chanlytics/contracts";
import { gate, navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordField } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import type { EndingDraft } from "../business/fold-shapes";
import { BtFold } from "../business/gestures/fold";
import { settingsRowRoute } from "../frame/tabs";
import { roomSaid, type BoxFields } from "./box";
import { OutreachCard, storedReachOut, type OutreachShared } from "./card";

const ENDING_WORDS = REACH_OUT_SETTINGS_WORDS.ending;

const endingOf = (draft: unknown): EndingDraft => {
  const d = (draft ?? {}) as Partial<EndingDraft>;
  return { signed_by: textOrEmpty(d.signed_by), signature: textOrEmpty(d.signature), phone: textOrEmpty(d.phone) };
};

/** The lines an email ends with, as the send draws them: the name, then the signature's lines and the phone. */
const linesOf = (ending: EndingDraft): string[] =>
  [
    ending.signed_by.trim(),
    ...(reachOutSignatureOf({ reach_out: { signature: ending.signature, phone: ending.phone } }) ?? "").split("\n"),
  ].filter(Boolean);

/** What the law asks for under them, in the words the send uses; null where the business has no address to give. */
const footOf = (shared: OutreachShared): string | null => {
  const foot = shared.read?.foot;
  if (!foot || !hasFootAddress(foot.business, foot.address)) return null;
  return emailFoot(foot.business ?? "", foot.address, { kind: "cold", why: WHY_FROM_MAPS, unsubscribeUrl: null }, null);
};

/** One box of the sheet, with what is known that could go in it, offered while it is empty. */
function EndingBox({
  f,
  field,
  label,
  placeholder,
  max,
  known = null,
  note = null,
  rows = null,
  inputMode,
  autoComplete,
}: {
  f: BoxFields;
  field: keyof EndingDraft;
  label: string;
  placeholder: string;
  max: number;
  known?: string | null;
  note?: string | null;
  rows?: number | null;
  inputMode?: "tel";
  autoComplete?: string;
}) {
  const text = endingOf(f.draft)[field];
  const put = (value: string) => f.update((was) => ({ ...endingOf(was), [field]: value }), [field]);
  return (
    <>
      <RecordField
        id={`ro-${field}`}
        label={label}
        rows={rows}
        grows={!!rows}
        value={text}
        onChange={put}
        problem={f.problems[field] || null}
        hint={roomSaid(text.length, max) ?? note}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        readOnly={f.readOnly || undefined}
        testid={`rec-${field}-box`}
      />
      {known && !text.trim() ? (
        <Button size="sm" className="ro-use" {...f.press(() => put(known))} data-testid={`rec-${field}-use`}>
          <span className="ro-use-words">{REACH_OUT_SETTINGS_WORDS.fillWith(known)}</span>
        </Button>
      ) : null}
    </>
  );
}

/** The ending as it is sent, under the sheet's boxes, so a change is seen as it is typed. */
const EndingPreview = ({ f, foot }: { f: BoxFields; foot: string | null }) => (
  <div className="ro-ending ro-ending-sheet" data-testid="rec-ending-preview">
    {linesOf(endingOf(f.draft)).map((line, n) => (
      <span key={n}>{line}</span>
    ))}
    <small>{foot ?? ENDING_WORDS.noAddress}</small>
  </div>
);

/** How your emails end: one row, as it is sent, and one sheet for all of it. */
export function EndingCard(shared: OutreachShared) {
  const known = shared.read?.known;
  const business = shared.brain.business_name?.trim();
  const named = storedReachOut(shared, "signed_by");
  const fallback = named ? null : shared.read?.sequence?.signed_by?.trim() || null;
  const stored = {
    signed_by: named ?? "",
    signature: storedReachOut(shared, "signature") ?? "",
    phone: storedReachOut(shared, "phone") ?? "",
  };
  const shown = { ...stored, signed_by: named ?? fallback ?? "" };
  const lines = linesOf(shown);
  const foot = footOf(shared);
  // Not said until the read lands: an address not yet read is not an address missing.
  const noAddress = !!shared.read && !foot;
  const editGate = gate("settings", "change how your emails end");
  return (
    <OutreachCard id="ending" title={ENDING_WORDS.title}>
      <BtFold<unknown>
        canEdit={shared.canEdit}
        flash={shared.flash}
        saver={shared.saver}
        id="ending"
        label={ENDING_WORDS.title}
        channel={null}
        gate={editGate}
        opensOn={fallback ? shown : null}
        row={{ value: lines.length ? lines.join() : null }}
        rest={({ request, can }) => (
          <RecordRow
            id="ending"
            stacked
            label={
              lines.length ? (
                <span className="ro-ending" data-testid="rec-ending-lines">
                  {lines.map((line, n) => (
                    <span key={n}>{line}</span>
                  ))}
                </span>
              ) : (
                ENDING_WORDS.none
              )
            }
            value={noAddress ? null : ENDING_WORDS.foot}
            wrong={noAddress ? ENDING_WORDS.noAddress : null}
            act={
              shared.canEdit && can
                ? {
                    label: "Change",
                    name: `Change ${ENDING_WORDS.title.toLowerCase()}`,
                    onClick: () => request(),
                    gate: editGate,
                  }
                : null
            }
          />
        )}
        body={(f) => (
          <>
            <EndingBox
              f={f}
              field="signed_by"
              label={ENDING_WORDS.name}
              placeholder={ENDING_WORDS.placeholders.name}
              max={REACH_OUT_LIMITS.signedBy}
              known={known?.first_name}
              note={fallback && endingOf(f.draft).signed_by === fallback ? ENDING_WORDS.nameFrom : null}
              autoComplete="name"
            />
            <EndingBox
              f={f}
              field="signature"
              label={ENDING_WORDS.under}
              placeholder={ENDING_WORDS.placeholders.under}
              max={REACH_OUT_LIMITS.signature}
              known={known?.name && business ? `${known.name}, ${business}` : known?.name}
              note={ENDING_WORDS.underRule}
              rows={3}
            />
            <EndingBox
              f={f}
              field="phone"
              label={ENDING_WORDS.phone}
              placeholder={ENDING_WORDS.placeholders.phone}
              max={REACH_OUT_LIMITS.phone}
              known={shared.brain.phone_display?.trim()}
              inputMode="tel"
              autoComplete="tel"
            />
            <EndingPreview f={f} foot={foot} />
            <p className="bt-fold-note" data-testid="rec-ending-note">
              {ENDING_WORDS.reach}{" "}
              <LinkButton onClick={() => navigate(settingsRowRoute("address"))} data-testid="rec-ending-address">
                {ENDING_WORDS.address}
              </LinkButton>
            </p>
          </>
        )}
      />
    </OutreachCard>
  );
}
