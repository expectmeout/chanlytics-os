/**
 * Campaigns › Forms (00680, 00709; the Forms plan, F1): the forms a business shares with no website, each made by one
 * sentence to AI, changed in place, and live only on its owner's press; and the forms its own website owns, each under its
 * site (`campaigns/forms:site:<id>`), with the website connection one press away (`campaigns/forms:website`). A view of Campaigns beside Content and Ads
 * (campaigns/home/route.tsx), on Campaigns' own split: the list, and the form that is open in a pane beside it on a
 * desk, which takes the screen on a phone. The address names the open form and the part of its sheet
 * (`campaigns/forms:<id>[:next|share]`), so Back closes it and a link opens it.
 *
 * Its reads are the page's own (use-forms.ts): made as it is drawn, after each press, and when the tab is come back
 * to. A request arriving is Needs you's to say, on Today and in the Inbox.
 */
// AI's three at work are Files' own drawing (files/looking.tsx AskLooking): its rules load with the view, as Content's do.
import "../../files/files.css";
import "./forms.css";
import { useRef } from "react";
import { formsPlaceOf, formsRouteOf, type FormPart, type FormsPlace } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { ActWords } from "../../kit/head/act-words";
import { Icon } from "../../kit/icon/icon";
import { gate, navigate, replaceRoute } from "../../frame-verbs";
import { PartShown } from "../parts/view-shown";
import { useCampaignsToast } from "../home/route-toast";
import { CmHead } from "../parts/head";
import { CmSplit, useCmPhone, type CmView } from "../parts/split";
import { FormsList, websiteDoorOf } from "./list";
import { FormSheet } from "./sheet";
import { useFormsList } from "./use-forms";
import { WebsiteConnection } from "./website/connection";
import { SiteFormSheet } from "./website/site-sheet";
import { FORMS_WORDS as W } from "./words";

/** Forms with no form open: the list alone. */
const NO_FORM_OPEN: FormsPlace = { form: null, part: "form" };

export function FormsPage({ route, view }: { route: string; view: CmView }) {
  const place = formsPlaceOf(route.split("/")[1] ?? null) ?? NO_FORM_OPEN;
  const list = useFormsList();
  const flash = useCampaignsToast();
  const go = (to: { form: string | null; part?: FormPart; site?: boolean; website?: boolean }) => {
    // A part of the sheet already open is the same entry: Back closes the form, never walks its parts.
    if (to.form && to.form === place.form) replaceRoute(formsRouteOf(to));
    else navigate(formsRouteOf(to));
  };
  // The website connection, from the head, the empty page and a site's form: one entry, so Back closes it.
  const website = () => go({ form: null, website: true });
  const flashOrQuiet = flash ?? (() => undefined);
  // Forms always has a way into the connection (websiteDoorOf): the empty page's start, the head's button, or a phone's line.
  const phone = useCmPhone();
  const door = websiteDoorOf(list.dto, phone);
  // New, the head's coral act, as Campaigns' New and Content's Make (Ruben, 25 Nov 2026: Forms was the one tab with none).
  // A form is made by a sentence to AI, so New takes the thumb to that line, wherever it stands on the list, and opens the
  // keys: there is no blank form to start from.
  const askRef = useRef<HTMLTextAreaElement>(null);
  const newForm = () => {
    const line = askRef.current;
    if (!line) return;
    line.scrollIntoView({ block: "center", behavior: "smooth" });
    line.focus({ preventScroll: true });
  };
  return (
    <CmSplit
      testid="forms-page"
      className="fmv"
      view={view}
      list={
        <>
          {/* Its first part (client/page-speed.ts, contracts PRIMARY_PART), said while it is the view shown: the list drawn with
              its forms, or with what could not be read. */}
          <PartShown page="forms" part="list" ready={!!list.dto || list.failed} />
          <CmHead
            title={W.tab}
            quiet
            allowance={false}
            right={
              <>
                {door === "head" ? (
                  <Button size="sm" variant="quiet" onClick={website} data-testid="forms-website">
                    <Icon name="globe" size={13} /> {W.connect.head}
                  </Button>
                ) : null}
                {/* Once the list is read: what could not be read has its own one act. */}
                {list.dto ? (
                  <Button
                    variant="primary"
                    onClick={newForm}
                    data-testid="forms-new"
                    {...gate("approve", "make a form")}
                  >
                    <ActWords icon={<Icon name="plus" size={14} />} words={W.newAct} />
                  </Button>
                ) : null}
              </>
            }
          />
          <FormsList
            dto={list.dto}
            failed={list.failed}
            again={list.again}
            openId={place.form}
            onOpen={(form) => go({ form })}
            onOpenSite={(form) => go({ form, site: true })}
            onWebsite={website}
            door={door}
            askRef={askRef}
          />
          {place.website ? <WebsiteConnection onClose={() => go({ form: null })} flash={flashOrQuiet} /> : null}
        </>
      }
      open={
        place.form && place.site ? (
          <SiteFormSheet
            key={place.form}
            formId={place.form}
            part={place.part}
            flash={flash}
            listAgain={list.again}
            go={go}
          />
        ) : place.form ? (
          <FormSheet
            key={place.form}
            formId={place.form}
            part={place.part}
            flash={flash}
            listAgain={list.again}
            go={go}
          />
        ) : null
      }
    />
  );
}
