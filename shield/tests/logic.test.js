/**
 * Dependency-free unit tests for the SocialShield analysis logic.
 * Run with: node --test shield/tests/
 *
 * The browser scripts are plain <script> files (no module exports), so we
 * evaluate them together in a single VM context and capture the top-level
 * functions/data they define.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const jsDir = path.join(__dirname, "..", "js");
const src =
  ["data.js", "password.js", "phishing.js"]
    .map((f) => fs.readFileSync(path.join(jsDir, f), "utf8"))
    .join("\n") +
  "\nthis.__api = { analyzePassword, inspectUrl, PLATFORMS, TIPS };";

const ctx = vm.createContext({ URL, TextEncoder, console, crypto: globalThis.crypto });
vm.runInContext(src, ctx, { filename: "socialshield-bundle.js" });
const { analyzePassword, inspectUrl, PLATFORMS, TIPS } = ctx.__api;

test("common passwords score very weak", () => {
  assert.equal(analyzePassword("123456").score, 0);
  assert.equal(analyzePassword("password").score, 0);
});

test("word + year is not rated strong (regression: Spring2024)", () => {
  assert.ok(analyzePassword("Spring2024").score <= 1, "Spring2024 should be weak");
});

test("low character diversity is penalized", () => {
  assert.ok(analyzePassword("aaaaaaaaaaaa").score <= 1);
});

test("passphrases and random passwords stay strong", () => {
  assert.ok(analyzePassword("correcthorsebatterystaple").score >= 3);
  assert.ok(analyzePassword("Tr0ub4dor&3xK9!vz").score >= 3);
});

test("legitimate official domain is recognized", () => {
  const r = inspectUrl("https://www.facebook.com/login");
  assert.equal(r.verdict, "likely-safe");
  assert.ok(r.findings.some((f) => f.level === "ok" && /official/.test(f.text)));
});

test("regional brand domain is not flagged as impersonation (regression: google.co.uk)", () => {
  const r = inspectUrl("https://www.google.co.uk");
  assert.notEqual(r.verdict, "dangerous");
  assert.ok(!r.findings.some((f) => f.level === "bad"));
});

test("brand substring does not false-positive (regression: snapple/pineapple)", () => {
  for (const u of ["https://www.snapple.com", "https://pineapple.com"]) {
    assert.ok(!inspectUrl(u).findings.some((f) => f.level === "bad"), u);
  }
});

test("real impersonation is flagged dangerous", () => {
  assert.equal(inspectUrl("http://login-facebook.secure-update.xyz/signin").verdict, "dangerous");
  assert.equal(inspectUrl("https://paypal.com.account-verify.tk/").verdict, "dangerous");
});

test("raw IP address is flagged", () => {
  assert.ok(inspectUrl("http://192.168.1.5/insta-login").findings.some((f) => f.level === "bad"));
});

test("invalid input is handled gracefully", () => {
  assert.equal(inspectUrl("").verdict, "empty");
  assert.equal(inspectUrl("http://a<b>c").verdict, "invalid");
});

test("platform data integrity: 8 platforms, unique task ids", () => {
  assert.equal(PLATFORMS.length, 8);
  const ids = PLATFORMS.flatMap((p) => p.tasks.map((t) => t.id));
  assert.equal(ids.length, new Set(ids).size, "duplicate task ids");
  assert.ok(TIPS.length >= 5);
});
