/**
 * A channel's glyph in a row (moved whole from legacy/pages/clients-bits.jsx, decision 0015): the wire's own mark, a
 * phone's, a text's or an address's, small, with the first one the row's primary. The person page's JSX still draws it by
 * name (people-globals.ts publishes it as window.ChannelGlyph until the profile moves).
 */
import { Icon } from "../../kit/icon/icon";

const CHANNEL_GLYPHS: Record<string, string> = {
  phone: "phone",
  sms: "chat",
  email: "mail",
  instagram: "instagram",
  chat: "chat",
};

export function ChannelGlyph({ kind, primary = false, size = 12 }: { kind: string; primary?: boolean; size?: number }) {
  const name = CHANNEL_GLYPHS[kind] || "chat";
  return (
    <span className={`cl-row-channel${primary ? " cl-row-channel-primary" : ""}`}>
      <Icon name={name} size={size} />
    </span>
  );
}
