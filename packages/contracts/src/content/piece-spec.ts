/**
 * A video made from a business's clips, as a card (decision 0122). It shows a storyboard, the first frame of each moment with the
 * opening words where the video will show them, and asks for one press: Make it starts the job that draws it, and the video
 * lands in Campaigns › Content, under Made. Whoever may delete a file may press it, as a post's card. There is no Undo: a
 * press spends the drawing, and a video not wanted is deleted where every file is.
 */
import { pieceWordsIn } from "./piece-words";
import { piecePlanOf } from "./pieces";
import { asText, rec, type ProposalSpecAboveOperator } from "../ask/proposals/spec";
import { CONTENT_ROUTE } from "./address";

export const pieceSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "make a video",
  gate: "settings",
  // The card's own id is the press's key: pressed twice, it is one video (00613 piece_begin).
  commit: ({ id, payload }) => ({ route: "POST files/video", body: { ...payload, key: id } }),
  receipt: (p) => pieceWordsIn(piecePlanOf(p.payload).language).making,
  made: (_p, data) => asText(rec(data).piece_id) || null,
  open: () => CONTENT_ROUTE,
};
