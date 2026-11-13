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
  PostDto,
} from "@chanlytics/contracts";
import { fileVerbs } from "./verbs";

/**
 * How a post was made and where it is up, or what was heard of a video, read as its sheet opens: none of it is on the list a page
 * reads. Nothing is said until it comes. A video's is read again as what it is heard changes (its list's `sound_said`), and a
 * post's as the page it is open on says its posts moved (`moved`: a post that landed brings its See it without a reopen).
 */
export function usePostRecord(file: FileDto, moved = "") {
  const [made, setMade] = useState<FileMade | null>(null);
  const [connected, setConnected] = useState(false);
  const [posted, setPosted] = useState<FilePosted | null>(null);
  const [sound, setSound] = useState<FileSound | null>(null);
  const [instagram, setInstagram] = useState<FileRecordDto["instagram"]>(null);
  // Every post of it at every place, newest first: a piece read on its own (a link, the bell) knows its Google post too.
  const [posts, setPosts] = useState<PostDto[] | null>(null);
  // A video Ask made: the plan it was drawn by, which Campaigns › Content makes it again from.
  const [video, setVideo] = useState<PiecePlan | null>(null);
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
      // A server from before every place's posts were answered: Instagram's are all it knows.
      setPosts(data.posts ?? data.instagram?.posts ?? null);
      setSound(data.sound ?? null);
      setVideo(data.video?.plan ?? null);
    });
    return () => {
      live = false;
    };
  }, [file.id, isPost, isVideo, heard, asked, moved]);
  return { made, connected, posted, setPosted, sound, instagram, posts, video, reread };
}
