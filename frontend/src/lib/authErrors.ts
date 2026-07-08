// Supabase auth returns terse, sometimes cryptic error strings. Map the
// common ones to copy that tells the user what to actually do next.
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Incorrect email or password. Please try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox for the verification link.";
  }
  if (m.includes("user already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password should be at least")) {
    return "Password is too short. Use at least 8 characters.";
  }
  return message;
}
