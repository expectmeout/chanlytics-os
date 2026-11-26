/**
 * The registration, run: one idempotent step at a time over a port that
 * makes the request and hands back what Twilio said. The saga records
 * every receipt before the next call, so a resumed run repeats nothing —
 * which matters here more than anywhere else in this product, because a
 * repeated brand registration is a second fee for the same business.
 *
 * Pure of the network and of the database: the edge supplies both.
 */
import { A2P_POLICIES, type A2PRequest } from "./a2p/wire";
import { brandTypeFor, type BusinessRecord } from "./a2p/business-record";
import {
  addressRequest,
  assignRequest,
  a2pProfileEndUserRequest,
  a2pProfileRequest,
  businessEndUserRequest,
  starterProfileRequest,
  starterEndUserRequest,
  starterAttributes,
  soleProprietorProfileRequest,
  soleProprietorEndUserRequest,
  customerProfileRequest,
  evaluateRequest,
  evaluateTrustProductRequest,
  representativeEndUserRequest,
  submitProfileRequest,
  submitTrustProductRequest,
  supportingDocumentRequest,
  trustProductAssignRequest,
  businessAttributes,
  representativeAttributes,
  updateEndUserRequest,
} from "./a2p/trust-hub";
import { brandRequest, campaignRequest, type CampaignFacts } from "./a2p/brand-campaign";
import { EMPTY_A2P_STATE, nextA2PStep, type A2PState, type A2PStep } from "./a2p/steps";
import { isBrandNotReady } from "./a2p/verdict";
import { columnWritten } from "./lines";

export interface A2PAnswer {
  status: number;
  body: Record<string, unknown> | null;
}

export interface A2PPorts {
  /** One request, as the master account. Never throws for a refusal; the status says it. */
  send(req: A2PRequest): Promise<A2PAnswer>;
  /** The account the address is created under. */
  accountSid: string;
  /** Chanlytics' own approved primary profile: what makes these customers ours. */
  primaryProfileSid: string;
  /** Where Twilio writes about the bundle; the platform's mailbox, not the customer's. */
  email: string;
  /** Where status callbacks land, when the deployment has a public one. */
  statusCallback?: string;
  /** Keep a receipt before the next call runs. */
  save(patch: Partial<A2PState>): Promise<void>;
  /** The workspace, for the names a reviewer reads. */
  workspace: { name: string };
  record: BusinessRecord;
  /** Twilio's vertical enum. The sole-proprietor end user asks for it by name. */
  industry: string;
  campaign: Omit<CampaignFacts, "brandSid" | "messagingServiceSid" | "useCase">;
  messagingServiceSid: string;
  useCase: string;
  /** Twilio's free test registry: no fee, no real routing, gone in thirty days. */
  mock: boolean;
  /**
   * Skip the automatic secondary vetting on the brand. It costs about ten times
   * the brand registration and buys only throughput this product's LOW_VOLUME
   * campaigns cannot use -- see brandRequest.
   */
  skipVetting: boolean;
}

export type A2PResult =
  | { ok: true; state: A2PState }
  /** `pending` is a wait, not a refusal: the carriers have not finished with the brand. */
  | { ok: false; step: A2PStep; error: string; pending: boolean; state: A2PState };

const sid = (a: A2PAnswer): string | null => (typeof a.body?.sid === "string" ? a.body.sid : null);

function twilioRefusal(a: A2PAnswer, text: string): string {
  const msg = typeof a.body?.message === "string" ? a.body.message : `HTTP ${a.status}`;
  const code = typeof a.body?.code === "number" ? ` (Twilio ${a.body.code})` : "";
  return `${text}: ${msg}${code}`;
}

const ok = (a: A2PAnswer) => a.status >= 200 && a.status < 300;

/** What a step reads: the run's state as it stands, its ports, which registration it is, and how a sid is asked for. */
interface StepRun {
  state: A2PState;
  ports: A2PPorts;
  soleProp: boolean;
  brandType: ReturnType<typeof brandTypeFor>;
  need: (request: A2PRequest, text: string) => Promise<string>;
}

/** A request that must land, said as what it was doing when it did not. */
async function requestLanded(ports: A2PPorts, request: A2PRequest, text: string): Promise<void> {
  const a = await ports.send(request);
  if (!ok(a)) throw new Error(twilioRefusal(a, text));
}

/**
 * Each step's requests, and the receipt it saves once they land. WHICH registration this is: a business with a tax id
 * files a company, a sole proprietor files a person. The steps share five of their nine stages, so this is a fork inside
 * one saga rather than two sagas that would drift apart at the shared end.
 */
const STEP_FILINGS: Record<A2PStep, (run: StepRun) => Promise<Partial<A2PState>>> = {
  profile: async ({ ports, soleProp, need }) => ({
    profileSid: await need(
      (soleProp ? starterProfileRequest : customerProfileRequest)({
        friendlyName: ports.workspace.name,
        email: ports.email,
        statusCallback: ports.statusCallback,
      }),
      "creating the customer's profile",
    ),
  }),
  // The one end user each policy asks for. The starter profile wants a PERSON -- name, email, phone -- where the
  // secondary wants a company and its tax id. Same slot in the state because both are "the thing the profile is about",
  // and keeping one receipt keeps a resumed run from filing a second.
  business: async ({ state, ports, soleProp, need }) => {
    const id = await need(
      soleProp ? starterEndUserRequest(ports.record) : businessEndUserRequest(ports.record),
      soleProp ? "recording who you are" : "recording the business",
    );
    await requestLanded(
      ports,
      assignRequest(columnWritten(state, "profileSid"), id),
      soleProp ? "attaching your details" : "attaching the business",
    );
    return { businessSid: id };
  },
  representative: async ({ state, ports, need }) => {
    const id = await need(representativeEndUserRequest(ports.record), "recording the person who signs");
    await requestLanded(ports, assignRequest(columnWritten(state, "profileSid"), id), "attaching the person who signs");
    return { representativeSid: id };
  },
  address: async ({ ports, need }) => ({
    addressSid: await need(addressRequest(ports.accountSid, ports.record), "recording the address"),
  }),
  document: async ({ state, ports, need }) => {
    const id = await need(
      supportingDocumentRequest({ legalName: ports.record.legalName, addressSid: columnWritten(state, "addressSid") }),
      "attaching the address",
    );
    await requestLanded(ports, assignRequest(columnWritten(state, "profileSid"), id), "attaching the address document");
    return { documentSid: id };
  },
  primary: async ({ state, ports }) => {
    await requestLanded(
      ports,
      assignRequest(columnWritten(state, "profileSid"), ports.primaryProfileSid),
      "naming us as the provider",
    );
    return { primaryAssigned: true };
  },
  submit: (run) => submitProfile(run),
  // The messaging profile is the OTHER half of the pair. A sole proprietor's is a different policy carrying a different
  // end user: brand name, the owner's mobile, and the vertical. The mobile is the whole point -- it is where the carriers
  // send the code the owner has to reply to.
  a2p_profile: async ({ state, ports, soleProp, need }) => {
    const bundle = await need(
      (soleProp ? soleProprietorProfileRequest : a2pProfileRequest)({
        friendlyName: ports.workspace.name,
        email: ports.email,
        statusCallback: ports.statusCallback,
      }),
      "creating the messaging profile",
    );
    const endUser = await need(
      soleProp
        ? soleProprietorEndUserRequest(ports.record, ports.industry)
        : a2pProfileEndUserRequest({ friendlyName: ports.workspace.name, companyType: ports.record.companyType }),
      soleProp ? "recording your mobile for the carriers' code" : "recording the company type",
    );
    for (const objectSid of [endUser, columnWritten(state, "profileSid")])
      await requestLanded(ports, trustProductAssignRequest(bundle, objectSid), "attaching to the messaging profile");
    await requestLanded(ports, evaluateTrustProductRequest(bundle), "checking the messaging profile");
    await requestLanded(ports, submitTrustProductRequest(bundle), "submitting the messaging profile");
    return { a2pProfileSid: bundle };
  },
  brand: async ({ state, ports, brandType, need }) => ({
    brandSid: await need(
      brandRequest({
        customerProfileBundleSid: columnWritten(state, "profileSid"),
        a2pProfileBundleSid: columnWritten(state, "a2pProfileSid"),
        brandType,
        mock: ports.mock,
        skipVetting: ports.skipVetting,
      }),
      "registering the brand",
    ),
  }),
  campaign: async ({ state, ports, need }) => ({
    campaignSid: await need(
      campaignRequest({
        ...ports.campaign,
        brandSid: columnWritten(state, "brandSid"),
        messagingServiceSid: ports.messagingServiceSid,
        useCase: ports.useCase,
      }),
      "registering the campaign",
    ),
  }),
};

/**
 * The customer profile, evaluated and submitted. What the owner last typed is what gets evaluated, even if they corrected
 * it after the first attempt failed. A sole proprietor has one end user and no representative, so there is one thing to
 * refresh rather than two.
 */
async function submitProfile({ state, ports, soleProp }: StepRun): Promise<Partial<A2PState>> {
  const refresh = soleProp
    ? ([[columnWritten(state, "businessSid"), starterAttributes(ports.record)]] as const)
    : ([
        [columnWritten(state, "businessSid"), businessAttributes(ports.record)],
        [columnWritten(state, "representativeSid"), representativeAttributes(ports.record)],
      ] as const);
  for (const [endUser, a] of refresh)
    await requestLanded(ports, updateEndUserRequest(endUser, a), "refreshing the business on record");
  const ev = await ports.send(
    evaluateRequest(
      columnWritten(state, "profileSid"),
      soleProp ? A2P_POLICIES.starterCustomerProfile : A2P_POLICIES.secondaryCustomerProfile,
    ),
  );
  const status = typeof ev.body?.status === "string" ? ev.body.status : "";
  if (!ok(ev)) throw new Error(twilioRefusal(ev, "checking the profile"));
  if (status !== "compliant")
    throw new Error(`the profile is not complete yet: ${JSON.stringify(ev.body?.results ?? ev.body).slice(0, 300)}`);
  await requestLanded(ports, submitProfileRequest(columnWritten(state, "profileSid")), "submitting the profile");
  return { profileSubmitted: true };
}

export async function runA2PSaga(start: A2PState, a2PPorts: A2PPorts): Promise<A2PResult> {
  let state: A2PState = { ...EMPTY_A2P_STATE, ...start };
  const need = async (req: A2PRequest, text: string): Promise<string> => {
    const a = await a2PPorts.send(req);
    const id = sid(a);
    if (!ok(a) || !id) throw new Error(twilioRefusal(a, text));
    return id;
  };
  const brandType = brandTypeFor(a2PPorts.record);
  const soleProp = brandType === "SOLE_PROPRIETOR";

  let step: A2PStep | null = null;
  try {
    while ((step = nextA2PStep(state, brandType)) !== null) {
      const patch = await STEP_FILINGS[step]({ state, ports: a2PPorts, soleProp, brandType, need });
      state = { ...state, ...patch };
      await a2PPorts.save(patch);
    }
    return { ok: true, state };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    return {
      ok: false,
      step: step ?? nextA2PStep(state) ?? "profile",
      error,
      pending: isBrandNotReady(error),
      state,
    };
  }
}
