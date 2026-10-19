/**
 * The Business tab's saver and the rows' and folds' tables, as one object: what save.tsx holds (the tab's one saver,
 * each row's stored form, check and patch) with what folds.ts adds (what each fold opens with, refuses and writes).
 * The JSX built it on the window in two steps, one per file (`window.__businessTabSave`); every reader imports it now, the
 * first run among them (setup/shell.ts).
 */
import { FOLDS } from "./folds";
import { SAVE } from "./save";

export const businessTabSave = Object.assign(SAVE, FOLDS);
export type BusinessTabSave = typeof businessTabSave;
