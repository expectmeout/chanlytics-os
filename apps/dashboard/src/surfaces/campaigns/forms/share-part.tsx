/**
 * Where a form is shared, and what each place brought (the Forms canvas, "Share and results"): one list, each place
 * with its own link and its own count, the printed code among them; another place added by saying where; one sentence
 * of numbers; then its requests, a test, and the held pile, each entry saying why it is held.
 *
 * A link is copied, never typed; a place is renamed or its link stopped from the caret on its row. A printed code is
 * the link drawn by the server (`/l/<code>/code`), with its sheet to print (`/l/<code>/sign`).
 */
import { useState } from "react";
import {
  agoWords,
  requestAddress,
  type FormEntryRowDto,
  type FormLinkDto,
  type FormSheetDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { useCopied } from "../../kit/copy-button/copy-button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { navigate } from "../../frame-verbs";
import { gate } from "../../shell-doors";
import { SayLine } from "./say-line";
import { doFormEntryPress, doFormLinkPress, workspaceSlugNow } from "./use-forms";
import { FORMS_WORDS as W, entryWords, linkWords, placeBrought, resultsWords } from "./words";

const SHARE_WORDS = W.share;

/** What a press on the Share part does after it: the sheet read again, and a failure said. */
interface ShareIo {
  again: () => Promise<void>;
  fail: (message: string) => void;
  canChange: boolean;
}

/** Copy, saying so in place: the one coral press once a form has just gone live (`first`). */
function CopyLink({ address, first }: { address: string; first: boolean }) {
  const [copied, copy] = useCopied();
  return (
    <Button
      size="sm"
      variant={first ? "primary" : undefined}
      onClick={() => copy(address)}
      data-testid="forms-link-copy"
    >
      <Icon name={copied ? "check" : "copy"} size={12} />
      <span aria-live="polite">{copied ? SHARE_WORDS.copied : SHARE_WORDS.copy}</span>
    </Button>
  );
}

/** A place's own menu, on its caret: rename it, or stop its link, or start it again. */
function PlaceMenu({ link, io, onRename }: { link: FormLinkDto; io: ShareIo; onRename?: () => void }) {
  const press = async (act: "stop" | "start") => {
    const pressed = await doFormLinkPress({ act, link_id: link.id });
    if (!pressed.ok) io.fail(pressed.message);
    await io.again();
  };
  return (
    <Menu
      label={SHARE_WORDS.placeMenu(link.place)}
      align="end"
      trigger={
        <Button
          iconOnly
          variant="quiet"
          size="sm"
          aria-label={SHARE_WORDS.placeMenu(link.place)}
          data-testid="forms-link-more"
        >
          <Icon name="chevron-down" size={13} />
        </Button>
      }
      groups={[
        {
          items: [
            // The printed code keeps its name: it is the one drawn as a code.
            ...(onRename ? [{ label: SHARE_WORDS.rename, onSelect: onRename }] : []),
            link.stopped
              ? { label: SHARE_WORDS.start, onSelect: () => void press("start") }
              : { label: SHARE_WORDS.stop, tone: "danger", onSelect: () => void press("stop") },
          ],
        },
      ]}
    />
  );
}

/** One place: its name, its link in letters, what it brought, and Copy. */
function PlaceRow({ link, origin, first, io }: { link: FormLinkDto; origin: string; first: boolean; io: ShareIo }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const address = `${origin}/l/${link.code}`;
  const save = async () => {
    const place = (renaming ?? "").trim();
    setRenaming(null);
    if (!place || place === link.place) return;
    const pressed = await doFormLinkPress({ act: "rename", link_id: link.id, place });
    if (!pressed.ok) io.fail(pressed.message);
    await io.again();
  };
  if (renaming !== null)
    return (
      <div className="fmv-link" data-chosen="">
        <Field
          label={SHARE_WORDS.renameLabel}
          value={renaming}
          onValueChange={setRenaming}
          maxLength={60}
          data-testid="forms-link-name"
        />
        <Button size="sm" variant="primary" onClick={() => void save()} data-testid="forms-link-name-save">
          {SHARE_WORDS.saveName}
        </Button>
      </div>
    );
  return (
    <div className="fmv-link" data-stopped={link.stopped || undefined} data-testid="forms-link">
      <div>
        <strong>{link.place}</strong>
        <code>{linkWords(origin, link.code)}</code>
        <span>{link.stopped ? SHARE_WORDS.stopped : placeBrought(link)}</span>
      </div>
      {link.stopped ? null : <CopyLink address={address} first={first} />}
      {io.canChange ? <PlaceMenu link={link} io={io} onRename={() => setRenaming(link.place)} /> : null}
    </div>
  );
}

/** The printed code: the link as a code, its sheet to print, and the code itself to save. */
function PrintedRow({ link, io }: { link: FormLinkDto; io: ShareIo }) {
  const code = `/l/${link.code}/code`;
  // A picture that could not be drawn takes no room: the row still says the code and offers its sheet.
  const [undrawn, setUndrawn] = useState(false);
  return (
    <div className="fmv-printed" data-stopped={link.stopped || undefined} data-testid="forms-printed">
      {link.stopped || undrawn ? null : (
        // The server's own drawing of the link (/l/<code>/code): the row beside it says what it is.
        <img src={code} alt="" width={84} height={84} onError={() => setUndrawn(true)} />
      )}
      <div>
        <strong>{SHARE_WORDS.printed}</strong>
        <span>{link.stopped ? SHARE_WORDS.stopped : `${placeBrought(link)} · ${SHARE_WORDS.printedNote}`}</span>
        {link.stopped ? null : (
          <div className="fmv-acts">
            <Button size="sm" href={`/l/${link.code}/sign`} target="_blank" rel="noreferrer" data-testid="forms-print">
              {SHARE_WORDS.print}
            </Button>
            <Button size="sm" href={code} download={`${link.code}.svg`} data-testid="forms-printed-save">
              {SHARE_WORDS.save}
            </Button>
          </div>
        )}
      </div>
      {io.canChange ? <PlaceMenu link={link} io={io} /> : null}
    </div>
  );
}

/** One entry of the sheet: who, when, and where it stands; an open or answered one opens where it is answered. */
function EntryRow({ entry, now, io }: { entry: FormEntryRowDto; now: number; io: ShareIo }) {
  const lineWords = entryWords(entry);
  const held = entry.standing === "held";
  const letThrough = async () => {
    const pressed = await doFormEntryPress({ act: "let_through", entry_id: entry.id });
    if (!pressed.ok) io.fail(pressed.message);
    await io.again();
  };
  const opens = entry.standing === "open" || entry.standing === "answered" || held;
  return (
    <div className="fmv-ent" data-testid="forms-entry" data-standing={entry.standing}>
      <strong>{entry.name ?? SHARE_WORDS.noName}</strong>
      <time>{agoWords(Date.parse(entry.created_at), now)}</time>
      <span data-waits={lineWords.waits || undefined} data-done={lineWords.done || undefined}>
        {lineWords.words}
      </span>
      {held || opens ? (
        <div className="fmv-acts">
          {held ? (
            <Button
              size="sm"
              onClick={() => void letThrough()}
              data-testid="forms-entry-through"
              {...gate("approve", "let a request through")}
            >
              {SHARE_WORDS.letThrough}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="quiet"
            onClick={() => navigate(requestAddress(entry.id))}
            data-testid="forms-entry-open"
          >
            Open
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface SharePartProps {
  sheet: FormSheetDto;
  again: () => Promise<void>;
  fail: (message: string) => void;
  /** The form has just gone live on this visit: Copy is the one coral press. */
  justLive: boolean;
}

/** The Share part. */
export function SharePart({ sheet, again, fail, justLive }: SharePartProps) {
  const [now] = useState(() => Date.now());
  const origin = window.location.origin;
  const io: ShareIo = { again, fail, canChange: sheet.can_change };
  if (sheet.state === "draft")
    return (
      <p className="fmv-note" data-testid="forms-share-draft">
        {SHARE_WORDS.draftNote}
      </p>
    );
  const results = resultsWords(sheet.results);
  const addPlace = async (place: string) => {
    const pressed = await doFormLinkPress({ act: "make", form_id: sheet.id, place });
    if (!pressed.ok) fail(pressed.message);
    await again();
    return pressed.ok;
  };
  const slug = workspaceSlugNow();
  const firstLink = sheet.links.find((link) => !link.printed && !link.stopped)?.id ?? null;
  return (
    <div className="fmv-share" data-testid="forms-share">
      {sheet.state === "off" ? <p className="fmv-state">{SHARE_WORDS.offNote}</p> : null}
      {justLive ? (
        <p className="fmv-state" data-done="">
          {SHARE_WORDS.liveReady}
        </p>
      ) : null}
      <h4>{SHARE_WORDS.where}</h4>
      {sheet.links.map((link) =>
        link.printed ? (
          <PrintedRow key={link.id} link={link} io={io} />
        ) : (
          <PlaceRow key={link.id} link={link} origin={origin} first={justLive && link.id === firstLink} io={io} />
        ),
      )}
      {sheet.can_change && sheet.state === "live" ? (
        <SayLine
          mark={<Icon name="plus" size={14} />}
          placeholder={SHARE_WORDS.whereElse}
          label={SHARE_WORDS.whereLabel}
          send={SHARE_WORDS.add}
          onSay={addPlace}
          maxLength={60}
          testid="forms-place-line"
        />
      ) : null}
      <h4>{SHARE_WORDS.days(sheet.results.days)}</h4>
      {results ? (
        <p className="fmv-nums" data-testid="forms-results">
          {results.line}
          <small>{results.who}</small>
        </p>
      ) : (
        <p className="fmv-nums" data-empty="" data-testid="forms-results-none">
          {SHARE_WORDS.nothing}
          <small>{SHARE_WORDS.nothingBody}</small>
        </p>
      )}
      {sheet.entries.length > 0 ? (
        <>
          <h4>{SHARE_WORDS.requests}</h4>
          {sheet.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} now={now} io={io} />
          ))}
        </>
      ) : null}
      {sheet.held.length > 0 ? (
        <>
          <h4>{SHARE_WORDS.held(sheet.held.length)}</h4>
          {sheet.held.map((entry) => (
            <EntryRow key={entry.id} entry={entry} now={now} io={io} />
          ))}
        </>
      ) : null}
      {sheet.state === "live" && slug ? (
        <div className="fmv-link">
          <div>
            <strong>{SHARE_WORDS.test}</strong>
            <span>{SHARE_WORDS.testBody}</span>
          </div>
          <Button size="sm" href={`/b/${slug}/${sheet.slug}`} target="_blank" rel="noreferrer" data-testid="forms-test">
            <Icon name="eye" size={12} />
            {SHARE_WORDS.testAct}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
