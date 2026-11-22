import "server-only";
import { z } from "zod";
import {
  PLACE_CAPABILITIES,
  TAKE_DOWN_WORDS,
  capabilityStands,
  fileSaidOf,
  takeDownWillOf,
} from "@chanlytics/contracts";
import { readFilePosts } from "../../../../posts/record";
import { load } from "../../../../shared/reader";
import { filesNamedForAsk } from "../../../../readers/files";
import { defineAct, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { approvalWords, propose, refuse } from "../../context/context";
import { filesNamed } from "../../read/files";

/**
 * A made piece taken down, asked of AI (00692; the content loop PRD's 8.3 and 12.1 act/take_down). The act never acts: it
 * finds the piece, reads where it is up, and makes the card, which says what each place will be asked before the press,
 * as the piece's own Take down does. The press goes through the same door (DELETE files/[id]/posts): each place is asked,
 * and a post is down only once its place said so. Refused in a sentence where nothing of it is up or waiting.
 */

const takeDownInput = z.object({
  file: z.string().min(1).max(120).describe("The post's or the video's name, as files says it."),
});

async function takeDownOutcome(toolContext: ToolContext, input: { file: string }): Promise<ProposalOutcome> {
  const { files } = (await load(toolContext.rc, filesNamedForAsk, { names: [input.file] })).data;
  const file = filesNamed(files, [input.file]).found.at(0) ?? null;
  if (!file) return refuse(`no file named ${input.file}; names come from files with action list`);
  if (file.source !== "made")
    return refuse("only a post or a video made here is posted from here, so only one is taken down");
  const posts = await readFilePosts(toolContext.ctx, toolContext.tenantId, file.id);
  const will = takeDownWillOf(posts, (place) => capabilityStands(PLACE_CAPABILITIES[place].remoteDelete), Date.now());
  if (will.length === 0) return refuse("nothing of it is up or waiting to go up. Say so in a few words");
  const name = fileSaidOf(file.name);
  return propose({
    kind: "take_down",
    title: TAKE_DOWN_WORDS.title(name),
    summary: will.map((line) => `${line.name}: ${line.will}`).join(" · "),
    payload: { file_id: file.id, file: file.name },
  });
}

export const takeDownAct = defineAct({
  name: "propose_take_down",
  description: `Take a made post or video down from everywhere it is up, and stop what of it still waits to go up. The card says what each place will be asked; each place is asked on its press and says when it is gone. It cannot be undone: taken down, it is posted again as a new post. ${approvalWords("take_down")}.`,
  kind: "take_down",
  input: takeDownInput,
  label: "Taking a post down",
  build: takeDownOutcome,
});
