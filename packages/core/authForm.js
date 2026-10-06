// Making an account on the person's own server from inside the app (instead of in the Supabase
// dashboard), shared by the desktop sign-in and the phone's. The checks before asking the server,
// and what to say about the answer. Pure — test/setupCodeAndSignUp.test.js covers it.

const MIN_PASSWORD = 8;

// A readable problem with the form, or null when it can be sent.
function validateSignUp({ email, password, confirm }) {
  const e = String(email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Enter a valid email address.";
  if (String(password || "").length < MIN_PASSWORD) return `Choose a password of at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

// What happened, from Supabase's signUp answer ({ data, error }):
//   { kind: "signedIn" }   the account is made and signed in
//   { kind: "confirm" }    the account is made but the server wants the email confirmed first
//   { kind: "exists" }     that address already has an account
//   { kind: "error", message }
function signUpOutcome({ data, error }) {
  if (error) {
    const m = String(error.message || "");
    if (/already registered|already been registered|user already exists/i.test(m)) return { kind: "exists" };
    if (/signups? (not allowed|are disabled)|signup is disabled/i.test(m)) return { kind: "error", message: "This server doesn't allow new accounts. Ask whoever runs it, or create the account in the Supabase dashboard (Authentication → Users → Add user)." };
    if (/password/i.test(m)) return { kind: "error", message: m };
    return { kind: "error", message: m || "Couldn't create the account." };
  }
  if (data && data.session) return { kind: "signedIn" };
  // With email confirmation on, an address that already has an account comes back with no error and
  // no identities, to avoid revealing who is registered.
  if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { kind: "exists" };
  return { kind: "confirm" };
}

const SIGN_UP_MESSAGES = {
  confirm: "Account created. Check your email for a confirmation link, open it, then come back and sign in.",
  exists: "That email already has an account on this server. Sign in instead.",
  afterSignIn: "Tip: now that your account exists you can turn off new sign-ups in your Supabase dashboard (Authentication → Sign In / Providers → turn off \"Allow new users to sign up\"), so nobody else can make one on your server.",
};

module.exports = { MIN_PASSWORD, validateSignUp, signUpOutcome, SIGN_UP_MESSAGES };
