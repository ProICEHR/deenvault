# SocialShield

A free, fully client-side toolkit for hardening your social media accounts. No
backend, no accounts, no tracking — open `shield/index.html` in any browser (or
host the `shield/` folder on any static host) and it just works.

## Features

- **Dashboard** — an overall protection score and per-account progress, computed
  from the checklist below.
- **Security checklist** — concrete, verifiable hardening steps for Facebook,
  Instagram, X (Twitter), TikTok, LinkedIn, Snapchat, Google/YouTube, and
  WhatsApp, each with a deep link to that platform's official security settings.
  Progress is saved in `localStorage` on your device.
- **Password checker** — estimates strength (entropy + pattern checks) and
  performs a privacy-preserving breach lookup against
  [HaveIBeenPwned](https://haveibeenpwned.com/). Uses k-anonymity: the password
  is SHA-1 hashed locally and only the first 5 hash characters are sent, so the
  password itself never leaves the browser.
- **Phishing link inspector** — heuristic analysis of a URL (brand
  impersonation, look-alike domains, raw IPs, punycode, suspicious TLDs, URL
  shorteners, and more). Runs entirely offline in the browser.
- **Learn** — practical, plain-language tips for staying protected.

## Project structure

```
shield/
├── index.html        # markup + view containers
├── css/style.css     # all styling (dark, responsive)
└── js/
    ├── data.js       # platform checklists + tips
    ├── password.js   # strength analysis + HIBP breach check
    ├── phishing.js   # URL heuristic inspector
    └── app.js        # navigation, dashboard, persistence, wiring
```

## Privacy

Everything runs in your browser. The only network request the app can make is
the k-anonymity breach check, which sends a 5-character hash prefix and nothing
else. The checklist state lives only in your browser's `localStorage`.

## Notes

The phishing inspector is an educational aid based on lexical heuristics — a
"likely safe" verdict is not a guarantee. When in doubt, type a site's address
yourself rather than clicking a link.

The password strength estimate is a guide, not a cracking simulator: it combines
a character-pool entropy estimate with penalties for predictable structure
(common words, years, sequences, repeats). It is intentionally dependency-free
and not a substitute for a tool like zxcvbn.

The breach check uses the Web Crypto API, which browsers only expose in a
**secure context**. Serve the app over HTTPS (or `localhost`) for it to work;
over plain `http://` the app will say so instead of failing silently.
