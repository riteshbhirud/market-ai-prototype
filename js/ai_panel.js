/**
 * Renders the AI interpretation panel according to condition.
 * Interpretation is supplied from either the LLM inference API or the rule-based engine.
 * - control: opaque summary only.
 * - inspectable: full interpretation with evidence, assumptions, limitations, alternatives.
 * - contestable: cognitive forcing — user records interpretation first, then reveal/hide AI, etc.
 */

const SECTION_TIPS = {
  Plan: "How the AI structured its analysis before drawing conclusions.",
  Evidence: "Specific data points the AI used to support its estimate.",
  Assumptions: "What the AI took for granted — worth questioning if any are wrong.",
  Limitations: "Caveats about data quality, sample size, or coverage that may bias the result.",
  "Alternative view": "A different reasonable reading of the same data — useful as a sanity check.",
};

const SECTION_ICONS = {
  Plan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
  Evidence: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
  Assumptions: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  Limitations: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  "Alternative view": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`,
};

function infoIcon(key) {
  const tip = SECTION_TIPS[key];
  if (!tip) return "";
  return ` <span class="info-icon" tabindex="0" data-tooltip="${tip.replace(/"/g, "&quot;")}">i</span>`;
}

function sectionIcon(key) {
  const svg = SECTION_ICONS[key];
  if (!svg) return "";
  return `<span class="section-icon" aria-hidden="true">${svg}</span>`;
}

export function loadAI(condition, interpretation, unlockAICallback) {
  const panel = document.getElementById("interpretation");
  if (!panel || !interpretation) return;

  const alts = interpretation.alternatives && interpretation.alternatives.length ? interpretation.alternatives : ["No alternative view generated."];
  const hasScot = interpretation.plan || (interpretation.reasoning_steps && interpretation.reasoning_steps.length > 0);
  const planHtml = hasScot && interpretation.plan ? `<section class="interpretation-section"><h4>${sectionIcon("Plan")}<span class="section-label">Plan</span>${infoIcon("Plan")}</h4><p>${interpretation.plan}</p></section>` : "";
  // const reasoningHtml = hasScot && interpretation.reasoning_steps && interpretation.reasoning_steps.length
  //   ? `<section class="interpretation-section"><h4>Reasoning steps</h4><ol>${interpretation.reasoning_steps.map((s) => `<li>${s}</li>`).join("")}</ol></section>`
  //   : "";
  const reasoningHtml = ""

  const aiHeader = `
    <div class="ai-header">
      <h3 class="ai-title">AI Interpretation</h3>
      <span class="ai-pill" aria-label="Powered by AI">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v1H7a3 3 0 0 0-3 3v3a3 3 0 0 0 3 3h0v3a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-3a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-2V5a3 3 0 0 0-3-3z"></path><circle cx="9" cy="11" r="0.8" fill="currentColor"></circle><circle cx="15" cy="11" r="0.8" fill="currentColor"></circle></svg>
        AI
      </span>
    </div>
  `;

  if (condition === "control") {
    panel.innerHTML = `
      ${aiHeader}
      <p class="interpretation-summary interpretation-section">${interpretation.summary}</p>
      <p class="interpretation-note">This system supports interpretation, not recommendation. It does not tell you what to buy or what price is "correct."</p>
    `;
    return;
  }

  if (condition === "inspectable") {
    panel.innerHTML = `
      ${aiHeader}
      <p class="interpretation-summary interpretation-section">${interpretation.summary}</p>
      ${planHtml}
      ${reasoningHtml}
      <section class="interpretation-section">
        <h4>${sectionIcon("Evidence")}<span class="section-label">Evidence</span>${infoIcon("Evidence")}</h4>
        <ul>${(interpretation.evidence || []).map((e) => `<li>${e}</li>`).join("")}</ul>
      </section>
      <section class="interpretation-section">
        <h4>${sectionIcon("Assumptions")}<span class="section-label">Assumptions</span>${infoIcon("Assumptions")}</h4>
        <ul>${interpretation.assumptions.map((a) => `<li>${a}</li>`).join("")}</ul>
      </section>
      <section class="interpretation-section">
        <h4>${sectionIcon("Limitations")}<span class="section-label">Limitations</span>${infoIcon("Limitations")}</h4>
        <ul>${interpretation.limitations.map((l) => `<li>${l}</li>`).join("")}</ul>
      </section>
      <section class="interpretation-section">
        <h4>${sectionIcon("Alternative view")}<span class="section-label">Alternative view</span>${infoIcon("Alternative view")}</h4>
        <p>${alts[0]}</p>
      </section>
    `;
    return;
  }

  if (condition === "contestable") {
    let altIndex = 0;
    let userSubmitted = false;
    let aiVisible = false;

    function renderContestable() {
      let html = `
        <h3 class="user-title">Your interpretation</h3>
        <p class="interpretation-hint">Record your own reading of the data before seeing the system’s interpretation. This step is required to continue.</p>
        <textarea id="userInterpretation" rows="4" placeholder="What do you notice about prices, platforms, and listing types? What might explain the range?"></textarea>
        <div class="contestable-actions">
          <button type="button" id="submit-user">Submit my interpretation</button>
        </div>

        <div>
          <hr>
          ${aiHeader}
          <div id="ai-block-hidden-message">
            <p>Currently hidden until interpretation is submitted</p>
          </div>
          <div id="contestable-ai-block" class="hidden">
            <hr>
            <div class="contestable-ai-toolbar">
              <button type="button" id="toggle-ai">Hide system interpretation</button>
              <button type="button" id="alternative-btn">Request alternative explanation</button>
              <a href="#" id="raw-data-link">View raw data table</a>
            </div>
            <div id="contestable-ai-content">
              <p class="interpretation-summary interpretation-section">${interpretation.summary}</p>
              ${planHtml}
              ${reasoningHtml}
              <section class="interpretation-section collapsible">
                <h4 class="collapse-toggle">${sectionIcon("Assumptions")}<span class="section-label">Assumptions</span>${infoIcon("Assumptions")} <span class="collapse-icon">▼</span></h4>
                <ul class="collapse-content hidden"><li>${interpretation.assumptions.join("</li><li>")}</li></ul>
              </section>
              <section class="interpretation-section collapsible">
                <h4 class="collapse-toggle">${sectionIcon("Limitations")}<span class="section-label">Limitations</span>${infoIcon("Limitations")} <span class="collapse-icon">▼</span></h4>
                <ul class="collapse-content hidden"><li>${interpretation.limitations.join("</li><li>")}</li></ul>
              </section>
              <section class="interpretation-section">
                <h4>${sectionIcon("Evidence")}<span class="section-label">Evidence</span>${infoIcon("Evidence")}</h4>
                <ul>${interpretation.evidence.map((e) => `<li>${e}</li>`).join("")}</ul>
              </section>
              <p id="alternative-text" class="alternative-explanation">${alts[0]}</p>
            </div>
          </div>
        </div>
      `;
      panel.innerHTML = html;

      const submitBtn = document.getElementById("submit-user");
      const textarea = document.getElementById("userInterpretation");
      const hiddenMessage = document.getElementById("ai-block-hidden-message");
      const aiBlock = document.getElementById("contestable-ai-block");
      const toggleBtn = document.getElementById("toggle-ai");
      const altBtn = document.getElementById("alternative-btn");
      const altText = document.getElementById("alternative-text");
      const rawLink = document.getElementById("raw-data-link");

      submitBtn.addEventListener("click", () => {
        const text = (textarea.value || "").trim();
        if (!text) {
          submitBtn.setAttribute("aria-invalid", "true");
          return;
        }
        unlockAICallback();
        userSubmitted = true;
        submitBtn.setAttribute("aria-invalid", "false");
        panel.querySelector(".contestable-actions").innerHTML = '<span class="user-done">Recorded. You can reveal the system interpretation below. You can reveal the AI estimate on the graph above.</span>';
        aiBlock.classList.remove("hidden");
        hiddenMessage.classList.add("hidden");
        aiVisible = true;
        toggleBtn.textContent = "Hide system interpretation";
      });

      toggleBtn.addEventListener("click", () => {
        aiVisible = !aiVisible;
        document.getElementById("contestable-ai-content").classList.toggle("hidden", !aiVisible);
        toggleBtn.textContent = aiVisible ? "Hide system interpretation" : "Show system interpretation";
      });

      altBtn.addEventListener("click", () => {
        altIndex += 1;
        altText.textContent = alts[altIndex % alts.length];
      });

      rawLink.addEventListener("click", (e) => {
        e.preventDefault();
        const tableSection = document.getElementById("table-toggle-section");
        const tableEl = document.getElementById("raw-table");
        const toggleTableBtn = document.getElementById("toggle-table");
        if (tableEl && tableEl.classList.contains("hidden") && toggleTableBtn) {
          toggleTableBtn.click();
        }
        tableSection?.scrollIntoView({ behavior: "smooth" });
      });

      panel.querySelectorAll(".collapse-toggle").forEach((h) => {
        h.addEventListener("click", () => {
          const section = h.closest(".collapsible");
          const content = section?.querySelector(".collapse-content");
          const icon = section?.querySelector(".collapse-icon");
          if (!section || !content) return;
          section.classList.toggle("expanded");
          content.classList.toggle("hidden", !section.classList.contains("expanded"));
          if (icon) icon.textContent = section.classList.contains("expanded") ? "▲" : "▼";
        });
      });

      const content = panel.querySelector("#contestable-ai-content");
      const sections = panel.querySelectorAll(".collapsible");
      sections.forEach((s) => {
        s.classList.remove("expanded");
        s.querySelector(".collapse-content")?.classList.add("hidden");
        s.querySelector(".collapse-icon").textContent = "▼";
      });
    }

    renderContestable();
  }
}

// ext: color all conds from summary 