/**
 * Password strength analysis and breach lookup.
 *
 * Breach checks use the HaveIBeenPwned "range" API with k-anonymity:
 * we hash the password with SHA-1 locally and send only the first 5
 * characters of the hash. The full password never leaves the browser.
 */

const COMMON_PASSWORDS = new Set([
  "123456", "password", "123456789", "12345678", "12345", "qwerty",
  "111111", "123123", "abc123", "password1", "1234567", "iloveyou",
  "000000", "qwerty123", "1q2w3e", "admin", "letmein", "welcome",
  "monkey", "dragon", "football", "sunshine", "princess", "login",
]);

/**
 * Estimate password strength. Returns { score 0-4, label, entropyBits, feedback[] }.
 */
function analyzePassword(pw) {
  const feedback = [];
  if (!pw) {
    return { score: 0, label: "Empty", entropyBits: 0, feedback: ["Enter a password to analyze."] };
  }

  const lower = pw.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return {
      score: 0,
      label: "Very weak",
      entropyBits: 0,
      feedback: ["This is one of the most common passwords in the world. Change it immediately."],
    };
  }

  // Character-pool entropy estimate.
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  const entropyBits = Math.round(pw.length * Math.log2(pool || 1));

  if (pw.length < 8) feedback.push("Use at least 12 characters — longer is stronger.");
  else if (pw.length < 12) feedback.push("Aim for 12+ characters for solid protection.");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) feedback.push("Mix upper and lower case letters.");
  if (!/[0-9]/.test(pw)) feedback.push("Add some numbers.");
  if (!/[^A-Za-z0-9]/.test(pw)) feedback.push("Add a symbol (e.g. ! ? # $).");
  if (/(.)\1{2,}/.test(pw)) feedback.push("Avoid repeating the same character (aaa, 111).");
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(pw)) {
    feedback.push("Avoid sequences like 1234 or qwerty.");
  }

  let score;
  if (entropyBits < 28) score = 0;
  else if (entropyBits < 40) score = 1;
  else if (entropyBits < 60) score = 2;
  else if (entropyBits < 80) score = 3;
  else score = 4;

  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  if (score >= 3 && feedback.length === 0) feedback.push("Great password. Make sure it's unique to this account.");

  return { score, label: labels[score], entropyBits, feedback };
}

/** SHA-1 hex digest using the Web Crypto API. */
async function sha1Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Look up how many times a password appears in known breaches.
 * Returns { found: boolean, count: number } or throws on network failure.
 */
async function checkBreach(pw) {
  const hash = await sha1Hex(pw);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
  });
  if (!res.ok) throw new Error(`Breach service returned ${res.status}`);

  const body = await res.text();
  for (const line of body.split("\n")) {
    const [hashSuffix, countStr] = line.trim().split(":");
    if (hashSuffix === suffix) {
      const count = parseInt(countStr, 10);
      return { found: count > 0, count };
    }
  }
  return { found: false, count: 0 };
}
