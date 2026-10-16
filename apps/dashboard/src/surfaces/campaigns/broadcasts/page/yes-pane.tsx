/**
 * Get their yes, the pane `broadcasts/get-yes` opens beside Sequences' list, where every "nobody has said yes to offers"
 * door lands (moved from legacy/pages/broadcasts.jsx, decision 0015; a fold under Sent's runs until Sent's list went to each
 * sequence's History, decision 0060, D3): the QR and the phrase, the desk sign, the link, and the sign-up page. While the
 * workspace is paused it stands with no code, no desk sign and no link to hand out, and says why (the wiring's second
 * audit, X4-1); with no WhatsApp number, it says where the code comes from. Before the read lands it draws nothing.
 */
import { GET_YES_NO_NUMBER_WORDS, GET_YES_PAUSED_WORDS, takesSignUps } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { LinkButton } from "../../../kit/link-button/link-button";
import { navigate } from "../../../legacy-verbs";
import { CmPane } from "../../parts/split";
import type { BcV } from "./types";

/** The pane, or null before the read says what the workspace has. */
export function bcYesPane({ data, flash, closeYes }: Pick<BcV, "data" | "flash" | "closeYes">) {
  const optIn = data.optIn;
  const link = optIn && optIn.link;
  // Paused, with a number: the pane stays where every "get their yes" door lands, and says why there is no code.
  if (!link && optIn && data.number?.present && !takesSignUps(optIn.open))
    return (
      <CmPane title="Get their yes" sub={GET_YES_PAUSED_WORDS.note} onClose={closeYes} testid="bc-optin">
        <div className="bc-optin-body">
          <p data-testid="bc-optin-paused">{GET_YES_PAUSED_WORDS.body}</p>
        </div>
      </CmPane>
    );
  if (!optIn) return null;
  // No number: no code to hand out, and where it comes from.
  if (!link) {
    const W = GET_YES_NO_NUMBER_WORDS;
    return (
      <CmPane title="Get their yes" sub={W.note} onClose={closeYes} testid="bc-optin">
        <div className="bc-optin-body">
          <div className="bc-optin-text">
            <p data-testid="bc-optin-no-number">{W.body}</p>
            <div className="bc-chips">
              <LinkButton onClick={() => navigate(W.door.to)} data-testid="bc-optin-connect">
                {W.door.label}
              </LinkButton>
            </div>
          </div>
        </div>
      </CmPane>
    );
  }
  return (
    <CmPane title="Get their yes" sub="only people who said yes get a broadcast" onClose={closeYes} testid="bc-optin">
      <div className="bc-optin-body">
        <img
          className="bc-optin-qr"
          src={optIn.qrPath as string}
          alt={`QR code that opens WhatsApp with “${optIn.phrase}” ready to send`}
          width={120}
          height={120}
        />
        <div className="bc-optin-text">
          {/* What it does, in two short sentences: the code, the words it sends, and how a yes is undone. */}
          <p>
            A scan or a tap opens WhatsApp with <b>{optIn.phrase}</b> ready to send, and sending it records their yes.{" "}
            <b>{optIn.phraseEs}</b> works in Spanish; STOP undoes it.
          </p>
          <div className="bc-chips">
            {/* The code with the words a customer needs before scanning it, on one printable sheet: a bare code on a desk
                says nothing about whose messages, what they are, or how to stop them. */}
            {optIn.pageUrl && (
              <a
                className="btn btn-sm btn-primary"
                href={`${optIn.pageUrl}/sign`}
                target="_blank"
                rel="noreferrer"
                data-testid="bc-optin-sign"
              >
                Print a desk sign
              </a>
            )}
            <Button
              size="sm"
              data-testid="bc-optin-copy"
              onClick={() => {
                if (navigator.clipboard)
                  void navigator.clipboard.writeText(link).then(() => flash({ msg: <>Link copied</> }));
              }}
            >
              Copy link
            </Button>
            <a className="btn btn-sm" href={optIn.qrPath as string} download="say-yes-to-offers.svg">
              Download QR
            </a>
            <a className="cl-bucket-link" href={link} target="_blank" rel="noreferrer">
              Open the link
            </a>
          </div>
          {optIn.pageUrl && (
            <p className="bc-optin-page" data-testid="bc-optin-page">
              Your sign-up page,{" "}
              <a className="cl-bucket-link" href={optIn.pageUrl} target="_blank" rel="noreferrer">
                {optIn.pageUrl.replace("https://", "")}
              </a>
              , has the same code with the wording the phone carriers ask for. On paper, print{" "}
              <a
                className="cl-bucket-link"
                href={`${optIn.pageUrl}/form`}
                target="_blank"
                rel="noreferrer"
                data-testid="bc-optin-form"
              >
                the sign-up form
              </a>{" "}
              and record each signed box on their profile as “Sign-up form”.
            </p>
          )}
        </div>
      </div>
    </CmPane>
  );
}
