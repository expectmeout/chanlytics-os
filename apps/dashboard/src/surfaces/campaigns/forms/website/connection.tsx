/**
 * The website connection, inside Campaigns › Forms (00675, 00709; Campaigns in three tabs, Lane B; it was a card in
 * Settings › Connections): each site the business sends entries from, where it stands (waiting for its first entry, a
 * test received, receiving, or nothing lately, which is no fault), its keys under it with when each was last used, and
 * the forms found on it. A key is made for a site by its name and shown once with the lines its developer pastes, a test
 * among them; a key changed keeps its site and its forms, the old one working a day more; a key ended is refused at
 * once. Opened at `campaigns/forms:website`: from Forms' head, its empty page, and a site's form.
 */
import { useState } from "react";
import { DAY_MS, type FormSiteDto, type FormSiteStanding, type WebsiteFormKeyMade } from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../../kit/button/button";
import { FailedRead } from "../../../kit/empty/empty";
import { Icon } from "../../../kit/icon/icon";
import { StatePill } from "../../../kit/pill/state-pill";
import { RecordRow } from "../../../kit/record/row";
import { Sheet } from "../../../kit/sheet/sheet";
import type { FrameFlash } from "../../../frame-verbs";
import { KeySheet, MadeKeySheet, MakeKeySheet } from "./key-sheets";
import { useWebsiteForms } from "./use-website-forms";
import {
  WEBSITE_FORM_WORDS as W,
  keyHint,
  keyName,
  keysShown,
  keyUsed,
  siteSays,
  type SaysWhen,
  type WebsiteKey,
} from "./words";
import "./website.css";

/** A site's standing as its pill's tone: receiving is well; the rest are plain, none of them a fault. */
const STANDING_TONE: Record<FormSiteStanding, "ok" | "plain"> = {
  waiting: "plain",
  test: "plain",
  receiving: "ok",
  quiet: "plain",
};

/** What the sheets hold open: the make sheet (for a site, or a new one), a key's own, and a key just made. */
interface Opened {
  making: { site: { id: string; name: string } | null } | null;
  key: WebsiteKey | null;
  made: WebsiteFormKeyMade | null;
  graceUntil: string | null;
}

const NOTHING_OPEN: Opened = { making: null, key: null, made: null, graceUntil: null };

/** One site: its name and where it stands, its keys, a key made for it, and the forms found on it. */
function SiteBlock(props: {
  site: FormSiteDto;
  says: SaysWhen;
  canChange: boolean;
  open: (o: Partial<Opened>) => void;
}) {
  const { site, says, canChange, open } = props;
  const standingLine = siteSays(site, says);
  return (
    <section className="wf-site" data-testid="wf-site" data-standing={site.standing} aria-label={site.name}>
      <div className="wf-site-head">
        <h3>{site.name}</h3>
        <StatePill kind="tone" value={STANDING_TONE[site.standing]} label={W.standing[site.standing]} />
      </div>
      {standingLine ? <p className="wf-site-says">{standingLine}</p> : null}
      <h4 className="wf-site-sub">{W.keys}</h4>
      {keysShown(site, Date.now()).map((key) => (
        <RecordRow
          key={key.id}
          id={`wf-key-${key.id}`}
          testid={`wf-key-row-${key.first ? "first" : key.id}`}
          label={keyName(key)}
          value={keyUsed(key, says)}
          hint={keyHint(key, says)}
          act={canChange ? { label: key.ends_at ? W.keySheet.end : W.change, onClick: () => open({ key }) } : undefined}
        />
      ))}
      {canChange ? (
        <RecordRow
          id={`wf-new-${site.id}`}
          testid="wf-new"
          label={W.newKey}
          value={null}
          empty=""
          act={{ label: W.make, onClick: () => open({ making: { site: { id: site.id, name: site.name } } }) }}
        />
      ) : null}
      <h4 className="wf-site-sub">{W.formsFound}</h4>
      {site.forms.length === 0 ? (
        <p className="wf-site-says">{W.noForms}</p>
      ) : (
        <ul className="wf-site-forms">
          {site.forms.map((form) => (
            <li key={form.id} data-testid="wf-site-form">
              <span>{form.name}</span>
              <span>
                {W.formKind[form.form]}
                {form.last_entry_at ? ` · ${W.lastOne(says.stamp(Date.parse(form.last_entry_at)))}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The connection's sheet, its sites and its key sheets. `flash` says what a press came to where nothing else does. */
export function WebsiteConnection({ onClose, flash }: { onClose: () => void; flash: (f: FrameFlash) => void }) {
  const forms = useWebsiteForms();
  const [opened, setOpened] = useState<Opened>(NOTHING_OPEN);
  const [busy, setBusy] = useState(false);
  const clock = pageClock();
  const says: SaysWhen = { stamp: clock.stamp, when: clock.when };
  const open = (opening: Partial<Opened>) => setOpened({ ...NOTHING_OPEN, ...opening });
  const pressed = async (
    ask: Parameters<typeof forms.press>[0],
    done: (answer: { made: WebsiteFormKeyMade | null }) => void,
  ) => {
    setBusy(true);
    const answer = await forms.press(ask);
    setBusy(false);
    if ("refused" in answer) {
      flash({ tone: "danger", msg: <>{answer.refused}</> });
      return;
    }
    done(answer);
  };
  const dto = forms.dto;
  const canChange = !!dto?.can_change;
  const making = opened.making;
  return (
    <Sheet
      open
      onClose={onClose}
      title={W.title}
      sub={dto ? W.sites(dto.sites.length) : undefined}
      close={{ label: W.close, glyph: <Icon name="x" size={13} /> }}
      testid="wf-sheet"
      foot={
        canChange ? (
          <div data-foot-pair="">
            <Button variant="secondary" onClick={() => open({ making: { site: null } })} data-testid="wf-add-site">
              {W.addSite}
            </Button>
          </div>
        ) : null
      }
    >
      {forms.failed ? (
        <FailedRead kind="card" what="the website's sites" body={W.readFailed} testid="wf-failed" />
      ) : !dto ? (
        <div className="route-reading" role="status" data-testid="wf-reading" />
      ) : (
        <div className="wf-sites">
          <p className="wf-site-says">{W.intro}</p>
          {dto.sites.length === 0 ? (
            <div className="wf-empty" data-testid="wf-empty">
              <h3>{W.empty.title}</h3>
              <p className="wf-site-says">{W.empty.body}</p>
            </div>
          ) : (
            dto.sites.map((site) => (
              <SiteBlock key={site.id} site={site} says={says} canChange={canChange} open={open} />
            ))
          )}
          <p className="wf-site-says">{W.keyRule}</p>
        </div>
      )}
      <MakeKeySheet
        open={making !== null}
        site={making?.site?.name ?? null}
        busy={busy}
        onClose={() => open({})}
        onMake={(name) =>
          void pressed({ act: "make", name, ...(making?.site ? { site_id: making.site.id } : {}) }, (answer) =>
            open({ made: answer.made }),
          )
        }
      />
      <KeySheet
        keyShown={opened.key}
        busy={busy}
        says={says}
        onClose={() => open({})}
        onChange={(shown) =>
          void pressed({ act: "change", key_id: shown.id }, (answer) =>
            open({ made: answer.made, graceUntil: clock.when(Date.now() + DAY_MS) }),
          )
        }
        onEnd={(shown) =>
          void pressed({ act: "end", key_id: shown.id }, () => {
            open({});
            flash({ msg: <>{W.ended(keyName(shown))}</> });
          })
        }
      />
      <MadeKeySheet
        made={opened.made}
        door={dto?.door ?? null}
        graceUntil={opened.graceUntil}
        onClose={() => open({})}
      />
    </Sheet>
  );
}
