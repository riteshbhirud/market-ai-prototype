import { CONDITION_COLORS, getPlatformColors } from "./legend.js";

function symbolType(type) {
  if (type === "sale") return d3.symbolCircle;
  if (type === "unsold") return d3.symbolCircle;
  if (type === "auction") return d3.symbolTriangle;
  if (type === "obo") return d3.symbolDiamond;
  return d3.symbolCircle;
}

export function drawChart(data, ai_metrics, options) {
  const { showAI = true } = options;
  const width = 800;
  const height = 420;

  const svg =
    d3.select("#chart")
    .html("")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3
    .scaleTime()
    .domain(d3.extent(data, (d) => new Date(d.date)))
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

  drawUncertainty(svg, data, y, width, height);

  if (showAI) {
    console.log("OBJECT " + JSON.stringify(Object.entries(ai_metrics)))
    Object.entries(ai_metrics).forEach((entry) => {
      drawAIBounds(svg, data, x, y, width, entry[1], entry[0]);
    });
  } else {
    drawMedianLine(svg, data, x, y, width);
  }

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
      // fade all regions
      d3.selectAll(".chart-range-rect")
        .transition()
        .duration(150)
        .attr("fill-opacity", 0.02);

      // highlight matching condition
      d3.selectAll(`.chart-range-rect[data-cond='${d.condition}']`)
        .transition()
        .duration(150)
        .attr("fill-opacity", 0.15);

      d3.selectAll(`.chart-range-line[data-cond='${d.condition}']`)
        .attr("stroke-opacity", 0.6);

      tooltip
        .style("opacity", 1)
        .html(
          `<b>$${d.price}</b><br>Type: ${d.listing_type}<br>Condition: ${d.condition}<br>Platform: ${d.platform}<br>${d.description}`
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
        .attr("fill-opacity", 0.05); // reset
        
  d3.selectAll(".chart-range-line")
    .attr("stroke-opacity", 0.3);

    tooltip.style("opacity", 0);
  });

  // overlay X for unsold
  svg.selectAll("path.unsold-x")
    .data(data.filter(d => d.listing_type === "unsold"))
    .enter()
    .append("path")
    .attr("class", "unsold-x")
    .attr(
      "transform",
      (d) => `translate(${x(new Date(d.date))},${y(d.price)})`
    )
    .attr("d", d3.symbol().type(d3.symbolPlus).size(80))
    .attr("stroke", (d) => platformColors[d.platform])
    .attr("stroke-width", 1.5)
    // .attr("fill", "none")
    .attr("pointer-events", "none");

  svg.selectAll(".chart-uncertainty-label-bg").raise(); // hack to raise layer of labels
  svg.selectAll(".chart-uncertainty-label").raise(); // hack to raise layer of labels

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

function drawAIBounds(svg, data, x, y, width, ai_metrics, cond) {
  const unconverted_high_range = ai_metrics[1]
  const unconverted_low_range = ai_metrics[0]
  // const unconverted_estimate = (unconverted_high_range - unconverted_low_range)/2

  const high_range = y(unconverted_high_range)
  const low_range = y(unconverted_low_range)
  // const estimate = y((unconverted_estimate - unconverted_low_range)/2)
  const estimate = undefined

  const cond_color = CONDITION_COLORS[cond] || "gray"
  const bound_opacity = .3
  // const fill_opacity = .05

  // const high_range ="current_high_range" in ai_metrics ? y(ai_metrics.current_high_range) : undefined;
  // const low_range ="current_low_range" in ai_metrics ? y(ai_metrics.current_low_range) : undefined;
  // const estimate ="current_estimate" in ai_metrics ? y(ai_metrics.current_estimate) : undefined;
  // const trend ="current_trend" in ai_metrics ? y(ai_metrics.current_trend) : undefined;

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
      .attr("x1", 70)
      .attr("x2", width - 40)
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
      .text(`${Math.round(unconverted_high_range)}`);

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
    .attr("x1", 70)
    .attr("x2", width - 40)
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
      .text(`${Math.round(unconverted_low_range)}`);

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
  .attr("x", 70)
  .attr("y", high_range)
  .attr("width", width - 110)
  .attr("height", low_range - high_range)
  .style("fill", cond_color)
  .attr("fill-opacity", 0.05); 
  }
}
