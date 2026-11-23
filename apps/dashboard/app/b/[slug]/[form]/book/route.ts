/**
 * /b/<workspace>/<form>/book: "Book on their page" (the Forms plan, F3). A form whose business offers its own booking
 * page sends people there through this: the open is counted for the form's day, and the visitor goes on to that page.
 * Public, and no session is read. The rest is src/server/public/form-book.ts.
 */
import { sendToBookingPage } from "@/server/public/form-book";

type Ctx = { params: Promise<{ slug: string; form: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const { slug, form } = await ctx.params;
  return sendToBookingPage(slug, form, request);
}
