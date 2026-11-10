/**
 * Cold email: the road to a mailbox. A mailbox is required (Ruben, 9 Nov 2026), so this is the one thing a new account
 * can't skip: a sheet that says what connecting gives, and Google's consent, which comes back here. An account Google or
 * the edge refused comes back to a sheet that says why in the owner's words: a personal address, or no Workspace. Only
 * Google Workspace connects today (Microsoft is halted), and "Tell us" keeps who asks for something else on the ledger.
 */
import { useEffect, useState } from "react";
import { REACH_OUT_SETTINGS_WORDS, type MailboxHistory } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { gate, type FrameFlash } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordField } from "../../kit/record/field";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordSheet } from "../../kit/record/sheet";
import { HistoryChoice, historyKept, keepHistory } from "../connections/history-choice";
import { connectMailbox, mailboxConnectOutcome } from "../connections/mailbox-connect";

const CONNECT_SHEET = REACH_OUT_SETTINGS_WORDS.connect;
const WORKSPACE_HELP = CONNECT_SHEET.helpUrl;

/** To Google's consent with what the owner chose it brings in, and back to this page; a door that refuses says so. */
const connectGoogle = (flash: (flash: FrameFlash) => void, history: MailboxHistory) => {
  keepHistory(history);
  void connectMailbox("google", null, "cold_email", history).then((r) => {
    if (!r.ok) flash({ tone: "danger", msg: r.message });
  });
};

/** One sheet of the road, held by the one registry every sheet of this page is. */
const useRoadSheet = (id: string) => {
  const fold = useRecordFold(id, { dirty: false });
  useEffect(() => recFolds.drawn(id), [id]);
  return fold;
};

/** Connect your mailbox: what it gives, and Google. */
function ConnectSheet({ flash }: { flash: (flash: FrameFlash) => void }) {
  const fold = useRoadSheet("connect");
  const [history, setHistory] = useState<MailboxHistory>(historyKept);
  if (!fold.open) return null;
  return (
    <RecordSheet
      id="connect"
      title={CONNECT_SHEET.title}
      onClose={fold.close}
      foot={
        <span data-foot-pair>
          <Button size="sm" onClick={fold.close} data-testid="rec-connect-cancel">
            {CONNECT_SHEET.cancel}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => connectGoogle(flash, history)}
            data-testid="rec-connect-google"
            {...gate("settings", "connect a mailbox")}
          >
            {CONNECT_SHEET.google}
          </Button>
        </span>
      }
      testid="rec-connect-sheet"
    >
      <div className="bt-stack">
        <p className="bt-fold-note">{CONNECT_SHEET.sub}</p>
        <ul className="ro-steps">
          {CONNECT_SHEET.promises.map(([title, detail]) => (
            <li className="ro-step" key={title}>
              <span className="ro-step-words">
                <span>{title}</span>
                <small>{detail}</small>
              </span>
            </li>
          ))}
        </ul>
        <HistoryChoice value={history} onChange={setHistory} lineClass="bt-fold-note" />
        <span>
          <LinkButton
            onClick={() => {
              fold.close();
              recFolds.request("connect_other");
            }}
            data-testid="rec-connect-other"
          >
            {CONNECT_SHEET.other.title}
          </LinkButton>
        </span>
      </div>
    </RecordSheet>
  );
}

/** That's a personal address: why it was refused, and what to do. */
function FreeMailSheet({ flash }: { flash: (flash: FrameFlash) => void }) {
  const fold = useRoadSheet("connect_free");
  const [history, setHistory] = useState<MailboxHistory>(historyKept);
  if (!fold.open) return null;
  return (
    <RecordSheet
      id="connect_free"
      title={CONNECT_SHEET.free.title}
      onClose={fold.close}
      foot={
        <span data-foot-pair>
          <Button size="sm" onClick={fold.close} data-testid="rec-connect-free-later">
            {CONNECT_SHEET.free.later}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => connectGoogle(flash, history)}
            data-testid="rec-connect-free-again"
            {...gate("settings", "connect a mailbox")}
          >
            {CONNECT_SHEET.free.again}
          </Button>
        </span>
      }
      testid="rec-connect-free-sheet"
    >
      <div className="bt-stack">
        <p className="bt-fold-note">{CONNECT_SHEET.free.why}</p>
        <HistoryChoice value={history} onChange={setHistory} lineClass="bt-fold-note" />
        <span>
          <LinkButton
            href={WORKSPACE_HELP}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="rec-connect-free-help"
          >
            {CONNECT_SHEET.free.help}
          </LinkButton>
        </span>
      </div>
    </RecordSheet>
  );
}

/** Not on Google Workspace: what works, and Tell us. */
function OtherSheet({ flash }: { flash: (flash: FrameFlash) => void }) {
  const fold = useRoadSheet("connect_other");
  const [provider, setProvider] = useState("");
  const [told, setTold] = useState(false);
  if (!fold.open) return null;
  const tell = () => {
    const name = provider.trim();
    if (!name) return;
    void api()("POST settings/reach-out/provider-wanted", { body: { provider: name } }).then((r) => {
      if (!r.ok) {
        flash({ tone: "danger", msg: r.message });
        return;
      }
      setTold(true);
    });
  };
  return (
    <RecordSheet
      id="connect_other"
      title={CONNECT_SHEET.other.title}
      onClose={fold.close}
      testid="rec-connect-other-sheet"
    >
      <div className="bt-stack">
        <p className="bt-fold-note">{CONNECT_SHEET.other.what}</p>
        <span>
          <LinkButton
            href={WORKSPACE_HELP}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="rec-connect-other-help"
          >
            {CONNECT_SHEET.other.help}
          </LinkButton>
        </span>
        {told ? (
          <p className="bt-fold-note" data-testid="rec-provider-told">
            {CONNECT_SHEET.other.thanks}
          </p>
        ) : (
          <>
            <RecordField
              id="ro-provider"
              label={CONNECT_SHEET.other.tellLabel}
              value={provider}
              onChange={setProvider}
              placeholder={CONNECT_SHEET.other.placeholder}
              testid="rec-provider-box"
            />
            <span>
              <Button
                size="sm"
                onClick={tell}
                disabled={!provider.trim()}
                data-testid="rec-provider-send"
                {...gate("settings", "tell us which mailbox you use")}
              >
                {CONNECT_SHEET.other.tell}
              </Button>
            </span>
          </>
        )}
      </div>
    </RecordSheet>
  );
}

/** The road's sheets, and what the browser came back from Google with, said once. */
export function ConnectSheets({ again, flash }: { again: () => void; flash: (flash: FrameFlash) => void }) {
  useEffect(() => {
    const came = mailboxConnectOutcome();
    if (!came) return;
    if (came.ok) {
      flash({ msg: came.words });
      again();
    } else if (came.code === "free_mail") recFolds.request("connect_free");
    else if (came.code === "not_workspace") recFolds.request("connect_other");
    else flash({ tone: "danger", msg: came.words });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the page opens: its word leaves the address as it is read
  }, []);
  return (
    <>
      <ConnectSheet flash={flash} />
      <FreeMailSheet flash={flash} />
      <OtherSheet flash={flash} />
    </>
  );
}
