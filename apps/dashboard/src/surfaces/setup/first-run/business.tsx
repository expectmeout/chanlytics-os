/**
 * Your business, the first run's first step (decision 0073, R17; canvas 1B, 1B·g–1B·i): Find while there is a listing to
 * link, Connect it to Google once one is (and its two answers back from Google), the one press that sets the receptionist
 * up, or Setup's own rows where a configuration must be repaired; and beside Find and Connect it to Google, Your
 * workspace, building. The page (page.tsx) draws the step's frame; this draws what is inside it.
 */
import type { ReactNode } from "react";
import { businessNameOf, type FirstRunVM } from "@chanlytics/contracts";
import type { SettingsSurface } from "@/legacy-bridge/surfaces/settings";
import { canDo, meNow, type LegacyFlash } from "../../legacy-verbs";
import { SetupRows } from "../rows/rows";
import type { SetupSurface } from "../surface";
import { FrBuilding } from "./building";
import { FrCheck } from "./check";
import { FrConnectGoogle, FrGoogleConnected, FrNotManager, type GoogleBack } from "./connect-google";
import { FrFind } from "./find";
import { brainOf, workspaceNow } from "./inputs";
import { W } from "./words";

/** What Your business draws of Google's way back (decision 0073, R17): the summary, or who can add them; null for neither. */
export function googleShownOf(fr: FirstRunVM, back: GoogleBack | null): GoogleBack | null {
  if (fr.shown.key !== "business") return null;
  return back === "connected" || (back === "not_manager" && fr.connect) ? back : null;
}

/** What Your business passes Google's part: what it shows, the way on, and Find's count for the building lines. */
export interface GoogleActs {
  shown: GoogleBack | null;
  done: () => void;
  onFound: (n: number | null | undefined) => void;
}

/** Connect it to Google, and its two answers, for Your business (decision 0073, R17). */
function googleBody(o: {
  S: SetupSurface;
  shown: GoogleBack | null;
  done: () => void;
  flash: (f: LegacyFlash) => void;
  assistant: string | null;
}): ReactNode {
  const { S, shown, done, flash, assistant } = o;
  const business = businessNameOf(S.dto.business.name, (workspaceNow() || { name: null }).name);
  const email = meNow()?.email ?? null;
  if (shown === "connected") {
    const reviews = (S.dto.imports ?? []).find((r) => r.source === "google_reviews") ?? null;
    const profile = (S.dto.reads ?? []).find((r) => r.source === "google_profile");
    return (
      <FrGoogleConnected
        business={business}
        email={S.vm.googleConnect.email}
        reviews={reviews}
        services={profile ? profile.facts.services.length : 0}
        onContinue={done}
      />
    );
  }
  if (shown === "not_manager")
    return <FrNotManager business={business} email={email} assistant={assistant} flash={flash} goOn={done} />;
  return (
    <FrConnectGoogle
      business={business}
      assistant={assistant}
      listing={S.dto.google?.listing ?? null}
      email={email}
      flash={flash}
      goOn={done}
    />
  );
}

/** Your business: Find, Connect it to Google, the press that sets the receptionist up, or Setup's own rows (a configuration to repair). */
export function businessBody(o: {
  fr: FirstRunVM;
  S: SetupSurface;
  go: (to: string) => void;
  make: () => void;
  flash: (f: LegacyFlash) => void;
  making: boolean;
  read: SettingsSurface | undefined;
  google: GoogleActs;
}): ReactNode {
  const { fr, S, go, make, flash, making, read, google } = o;
  const assistant = brainOf(read && read.settings ? read.settings.config : null)?.profile?.assistant_name ?? null;
  if (google.shown || fr.connect) return googleBody({ S, shown: google.shown, done: google.done, flash, assistant });
  if (fr.find)
    return <FrFind W={W.find} flash={flash} done={fr.findDone} go={go} make={make} onFound={google.onFound} />;
  if (fr.check)
    return (
      <FrCheck
        check={fr.check}
        W={W.check}
        flash={flash}
        make={make}
        making={making}
        go={go}
        canEdit={canDo("settings")}
        settings={read ? read.settings : null}
      />
    );
  return fr.shown.rows.length ? (
    <section className="tq fr-rows">
      <SetupRows S={S} rows={fr.shown.rows} look="row" primary={fr.primaryRow} later={W.putOff} testid="fr-rows" />
    </section>
  ) : null;
}

/**
 * Your workspace, building, beside Find, the press that builds the receptionist and Connect it to Google (canvas 1B):
 * each line a fact the page holds. It stands through the three, so the card under it never jumps as one gives way to the
 * next.
 */
export function buildingOf(o: {
  S: SetupSurface;
  fr: FirstRunVM;
  matches: number | null | undefined;
  read: SettingsSurface | undefined;
}): ReactNode {
  const { S, fr, matches, read } = o;
  if (!fr.find && !fr.connect && !(fr.check && !fr.check.made)) return null;
  const website = brainOf(read && read.settings ? read.settings.config : null)?.profile?.website ?? null;
  const siteRead = (S.dto.reads ?? []).some((r) => r.source === "website" && !r.error);
  return (
    <FrBuilding
      f={{
        name: businessNameOf(S.dto.business.name, (workspaceNow() || { name: null }).name) ?? W.title,
        matches: fr.find ? matches : undefined,
        linked: !!S.dto.google?.listing,
        connectOffered: S.vm.googleConnect.offered,
        connected: S.vm.googleConnect.connected,
        website: website ? siteRead : null,
        written: S.vm.check.receptionist === "set",
      }}
    />
  );
}
