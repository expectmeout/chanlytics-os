"use client";

import { TemplatesPage } from "@/surfaces/campaigns/templates/templates-page";

/**
 * /w/<slug>/templates: the messages a workspace sends, in every language, with what sends each one (decision 0015, step 7):
 * its code is `src/surfaces/campaigns/templates/`, and the frame in the layout draws its chrome around this page. The
 * shell's route is still `messages`; the path says the product's word, and `/w/<slug>/messages` and `#/messages` move to it
 * for ever.
 */
export default function Page() {
  return <TemplatesPage />;
}
