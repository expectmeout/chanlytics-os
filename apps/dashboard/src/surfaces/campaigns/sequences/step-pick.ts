/**
 * What a step's editor picks from and how its Save lands (split out of step-editor.tsx, which it would have taken past
 * its length): the workspace's messages and, after them, the ready-made starters nothing has filed (the clean list, 14 Nov
 * 2026), each under a pick of its own; on Save, a ready-made starter is filed on the sequence's channels (POST
 * templates/starter, its WhatsApp version sent for review then) and the step takes the version that leaves, through the
 * two doors a step is changed by: its wait, and its words.
 */
import {
  CONSENT_CHANNELS,
  LIBRARY_STARTER_WORDS,
  PREVIEW_CHANNEL_WORDS,
  purposeOfTemplate,
  starterEmailText,
  starterSmsText,
  starterText,
  type FollowUpCondition,
  type ParamSpec,
  type SequenceStepDto,
  type StarterTemplate,
} from "@chanlytics/contracts";
import type { FrameFlash } from "../../frame-verbs";
import type { CmOffered } from "../parts/channels";
import { STARTER_LANGUAGE } from "../templates/group";
import { starters, templates as templateVerbs } from "../templates/verbs";
import { TPL_LIST_WORDS } from "../templates/words";
import { pressed } from "./verbs";

/** A ready-made starter's place among the editor's picks: its key behind this mark, apart from every message's id. */
const STARTER_PICK = "starter:";

/**
 * A ready-made starter as the editor offers and previews it: its words as the set writes them, on the channels it is
 * written for, under a pick of its own. Nothing is filed until Save (stepSaved).
 */
function starterOffered(starter: StarterTemplate): CmOffered {
  const text = starterText(starter, STARTER_LANGUAGE);
  const email = starterEmailText(starter, STARTER_LANGUAGE);
  const sms = starterSmsText(starter, STARTER_LANGUAGE);
  return {
    id: `${STARTER_PICK}${starter.key}`,
    channel: "whatsapp",
    name: starter.name,
    language: STARTER_LANGUAGE,
    body_preview: text.body,
    variables: text.slots.map((slot, i) => ({ position: i + 1, label: slot.label, example: slot.example })),
    footer: text.footer,
    category: starter.category,
    meta_status: "pending",
    quality: null,
    rejected_reason: null,
    synced_at: null,
    source: "starter",
    title: starter.title,
    purpose: purposeOfTemplate(starter.category),
    channels: CONSENT_CHANNELS.filter((c) => c === "whatsapp" || (c === "email" ? !!email : !!sms)),
    versions: {
      ...(email ? { email: { subject: email.subject, body: email.body } } : {}),
      ...(sms ? { sms: { subject: null, body: sms.body } } : {}),
    },
  };
}

/** The ready-made starters a step may take: those offered here that nothing on file is named for, once Settings is read. */
export function readyMadeOf(templatesAll: readonly { name: string }[] | null | undefined): CmOffered[] {
  if (!templatesAll) return [];
  const held = new Set(templatesAll.map((t) => t.name));
  return starters.list.filter((s) => !s.retired && !held.has(s.name)).map(starterOffered);
}

/** What a pick says beside its name: the channels a message holds, or that a starter is ready-made. */
export const pickMetaOf = (offered: CmOffered): string =>
  offered.id.startsWith(STARTER_PICK)
    ? TPL_LIST_WORDS.made
    : offered.channels.map((c) => PREVIEW_CHANNEL_WORDS[c]).join(", ");

/**
 * The version a step takes for its pick: a message's own id, or, for a ready-made starter, the version filing it leaves.
 * Null where filing failed, said in the server's words.
 */
async function templateIdOf(
  picked: CmOffered,
  channels: readonly string[],
  flash: (flash: FrameFlash) => void,
): Promise<string | null> {
  if (!picked.id.startsWith(STARTER_PICK)) return picked.id;
  const key = picked.id.slice(STARTER_PICK.length);
  const filed = await templateVerbs.fileStarters({
    keys: [key],
    languages: [STARTER_LANGUAGE],
    channels: [...channels],
  });
  if (filed.ok && filed.data.template_id) return filed.data.template_id;
  flash({ tone: "danger", msg: filed.ok ? LIBRARY_STARTER_WORDS.notAdded : filed.message });
  return null;
}

/** A step's Save, as the editor holds it when pressed. */
interface StepSave {
  picked: CmOffered;
  /** The channels the sequence goes by: what a ready-made starter it picked is filed on. */
  channels: readonly string[];
  flash: (flash: FrameFlash) => void;
  sequenceId: string;
  /** The step changed, or none for a new one at the end. */
  step: SequenceStepDto | null;
  first: boolean;
  days: number;
  only: FollowUpCondition[];
  waitChanged: boolean;
  wordsChanged: boolean;
  params: ParamSpec[];
}

/**
 * A step's Save: its pick's version (a ready-made starter filed first), then its wait where it changed, then its words
 * where they changed. A first step keeps its moment and its hour, so only its words change; a step that stays gets its
 * new words apart, since they may wait for WhatsApp while it sends its own. Whether all of it landed.
 */
export async function stepSaved(save: StepSave): Promise<boolean> {
  const { step, flash, sequenceId, params } = save;
  const templateId = await templateIdOf(save.picked, save.channels, flash);
  if (!templateId) return false;
  const fields = { sequence_id: sequenceId, after_days: save.days, only_if: save.only };
  const keepsWait = save.first || (step !== null && !save.waitChanged);
  const ok =
    keepsWait ||
    (await pressed(
      "sequence_step",
      step ? { ...fields, step_id: step.id } : { ...fields, template_id: templateId, params },
      flash,
      () => {},
    ));
  if (!ok || !step || !save.wordsChanged) return ok;
  return pressed(
    "sequence_words",
    { sequence_id: sequenceId, step_id: step.id, template_id: templateId, params },
    flash,
    () => {},
  );
}
