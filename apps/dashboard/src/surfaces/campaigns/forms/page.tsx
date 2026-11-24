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
import { formsPlaceOf, formsRouteOf, type FormPart, type FormsPlace } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { navigate, replaceRoute } from "../../frame-verbs";
import { PartShown } from "../parts/view-shown";
import { useCampaignsToast } from "../home/route-toast";
import { CmHead } from "../parts/head";
import { CmSplit, useCmPhone, type CmView } from "../parts/split";
import { FormsList } from "./list";
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
  // A phone's head draws its right side as the page's one coral act: the connection is a quiet line under the list there.
  const phone = useCmPhone();
  const sites = (list.dto?.sites ?? 0) > 0;
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
              sites && !phone ? (
                <Button size="sm" variant="quiet" onClick={website} data-testid="forms-website">
                  <Icon name="globe" size={13} /> {W.connect.head}
                </Button>
              ) : null
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
            websiteLine={sites && phone}
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
