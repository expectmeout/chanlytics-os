/**
 * Go live (decision 0073, canvas 5A–5C): the first run's last step, as contracts say where it stands (first-run-golive.ts).
 * Pay (pay.tsx), confirming with the bank, no line provider here, Switch it on (switch-on.tsx), or You're live
 * (live.tsx, with Live's own summary under it).
 */
import type { ReactNode } from "react";
import type {
  FirstRunGoLiveVM,
  FirstRunLiveVM,
  FirstRunPhoneVM,
  FirstRunTryVM,
  WhatsappChoice,
} from "@chanlytics/contracts";
import type { WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
import type { LegacyFlash } from "../../../legacy-verbs";
import type { CardBrain } from "../inputs";
import type { KeptPhoneChoice } from "../memory";
import { FrLive } from "../parts";
import { FrConfirming, FrNoProvider, FrPay } from "./pay";
import { FrSwitchOn } from "./switch-on";
import { FrYoureLive } from "./live";

export function FrGoLive(o: {
  gl: FirstRunGoLiveVM;
  ph: FirstRunPhoneVM;
  tr: FirstRunTryVM | null;
  lv: FirstRunLiveVM | null;
  choice: KeptPhoneChoice | null;
  setChoice: (c: KeptPhoneChoice | null) => void;
  whatsapp: WhatsappChoice | null;
  waNumber: string | null;
  assistant: string | null;
  config: WorkspaceSettings | null;
  brain: CardBrain | null;
  canEdit: boolean;
  owner: boolean;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
  leave: (to: string) => void;
  back: string | null;
  /** Setup's own rows for what Switch it on cannot do itself (gl.rows), drawn by the page. */
  rows: ReactNode;
  /** A test call has been on screen since the owner last moved: its row stays open, whatever its state. */
  tryHeld: boolean;
}): ReactNode {
  const { gl, ph, tr, lv, choice, setChoice, flash, go, leave, back } = o;
  switch (gl.stage) {
    case "pay":
      return <FrPay gl={gl} ph={ph} choice={choice} setChoice={setChoice} flash={flash} go={go} back={back} />;
    case "confirming":
      return <FrConfirming />;
    case "noProvider":
      return <FrNoProvider now={gl.noProvider?.now ?? null} flash={flash} leave={leave} />;
    case "switch":
      return (
        <FrSwitchOn
          gl={gl}
          ph={ph}
          tr={tr}
          choice={choice}
          setChoice={setChoice}
          whatsapp={o.whatsapp}
          waNumber={o.waNumber}
          flash={flash}
          go={go}
          leave={leave}
          assistant={o.assistant}
          rows={o.rows}
          tryHeld={o.tryHeld}
        />
      );
    case "live":
      return gl.live ? (
        <FrYoureLive
          live={gl.live}
          leave={leave}
          go={go}
          whatsapp={o.whatsapp}
          waNumber={o.waNumber}
          flash={flash}
          summary={
            lv ? (
              <FrLive lv={lv} config={o.config} brain={o.brain} canEdit={o.canEdit} owner={o.owner} leave={leave} />
            ) : null
          }
        />
      ) : null;
  }
}
