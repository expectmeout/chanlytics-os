/**
 * Get their yes, People's (`clients/get-yes`; Ruben's call 6, the Campaigns wiring review's lane 7, 19 Oct 2026: a yes is
 * about people): a sheet over People's list, where every "nobody has said yes to offers" door lands -- the QR and the
 * phrase, the desk sign, the link, and the sign-up page. It was a pane of Sent's beside Sequences' list
 * (`broadcasts/get-yes`, campaigns/broadcasts/page/yes-pane.tsx; a fold under Sent's runs before that), which lands here.
 * While the workspace is paused it stands with no code, no desk sign and no link to hand out, and says why (the wiring's
 * second audit, X4-1); with no WhatsApp number, it says where the code comes from.
 *
 * What it is made of is Sent's read (the number and the opt-in its code carries, campaigns/broadcasts/surface.ts), asked
 * for as the sheet opens where People's page has not read it. Close, Escape and the wash go back to People's list.
 */
import { useEffect, type ReactNode } from "react";
import { GET_YES_NO_NUMBER_WORDS, GET_YES_PAUSED_WORDS, GET_YES_WORDS, takesSignUps } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Sheet } from "../../kit/sheet/sheet";
import { navigate, refreshSurface, useLegacyToast } from "../../legacy-verbs";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
import type { BroadcastsSurface } from "../../campaigns/broadcasts/surface";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** Its body while the workspace is paused, with a number: the sheet stays where every door lands, and says why. */
function Paused() {
  return (
    <div className="bc-optin-body">
      <p data-testid="bc-optin-paused">{GET_YES_PAUSED_WORDS.body}</p>
    </div>
  );
}

/** Its body with no WhatsApp number: no code to hand out, and where it comes from. */
function NoNumber() {
  const W = GET_YES_NO_NUMBER_WORDS;
  return (
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
  );
}

/** Its body: the code, the words it sends and how a yes is undone, the desk sign, the link, and the sign-up page. */
function TheCode({
  optIn,
  link,
  flash,
}: {
  optIn: NonNullable<BroadcastsSurface["optIn"]>;
  link: string;
  flash: Flash;
}) {
  return (
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
  );
}

/** What the sheet holds, and the line under its title: by what the workspace has, once Sent's read says it. */
function yesSheetBodyOf(bc: BroadcastsSurface | undefined | null, flash: Flash): { sub: string; body: ReactNode } {
  const optIn = bc?.optIn ?? null;
  const link = optIn?.link ?? null;
  if (!bc || !optIn)
    return {
      sub: GET_YES_WORDS.note,
      body: (
        <div className="route-reading" role="status" aria-busy="true" data-testid="bc-optin-reading">
          Reading…
        </div>
      ),
    };
  if (!link && bc.number?.present && !takesSignUps(optIn.open))
    return { sub: GET_YES_PAUSED_WORDS.note, body: <Paused /> };
  if (!link) return { sub: GET_YES_NO_NUMBER_WORDS.note, body: <NoNumber /> };
  return { sub: GET_YES_WORDS.note, body: <TheCode optIn={optIn} link={link} flash={flash} /> };
}

export function GetYesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const bc = useSurface("broadcasts");
  const [toastNode, flash] = useLegacyToast();
  // Sent's read, which People's page does not make: asked for as the sheet opens.
  useEffect(() => {
    if (open && surfaceValue("broadcasts") === undefined) void refreshSurface("broadcasts");
  }, [open]);
  const { sub, body } = yesSheetBodyOf(bc, flash);
  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={GET_YES_WORDS.title}
        sub={sub}
        close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
        testid="bc-optin"
      >
        {body}
      </Sheet>
      {toastNode}
    </>
  );
}
