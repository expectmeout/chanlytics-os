/**
 * A post made from a photo, as a card (decision 0099, step 3). It shows the real picture and asks for one press: Save keeps it as a
 * file, in a shape each, with an Undo for ten minutes. Whoever may delete a file may press it, since the Undo deletes it: an
 * operator may add a photo, not this.
 */
import { postPlanOf, postWordsIn, type PostLanguage } from "./post";
import { asText, rec, type ProposalSpecAboveOperator } from "../ask/proposals/spec";

/** The Files page, where a card made of a file opens. */
export const FILES_ROUTE = "admin/files";

const postSaysOf = (p: { payload: Record<string, unknown> }) => postWordsIn(postPlanOf(p.payload).language);

export const postSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "save a post to Files",
  gate: "settings",
  commit: ({ payload }) => ({ route: "POST files/post", body: postPlanOf(payload) }),
  receipt: (p, data) => postSaysOf(p).saved(asText(rec(data).name)),
  made: (_p, data) => asText(rec(data).file_id) || null,
  undo: {
    label: (p) => postSaysOf(p).undo,
    window: "ten_minutes",
    record: (p, data) => {
      const id = asText(rec(data).file_id);
      // The same picture pressed twice is one file, and what was already there is not this press's to take back. What was pressed
      // rides with it: a person may have changed the card first, and a reload reads the words that were saved, not the ones proposed.
      const plan = postPlanOf(p.payload);
      return id && rec(data).twin !== true ? { file_id: id, language: plan.language, plan } : null;
    },
    call: (u) => ({ route: "DELETE files/[id]", params: { id: asText(u.file_id) }, goneIsDone: true }),
    receipt: (_data, record) => postWordsIn(record.language as PostLanguage).removed,
  },
  open: () => FILES_ROUTE,
};
