/**
 * A post made from a photo, as a card (decision 0099, step 3). It shows the real picture and asks for one press: Save keeps it as a
 * file, in a shape each, with an Undo for ten minutes. Whoever may delete a file may press it, since the Undo deletes it: an
 * operator may add a photo, not this.
 */
import { asText, rec, type ProposalSpecAboveOperator } from "../ask/proposals/spec";
import { postPlanOf, postWordsIn } from "../files/post";
import { fileYesReceiptOf, fileYesUsesIn } from "../files/yes";
import { CONTENT_ROUTE, contentRouteOf } from "./address";

const postSaysOf = (p: { payload: Record<string, unknown> }) => postWordsIn(postPlanOf(p.payload).language);

export const postSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "save a post",
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
    receipt: (_data, record) => postWordsIn(postPlanOf(record).language).removed,
  },
  open: () => CONTENT_ROUTE,
};

/**
 * AI's card for a yes said to it (00665; files/yes.ts holds the rule and its words): the owner told AI, in a conversation
 * or on the file's own line, that the people in a photo or video said yes to a use, or took a yes back. A card in their
 * own words is kept as the turn is saved (the dashboard's ask/tools/act/files/yes.ts); any other waits for their press.
 * Its press is POST files/[id]/yes, or POST files/[id]/yes/back for a take-back, which holds every post of it still
 * waiting. A yes kept has an Undo for ten minutes, which takes it back; a take-back has none: a yes is given again by
 * telling AI. Its Open is the file, where the Library says what it has and needs.
 */
export const fileYesSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "keep a yes for a photo or a video",
  gate: "settings",
  commit: ({ payload }) => {
    const id = asText(payload.file_id);
    const uses = fileYesUsesIn(payload.uses);
    if (payload.back === true)
      return { route: "POST files/[id]/yes/back", params: { id }, body: uses.length ? { uses } : {} };
    const thread = asText(payload.thread_id);
    return {
      route: "POST files/[id]/yes",
      params: { id },
      body: { uses, who: asText(payload.who), ...(thread ? { thread_id: thread } : {}) },
    };
  },
  receipt: ({ payload }, data) => fileYesReceiptOf({ back: payload.back === true, who: asText(payload.who) }, data),
  undo: {
    label: ({ payload }) => (payload.back === true ? null : "Undo"),
    window: "ten_minutes",
    record: ({ payload }, data) => {
      const kept = fileYesUsesIn(rec(data).kept);
      return payload.back !== true && kept.length ? { file_id: asText(payload.file_id), uses: kept } : null;
    },
    call: (kept) => ({
      route: "POST files/[id]/yes/back",
      params: { id: asText(kept.file_id) },
      body: { uses: fileYesUsesIn(kept.uses) },
    }),
    receipt: () => "Taken back",
  },
  open: ({ payload }) => {
    const id = asText(payload.file_id);
    return id ? contentRouteOf({ list: "library", view: "all", open: id }) : null;
  },
};
