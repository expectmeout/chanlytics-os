/**
 * The two Ads pages that are not the ledger (MOCKUP): "nothing connected" (v0), which says only what the People report already
 * reads (how new people first reached the business, the "An ad" row in the ink and the rest in one quiet hue, and the three
 * platforms as "Not connected yet"), and "connected, no ads yet", one card for the first ad with its checklist (its press waits
 * while the account lacks something, and says what), or, while an account has to be chosen first, one card to choose it from,
 * each choice with the currency it is charged in. None draws a figure, a cost or a per-ad count: nothing here claims what
 * Chanlytics cannot support yet.
 */
import type { AdPlatform } from "@chanlytics/contracts";
import { GATE } from "@chanlytics/contracts/ads-page";
import type { ChooseVM, NoAdsVM, V0VM } from "@chanlytics/contracts/ads-page";
import { Button } from "../../kit/button/button";
import { BarList } from "../../kit/charts/bar";
import { EmptyState } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { gate, routeDoor } from "../../legacy-verbs";
import { StandRows } from "./standing";

/** The lead line: its bold part, and the rest, or the empty workspace's two lines. */
function V0Lead({ v0 }: { v0: V0VM }) {
  if (v0.empty) {
    return (
      <>
        <p className="ads-hero-lead">{v0.empty.lead}</p>
        <p className="ads-hero-muted">{v0.empty.line}</p>
      </>
    );
  }
  return (
    <>
      {v0.lead ? (
        <p className="ads-hero-lead" data-testid="ads-v0-lead">
          <b>{v0.lead.strong}</b>
          {v0.lead.rest}
        </p>
      ) : null}
      {v0.muted ? <p className="ads-hero-muted">{v0.muted}</p> : null}
    </>
  );
}

/** Today, nothing connected: the hero and its rows at the left, the three platforms and what comes next at the right. */
export function V0Page({ v0 }: { v0: V0VM }) {
  return (
    <div className="ads-hero" data-testid="ads-v0">
      <section className="ads-hero-main">
        <V0Lead v0={v0} />
        {v0.rows.length > 0 ? (
          <BarList
            rows={v0.rows.map((r) => ({
              id: r.label,
              label: r.label,
              value: r.n,
              color: r.own ? "var(--ink)" : "var(--line-strong)",
            }))}
          />
        ) : null}
        {v0.notes.map((note) => (
          <p key={note} className="ads-hero-note">
            {note}
          </p>
        ))}
        <LinkButton className="ads-hero-door" {...routeDoor(v0.door.to)} data-testid="ads-v0-door">
          {v0.door.words} <Icon name="chevron" size={12} />
        </LinkButton>
      </section>
      <section className="ads-hero-side">
        <ul className="ads-platforms">
          {v0.platforms.map((p) => (
            <li key={p.id} className="ads-platform" data-testid={`ads-platform-${p.id}`}>
              <span className="ads-dot" data-state="off" aria-hidden="true" />
              <span className="ads-platform-name">{p.name}</span>
              <span className="ads-platform-line">{p.line}</span>
              <span className="ads-platform-word">{p.word}</span>
            </li>
          ))}
        </ul>
        <p className="ads-hero-note">{v0.next}</p>
      </section>
    </div>
  );
}

/**
 * Connected, no ads yet: one card for the first ad, what it would be, and the checklist it stands on. The press opens New
 * ad; while the account is not ready (decision 3: a need it does not meet blocks the first ad, as it blocks Turn on) the
 * press waits, and the first need that is not met is said beside it with the door that mends it.
 */
export function NoAdsCard({ noAds, onSetUp }: { noAds: NoAdsVM; onSetUp: () => void }) {
  const blocked = noAds.blocked;
  return (
    <EmptyState kind="card" glyph="chat" title={noAds.title} body={noAds.line} className="ads-first" testid="ads-first">
      <StandRows rows={noAds.checklist} />
      <div className="ads-first-act">
        <Button
          variant="primary"
          size="sm"
          onClick={onSetUp}
          disabled={blocked !== null}
          data-testid="ads-set-up"
          {...gate("approve", GATE.turnOn)}
        >
          {noAds.press}
        </Button>
        {/* What stops it is said beside the press; the door that mends it is the checklist row's own, just above. */}
        {blocked ? (
          <p className="ads-first-why" data-testid="ads-first-blocked">
            {blocked.text}
          </p>
        ) : null}
      </div>
    </EmptyState>
  );
}

interface ChooseCardsProps {
  choose: readonly ChooseVM[];
  /** The owner picked one of an account's choices: its platform, the platform's id for it, and its name. */
  onChoose: (platform: AdPlatform, externalId: string, name: string) => void;
}

/**
 * An account that has to be chosen before anything else: one card each, naming the choices with the currency each is
 * charged in (which is fixed for an account), and a press on the one to use. Choosing it makes it the connected account.
 */
export function ChooseCards({ choose, onChoose }: ChooseCardsProps) {
  return (
    <div className="ads-choose" data-testid="ads-choose">
      {choose.map((c) => (
        <EmptyState
          key={c.platform}
          kind="card"
          glyph="list"
          title={c.title}
          body={c.line}
          className="ads-first"
          testid={`ads-choose-${c.platform}`}
        >
          <ul className="ads-choices">
            {c.choices.map((choice) => (
              <li key={choice.externalId} className="ads-choice" data-testid="ads-choice">
                <span className="ads-choice-name">{choice.label}</span>
                <Button
                  size="sm"
                  onClick={() => onChoose(c.platform, choice.externalId, choice.name)}
                  aria-label={`${c.use}: ${choice.label}`}
                  data-testid="ads-choice-use"
                >
                  {c.use}
                </Button>
              </li>
            ))}
          </ul>
        </EmptyState>
      ))}
    </div>
  );
}
