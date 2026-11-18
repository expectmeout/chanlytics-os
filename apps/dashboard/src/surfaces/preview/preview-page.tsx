"use client";

// Chanlytics — a lead's own preview, before they sign up (decision 0079; the redesign of 17 November 2026, drawn as its
// canvas draws it, "Their preview, redesigned").
//
// The page a cold email's link opens: AI's own home, made for the business, on the app's own glass (the look's lit
// ground, its panes and its control layer). At the top their name, their mark or photo and the one filled act, Call it;
// under it what it knows, each fact with where it was read; then one conversation (what they asked, what it answered,
// a call, a thing they told it) and one field, a capsule of glass, with the questions it can answer standing on it. On
// a phone it is one screen on the lit ground, the field at its foot; on a desk two panes, their card and the
// conversation, each the window's height. Make it mine waits at the top, quiet until they have tried it, with the press
// that puts the page in light or dark beside it: it opens as the visitor's device is set, or as they last put it
// (contracts themeBootScript). Every word is contracts' (previews/words.ts); the page is
// drawn from its view model (previewPageOf), which the server builds from the row its token names.
//
// The page has two views of itself, the page and the call (call.tsx), and one sheet over it on a phone: What it knows
// whole (knows-sheet.tsx), the kit's own, loaded as See all is first pressed. A stranger opens the page from an email,
// on a phone, so nothing of the app's frame rides in with its first load.
//
// The page's own script says it was drawn (previewVerbs.opened), once a load, so a mail scanner fetching the link is
// no open. While it is being set up it reads itself again every few seconds. Opened by its sender to look (`look`, the
// lead sheet's Open it), it counts nothing and presses nothing: what it has said, and what it knows.

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LEAD_PREVIEW_WORDS as W, type PreviewPageVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { PvCall } from "./call";
import { PvFacts, PvHead, PvThree, PvTop } from "./head";
import { PvSideKnows } from "./knows";
import { PvDock, PvTalk } from "./talk";
import { useCall } from "./use-call";
import { useHear } from "./use-hear";
import { useTalk } from "./use-talk";
import { previewVerbs } from "./verbs";
import "../kit/kit.css";
import "./preview.css";

/** What it knows whole, a sheet over the page: loaded with its first press, so a first load carries no sheet. */
const PvKnowsSheet = lazy(() => import("./knows-sheet"));

/** How often a page that is being set up reads itself again. */
const BUILDING_EVERY_MS = 4_000;
/** AI's three on a page with one thing to say, in px. */
const ALONE_THREE_PX = 64;

/** A page with one thing to say: being set up, while its rows are drawn in; ended; someone's own now. */
function PvAlone({ vm }: { vm: PreviewPageVM }) {
  if (vm.state === "building")
    return (
      <section className="pv-alone" role="status" data-testid="pv-building">
        <PvThree live size={ALONE_THREE_PX} />
        <h1 className="pv-alone-title">{W.building.title(vm.business)}</h1>
        <p className="pv-ready">{W.building.sub}</p>
        <span className="pv-skel" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </section>
    );
  if (vm.state === "taken")
    return (
      <section className="pv-alone" data-testid="pv-taken">
        <PvThree size={ALONE_THREE_PX} />
        <h1 className="pv-alone-title">{W.taken.title(vm.business)}</h1>
        <Button variant="primary" size="touch" className="pv-go" href="/login">
          {W.taken.signIn}
        </Button>
      </section>
    );
  return (
    <section className="pv-alone" data-testid="pv-ended">
      <PvThree size={ALONE_THREE_PX} />
      <h1 className="pv-alone-title">{W.ended.title}</h1>
      <p className="pv-ready">{W.ended.body}</p>
      <Button variant="primary" size="touch" className="pv-go" href="/signup">
        {W.ended.start}
      </Button>
    </section>
  );
}

/** Whether this browser can give a microphone: a mail app's own sometimes cannot, and the page then leads with its field. */
function useCanCall(): boolean {
  const [can, setCan] = useState(true);
  useEffect(() => {
    setCan(typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function");
  }, []);
  return can;
}

/** The page open to try: its head, what it knows, its conversation and its field; or its call. */
function PvOpen({ vm, token, look }: { vm: PreviewPageVM; token: string; look: boolean }) {
  const talk = useTalk(vm, token);
  // Back from a call: the page is drawn arriving, as the call's screen was.
  const [back, setBack] = useState(false);
  const call = useCall(token, vm.call_left_ms, (ended) => {
    setBack(true);
    talk.endedCall(ended);
  });
  const canCall = useCanCall();
  // Their greeting, heard with no microphone asked. A call takes the page's place, and the greeting gives way to it.
  const hear = useHear(token, vm.voice);
  const calling = call.phase !== "idle";
  const stopHearing = hear.stop;
  useEffect(() => {
    if (calling) stopHearing();
  }, [calling, stopHearing]);
  // What it knows whole: drawn from its first press on, so it leaves as a sheet leaves.
  const [knows, setKnows] = useState<"never" | "open" | "closed">("never");
  const foot = useRef<HTMLDivElement | null>(null);
  const told = [...vm.taught, ...talk.lines.flatMap((line) => (line.kind === "told" ? [line.text] : []))];
  // Whether their head is on screen: until it has scrolled away the bar does not say their name a second time.
  const [headSeen, setHeadSeen] = useState(true);

  // The newest line is brought into view as it arrives, and a call's card as it is written under its line; a page
  // opened on what an earlier visit left stays at its top.
  const lines = talk.lines.length;
  const cards = talk.lines.filter((line) => line.kind === "call" && line.got).length;
  const opened = useRef(lines);
  useEffect(() => {
    if (lines > opened.current) foot.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines, cards]);

  if (call.phase !== "idle") return <PvCall vm={vm} call={call} />;
  return (
    <>
      {look ? (
        <p className="pv-lookbar" role="note" data-testid="pv-look">
          <Icon name="eye" size={17} />
          <span>{W.look}</span>
        </p>
      ) : (
        <PvTop vm={vm} token={token} leads={talk.leads} who={talk.lines.length > 0 && !headSeen} />
      )}
      <div className="pv-cols" data-back={back || undefined}>
        <aside className="pv-side">
          <PvHead
            vm={vm}
            call={call}
            hear={hear}
            canCall={canCall}
            leads={talk.leads}
            look={look}
            onSeen={setHeadSeen}
          />
          <PvFacts rows={vm.knows} onOpen={look ? null : () => setKnows("open")} />
          <PvSideKnows vm={vm} token={token} look={look} />
        </aside>
        <section className="pv-chat">
          <div className="pv-chat-lines">
            <PvTalk vm={vm} talk={talk} />
            <div className="pv-foot" ref={foot} />
          </div>
          {look ? null : (
            <>
              {talk.lines.length ? null : <p className="pv-kept">{W.kept}</p>}
              <PvDock talk={talk} call={call} canCall={canCall} token={token} />
            </>
          )}
        </section>
      </div>
      {knows === "never" ? null : (
        <Suspense fallback={null}>
          <PvKnowsSheet open={knows === "open"} onClose={() => setKnows("closed")} vm={vm} told={told} token={token} />
        </Suspense>
      )}
    </>
  );
}

export function PreviewPage({ vm, token, look = false }: { vm: PreviewPageVM; token: string; look?: boolean }) {
  const router = useRouter();
  const said = useRef(false);
  const open = vm.state === "ready" || vm.state === "spent";

  useEffect(() => {
    if (!open || look || said.current) return;
    said.current = true;
    void previewVerbs.opened(token);
  }, [open, look, token]);

  useEffect(() => {
    if (vm.state !== "building") return;
    const again = setInterval(() => router.refresh(), BUILDING_EVERY_MS);
    return () => clearInterval(again);
  }, [vm.state, router]);

  return (
    <main className="pv-page" data-testid="preview-page" data-state={vm.state}>
      {open ? <PvOpen vm={vm} token={token} look={look} /> : <PvAlone vm={vm} />}
    </main>
  );
}
