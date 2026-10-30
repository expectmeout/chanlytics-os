/**
 * Many leads at once (the lead-to-sequence canvas's DeskBulk, "Big lists, same road"): the selection bar's Add, to the
 * search's pick, or from ▴ to any sequence the picker lists or a new one: the same picker and New the lead sheet's are
 * (sheet/picker.tsx), named by how many. The add door takes those that can join and leaves the rest selected, saying so;
 * Later puts them all off in this pass of the search. One verb each, as the sheet's: sequence_add and sequence_make.
 */
import { useState } from "react";
import {
  LEAD_SHEET_WORDS as W,
  leadPickerRowsOf,
  type LeadPickerRowVM,
  type ReachOutAddDto,
} from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/legacy-bridge/verbs/commit";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Popover } from "../../kit/popover/popover";
import { gate, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { SheetNew, SheetPicker, type NewStart } from "../sheet/picker";
import type { LeadAim } from "../sheet/use-aim";
import { laterLead } from "../surface";

interface BulkAddProps {
  /** The leads chosen and shown. */
  ids: string[];
  aim: LeadAim;
  /** The search they are seen in: Later is its own, and Ask's draft for New writes from it. */
  search: { id: string; name: string } | null;
  flash: (f: LegacyFlash) => void;
  /** What stays selected after: those the add left out, or none. */
  onDone: (keep: string[]) => void;
  busy: boolean;
}

/** The leads an add left out: they stay selected, so they can be dealt with next. */
const leftOutOf = (data: unknown): string[] => {
  const d = data && typeof data === "object" ? (data as Partial<ReachOutAddDto>) : {};
  return Array.isArray(d.leads) ? d.leads.map((l) => l.lead_id) : [];
};

export function useBulkAdd(p: BulkAddProps) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"pick" | "new">("pick");
  const n = p.ids.length;
  const target = p.aim.target;
  const rows = p.aim.targets ? leadPickerRowsOf(p.aim.targets, target ? target.rootId : null) : null;
  const run = async (fn: () => Promise<void>) => {
    if (busy || p.busy || !n) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  /** Add them to a sequence, which becomes the pick; those that can't join stay selected. */
  const addTo = (to: { id: string; name: string; state: string }) =>
    run(async () => {
      const r = await commitVerb("sequence_add", {
        sequence_id: to.id,
        lead_ids: p.ids,
        name: to.name,
        draft: to.state === "draft",
      });
      if (!r.ok) return p.flash(refusalToast(r));
      const left = leftOutOf(r.data);
      const kept = r.undo;
      p.flash({
        tone: "ok",
        msg: left.length ? `${r.receipt} · ${W.bulk.stay(left.length)}` : r.receipt,
        undo: kept
          ? async () => {
              const u = await undoVerb("sequence_add", kept);
              p.flash(u.ok ? { tone: "ok", msg: u.receipt } : refusalToast(u));
            }
          : null,
      });
      if (!target || target.rootId !== to.id) p.aim.choose(to.id);
      p.onDone(left);
    });

  /** New: a draft by name holding them all, the pick from now. */
  const make = (name: string, start: NewStart) =>
    run(async () => {
      let asked: { steps: unknown; as_drafted: unknown } | null = null;
      if (start.kind === "ask") {
        const d = await reachOuts.draftLeads({ name, lead_ids: p.ids, search_name: p.search?.name ?? null });
        if (!d.ok) return p.flash(refusalToast(d, "Ask could not write a draft"));
        asked = d.data;
      }
      const r = await commitVerb("sequence_make", {
        first: {
          starts: "leads",
          name,
          lead_ids: p.ids,
          ...(start.kind === "copy" ? { from: start.from } : {}),
          // Ask's words, and what Ask drafted, which the make keeps beside them (decision 0078 step 2).
          ...(asked ? { steps: asked.steps, as_drafted: asked.as_drafted } : {}),
          ...(p.search ? { aim_search_id: p.search.id } : {}),
        },
        start: false,
      });
      if (!r.ok) return p.flash(refusalToast(r));
      p.flash({ tone: "ok", msg: r.receipt });
      if (r.made) p.aim.choose(r.made);
      p.onDone([]);
    });

  /** Later, each in this pass of the search. */
  const later = () =>
    run(async () => {
      const search = p.search;
      if (!search) return;
      let done = 0;
      for (const id of p.ids) {
        const r = await laterLead(search.id, id);
        if (!r.ok) {
          p.flash(refusalToast(r, "That did not go through"));
          break;
        }
        done += 1;
      }
      if (done) p.flash({ tone: "ok", msg: W.bulk.laterDone(done) });
      p.onDone(p.ids.slice(done));
    });

  return { n, busy: busy || p.busy, step, setStep, target, rows, addTo, make, later };
}
export type BulkAdd = ReturnType<typeof useBulkAdd>;

/** The picker, or New, for many: what ▴ opens. */
export function BulkChoose({
  b,
  search,
  onClose,
}: {
  b: BulkAdd;
  search: { name: string } | null;
  onClose: () => void;
}) {
  const suggest = (() => {
    const name = search?.name.trim() ?? "";
    if (!name) return null;
    return (b.rows ?? []).some((r) => r.name.trim().toLowerCase() === name.toLowerCase()) ? null : name;
  })();
  return b.step === "new" ? (
    <SheetNew
      who={{ count: b.n }}
      copies={b.rows ?? []}
      canAsk={!!search}
      suggest={suggest}
      busy={b.busy}
      drafting={false}
      onCreate={(name, start) => {
        void b.make(name, start).then(onClose);
      }}
      onBack={() => b.setStep("pick")}
    />
  ) : (
    <SheetPicker
      who={{ count: b.n }}
      rows={b.rows}
      canJoin={null}
      busy={b.busy}
      onPick={(row: LeadPickerRowVM) => {
        void b.addTo(row).then(onClose);
      }}
      onNew={() => b.setStep("new")}
      onBack={onClose}
    />
  );
}

/** A desk's Add: to the pick at once, ▴ for the picker; with no pick, the whole press opens it. */
export function BulkAddDesk({ b, search }: { b: BulkAdd; search: { name: string } | null }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    b.setStep("pick");
  };
  const t = b.target;
  const more = (
    <Button
      variant="primary"
      size="sm"
      iconOnly
      className="ld-bulk-more"
      disabled={b.busy}
      aria-label={W.bulk.choose}
      data-testid="leads-bulk-choose"
      {...gate("approve", "add these leads to a sequence")}
    >
      <Icon name="chevron-up" size={12} />
    </Button>
  );
  return (
    <span className="ld-bulk-add">
      {t ? (
        <Button
          variant="primary"
          size="sm"
          disabled={b.busy}
          onClick={() => void b.addTo({ id: t.rootId, name: t.name, state: t.row.state })}
          data-testid="leads-bulk-add"
          {...gate("approve", "add these leads to a sequence")}
        >
          <Icon name="plus" size={12} /> {W.bulk.addTo(b.n, t.name)}
        </Button>
      ) : null}
      <Popover
        open={open}
        onOpenChange={(on) => (on ? setOpen(true) : close())}
        label={W.bulk.choose}
        align="end"
        trigger={
          t ? (
            more
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={b.busy}
              data-testid="leads-bulk-add"
              {...gate("approve", "add these leads to a sequence")}
            >
              <Icon name="plus" size={12} /> {W.bulk.addAny(b.n)}
            </Button>
          )
        }
      >
        {open ? (
          <div className="lw ld-bulk-pick" data-testid="leads-bulk-picker">
            <BulkChoose b={b} search={search} onClose={close} />
          </div>
        ) : null}
      </Popover>
    </span>
  );
}
