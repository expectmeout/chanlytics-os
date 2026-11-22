/**
 * Campaigns › Forms (00680; the Forms plan, F1): the forms a business shares with no website, each made by one
 * sentence to AI, changed in place, and live only on its owner's press. A view of Campaigns beside Content and Ads
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
import { navigate, replaceRoute } from "../../frame-verbs";
import { useCampaignsToast } from "../home/route-toast";
import { CmHead } from "../parts/head";
import { CmSplit, type CmView } from "../parts/split";
import { FormsList } from "./list";
import { FormSheet } from "./sheet";
import { useFormsList } from "./use-forms";
import { FORMS_WORDS as W } from "./words";

/** Forms with no form open: the list alone. */
const NO_FORM_OPEN: FormsPlace = { form: null, part: "form" };

export function FormsPage({ route, view }: { route: string; view: CmView }) {
  const place = formsPlaceOf(route.split("/")[1] ?? null) ?? NO_FORM_OPEN;
  const list = useFormsList();
  const flash = useCampaignsToast();
  const go = (to: { form: string | null; part?: FormPart }) => {
    // A part of the sheet already open is the same entry: Back closes the form, never walks its parts.
    if (to.form && to.form === place.form) replaceRoute(formsRouteOf(to));
    else navigate(formsRouteOf(to));
  };
  return (
    <CmSplit
      testid="forms-page"
      className="fmv"
      view={view}
      list={
        <>
          <CmHead title={W.tab} quiet allowance={false} />
          <FormsList
            dto={list.dto}
            failed={list.failed}
            again={list.again}
            openId={place.form}
            onOpen={(form) => go({ form })}
          />
        </>
      }
      open={
        place.form ? (
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
