import type { ComponentProps, ComponentType } from "react";
import type FrameApp from "./bridge/FrameApp";

/**
 * The shell as every build but a browser's sees it: nothing. FrameHost imports the shell as `#frame-shell`, which the
 * browser's build resolves to FrameApp itself (package.json "imports", the `browser` condition) and the server's to
 * this. The shell's modules read `window` as they evaluate, so the server must never evaluate them, and FrameHost draws
 * the shell in a browser alone (`ssr: false`): this is never drawn.
 */
const FrameShell: ComponentType<ComponentProps<typeof FrameApp>> = () => null;

export default FrameShell;
