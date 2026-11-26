/**
 * What a made post or a video holds beyond what a list reads (GET files/[id]): how a post was made, whether it can go on
 * Google and is there, its posts on Instagram, what was heard of a video, and the plan a video Ask made was drawn by. Read as
 * the file is opened, by the file's sheet and by Campaigns › Content's open piece alike.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  FileDto,
  FileMade,
  FilePosted,
  FileRecordDto,
  FileSound,
  PiecePlan,
  PieceTakeDownDto,
  PieceVersionsDto,
  PostDto,
} from "@chanlytics/contracts";
import type { PieceAdStands } from "@/server/content/ad-pictures";
import { fileVerbs } from "../verbs";

/**
 * How a post was made and where it is up, or what was heard of a video, read as its sheet opens: none of it is on the list a page
 * reads. Nothing is said until it comes. A video's is read again as what it is heard changes (its list's `sound_said`), and a
 * post's as the page it is open on says its posts moved (`moved`: a post that landed brings its See it without a reopen).
 */
/** A piece's standing for an ad, before its record is read or for another file's: none. */
const NO_AD: { stands: PieceAdStands | null } = { stands: null };

export function usePostRecord(file: FileDto, moved = "") {
  const [made, setMade] = useState<FileMade | null>(null);
  const [connected, setConnected] = useState(false);
  const [posted, setPosted] = useState<FilePosted | null>(null);
  const [sound, setSound] = useState<FileSound | null>(null);
  const [instagram, setInstagram] = useState<FileRecordDto["instagram"]>(null);
  // A Page's, where Facebook is offered to the workspace (pass 5); null where it is not, or from a server before it.
  const [facebook, setFacebook] = useState<FileRecordDto["facebook"]>(null);
  // Every post of it at every place, newest first: a piece read on its own (a link, the bell) knows its Google post too.
  const [posts, setPosts] = useState<PostDto[] | null>(null);
  // A video Ask made: the plan it was drawn by, which Campaigns › Content makes it again from.
  const [video, setVideo] = useState<PiecePlan | null>(null);
  // A made piece's standing for an ad, where Ads is on: what Content's Run as an ad says. Kept with the file it was read
  // for, so the piece beside never says this one's word while its own record is on its way.
  const [ad, setAd] = useState<{ id: string; stands: PieceAdStands | null } | null>(null);
  // A made piece's newest take-down (00682). Kept with the file it was read for.
  const [standing, setStanding] = useState<{ id: string; takeDown: PieceTakeDownDto | null } | null>(null);
  // A made video's versions (00708), kept with the file they were read for; none from a server before versions.
  const [versions, setVersions] = useState<{ id: string; version: PieceVersionsDto | null } | null>(null);
  // Read again when asked: a post on its way to Instagram says where it stands as it moves.
  const [asked, setAsked] = useState(0);
  const reread = useCallback(() => setAsked((n) => n + 1), []);
  const isPost = file.source === "made";
  const isVideo = file.kind === "video";
  const heard = isVideo ? `${file.media_status}|${file.sound_said ?? ""}` : "";
  useEffect(() => {
    if (!isPost && !isVideo) return undefined;
    let live = true;
    void fileVerbs.record(file.id).then((answer) => {
      if (!live || !answer.ok) return;
      const { data } = answer;
      setMade(data.made);
      setConnected(data.google?.connected ?? false);
      setPosted(data.google?.posted ?? null);
      setInstagram(data.instagram ?? null);
      setFacebook(data.facebook ?? null);
      // A server from before every place's posts were answered: Instagram's are all it knows.
      setPosts(data.posts ?? data.instagram?.posts ?? null);
      setSound(data.sound ?? null);
      setVideo(data.video?.plan ?? null);
      setAd({ id: file.id, stands: data.ad ?? null });
      setStanding({ id: file.id, takeDown: data.take_down ?? null });
      setVersions({ id: file.id, version: data.version ?? null });
    });
    return () => {
      live = false;
    };
  }, [file.id, isPost, isVideo, heard, asked, moved]);
  const adHere = ad?.id === file.id ? ad : NO_AD;
  const here = standing?.id === file.id ? standing : null;
  return {
    made,
    connected,
    posted,
    setPosted,
    sound,
    instagram,
    facebook,
    posts,
    video,
    ad: adHere.stands,
    /** Whether this file's record has been read: nothing is said of a place before it is. */
    read: here !== null,
    takeDown: here?.takeDown ?? null,
    version: versions?.id === file.id ? versions.version : null,
    reread,
  };
}
