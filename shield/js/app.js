/**
 * SocialShield main controller: navigation, dashboard, checklist persistence,
 * and wiring for the password and phishing tools.
 */

const STORAGE_KEY = "socialshield.checklist.v1";

/* ---------- checklist persistence ---------- */

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let checklistState = loadState();

function isDone(taskId) {
  return !!checklistState[taskId];
}

function toggleTask(taskId, done) {
  if (done) checklistState[taskId] = true;
  else delete checklistState[taskId];
  saveState(checklistState);
}

function totalTasks() {
  return PLATFORMS.reduce((n, p) => n + p.tasks.length, 0);
}

function doneTasks() {
  return PLATFORMS.reduce(
    (n, p) => n + p.tasks.filter((t) => isDone(t.id)).length,
    0
  );
}

function platformProgress(p) {
  const done = p.tasks.filter((t) => isDone(t.id)).length;
  return { done, total: p.tasks.length, pct: Math.round((done / p.tasks.length) * 100) };
}

/* ---------- navigation ---------- */

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === `view-${name}`);
  });
  document.querySelectorAll(".nav-link").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === name);
  });
  if (name === "dashboard") renderDashboard();
  if (name === "checklist") renderChecklist();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- dashboard ---------- */

function renderDashboard() {
  const total = totalTasks();
  const done = doneTasks();
  const pct = Math.round((done / total) * 100);

  const ring = document.getElementById("score-ring");
  const circumference = 2 * Math.PI * 52;
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = `${circumference * (1 - pct / 100)}`;
  ring.style.stroke = pct >= 70 ? "#16a34a" : pct >= 40 ? "#f59e0b" : "#dc2626";

  document.getElementById("score-pct").textContent = `${pct}%`;
  document.getElementById("score-detail").textContent =
    `${done} of ${total} protection steps completed`;

  let msg;
  if (pct === 100) msg = "Excellent — every account is hardened. Re-check monthly.";
  else if (pct >= 70) msg = "Strong protection. Finish the remaining steps to close the gaps.";
  else if (pct >= 40) msg = "Good start. Prioritize two-factor authentication on every account.";
  else msg = "Your accounts are exposed. Start with passwords and 2FA below.";
  document.getElementById("score-message").textContent = msg;

  const grid = document.getElementById("platform-summary");
  grid.innerHTML = "";
  PLATFORMS.forEach((p) => {
    const { done, total, pct } = platformProgress(p);
    const card = document.createElement("button");
    card.className = "platform-card";
    card.onclick = () => { showView("checklist"); setTimeout(() => focusPlatform(p.id), 50); };
    card.innerHTML = `
      <span class="platform-badge" style="background:${p.color}">${p.initial}</span>
      <span class="platform-meta">
        <span class="platform-name">${p.name}</span>
        <span class="platform-bar"><span style="width:${pct}%;background:${p.color}"></span></span>
      </span>
      <span class="platform-count">${done}/${total}</span>
    `;
    grid.appendChild(card);
  });
}

/* ---------- checklist ---------- */

function renderChecklist() {
  const container = document.getElementById("checklist-container");
  container.innerHTML = "";
  PLATFORMS.forEach((p) => {
    const { done, total, pct } = platformProgress(p);
    const section = document.createElement("section");
    section.className = "checklist-platform";
    section.id = `platform-${p.id}`;

    const tasksHtml = p.tasks.map((t) => `
      <label class="task ${isDone(t.id) ? "done" : ""}">
        <input type="checkbox" data-task="${t.id}" ${isDone(t.id) ? "checked" : ""}>
        <span class="checkmark"></span>
        <span class="task-text">${t.text}</span>
      </label>
    `).join("");

    section.innerHTML = `
      <header class="checklist-head">
        <span class="platform-badge" style="background:${p.color}">${p.initial}</span>
        <div class="checklist-head-text">
          <h3>${p.name}</h3>
          <span class="muted">${done}/${total} complete</span>
        </div>
        <a class="settings-link" href="${p.settingsUrl}" target="_blank" rel="noopener noreferrer">
          Open security settings ↗
        </a>
      </header>
      <div class="platform-bar wide"><span style="width:${pct}%;background:${p.color}"></span></div>
      <div class="tasks">${tasksHtml}</div>
    `;
    container.appendChild(section);
  });

  container.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    box.addEventListener("change", (e) => {
      toggleTask(e.target.dataset.task, e.target.checked);
      renderChecklist();
    });
  });
}

function focusPlatform(id) {
  const el = document.getElementById(`platform-${id}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1200);
  }
}

/* ---------- password tool ---------- */

function setupPasswordTool() {
  const input = document.getElementById("pw-input");
  const toggle = document.getElementById("pw-toggle");
  const meter = document.getElementById("pw-meter-fill");
  const label = document.getElementById("pw-label");
  const entropy = document.getElementById("pw-entropy");
  const feedback = document.getElementById("pw-feedback");
  const breachBtn = document.getElementById("pw-breach-btn");
  const breachResult = document.getElementById("pw-breach-result");

  const colors = ["#dc2626", "#f97316", "#f59e0b", "#22c55e", "#16a34a"];

  function update() {
    const pw = input.value;
    const r = analyzePassword(pw);
    meter.style.width = `${(r.score / 4) * 100}%`;
    meter.style.background = colors[r.score];
    label.textContent = pw ? r.label : "";
    label.style.color = colors[r.score];
    entropy.textContent = pw ? `~${r.entropyBits} bits of entropy` : "";
    feedback.innerHTML = r.feedback.map((f) => `<li>${f}</li>`).join("");
    breachBtn.disabled = !pw;
    breachResult.className = "breach-result";
    breachResult.textContent = "";
  }

  input.addEventListener("input", update);

  toggle.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    toggle.textContent = showing ? "Show" : "Hide";
  });

  breachBtn.addEventListener("click", async () => {
    const pw = input.value;
    if (!pw) return;
    breachResult.className = "breach-result loading";
    breachResult.textContent = "Checking breach databases…";
    try {
      const { found, count } = await checkBreach(pw);
      if (found) {
        breachResult.className = "breach-result bad";
        breachResult.textContent =
          `⚠ Found in ${count.toLocaleString()} known breaches. Do not use this password — change it anywhere you've used it.`;
      } else {
        breachResult.className = "breach-result ok";
        breachResult.textContent =
          "✓ Not found in known breaches. (Still make sure it's unique to each account.)";
      }
    } catch (err) {
      breachResult.className = "breach-result warn";
      breachResult.textContent =
        "Couldn't reach the breach database. Your password was never sent anywhere; try again when online.";
    }
  });

  update();
}

/* ---------- phishing tool ---------- */

function setupPhishingTool() {
  const input = document.getElementById("url-input");
  const btn = document.getElementById("url-btn");
  const result = document.getElementById("url-result");

  function run() {
    const r = inspectUrl(input.value);
    if (r.verdict === "empty") {
      result.innerHTML = "";
      return;
    }
    if (r.verdict === "invalid") {
      result.innerHTML = `<div class="verdict bad">Invalid URL</div>`;
      return;
    }
    const verdictClass = r.verdict === "dangerous" ? "bad" : r.verdict === "suspicious" ? "warn" : "ok";
    const verdictText =
      r.verdict === "dangerous" ? "Dangerous — do not log in here"
      : r.verdict === "suspicious" ? "Suspicious — proceed with caution"
      : "Likely safe — but stay alert";

    const items = r.findings.map((f) => {
      const icon = f.level === "ok" ? "✓" : f.level === "bad" ? "✕" : "!";
      return `<li class="finding ${f.level}"><span>${icon}</span>${f.text}</li>`;
    }).join("");

    result.innerHTML = `
      <div class="verdict ${verdictClass}">${verdictText} <span class="risk">risk ${r.score}/100</span></div>
      <ul class="findings">${items}</ul>
    `;
  }

  btn.addEventListener("click", run);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
}

/* ---------- learn ---------- */

function renderTips() {
  const container = document.getElementById("tips-container");
  container.innerHTML = TIPS.map((t) => `
    <article class="tip">
      <h3>${t.title}</h3>
      <p>${t.body}</p>
    </article>
  `).join("");
}

/* ---------- init ---------- */

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showView(a.dataset.view);
      document.getElementById("nav-toggle").checked = false;
    });
  });
  document.querySelectorAll("[data-goto]").forEach((b) => {
    b.addEventListener("click", () => showView(b.dataset.goto));
  });

  setupPasswordTool();
  setupPhishingTool();
  renderTips();
  showView("dashboard");
});
