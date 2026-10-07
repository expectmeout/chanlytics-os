/**
 * Chanlytics — Connections › Email › Domains you send from (Reach out; moved from legacy/pages/sending-domains.jsx,
 * decision 0015 step 11). Split out of integrations-real.jsx, whose Email row draws it: one file per concern, as
 * record-form.tsx is.
 *
 * `SendingDomains` keeps its state and its early returns; a domain's row, its buttons, its acts and the foot are plain
 * functions that return the JSX, called and not drawn, so the tree is the one the JSX drew. `SendingDomainRecords` and
 * `SendingDomainAdd` are components, as they were.
 */
import { Fragment, useState } from "react";
import type { DomainRecordRow, EmailSetupDto, SendingDomainDto, SendingDomainWords } from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { canDo, gate, gateTitle, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { sendingDomains } from "./domains";

const DOMAINS = sendingDomains;

type Flash = (f: LegacyFlash) => void;

/** The domain Add and Check answer with: both doors answer `{ domain }`, the domain as the page is told of it. */
function carriesDomain(data: unknown): data is { domain: SendingDomainDto } {
  if (typeof data !== "object" || data === null || !("domain" in data)) return false;
  const d = data.domain;
  return typeof d === "object" && d !== null && "host" in d && "state" in d;
}

/** The domain a door answered with; a door that answers without one is a break in the contract, not a refusal. */
function answeredDomain(data: unknown): SendingDomainDto {
  if (!carriesDomain(data)) throw new TypeError("The door answered without the domain.");
  return data.domain;
}

interface RecordsProps {
  d: SendingDomainDto;
  flash: Flash;
}

const SendingDomainRecords = ({ d, flash }: RecordsProps) => {
  // Copy, or, where the browser gives no clipboard, the words selected so a person can copy them by hand.
  const copy = (value: string, id: string) => {
    const byHand = () => {
      const node = document.getElementById(id);
      if (node && window.getSelection && document.createRange) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      flash({ tone: "danger", msg: <>Couldn't copy. It's selected: copy it by hand</> });
    };
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(() => flash({ msg: <>Copied</> }), byHand);
    else byHand();
  };
  const rows = DOMAINS.recordRows(d);
  const idOf = (r: DomainRecordRow, part: string) => `rec-${d.id}-${part}-${r.key}`;
  return (
    <div className="set-records" data-testid={`domain-records-${d.host}`}>
      <p className="set-records-intro">
        {DOMAINS.recordsIntro(d.host)} <span className="dim">{DOMAINS.registrarHint(d.host)}</span>
      </p>
      <div className="set-records-table" role="table" aria-label={`The records for ${d.host}`}>
        <div className="set-records-row set-records-head" role="row">
          <span role="columnheader">Record</span>
          <span role="columnheader">Name</span>
          <span role="columnheader">Value</span>
        </div>
        {rows.map((r) => (
          <div className="set-records-row" role="row" key={r.key}>
            <span role="cell" className="k">
              <span
                className="rec-dot"
                role="img"
                data-found={r.found ? "yes" : "no"}
                title={r.found ? "Found" : "Not found yet"}
                aria-label={r.found ? "Found" : "Not found yet"}
                {...(r.found ? { "data-testid": `domain-found-${r.key}` } : {})}
              />
              {r.kind}
              <span className="ty-inline">
                {" · "}
                {r.type}
                {r.priority != null ? ` · ${r.priority}` : ""}
              </span>
            </span>
            <span role="cell" className="n">
              <code id={idOf(r, "name")}>{r.name}</code>
              <button
                type="button"
                className="cl-bucket-link rec-copy"
                onClick={() => copy(r.name, idOf(r, "name"))}
                aria-label={`Copy the ${r.kind} name`}
                data-testid={`domain-copy-name-${r.key}`}
              >
                Copy
              </button>
            </span>
            <span role="cell" className="v">
              <code id={idOf(r, "value")}>{r.value}</code>
              <button
                type="button"
                className="cl-bucket-link rec-copy"
                onClick={() => copy(r.value, idOf(r, "value"))}
                aria-label={`Copy the ${r.kind} value`}
                data-testid={`domain-copy-value-${r.key}`}
              >
                Copy
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface AddProps {
  mailDomain: string | null;
  fromName: string;
  flash: Flash;
  onClose: () => void;
}

/** What is wrong with each of the three boxes, in the owner's words; a box with nothing wrong has no key. */
type AddProblems = { host?: string; local?: string; name?: string };

const SendingDomainAdd = ({ mailDomain, fromName, flash, onClose }: AddProps) => {
  const [host, setHost] = useState("");
  const [local, setLocal] = useState("");
  const [name, setName] = useState(fromName || "");
  const [problems, setProblems] = useState<AddProblems>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const found: AddProblems = {};
    const h = DOMAINS.whyNotAHost(host, mailDomain);
    const l = DOMAINS.whyNotAFromLocal(local);
    const n = DOMAINS.whyNotAFromName(name);
    if (h) found.host = h;
    if (l) found.local = l;
    if (n) found.name = n;
    setProblems(found);
    if (h || l || n) return;
    setBusy(true);
    const r = await DOMAINS.add({ host, fromLocal: local, fromName: name });
    setBusy(false);
    // A host taken, or a sixth domain: refusals the owner causes by what they typed belong under the box.
    if (!r.ok) {
      if (r.code === "conflict" || r.code === "validation") setProblems({ host: r.message });
      else flash(refusalToast(r, "Not added"));
      return;
    }
    flash({
      msg: <>{answeredDomain(r.data).host} is added — publish its records at your registrar, then press Check</>,
    });
    onClose();
  };
  const shownHost = host.trim().toLowerCase() || "yourdomain.com";
  return (
    <div className="set-row set-row-stack biz set-domain-add" data-testid="domain-add">
      <div className="biz-fields">
        <label className="biz-field" data-testid="domain-host">
          <span className="biz-label">The domain you'll send from</span>
          <input
            className={`biz-input${problems.host ? " biz-bad" : ""}`}
            value={host}
            placeholder="getyourbusiness.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
            aria-invalid={problems.host ? true : undefined}
            aria-describedby={problems.host ? "domain-host-problem" : "domain-host-hint"}
            onChange={(e) => setHost(e.target.value)}
          />
          {problems.host ? (
            <FieldError id="domain-host-problem" message={problems.host} testid="domain-host-problem" />
          ) : (
            <span className="biz-hint" id="domain-host-hint">
              A domain of its own is safest, like get{"<business>"}.com: your everyday email stays out of it.
            </span>
          )}
        </label>
        <label className="biz-field" data-testid="domain-local">
          <span className="biz-label">Who it comes from</span>
          <span className="biz-affix">
            <input
              className={`biz-input${problems.local ? " biz-bad" : ""}`}
              value={local}
              placeholder="sam"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              aria-invalid={problems.local ? true : undefined}
              aria-describedby={problems.local ? "domain-local-problem" : undefined}
              onChange={(e) => setLocal(e.target.value)}
            />
            <span className="biz-affix-text">@{shownHost}</span>
          </span>
          {problems.local ? (
            <FieldError id="domain-local-problem" message={problems.local} testid="domain-local-problem" />
          ) : null}
        </label>
        <label className="biz-field" data-testid="domain-name">
          <span className="biz-label">The name people see beside it</span>
          <input
            className={`biz-input${problems.name ? " biz-bad" : ""}`}
            value={name}
            disabled={busy}
            aria-invalid={problems.name ? true : undefined}
            aria-describedby={problems.name ? "domain-name-problem" : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {problems.name ? (
            <FieldError id="domain-name-problem" message={problems.name} testid="domain-name-problem" />
          ) : null}
        </label>
      </div>
      <div className="bc-chips">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => void save()}
          disabled={busy}
          data-testid="domain-save"
          {...gate("team", "add a domain to send from")}
        >
          {busy ? "Adding…" : "Add the domain"}
        </button>
        <button className="btn btn-sm" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
};

/** The row an owner has armed a question on: which domain, and whether the question is Remove's or Resume's. */
interface Arm {
  id: string;
  what: "remove" | "resume";
}

interface DomainActs {
  check: (d: SendingDomainDto) => Promise<void>;
  remove: (d: SendingDomainDto) => Promise<void>;
  resume: (d: SendingDomainDto) => Promise<void>;
}

interface ActsOptions {
  flash: Flash;
  firstStep: number;
  setBusy: (id: string | null) => void;
  setArm: (arm: Arm | null) => void;
}

/** The owner's three acts on a domain: Check it, remove it, resume it. */
function domainActs(opts: ActsOptions): DomainActs {
  const { flash, firstStep, setBusy, setArm } = opts;
  const check = async (d: SendingDomainDto) => {
    setBusy(d.id);
    const r = await DOMAINS.check(d.id);
    setBusy(null);
    if (!r.ok) {
      flash(refusalToast(r, "Not checked"));
      return;
    }
    // What the Check found, in its own tone: records not there yet are not a success.
    const said = DOMAINS.checkWords(answeredDomain(r.data), d);
    flash({ tone: said.tone === "ok" ? undefined : said.tone === "warn" ? "warn" : "info", msg: <>{said.msg}</> });
  };
  const remove = async (d: SendingDomainDto) => {
    setBusy(d.id);
    const r = await DOMAINS.remove(d.id);
    setBusy(null);
    setArm(null);
    flash(r.ok ? { msg: <>{d.host} is removed. Nothing more is sent from it.</> } : refusalToast(r, "Not removed"));
  };
  const resume = async (d: SendingDomainDto) => {
    setBusy(d.id);
    const r = await DOMAINS.resume(d.id);
    setBusy(null);
    setArm(null);
    flash(
      r.ok
        ? {
            msg: (
              <>
                {d.host} is sending again, up to {firstStep} a day.
              </>
            ),
          }
        : refusalToast(r, "Not resumed"),
    );
  };
  return { check, remove, resume };
}

/** What a domain's row needs of the block around it. */
interface RowContext {
  owner: boolean;
  busy: string | null;
  arm: Arm | null;
  firstStep: number;
  acts: DomainActs;
  flash: Flash;
  setArm: (arm: Arm | null) => void;
}

/** The questions an owner is asked before Remove and before Resume, under the domain's words. */
function domainQuestions(d: SendingDomainDto, w: SendingDomainWords, ctx: RowContext) {
  const { busy, arm, firstStep, acts, setArm } = ctx;
  const armed = (what: Arm["what"]) => arm && arm.id === d.id && arm.what === what;
  return (
    <>
      {armed("remove") && (
        <Confirm
          question={`Remove ${d.host}?`}
          detail="Nothing more is sent from it; what was sent stays in its threads."
          yes="Yes, remove"
          danger
          busy={busy === d.id}
          onYes={() => void acts.remove(d)}
          onNo={() => setArm(null)}
          testid={`domain-remove-${d.host}`}
        />
      )}
      {armed("resume") && (
        <Confirm
          question={`Resume ${d.host}?`}
          detail={`It starts again at ${firstStep} a day. It was held because ${DOMAINS.holdWords(d.held_why)}. ${w.fix ?? ""}`.trim()}
          yes="Yes, resume"
          busy={busy === d.id}
          onYes={() => void acts.resume(d)}
          onNo={() => setArm(null)}
          testid={`domain-resume-${d.host}`}
        />
      )}
    </>
  );
}

/** Check, Resume and Remove, each only where the domain's state offers it (contracts' `acts`) and no question is open. */
function domainButtons(d: SendingDomainDto, ctx: RowContext) {
  const { owner, busy, arm, acts, setArm } = ctx;
  const doms = DOMAINS.acts(d);
  const open = !(arm && arm.id === d.id);
  return (
    <span className="set-int-actions">
      {doms.check && open && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void acts.check(d)}
          disabled={busy !== null}
          data-testid={`domain-check-${d.host}`}
          {...(owner ? {} : gate("team", "check a domain"))}
        >
          {busy === d.id ? "Checking…" : "Check"}
        </button>
      )}
      {doms.resume && open && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setArm({ id: d.id, what: "resume" })}
          disabled={busy !== null}
          data-testid={`domain-resume-${d.host}`}
          {...(owner ? {} : gate("team", "resume a domain"))}
        >
          Resume
        </button>
      )}
      {owner && open && (
        <button
          type="button"
          className="cl-bucket-link"
          onClick={() => setArm({ id: d.id, what: "remove" })}
          disabled={busy !== null}
          data-testid={`domain-remove-${d.host}`}
        >
          Remove
        </button>
      )}
    </span>
  );
}

/** One domain: its words and pill and acts, and the records to publish under it while they are what it waits on. */
function domainRow(d: SendingDomainDto, ctx: RowContext) {
  const w = DOMAINS.words(d);
  const showRecords = DOMAINS.acts(d).records;
  return (
    <Fragment key={d.id}>
      <div className="set-dom" data-testid={`domain-${d.host}`} data-state={d.state}>
        <Icon name="globe" size={14} />
        <span className="t">
          <b>{d.host}</b>
          <span>{w.line}</span>
          {w.stats ? <span className="dim">{w.stats}</span> : null}
          {w.fix ? <span>{w.fix}</span> : null}
          {w.next ? <span>{w.next}</span> : null}
          {domainQuestions(d, w, ctx)}
        </span>
        <span className="cap">
          <span>{w.cap}</span>
        </span>
        <StatePill kind="tone" value={w.tone} label={w.pill} />
        {domainButtons(d, ctx)}
      </div>
      {showRecords && <SendingDomainRecords d={d} flash={ctx.flash} />}
    </Fragment>
  );
}

interface FootOptions {
  count: number;
  ready: boolean;
  owner: boolean;
  onAdd: () => void;
}

/** The foot of the block: the rule once, and the button that opens the form to add one more. */
function domainsFoot(opts: FootOptions) {
  const { count, ready, owner, onAdd } = opts;
  return (
    <div className="set-dom set-dom-foot">
      <span />
      <span className="t">
        <span>{DOMAINS.footWords(count, DOMAINS.max)}</span>
      </span>
      <span />
      <span />
      <span className="set-int-actions">
        {ready && count < DOMAINS.max && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={onAdd}
            data-testid="domain-add-open"
            {...(owner ? {} : gate("team", "add a domain to send from"))}
          >
            <Icon name="plus" size={12} />
            Add a domain
          </button>
        )}
      </span>
    </div>
  );
}

interface SendingDomainsProps {
  email: EmailSetupDto | null | undefined;
  flash: Flash;
}

/**
 * The domains a workspace sends cold email from, under the Email row (Reach out; the canvas's Connections board).
 * Each row is contracts' words (`sendingDomains.words`), so what the row says is what the door and the clock
 * decided; the records to publish are the provider's, as the edge stored them, with the DMARC one we recommend while
 * the domain has none. The owner adds, checks and removes; anyone may read.
 */
export function SendingDomains({ email, flash }: SendingDomainsProps) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [arm, setArm] = useState<Arm | null>(null);
  const owner = canDo("team");
  if (!email || !email.mailbox || !email.sending) return null;
  const { ready, domains } = email.sending;
  if (!ready && domains.length === 0) return null;
  // A reputation hold is the owner's to lift (a second in thirty days is the platform's, and not offered): the ramp
  // starts again, at its first step.
  const firstStep = DOMAINS.cap(0);
  const acts = domainActs({ flash, firstStep, setBusy, setArm });
  const ctx: RowContext = { owner, busy, arm, firstStep, acts, flash, setArm };
  return (
    <div className="set-domains" data-testid="sending-domains">
      <div className="set-domains-head">
        <span>Domains you send from</span>
        <span className="k">
          cold email leaves only from a domain you own · replies come back to {email.mailbox.address}
        </span>
      </div>
      {!owner && (
        <div className="set-dom set-dom-note">
          <span />
          <span className="t">
            <span>{gateTitle("team", "add, check, resume or remove a domain")}</span>
          </span>
        </div>
      )}
      {domains.map((d) => domainRow(d, ctx))}
      {adding ? (
        <SendingDomainAdd
          mailDomain={email.domain}
          fromName={email.mailbox.from_name}
          flash={flash}
          onClose={() => setAdding(false)}
        />
      ) : (
        domainsFoot({ count: domains.length, ready, owner, onAdd: () => setAdding(true) })
      )}
    </div>
  );
}
