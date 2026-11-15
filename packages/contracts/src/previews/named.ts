/**
 * A preview's receptionist under another name (00631 lead_named: its sender put the lead's name right). The server's
 * alone, and apart from what a business makes of its preview (theirs.ts), which its page loads: this reads the settings'
 * own schema for how long a name may be, and a page loads no schema.
 */
import { isBaselinePrompt, newReceptionistDefaults } from "../config/workspace-config/brain-config";
import { BrainConfigSchema, type BrainConfig } from "../config/workspace-config/brain-config-schema";

/** As long as a receptionist's name may be (the settings' own limit). */
const NAME_MAX = BrainConfigSchema.shape.business_name.maxLength ?? Infinity;

/**
 * The same receptionist under `name`: the name it answers by, and the product's own prompt written under it. A prompt
 * somebody wrote is theirs and stays. Null where it answers by that name already, or the name is none.
 */
export function withPreviewNamed(brain: BrainConfig, name: string): BrainConfig | null {
  const next = name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
  if (!next || next === brain.business_name) return null;
  return {
    ...brain,
    business_name: next,
    ...(isBaselinePrompt(brain.system_prompt) ? { system_prompt: newReceptionistDefaults(next).system_prompt } : {}),
  };
}
