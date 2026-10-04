/**
 * The panes of Settings that have moved, which Settings' page still draws by name (legacy/pages/settings.jsx) until its
 * frame moves (decision 0015 step 11, one pane at a time). The app publishes them from seed-globals.ts before any page
 * loads, under the names their JSX published; each goes with Settings' frame.
 */
import { PaneAutonomyReal } from "./autonomy/pane";
import { PaneBillingReal } from "./billing/pane";
import { PaneIntegrationsReal } from "./connections/pane";
import { PaneNotificationsReal } from "./notifications/pane";
import { PaneProfile } from "./profile/pane";
import { TeamSection } from "./team/team";

export const SETTINGS_GLOBALS = {
  PaneAutonomyReal,
  PaneBillingReal,
  PaneIntegrationsReal,
  PaneNotificationsReal,
  PaneProfile,
  // The Partner pane's Team draws it under its partner card (partner-real.jsx) by this name too.
  TeamSection,
};
