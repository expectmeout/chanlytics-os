/**
 * One ad, open (MOCKUP; Ruben, 11 Oct 2026, "Option B"): the ad read back as one sentence, in a sheet from the side over the
 * Ads page (a phone's rises at 82dvh), as a campaign's drawer is. Top to bottom: a kicker (where it runs and what it asks of
 * a person), the name with its pen, a line only when something blocks or waits, what is left, the sentence whose changeable
 * words are soft tinted tokens, what it runs on as one quiet line, what it brought (the bar a day), how it reads, the people
 * it brought, and the foot: Pause | Edit. Edit makes the words editable and wears a dot on each one it moved. An ad that
 * ended reads in the past, and one the owner made on the platform itself reads whole, with Pause and Resume alone and a line
 * saying where it was made. Nothing here is sent: a press is a verb of the page's store (store.ts), which answers with the
 * new ad or the reason, and says so in a toast (use-pane.ts); the drawer keeps no copy of any ad.
 */
import type { KeyboardEvent } from "react";
import type { AdRead, AdsConfig, AdsRead } from "@chanlytics/contracts";
import { DOOR, DRAWER, EDIT, GATE, NO_AD, PLATFORM_WORD } from "@chanlytics/contracts/ads-page";
import type { AdDrawerVM } from "@chanlytics/contracts/ads-page";
import { Button } from "../../../kit/button/button";
import { EmptyState } from "../../../kit/empty/empty";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { Menu } from "../../../kit/menu/menu";
import type { MenuItem } from "../../../kit/menu/menu";
import { gate } from "../../../legacy-verbs";
import { useKept } from "../../home/drawer";
import { PaneSheet } from "../../home/pane-sheet";
import { CmPreviewFold } from "../../parts/preview-fold";
import { CmPane } from "../../parts/split";
import type { AdsVerbs } from "../store";
import { AdCallout } from "./callout";
import { AdEdit } from "./edit";
import { Foot, hasFoot } from "./foot";
import { AdPeople } from "./people";
import { AdPreview } from "./preview";
import { AdReach } from "./reach";
import { AdResults } from "./results";
import { AdSentence } from "./sentence";
import { usePane } from "./use-pane";
import type { Flash, Pane } from "./use-pane";

/** The name, with its pen: a title said in place, saved as it is typed; Enter says so. */
function Name({ pane }: { pane: Pane }) {
  return (
    <span className="pb-title-wrap" data-testid="ads-name">
      <Field
        className="pb-title-box"
        shape="title"
        value={pane.typed ?? pane.ad.name}
        placeholder={DRAWER.edit.namePlaceholder}
        onValueChange={pane.rename}
        maxLength={80}
        spellCheck={false}
        aria-label={DRAWER.edit.pen}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          if (e.key !== "Enter") return;
          pane.renamed();
          e.currentTarget.blur();
        }}
        data-testid="ads-name-box"
      />
      <Icon name="pencil" size={13} />
    </span>
  );
}

/** Its state, quiet: a dot and one word. `On` is the only green word; amber is only for what needs the owner. */
function State({ state }: { state: AdDrawerVM["state"] }) {
  return (
    <span className="ads-state" data-tone={state.tone} data-testid="ads-state">
      <span className="ads-state-dot" aria-hidden="true" />
      {state.word}
    </span>
  );
}

/** The head's ⋯: Ask about this ad, Make a copy, and End this ad, which asks first (not for an ad that is done or not ours). */
function More({ pane }: { pane: Pane }) {
  const { vm } = pane;
  const items: MenuItem[] = [
    { label: DRAWER.menu.ask, glyph: <Icon name="three" size={13} />, onSelect: pane.askAboutAd },
    { label: DRAWER.menu.copy, glyph: <Icon name="copy" size={13} />, onSelect: pane.copy },
  ];
  if (vm.mode !== "done" && vm.madeHere) {
    items.push({
      label: DRAWER.menu.end,
      glyph: <Icon name="x" size={13} />,
      tone: "danger",
      gate: gate("approve", GATE.end),
      onSelect: () => pane.ask("end"),
    });
  }
  return (
    <Menu
      label={DRAWER.menu.label}
      trigger={
        <Button variant="quiet" size="sm" iconOnly aria-label={DRAWER.menu.label} data-testid="ads-more">
          <Icon name="more" size={14} />
        </Button>
      }
      groups={[{ items }]}
    />
  );
}

/** The message, folded under its first words, opening onto the ad as it reads and what happens when a person taps it. */
function Fold({ vm }: { vm: AdDrawerVM }) {
  return (
    <div className="ads-preview" data-testid="ads-preview">
      <CmPreviewFold id={`ads-preview-${vm.id}`} body={vm.preview.excerpt} testid="ads-preview-fold">
        <AdPreview preview={vm.preview} />
      </CmPreviewFold>
    </div>
  );
}

/** The body, down one column: what stops it, what is left, the sentence, what it runs on, what it brought, how it reads, who. */
function AdBody({ pane }: { pane: Pane }) {
  const { vm, editing } = pane;
  return (
    <div className="cm-sentence ads-body" data-testid="ads-detail" data-mode={vm.mode}>
      <AdCallout callout={vm.callout} onAct={pane.calloutAct} spent={pane.spent} />
      <p className="cm-next" data-testid="ads-next">
        <Icon name="calendar" size={13} />
        <span>{vm.next}</span>
      </p>
      {editing ? <p className="ads-hint">{EDIT.tapHint}</p> : null}
      <AdSentence
        parts={vm.sentence}
        editing={editing}
        changed={pane.changed}
        onChange={pane.onChip}
        edit={vm.edit}
        offers={pane.offers}
        readOnly={vm.mode === "done" || !vm.madeHere}
        onEdit={pane.edit.start}
      />
      {vm.adopted ? (
        <p className="ads-line" data-testid="ads-adopted">
          {vm.adopted}
        </p>
      ) : null}
      {editing ? (
        <AdEdit
          ad={pane.ad}
          changed={pane.changed}
          onWords={pane.edit.words}
          onPhoto={pane.edit.photo}
          onCopy={pane.copy}
        />
      ) : null}
      <AdReach reach={vm.reach} />
      <AdResults vm={vm} />
      <Fold vm={vm} />
      <AdPeople people={vm.people} />
    </div>
  );
}

interface PaneProps {
  ad: AdRead;
  read: AdsRead;
  config: AdsConfig;
  verbs: AdsVerbs;
  flash: Flash;
  onClose: () => void;
  onGo?: (route: string) => void;
}

/** The ad's pane: its head (name, state, ⋯), its body and its foot. */
function AdPane(props: PaneProps) {
  const pane = usePane(props);
  return (
    <CmPane
      testid="ads-pane"
      className="ads-pane"
      title={<Name pane={pane} />}
      tools={
        <>
          <State state={pane.vm.state} />
          <More pane={pane} />
        </>
      }
      foot={hasFoot(pane) ? <Foot pane={pane} /> : null}
      onClose={pane.close}
    >
      <AdBody pane={pane} />
    </CmPane>
  );
}

interface AdDrawerProps {
  /** The ad the address names, or null while none is open; the last one stays drawn while the sheet leaves. */
  id: string | null;
  read: AdsRead;
  config: AdsConfig;
  verbs: AdsVerbs;
  onClose: () => void;
  flash: Flash;
  /** Opens another address with Back to return (a copy of the ad, running it again): the page's push. */
  onGo?: (route: string) => void;
}

export function AdDrawer({ id, read, config, verbs, onClose, flash, onGo }: AdDrawerProps) {
  const kept = useKept(id);
  if (kept === null) return null;
  const ad = read.ads.find((a) => a.id === kept);
  return (
    <PaneSheet
      open={id !== null}
      title={ad ? DRAWER.kicker(PLATFORM_WORD[ad.platform], DOOR[ad.door].label) : NO_AD.title}
      onClose={onClose}
      askFirst
      testid="ads-drawer"
    >
      {ad ? (
        <AdPane
          key={ad.id}
          ad={ad}
          read={read}
          config={config}
          verbs={verbs}
          flash={flash}
          onClose={onClose}
          onGo={onGo}
        />
      ) : (
        <EmptyState kind="line" title={NO_AD.title} body={NO_AD.body} testid="ads-gone" />
      )}
    </PaneSheet>
  );
}
