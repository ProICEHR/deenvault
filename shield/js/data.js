/**
 * Static security data for SocialShield.
 * Each platform lists concrete, verifiable hardening tasks plus a deep link
 * into that platform's official security settings.
 */
const PLATFORMS = [
  {
    id: "facebook",
    name: "Facebook",
    color: "#1877f2",
    initial: "f",
    settingsUrl: "https://www.facebook.com/settings?tab=security",
    tasks: [
      { id: "fb-strong-pw", text: "Set a unique password not used on any other site" },
      { id: "fb-2fa", text: "Turn on two-factor authentication (Settings → Security and Login)" },
      { id: "fb-app-2fa", text: "Use an authenticator app instead of SMS for 2FA" },
      { id: "fb-alerts", text: "Enable login alerts for unrecognized logins" },
      { id: "fb-sessions", text: "Review and remove unknown active sessions / devices" },
      { id: "fb-apps", text: "Audit connected apps and remove ones you no longer use" },
      { id: "fb-contacts", text: "Add 3–5 trusted contacts for account recovery" },
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    color: "#e1306c",
    initial: "Ig",
    settingsUrl: "https://accountscenter.instagram.com/password_and_security/",
    tasks: [
      { id: "ig-strong-pw", text: "Set a unique, strong password" },
      { id: "ig-2fa", text: "Enable two-factor authentication" },
      { id: "ig-app-2fa", text: "Use an authenticator app for 2FA" },
      { id: "ig-codes", text: "Save your backup recovery codes somewhere safe" },
      { id: "ig-activity", text: "Check 'Login activity' and log out unknown sessions" },
      { id: "ig-email", text: "Verify the email/phone on the account are yours" },
      { id: "ig-private", text: "Set the account to private if it's personal" },
    ],
  },
  {
    id: "x",
    name: "X (Twitter)",
    color: "#1d1d1f",
    initial: "X",
    settingsUrl: "https://x.com/settings/account",
    tasks: [
      { id: "x-strong-pw", text: "Set a unique, strong password" },
      { id: "x-2fa", text: "Enable two-factor authentication" },
      { id: "x-app-2fa", text: "Use an authenticator app or security key (not SMS)" },
      { id: "x-pw-reset", text: "Require email/phone to reset password (password reset protect)" },
      { id: "x-sessions", text: "Review active sessions and log out unknown ones" },
      { id: "x-apps", text: "Revoke third-party apps you don't recognize" },
    ],
  },
  {
    id: "tiktok",
    name: "TikTok",
    color: "#010101",
    initial: "Tk",
    settingsUrl: "https://www.tiktok.com/setting",
    tasks: [
      { id: "tt-strong-pw", text: "Set a unique, strong password" },
      { id: "tt-2fa", text: "Enable two-step verification" },
      { id: "tt-app-2fa", text: "Use an authenticator app for verification" },
      { id: "tt-devices", text: "Check 'Manage devices' and remove unknown ones" },
      { id: "tt-activity", text: "Review security alerts and recent login activity" },
      { id: "tt-private", text: "Make the account private if it's personal" },
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0a66c2",
    initial: "in",
    settingsUrl: "https://www.linkedin.com/mypreferences/d/categories/sign-in-and-security",
    tasks: [
      { id: "li-strong-pw", text: "Set a unique, strong password" },
      { id: "li-2fa", text: "Turn on two-step verification" },
      { id: "li-app-2fa", text: "Use an authenticator app for 2FA" },
      { id: "li-sessions", text: "Review 'Where you're signed in' and end unknown sessions" },
      { id: "li-apps", text: "Audit permitted services and remove unused ones" },
      { id: "li-email", text: "Confirm recovery email and phone are current" },
    ],
  },
  {
    id: "snapchat",
    name: "Snapchat",
    color: "#fffc00",
    initial: "Sc",
    settingsUrl: "https://accounts.snapchat.com/",
    tasks: [
      { id: "sc-strong-pw", text: "Set a unique, strong password" },
      { id: "sc-2fa", text: "Enable two-factor authentication" },
      { id: "sc-app-2fa", text: "Use an authenticator app for 2FA" },
      { id: "sc-codes", text: "Generate and store a recovery code" },
      { id: "sc-sessions", text: "Review session info and log out unknown devices" },
    ],
  },
  {
    id: "google",
    name: "Google / YouTube",
    color: "#ea4335",
    initial: "G",
    settingsUrl: "https://myaccount.google.com/security",
    tasks: [
      { id: "g-strong-pw", text: "Set a unique, strong password" },
      { id: "g-2fa", text: "Turn on 2-Step Verification" },
      { id: "g-app-2fa", text: "Use an authenticator app, passkey, or security key" },
      { id: "g-passkey", text: "Add a passkey for passwordless sign-in" },
      { id: "g-devices", text: "Review 'Your devices' and sign out unknown ones" },
      { id: "g-apps", text: "Remove third-party apps with account access you don't use" },
      { id: "g-checkup", text: "Run the Google Security Checkup" },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    color: "#25d366",
    initial: "Wa",
    settingsUrl: "https://faq.whatsapp.com/1920866721452534",
    tasks: [
      { id: "wa-pin", text: "Turn on two-step verification PIN" },
      { id: "wa-email", text: "Add a recovery email to your two-step verification" },
      { id: "wa-devices", text: "Check 'Linked devices' and remove unknown ones" },
      { id: "wa-privacy", text: "Restrict who can see your profile photo and last seen" },
    ],
  },
];

/** General best-practice tips shown in the Learn section. */
const TIPS = [
  {
    title: "Use a password manager",
    body: "A password manager generates and stores a unique, strong password for every account, so a breach on one site can't unlock the others. You only need to remember one master password.",
  },
  {
    title: "Prefer app-based 2FA over SMS",
    body: "SMS codes can be intercepted through SIM-swapping. Authenticator apps (or hardware security keys / passkeys) generate codes on your device and are far harder to steal.",
  },
  {
    title: "Recognize phishing",
    body: "Attackers send urgent messages ('your account will be deleted') with links to fake login pages. Never log in through a link in an email or DM — open the app or type the address yourself.",
  },
  {
    title: "Check the sender and the URL",
    body: "Look closely at the domain. faceb00k.com, instagram-security.com, and login-facebook.support are not the real sites. Real platforms use their own root domain.",
  },
  {
    title: "Review sessions and connected apps regularly",
    body: "Every platform lists where you're logged in and which apps have access. Remove anything unfamiliar — a forgotten quiz app or an old phone can be an open door.",
  },
  {
    title: "Lock down recovery options",
    body: "If your recovery email or phone is outdated or compromised, an attacker can reset your password. Keep recovery contacts current and protect that email account most of all.",
  },
  {
    title: "Beware 'free followers' and reward scams",
    body: "Sites that ask for your social login to give you followers, coins, or verification are credential harvesters. No legitimate service needs your password to add followers.",
  },
  {
    title: "Keep apps and your phone updated",
    body: "Updates patch security holes that attackers exploit. Turn on automatic updates for your OS and your social apps.",
  },
];
