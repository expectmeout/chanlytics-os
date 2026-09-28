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

function twilioRefusal(a: A2PAnswer, what: string): string {
  const msg = typeof a.body?.message === "string" ? a.body.message : `HTTP ${a.status}`;
  const code = typeof a.body?.code === "number" ? ` (Twilio ${a.body.code})` : "";
  return `${what}: ${msg}${code}`;
}

const ok = (a: A2PAnswer) => a.status >= 200 && a.status < 300;

export async function runA2PSaga(start: A2PState, p: A2PPorts): Promise<A2PResult> {
  let state: A2PState = { ...EMPTY_A2P_STATE, ...start };
  const save = async (patch: Partial<A2PState>) => {
    state = { ...state, ...patch };
    await p.save(patch);
  };
  const need = async (req: A2PRequest, what: string): Promise<string> => {
    const a = await p.send(req);
    const id = sid(a);
    if (!ok(a) || !id) throw new Error(twilioRefusal(a, what));
    return id;
  };

  // WHICH registration this is. A business with a tax id files a company; a
  // sole proprietor files a person. The steps below share five of their nine
  // stages, so this is a fork inside one saga rather than two sagas that would
  // drift apart at the shared end.
  const brandType = brandTypeFor(p.record);
  const soleProp = brandType === "SOLE_PROPRIETOR";

  let step: A2PStep | null = null;
  try {
    while ((step = nextA2PStep(state, brandType)) !== null) {
      switch (step) {
        case "profile":
          await save({
            profileSid: await need(
              (soleProp ? starterProfileRequest : customerProfileRequest)({
                friendlyName: p.workspace.name,
                email: p.email,
                statusCallback: p.statusCallback,
              }),
              "creating the customer's profile",
            ),
          });
          break;
        case "business": {
          // The one end user each policy asks for. The starter profile wants a
          // PERSON -- name, email, phone -- where the secondary wants a company
          // and its tax id. Same slot in the state because both are "the thing
          // the profile is about", and keeping one receipt keeps a resumed run
          // from filing a second.
          const id = await need(
            soleProp ? starterEndUserRequest(p.record) : businessEndUserRequest(p.record),
            soleProp ? "recording who you are" : "recording the business",
          );
          const a = await p.send(assignRequest(state.profileSid!, id));
          if (!ok(a)) throw new Error(twilioRefusal(a, soleProp ? "attaching your details" : "attaching the business"));
          await save({ businessSid: id });
          break;
        }
        case "representative": {
          const id = await need(representativeEndUserRequest(p.record), "recording the person who signs");
          const a = await p.send(assignRequest(state.profileSid!, id));
          if (!ok(a)) throw new Error(twilioRefusal(a, "attaching the person who signs"));
          await save({ representativeSid: id });
          break;
        }
        case "address":
          await save({ addressSid: await need(addressRequest(p.accountSid, p.record), "recording the address") });
          break;
        case "document": {
          const id = await need(
            supportingDocumentRequest({ legalName: p.record.legalName, addressSid: state.addressSid! }),
            "attaching the address",
          );
          const a = await p.send(assignRequest(state.profileSid!, id));
          if (!ok(a)) throw new Error(twilioRefusal(a, "attaching the address document"));
          await save({ documentSid: id });
          break;
        }
        case "primary": {
          const a = await p.send(assignRequest(state.profileSid!, p.primaryProfileSid));
          if (!ok(a)) throw new Error(twilioRefusal(a, "naming us as the provider"));
          await save({ primaryAssigned: true });
          break;
        }
        case "submit": {
          // What the owner last typed is what gets evaluated, even if they
          // corrected it after the first attempt failed.
          // A sole proprietor has one end user and no representative, so
          // there is one thing to refresh rather than two.
          const refresh = soleProp
            ? ([[state.businessSid!, starterAttributes(p.record)]] as const)
            : ([
                [state.businessSid!, businessAttributes(p.record)],
                [state.representativeSid!, representativeAttributes(p.record)],
              ] as const);
          for (const [sid, a] of refresh) {
            const up = await p.send(updateEndUserRequest(sid, a));
            if (!ok(up)) throw new Error(twilioRefusal(up, "refreshing the business on record"));
          }
          const ev = await p.send(
            evaluateRequest(
              state.profileSid!,
              soleProp ? A2P_POLICIES.starterCustomerProfile : A2P_POLICIES.secondaryCustomerProfile,
            ),
          );
          const status = typeof ev.body?.status === "string" ? ev.body.status : "";
          if (!ok(ev)) throw new Error(twilioRefusal(ev, "checking the profile"));
          if (status !== "compliant")
            throw new Error(
              `the profile is not complete yet: ${JSON.stringify(ev.body?.results ?? ev.body).slice(0, 300)}`,
            );
          const sub = await p.send(submitProfileRequest(state.profileSid!));
          if (!ok(sub)) throw new Error(twilioRefusal(sub, "submitting the profile"));
          await save({ profileSubmitted: true });
          break;
        }
        case "a2p_profile": {
          // The messaging profile is the OTHER half of the pair. A sole
          // proprietor's is a different policy carrying a different end user:
          // brand name, the owner's mobile, and the vertical. The mobile is
          // the whole point -- it is where the carriers send the code the
          // owner has to reply to.
          const bundle = await need(
            (soleProp ? soleProprietorProfileRequest : a2pProfileRequest)({
              friendlyName: p.workspace.name,
              email: p.email,
              statusCallback: p.statusCallback,
            }),
            "creating the messaging profile",
          );
          const endUser = await need(
            soleProp
              ? soleProprietorEndUserRequest(p.record, p.industry)
              : a2pProfileEndUserRequest({ friendlyName: p.workspace.name, companyType: p.record.companyType }),
            soleProp ? "recording your mobile for the carriers' code" : "recording the company type",
          );
          for (const objectSid of [endUser, state.profileSid!]) {
            const a = await p.send(trustProductAssignRequest(bundle, objectSid));
            if (!ok(a)) throw new Error(twilioRefusal(a, "attaching to the messaging profile"));
          }
          const ev = await p.send(evaluateTrustProductRequest(bundle));
          if (!ok(ev)) throw new Error(twilioRefusal(ev, "checking the messaging profile"));
          const sub = await p.send(submitTrustProductRequest(bundle));
          if (!ok(sub)) throw new Error(twilioRefusal(sub, "submitting the messaging profile"));
          await save({ a2pProfileSid: bundle });
          break;
        }
        case "brand":
          await save({
            brandSid: await need(
              brandRequest({
                customerProfileBundleSid: state.profileSid!,
                a2pProfileBundleSid: state.a2pProfileSid!,
                brandType: brandTypeFor(p.record),
                mock: p.mock,
                skipVetting: p.skipVetting,
              }),
              "registering the brand",
            ),
          });
          break;
        case "campaign":
          await save({
            campaignSid: await need(
              campaignRequest({
                ...p.campaign,
                brandSid: state.brandSid!,
                messagingServiceSid: p.messagingServiceSid,
                useCase: p.useCase,
              }),
              "registering the campaign",
            ),
          });
          break;
      }
    }
    return { ok: true, state };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    return {
      ok: false,
      step: (step ?? nextA2PStep(state) ?? "profile") as A2PStep,
      error,
      pending: isBrandNotReady(error),
      state,
    };
  }
}
