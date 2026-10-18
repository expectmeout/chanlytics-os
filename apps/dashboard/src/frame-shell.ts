import type { ComponentProps, ComponentType } from "react";
import type LegacyApp from "./legacy-bridge/LegacyApp";

/**
 * The shell as every build but a browser's sees it: nothing. LegacyHost imports the shell as `#frame-shell`, which the
 * browser's build resolves to LegacyApp itself (package.json "imports", the `browser` condition) and the server's to
 * this. The shell's modules read `window` as they evaluate, so the server must never evaluate them, and LegacyHost draws
 * the shell in a browser alone (`ssr: false`): this is never drawn.
 */
const FrameShell: ComponentType<ComponentProps<typeof LegacyApp>> = () => null;

export default FrameShell;
