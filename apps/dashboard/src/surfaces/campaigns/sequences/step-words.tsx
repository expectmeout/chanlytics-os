/**
 * A step's words as one person reads them (the canvas's Steps board, "its words in a chat bubble with each person's words
 * tinted"): the app's one drawing of a message (parts/message-preview.tsx), compact and bare, filled for an example person
 * the way every composer previews one (contracts exampleParams), under the message's own name, which opens it in Messages,
 * and its WhatsApp standing. The message is the workspace's offered one of the step's name and language (the settings
 * read, parts/channels.ts cmOfferedFrom), so the words are the ones it sends; a step whose message is not offered here says
 * its name alone.
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
function useStepMessage(name: string | null, language: string | null): CmOffered | null {
  const settings = useSurface("settings");
  // The offered messages are made of the settings read once for each read of it, not once for each step drawn.
  const offered = useMemo(() => cmOfferedFrom(settings) ?? [], [settings]);
  return name ? cmOfferedBy(offered, name, language ?? "en_US") : null;
}

/** The business's name as a message fills it: an example's words say it. */
function useBusinessName(): string {
  return cmBusinessOf(useSurface("settings")).businessName;
}

interface StepWordsProps {
  name: string | null;
  language: string | null;
  params: unknown;
  /** Under the bubble, after the message's name and standing: the step's own acts. */
  acts?: ReactNode;
  testid: string;
}

export function StepWords({ name, language, params, acts = null, testid }: StepWordsProps) {
  const message = useStepMessage(name, language);
  const business = useBusinessName();
  const approval = stepApprovalOf(message?.message?.versions.whatsapp?.status ?? null);
  const values = exampleParams(parseParamSpecs(params), business);
  return (
    <div className="sq-msg" data-testid={testid}>
      {message?.body_preview ? (
        <MessagePreview compact bare from={business} body={message.body_preview} values={values} />
      ) : (
        <p className="sq-msg-none">{name ?? F.noMessage}</p>
      )}
      <p className="sq-msg-meta">
        {name ? (
          <LinkButton {...routeDoor(addressOf({ kind: "template", name }))} data-testid={`${testid}-from`}>
            {F.from} “{message?.title ?? name}”
          </LinkButton>
        ) : null}
        {approval ? <StatePill kind="tone" value={approval.tone} label={approval.label} /> : null}
        {acts}
      </p>
    </div>
  );
}
