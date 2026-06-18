/**
 * Heuristic phishing-link inspector.
 *
 * This runs entirely in the browser and uses lexical/structural signals to
 * estimate how suspicious a URL looks. It is an educational aid, not a
 * guarantee — a "looks fine" result does not prove a site is safe.
 */

const KNOWN_BRANDS = [
  "facebook", "instagram", "twitter", "tiktok", "linkedin", "snapchat",
  "google", "youtube", "whatsapp", "apple", "microsoft", "paypal", "netflix",
];

// Legitimate root domains for the brands above (suffix match).
const LEGIT_DOMAINS = [
  "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com",
  "tiktok.com", "linkedin.com", "snapchat.com", "google.com", "youtube.com",
  "whatsapp.com", "apple.com", "microsoft.com", "paypal.com", "netflix.com",
];

const SUSPICIOUS_TLDS = [
  ".zip", ".mov", ".xyz", ".top", ".club", ".click", ".link", ".gq",
  ".tk", ".ml", ".cf", ".work", ".support", ".rest", ".country",
];

const URL_SHORTENERS = [
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd",
  "buff.ly", "cutt.ly", "rebrand.ly", "shorturl.at",
];

// Common multi-label public suffixes, so "example.co.uk" is treated as one
// registrable domain rather than "co.uk". This is a pragmatic subset of the
// Public Suffix List covering the suffixes most likely to appear here.
const MULTI_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.za", "co.in", "co.id", "co.th",
  "co.jp", "or.jp", "ne.jp", "co.kr", "com.br", "com.mx", "com.ar", "com.co",
  "com.pe", "com.tr", "com.sg", "com.hk", "com.tw", "com.cn", "com.my",
  "com.ph", "com.vn", "com.ua", "com.ng", "com.sa", "com.eg",
]);

function registrableDomain(hostname) {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

// Match a brand name only at label/separator boundaries, so "snapple.com"
// does not count as containing "apple" while "login-facebook.com" does.
function brandPresent(host, brand) {
  return new RegExp(`(^|[.\\-_\\d])${brand}([.\\-_\\d]|$)`).test(host);
}

/**
 * Inspect a URL string. Returns { verdict, score 0-100, findings[] }.
 * Higher score = more suspicious.
 */
function inspectUrl(raw) {
  const findings = [];
  let input = raw.trim();
  if (!input) return { verdict: "empty", score: 0, findings: [] };
  if (!/^https?:\/\//i.test(input)) input = "http://" + input;

  let url;
  try {
    url = new URL(input);
  } catch {
    return {
      verdict: "invalid",
      score: 0,
      findings: [{ level: "warn", text: "That doesn't look like a valid web address." }],
    };
  }

  const host = url.hostname.toLowerCase();
  const regDomain = registrableDomain(host);
  let score = 0;

  // Protocol
  if (url.protocol === "https:") {
    findings.push({ level: "ok", text: "Uses HTTPS (encrypted connection)." });
  } else {
    score += 20;
    findings.push({ level: "bad", text: "Not HTTPS — data sent to this site is not encrypted." });
  }

  // IP address instead of a domain
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    score += 35;
    findings.push({ level: "bad", text: "Uses a raw IP address instead of a domain name — common in phishing." });
  }

  // Userinfo ('user@host') can hide the real destination behind the '@'
  if (url.username || url.password) {
    score += 30;
    findings.push({ level: "bad", text: "Has credentials before an '@', which can hide the real destination after it." });
  }

  // Punycode / homograph
  if (host.includes("xn--")) {
    score += 30;
    findings.push({ level: "bad", text: "Uses punycode (xn--), which can disguise look-alike characters." });
  }

  // Brand impersonation. A brand is genuinely impersonated when the brand name
  // appears in the host but it is NOT the main label of the registrable domain
  // (the label just left of the public suffix). "facebook.evil.com" impersonates;
  // "facebook.com" and "google.co.uk" (brand IS the main label) do not.
  const legit = LEGIT_DOMAINS.includes(regDomain);
  const mainLabel = regDomain.split(".")[0];
  const brandInHost = KNOWN_BRANDS.find((b) => brandPresent(host, b));
  if (legit) {
    findings.push({ level: "ok", text: `Root domain "${regDomain}" matches a known official site.` });
  } else if (brandInHost && mainLabel !== brandInHost) {
    score += 40;
    findings.push({
      level: "bad",
      text: `Mentions "${brandInHost}" but the real domain is "${regDomain}", not the official site.`,
    });
  } else if (brandInHost) {
    findings.push({
      level: "warn",
      text: `Domain's main label is "${brandInHost}" but on an unverified TLD ("${regDomain}"). Confirm it's the official site for your region.`,
    });
  }

  // URL shorteners hide the destination
  if (URL_SHORTENERS.includes(regDomain)) {
    score += 15;
    findings.push({ level: "warn", text: "Link shortener — the real destination is hidden. Expand it before clicking." });
  }

  // Suspicious TLD
  const tld = "." + host.split(".").pop();
  if (SUSPICIOUS_TLDS.includes(tld)) {
    score += 15;
    findings.push({ level: "warn", text: `Top-level domain "${tld}" is frequently abused for scams.` });
  }

  // Excessive subdomains (e.g. login.facebook.com.secure-update.ru)
  const labels = host.split(".");
  if (labels.length >= 5) {
    score += 15;
    findings.push({ level: "warn", text: "Many subdomains — attackers nest brand names to look legitimate." });
  }

  // Sensitive keywords in the path/host
  if (/(login|verify|secure|account|update|confirm|signin|password)/i.test(host)) {
    score += 10;
    findings.push({ level: "warn", text: "Security-related words in the domain are a classic lure." });
  }

  // Very long URL
  if (raw.length > 90) {
    score += 5;
    findings.push({ level: "warn", text: "Unusually long URL — sometimes used to bury the real domain." });
  }

  score = Math.min(100, score);
  let verdict;
  if (score >= 50) verdict = "dangerous";
  else if (score >= 20) verdict = "suspicious";
  else verdict = "likely-safe";

  return { verdict, score, findings, domain: regDomain };
}
