/**
 * The Week (00706; the content loop PRD's 21.2; the approved boards, Week 1-12, canvas 1795421968-f15f): Campaigns ›
 * Content's first tab where the workspace plans its weeks, this week as one list. Its head says the week's size and days,
 * how often it goes up and where, and holds its one act (Approve the week, Resume, Plan this week); the rows that need the
 * owner stand apart at the top with their one fix; what to film sits at the foot. A row opens its piece: the made one in
 * Content's own viewer, one not made yet as planned (planned.tsx). What it says is contracts weekViewOf's.
 *
 * While AI drafts the week, or makes what was approved, nothing tells the page: it asks again, a few seconds apart, and
 * rests once nothing moves (as Made does while a video is made).
 */
import "./week.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONTENT_LIBRARY_ROUTE,
  SECOND_MS,
  WEEK_WORDS as W,
  weekMoving,
  weekViewOf,
  weekRowsOf,
  type WeekPageDto,
  type WeekRow,
  type WeekView,
} from "@chanlytics/contracts";
import { approveTheWeek, planThisWeek, pressSlot } from "@/bridge/verbs/week";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { navigate, refreshSurface, type FrameFlash } from "../../../frame-verbs";
import { AskLooking } from "../../../files/looking";
import { autonomyVerbs } from "../../../settings/autonomy/verbs";
import { useSurface } from "../../../use-surface";
import { WeekPlanned } from "./planned";
import { FilmRow, WeekRowView } from "./rows";

/** How often the Week asks again while AI drafts it or makes what was approved, and how many times before it rests. */
const WEEK_FOLLOW_MS = 5 * SECOND_MS;
const WEEK_FOLLOWS_AT_MOST = 120;

function useAsksWhileMoving(moving: boolean): void {
  const asks = useRef(0);
  useEffect(() => {
    if (!moving) {
      asks.current = 0;
      return undefined;
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      asks.current += 1;
      if (asks.current > WEEK_FOLLOWS_AT_MOST) clearInterval(timer);
      else void refreshSurface("content_week");
    }, WEEK_FOLLOW_MS);
    return () => clearInterval(timer);
  }, [moving]);
}

/** Where a row's fix takes the owner, where it is a page: the offers in Settings › Content, a place to connect. */
const FIX_PAGES = { offer: "settings/content", connect: "settings/integrations" } as const;

/** The head: what week, its size or where it stands, how often it goes up, and its one act. */
function WeekHead({ view, busy, onAct }: { view: WeekView; busy: boolean; onAct: () => void }) {
  const act =
    view.act === "approve" ? W.approve : view.act === "resume" ? W.resume : view.act === "plan" ? W.plan : null;
  return (
    <div className="cwk-head" data-state={view.state} data-testid="cwk-head">
      <small>
        {view.moving ? (
          <span className="cwk-live">
            <AskLooking looking />
          </span>
        ) : null}
        {view.kicker}
      </small>
      <h3>{view.title}</h3>
      {view.line ? <p>{view.line}</p> : null}
      {act ? (
        <div className="cwk-acts">
          <Button variant="primary" onClick={onAct} disabled={busy} data-testid="cwk-act">
            {act}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Nothing connected: what will be here, then the one act (Google offered beside it, the quiet way). */
function WeekFirstOpen() {
  return (
    <div className="cwk-first" data-testid="cwk-first">
      <Icon name="three" size={26} />
      <h3>{W.empty.unconnected.title}</h3>
      <p>{W.empty.unconnected.line}</p>
      <div className="cwk-acts">
        <Button variant="primary" onClick={() => navigate("settings/integrations")}>
          {W.connect}
        </Button>
        <Button variant="quiet" onClick={() => navigate("settings/integrations")}>
          {W.connectGoogle}
        </Button>
      </div>
    </div>
  );
}

/**
 * The Week's presses, for its head, its rows and a row opened beside it: each says what it did or why not, and none runs
 * twice at once. A fix that is a page goes there; Open opens the row; Try again and a made reel's Approve are the row's
 * own presses, made for each of its places.
 */
export function useWeekPresses(flash: (f: FrameFlash) => void, onOpen: (row: WeekRow) => void) {
  const [busy, setBusy] = useState(false);
  const tell = (answer: { ok: boolean; message?: string }, done?: string) => {
    if (!answer.ok) flash({ tone: "danger", msg: <>{answer.message}</> });
    else if (done) flash({ msg: <>{done}</> });
  };
  const run = (press: () => Promise<void>) => {
    setBusy(true);
    void press().finally(() => setBusy(false));
  };
  const onAct = (view: WeekView, dto: WeekPageDto) =>
    run(async () => {
      const plan = dto.week.plan;
      if (view.act === "approve" && plan) {
        const answer = await approveTheWeek({ plan_id: plan.id, week_of: dto.week_of });
        tell(
          answer,
          answer.ok && answer.data.left_out.length ? W.leftOut(answer.data.left_out.length) : W.approvedToast,
        );
      } else if (view.act === "resume") tell(await autonomyVerbs.stopAll(false));
      else if (view.act === "plan") tell(await planThisWeek());
    });
  const onFix = (row: WeekRow) => {
    const fix = row.fix;
    if (!fix) return;
    if (fix.act === "offer" || fix.act === "connect") return navigate(FIX_PAGES[fix.act]);
    if (fix.act === "open") return onOpen(row);
    run(async () => {
      // A reel's video goes up where Instagram takes it; Try again makes anew each of its places not made, never one that
      // went up (its post is the post's).
      const slots =
        fix.act === "post" ? row.slots.filter((s) => s.kind === "reel") : row.slots.filter((s) => !s.post_id);
      for (const slot of slots) tell(await pressSlot(slot.id, fix.act === "post" ? "post" : "approved"));
    });
  };
  return { busy, onAct, onFix };
}

export function ContentWeek({
  openId,
  onOpen,
  flash,
}: {
  /** The creative open beside the list, or its made piece's file. */
  openId: string | null;
  onOpen: (row: WeekRow) => void;
  flash: (f: FrameFlash) => void;
}) {
  const held = useSurface("content_week");
  const dto = held?.dto;
  const view = useMemo(() => (dto ? weekViewOf(dto, Date.now()) : null), [dto]);
  useAsksWhileMoving(!!view && weekMoving(view));
  const { busy, onAct: act, onFix } = useWeekPresses(flash, onOpen);
  if (!view || !dto) return null;
  const onAct = () => act(view, dto);
  if (view.state === "unconnected") return <WeekFirstOpen />;
  return (
    <div className="cwk" data-testid="content-week">
      <WeekHead view={view} busy={busy} onAct={onAct} />
      {view.groups.map((group) => (
        <section key={group.name} className="cwk-group" data-tone={group.tone || undefined}>
          <h4>
            {group.name}
            <em>{group.rows.length}</em>
          </h4>
          {group.rows.map((row) => (
            <WeekRowView
              key={row.creative}
              row={row}
              open={openId === row.creative || (!!row.opens && openId === row.opens)}
              onOpen={onOpen}
              onFix={onFix}
              busy={busy}
            />
          ))}
        </section>
      ))}
      {view.film.length ? (
        <section className="cwk-group">
          <h4>
            {view.filmHead}
            <em>{view.film.length}</em>
          </h4>
          {view.film.map((ask) => (
            <FilmRow key={ask.what} what={ask.what} why={ask.why} />
          ))}
          {view.state === "nothing" ? (
            <div className="cwk-acts">
              {/* The Library's Add: AI matches what comes in to what it asked for. */}
              <Button variant="primary" onClick={() => navigate(CONTENT_LIBRARY_ROUTE)} data-testid="cwk-add">
                <Icon name="plus" size={14} />
                {W.add}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** A row of the Week not made yet, open beside the list (planned.tsx), as the week now reads; nothing once it is gone. */
export function WeekPlannedOpen({
  creative,
  onClose,
  flash,
}: {
  creative: string;
  onClose: () => void;
  flash: (f: FrameFlash) => void;
}) {
  const dto = useSurface("content_week")?.dto;
  const { busy, onFix } = useWeekPresses(flash, () => undefined);
  const row = dto ? weekRowsOf(dto).find((r) => r.creative === creative) : undefined;
  if (!dto || !row) return null;
  return <WeekPlanned row={row} zone={dto.zone} onClose={onClose} onFix={onFix} busy={busy} />;
}
