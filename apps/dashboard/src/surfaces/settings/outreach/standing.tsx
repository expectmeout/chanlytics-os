/**
 * Cold email: where it stands (contracts coldEmailStandingOf). The one thing that matters most, and what to press, at the
 * top of the page. Amber where it waits on the owner, quiet where it does not. A new account's answer is a list of what
 * is left before a first email, each with its own door. Someone who may only read is told, and offered no press.
 */
import type { ColdEmailStanding, ColdEmailStep } from "@chanlytics/contracts";
import { REACH_OUT_SETTINGS_WORDS, leadsRoute } from "@chanlytics/contracts";
import { navigate } from "../../frame-verbs";
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

const StepRow = ({ step, canEdit }: { step: ColdEmailStep; canEdit: boolean }) => (
  <li className="ro-step" data-done={step.done ? "true" : "false"} data-testid={`rec-step-${step.id}`}>
    <span className="ro-step-mark" aria-hidden="true">
      {step.done ? <Icon name="check" size={12} /> : null}
    </span>
    <span className="ro-step-words">
      {canEdit && !step.done ? (
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

export function StandingCard({ standing, canEdit }: { standing: ColdEmailStanding | null; canEdit: boolean }) {
  if (!standing) return <section className="rec-card ro-standing" data-testid="rec-standing" aria-busy="true" />;
  return (
    <section
      className="rec-card ro-standing"
      data-testid="rec-standing"
      data-needs={standing.needsYou ? "true" : "false"}
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
            <StepRow key={step.id} step={step} canEdit={canEdit} />
          ))}
        </ul>
      ) : null}
      {standing.act && canEdit ? (
        <span>
          <Button
            size="sm"
            variant={standing.needsYou ? "primary" : undefined}
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
