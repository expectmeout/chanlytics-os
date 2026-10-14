/**
 * The identity cell (D5), moved from legacy/pages/leads-cells.jsx (decision 0015): the tile, the name (which peeks) with
 * its card, the tags the row's state and its fit wear, and one quiet line about where -- or, for a row that waits, what
 * would resolve it; for a left-out row, what left it out. The two tags are the kit's one StatePill, on the registry's tones
 * (tone.ts).
 */
import { LEAD_WORDS, WORKS_AT_WORDS, leadPeopleIndex, leadPeopleOf } from "@chanlytics/contracts";
import type { LeadPeopleIndex, LeadPeopleVM, LeadRowVM, PersonRowVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { LeadCallMenu, ldCallProps } from "./call-menu";
import { LeadCard, LeadHover } from "./hover";
import { LeadTile } from "./tile";
import type { LeadCellCtx } from "./types";
import { wantPerson } from "../../people/want-person";

// The name's card: enough to decide without opening the peek, and the one hover that carries links, because it is the one
// you can keep the pointer inside.
const LeadNameCard = ({ l, x }: { l: LeadRowVM; x: LeadCellCtx }) => (
  <LeadCard id={`${l.id}-card`} label={`About ${l.name}`} testid="lead-card-name">
    <div className="ld-card-head">
      <LeadTile l={l} size={40} />
      <div className="ld-card-titles">
        <div className="ld-card-name">{l.name}</div>
        <div className="ld-card-sub">{[l.sub, l.card.today].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
    {l.card.about ? <p className="ld-card-about">{l.card.about}</p> : null}
    <p className="ld-card-why">{l.why}</p>
    {ldPeopleOf(l, x)?.card ? (
      <p className="ld-who-here" data-testid="lead-card-people">
        {ldPeopleOf(l, x)?.card}
      </p>
    ) : null}
    <div className="ld-card-foot">
      {l.card.site ? (
        <a href={l.card.site.href} target="_blank" rel="noopener noreferrer">
          {l.card.site.label}
        </a>
      ) : null}
      {l.card.maps ? (
        <a href={l.card.maps.href} target="_blank" rel="noopener noreferrer">
          {l.card.maps.label}
        </a>
      ) : null}
      <span className="sp" />
      {l.phone && !l.phoneWrong ? (
        <LeadCallMenu
          {...ldCallProps(l, x)}
          look={{ variant: "primary", size: "sm", iconOnly: false }}
          label="Call"
          testid="lead-card-call"
        />
      ) : null}
    </div>
  </LeadCard>
);

// What people say: the spread the row only hints at, one bar a star.
export const LeadRatedCard = ({ l }: { l: LeadRowVM }) => {
  const spread = l.spread ?? [0, 0, 0, 0, 0];
  const total = spread.reduce((a, b) => a + b, 0) || 1;
  return (
    <LeadCard label={`How ${l.name} is rated`} testid="lead-card-rated">
      <div className="ld-card-rated">
        <span className="ld-card-score">{l.rated?.score}</span>
        <span className="ld-card-count">{l.rated?.reviews}</span>
      </div>
      {[5, 4, 3, 2, 1].map((star) => {
        const n = spread[star - 1] ?? 0;
        return (
          <div key={star} className="ld-bar-row">
            <span className="k">{star}</span>
            <span className="ld-bar">
              <span style={{ width: `${Math.round((n / total) * 100)}%` }} />
            </span>
            <span className="n">{n.toLocaleString("en-US")}</span>
          </div>
        );
      })}
    </LeadCard>
  );
};

/** The row's classes on its tr (leads.css): a lead's row, its state, and its class. One function, so a memoised row sees the same one each draw. */
export const ldRowClass = (l: LeadRowVM) => `ld-row ld-row-${l.state} ld-cls-${l.cls}`;

// Whether the Stage column says exactly what the name's state tag would: Talking, or a lead out of the running that is
// not left out (the column draws nothing for a left-out lead, and Needs review and Contacted say more than it does).
const ldStageSaysIt = (l: LeadRowVM) => l.state === "talking" || (l.state === "out" && l.cls !== "excluded");

/** People's rows by business, made once for each read of them, whatever number of rows draws from it. */
const peopleIndexes = new WeakMap<readonly PersonRowVM[], LeadPeopleIndex>();

/**
 * The people at a lead, as People holds them (contracts leadPeopleOf, 0052): who its Stage opens, the row's line, the card's
 * line, and who made it a client. Null before People is read. The rows come through the cell context (x.peopleRows), never
 * the surface itself: a memoised row is drawn again only when a prop changes, and on a cold load of Leads the people land
 * after the rows were drawn.
 */
export const ldPeopleOf = (
  l: LeadRowVM,
  x: Pick<LeadCellCtx, "peopleRows"> | null | undefined,
): LeadPeopleVM | null => {
  const rows = x && x.peopleRows;
  if (!rows) return null;
  // The person the lead was made with, where People does not hold them yet (a reply made them since its last read): People is
  // asked for once, so the Talking door and the client follow (want-person.ts; the wiring's second audit, R10).
  wantPerson(l.contactId);
  let index = peopleIndexes.get(rows);
  if (!index) peopleIndexes.set(rows, (index = leadPeopleIndex(rows)));
  return leadPeopleOf(l, index);
};

/**
 * A lead someone at became a client (0004; anyone who works there since 0052): a deal won says Client in the deal pill's own
 * tone, in place of the lead's own tag. Nothing stored on the lead; a proposal still out, or no deal, keeps the lead's word.
 * People not read yet reads as no deal.
 */
export const ldClientOf = (l: LeadRowVM, x: Pick<LeadCellCtx, "peopleRows"> | null | undefined) =>
  !!ldPeopleOf(l, x)?.client;

/**
 * The Client pill of a lead someone at is a client: a door to that person, in People (the lead's row opens the lead itself,
 * and nothing opened the person from here, D1-lead-person-door). A page that cannot open one draws the pill alone.
 */
const ldClientPill = (l: LeadRowVM, x: Pick<LeadCellCtx, "onOpenPerson" | "peopleRows">) => {
  const person = ldPeopleOf(l, x)?.client ?? null;
  const pill = <StatePill kind="deal" value="won" testid="lead-state-tag" />;
  return person && x.onOpenPerson ? (
    <LinkButton
      onClick={(e) => {
        e.stopPropagation();
        x.onOpenPerson(person);
      }}
      title={LEAD_WORDS.openPerson}
      data-testid="lead-client-door"
    >
      {pill}
    </LinkButton>
  ) : (
    pill
  );
};

/**
 * A Talking lead's Stage as the door to the person it is talking with (0052, canvas A): "Talking · Priya Nair ›" in the
 * Stage column, their page in People; "Talking ›" beside the business's name, where the line under it names them and a
 * name in the tag would cut the business's short; and "Talking ›" too where its person is named for the business. The
 * pill alone for any other stage, before People is read, for a lead nobody at is in People, or on a page that cannot open
 * a person.
 */
export const ldTalkingDoor = (
  l: LeadRowVM,
  x: Pick<LeadCellCtx, "onOpenPerson" | "peopleRows">,
  pill: { kind: "lead_row_state" | "lead_stage"; value: string; label: string; testid?: string; named: boolean },
) => {
  const door = l.state === "talking" ? (ldPeopleOf(l, x)?.door ?? null) : null;
  if (!door || !x.onOpenPerson)
    return <StatePill kind={pill.kind} value={pill.value} label={pill.label} testid={pill.testid} />;
  return (
    <LinkButton
      onClick={(e) => {
        e.stopPropagation();
        x.onOpenPerson(door.id);
      }}
      title={door.name ? WORKS_AT_WORDS.openInPeople(door.name) : LEAD_WORDS.openPerson}
      data-testid="lead-talking-door"
    >
      <StatePill
        kind={pill.kind}
        value={pill.value}
        label={WORKS_AT_WORDS.stageWith(pill.label, pill.named ? door.name : null)}
        testid={pill.testid}
      />
      <Icon name="chevron" size={10} />
    </LinkButton>
  );
};

export const ldBusinessCell = (l: LeadRowVM, x: LeadCellCtx) => (
  <td key="business" className={`cl-name-cell pl-pin ld-biz-cell ${l.cls}`}>
    <div className="cl-row-name ld-row-name">
      <LeadTile l={l} onExpand={x.onExpand} />
      <LeadHover as="div" className="cl-row-name-block ld-hover" card={<LeadNameCard l={l} x={x} />}>
        <div className="cl-row-fullname">
          <button
            type="button"
            className="ld-biz-name"
            onClick={(e) => {
              e.stopPropagation();
              x.onOpen(l.id);
            }}
            aria-describedby={`${l.id}-card`}
            data-testid="lead-name"
          >
            {l.name}
          </button>
          {l.places > 1 && (
            <span className="ld-badge" title="Two listings on the map for one business">
              {l.places} listings
            </span>
          )}
          {x.mixedFits && l.fit ? (
            <StatePill kind="lead_fit" value={l.fit} label={l.fitLabel} testid="lead-fit-tag" />
          ) : null}
          {/* Said once: while the Stage column is drawn, the name's tag gives way where the column says the same thing
              (Talking; a lead that said no or is not a fit). It stays where it says more: Needs review, Left out (the
              column is empty for a left-out lead), and Contacted with how long ago. */}
          {ldClientOf(l, x)
            ? ldClientPill(l, x)
            : l.stateTag && !(x.stageShown && ldStageSaysIt(l))
              ? ldTalkingDoor(l, x, {
                  kind: "lead_row_state",
                  value: l.state,
                  label: l.stateTag,
                  testid: "lead-state-tag",
                  named: false,
                })
              : null}
        </div>
        {/* Who at the business is in People says more than where it is, once someone there has a name of their own (0052). */}
        <div className={`cl-row-meta ld-sub${l.waitsOn ? " waits" : ""}`} data-testid="lead-sub">
          {l.cls === "excluded" ? l.fitLabel : l.waitsOn || ldPeopleOf(l, x)?.line || l.sub}
        </div>
      </LeadHover>
    </div>
  </td>
);
