// Messages for /login?error=… after Google/Facebook sign-in.
const NAMES = { google: 'Google', facebook: 'Facebook' };

export function socialErrorMessage(code, provider) {
  const p = NAMES[provider] || 'that service';
  switch (code) {
    case 'cancelled': return `${p} sign-in was cancelled.`;
    case 'expired': return 'That sign-in attempt expired. Please try again.';
    case 'no_email': return `${p} did not share an email address with us. Allow email access, or register with your email instead.`;
    case 'unverified': return `Your ${p} email address is not verified. Verify it with ${p}, or register with your email instead.`;
    case 'exists': return `An account already uses this email. Sign in with your email or phone and password, then connect ${p} under Account → Details & password.`;
    case 'staff': return 'Staff accounts sign in with their password.';
    case 'deactivated': return 'This account has been deactivated. Contact us for help.';
    case 'unavailable': return 'That sign-in option is not available.';
    case 'ratelimited': return 'Too many sign-in attempts. Wait a few minutes and try again.';
    case 'taken': return `That ${p} account is already connected to another JJ BLINKS account.`;
    case 'failed': return `We could not complete ${p} sign-in. Please try again.`;
    default: return null;
  }
}
