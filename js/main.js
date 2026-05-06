import { drawChart } from "./chart.js";
import { loadAI } from "./ai_panel.js";
import { getInterpretation } from "./api.js";
import { generateMarketData } from "./dataGenerator.js";

const SPARSE_DATA_THREHOLD = 4

/// ADD NEW TESTS HERE WITH THEIR CORRESPONDING DATA AND PRE-MADE SUMMARY
///////PRESET DATA////////
const preset_test_info = [
    {"dom-elem-id": "load-task-1", "name": "Vinyl Record 1",
    "marketplace_item_filename":"task1.json", 
    "interpretation_filename": "task1.json"},

    {"dom-elem-id": "load-task-2", "name": "Vinyl Record 2",
    "marketplace_item_filename":"task2.json", 
    "interpretation_filename": "task2.json"},

    {"dom-elem-id": "load-task-3", "name": "Vinyl Record 3",
    "marketplace_item_filename":"task3.json", 
    "interpretation_filename": "task3.json"},
    
    {"dom-elem-id": "load-task-4", "name": "Vinyl Record 4",
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
let currentInterpretation = ""; 
let currentAiGraphData = {};
let showAI = (condition=="contestable")? false : true;
let currentRequestID = 0

// to not re-render toggle buttons
let rawTableListenerAdded = false;

////////////////////////

// renders chart based on public variables
async function render(data, item_name, test_idx, usePresetInterpretation = false, presetInterpretationFileName = "") {
  const requestID = ++currentRequestID;
  
  // assign public variables
  currentTestIdx = test_idx
  currentData = data;
  currentAiGraphData = {}
  currentName = item_name

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
  loadAI(condition, currentInterpretation, unlockAICallback);
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
        ? "Hide transaction table"
        : "Show all transactions";
      if (visible) renderTable();
    });
  }

  if (!tableContainer.classList.contains("hidden") && tableContainer.querySelector("table")) {
    renderTable();
  }
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
  await render(marketplace_item, next_test.name, idx, true, next_test.interpretation_filename);
  setupDataControls();
}

function setupDataControls() {
  const container = document.getElementById("data-controls");
  if (!container) return;

  container.innerHTML = `
    <div class="data-source-label">Marketplace Item <span style="color: blue; font-weight: bold;">${currentTestIdx+1}</span> of ${preset_test_info.length}</div>
    <div class="data-source-buttons">
      <button type="button" ${currentTestIdx > 0 ? "" : `class="disabled" `} id="previous-test">Previous Item</button>
      <button type="button" ${currentTestIdx < preset_test_info.length-1  ? "":`class="disabled" `}id="next-test">Next Item</button>
      ${
        ""
        //preset_test_info.reduce(
        //(total_string, test) => total_string + `<button type="button" id="${test["dom-elem-id"]}">${test.name}</button>`, "")
      }
      ${
        "" // <button type="button" id="gen-random">Generate random data</button>
      }
    </div>
    ${
        "" //<p class="data-source-hint">Demo data is fixed. Random data is regenerated each time (same schema).</p>
    }  
  `;

  preset_test_info.forEach((test, idx) => {
    const test_btn = document.getElementById(test["dom-elem-id"]);
    if (test_btn) { // only add existing elements
      test_btn.addEventListener("click", async () => {
          const marketplace_item = await loadTestData("test_data/"+test.marketplace_item_filename);
          if (test.interpretation_filename == "none") {
            await render(marketplace_item, test.name, idx, false, "");
          } else {
            await render(marketplace_item, test.name, idx, true, test.interpretation_filename);
          }
        });
      }
    })

  const prev_button = document.getElementById("previous-test")
  if (prev_button) {
    prev_button.addEventListener("click", async () => {
      await goToTestNumber((currentTestIdx-1)%preset_test_info.length)
    });
  }

  const next_button = document.getElementById("next-test")
  if (next_button) {
    next_button.addEventListener("click", async () => {
      await goToTestNumber((currentTestIdx+1)%preset_test_info.length)
    });
  }

  // document.getElementById("gen-random").addEventListener("click", async () => {
  //   const data = generateMarketData({ n: 18, seed: Date.now() % 1e6 });
  //   await render(data, "Random Data", false, "");
  // });
}

// render initially with loadDemoData
async function init() {
  // const data = await loadDemoData();
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
