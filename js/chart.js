import { CONDITION_COLORS, getPlatformColors } from "./legend.js";

let aiVisible = true; // persists across renders

function symbolType(type) {
  if (type === "sale") return d3.symbolCircle;
  if (type === "unsold") return d3.symbolCircle;
  if (type === "auction") return d3.symbolTriangle;
  if (type === "obo") return d3.symbolDiamond;
  return d3.symbolCircle;
}

export function drawChart(data, item_name, currentTestIdx, ai_metrics, options) {
  const { showAI = false } = options;

  const containerEl = document.getElementById("chart");   // 👈 define it
  const containerWidth = containerEl.clientWidth || 800;  // fallback

  const MIN_WIDTH = 700;
  const width = Math.max(containerWidth, MIN_WIDTH);
  const height = window.innerWidth < 900 ? 480 : 420;

  const aiUnlocked = showAI;

  // const width = container.clientWidth;   // 👈 dynamic
  // const height = 420;

  const chart = d3.select("#chart").html("");

  // ---------------- TITLE ----------------
  chart.append("h2").text("Item "+(currentTestIdx+1)+": " +item_name);

  // ---------------- BUTTON ----------------
  let btn = chart.select("#toggle-ai-graph");

  if (btn.empty()) {
    btn = chart
      .append("button")
      .attr("id", "toggle-ai-graph")
      .attr("class", "toggle_button toggle_ai_button");
  }

  btn
    .classed("disabled", !aiUnlocked)
    .property("disabled", !aiUnlocked)
    .text(
      !aiUnlocked
        ? "AI Price Estimate Locked"
        : aiVisible
        ? "Hide AI Price Estimate"
        : "Show AI Price Estimate"
    );

    const snapshot = {
      data,
      item_name,
      currentTestIdx,
      ai_metrics,
      showAI
    };

    btn.on("click", null).on("click", () => {
      if (!aiUnlocked) return;
      aiVisible = !aiVisible;
      drawChart(
        snapshot.data,
        snapshot.item_name,
        snapshot.currentTestIdx,
        snapshot.ai_metrics,
        {
          showAI: true
        }
      );
    });

  // ---------------- SVG ----------------
  const svg = chart
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)  // 👈 important
    .style("max-width", "100%")                 // 👈 responsive
    .style("height", "auto");

    const xLatest = d3.max(data, (d) => new Date(d.date));
    const xPadded = new Date(xLatest);
    xPadded.setMonth(xPadded.getMonth() + 3);

    const x = d3
      .scaleTime()
      .domain([d3.min(data, (d) => new Date(d.date)), xPadded])
      .range([70, width - 40]);

  const yMin = d3.min(data, (d) => d.price) - 20;
  const yMax = d3.max(data, (d) => d.price) + 20;

  const y = d3
    .scaleLinear()
    .domain([yMin, yMax])
    .range([height - 60, 40]);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - 60})`)
    .call(d3.axisBottom(x));

  svg.append("g").attr("transform", "translate(70,0)").call(d3.axisLeft(y));

  const tooltip = d3.select("#tooltip");

  const conditionOrder = ["M", "NM", "VG+", "VG", "G"];
  const colorScale = d3
    .scaleOrdinal()
    .domain(conditionOrder)
    .range(conditionOrder.map((c) => CONDITION_COLORS[c] || "gray"));

  const platforms = [...new Set(data.map((d) => d.platform))];
  const platformColors = getPlatformColors(platforms);

  /// Grey BG
  svg
  .append("rect")
  .attr("x", 70)                       
  .attr("y", 40)                      
  .attr("width", width - 110)           
  .attr("height", height - 100)         
  .attr("fill", "#f5f5f5"); 
  
  
  drawLatestDate(svg, data, x, y, width, height, xLatest);

  // ---------------- DRAW AI OR MEDIAN ----------------
  if (aiUnlocked && aiVisible) {
    const latestDate = d3.max(data, d => new Date(d.date));
    const oneMonthAfter = new Date(latestDate);
    oneMonthAfter.setMonth(oneMonthAfter.getMonth() + 3);

    Object.entries(ai_metrics).forEach(([cond, range]) => {
      console.log("entry:"+ JSON.stringify([range, cond]))
      console.log("range:"+ JSON.stringify(range))
      console.log("cond:"+ JSON.stringify(cond))
      drawAIBounds(svg, x, y, width, cond, range,latestDate, oneMonthAfter);
    });
  } 
  drawMedianLine(svg, data, x, y, width);
  
  drawCursorLine(svg, data, x, y, width, height);

  const cursorLine = svg.selectAll(".cursor-line");
  const cursorLineX = svg.selectAll(".cursor-lineX");

  const cursorLineLabel = svg.selectAll(".cursor-line-label");
  const cursorLineLabelX = svg.selectAll(".cursor-line-labelX");

  svg
    .on("mouseover", (event) => {
      const [xVal, yVal] = d3.pointer(event);

      cursorLineX
        .style("opacity", 1)
        .attr("x1", xVal)
        .attr("x2", xVal);

      cursorLineLabelX
        .style("opacity", 1)
        .attr("x", xVal-65)
        .attr("y", yVal - 20)
        .text(`${x.invert(xVal).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`); // format date to MM/DD/YYYY

      cursorLine
        .style("opacity", 1)
        .attr("y1", yVal)
        .attr("y2", yVal);

      cursorLineLabel
        .style("opacity", 1)
        .attr("x", xVal-30)
        .attr("y", yVal - 5)
        .text(`$${Math.round(y.invert(yVal))}`);
    })
    .on("mousemove", (event) => {
      const [xVal, yVal] = d3.pointer(event);

      cursorLineX
        .style("opacity", 1)
        .attr("x1", xVal)
        .attr("x2", xVal);

      cursorLineLabelX
        .style("opacity", 1)
        .attr("x", xVal-65)
        .attr("y", yVal - 20)
        .text(`${x.invert(xVal).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`); // format date to MM/DD/YYYY

      cursorLine
        .attr("y1", yVal)
        .attr("y2", yVal);

      cursorLineLabel
        .attr("x", xVal-30)
        .attr("y", yVal-5)
        .text(`$${Math.round(y.invert(yVal))}`);
    })
    .on("mouseout", () => {
      cursorLineX.style("opacity", 0);
      cursorLineLabelX.style("opacity", 0);
      cursorLine.style("opacity", 0);
      cursorLineLabel.style("opacity", 0);
    });
  //   if (aiVisible) {
  //   Object.entries(ai_metrics).forEach((entry) => {
  //     drawAIBounds(svg, data, x, y, width, entry[1], entry[0]);
  //   });
  // } else {
  //   drawMedianLine(svg, data, x, y, width);
  // }

  // ---------------- DATA POINTS ----------------
  svg
    .selectAll("path.point")
    .data(data)
    .enter()
    .append("path")
    .attr("class", "point")
    .attr(
      "transform",
      (d) => `translate(${x(new Date(d.date))},${y(d.price)})`
    )
    .attr("d", (d) =>
      d3.symbol().type(symbolType(d.listing_type)).size(120)()
    )
    .attr("fill", (d) => colorScale(d.condition))
    .attr("stroke", (d) => platformColors[d.platform] ?? "#333")
    .attr("stroke-width", 2)
    .on("mouseover", (event, d) => {
      d3.selectAll(".chart-range-rect") // highlight the corresponding range
        .transition()
        .duration(150)
        .attr("fill-opacity", 0.02);

      d3.selectAll(`.chart-range-rect[data-cond='${d.condition}']`)
        .transition()
        .duration(150)
        .attr("fill-opacity", 0.15);

      d3.selectAll(`.chart-range-line[data-cond='${d.condition}']`)
        .attr("stroke-opacity", 0.6);

      tooltip
        .style("opacity", 1)
        .html(
          `<b>$${d.price}</b><br>
           Type: ${d.listing_type}<br>
           Condition: ${d.condition}<br>
           Date: ${d.date}<br>
           Platform: ${d.platform}<br>
           ${d.description}`
        );
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY + 10 + "px");
    })
    .on("mouseout", () => {
      d3.selectAll(".chart-range-rect")
        .transition()
        .duration(150)
        .attr("fill-opacity", 0.05);

      d3.selectAll(".chart-range-line").attr("stroke-opacity", 0.3);

      tooltip.style("opacity", 0);
    });

  // ---------------- UNSOLD MARK ----------------
  svg.selectAll("path.unsold-x")
    .data(data.filter(d => d.listing_type === "unsold"))
    .enter()
    .append("path")
    .attr("class", "unsold-x")
    .attr(
      "transform",
      (d) => `translate(${x(new Date(d.date))},${y(d.price)})`
    )
    .attr("d", d3.symbol().type(d3.symbolPlus).size(75))
    .attr("stroke", (d) => platformColors[d.platform])
    .attr("stroke-width", 1.5)
    .attr("pointer-events", "none");

  // ---------------- LAYER FIX ----------------
  svg.selectAll(".chart-uncertainty-label-bg").raise();
  svg.selectAll(".chart-uncertainty-label").raise();
}

function drawUncertainty(svg, data, y, width, height) {
  const prices = data.map((d) => d.price);
  const min = d3.min(prices);
  const max = d3.max(prices);

  // svg
  //   .append("rect")
  //   .attr("x", 70)
  //   .attr("width", width - 110)
  //   .attr("y", y(max))
  //   .attr("height", y(min) - y(max))
  //   .attr("fill", "gray")
  //   .attr("opacity", 0.1);

  // svg
  //   .append("text")
  //   .attr("x", 75)
  //   .attr("y", y(max) - 5)
  //   .attr("class", "chart-uncertainty-label")
  //   .text("Possible market range");
}


function drawLatestDate(svg, data, x, y, width, height, latestDate) {
  const xPos = x(new Date(latestDate));


  svg
  .append("rect")
  .attr("x", xPos)                       
  .attr("y", 40)                      
  .attr("width", width - xPos - 40)           
  .attr("height", height - 100)         
  .attr("fill", "#ffffffc6"); 

  svg
    .append("line")
    .attr("class", "median-line")
    .attr("x1", xPos)
    .attr("x2", xPos)
    .attr("y1", 40)
    .attr("y2", height - 60)
    .attr("stroke", "#ff5f5f55")
    .attr("stroke-width", 1.5);
}

function drawCursorLine(svg, data, x, y, width, height) {
      // vert cursor line
    svg
    .append("line")
    .attr("class", "cursor-lineX")
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", 40)
    .attr("y2", height - 60)
    .attr("stroke", "#d2d2d2")
    .attr("stroke-width", 1.5)
    .style("opacity", 0);
    
    svg
    .append("text")
    .attr("x", 0)
    .attr("y", 0)
    .attr("class", "cursor-line-labelX")
    .attr("text-anchor", "start")
    .text(`None`)
    .style("opacity", 0);

  // horizontal cursor line
    svg
    .append("line")
    .attr("class", "cursor-line")
    .attr("x1", 70)
    .attr("x2", width - 40)
    .attr("y1", 0)
    .attr("y2", 0)
    .attr("stroke", "#d2d2d2")
    .attr("stroke-width", 1.5)
    .style("opacity", 0);

    svg
    .append("text")
    .attr("x", 0)
    .attr("y", 0)
    .attr("class", "cursor-line-label")
    .attr("text-anchor", "start")
    .text(`None`)
    .style("opacity", 0);
}






function drawMedianLine(svg, data, x, y, width) {
  const prices = data.map((d) => d.price).sort((a, b) => a - b);
  const median =
    prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)];

  const medianY = y(median);

  svg
    .append("line")
    .attr("class", "chart-median-line")
    .attr("x1", 70)
    .attr("x2", width - 40)
    .attr("y1", medianY)
    .attr("y2", medianY)
    .attr("stroke", "#333")
    .attr("stroke-width", 1.5);

  const label = svg
    .append("text")
    .attr("x", width - 38)
    .attr("y", medianY - 4)
    .attr("class", "chart-uncertainty-label")
    .attr("text-anchor", "start")
    .text(`Median $${Math.round(median)}`);

  const bbox = label.node().getBBox();

  svg
    .insert("rect", () => label.node()) 
    .attr("class", "chart-uncertainty-label-bg")
    .attr("x", bbox.x - 4)
    .attr("y", bbox.y - 2)
    .attr("width", bbox.width + 8)
    .attr("height", bbox.height + 4)
    .attr("fill", "white")
    .attr("opacity", 0.6);
}

function drawAIBounds(svg, x, y, width, cond, range, earlyDate, laterDate) {
  const xStart = x(earlyDate);  // 👈 LEFT side (1 month before)
  const xEnd = x(laterDate);      // 👈 RIGHT side (latest point)

  console.log("range" + range)
  console.log("cond" + cond)

  const unconverted_high_range = range[1]
  const unconverted_low_range = range[0]
  // const unconverted_estimate = (unconverted_high_range - unconverted_low_range)/2

  const high_range = y(unconverted_high_range)
  const low_range = y(unconverted_low_range)
  // const estimate = y((unconverted_estimate - unconverted_low_range)/2)
  const estimate = undefined

  const cond_color = CONDITION_COLORS[cond] || "gray"
  const bound_opacity = .3
  // const fill_opacity = .05

  // const high_range ="current_high_range" in range ? y(range.current_high_range) : undefined;
  // const low_range ="current_low_range" in range ? y(range.current_low_range) : undefined;
  // const estimate ="current_estimate" in range ? y(range.current_estimate) : undefined;
  // const trend ="current_trend" in range ? y(range.current_trend) : undefined;

  if (estimate !== undefined) {
    // svg
    //   .append("line")
    //   .attr("class", "chart-estimate-line")
    //   .attr("x1", 70)
    //   .attr("x2", width - 40)
    //   .attr("y1", estimate)
    //   .attr("y2", estimate)
    //   .attr("stroke", cond_color)
    //   .attr("stroke-opacity", bound_opacity)
    //   .attr("stroke-width", 1.5);

    // const e_label = svg
    //   .append("text")
    //   .attr("x", width - 38)
    //   .attr("y", estimate - 4)
    //   .attr("class", "chart-uncertainty-label")
    //   .attr("text-anchor", "start")
    //   .style("fill", cond_color)
    //   .text(`${Math.round(unconverted_estimate)}`);

    // let e_bbox = e_label.node().getBBox();

    // svg
    // .insert("rect", () => e_label.node()) 
    //   .attr("x", e_bbox.x - 4)
    //   .attr("y", e_bbox.y - 2)
    //   .attr("width", e_bbox.width + 8)
    //   .attr("class", "chart-uncertainty-label-bg")
    //   .attr("height", e_bbox.height + 4)
    //   .attr("fill", "white")
    //   .attr("opacity", 0.6);
  }

  if (high_range !== undefined) {
    svg
      .append("line")
      .attr("class", "chart-range-line")
      .attr("x1", xStart)
      .attr("x2", xEnd)
      .attr("y1", high_range)
      .attr("y2", high_range)
      .attr("stroke", cond_color)
      .attr("stroke-opacity", bound_opacity)
      .attr("stroke-width", 1.5);
      
    let h_label = svg
      .append("text")
      .attr("x", width - 38)
      .attr("y", high_range)
      .attr("class", "chart-uncertainty-label")
      .attr("text-anchor", "start")
      .style("fill", cond_color)
      .text(`$${Math.round(unconverted_high_range)}`);

    let h_bbox = h_label.node().getBBox();

    svg
      .insert("rect", () => h_label.node()) 
      .attr("class", "chart-uncertainty-label-bg")
      .attr("x", h_bbox.x - 4)
      .attr("y", h_bbox.y - 2)
      .attr("width", h_bbox.width + 8)
      .attr("height", h_bbox.height + 4)
      .attr("fill", "white")
      .attr("opacity", 0.6);
  }

  if (low_range !== undefined) {
   svg
    .append("line")
    .attr("class", "chart-range-line")
    .attr("x1", xStart)
    .attr("x2", xEnd)
    .attr("y1", low_range)
    .attr("y2", low_range)
    .attr("stroke", cond_color)
    .attr("stroke-opacity", bound_opacity)
    .attr("stroke-width", 1.5);

    const l_label = svg
      .append("text")
      .attr("x", width - 38)
      .attr("y", low_range)
      .attr("class", "chart-uncertainty-label")
      .attr("text-anchor", "start")
      .style("fill", cond_color)
      .text(`$${Math.round(unconverted_low_range)}`);

    const l_bbox = l_label.node().getBBox();

    svg
      .insert("rect", () => l_label.node()) 
      .attr("class", "chart-uncertainty-label-bg")
      .attr("x", l_bbox.x - 4)
      .attr("y", l_bbox.y - 2)
      .attr("width", l_bbox.width + 8)
      .attr("height", l_bbox.height + 4)
      .attr("fill", "white")
      .attr("opacity", 0.6);
  }

  if (low_range !== undefined && high_range !== undefined) {
  svg
  .append("rect")
  .attr("class", "chart-range-rect")
  .attr("data-cond", cond)   // 👈 IMPORTANT
  .attr("x", xStart)
  .attr("y", high_range)
  .attr("width", xEnd-xStart)
  .attr("height", low_range - high_range)
  .style("fill", cond_color)
  .attr("fill-opacity", 0.05); 

  // svg
  //   .append("text")
  //   .attr("x", width - 70)
  //   .attr("y", (low_range + high_range)/2)
  //   .attr("class", "chart-uncertainty-label")
  //   .attr("text-anchor", "end")
  //   .style("fill", cond_color)
  //   .text(`Ai Predicted Price Range`);

  }
}
