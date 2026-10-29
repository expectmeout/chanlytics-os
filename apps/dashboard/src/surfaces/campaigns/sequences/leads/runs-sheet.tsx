/**
 * How it runs (the lead-to-sequence canvas's board B: one sheet, saved as you change it): who joins (unconfirmed addresses
 * too, with how many that holds now; new ready leads from the search they came from, on their own) and how it sends
 * (where from, and the mailboxes ticked under it, decision 0077; the most a day; every batch of first emails waiting for
 * an OK, and the follow-ups' own mode, decision 0064; the name it signs with and what its emails end with; the footer
 * every email carries). Each change is the chain's own save (use-chain.ts), the auto-add switch at once, and the mode
 * the campaign's own verb (playbook_change), with its receipt and undo.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  LEAD_BUILD_WORDS,
  REACH_OUT_DRAFTS_PER_DAY,
  REACH_OUT_LANGUAGE,
  addressOf,
  chainPaceOf,
  emailFoot,
  evidenceWords,
  leadEndingOf,
  leadMailboxesTicked,
  leadMailboxRowsOf,
  leadPaceChoicesOf,
  leadSendingFactsOf,
  SEQUENCE_MODE_WORDS,
  sequenceModesFor,
  whyFrom,
  type SequenceRecordDto,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Picker } from "../../../kit/picker/picker";
import { Sheet } from "../../../kit/sheet/sheet";
import { Switch } from "../../../kit/switch/switch";
import { focusAsDrawn, gate, navigate, routeDoor, type LegacyFlash } from "../../../legacy-verbs";
import { pressed } from "../verbs";
import { cmChevron } from "../../parts/picks";
import { reachOuts } from "../../reach-out/surface";
import { brainOf } from "../../templates/words";
import { surfaceValue } from "../../../surface-values";
import type { LeadChain } from "./use-chain";

const R = LEAD_BUILD_WORDS.runs;

/** One row of the sheet: what it is (and the line under), and its control or value at its end. */
function RunsRow(p: { k: string; sub?: ReactNode; end: ReactNode; testid: string; className?: string }) {
  return (
    <div className={p.className ? `ld-runs-row ${p.className}` : "ld-runs-row"} data-testid={p.testid}>
      <span className="ld-runs-k">
        <span>{p.k}</span>
        {p.sub ? <span className="ld-runs-sub">{p.sub}</span> : null}
      </span>
      <span className="ld-runs-end">{p.end}</span>
    </div>
  );
}

/** How many of the list's leads an unconfirmed address holds now: the list's reach, read as the sheet opens. */
function useHeldNow(listId: string | null): number | null {
  const [reach, setReach] = useState(() => (listId ? reachOuts.reachHeld(listId) : null));
  useEffect(() => {
    if (!listId) return undefined;
    let live = true;
    void reachOuts.reach(listId).then((r) => {
      if (live && r) setReach(r);
    });
    return () => {
      live = false;
    };
  }, [listId]);
  return reach ? Math.max(0, reach.with_unconfirmed - reach.ready) : null;
}

/** The search new ready leads join from: the one it adds from now, else the finder search most of its leads came from. */
function autoAddSourceOf(rec: SequenceRecordDto): { id: string; name: string } | null {
  const first = rec.sequence.first;
  if (first?.source_search_id) return { id: first.source_search_id, name: first.source_name ?? "" };
  return first?.source_could ?? null;
}

/** The footer's lines as the send writes them, or none while the business's name or address is missing. */
function footLines(): string | null {
  const brain = brainOf(surfaceValue("settings")?.settings);
  try {
    return emailFoot(
      brain.business_name ?? "",
      typeof brain.profile?.address === "string" ? brain.profile.address : null,
      { kind: "cold", why: whyFrom("local_businesses"), unsubscribeUrl: null },
      REACH_OUT_LANGUAGE,
    );
  } catch {
    return null;
  }
}

/** The footer every email carries, as a business reads it; or why there is none yet. */
function FooterLines() {
  const lines = footLines();
  return lines ? (
    <p className="ld-runs-foot" data-testid="ld-runs-footer-lines">
      {lines}
    </p>
  ) : (
    <p className="ld-runs-foot is-warn" data-testid="ld-runs-footer-lines">
      {R.noAddress} <LinkButton {...routeDoor(addressOf({ kind: "facts" }))}>{LEAD_BUILD_WORDS.add}</LinkButton>
    </p>
  );
}

/** Who joins: unconfirmed addresses too (with how many that holds now), and new ready leads from its search. */
function WhoJoins({ rec, lc }: { rec: SequenceRecordDto; lc: LeadChain }) {
  const d = lc.draft;
  const first = rec.sequence.first;
  const held = useHeldNow(first?.search_id ?? null);
  const source = autoAddSourceOf(rec);
  return (
    <section className="ld-runs-sec">
      <p className="ld-runs-h">{R.who}</p>
      <div className="ld-runs-box">
        <RunsRow
          k={R.unconfirmed}
          sub={held !== null && held > 0 ? R.heldNow(held) : null}
          testid="ld-runs-unconfirmed"
          end={
            <Switch
              checked={d.include_unconfirmed}
              onCheckedChange={(on) => lc.edit((x) => ({ ...x, include_unconfirmed: on }))}
              label={R.unconfirmed}
              data-testid="ld-runs-unconfirmed-switch"
            />
          }
        />
        <RunsRow
          k={R.autoAdd}
          sub={source ? source.name : R.noSearch}
          testid="ld-runs-auto-add"
          end={
            <Switch
              checked={!!first?.source_search_id}
              onCheckedChange={(on) => lc.setSource(on && source ? source.id : null)}
              readOnly={!source}
              label={R.autoAdd}
              data-testid="ld-runs-auto-add-switch"
            />
          }
        />
      </div>
    </section>
  );
}

/**
 * Before each batch (decisions 0064 and 0077, D11): every batch of first emails waits for an OK, said as the fact it is;
 * the follow-ups take the sequence's own mode, held for a stop or asked for, never sent on its own to leads, changed by
 * the campaign's own verb (playbook_change) with its receipt and undo; a batch of new words asks first.
 */
function BeforeEachBatch({ rec, flash, moved }: { rec: SequenceRecordDto } & Pick<RunsSheetProps, "flash" | "moved">) {
  return (
    <>
      <RunsRow k={R.firstEmails} end={null} testid="ld-runs-first-emails" />
      <RunsRow
        k={R.followUps}
        // What its batches did, then the rule over any mode (decision 0064): the mode is set on what happened.
        sub={[evidenceWords(rec.evidence), R.newWordsAsk].filter(Boolean).join(". ")}
        testid="ld-runs-approves"
        end={
          <Picker
            label={R.followUps}
            value={rec.sequence.mode ?? "ask"}
            onValueChange={(mode) =>
              void pressed(
                "playbook_change",
                // The sequence's mode under the one key the change door reads it from (contracts playbookChangeSpec).
                { playbook_id: rec.sequence.id, name: rec.sequence.name, sequence_mode: mode },
                flash,
                moved,
              )
            }
            groups={[
              {
                options: sequenceModesFor("leads").map((m) => ({
                  value: m,
                  label: m === "veto" || m === "ask" ? R.followUpModes[m] : SEQUENCE_MODE_WORDS[m].choice,
                })),
              },
            ]}
            chevron={cmChevron()}
            inline
            data-testid="ld-runs-approves-pick"
          />
        }
      />
    </>
  );
}

/**
 * The mailboxes it writes from, under Sends from (0077, D4): a tick each, with its day, why it does not send now, the
 * DNS records it is missing (Set up DNS opens Settings › Connections) and New for one connected since; the last tick
 * stays, since naming none means every mailbox.
 */
function MailboxRows({ lc }: { lc: LeadChain }) {
  const d = lc.draft;
  if (d.owner_sends) return null;
  return leadMailboxRowsOf(lc.chain, d.mailbox_ids).map((r) => (
    <RunsRow
      key={r.id}
      k={r.address}
      sub={
        <>
          {r.sub}
          {r.dnsMissing ? (
            <>
              {" · "}
              <LinkButton
                onClick={() => navigate(addressOf({ kind: "channel" }))}
                {...gate("approve")}
                data-testid={`ld-runs-mailbox-${r.id}-dns`}
              >
                {R.setUpDns}
              </LinkButton>
            </>
          ) : null}
        </>
      }
      className="is-mailbox"
      testid={`ld-runs-mailbox-${r.id}`}
      end={
        <Switch
          checked={r.on}
          readOnly={r.locked}
          onCheckedChange={(on) =>
            lc.edit((x) => ({ ...x, mailbox_ids: leadMailboxesTicked(lc.chain, x.mailbox_ids, r.id, on) }))
          }
          label={r.address}
          data-testid={`ld-runs-mailbox-${r.id}-switch`}
        />
      }
    />
  ));
}

/** Ends with (0077, D10): the name it signs with, or the first ticked mailbox's signature where it has one. */
function EndsWith({ lc }: { lc: LeadChain }) {
  const ends = leadEndingOf(lc.chain, lc.draft);
  return (
    <>
      <RunsRow
        k={R.endsWith}
        testid="ld-runs-ends"
        end={
          ends.options.length > 1 ? (
            <Picker
              label={R.endsWith}
              value={ends.value}
              onValueChange={(v) => lc.edit((x) => ({ ...x, signs_with: v === "mailbox" ? "mailbox" : "name" }))}
              groups={[{ options: ends.options }]}
              chevron={cmChevron()}
              inline
              data-testid="ld-runs-ends-pick"
            />
          ) : (
            <span>{ends.options[0]?.label}</span>
          )
        }
      />
      {ends.note ? (
        <p className="ld-note ld-runs-note" data-testid="ld-runs-ends-note">
          {ends.note}
        </p>
      ) : null}
    </>
  );
}

/**
 * The most a day: the owner's pile when they send, else the pace the ticked mailboxes that send now keep, the saved
 * spacing always one of the choices (contracts leadPaceChoicesOf).
 */
function ADay({ lc }: { lc: LeadChain }) {
  const d = lc.draft;
  const mailboxes = leadSendingFactsOf(lc.chain, d.mailbox_ids);
  const paces = leadPaceChoicesOf(mailboxes, d.gap_minutes);
  const share = chainPaceOf({ mailboxes, owner_sends: d.owner_sends, gap_minutes: d.gap_minutes }).share;
  const fixed = d.owner_sends || paces.length === 0;
  // Saved to send from the mailboxes, with none sending: nothing goes, never "you send each".
  const sub = d.owner_sends
    ? R.youPace
    : paces.length === 0
      ? R.noneDay
      : (paces.find((p) => p.gap === d.gap_minutes)?.hint ?? null);
  return (
    <RunsRow
      k={R.aDay}
      sub={sub}
      testid="ld-runs-day"
      end={
        fixed ? (
          <b className="tabular">{d.owner_sends ? REACH_OUT_DRAFTS_PER_DAY : share}</b>
        ) : (
          <Picker
            label={R.aDay}
            value={String(paces.find((p) => p.gap === d.gap_minutes)?.gap ?? paces.at(0)?.gap ?? "")}
            onValueChange={(v) => lc.edit((x) => ({ ...x, gap_minutes: Number(v) }))}
            groups={[{ options: paces.map((p) => ({ value: String(p.gap), label: String(p.share), sub: p.hint })) }]}
            chevron={cmChevron()}
            inline
            data-testid="ld-runs-day-pick"
          />
        )
      }
    />
  );
}

interface RunsSheetProps {
  open: boolean;
  rec: SequenceRecordDto;
  lc: LeadChain;
  flash: (flash: LegacyFlash) => void;
  moved: () => void;
  onClose: () => void;
}

export function LeadRunsSheet({ open, rec, lc, flash, moved, onClose }: RunsSheetProps) {
  const d = lc.draft;
  const [footer, setFooter] = useState(false);
  const [signing, setSigning] = useState(false);
  // Every mailbox on offer, and the ones the draft writes from that send now (0077): a tick changes the second at once.
  const offered = lc.chain.mailbox_choices?.length ?? lc.chain.mailboxes.length;
  const sending = leadSendingFactsOf(lc.chain, d.mailbox_ids).length;
  const close = () => {
    void lc.flush();
    onClose();
  };
  // The picker says what is saved: the mailboxes are offered while one sends, and kept in sight while they are chosen
  // with none sending (the note under it says nothing goes), never shown as the inbox they are not.
  const sendsFrom = [
    { value: "inbox", label: R.inbox },
    ...(offered > 0 || !d.owner_sends ? [{ value: "mailboxes", label: R.mailboxes(offered) }] : []),
  ];
  const fromNote =
    !d.owner_sends && sending === 0 ? R.noneSends : d.owner_sends && offered > 0 ? R.canSwitch(offered) : null;
  return (
    <Sheet
      open={open}
      onClose={close}
      title={R.title}
      sub={lc.saving === "saving" ? LEAD_BUILD_WORDS.saving : R.sub}
      close={{ label: LEAD_BUILD_WORDS.done, glyph: <Icon name="x" size={13} /> }}
      backCloses
      testid="ld-runs"
      foot={
        <div className="ld-foot">
          <span className="ld-foot-said" />
          <Button variant="primary" onClick={close} data-testid="ld-runs-done">
            {LEAD_BUILD_WORDS.done}
          </Button>
        </div>
      }
    >
      <WhoJoins rec={rec} lc={lc} />
      <section className="ld-runs-sec">
        <p className="ld-runs-h">{R.sending}</p>
        <div className="ld-runs-box">
          <RunsRow
            k={R.sendsFrom}
            sub={
              !d.owner_sends && d.mailbox_ids.length === 0 && (lc.chain.mailbox_choices?.length ?? 0) > 0 ? (
                <span data-testid="ld-runs-every-mailbox">{R.everyMailbox}</span>
              ) : null
            }
            testid="ld-runs-from"
            end={
              <Picker
                label={R.sendsFrom}
                value={d.owner_sends ? "inbox" : "mailboxes"}
                onValueChange={(v) => lc.edit((x) => ({ ...x, owner_sends: v === "inbox" }))}
                groups={[{ options: sendsFrom }]}
                chevron={cmChevron()}
                inline
                data-testid="ld-runs-from-pick"
              />
            }
          />
          {fromNote ? (
            <p className="ld-note" data-testid="ld-runs-from-note">
              {fromNote}
            </p>
          ) : null}
          <MailboxRows lc={lc} />
          <ADay lc={lc} />
          <BeforeEachBatch rec={rec} flash={flash} moved={moved} />
          <RunsRow
            k={R.signed}
            testid="ld-runs-signed"
            end={
              <LinkButton
                aria-expanded={signing}
                onClick={() => setSigning((on) => !on)}
                data-testid="ld-runs-signed-open"
              >
                {d.signed_by.trim() || R.signedNone}
              </LinkButton>
            }
          />
          {signing ? (
            <div className="ld-runs-edit">
              <Field
                label={R.signed}
                value={d.signed_by}
                maxLength={60}
                // eslint-disable-next-line jsx-a11y-x/no-autofocus -- Change opened it to type the name
                autoFocus={focusAsDrawn()}
                onValueChange={(v) => lc.edit((x) => ({ ...x, signed_by: v }))}
                data-testid="ld-runs-signed-field"
              />
            </div>
          ) : null}
          <EndsWith lc={lc} />
          <RunsRow
            k={R.footer}
            testid="ld-runs-footer"
            end={
              <LinkButton
                aria-expanded={footer}
                onClick={() => setFooter((on) => !on)}
                data-testid="ld-runs-footer-open"
              >
                {R.footerValue}
              </LinkButton>
            }
          />
          {footer ? <FooterLines /> : null}
        </div>
      </section>
      {offered === 0 ? (
        <p className="ld-note">
          <LinkButton onClick={() => navigate(addressOf({ kind: "channel" }))} {...gate("approve")}>
            {R.connect}
          </LinkButton>
        </p>
      ) : null}
    </Sheet>
  );
}
