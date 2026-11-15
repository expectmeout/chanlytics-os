/**
 * What a step's editor picks from and how its Save lands (split out of step-editor.tsx, which it would have taken past
 * its length): the workspace's messages and, after them, the ready-made starters nothing has filed (the clean list, 14 Nov
 * 2026), each under a pick of its own, in the language the business's customers are written to in (lib/starter-message.ts
 * starterLanguageOf); on Save, a ready-made starter is filed in that language on the sequence's channels (POST
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
import { profileLanguagesOf, starterLanguageOf } from "@/lib/starter-message";
import { starters, templates as templateVerbs } from "../templates/verbs";
import { TPL_LIST_WORDS } from "../templates/words";
import { pressed } from "./verbs";

/** A ready-made starter's place among the editor's picks: its key behind this mark, apart from every message's id. */
const STARTER_PICK = "starter:";

/**
 * A ready-made starter as the editor offers and previews it: its words as the set writes them in `language`, on the
 * channels it is written for in that language exactly (as its filing writes them), under a pick of its own. Nothing is
 * filed until Save (stepSaved).
 */
function starterOffered(starter: StarterTemplate, language: string): CmOffered {
  const text = starterText(starter, language);
  const email = starter.email?.[language] ? starterEmailText(starter, language) : null;
  const sms = starter.sms?.[language] ? starterSmsText(starter, language) : null;
  return {
    id: `${STARTER_PICK}${starter.key}`,
    channel: "whatsapp",
    name: starter.name,
    language,
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

/**
 * The ready-made starters a step may take: those offered here that no message on file is named for, on any channel, once
 * Settings' messages are read (none offered until then, so a starter on file is never offered beside itself), in the
 * language its profile says its customers are written to in. The messages, not the WhatsApp rows: a starter on file by
 * email or text alone (no number, or an offer from a US number) is the workspace's message, never ready-made again (the
 * review of 15 Nov 2026).
 */
export function readyMadeOf(
  read:
    | {
        messages: readonly { name: string }[] | null;
        settings: { config: Parameters<typeof profileLanguagesOf>[0] } | null;
      }
    | null
    | undefined,
): CmOffered[] {
  if (!read?.messages) return [];
  const held = new Set(read.messages.map((m) => m.name));
  const languages = profileLanguagesOf(read.settings?.config);
  return starters.list
    .filter((s) => !s.retired && !held.has(s.name))
    .map((s) => starterOffered(s, starterLanguageOf(s, languages)));
}

/**
 * What a pick says beside its name: the channels a message goes by, with the list's own word where WhatsApp is still
 *  checking it ("On WhatsApp, By email · Being checked"), or that a starter is ready-made.
 */
export function pickMetaOf(offered: CmOffered): string {
  if (offered.id.startsWith(STARTER_PICK)) return TPL_LIST_WORDS.made;
  const by = offered.channels.map((c) => PREVIEW_CHANNEL_WORDS[c]).join(", ");
  return offered.checking ? `${by} · ${TPL_LIST_WORDS.standing.pending}` : by;
}

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
  // In the language it was offered in, which the editor previewed: the business's customers' (readyMadeOf).
  const filed = await templateVerbs.fileStarters({
    keys: [key],
    languages: [picked.language],
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
