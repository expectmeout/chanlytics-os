/**
 * The form on the business's own website (the Forms plan, F4 and 3.11; the canvas's "On their own website"): under
 * Share, beside the places it is shared, opened by one press. The site comes first, since until one is listed browsers
 * show the form nowhere and the lines would show nothing; then the three lines to paste (the frame, a plain link to the
 * form, the small script that fits the frame), copied and never typed, with no key in them; and the sites it may show
 * on, each saying when a request last came from it, never that it works. A member who may not change it reads it.
 */
import { useState } from "react";
import { agoWords, FORM_SITES_MAX, websiteLinesOf, type FormLinkDto, type FormSheetDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { useCopied } from "../../kit/copy-button/copy-button";
import { Icon } from "../../kit/icon/icon";
import { SayLine } from "./say-line";
import { doFormLinkPress } from "./use-forms";
import { FORMS_WORDS } from "./words";

const WEB = FORMS_WORDS.website;

/** Copy the lines, saying so in place. */
function CopyLines({ lines }: { lines: string }) {
  const [copied, copy] = useCopied();
  return (
    <Button size="sm" variant="primary" onClick={() => copy(lines)} data-testid="forms-website-copy">
      <Icon name={copied ? "check" : "copy"} size={12} />
      <span aria-live="polite">{copied ? WEB.copied : WEB.copy}</span>
    </Button>
  );
}

interface WebsitePartProps {
  sheet: FormSheetDto;
  /** The form's website link, once its first site made it. */
  website: FormLinkDto | null;
  again: () => Promise<void>;
  fail: (message: string) => void;
  now: number;
}

/** The website part of Share: a row that opens it, and once open, its site, its lines and its sites. */
export function WebsitePart({ sheet, website, again, fail, now }: WebsitePartProps) {
  const [open, setOpen] = useState(false);
  const sites = website?.sites ?? [];
  const press = async (act: "site_add" | "site_remove", site: string) => {
    const pressed = await doFormLinkPress({ act, form_id: sheet.id, site });
    if (!pressed.ok) fail(pressed.message);
    await again();
    return pressed.ok;
  };
  const addSite =
    sheet.can_change && sites.length < FORM_SITES_MAX ? (
      <SayLine
        mark={<Icon name="globe" size={14} />}
        placeholder={WEB.siteAdd}
        label={WEB.siteLabel}
        send={WEB.siteSend}
        onSay={(typed) => press("site_add", typed)}
        maxLength={200}
        testid="forms-site-line"
      />
    ) : null;
  return (
    <>
      <h4>{WEB.heading}</h4>
      <div className="fmv-link" data-testid="forms-website">
        <div>
          <strong>{WEB.add}</strong>
          <span>{sites.length > 0 ? WEB.onSites(sites.length) : WEB.addBody}</span>
        </div>
        <Button size="sm" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="forms-website-open">
          {open ? WEB.hide : website ? WEB.show : WEB.open}
        </Button>
      </div>
      {open && !website ? (
        <div className="fmv-web" data-testid="forms-website-first">
          <p className="fmv-say">{WEB.first}</p>
          {addSite}
          <p className="fmv-fine">{WEB.firstNote}</p>
        </div>
      ) : null}
      {open && website ? (
        <div className="fmv-web" data-testid="forms-website-lines">
          <p className="fmv-say">{WEB.paste}</p>
          <WebsiteLines sheet={sheet} code={website.code} />
          <h4>{WEB.sites}</h4>
          {sites.map((site) => (
            <div className="fmv-link" key={site.host} data-testid="forms-site">
              <Icon name="globe" size={14} />
              <div>
                <strong>{site.host}</strong>
                <span>
                  {site.last_entry_at ? WEB.last(agoWords(Date.parse(site.last_entry_at), now)) : WEB.nothingYet}
                </span>
              </div>
              {sheet.can_change ? (
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => void press("site_remove", site.host)}
                  aria-label={WEB.removeLabel(site.host)}
                  data-testid="forms-site-remove"
                >
                  {WEB.remove}
                </Button>
              ) : null}
            </div>
          ))}
          {sites.length === 0 ? <p className="fmv-fine">{WEB.noSites}</p> : null}
          {addSite}
          <p className="fmv-fine">{WEB.fine}</p>
        </div>
      ) : null}
    </>
  );
}

/** The three lines, as they are pasted, and the press that copies them. */
function WebsiteLines({ sheet, code }: { sheet: FormSheetDto; code: string }) {
  const lines = websiteLinesOf({
    origin: window.location.origin,
    code,
    title: sheet.live?.heading ?? sheet.draft.heading,
    linkWords: WEB.linkWords,
  });
  return (
    <>
      <pre className="fmv-code">{lines}</pre>
      <div className="fmv-acts">
        <CopyLines lines={lines} />
      </div>
    </>
  );
}
