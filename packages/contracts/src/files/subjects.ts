/**
 * The people in a file, as the owner or an operator names them (00691; the content loop PRD's 5.3, principle 6): the closed
 * sets a row of file_subjects and a file's own state hold. Rights are per person, and never read from a face.
 */

/** Who a person in a file is to the business (00691 file_subjects.label). */
export const SUBJECT_LABELS = ["client", "staff", "other"] as const;
export type SubjectLabel = (typeof SUBJECT_LABELS)[number];

/** How it is known a person is in a file: the owner or an operator named them, or the person said so. Never a face. */
export const SUBJECT_HOWS = ["owner_named", "person_said"] as const;

/** Whether the people in a file are known (00691 files.subjects_state). */
export const SUBJECTS_STATES = ["not_asked", "none", "named", "unsure"] as const;
export type SubjectsState = (typeof SUBJECTS_STATES)[number];
