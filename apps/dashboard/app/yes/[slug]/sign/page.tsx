import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { deskSignMetadata, deskSignVM } from "@chanlytics/contracts";
import { consentPageFor } from "@/server/public/consent-page";
import { printableOrigin } from "@/server/origin";
import { DeskSign } from "@/yes/DeskSign";

/**
 * A workspace's desk sign: the offers code, printed and put where customers wait.
 *
 * The code was on every page an owner looks at and on nothing a customer does: Broadcasts offered it as an .svg to
 * download, and the page beside this one shows it among a page of disclosures. This is one sheet with the business's
 * name, what a yes gets you, the code at a size that scans from where a customer stands, and the words a call to
 * action owes -- contracts' deskSignVM, which takes them from the page's own offers ask.
 *
 * Public for the reason its neighbours are: it is printed from wherever the owner happens to be, and it shows nothing
 * the opt-in page does not. It takes no input, and it is not indexed.
 */
// Named as the sheet it is, for the business on it, or Not found (the wiring audit's N14 and N21); the rule is contracts'.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return deskSignMetadata(await consentPageFor(slug));
}
export const dynamic = "force-dynamic";

export default async function DeskSignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const facts = await consentPageFor(slug);
  if (!facts) notFound();
  const vm = deskSignVM(facts);
  // The addresses are PRINTED, so they come from the allow-list and never from the request's own headers: a sign
  // built from a host header someone else chose would send a customer to read the privacy policy at their address.
  const h = await headers();
  const origin = printableOrigin(h.get("x-forwarded-proto"), h.get("x-forwarded-host") ?? h.get("host"));
  // Error correction Q where the screens use M: paper gets creased, taped over and laminated under glare, and Q reads
  // with a quarter of the code gone. A four-module quiet zone, the standard's own, because paper has no card around it.
  const qr = vm.qrLink ? await QRCode.toString(vm.qrLink, { type: "svg", margin: 4, errorCorrectionLevel: "Q" }) : null;
  return <DeskSign vm={vm} qr={qr} host={origin.replace(/^https?:\/\//, "")} />;
}
