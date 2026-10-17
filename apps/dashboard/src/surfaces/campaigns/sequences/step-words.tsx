/**
 * A step's message in the flow (the phone review's Steps board): its title on the step's own line, a door to it in
 * Messages, with its WhatsApp standing only where it is not approved; and its words as one person reads them, the app's
 * one drawing of a message (parts/message-preview.tsx), its bubble plain on the flow's ground, filled for an example
 * person with the step's own values (contracts exampleParams over the step's params, what it sends). The message is the
 * workspace's offered one of the step's name and language (the settings read, parts/channels.ts cmOfferedFrom), so the
 * words are the ones it sends; a step whose message the workspace no longer offers says so, with the act that picks
 * another.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  SEQUENCE_FLOW_WORDS as F,
  addressOf,
  exampleParams,
  parseParamSpecs,
  stepApprovalOf,
} from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { routeDoor } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { cmBusinessOf, cmOfferedBy, cmOfferedFrom, type CmOffered } from "../parts/channels";
import { MessagePreview } from "../parts/message-preview";

/** The offered message a step sends, by its name and language, or null where the workspace offers none of it. */
export function useStepMessage(name: string | null, language: string | null): CmOffered | null {
  const settings = useSurface("settings");
  // The offered messages are made of the settings read once for each read of it, not once for each step drawn.
  const offered = useMemo(() => cmOfferedFrom(settings) ?? [], [settings]);
  return name ? cmOfferedBy(offered, name, language ?? "en_US") : null;
}

/** The business's name as a message fills it: an example's words say it. */
function useBusinessName(): string {
  return cmBusinessOf(useSurface("settings")).businessName;
}

/**
 * The step's message by its title, opening it in Messages, and its WhatsApp standing where it needs saying (in review,
 * turned down, paused by WhatsApp); approved says nothing. Its stored name where the workspace no longer offers it.
 */
export function StepMessageName(p: { name: string | null; message: CmOffered | null; testid: string }) {
  const { name, message, testid } = p;
  if (!name) return <span className="sq-fl-name">{F.noMessage}</span>;
  const approval = stepApprovalOf(message?.message?.versions.whatsapp?.status ?? null);
  return (
    <>
      <LinkButton
        size="inherit"
        className="sq-fl-name"
        {...routeDoor(addressOf({ kind: "template", name }))}
        data-testid={`${testid}-from`}
      >
        {message?.title ?? name}
      </LinkButton>
      {approval && approval.tone !== "ok" ? (
        <StatePill kind="tone" value={approval.tone} label={approval.label} />
      ) : null}
    </>
  );
}

interface StepWordsProps {
  name: string | null;
  message: CmOffered | null;
  params: unknown;
  /** Where its message is gone: the act that picks another (the step's editor). */
  gone?: ReactNode;
  testid: string;
}

/** The step's words as one person reads them, or what stands where its message is gone. */
export function StepWords({ name, message, params, gone = null, testid }: StepWordsProps) {
  const business = useBusinessName();
  if (!message)
    return (
      <div className="sq-msg sq-msg-gone" data-testid={testid}>
        <p className="sq-msg-none">{name ? F.messageGone : F.noMessage}</p>
        {gone}
      </div>
    );
  // A message with no words to draw here (none in its anchor's language) is named on the step's line alone.
  if (!message.body_preview) return null;
  const values = exampleParams(parseParamSpecs(params), business);
  return (
    <div className="sq-msg" data-testid={testid}>
      <MessagePreview compact plain from={business} body={message.body_preview} values={values} />
    </div>
  );
}
