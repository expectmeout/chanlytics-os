import type { Metadata } from "next";

/**
 * The privacy policy: public, static, reads nothing. Google's consent
 * screen, Meta's app settings and the carriers' registrations each link to
 * it, so it says in plain words what the product holds and why, names the
 * services that process it, and carries the two sentences those reviews
 * look for — Google's Limited Use disclosure and the carriers' line on
 * mobile information.
 */
export const metadata: Metadata = { title: "Privacy · Chanlytics", robots: { index: true } };

export default function PrivacyPage() {
  return (
    <main className="legal">
      <h1>Privacy policy</h1>
      <p className="legal-meta">Chanlytics OS · last updated September 7, 2026</p>

      <p>Chanlytics OS is a receptionist for small businesses: it answers a business's customers on WhatsApp, by phone and by text, keeps the conversations where the owner can read them, and helps the owner reply to reviews and reach customers who asked to hear from them. This policy says what we hold to do that, why, who else touches it, and what you can do about it.</p>

      <h2>Who we are</h2>
      <p>Chanlytics ("we", "us") operates Chanlytics OS at app.chanlytics.com. When a business ("the workspace owner") signs up, it is the controller of its customers' data; we process that data on its behalf and under its instructions. Questions about this policy go to <a href="mailto:privacy@chanlytics.com">privacy@chanlytics.com</a>.</p>

      <h2>What we hold</h2>
      <ul>
        <li><b>Account data</b>: the owner's name and work email, the team members they invite, the business's name, address, hours, services and the facts the receptionist answers with.</li>
        <li><b>Conversations</b>: messages customers send to the business's connected numbers and the replies sent back, call transcripts and, where the owner enables it, call recordings, together with the phone number or account that sent them.</li>
        <li><b>Customer records</b>: the people who wrote or called, their number, the name they gave, whether they said yes to offers and when, and notes the owner adds.</li>
        <li><b>Connected services</b>: what a connected service tells us — a WhatsApp number's status, a phone line's state, a Google Business Profile's reviews and the replies posted to them, the events in a calendar feed the owner pastes.</li>
        <li><b>Billing</b>: the plan, the subscription's status and the card's brand and last four digits. Card numbers never reach us; Stripe holds them.</li>
        <li><b>Usage</b>: sign-ins, the actions taken in the product, and the technical logs needed to keep it working and secure.</li>
      </ul>

      <h2>Why we hold it</h2>
      <ul>
        <li>To answer the business's customers, on the channels the owner connected, within the rules the owner set.</li>
        <li>To show the owner what was said and done, and to let a person take over a conversation.</li>
        <li>To send messages the owner asked us to send, only to people who agreed to receive them, with a way to stop at any time.</li>
        <li>To bill the workspace, to secure the service, and to meet legal obligations.</li>
      </ul>
      <p>We do not sell personal data, and we do not use a workspace's conversations to advertise to anyone.</p>

      <h2>Automated replies</h2>
      <p>The receptionist's replies are drafted by an AI model from the business's facts and the conversation. The owner decides how much it may do on its own; a person can read, correct and take over at any time. Conversations may be sent to the AI model providers named below to produce a reply; they process them to provide the service and do not use them to train their models.</p>

      <h2>Who else processes it</h2>
      <p>We use the following services to run the product. Each holds only what its part needs.</p>
      <ul>
        <li>Supabase (database and sign-in) and Vercel (hosting).</li>
        <li>Meta (WhatsApp Business Platform) for WhatsApp messages and templates.</li>
        <li>Twilio for phone numbers and text messages, and Retell for phone calls.</li>
        <li>Google (Business Profile and Maps) for reviews and replies, when the owner connects them.</li>
        <li>Anthropic and OpenAI for the receptionist's drafts.</li>
        <li>Stripe for billing, and Resend for the emails we send you.</li>
      </ul>

      <h2>Google user data</h2>
      <p>When a workspace owner connects a Google Business Profile, we ask Google for permission to manage that business's listings. We use it to read the business's reviews, to show them to the owner, and to post the replies the owner writes or approves. We store the access Google grants so the connection keeps working, and we remove it when the owner disconnects. Chanlytics' use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

      <h2>Text messages</h2>
      <p>A business's customers receive texts only when they contacted the business first, or when they agreed to receive offers by texting a keyword or on the business's sign-up page. Message and data rates may apply. Reply STOP to stop and HELP for help. No mobile information will be shared with third parties or affiliates for marketing or promotional purposes; all other categories of sharing exclude text-messaging originator opt-in data and consent, which will not be shared with any third parties.</p>

      <h2>How long we keep it</h2>
      <p>Account and conversation data stays while the workspace exists. Call recordings are kept for 90 days. An owner can export a workspace's data and can ask us to delete the workspace, after which its data is removed within 30 days, except what the law requires us to keep.</p>

      <h2>Your rights</h2>
      <p>You can ask what we hold about you, ask for it to be corrected or deleted, and object to how it is used, by writing to <a href="mailto:privacy@chanlytics.com">privacy@chanlytics.com</a>. If you are a customer of a business that uses Chanlytics, the business is the controller of your data; we will pass your request to it and help it answer.</p>

      <h2>Security</h2>
      <p>Data travels encrypted and is stored encrypted at rest. Credentials for connected services are kept in a vault the product's pages cannot read. Access inside Chanlytics is limited to what running and supporting the service requires.</p>

      <h2>Changes</h2>
      <p>When this policy changes, the date above changes with it and workspace owners are told in the product.</p>

      <p className="legal-foot">Chanlytics OS · <a href="/terms">Terms of service</a> · <a href="https://www.chanlytics.com" target="_blank" rel="noreferrer">chanlytics.com</a></p>
    </main>
  );
}
