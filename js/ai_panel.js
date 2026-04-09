/**
 * Renders the AI interpretation panel according to condition.
 * Interpretation is supplied from either the LLM inference API or the rule-based engine.
 * - control: opaque summary only.
 * - inspectable: full interpretation with evidence, assumptions, limitations, alternatives.
 * - contestable: cognitive forcing — user records interpretation first, then reveal/hide AI, etc.
 */
export function loadAI(condition, interpretation) {
  const panel = document.getElementById("interpretation");
  if (!panel || !interpretation) return;

  const alts = interpretation.alternatives && interpretation.alternatives.length ? interpretation.alternatives : ["No alternative view generated."];
  const hasScot = interpretation.plan || (interpretation.reasoning_steps && interpretation.reasoning_steps.length > 0);
  const planHtml = hasScot && interpretation.plan ? `<section class="interpretation-section"><h4>Plan</h4><p>${interpretation.plan}</p></section>` : "";
  // const reasoningHtml = hasScot && interpretation.reasoning_steps && interpretation.reasoning_steps.length
  //   ? `<section class="interpretation-section"><h4>Reasoning steps</h4><ol>${interpretation.reasoning_steps.map((s) => `<li>${s}</li>`).join("")}</ol></section>`
  //   : "";
  const reasoningHtml = ""

  if (condition === "control") {
    panel.innerHTML = `
      <h3>Interpretation</h3>
      <p class="interpretation-summary">${interpretation.summary}</p>
      <p class="interpretation-note">This system supports interpretation, not recommendation. It does not tell you what to buy or what price is "correct."</p>
    `;
    return;
  }

  if (condition === "inspectable") {
    panel.innerHTML = `
      <h3>Interpretation</h3>
      <p class="interpretation-summary">${interpretation.summary}</p>
      ${planHtml}
      ${reasoningHtml}
      <section class="interpretation-section">
        <h4>Evidence</h4>
        <ul>${(interpretation.evidence || []).map((e) => `<li>${e}</li>`).join("")}</ul>
      </section>
      <section class="interpretation-section">
        <h4>Assumptions</h4>
        <ul>${interpretation.assumptions.map((a) => `<li>${a}</li>`).join("")}</ul>
      </section>
      <section class="interpretation-section">
        <h4>Limitations</h4>
        <ul>${interpretation.limitations.map((l) => `<li>${l}</li>`).join("")}</ul>
      </section>
      <section class="interpretation-section">
        <h4>Alternative view</h4>
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
        <h3>Your interpretation</h3>
        <p class="interpretation-hint">Record your own reading of the data before seeing the system’s interpretation. This step is required to continue.</p>
        <textarea id="userInterpretation" rows="4" placeholder="What do you notice about prices, platforms, and listing types? What might explain the range?"></textarea>
        <div class="contestable-actions">
          <button type="button" id="submit-user">Submit my interpretation</button>
        </div>
        <div id="contestable-ai-block" class="hidden">
          <hr>
          <h3>System interpretation</h3>
          <div class="contestable-ai-toolbar">
            <button type="button" id="toggle-ai">Hide system interpretation</button>
            <button type="button" id="alternative-btn">Request alternative explanation</button>
            <a href="#" id="raw-data-link">View raw data table</a>
          </div>
          <div id="contestable-ai-content">
            ${planHtml}
            ${reasoningHtml}
            <p class="interpretation-summary">${interpretation.summary}</p>
            <section class="interpretation-section collapsible">
              <h4 class="collapse-toggle">Assumptions <span class="collapse-icon">▼</span></h4>
              <ul class="collapse-content hidden"><li>${interpretation.assumptions.join("</li><li>")}</li></ul>
            </section>
            <section class="interpretation-section collapsible">
              <h4 class="collapse-toggle">Limitations <span class="collapse-icon">▼</span></h4>
              <ul class="collapse-content hidden"><li>${interpretation.limitations.join("</li><li>")}</li></ul>
            </section>
            <section class="interpretation-section">
              <h4>Evidence</h4>
              <ul>${interpretation.evidence.map((e) => `<li>${e}</li>`).join("")}</ul>
            </section>
            <p id="alternative-text" class="alternative-explanation">${alts[0]}</p>
          </div>
        </div>
      `;
      panel.innerHTML = html;

      const submitBtn = document.getElementById("submit-user");
      const textarea = document.getElementById("userInterpretation");
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
        userSubmitted = true;
        submitBtn.setAttribute("aria-invalid", "false");
        panel.querySelector(".contestable-actions").innerHTML = '<span class="user-done">Recorded. You can reveal the system interpretation below.</span>';
        aiBlock.classList.remove("hidden");
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
