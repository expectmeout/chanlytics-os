/**
 * A still from a video, in the open piece (the content redesign's stage 3): More › Save a still on a video that is ready, a
 * clip of the library or a video Ask made. Five moments across it, each the picture its still would be (GET files/[id]/still,
 * cut once by the edge and read from Storage after), one pressed, and Keep this still keeps it as a photo of the library
 * (POST files/[id]/still), which then opens, ready to make a post from. Its press stands in the pane's foot.
 */
import { useState } from "react";
import { STILL_WORDS as W, fileStillOf, stillMomentsOf, type FileDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Picture } from "../../files/photo";
import { fileVerbs } from "../../files/verbs";

/** A moment as a clock says it: `0:12`. */
const momentClockOf = (at: number) => `${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, "0")}`;

/** The panel's draft: the moment pressed, and what keeping it came to. `kept` hands over the new photo. */
export function useStill(file: FileDto, kept: (id: string) => void) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const moments = stillMomentsOf(file);
  const keep = async () => {
    if (at === null) return setProblem(W.pick);
    setBusy(true);
    setProblem(null);
    const r = await fileVerbs.keepStill(file.id, at);
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setOpen(false);
    kept(r.data.file_id);
  };
  return {
    file,
    open,
    at,
    busy,
    problem,
    moments,
    /** Offered only on a video that is ready, with a length to spread the moments over. */
    offered: moments.length > 0,
    canKeep: at !== null && !busy,
    choose: (moment: number) => setAt(moment),
    begin: () => {
      setProblem(null);
      setAt(moments[Math.floor(moments.length / 2)] ?? null);
      setOpen(true);
    },
    cancel: () => {
      setProblem(null);
      setOpen(false);
    },
    keep: () => void keep(),
  };
}

type StillDraft = ReturnType<typeof useStill>;

/** What the pane's body draws: what keeping does, and the moments, the one pressed marked. */
export function StillPick({ still }: { still: StillDraft }) {
  const { file, moments, at, problem } = still;
  return (
    <div className="cnv-still" data-testid="cnv-still">
      <p className="cnv-again-says">{W.says}</p>
      <div className="cnv-still-moments" role="group" aria-label={W.open}>
        {moments.map((moment) => (
          <Button
            key={moment}
            variant={moment === at ? "soft" : "quiet"}
            aria-pressed={moment === at}
            onClick={() => still.choose(moment)}
            className="cnv-still-moment"
            data-testid="cnv-still-moment"
          >
            <Picture
              src={fileStillOf(file.id, moment)}
              alt={W.moment(momentClockOf(moment))}
              name={momentClockOf(moment)}
            />
            <span className="cnv-count">{momentClockOf(moment)}</span>
          </Button>
        ))}
      </div>
      {problem ? (
        <p className="post-said" role="alert" data-testid="cnv-still-refused">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** What the pane's foot draws. */
export function StillActs({ still }: { still: StillDraft }) {
  return (
    <div className="files-acts" data-foot-acts="">
      <Button onClick={still.keep} disabled={!still.canKeep} data-testid="cnv-still-keep">
        {W.keep}
      </Button>
      <Button variant="quiet" onClick={still.cancel} disabled={still.busy} data-testid="cnv-still-cancel">
        {W.cancel}
      </Button>
    </div>
  );
}
