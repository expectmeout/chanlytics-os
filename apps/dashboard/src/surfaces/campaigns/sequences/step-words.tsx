/**
 * A step's message in the schedule (the Steps redesign, 17 Oct 2026): two lines of it on the step's box, and in its sheet
 * its words as one person reads them, the app's one drawing of a message (parts/message-preview.tsx), filled for an
 * example person with the step's own values (contracts exampleParams over the step's params, what it sends), with a door
 * to it in Messages and its WhatsApp standing where it is not approved. The message is the workspace's offered one of the
 * step's name and language (the settings read, parts/channels.ts cmOfferedFrom), so the words are the ones it sends; a
 * step whose message the workspace no longer offers says so, with the act that picks another.
 */
import { Fragment, useMemo } from "react";
import type { ReactNode } from "react";
import {
  SCHEDULE_WORDS as SW,
  SEQUENCE_FLOW_WORDS as F,
  addressOf,
  exampleParams,
  parseParamSpecs,
  stepApprovalOf,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { routeDoor } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { cmBusinessOf, cmOfferedBy, cmOfferedFrom, type CmOffered } from "../parts/channels";
import { MessagePreview, mpParts } from "../parts/message-preview";

/**
 * The offered message a step sends, and whether the messages are read at all: a step's message is gone only once the
 * settings read has answered and holds none of it, never while it is still being read.
 */
export function useStepMessageRead(
  name: string | null,
  language: string | null,
): { message: CmOffered | null; read: boolean } {
  const settings = useSurface("settings");
  const offered = useMemo(() => cmOfferedFrom(settings), [settings]);
  return {
    message: name && offered ? cmOfferedBy(offered, name, language ?? "en_US") : null,
    read: Array.isArray(offered),
  };
}

/** The business's name as a message fills it: an example's words say it. */
function useBusinessName(): string {
  return cmBusinessOf(useSurface("settings")).businessName;
}

/**
 * A step's sheet's door to its message in Messages (where its words are changed for every step that sends it), and its
 * WhatsApp standing where it needs saying (in review, turned down, paused by WhatsApp); approved says nothing.
 */
export function StepMessageDoor(p: { name: string; message: CmOffered | null; testid: string }) {
  const { name, message, testid } = p;
  const approval = stepApprovalOf(message?.message?.versions.whatsapp?.status ?? null);
  return (
    <p className="sq-stepview-from">
      {approval && approval.tone !== "ok" ? (
        <StatePill kind="tone" value={approval.tone} label={approval.label} />
      ) : null}
      <LinkButton {...routeDoor(addressOf({ kind: "template", name }))} data-testid={`${testid}-from`}>
        {SW.inMessages} <Icon name="chevron" size={11} />
      </LinkButton>
    </p>
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

/**
 * A step's words on its box in the schedule: two lines of the message as one person reads it, what varies by person marked
 * as the bubble marks it, cut where it runs on (its sheet holds it whole). Nothing where the message has no words here.
 */
export function StepPreviewLine({ message, params }: { message: CmOffered | null; params: unknown }) {
  const business = useBusinessName();
  if (!message?.body_preview) return null;
  const values = exampleParams(parseParamSpecs(params), business);
  return (
    <span className="sq-stepbox-pre">
      {mpParts(message.body_preview, values).map((p, i) =>
        p.kind === "slot" ? (
          <span key={i} className="mp-slot">
            {p.text}
          </span>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </span>
  );
}
