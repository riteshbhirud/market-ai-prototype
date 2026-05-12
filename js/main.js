import { drawChart } from "./chart.js";
import { loadAI } from "./ai_panel.js";
import { getInterpretation } from "./api.js";
import { generateMarketData } from "./dataGenerator.js";

const SPARSE_DATA_THREHOLD = 4

/// ADD NEW TESTS HERE WITH THEIR CORRESPONDING DATA AND PRE-MADE SUMMARY
///////PRESET DATA////////
const preset_test_info = [

    {"dom-elem-id": "load-task-1", "name": "Vinyl Record 1",
    "description": "Pink Floyd — The Dark Side of the Moon, NM pressing across multiple platforms.",
    "marketplace_item_filename":"task1.json",
    "interpretation_filename": "task1.json"},

    {"dom-elem-id": "load-task-2", "name": "Vinyl Record 2",
    "description": "Vintage VG+ pressing tracked across Discogs and Amazon over a long history.",
    "marketplace_item_filename":"task2.json",
    "interpretation_filename": "task2.json"},

    {"dom-elem-id": "load-task-3", "name": "Vinyl Record 3",
    "description": "Mid-condition collectible with mixed listing types and platforms.",
    "marketplace_item_filename":"task3.json",
    "interpretation_filename": "task3.json"},

    {"dom-elem-id": "load-task-4", "name": "Vinyl Record 4",
    "description": "Sparse-data collectible — interpretation will surface higher uncertainty.",
    "marketplace_item_filename":"task4.json",
    "interpretation_filename": "task4.json"},
  // {"dom-elem-id": "load-test-7", "name": "Jackie Robinson Card (Grade 7)",
  //   "marketplace_item_filename":"empty.json", 
  //   "interpretation_filename": "grade_7_interpretation.json"},

  // {"dom-elem-id": "load-test-8", "name": "Jackie Robinson Card (Grade 8)", 
  //   "marketplace_item_filename":"grade_8.json", 
  //   "interpretation_filename": "grade_8_interpretation.json"},

  // {"dom-elem-id": "load-test-9", "name": "Jackie Robinson Card (Grade 9)", 
  //   "marketplace_item_filename":"grade_9.json", 
  //   "interpretation_filename": "grade_9_interpretation.json"},
    
  // {"dom-elem-id": "load-vinyl", "name": "Vinyl Record", 
  //   "marketplace_item_filename":"vinyl_record.json", 
  //   "interpretation_filename": "vinyl_record_2.json"},
  // {"dom-elem-id": "load-demo","test_name": "Demo Record", "marketplace_item_filename":"floyd.json", "interpretation_filename": "none"},
  // {"idx": 0, "dom-elem-id": "floyd-test","name": "Floyd Record", "marketplace_item_filename":"floyd.json", "interpretation_filename": "interpret_floyd.json"},
]
/// PUBLIC STATE DATA ///
const params = new URLSearchParams(window.location.search);
const condition = params.get("condition") || "control";
let currentTestIdx = -1
let currentData = []; // re-renders with data
let currentName = "Choose an Item to Begin"; // re-renders with data
let currentDescription = "";
let currentInterpretation = "";
let currentAiGraphData = {};
let showAI = (condition=="contestable")? false : true;
let currentRequestID = 0

// to not re-render toggle buttons
let rawTableListenerAdded = false;

////////////////////////

// renders chart based on public variables
async function render(data, item_name, test_idx, usePresetInterpretation = false, presetInterpretationFileName = "", item_description = "") {
  const requestID = ++currentRequestID;

  // assign public variables
  currentTestIdx = test_idx
  currentData = data;
  currentAiGraphData = {}
  currentName = item_name
  currentDescription = item_description;

  setupItemDescription(currentName, currentDescription, currentData);
  drawChart(currentData, currentName, currentTestIdx, currentAiGraphData, { showAI }); // draws chart with d3
  setupRawTable(currentData); // sets up the table below the graph for raw data
  checkSparsity(currentData);

  // if panel exists, set loading message
  const panel = document.getElementById("interpretation");
  if (panel) {
    panel.innerHTML = "<p class=\"interpretation-loading\">Loading interpretation…</p>";
  }

  // assign interpretation to public variable
  const loadedInterpretation = await getInterpretation(data, usePresetInterpretation, presetInterpretationFileName);
  
  // ignore stale requests
  if (requestID !== currentRequestID) return;
  currentInterpretation = loadedInterpretation
  // extract current AI graph data and assign it to public variable
  currentAiGraphData = currentInterpretation?.grade_chart

  drawChart(currentData, currentName, currentTestIdx, currentAiGraphData, { showAI }); // re-render with AI prediction
  loadAI(condition, currentInterpretation, currentData, unlockAICallback);
}

function unlockAICallback(){
  showAI = true
  console.log("unlocked AI")
  drawChart(currentData, currentName, currentTestIdx, currentAiGraphData, { showAI })
}

function checkSparsity(data) {
  const sales = data.filter((d) => d.listing_type === "sale");
  const warningEl = document.getElementById("warning");
  if (sales.length < SPARSE_DATA_THREHOLD) {
    warningEl.innerHTML =
      "⚠ Sparse transaction data — interpretation may be unreliable.";
  } else {
    warningEl.innerHTML = "";
  }
}

function setupItemDescription(name, description, data) {
  const container = document.getElementById("item-description");
  if (!container) return;

  const totalCount = data.length;
  const saleCount = data.filter((d) => d.listing_type !== "unsold").length;
  const platforms = [...new Set(data.map((d) => d.platform))];

  const prices = data.map((d) => d.price).filter((p) => Number.isFinite(p)).sort((a, b) => a - b);
  const median = prices.length
    ? (prices.length % 2 === 0
        ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
        : prices[Math.floor(prices.length / 2)])
    : null;
  const minPrice = prices.length ? prices[0] : null;
  const maxPrice = prices.length ? prices[prices.length - 1] : null;

  const dateRange = (() => {
    if (!data.length) return "";
    const dates = data.map((d) => new Date(d.date)).filter((d) => !isNaN(d));
    if (!dates.length) return "";
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return `${fmt(min)} – ${fmt(max)}`;
  })();

  const fmtPrice = (n) => (n == null ? "—" : `$${Math.round(n)}`);

  container.innerHTML = `
    <div class="hero-head">
      <span class="hero-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"></circle>
          <circle cx="12" cy="12" r="3.5"></circle>
          <circle cx="12" cy="12" r="0.8" fill="currentColor"></circle>
        </svg>
      </span>
      <div class="hero-text">
        <p class="hero-eyebrow">Marketplace item</p>
        <p class="hero-title">${name}</p>
        ${description ? `<p class="hero-desc">${description}</p>` : ""}
      </div>
      <span class="hero-range" aria-label="Date range">${dateRange}</span>
    </div>
    <div class="kpi-row">
      <div class="kpi" data-tooltip="Median price across all listings, sold and unsold.">
        <span class="kpi-label">Median price</span>
        <span class="kpi-value">${fmtPrice(median)}</span>
      </div>
      <div class="kpi" data-tooltip="Lowest and highest price observed in the dataset.">
        <span class="kpi-label">Range</span>
        <span class="kpi-value">${fmtPrice(minPrice)} <span class="kpi-sep">–</span> ${fmtPrice(maxPrice)}</span>
      </div>
      <div class="kpi" data-tooltip="Total number of listings in the dataset, including unsold ones.">
        <span class="kpi-label">Listings</span>
        <span class="kpi-value">${totalCount} <span class="kpi-sub">(${saleCount} sold)</span></span>
      </div>
      <div class="kpi" data-tooltip="Number of distinct marketplaces represented.">
        <span class="kpi-label">Platforms</span>
        <span class="kpi-value">${platforms.length}</span>
      </div>
    </div>
  `;
}

// Column metadata: type drives comparator + filter input behavior.
const TABLE_COLUMNS = [
  { key: "id", label: "ID", type: "number" },
  { key: "date", label: "Date", type: "date" },
  { key: "price", label: "Price", type: "number" },
  { key: "listing_type", label: "Listing type", type: "string" },
  { key: "condition", label: "Condition", type: "string" },
  { key: "platform", label: "Platform", type: "string" },
  { key: "description", label: "Description", type: "string" },
];

// Per-table state survives between toggles within a session.
let tableSortKey = null;
let tableSortDir = "asc"; // "asc" | "desc"
let tableFilters = {}; // { colKey: filterString }

function compareCellValues(a, b, type) {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (type === "number") return Number(a) - Number(b);
  if (type === "date") return new Date(a) - new Date(b);
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

function rowMatchesFilters(row) {
  for (const [colKey, query] of Object.entries(tableFilters)) {
    if (!query) continue;
    const raw = row[colKey];
    const cell = raw == null ? "" : String(raw);
    if (!cell.toLowerCase().includes(query.toLowerCase())) return false;
  }
  return true;
}

function setupRawTable(data) {
  const toggleBtn = document.getElementById("toggle-table");
  const tableContainer = document.getElementById("raw-table");

  if (!toggleBtn || !tableContainer) return;
  let visible = !tableContainer.classList.contains("hidden");

  function renderTable() {
    tableContainer.innerHTML = "";

    const filteredRows = currentData.filter(rowMatchesFilters);

    if (tableSortKey) {
      const col = TABLE_COLUMNS.find((c) => c.key === tableSortKey);
      const type = col ? col.type : "string";
      filteredRows.sort((a, b) => {
        const cmp = compareCellValues(a[tableSortKey], b[tableSortKey], type);
        return tableSortDir === "asc" ? cmp : -cmp;
      });
    }

    const totalCount = currentData.length;
    const shownCount = filteredRows.length;

    const summaryBar = document.createElement("div");
    summaryBar.className = "table-summary";
    const activeFilters = Object.entries(tableFilters).filter(([, v]) => v);
    summaryBar.innerHTML = `
      <span class="table-summary-count">Showing <strong>${shownCount}</strong> of ${totalCount} listings</span>
      ${activeFilters.length ? `<button type="button" class="table-clear-filters">Clear filters</button>` : ""}
    `;
    tableContainer.appendChild(summaryBar);

    const table = document.createElement("table");
    table.className = "raw-transaction-table";

    const thead = document.createElement("thead");

    const headerRow = document.createElement("tr");
    TABLE_COLUMNS.forEach((col) => {
      const th = document.createElement("th");
      th.className = "table-th-sort";
      th.dataset.col = col.key;
      const isSorted = tableSortKey === col.key;
      const arrow = isSorted ? (tableSortDir === "asc" ? "▲" : "▼") : "↕";
      th.innerHTML = `
        <span class="th-label">${col.label}</span>
        <span class="th-sort-indicator${isSorted ? " active" : ""}">${arrow}</span>
      `;
      th.addEventListener("click", () => {
        if (tableSortKey === col.key) {
          tableSortDir = tableSortDir === "asc" ? "desc" : "asc";
        } else {
          tableSortKey = col.key;
          tableSortDir = "asc";
        }
        renderTable();
      });
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const filterRow = document.createElement("tr");
    filterRow.className = "table-filter-row";
    TABLE_COLUMNS.forEach((col) => {
      const td = document.createElement("th");
      const input = document.createElement("input");
      input.type = "search";
      input.className = "table-filter-input";
      input.placeholder = `Filter ${col.label.toLowerCase()}`;
      input.value = tableFilters[col.key] || "";
      input.setAttribute("aria-label", `Filter by ${col.label}`);
      input.addEventListener("input", (e) => {
        const v = e.target.value;
        if (v) tableFilters[col.key] = v;
        else delete tableFilters[col.key];
        // Re-render but keep focus on this input.
        const colKey = col.key;
        renderTable();
        const next = tableContainer.querySelector(`.table-filter-input[data-col="${colKey}"]`);
        if (next) {
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }
      });
      input.dataset.col = col.key;
      td.appendChild(input);
      filterRow.appendChild(td);
    });
    thead.appendChild(filterRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    if (filteredRows.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = TABLE_COLUMNS.length;
      td.className = "table-empty";
      td.textContent = "No listings match the current filters.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      filteredRows.forEach((row) => {
        const tr = document.createElement("tr");
        TABLE_COLUMNS.forEach((col) => {
          const td = document.createElement("td");
          const v = row[col.key];
          td.textContent = v == null ? "" : String(v);
          if (col.type === "number" || col.type === "date") {
            td.classList.add("td-numeric");
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    tableContainer.appendChild(table);

    const clearBtn = tableContainer.querySelector(".table-clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        tableFilters = {};
        renderTable();
      });
    }
  }

  if (!rawTableListenerAdded) {
    rawTableListenerAdded = true;
    toggleBtn.addEventListener("click", () => {
      visible = !visible;
      tableContainer.classList.toggle("hidden", !visible);
      toggleBtn.textContent = visible
        ? "Hide Table of All Listings"
        : "Show Table of All Listings";
      if (visible) renderTable();
    });
  }

  if (visible) renderTable();
}

// loads test data depending on the preset-test-info struct
async function loadTestData(filename) {
  const data = await fetch(`data/${filename}`).then((r) => r.json());
  return data;
}

// function to go to next test
async function goToTestNumber(idx) {

  showAI = (condition=="contestable")? false : true;
  const next_test = preset_test_info[(idx)%preset_test_info.length]
  
  const marketplace_item = await loadTestData("test_data/"+next_test.marketplace_item_filename);
  await render(marketplace_item, next_test.name, idx, true, next_test.interpretation_filename, next_test.description || "");
  setupDataControls();
}

function setupDataControls() {
  const container = document.getElementById("data-controls");
  if (!container) return;

  const arrowLeft = `
    <span class="nav-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </span>
  `;

  const arrowRight = `
    <span class="nav-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </span>
  `;

  const isPrevDisabled = currentTestIdx <= 0;
  const isNextDisabled = currentTestIdx >= preset_test_info.length - 1;

  container.innerHTML = `
    <div class="data-source-label">
      Item <span class="item-counter">${currentTestIdx + 1}</span>
      of ${preset_test_info.length}
    </div>

    <div class="data-source-buttons">
      <button
        type="button"
        class="${isPrevDisabled ? "disabled" : ""}"
        id="previous-test"
        aria-label="Previous item"
        aria-disabled="${isPrevDisabled}"
        data-tooltip="Previous item"
      >
        ${arrowLeft}
      </button>

      <button
        type="button"
        class="${isNextDisabled ? "disabled" : ""}"
        id="next-test"
        aria-label="Next item"
        aria-disabled="${isNextDisabled}"
        data-tooltip="Next item"
      >
        ${arrowRight}
      </button>
    </div>
  `;

  preset_test_info.forEach((test, idx) => {
    const test_btn = document.getElementById(test["dom-elem-id"]);

    if (test_btn) {
      test_btn.addEventListener("click", async () => {
        const marketplace_item = await loadTestData(
          "test_data/" + test.marketplace_item_filename
        );

        if (test.interpretation_filename === "none") {
          await render(
            marketplace_item,
            test.name,
            idx,
            false,
            ""
          );
        } else {
          await render(
            marketplace_item,
            test.name,
            idx,
            true,
            test.interpretation_filename
          );
        }
      });
    }
  });

  const prev_button = document.getElementById("previous-test");

  if (prev_button) {
    prev_button.addEventListener("click", async () => {
      if (currentTestIdx <= 0) return;

      await goToTestNumber(currentTestIdx - 1);
    });
  }

  const next_button = document.getElementById("next-test");

  if (next_button) {
    next_button.addEventListener("click", async () => {
      if (currentTestIdx >= preset_test_info.length - 1) return;

      await goToTestNumber(currentTestIdx + 1);
    });
  }
}

function setupConditionBadge() {
  const badge = document.getElementById("condition-badge");
  if (!badge) return;
  const labels = {
    control: "Control",
    inspectable: "Inspectable",
    contestable: "Contestable",
  };
  const label = labels[condition] || "Control";
  badge.textContent = label;
  badge.dataset.variant = condition;
}

// render initially with loadDemoData
async function init() {
  // const data = await loadDemoData();
  setupConditionBadge();
  setupDataControls();
  await goToTestNumber(0)
}

// Re-render chart on viewport resize so width tracks the left panel.
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (!currentData || !currentData.length) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawChart(currentData, currentName, currentTestIdx, currentAiGraphData, { showAI });
  }, 120);
});

init();
