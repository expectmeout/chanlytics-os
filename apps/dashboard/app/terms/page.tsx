import type { Metadata } from "next";

/**
 * The terms of service: public, static, reads nothing. Plain words on what
 * the product is, what an owner agrees to when they connect a number or
 * send to their customers, how billing works, and where the receptionist's
 * limits are.
 */
export const metadata: Metadata = { title: "Terms · Chanlytics", robots: { index: true } };

export default function TermsPage() {
  return (
    <main className="legal">
      <h1>Terms of service</h1>
      <p className="legal-meta">Chanlytics OS · last updated September 7, 2026</p>

      <p>These terms are the agreement between Chanlytics ("we", "us") and the business that opens a workspace in Chanlytics OS ("you"). Opening a workspace, or using one you were invited to, means you agree to them.</p>

      <h2>The service</h2>
      <p>Chanlytics OS answers your customers on the channels you connect — WhatsApp, a phone line, text messages — using an AI receptionist that speaks from the facts you give it, within the limits you set. It keeps every conversation where you and your team can read it, lets a person take over, and helps you reply to reviews and reach customers who asked to hear from you.</p>

      <h2>Your account</h2>
      <ul>
        <li>You must be able to act for the business you sign up. You are responsible for who you invite and for what they do in the workspace.</li>
        <li>Sign-in is with your Google account or by a code sent to your email; keep that inbox and that account secure.</li>
        <li>The facts you give the receptionist — hours, prices, services, policies — are yours to keep true. The receptionist answers with them as they are.</li>
      </ul>

      <h2>Connected numbers and services</h2>
      <ul>
        <li>You may only connect numbers and accounts you are entitled to use. Connecting WhatsApp, Google or a phone line also binds you to those providers' terms.</li>
        <li>A phone line we provide is registered with the carriers in your business's name; you agree to give true information for that registration.</li>
        <li>Disconnecting a service stops what depends on it; what was already recorded stays in your workspace until you remove it.</li>
      </ul>

      <h2>Messages you send</h2>
      <ul>
        <li>Campaigns and playbooks reach only people who agreed to hear from you, in the way the product records. You may not import contacts who did not agree, and you may not remove the way to opt out.</li>
        <li>You are responsible for the content of the messages you send and for following the laws on marketing messages where your customers are, including quiet hours and consent.</li>
        <li>Chanlytics may pause sending from a workspace that generates complaints, opt-out rates or reports that put the shared sending infrastructure at risk, and will tell you why.</li>
      </ul>

      <h2>The receptionist's limits</h2>
      <p>The receptionist is software. It says so when asked, it does not give legal, medical or financial advice, and it works within the rules you set. It can be wrong. Read what it says, correct the facts it works from, and take over when a conversation needs a person. We are not liable for what a customer does on the basis of an automated reply.</p>

      <h2>Billing</h2>
      <ul>
        <li>Plans and prices are as shown at checkout. A trial ends on the day shown; the card on file is charged then unless you cancel before.</li>
        <li>Subscriptions renew monthly until cancelled. Cancel any time from Billing; the workspace stays open until the end of the period paid for.</li>
        <li>If a payment fails, we retry for a few days and then pause the receptionist. Messages keep arriving and are kept for you; nothing is answered until billing resumes.</li>
        <li>Fees for numbers, carrier registrations and usage beyond the plan's allowance are shown in Billing before they apply.</li>
      </ul>

      <h2>Your data</h2>
      <p>Your workspace's data is yours. We process it to run the service, as the <a href="/privacy">privacy policy</a> describes. You can export it at any time and ask us to delete the workspace.</p>

      <h2>Acceptable use</h2>
      <p>Do not use Chanlytics to send unsolicited messages, to deceive people about who is writing, to collect data you have no right to, or to break the law or the rules of a connected provider. Do not probe, overload or reverse engineer the service.</p>

      <h2>Availability and changes</h2>
      <p>We aim to keep the service available at all times and tell you in the product when something is degraded. We may change the product; when a change removes something you rely on, we will say so ahead of time. We may end the service with 30 days' notice, and you may leave at any time.</p>

      <h2>Liability</h2>
      <p>The service is provided as it is. To the extent the law allows, our liability to you for any claim is limited to the fees you paid us in the twelve months before the claim, and we are not liable for indirect losses such as lost business or profits.</p>

      <h2>Ending the agreement</h2>
      <p>You end it by deleting your workspace. We may end it if you break these terms, with notice where the breach can be fixed. When it ends, the privacy policy says what happens to the data.</p>

      <h2>Contact</h2>
      <p>Questions about these terms go to <a href="mailto:hi@chanlytics.com">hi@chanlytics.com</a>.</p>

      <p className="legal-foot">Chanlytics OS · <a href="/privacy">Privacy policy</a> · <a href="https://www.chanlytics.com" target="_blank" rel="noreferrer">chanlytics.com</a></p>
    </main>
  );
}
