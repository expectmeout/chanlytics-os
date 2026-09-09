import type { Metadata } from "next";

/**
 * How to have data deleted, on a page of its own.
 *
 * The privacy policy already says all of this, spread across "How long we
 * keep it" and "Your rights". Meta's app settings, Google's consent screen
 * and the app stores each want a URL whose whole subject is deletion, and a
 * reviewer who lands halfway down a policy does not find it. So this page
 * says the same things in one place, and says nothing the policy does not.
 *
 * Public: middleware.ts lists it beside /privacy and /terms.
 */
export const metadata: Metadata = { title: "Deleting your data · Chanlytics", robots: { index: true } };

export default function DataDeletionPage() {
  return (
    <main className="legal">
      <h1>Deleting your data</h1>
      <p className="legal-meta">Chanlytics OS · last updated September 8, 2026</p>

      <p>Who to ask depends on whose data it is. A business that uses Chanlytics OS decides what it keeps about its own customers; we hold that data on the business’s behalf. So there are two paths, and both end in the same place.</p>

      <h2>If you own a Chanlytics workspace</h2>
      <p>Write to <a href="mailto:hi@chanlytics.com">hi@chanlytics.com</a> from the email address on the account and ask us to delete the workspace. We remove it and everything in it — conversations, contacts, call transcripts and recordings, and the credentials for every service you connected — within 30 days, except what the law requires us to keep. There is nothing to pay and no notice period.</p>
      <p>Take what you want to keep first. Contacts export from People, and any single conversation or call exports from its own page.</p>

      <h2>If you wrote to a business that uses Chanlytics</h2>
      <p>The business is the controller of your data, so ask the business directly and it can delete you from its workspace. If that is not possible, write to <a href="mailto:hi@chanlytics.com">hi@chanlytics.com</a> with the number you messaged from and the name of the business; we will pass the request to it and help it answer.</p>
      <p>To stop receiving messages without deleting anything, reply <b>STOP</b> to any text or WhatsApp message from the business. That takes effect immediately, whatever else is happening.</p>

      <h2>Disconnecting a service</h2>
      <p>Disconnecting WhatsApp, a phone line or a Google Business Profile in Settings › Connections removes what that connection gave us. Disconnecting Google also gives the permission back to Google and deletes the reviews we had read. Disconnecting is not the same as deleting the workspace: the conversations already in the product stay until the workspace is deleted.</p>

      <h2>How long it takes</h2>
      <p>We answer a deletion request within 30 days and usually within a few days. Backups roll off on their own schedule, so a copy can survive in an encrypted backup for a short while after the live data is gone; it is never restored into the product.</p>

      <p className="legal-foot">Chanlytics OS · <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of service</a></p>
    </main>
  );
}
