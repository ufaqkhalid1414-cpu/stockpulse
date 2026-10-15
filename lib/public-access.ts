/**
 * When PUBLIC_SIGNUP is not "1", StockPulse is invite-only:
 * only people already on a business (owner/staff) can sign in.
 * New self-serve accounts and first-time business setup are blocked.
 */
export function publicSignupAllowed() {
  return process.env.PUBLIC_SIGNUP === "1";
}

export const INVITE_ONLY_MESSAGE =
  "StockPulse is invite-only right now. Ask an owner to add your WhatsApp number, then log in.";
