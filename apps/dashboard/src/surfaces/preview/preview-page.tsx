"use client";

// Chanlytics — a lead's own preview, before they sign up (decision 0079; the redesign of 17 November 2026).
//
// The page a cold email's link opens: AI's own home, made for the business. At the top their name, their mark or photo
// and the one filled act, Call it; under it what it knows, each fact with where it was read; then one conversation
// (what they asked, what it answered, a call, a thing they told it) and one field, with the questions it can answer
// standing on it. Make it mine waits at the top, quiet until they have tried it. Light unless the visitor's device is
// dark (contracts themeBootScript). Every word is contracts' (previews/words.ts); the page is drawn from its view model
// (previewPageOf), which the server builds from the row its token names.
//
// The page has three views of itself: the page, the call (call.tsx) and What it knows whole (knows.tsx). A stranger
// opens it from an email, on a phone, so nothing of the app's frame rides in: no sheet, no dialog, one document.
//
// The page's own script says it was drawn (previewVerbs.opened), once a load, so a mail scanner fetching the link is
// no open. While it is being set up it reads itself again every few seconds. Opened by its sender to look (`look`, the
// lead sheet's Open it), it counts nothing and presses nothing: what it has said, and what it knows.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LEAD_PREVIEW_WORDS as W, type PreviewPageVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Panel } from "../kit/panel/panel";
import { PvCall } from "./call";
import { PvFacts, PvHead, PvThree, PvTop } from "./head";
import { PvKnows } from "./knows";
import { PvDock, PvTalk } from "./talk";
import { useCall } from "./use-call";
import { useTalk } from "./use-talk";
import { previewVerbs } from "./verbs";
import "../kit/kit.css";
import "./preview.css";

/** How often a page that is being set up reads itself again. */
const BUILDING_EVERY_MS = 4_000;
/** AI's three on a page with one thing to say, in px. */
const ALONE_THREE_PX = 56;

/** A page with one thing to say: being set up, ended, someone's own now. */
function PvAlone({ vm }: { vm: PreviewPageVM }) {
  if (vm.state === "building")
    return (
      <Panel as="section" className="pv-alone" role="status" data-testid="pv-building">
        <PvThree live size={ALONE_THREE_PX} />
        <h1 className="pv-name">{W.building.title(vm.business)}</h1>
        <p className="pv-by">{W.building.sub}</p>
      </Panel>
    );
  if (vm.state === "taken")
    return (
      <Panel as="section" className="pv-alone" data-testid="pv-taken">
        <PvThree size={ALONE_THREE_PX} />
        <h1 className="pv-name">{W.taken.title(vm.business)}</h1>
        <Button variant="primary" size="touch" href="/login">
          {W.taken.signIn}
        </Button>
      </Panel>
    );
  return (
    <Panel as="section" className="pv-alone" data-testid="pv-ended">
      <PvThree size={ALONE_THREE_PX} />
      <h1 className="pv-name">{W.ended.title}</h1>
      <p className="pv-by">{W.ended.body}</p>
      <Button variant="primary" size="touch" href="/signup">
        {W.ended.start}
      </Button>
    </Panel>
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

/** The page open to try: its head, what it knows, its conversation and its field; or its call; or What it knows whole. */
function PvOpen({ vm, token, look }: { vm: PreviewPageVM; token: string; look: boolean }) {
  const talk = useTalk(vm, token);
  const call = useCall(token, vm.call_left_ms, talk.endedCall);
  const canCall = useCanCall();
  const [knows, setKnows] = useState(false);
  const foot = useRef<HTMLDivElement | null>(null);
  const told = [...vm.taught, ...talk.lines.flatMap((line) => (line.kind === "told" ? [line.text] : []))];

  // The newest line is brought into view as it arrives.
  const lines = talk.lines.length;
  useEffect(() => {
    if (lines > vm.turns.length) foot.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [lines, vm.turns.length]);

  if (call.phase !== "idle") return <PvCall vm={vm} call={call} />;
  if (knows) return <PvKnows vm={vm} told={told} token={token} look={look} onDone={() => setKnows(false)} />;
  return (
    <>
      {look ? (
        <p className="pv-quiet pv-look" role="note" data-testid="pv-look">
          {W.look}
          {vm.did ? ` ${vm.did}.` : ""}
        </p>
      ) : (
        <PvTop vm={vm} token={token} leads={talk.leads} started={talk.lines.length > 0} />
      )}
      <div className="pv-cols">
        <div className="pv-col">
          <PvHead vm={vm} call={call} canCall={canCall} leads={talk.leads} look={look} />
          <PvFacts rows={vm.knows} onOpen={() => setKnows(true)} />
        </div>
        <div className="pv-col">
          <PvTalk vm={vm} talk={talk} />
          {look ? null : (
            <>
              {talk.lines.length ? null : <p className="pv-quiet pv-kept">{W.kept}</p>}
              <PvDock talk={talk} call={call} canCall={canCall} token={token} />
            </>
          )}
          <div ref={foot} />
        </div>
      </div>
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
