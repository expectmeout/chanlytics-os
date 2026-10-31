/**
 * Found for you (decision 0073, R10 and R17; canvas 1B·h and 2): what the owner's Business Profile and website say that
 * the record does not hold yet, beside Check's rows: services with their prices and minutes, days closed, the booking
 * rules in their own words, the questions they answer, and the words of itself. Each is kept only on the owner's press
 * (a price with its service: the press is the price confirmed, never assumed), through the Business tab's one saver,
 * into the field it belongs in: a service into the services, a day closed into the closures, a rule into the booking
 * rules' notes, an answer and the words into the things it should know. What is added leaves the list (contracts
 * foundOf reads the config the next save goes on). A read that could not be made is said once.
 */
import type { ReactNode } from "react";
import {
  FOUND_WORDS,
  PROFILE_LIMITS,
  foundOf,
  foundRecordOf,
  foundServicesRoom,
  withFoundClosure,
  withFoundNote,
  withFoundServices,
  type BusinessReadDto,
  type FoundVM,
} from "@chanlytics/contracts";
import { gate, type LegacyFlash } from "../../legacy-verbs";
import { businessTabSave } from "../shell";
import { brainOf } from "./inputs";

const F = FOUND_WORDS;

type Profile = Record<string, unknown>;
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** One change of the profile through the tab's one saver, said in a toast once the server takes it. */
function keepFound(row: string, change: (p: Profile) => Profile, said: string, flash: (f: LegacyFlash) => void): void {
  businessTabSave.saver.save({
    row,
    change: (b, p) => {
      b.profile = change({ ...p });
      return b;
    },
    said,
    flash,
  });
}

/** What a press adds: services (as many as there is room for), a day closed, or a rule or an answer as a note. */
function foundActs(profile: Profile, flash: (f: LegacyFlash) => void) {
  const addServices = (picked: FoundVM["services"]) => {
    const take = foundServicesRoom(profile, picked);
    const [only] = take;
    if (!only) return;
    keepFound(
      "services",
      (p) => withFoundServices(p, take, { prices: true }),
      F.added(take.length === 1 ? only.name : `${take.length} services`),
      flash,
    );
  };
  const addClosed = (c: FoundVM["closed"][number]) =>
    keepFound("closures", (p) => withFoundClosure(p, c), F.added(F.closed(c.date, c.until)), flash);
  const addNote = (n: { title: string; text: string }) =>
    keepFound(
      n.title === F.rulesTitle ? "booking_rules" : "notes",
      (p) => withFoundNote(p, n),
      F.added(n.title === F.rulesTitle ? F.rulesTitle : n.title),
      flash,
    );
  return { addServices, addClosed, addNote };
}

/** One thing found: what it is, what it says and where it came from, and its press. */
function FoundRow(o: {
  title: string;
  says?: string | null;
  from: string;
  label?: string;
  onAdd: () => void;
  disabled: boolean;
  testid?: string;
}): ReactNode {
  return (
    <li className="fr-found-row">
      <span className="fr-found-words">
        <b>{o.title}</b>
        {o.says ? <span className="fr-detail">{o.says}</span> : null}
        <span className="fr-detail">{o.from}</span>
      </span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={o.onAdd}
        disabled={o.disabled}
        data-testid={o.testid}
        {...gate("settings", "add what was found")}
      >
        {o.label ?? F.add}
      </button>
    </li>
  );
}

/** The services found, a press each, and one for them all where there are several. */
function FoundServices(o: { found: FoundVM; acts: ReturnType<typeof foundActs>; room: boolean; canEdit: boolean }) {
  const { found, acts } = o;
  if (!found.services.length) return null;
  return (
    <ul className="fr-found-list" data-testid="fr-found-services">
      {found.services.map((s) => (
        <FoundRow
          key={s.name}
          title={F.service(s.name, s.price_note, s.duration_min)}
          from={s.from}
          onAdd={() => acts.addServices([s])}
          disabled={!o.canEdit || !o.room}
          testid="fr-found-add-service"
        />
      ))}
      {found.services.length > 1 ? (
        <li className="fr-found-row">
          <span />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => acts.addServices(found.services)}
            disabled={!o.canEdit}
            data-testid="fr-found-add-all"
            {...gate("settings", "add what was found")}
          >
            {F.addAll(found.services.length)}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** The days closed, the words of itself, and the rules and answers, a press each. */
function FoundMore(o: { found: FoundVM; acts: ReturnType<typeof foundActs>; room: boolean; canEdit: boolean }) {
  const { found, acts, canEdit, room } = o;
  const d = found.description;
  if (!found.closed.length && !found.notes.length && !d) return null;
  return (
    <ul className="fr-found-list" data-testid="fr-found-more">
      {found.closed.map((c) => (
        <FoundRow
          key={`closed-${c.date}`}
          title={F.closed(c.date, c.until)}
          from={c.from}
          onAdd={() => acts.addClosed(c)}
          disabled={!canEdit}
        />
      ))}
      {d ? (
        <FoundRow
          key="about"
          title={F.aboutTitle}
          says={d.text}
          from={d.from}
          onAdd={() => acts.addNote({ title: F.aboutTitle, text: d.text })}
          disabled={!canEdit || !room}
        />
      ) : null}
      {found.notes.map((n) => (
        <FoundRow
          key={`note-${n.title}-${n.text.slice(0, 24)}`}
          title={n.title}
          says={n.text}
          from={n.from}
          onAdd={() => acts.addNote(n)}
          disabled={!canEdit || (n.title !== F.rulesTitle && !room)}
        />
      ))}
    </ul>
  );
}

export function FrFound({
  reads,
  canEdit,
  flash,
}: {
  reads: readonly BusinessReadDto[] | null | undefined;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
}) {
  const brain = brainOf(businessTabSave.saver.base());
  if (!brain || !reads?.length) return null;
  const profile = (brain.profile || {}) as Profile;
  const found = foundOf(reads, foundRecordOf(profile));
  if (!found.any && !found.unread) return null;
  const acts = foundActs(profile, flash);
  return (
    <section className="rec-card fr-check-group fr-found" aria-label={F.title} data-testid="fr-found">
      <h2 className="fr-sub">{F.title}</h2>
      <p className="fr-detail">{F.lead}</p>
      {found.unread ? (
        <p className="fr-detail" data-testid="fr-found-unread">
          {found.unread}
        </p>
      ) : null}
      <FoundServices
        found={found}
        acts={acts}
        room={asList(profile.services).length < PROFILE_LIMITS.services}
        canEdit={canEdit}
      />
      <FoundMore
        found={found}
        acts={acts}
        room={asList(profile.notes).length < PROFILE_LIMITS.notes}
        canEdit={canEdit}
      />
    </section>
  );
}
