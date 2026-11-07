/**
 * The partners domain: `@chanlytics/db/partners`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export {
  acceptHandover,
  createWorkspaceForBusiness,
  declineHandover,
  getHandoverInvite,
  getOpenHandovers,
  getPartnerHandovers,
  getPartnerInvitations,
  getWorkspacePartner,
  invitePartner,
  resendHandover,
  withdrawPartnerInvite,
} from "./handover";
export type {
  HandoverInvite,
  HandoverResult,
  HandoverSent,
  HandoverWorkspace,
  OpenHandover,
  PartnerHandoverLine,
  PartnerInvitation,
  PartnerInviteSent,
  WorkspacePartner,
} from "./handover";
export { acceptPartnerInvite, declinePartnerInvite, getPartnerInviteMail } from "./invite";
export type { PartnerInviteMail, PartnerJoined } from "./invite";
export {
  becomePartner,
  doesSessionHoldPartnerSeat,
  getOwnPartner,
  getPartnerBalance,
  getPartnerBroughtCount,
  getPartnerLetters,
  getPartnerWorkspaces,
  getPlatformPartners,
  markPartnerPaid,
  recordPartnerSecondFactorReset,
  setPartnerLetters,
  setPartnerStanding,
  setPartnerStatus,
} from "./partner";
export type {
  PartnerBalanceLine,
  PartnerOverviewRow,
  PartnerPayoutAnswer,
  PartnerPublicRow,
  PartnerRow,
  PartnerTenantRow,
  PartnerVerbResult,
  PartnerWorkspaceMoneyLine,
  PlatformPartnerBalanceLine,
  PlatformPartnerWorkspaceLine,
} from "./partner";
