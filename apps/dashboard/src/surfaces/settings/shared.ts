/**
 * What more than one pane of Settings checks (moved from legacy/pages/settings.jsx, decision 0015 step 11): the shape an
 * address must have before a pane sends it. Each role's name and what it may do are contracts' (role-perms.ts ROLE_SAYS).
 */

/** An address as a pane takes one: something, an @, something with a dot in it. The server's schema decides. */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
