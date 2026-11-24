/**
 * /f/fit.js: the small script a business's pasted lines load beside a framed form (the Forms plan, F4). It fits each
 * frame to its form and hands it the campaign labels of the page's address. Public, the same for every site, and
 * optional: without it the frame keeps its height. The rest is src/server/public/form-frame.ts.
 */
import { fitScript } from "@/server/public/form-frame";

export function GET(): Response {
  return fitScript();
}
