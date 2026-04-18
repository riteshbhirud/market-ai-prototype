import { drawChart } from "./chart.js";
import { drawLegend } from "./legend.js";
import { loadAI } from "./ai_panel.js";
import { getInterpretation } from "./api.js";
import { generateMarketData } from "./dataGenerator.js";


///////PRESET DATA////////
const preset_test_info = [
  {"dom-elem-id": "load-demo","test_name": "Demo Record", "marketplace_item_filename":"vinyl_record.json", "interpretation_filename": "none"},
  {"dom-elem-id": "load-test-7", "test_name": "Jackie Robinson Card (Grade 7)", "marketplace_item_filename":"grade_7.json", "interpretation_filename": "grade_7_interpretation.json"},
  {"dom-elem-id": "load-test-8", "test_name": "Jackie Robinson Card (Grade 8)", "marketplace_item_filename":"grade_8.json", "interpretation_filename": "grade_8_interpretation.json"},
  {"dom-elem-id": "load-test-9", "test_name": "Jackie Robinson Card (Grade 9)", "marketplace_item_filename":"grade_9.json", "interpretation_filename": "grade_9_interpretation.json"},
  {"dom-elem-id": "load-vinyl", "test_name": "Vinyl Record Demo", "marketplace_item_filename":"vinyl_record.json", "interpretation_filename": "vinyl_record_interpretation.json"},
]
/// PUBLIC STATE DATA ///
const params = new URLSearchParams(window.location.search);
const condition = params.get("condition") || "control";
let currentData = [];
let currentInterpretation = ""; 
let currentAiGraphData = {};
let showAI = true;
let currentRequestID = 0

// to not re-render toggle buttons
let aiToggleListenerAdded = false;
let rawTableListenerAdded = false;

////////////////////////

// renders chart based on public variables
async function render(data, usePresetInterpretation = false, presetInterpretationFileName = "") {
   const requestID = ++currentRequestID;
  
  // assign public variables
  currentData = data;
  currentAiGraphData = {}
  drawChart(currentData, currentAiGraphData, { showAI }); // draws chart with d3
  renderToggleAIButton()
  drawLegend(currentData); // sets up legend depending on the data's present marks
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
  currentAiGraphData = {
    "current_estimate": currentInterpretation?.current_estimate,
    "current_high_range": currentInterpretation?.current_high_range,
    "current_low_range": currentInterpretation?.current_low_range,
    "current_trend": currentInterpretation?.current_trend,
  }
  drawChart(currentData, currentAiGraphData, { showAI }); // re-render with AI prediction
  loadAI(condition, currentInterpretation);
}

function checkSparsity(data) {
  const sales = data.filter((d) => d.listing_type === "sale");
  const warningEl = document.getElementById("warning");
  if (sales.length < 3) {
    warningEl.innerHTML =
      "⚠ Sparse transaction data — interpretation may be unreliable.";
  } else {
    warningEl.innerHTML = "";
  }
}

function setupRawTable(data) {
  const toggleBtn = document.getElementById("toggle-table");
  const tableContainer = document.getElementById("raw-table");

  if (!toggleBtn || !tableContainer) return;
  let visible = false;

  function renderTable() {
    tableContainer.innerHTML = "";
    const columns = [
      "id",
      "date",
      "price",
      "listing_type",
      "condition",
      "platform",
      "description",
    ];
    const table = d3
      .select(tableContainer)
      .append("table")
      .attr("class", "raw-transaction-table");

    table
      .append("thead")
      .append("tr")
      .selectAll("th")
      .data(columns)
      .join("th")
      .text((d) => d.replace(/_/g, " "));

    table
      .append("tbody")
      .selectAll("tr")
      .data(currentData)
      .join("tr")
      .selectAll("td")
      .data((d) => columns.map((c) => d[c]))
      .join("td")
      .text((d) => (d != null ? String(d) : ""));
  }

  if (!rawTableListenerAdded) {
    rawTableListenerAdded = true;
    toggleBtn.addEventListener("click", () => {
      visible = !visible;
      tableContainer.classList.toggle("hidden", !visible);
      toggleBtn.textContent = visible
        ? "Hide raw transaction table"
        : "Show raw transaction table";
      if (visible) renderTable();
    });
  }

  if (!tableContainer.classList.contains("hidden") && tableContainer.querySelector("table")) {
    renderTable();
  }
}

function renderToggleAIButton() {
  const toggleChartAIBtn = document.getElementById("toggle-ai-graph");
  if (!toggleChartAIBtn) return;

  toggleChartAIBtn.textContent = showAI
    ? "Hide AI Interpretation on Chart"
    : "Show AI Interpretation on Chart";

  if (!aiToggleListenerAdded) {
    aiToggleListenerAdded = true;

    toggleChartAIBtn.addEventListener("click", () => {
      showAI = !showAI;

      toggleChartAIBtn.textContent = showAI
        ? "Hide AI Interpretation on Chart"
        : "Show AI Interpretation on Chart";

      drawChart(currentData, currentAiGraphData, { showAI });
    });
  }
}

// loads test data depending on the preset-test-info struct
async function loadTestData(filename) {
  const data = await fetch(`data/${filename}`).then((r) => r.json());
  return data;
}

function setupDataControls() {
  const container = document.getElementById("data-controls");
  if (!container) return;

  container.innerHTML = `
    <div class="data-source-label">Marketplace Items</div>
    <p>Select an item to begin</p>
    <div class="data-source-buttons">
      ${preset_test_info.reduce(
        (total_string, test) => total_string + `<button type="button" id="${test["dom-elem-id"]}">${test.test_name}</button>`, "")
      }
      <button type="button" id="gen-random">Generate random data</button>
    </div>
    <p class="data-source-hint">Demo data is fixed. Random data is regenerated each time (same schema).</p>
  `;

  preset_test_info.forEach((test) => {
    document.getElementById(test["dom-elem-id"]).addEventListener("click", async () => {
      const marketplace_item = await loadTestData("test_data/"+test.marketplace_item_filename);
      if (test.interpretation_filename == "none") {
        await render(marketplace_item, false, "");
      } else {
        await render(marketplace_item, true, test.interpretation_filename);
      }
    });
  })

  // document.getElementById("load-demo").addEventListener("click", async () => {
  //   const data = await loadTestData("test_data/"+grade_7_original.json");
  //   await render(data, false, "");
  // });

  // document.getElementById("load-test-7").addEventListener("click", async () => {
  //   const data = await loadTestData("test_data/grade_7_original.json");
  //   await render(data, true, "grade_7_interpretation.json");
  // });

  // document.getElementById("load-test-8").addEventListener("click", async () => {
  //   const data = await loadTestData("test_data/grade_8_original.json");
  //   await render(data, true, "grade_8_interpretation.json");
  // });

  // document.getElementById("load-test-9").addEventListener("click", async () => {
  //   const data = await loadTestData("test_data/grade_9_original.json");
  //   await render(data, true, "grade_9_interpretation.json");
  // });

  document.getElementById("gen-random").addEventListener("click", async () => {
    const data = generateMarketData({ n: 18, seed: Date.now() % 1e6 });
    await render(data, false, "");
  });
}

// render initially with loadDemoData
async function init() {
  // const data = await loadDemoData();
  setupDataControls();
}

init();
