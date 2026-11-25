import { sheetsLayout } from "@/styles/sheets-layout";

/**
 * The Console's frame (decision 0066): its page, prerendered once for every person, as the OS frame is, with its own
 * stylesheets around it. The Console's own (surfaces/console/console.css) is the last of the list
 * (src/styles/sheets.json), and no customer's page carries it: no customer's page draws a rule of it.
 */
export default sheetsLayout("console");
