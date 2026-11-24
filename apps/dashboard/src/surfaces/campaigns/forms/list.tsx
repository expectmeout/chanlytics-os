/**
 * Campaigns › Forms' list (the Forms canvas, "The list"): one line to AI, and each form as a row that says whether it
 * is live and when it last took a request. No builder, no template list and no kinds of question to pick from: a form
 * is made by saying what to collect. While AI drafts, its three work and the words stay still.
 *
 * Where the business's own website sends forms too (00709; Campaigns in three tabs, Lane B), the forms made here stand
 * under their head and each site's under its own, by their real names, a hidden one folded away. With no form and no site,
 * the page offers two starts: say what to collect, or connect the website's own form; past them, the connection is
 * always one press away (websiteDoorOf).
 */
import { useState } from "react";
import { agoWords, type FormListRowDto, type FormsDto, type OutsideFormRowDto } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { WEBSITE_FORM_WORDS } from "./website/words";
import { AskLooking } from "../../files/looking";
import { Button } from "../../kit/button/button";
import { gate } from "../../frame-verbs";
import { EmptyState } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { ListRow } from "../../kit/list-row/list-row";
import { Panel } from "../../kit/panel/panel";
import { StatePill } from "../../kit/pill/state-pill";
import { SayLine } from "./say-line";
import { doFormPress } from "./use-forms";
import { FORMS_WORDS as W, formRowWords } from "./words";

/** A form's state as its pill's tone: live is well, a draft waits on its owner, off is plain. */
const stateTone = { live: "ok", draft: "warn", off: "plain" } as const;

/** Where the line to AI stands: at rest, drafting, with one question back, or with a draft that could not be made. */
type Asking =
  | { state: "rest" }
  | { state: "drafting"; sentence: string }
  | { state: "asked"; question: string; sentence: string }
  | { state: "failed"; sentence: string };

/** What stands over the line: what AI is doing, its question, a draft that could not be made, or, with no form yet, what the line does. */
function askHeadOf(asking: Asking, first: boolean): { title: string; body: string } | null {
  if (asking.state === "drafting") return { title: W.ask.drafting, body: W.ask.draftingBody };
  if (asking.state === "asked") return { title: asking.question, body: "" };
  if (asking.state === "failed") return { title: W.ask.failed, body: W.ask.failedBody };
  return first ? { title: W.ask.first, body: W.ask.firstBody } : null;
}

/**
 * Where the line stands, and a sentence said to AI: a form made is opened, a question back or a draft that could not be
 * made keeps the sentence, so nothing typed is lost.
 */
function useAsking(onMade: (formId: string) => void): [Asking, (sentence: string) => Promise<boolean>] {
  const [asking, setAsking] = useState<Asking>({ state: "rest" });
  const say = async (sentence: string) => {
    setAsking({ state: "drafting", sentence });
    const pressed = await doFormPress({ act: "make", sentence });
    if (pressed.ok && pressed.data.form_id) {
      setAsking({ state: "rest" });
      onMade(pressed.data.form_id);
      return true;
    }
    const question = pressed.ok && pressed.data.asked ? pressed.data.said : null;
    setAsking(question ? { state: "asked", question, sentence } : { state: "failed", sentence });
    return false;
  };
  return [asking, say];
}

/** The head over the line. One moving thing: the three at work while AI drafts, still at rest. The words never move. */
function AskHead({
  head,
  drafting,
  live,
}: {
  head: { title: string; body: string };
  drafting: boolean;
  live: boolean;
}) {
  return (
    <div className="fmv-ask-head" role={live ? "status" : undefined}>
      <span className="fmv-three">{drafting ? <AskLooking looking /> : <Icon name="three" size={22} />}</span>
      <div>
        <h3>{head.title}</h3>
        {head.body ? <p>{head.body}</p> : null}
      </div>
    </div>
  );
}

/** The line to AI: what to collect. `first`: no form is made yet, so it leads the page with what it does. */
function AskForForm({ first, onMade }: { first: boolean; onMade: (formId: string) => void }) {
  const [asking, say] = useAsking(onMade);
  const drafting = asking.state === "drafting";
  const head = askHeadOf(asking, first);
  // A try that failed, or a question back, opens the line on its own sentence: nothing typed is lost.
  const held = asking.state === "failed" || asking.state === "asked";
  return (
    <div className="fmv-ask" data-testid="forms-ask" data-state={asking.state} aria-busy={drafting || undefined}>
      {head ? <AskHead head={head} drafting={drafting} live={asking.state !== "rest"} /> : null}
      <SayLine
        key={held ? `kept-${asking.sentence}` : "line"}
        mark={<Icon name="three" size={15} />}
        placeholder={first || head ? W.ask.hint : W.ask.more}
        label={W.ask.label}
        send={W.ask.send}
        busy={drafting}
        kept={asking.state === "rest" ? "" : asking.sentence}
        onSay={say}
        testid="forms-ask-line"
      />
      {asking.state === "failed" ? (
        <div className="fmv-acts">
          <Button size="sm" variant="primary" onClick={() => void say(asking.sentence)} data-testid="forms-ask-again">
            {W.ask.again}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** One form's row: its heading, where it stands in a sentence, and its state. */
function FormRow({ row, now, open, onOpen }: { row: FormListRowDto; now: number; open: boolean; onOpen: () => void }) {
  const rowWords = formRowWords(row, now);
  return (
    <ListRow
      className="fmv-row"
      data-open={open || undefined}
      data-off={row.state === "off" || undefined}
      mark={<Icon name="list" size={15} />}
      name={row.heading}
      said={<span data-waits={rowWords.waits || undefined}>{rowWords.words}</span>}
      end={(place) => (
        <span className={place}>
          <StatePill kind="tone" value={stateTone[row.state]} label={W.state[row.state]} />
          <Icon name="chevron" size={12} />
        </span>
      )}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      data-testid="forms-row"
    />
  );
}

/** A site's form's row: its name, what it is and when its last one came, and that it is on the site. */
function SiteFormRow(props: { row: OutsideFormRowDto; now: number; open: boolean; onOpen: () => void }) {
  const { row, now, open, onOpen } = props;
  const last = row.last_entry_at ? WEBSITE_FORM_WORDS.lastOne(agoWords(Date.parse(row.last_entry_at), now)) : null;
  return (
    <ListRow
      className="fmv-row"
      data-open={open || undefined}
      data-off={!row.listed || undefined}
      mark={<Icon name="globe" size={15} />}
      name={row.name}
      said={<span>{[WEBSITE_FORM_WORDS.formKind[row.form], last].filter(Boolean).join(" · ")}</span>}
      end={(place) => (
        <span className={place}>
          <StatePill kind="tone" value="plain" label={SITE_LABEL} />
          <Icon name="chevron" size={12} />
        </span>
      )}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      data-testid="forms-site-row"
    />
  );
}

/** What a site's form's row says it is. */
const SITE_LABEL = "On your site";

/** Each site's forms under its own head, the hidden ones folded away until asked for. */
function SiteGroups(props: {
  rows: readonly OutsideFormRowDto[];
  now: number;
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const hidden = props.rows.filter((row) => !row.listed).length;
  const shown = props.rows.filter((row) => row.listed || showHidden);
  const sites = [...new Set(shown.map((row) => row.site_id))];
  return (
    <>
      {sites.map((siteId) => {
        const rows = shown.filter((row) => row.site_id === siteId);
        return (
          <section key={siteId} className="fmv-group" data-testid="forms-site-group">
            <h3>{W.heads.onSite(rows[0]?.site ?? "")}</h3>
            <Panel variant="pane" size="flush" className="fmv-rows">
              {rows.map((row) => (
                <SiteFormRow
                  key={row.id}
                  row={row}
                  now={props.now}
                  open={row.id === props.openId}
                  onOpen={() => props.onOpen(row.id)}
                />
              ))}
            </Panel>
          </section>
        );
      })}
      {hidden > 0 ? (
        <p className="fmv-note">
          {W.hidden.some(hidden)}{" "}
          <LinkButton onClick={() => setShowHidden(!showHidden)} data-testid="forms-hidden-toggle">
            {showHidden ? W.hidden.hide : W.hidden.show}
          </LinkButton>
        </p>
      ) : null}
    </>
  );
}

/**
 * The empty page's second start: the website's own form, connected. Its act is the connection's own permission's (the
 * website connection's `can_change`, contracts ROLE_PERMS settings): a member who may not connect a site is told who may,
 * at the button, rather than sent to an empty connection with nothing to press.
 */
function ConnectStart({ onWebsite }: { onWebsite: () => void }) {
  return (
    <div className="fmv-ask-head" data-testid="forms-connect">
      <span className="fmv-three">
        <Icon name="globe" size={22} />
      </span>
      <div>
        <h3>{W.connect.title}</h3>
        <p>{W.connect.body}</p>
        <div className="fmv-acts">
          <Button size="sm" onClick={onWebsite} data-testid="forms-connect-go" {...gate("settings", W.connect.doing)}>
            {W.connect.act}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Where the page's way into the website connection stands: the empty page's start, the head's button, a line under the list. */
type WebsiteDoor = "start" | "head" | "line";

/**
 * Forms always has a way into the website connection once its list is read. With no form made here, none brought over
 * and no site, the page opens on its two starts, AI's and the website's, and the start is the way in. Everywhere else it
 * is the head's button on a desk, and on a phone, whose head draws its right side as the page's one coral act, a quiet
 * line under the list. Unread, or not read, there is none: what could not be read has its one act.
 */
export function websiteDoorOf(dto: FormsDto | null, phone: boolean): WebsiteDoor | null {
  if (!dto) return null;
  if (dto.forms.length === 0 && (dto.outside ?? []).length === 0 && dto.sites === 0) return "start";
  return phone ? "line" : "head";
}

/** The connection as a quiet line, where the head has no room for it. */
function WebsiteLine({ onWebsite }: { onWebsite: () => void }) {
  return (
    <LinkButton onClick={onWebsite} data-testid="forms-website-line">
      {WEBSITE_FORM_WORDS.title}
    </LinkButton>
  );
}

interface FormsListProps {
  dto: FormsDto | null;
  failed: boolean;
  again: () => Promise<void>;
  openId: string | null;
  onOpen: (formId: string) => void;
  /** A site's form opened, and the website connection opened (00709). */
  onOpenSite: (formId: string) => void;
  onWebsite: () => void;
  /** Where the way into the website connection stands (websiteDoorOf): the list draws the start and the line. */
  door: WebsiteDoor | null;
}

/** The list: the forms, and the line to AI over them where there is none yet, under them once there is one. */
export function FormsList(props: FormsListProps) {
  const { dto, failed, again, openId, onOpen, onOpenSite, onWebsite, door } = props;
  const websiteLine = door === "line" ? <WebsiteLine onWebsite={onWebsite} /> : null;
  const [now] = useState(() => Date.now());
  if (failed)
    return (
      <EmptyState
        kind="page"
        glyph="note"
        title={W.unread.title}
        body={W.unread.body}
        action={{ label: W.unread.act, onClick: () => void again() }}
        testid="forms-unread"
      />
    );
  if (!dto) return <div className="route-reading" role="status" data-testid="forms-reading" />;
  const made = (formId: string) => {
    void again();
    onOpen(formId);
  };
  const outside = dto.outside ?? [];
  const ask = dto.can_change ? <AskForForm first={dto.forms.length === 0} onMade={made} /> : null;
  if (dto.forms.length === 0 && outside.length === 0)
    return (
      <div className="fmv-list" data-testid="forms-list">
        <Panel variant="pane" size="sm">
          {ask ?? <p className="fmv-note">{W.viewer}</p>}
          {door === "start" ? <ConnectStart onWebsite={onWebsite} /> : null}
        </Panel>
        {websiteLine}
      </div>
    );
  // Heads only where both kinds stand: a page of forms made here alone reads as it always has.
  const heads = outside.length > 0;
  return (
    <div className="fmv-list" data-testid="forms-list">
      {dto.forms.length > 0 ? (
        <section className="fmv-group">
          {heads ? <h3>{W.heads.here}</h3> : null}
          <Panel variant="pane" size="flush" className="fmv-rows">
            {dto.forms.map((row) => (
              <FormRow key={row.id} row={row} now={now} open={row.id === openId} onOpen={() => onOpen(row.id)} />
            ))}
          </Panel>
        </section>
      ) : null}
      {heads ? <SiteGroups rows={outside} now={now} openId={openId} onOpen={onOpenSite} /> : null}
      {websiteLine}
      {ask}
    </div>
  );
}
