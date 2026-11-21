/**
 * Website forms in Settings › Connections (00674; the Forms plan, F0): when an entry last arrived, each site's key with
 * when it was last used, and the presses an owner or a partner has on them. A key is made for a site by its name and
 * shown once; a key changed leaves the old one working a day, said under it; a key ended is refused at once and goes
 * from the list. The first key, made by Chanlytics from its own before keys of a workspace's own, is listed once a site
 * has used it, with its own last use, so the owner can see the site has moved before ending it.
 */
import { useState } from "react";
import { DAY_MS, type WebsiteFormKeyMade, type WebsiteFormsDto } from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { FailedRead } from "../../kit/empty/empty";
import { RecordRow } from "../../kit/record/row";
import type { FrameFlash } from "../../frame-verbs";
import { KeySheet, MadeKeySheet, MakeKeySheet } from "./key-sheets";
import { useWebsiteForms } from "./use-website-forms";
import { WEBSITE_FORM_WORDS as W, keyHint, keyName, keysShown, keyUsed, type SaysWhen, type WebsiteKey } from "./words";
import "./website.css";

/** What the sheets hold open: the make sheet, a key's own, and a key just made with the old one's last day. */
interface Opened {
  making: boolean;
  key: WebsiteKey | null;
  made: WebsiteFormKeyMade | null;
  graceUntil: string | null;
}

const NOTHING_OPEN: Opened = { making: false, key: null, made: null, graceUntil: null };

/** The rows: last received, each key, and a new one; or the one empty row before anything is set up. */
function FormRows(props: { dto: WebsiteFormsDto; says: SaysWhen; open: (o: Partial<Opened>) => void }) {
  const { dto, says, open } = props;
  const keys = keysShown(dto, Date.now());
  const make = dto.can_change ? { label: W.make, onClick: () => open({ making: true }) } : undefined;
  if (keys.length === 0 && !dto.last_received_at)
    return <RecordRow id="wf-empty" testid="wf-empty" label={W.keys} value={null} empty={W.empty} act={make} />;
  return (
    <>
      <RecordRow
        id="wf-received"
        testid="wf-received"
        label={W.lastReceived}
        value={dto.last_received_at ? says.stamp(Date.parse(dto.last_received_at)) : null}
        empty={W.nothingReceived}
      />
      {keys.map((shown) => (
        <RecordRow
          key={shown.id}
          id={`wf-key-${shown.id}`}
          testid={`wf-key-row-${shown.first ? "first" : shown.id}`}
          label={keyName(shown)}
          value={keyUsed(shown, says)}
          hint={keyHint(shown, says)}
          act={
            dto.can_change
              ? { label: shown.ends_at ? W.keySheet.end : W.change, onClick: () => open({ key: shown }) }
              : undefined
          }
        />
      ))}
      {make ? <RecordRow id="wf-new" testid="wf-new" label={W.newKey} value={W.newKeyValue} act={make} /> : null}
    </>
  );
}

/** The card, its rows and its sheets. `flash` says what a press came to where nothing else on screen does. */
export function WebsiteForms({ flash }: { flash: (f: FrameFlash) => void }) {
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
  const graceOf = () => clock.when(Date.now() + DAY_MS);
  if (forms.failed) return <FailedRead kind="card" what="the website's keys" body={W.readFailed} testid="wf-failed" />;
  if (!forms.dto) return null;
  const dto = forms.dto;
  const shown = keysShown(dto, Date.now()).length;
  return (
    <section className="rec-card set-card set-conn" data-testid="connections-website" aria-labelledby="wf-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="wf-title">
          {W.title}
        </h2>
        <span className="rec-card-sub">{W.sub(shown, dto.last_received_at !== null)}</span>
      </div>
      <FormRows dto={dto} says={says} open={open} />
      <MakeKeySheet
        open={opened.making}
        busy={busy}
        onClose={() => open({})}
        onMake={(name) => void pressed({ act: "make", name }, (answer) => open({ made: answer.made }))}
      />
      <KeySheet
        keyShown={opened.key}
        busy={busy}
        says={says}
        onClose={() => open({})}
        onChange={(shown) =>
          void pressed({ act: "change", key_id: shown.id }, (answer) =>
            open({ made: answer.made, graceUntil: graceOf() }),
          )
        }
        onEnd={(shown) =>
          void pressed({ act: "end", key_id: shown.id }, () => {
            open({});
            flash({ msg: <>{W.ended(keyName(shown))}</> });
          })
        }
      />
      <MadeKeySheet made={opened.made} door={dto.door} graceUntil={opened.graceUntil} onClose={() => open({})} />
    </section>
  );
}
