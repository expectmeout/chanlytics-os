/**
 * A post made from a photo, as a card (decision 0099, step 3). It shows the real picture and asks for one press: Save keeps it as a
 * file, in a shape each, with an Undo for ten minutes. Its door is the same a photo is added by, in who may press it.
 */
import { POST_WORDS, postPlanOf } from "../files/post";
import { asText, rec, type ProposalEvent, type ProposalSpecAboveOperator } from "./spec";

const FILES_ROUTE = "admin/files";
/** The Files page reads again as a post lands or goes. */
const FILES_CHANGED: ProposalEvent = { type: "surface:files" };

export const postSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "save a post to Files",
  gate: "settings",
  commit: ({ payload }) => ({ route: "POST files/post", body: postPlanOf(payload), events: [FILES_CHANGED] }),
  receipt: (_p, data) => POST_WORDS.saved(asText(rec(data).name)),
  made: (_p, data) => asText(rec(data).file_id) || null,
  undo: {
    label: () => "Undo",
    window: "ten_minutes",
    record: (_p, data) => {
      const id = asText(rec(data).file_id);
      // The same picture pressed twice is one file, and what was already there is not this press's to take back.
      return id && rec(data).twin !== true ? { file_id: id } : null;
    },
    call: (u) => ({
      route: "DELETE files/[id]",
      params: { id: asText(u.file_id) },
      goneIsDone: true,
      events: [FILES_CHANGED],
    }),
    receipt: () => POST_WORDS.removed,
  },
  open: () => FILES_ROUTE,
};
