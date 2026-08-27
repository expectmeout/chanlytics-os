import { defineConfig } from "tsup";
// Workspace-internal deps are bundled INTO dist (the edge imports dist by
// relative path — nothing may resolve through node_modules symlinks there).
export default defineConfig({ noExternal: [/^@chanlytics\//] });
