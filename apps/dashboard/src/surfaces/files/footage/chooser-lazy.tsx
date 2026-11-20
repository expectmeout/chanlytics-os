/**
 * The folder chooser, loaded when it is first opened: the row in Settings and AI's card both open it, and neither
 * carries it until then.
 */
import { lazy } from "react";

export const LazyFolderChooser = lazy(() => import("./chooser").then((m) => ({ default: m.FolderChooser })));
