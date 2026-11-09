/**
 * Cold email: where it stands (contracts coldEmailStandingOf). The one thing that matters most, and what to press, at the
 * top of the page. Amber where it waits on the owner, quiet where it does not. A new account's answer is a list of what
 * is left before a first email, each with its own door. Someone who may only read is told, and offered no press.
 */
import type { ColdEmailStanding, ColdEmailStep } from "@chanlytics/contracts";
import { REACH_OUT_SETTINGS_WORDS, leadsRoute } from "@chanlytics/contracts";
import { canDo, navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { recFolds } from "../../kit/record/registry";
import { settingsRowRoute } from "../frame/tabs";

/** The door a step left to do goes through: a sheet of this page, or the page that holds it. */
const stepDoor = (id: ColdEmailStep["id"]) => {
  if (id === "mailbox") return () => recFolds.request("connect");
  return () => navigate(id === "address" ? settingsRowRoute("address") : leadsRoute({}));
};

/**
 * What a press asks of the person, so it shows to whoever may do it (contracts ROLE_PERMS): an operator approves a batch and
 * starts a sequence without changing settings, and the lead finder is the owner's and the partner's. The rest change settings.
 */
const PRESS_NEEDS: Partial<Record<ColdEmailStanding["kind"], string>> = {
  waiting_ok: "approve",
  ready: "approve",
  no_one_new: "find",
};
const STEP_NEEDS: Record<ColdEmailStep["id"], string> = { mailbox: "settings", address: "settings", people: "find" };

const StepRow = ({ step }: { step: ColdEmailStep }) => (
  <li className="ro-step" data-done={step.done ? "true" : "false"} data-testid={`rec-step-${step.id}`}>
    <span className="ro-step-dot" aria-hidden="true">
      {step.done ? <Icon name="check" size={12} /> : null}
    </span>
    <span className="ro-step-words">
      {!step.done && canDo(STEP_NEEDS[step.id]) ? (
        <LinkButton className="ro-step-door" onClick={stepDoor(step.id)} data-testid={`rec-step-${step.id}-door`}>
          {step.title}
        </LinkButton>
      ) : (
        <span>{step.title}</span>
      )}
      {step.done ? null : <small>{step.detail}</small>}
    </span>
  </li>
);

/** What the answer's one press does: a sheet of this page where it has no address of its own. */
const pressOf = (standing: ColdEmailStanding) => () => {
  if (standing.to) navigate(standing.to);
  else if (standing.kind === "no_mailbox") recFolds.request("connect");
};

export function StandingCard({ standing }: { standing: ColdEmailStanding | null }) {
  if (!standing) return <section className="rec-card ro-standing" data-testid="rec-standing" aria-busy="true" />;
  return (
    <section
      className="rec-card ro-standing"
      data-testid="rec-standing"
      data-needs={standing.needs_you ? "true" : "false"}
      data-kind={standing.kind}
    >
      <h2 className="ro-standing-head" data-testid="rec-standing-head">
        {standing.kind === "sending" ? <span className="ro-standing-dot" aria-hidden="true" /> : null}
        {standing.headline}
      </h2>
      {standing.detail ? (
        <p className="ro-standing-detail" data-testid="rec-standing-detail">
          {standing.detail}
        </p>
      ) : null}
      {standing.kind === "not_started" ? (
        <ul className="ro-steps" data-testid="rec-steps">
          {standing.steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </ul>
      ) : null}
      {standing.act && canDo(PRESS_NEEDS[standing.kind] ?? "settings") ? (
        <span>
          <Button
            size="sm"
            variant={standing.needs_you ? "primary" : undefined}
            onClick={pressOf(standing)}
            data-testid="rec-standing-act"
          >
            {standing.act}
          </Button>
        </span>
      ) : null}
      {standing.kind === "sending" && standing.to ? (
        <span>
          <LinkButton onClick={() => navigate(standing.to ?? "")} data-testid="rec-standing-open">
            {REACH_OUT_SETTINGS_WORDS.standingOpen} <Icon name="chevron" size={11} />
          </LinkButton>
        </span>
      ) : null}
    </section>
  );
}
