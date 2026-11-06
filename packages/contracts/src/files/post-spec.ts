/**
 * A post made from a photo, as a card (decision 0099, step 3). It shows the real picture and asks for one press: Save keeps it as a
 * file, in a shape each, with an Undo for ten minutes. Its door is the same a photo is added by, in who may press it.
 */
import { postPlanOf, postWordsIn, type PostLanguage } from "./post";
import { asText, rec, type ProposalSpecAboveOperator } from "../ask-proposals/spec";

const FILES_ROUTE = "admin/files";

const wordsOf = (p: { payload: Record<string, unknown> }) => postWordsIn(postPlanOf(p.payload).language);

export const postSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "save a post to Files",
  gate: "settings",
  commit: ({ payload }) => ({ route: "POST files/post", body: postPlanOf(payload) }),
  receipt: (p, data) => wordsOf(p).saved(asText(rec(data).name)),
  made: (_p, data) => asText(rec(data).file_id) || null,
  undo: {
    label: (p) => wordsOf(p).undo,
    window: "ten_minutes",
    record: (p, data) => {
      const id = asText(rec(data).file_id);
      // The same picture pressed twice is one file, and what was already there is not this press's to take back.
      return id && rec(data).twin !== true ? { file_id: id, language: postPlanOf(p.payload).language } : null;
    },
    call: (u) => ({ route: "DELETE files/[id]", params: { id: asText(u.file_id) }, goneIsDone: true }),
    receipt: (_data, record) => postWordsIn(record.language as PostLanguage).removed,
  },
  open: () => FILES_ROUTE,
};
