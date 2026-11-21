/* Confido web client — no framework, no build step.
 * It renders what the engine computed and never recomputes a score itself:
 * the only arithmetic here is the ring geometry. */

const state = {
  preset: "payments",
  drift: true,
  ai: false,
  csv: null,
  bundle: null,
  busy: false,
};

const $ = (id) => document.getElementById(id);

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Minimal markdown for the narrative: headings, bold, code, lists, quotes. */
function md(text) {
  const inline = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)\*([^*]+)\*/g, "$1<em>$2</em>");

  const out = [];
  let list = null;
  const closeList = () => {
    if (list) {
      out.push(`<ul>${list.join("")}</ul>`);
      list = null;
    }
  };

  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      closeList();
      out.push(`<h2>${inline(line.slice(2))}</h2>`);
    } else if (line.startsWith("> ")) {
      closeList();
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    } else if (/^[-*] /.test(line)) {
      list = list || [];
      list.push(`<li>${inline(line.slice(2))}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

const BAND_CLASS = { go: "go", conditional: "conditional", at_risk: "at_risk", no_go: "no_go" };
const BAND_COLOR = {
  go: "var(--go)",
  conditional: "var(--conditional)",
  at_risk: "var(--at-risk)",
  no_go: "var(--no-go)",
};
const RING_LENGTH = 2 * Math.PI * 52;

function payload() {
  const body = { preset: state.preset, ai: state.ai };
  if (state.csv) {
    body.csv = state.csv;
    delete body.preset;
  } else {
    body.baselinePreset = state.drift ? "payments-baseline" : "";
  }
  return body;
}

async function assess() {
  if (state.busy) return;
  state.busy = true;
  $("refresh").disabled = true;
  $("error").hidden = true;
  $("refresh").textContent = "Assessing…";
  try {
    const res = await fetch("/api/assess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    state.bundle = data;
    render(data);
  } catch (error) {
    const el = $("error");
    el.hidden = false;
    el.textContent = error.message;
  } finally {
    state.busy = false;
    $("refresh").disabled = false;
    $("refresh").textContent = "Re-assess";
  }
}

function render(bundle) {
  const a = bundle.assessment;
  const narrative = bundle.narrative;

  $("release-name").textContent = a.release.sprintName || a.release.projectKey;
  $("score").textContent = a.score;
  const ring = $("ring-value");
  ring.style.strokeDasharray = String(RING_LENGTH);
  ring.style.strokeDashoffset = String(RING_LENGTH * (1 - a.score / 100));
  ring.style.stroke = BAND_COLOR[a.band] ?? "var(--muted)";

  const band = $("band");
  band.textContent = a.bandLabel;
  band.className = `band band-${BAND_CLASS[a.band] ?? "unknown"}`;
  $("blurb").textContent =
    {
      go: "No release-stopping risks detected. Ship, and keep the watch list.",
      conditional: "The date is plausible, but the conditions have to be true first.",
      at_risk: "The release is exposed. Cut scope or move the date — hoping is not a plan.",
      no_go: "Too many unresolved dependencies for this cut. Stop and re-plan.",
    }[a.band] ?? "";

  $("counts").innerHTML = [
    ["open", a.counts.open],
    ["blocked", a.counts.blocked],
    ["unassigned", a.counts.unassigned],
    ["done", `${a.counts.done}/${a.counts.total}`],
  ]
    .map(([label, value]) => `<span class="chip"><strong>${esc(value)}</strong> ${esc(label)}</span>`)
    .join("");

  $("confidence").textContent = `Data coverage ${Math.round(a.dataConfidence * 100)}% · ${a.counts.critical} at Highest priority`;

  const maxPenalty = Math.max(...a.drivers.map((d) => d.penalty), 1);
  $("drivers").innerHTML = a.drivers
    .slice(0, 3)
    .map(
      (d) => `<div class="driver">
        <span class="driver-label">${esc(d.title)}</span>
        <span class="driver-bar"><span style="width:${Math.round((d.penalty / maxPenalty) * 100)}%"></span></span>
        <span class="driver-pts">−${d.penalty}</span>
      </div>`,
    )
    .join("");

  const criticalFindings = a.signals
    .filter((s) => s.severity === "critical")
    .reduce((n, s) => n + Math.round(s.penalty / s.weight), 0);
  const gateNote = criticalFindings >= 2
    ? `<strong>Gate applied:</strong> ${criticalFindings} unresolved blockers. The verdict is capped at ${esc(a.bandLabel)} no matter how many points the rest of the release earns.`
    : criticalFindings === 1
      ? `<strong>Gate applied:</strong> one unresolved blocker. The best possible verdict is SHIP WITH CONDITIONS.`
      : a.conditions.length
        ? `<strong>Before you ship:</strong> ${esc(a.conditions[0])}`
        : `<strong>No gate applied:</strong> nothing in the data holds this release back.`;
  $("gate").innerHTML = gateNote;

  $("ai-badge").textContent = bundle.ai.enabled ? `AI narration: ${bundle.ai.provider}` : "AI narration: off (deterministic)";
  $("ai-badge").className = `pill ${bundle.ai.enabled ? "pill-on" : "pill-muted"}`;
  $("source-badge").textContent = `source: ${a.source}`;
  $("narrative-badge").textContent =
    narrative.provider === "llm" ? `LLM · ${narrative.model}` : narrative.fallbackUsed ? "fallback" : "deterministic";
  $("narrative-badge").className = `pill ${narrative.provider === "llm" ? "pill-on" : "pill-muted"}`;

  $("narrative").innerHTML = md(narrative.text);
  $("risk-count").textContent = a.signals.length;

  renderRisks(a, bundle.overlaps);
  renderPlan(a);
  renderNotes(bundle.notes, a);
  renderDrift(bundle.drift, a);
  renderWhy(a);
}

function renderRisks(a, overlaps) {
  if (!a.signals.length) {
    $("risks").innerHTML = `<div class="risk"><p class="risk-title">No risk signals fired.</p><p class="risk-action">Nothing in this release's Jira data blocks the cut.</p></div>`;
  } else {
    $("risks").innerHTML = a.signals
      .map(
        (s) => `
      <article class="risk risk-${esc(s.severity)}">
        <div class="risk-head">
          <h3 class="risk-title">${esc(s.title)}</h3>
          <div class="risk-meta">
            <span class="sev sev-${esc(s.severity)}">${esc(s.severity)}</span>
            <span class="penalty">−${s.penalty} pts · ${s.findings.length} ${s.findings.length === 1 ? "ticket" : "tickets"}</span>
          </div>
        </div>
        <p class="risk-rule">${esc(s.rule)}</p>
        ${s.findings
          .map(
            (f) => `
          <div class="finding">
            <span class="key">${esc(f.itemKey)}</span>
            <div class="finding-body">
              <div class="finding-summary">${esc(f.summary)}</div>
              <div class="finding-detail">${esc(f.detail)}</div>
              ${f.excerpt ? `<blockquote class="excerpt">${esc(f.excerpt)}</blockquote>` : ""}
            </div>
          </div>`,
          )
          .join("")}
        <p class="risk-action"><strong>Action:</strong> ${esc(s.recommendation)}</p>
      </article>`,
      )
      .join("");
  }

  if (overlaps && overlaps.length) {
    $("overlaps").innerHTML = `
      <h3>Possible overlap in open work</h3>
      ${overlaps
        .map(
          (o) => `<div class="overlap-row">
            <span class="key">${esc(o.a)}</span><span class="key">${esc(o.b)}</span>
            <span class="sim">${Math.round(o.similarity * 100)}% similar</span>
            <span>shared: ${esc(o.sharedTerms.join(", "))}</span>
          </div>`,
        )
        .join("")}`;
  } else {
    $("overlaps").innerHTML = "";
  }
}

function renderPlan(a) {
  const conditions = a.conditions.length
    ? a.conditions.map((c) => `<li><span class="box"></span><span>${esc(c)}</span></li>`).join("")
    : `<li><span class="box"></span><span>No blocking conditions. Ship.</span></li>`;
  $("conditions").innerHTML = conditions;
  $("actions").innerHTML = a.nextActions.map((x) => `<li>${esc(x)}</li>`).join("");
}

function renderNotes(notes, assessment) {
  if (!notes.length) {
    $("notes").innerHTML = `<p class="note-empty">No completed work in scope yet.</p>`;
    return;
  }
  const grid = notes
    .map(
      (section) => `
      <article class="note-section">
        <h3>${esc(section.title)}</h3>
        ${section.items
          .map((i) => `<div class="note-item"><span class="key">${esc(i.key)}</span><span>${esc(i.summary)}</span></div>`)
          .join("")}
      </article>`,
    )
    .join("");
  const open = assessment.counts.open;
  $("notes").innerHTML =
    grid +
    (open
      ? `<p class="note-footnote">${open} item${open === 1 ? "" : "s"} in scope ${open === 1 ? "is" : "are"} still open and deliberately not listed above. Confido never reports unfinished work as shipped.</p>`
      : "");
}

function renderDrift(drift, a) {
  if (!drift || !drift.available) {
    $("drift").innerHTML = `<p class="drift-empty">${esc(
      drift?.headline ?? "No previous snapshot for this release, so there is nothing to compare yet.",
    )}</p>`;
    return;
  }
  const delta = drift.scoreDelta ?? 0;
  const deltaClass = drift.direction === "worsened" ? "drift-worsened" : drift.direction === "improved" ? "drift-improved" : "drift-flat";
  const sign = delta > 0 ? "+" : "";
  const column = (title, rows) => `
    <div class="drift-col">
      <h3>${esc(title)}</h3>
      ${rows.length ? `<ul>${rows.map((r) => `<li>${r}</li>`).join("")}</ul>` : `<p class="drift-empty">Nothing.</p>`}
    </div>`;

  $("drift").innerHTML = `
    <div class="drift-head">
      <span class="drift-score">${drift.previousScore}</span>
      <span class="drift-arrow">→</span>
      <span class="drift-score">${a.score}</span>
      <span class="drift-delta ${deltaClass}">${sign}${delta} points</span>
      <span class="muted">${esc(drift.headline)}</span>
    </div>
    <div class="drift-grid">
      ${column("New risks", drift.newRisks.map((r) => `<span class="sev sev-${esc(r.severity)}">${esc(r.severity)}</span> ${esc(r.title)}`))}
      ${column("Cleared risks", drift.clearedRisks.map((r) => esc(r.title)))}
      ${column("Completed", drift.completedItems.map((i) => `<span class="key">${esc(i.key)}</span> ${esc(i.summary)}`))}
      ${column("Added to scope", drift.addedItems.map((i) => `<span class="key">${esc(i.key)}</span> ${esc(i.summary)}`))}
    </div>`;
}

function renderWhy(a) {
  const penalty = a.signals.reduce((sum, s) => sum + s.penalty, 0);
  const rows = a.signals
    .map(
      (s) => `
      <div class="why-line">
        <div>
          <div>${esc(s.title)}</div>
          <div class="why-sub">${Math.round(s.penalty / s.weight)} × ${s.weight}${s.penalty / s.weight < s.findings.length ? " (capped)" : ""} · ${s.findings
            .slice(0, 5)
            .map((f) => esc(f.itemKey))
            .join(", ")}</div>
        </div>
        <div class="penalty">−${s.penalty}</div>
      </div>`,
    )
    .join("");

  $("why").innerHTML = `
    <div class="why-line">
      <div class="why-formula">100 − ${penalty} = ${a.score}</div>
      <div class="penalty">${esc(a.bandLabel)}</div>
    </div>
    ${rows || '<div class="why-line"><div>No rules fired.</div><div class="penalty">0</div></div>'}
    <p class="why-note">Every deduction comes from the rule shown. No model contributes to the number, the band, or the conditions — a model may only rewrite the prose in the brief.</p>`;
}

/* ------------------------------------------------------------------ events */
function wire() {
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.csv) {
        state.csv = null;
        $("csv-input").value = "";
      }
      state.preset = button.dataset.preset;
      document.querySelectorAll("[data-preset]").forEach((b) => b.classList.toggle("is-active", b === button));
      $("drift-toggle").disabled = state.preset !== "payments";
      assess();
    });
  });

  $("drift-toggle").addEventListener("change", (event) => {
    state.drift = event.target.checked;
    assess();
  });

  $("refresh").addEventListener("click", assess);

  $("csv-input").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (!text.includes(",")) {
      showError("That file does not look like a CSV export.");
      return;
    }
    state.csv = text;
    state.drift = false;
    $("drift-toggle").checked = false;
    $("drift-toggle").disabled = true;
    assess();
  });

  document.querySelectorAll(".tabs [data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      const tabs = [...document.querySelectorAll(".tabs [data-tab]")];
      const index = tabs.indexOf(tab);
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      selectTab(next.dataset.tab);
    });
  });

  $("download").addEventListener("click", async () => {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
    });
    if (!res.ok) {
      showError("Could not build the report.");
      return;
    }
    const text = await res.text();
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `confido-${(state.bundle?.assessment.release.projectKey || "release").toLowerCase()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  });

  $("copy").addEventListener("click", async () => {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload()),
    });
    if (!res.ok) return showError("Could not build the brief.");
    await navigator.clipboard.writeText(await res.text());
    const button = $("copy");
    const label = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = label), 1500);
  });
}

function selectTab(name) {
  document.querySelectorAll(".tabs [data-tab]").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.hidden = panel.id !== `panel-${name}`;
  });
}

function showError(message) {
  const el = $("error");
  el.hidden = false;
  el.textContent = message;
}

wire();
assess();
