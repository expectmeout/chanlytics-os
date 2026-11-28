/**
 * A form's plain values (the Forms plan, 3.7): the eight kinds a question may be, which of them are a choice, and the
 * shape's limits. Apart from the shape itself (shape.ts, which is schemas): a page that changes a form in place
 * reads these and carries no schema (decision 0024). Pure.
 */

import { SECOND_MS } from "../shared/time";

/** The kinds a field may be (Ruben's call 6): eight, from the start, and no list a person picks from. */
export const FORM_FIELD_KINDS = ["short", "long", "email", "phone", "service", "one", "several", "when"] as const;
export type FormFieldKind = (typeof FORM_FIELD_KINDS)[number];

/** The kinds that are a choice among the field's own: a service, one, several, or when they would like to come. */
export const CHOICE_KINDS: ReadonlySet<FormFieldKind> = new Set(["service", "one", "several", "when"]);

/** How far back a form's sheet counts what it brought: a form made here and a site's alike (00680, 00709). */
export const FORM_RESULT_DAYS = 30;

/** Why an entry is held for a look, as the database keeps it: the door's doubt, or a member's word. */
export type EntryHeldWhyDto = "hidden_field" | "too_fast" | "too_many" | "member" | "elsewhere";

/** After this many days with nobody looking, a form's held entries are said on Today (the Forms plan, 3.10). */
export const FORM_HELD_SAID_AFTER_DAYS = 3;

/** The shape's limits: fields and choices, and each answer's length by its kind. */
export const FORM_LIMITS = {
  fields: 12,
  choices: 12,
  short: 200,
  long: 2000,
  email: 254,
  phone: 40,
  label: 120,
  help: 200,
  heading: 80,
  intro: 300,
  thanks: 300,
  /** What the owner says to AI of a form: Forms' line, and Ask's card that hands it there (draft-card.ts). */
  sentence: 600,
} as const;

/**
 * How long a press that asks AI to draft waits for its answer: the drafter has the route's whole minute (app/api/v1/forms,
 * maxDuration), and a little more. Forms' own line and Ask's card that hands a sentence to it (draft-card.ts) wait as one.
 */
export const FORM_PRESS_WAIT_MS = 65 * SECOND_MS;

/** A field's id or a choice's: short, plain, and its own for as long as the form lives. */
