/**
 * LEMC ROUTER - Application State & UI Controller
 * Bridges user inputs, ML prediction engine, Canvas simulation,
 * and live comparison tables.
 */

function initApp() {
  const presets = (typeof NETWORK_PRESETS !== "undefined") 
    ? NETWORK_PRESETS 
    : ((typeof window !== "undefined" && window.NETWORK_PRESETS) || (typeof globalThis !== "undefined" && globalThis.NETWORK_PRESETS) || {});

  const SimClass = (typeof NetworkSimulation !== "undefined") 
    ? NetworkSimulation 
    : ((typeof window !== "undefined" && window.NetworkSimulation) || (typeof globalThis !== "undefined" && globalThis.NetworkSimulation));

  const evalFunc = (typeof evaluateNetworkPaths !== "undefined") 
    ? evaluateNetworkPaths 
    : ((typeof window !== "undefined" && window.evaluateNetworkPaths) || (typeof globalThis !== "undefined" && globalThis.evaluateNetworkPaths));

  // Application State
  const state = {
    currentPreset: "peak_hour",
    paths: JSON.parse(JSON.stringify(presets.peak_hour ? presets.peak_hour.paths : [])),
    activePathId: "path-1",
    weightTraffic: 0.50,
    weightEnergy: 0.50,
    currentMode: "lemc",
    packetRate: 3.5,
    evaluation: null
  };

  // Initialize Canvas Simulation
  const sim = new SimClass("networkCanvas");
  sim.setMode(state.currentMode);
  sim.setPacketRate(state.packetRate);

  // DOM Elements
  const presetChips = document.querySelectorAll(".scenario-chip");
  const modeButtons = document.querySelectorAll(".mode-toggle-btn");
  const pathTabsContainer = document.getElementById("pathTabs");
  const inputsContainer = document.getElementById("inputsContainer");
  const btnFirePacket = document.getElementById("btnFirePacket");
  const btnToggleStream = document.getElementById("btnToggleStream");
  const btnToggleAudio = document.getElementById("btnToggleAudio");
  const btnResetStats = document.getElementById("btnResetStats");
  const streamRateSlider = document.getElementById("streamRateSlider");
  const streamRateVal = document.getElementById("streamRateVal");
  const weightSlider = document.getElementById("weightSlider");
  const weightTrafficLabel = document.getElementById("weightTrafficLabel");
  const weightEnergyLabel = document.getElementById("weightEnergyLabel");

  // Pred & Result Elements
  const predTrafficEl = document.getElementById("predTraffic");
  const predCongestionEl = document.getElementById("predCongestion");
  const predEnergyEl = document.getElementById("predEnergy");
  const gaugeTraffic = document.getElementById("gaugeTraffic");
  const gaugeCongestion = document.getElementById("gaugeCongestion");
  const gaugeEnergy = document.getElementById("gaugeEnergy");
  const lemcScoreEl = document.getElementById("lemcScore");
  const lemcBox = document.getElementById("lemcBox");
  const lemcWinnerBadge = document.getElementById("lemcWinnerBadge");
  const lemcFormulaBreakdown = document.getElementById("lemcFormulaBreakdown");

  // Comparison Table Elements
  const kpiEnergySaved = document.getElementById("kpiEnergySaved");
  const kpiEnergySavedSub = document.getElementById("kpiEnergySavedSub");
  const kpiCongestionRelief = document.getElementById("kpiCongestionRelief");
  const kpiCongestionReliefSub = document.getElementById("kpiCongestionReliefSub");
  const kpiLatency = document.getElementById("kpiLatency");
  const kpiLatencySub = document.getElementById("kpiLatencySub");
  const kpiPacketLoss = document.getElementById("kpiPacketLoss");
  const kpiPacketLossSub = document.getElementById("kpiPacketLossSub");

  const compBody = document.getElementById("comparisonTableBody");
  const allPathsTableBody = document.getElementById("allPathsTableBody");

  /**
   * Evaluates the network and triggers UI updates across all components
   */
  function updateNetworkState() {
    state.evaluation = evalFunc(state.paths, state.weightTraffic, state.weightEnergy);
    sim.updateEvaluation(state.evaluation);
    renderPathTabs();
    renderPredictionsForActivePath();
    renderComparisonTable();
    renderAllPathsTable();
  }

  /**
   * Render the 4 Path Selection Tabs
   */
  function renderPathTabs() {
    pathTabsContainer.innerHTML = "";
    state.paths.forEach(p => {
      const isOptimal = state.evaluation && state.evaluation.optimalPath.id === p.id;
      const isSelected = p.id === state.activePathId;

      const btn = document.createElement("button");
      btn.className = `path-tab-btn ${isSelected ? "active" : ""} ${isOptimal ? "is-optimal" : ""}`;
      
      let badge = "";
      if (isOptimal) {
        badge = `<span class="tab-badge optimal">★ LEMC WINNER</span>`;
      } else if (p.isTraditionalDefault) {
        badge = `<span class="tab-badge">TRADITIONAL</span>`;
      }

      btn.innerHTML = `<span>${p.name}</span> ${badge}`;
      btn.addEventListener("click", () => {
        state.activePathId = p.id;
        renderPathTabs();
        renderInputsForActivePath();
        renderPredictionsForActivePath();
      });

      pathTabsContainer.appendChild(btn);
    });
  }

  /**
   * Render the 7 Input Fields for the currently selected Path
   */
  function renderInputsForActivePath() {
    const currentPath = state.paths.find(p => p.id === state.activePathId);
    if (!currentPath) return;

    inputsContainer.innerHTML = "";

    const fieldDefs = [
      { key: "Traffic_Volume_Mbps", label: "Traffic Volume", unit: "Mbps", min: 200, max: 18000, step: 50 },
      { key: "Active_User_Count", label: "Active Users", unit: "Count", min: 500, max: 25000, step: 100 },
      { key: "Congestion_Index", label: "Congestion Index", unit: "Score (0-100)", min: 1, max: 99, step: 0.5 },
      { key: "Uplink_Traffic_Mbps", label: "Uplink Traffic", unit: "Mbps", min: 50, max: 6000, step: 50 },
      { key: "Downlink_Traffic_Mbps", label: "Downlink Traffic", unit: "Mbps", min: 150, max: 12000, step: 50 },
      { key: "Total_Power_Watt", label: "Total Power", unit: "Watts", min: 400, max: 3500, step: 20 },
      { key: "Energy_Consumption_kWh", label: "Energy Consumption", unit: "kWh", min: 0.02, max: 0.35, step: 0.005 }
    ];

    fieldDefs.forEach(field => {
      const val = currentPath.inputs[field.key];
      const div = document.createElement("div");
      div.className = "input-item";

      div.innerHTML = `
        <label>
          <span>${field.label}</span>
          <span class="input-unit">${field.unit}</span>
        </label>
        <div class="input-control-row">
          <input type="number" 
                 class="input-number" 
                 id="num_${field.key}" 
                 min="${field.min}" 
                 max="${field.max}" 
                 step="${field.step}" 
                 value="${val}">
          <input type="range" 
                 class="input-slider" 
                 id="rng_${field.key}" 
                 min="${field.min}" 
                 max="${field.max}" 
                 step="${field.step}" 
                 value="${val}">
        </div>
      `;

      inputsContainer.appendChild(div);

      const numInput = div.querySelector(`#num_${field.key}`);
      const rngInput = div.querySelector(`#rng_${field.key}`);

      const handleValueChange = (newVal) => {
        let parsed = parseFloat(newVal);
        if (isNaN(parsed)) parsed = field.min;
        parsed = Math.max(field.min, Math.min(field.max, parsed));

        currentPath.inputs[field.key] = parsed;
        numInput.value = parsed;
        rngInput.value = parsed;

        updateNetworkState();
      };

      numInput.addEventListener("input", (e) => handleValueChange(e.target.value));
      rngInput.addEventListener("input", (e) => handleValueChange(e.target.value));
    });
  }

  /**
   * Render the 3 Predicted Features & LEMC Index for the active Path
   */
  function renderPredictionsForActivePath() {
    if (!state.evaluation) return;
    const evaluatedPath = state.evaluation.paths.find(p => p.id === state.activePathId);
    if (!evaluatedPath) return;

    const preds = evaluatedPath.predictions;

    // 1. Future Traffic
    predTrafficEl.textContent = preds.future_traffic.toLocaleString(undefined, { maximumFractionDigits: 1 });
    const trafficPct = Math.min(100, Math.max(5, (preds.future_traffic / 12000) * 100));
    gaugeTraffic.style.width = `${trafficPct}%`;

    // 2. Future Congestion Index
    predCongestionEl.textContent = preds.future_congestion_index.toFixed(1);
    const congPct = Math.min(100, Math.max(5, preds.future_congestion_index));
    gaugeCongestion.style.width = `${congPct}%`;
    gaugeCongestion.style.background = preds.future_congestion_index > 40 ? "#ef4444" : "#f59e0b";

    // 3. Predicted Energy Requirement
    predEnergyEl.textContent = preds.predicted_energy.toFixed(4);
    const energyPct = Math.min(100, Math.max(5, (preds.predicted_energy / 0.8) * 100));
    gaugeEnergy.style.width = `${energyPct}%`;

    // LEMC Index
    lemcScoreEl.textContent = evaluatedPath.lemcIndex.toFixed(1);
    if (evaluatedPath.isOptimal) {
      lemcBox.classList.add("optimal");
      lemcScoreEl.classList.add("winner");
      lemcWinnerBadge.style.display = "inline-flex";
    } else {
      lemcBox.classList.remove("optimal");
      lemcScoreEl.classList.remove("winner");
      lemcWinnerBadge.style.display = "none";
    }

    lemcFormulaBreakdown.innerHTML = `
      LEMC = (${(state.weightTraffic * 100).toFixed(0)}% × <code>${evaluatedPath.normTraffic.toFixed(2)}</code> Traffic) + 
      (${(state.weightEnergy * 100).toFixed(0)}% × <code>${evaluatedPath.normEnergy.toFixed(2)}</code> Energy)
      — <strong>Rank #${evaluatedPath.rank}</strong> of 4
    `;
  }

  /**
   * Render the Model vs Without Model Comparison Table & KPIs
   */
  function renderComparisonTable() {
    if (!state.evaluation) return;
    const cmp = state.evaluation.comparison;
    const opt = state.evaluation.optimalPath;
    const trad = state.evaluation.traditionalPath;

    // Update Top KPIs
    kpiEnergySaved.innerHTML = `${cmp.energySavedPct > 0 ? cmp.energySavedPct : "0.0"}%`;
    kpiEnergySavedSub.textContent = cmp.energySavedPct > 0 
      ? `Saves ${cmp.energySavedKwh.toFixed(4)} kWh per run` 
      : "Traditional already on optimal path";
    kpiEnergySavedSub.className = `kpi-delta ${cmp.energySavedPct > 0 ? "positive" : "neutral"}`;

    kpiCongestionRelief.innerHTML = `${cmp.congestionReliefPct > 0 ? cmp.congestionReliefPct : "0.0"}%`;
    kpiCongestionReliefSub.textContent = `Congestion: ${opt.predictions.future_congestion_index.toFixed(1)} vs ${trad.predictions.future_congestion_index.toFixed(1)}`;
    kpiCongestionReliefSub.className = `kpi-delta ${cmp.congestionReliefPct > 0 ? "positive" : "neutral"}`;

    kpiLatency.innerHTML = `${opt.predictions.future_congestion_index < trad.predictions.future_congestion_index ? cmp.latencyReductionPct : "0.0"}%`;
    kpiLatencySub.textContent = `${cmp.lemcLatency}ms vs ${cmp.tradLatency}ms`;
    kpiLatencySub.className = `kpi-delta ${cmp.latencyReductionPct > 0 ? "positive" : "neutral"}`;

    const lossDiff = Math.max(0, cmp.tradPacketLoss - cmp.lemcPacketLoss);
    kpiPacketLoss.innerHTML = `${cmp.lemcPacketLoss.toFixed(2)}%`;
    kpiPacketLossSub.textContent = `Traditional drops ${cmp.tradPacketLoss.toFixed(2)}% (${lossDiff > 0 ? "-" + lossDiff.toFixed(2) + "% avoided" : "optimal"})`;
    kpiPacketLossSub.className = `kpi-delta ${lossDiff > 0 ? "positive" : "neutral"}`;

    // Update Comparison Table Rows
    const rows = [
      {
        feature: "Selected Route",
        lemc: `<span class="status-pill pill-lemc">★ ${opt.name}</span>`,
        trad: `<span class="status-pill pill-trad">⚓ ${trad.name}</span>`,
        diff: cmp.isSamePath ? "Identical" : "Optimized"
      },
      {
        feature: "Routing Decision Criteria",
        lemc: "<strong>LEMC Multi-Objective ML</strong> (50% Future Traffic + 50% Energy)",
        trad: "<strong>Static Shortest Path First</strong> (Hop Count / Fixed Metric)",
        diff: "Intelligent"
      },
      {
        feature: "Predicted Energy Requirement",
        lemc: `<strong>${opt.predictions.predicted_energy.toFixed(4)} kWh</strong>`,
        trad: `<strong>${trad.predictions.predicted_energy.toFixed(4)} kWh</strong>`,
        diff: cmp.energySavedPct > 0 ? `<span style="color:#10b981;">-${cmp.energySavedPct}%</span>` : "0%"
      },
      {
        feature: "Future Traffic Demand",
        lemc: `${opt.predictions.future_traffic.toLocaleString()} Mbps`,
        trad: `${trad.predictions.future_traffic.toLocaleString()} Mbps`,
        diff: opt.predictions.future_traffic <= trad.predictions.future_traffic ? "Lower Load" : "Rerouted"
      },
      {
        feature: "Future Congestion Index",
        lemc: `<strong>${opt.predictions.future_congestion_index.toFixed(1)}</strong> / 100`,
        trad: `<strong>${trad.predictions.future_congestion_index.toFixed(1)}</strong> / 100`,
        diff: cmp.congestionReliefPct > 0 ? `<span style="color:#10b981;">-${cmp.congestionReliefPct}%</span>` : "0%"
      },
      {
        feature: "Estimated Queue Latency",
        lemc: `${cmp.lemcLatency} ms`,
        trad: `${cmp.tradLatency} ms`,
        diff: cmp.latencyReductionPct > 0 ? `<span style="color:#10b981;">-${cmp.latencyReductionPct}%</span>` : "0%"
      },
      {
        feature: "Packet Loss & Drop Rate",
        lemc: `<span style="color:#10b981;">${cmp.lemcPacketLoss.toFixed(2)}%</span> (Clean Buffer)`,
        trad: cmp.tradPacketLoss > 1.0 ? `<span style="color:#ef4444;">${cmp.tradPacketLoss.toFixed(2)}% (Buffer Overflow)</span>` : `${cmp.tradPacketLoss.toFixed(2)}%`,
        diff: cmp.tradPacketLoss > cmp.lemcPacketLoss ? `<span style="color:#10b981;">Avoided</span>` : "Equal"
      },
      {
        feature: "Energy Efficiency",
        lemc: `${cmp.lemcEfficiency.toLocaleString()} Mbps/Watt`,
        trad: `${cmp.tradEfficiency.toLocaleString()} Mbps/Watt`,
        diff: cmp.lemcEfficiency >= cmp.tradEfficiency ? "+Efficiency" : "Balanced"
      },
      {
        feature: "Carbon Footprint (per 10k pkts)",
        lemc: `${cmp.lemcCarbon.toFixed(3)} kg CO₂`,
        trad: `${cmp.tradCarbon.toFixed(3)} kg CO₂`,
        diff: (cmp.tradCarbon - cmp.lemcCarbon) > 0 ? `<span style="color:#10b981;">-Eco</span>` : "Equal"
      }
    ];

    compBody.innerHTML = rows.map(r => `
      <tr>
        <td class="feature-col">${r.feature}</td>
        <td class="lemc-col">${r.lemc}</td>
        <td class="trad-col">${r.trad}</td>
        <td class="diff-col">${r.diff}</td>
      </tr>
    `).join("");
  }

  /**
   * Render All Paths Summary Table
   */
  function renderAllPathsTable() {
    if (!state.evaluation) return;
    const sorted = [...state.evaluation.paths].sort((a, b) => a.lemcIndex - b.lemcIndex);

    allPathsTableBody.innerHTML = sorted.map(p => `
      <tr class="${p.isOptimal ? "optimal-row" : ""}">
        <td><strong>#${p.rank}</strong></td>
        <td>
          <strong>${p.name}</strong> 
          ${p.isOptimal ? '<span class="status-pill pill-lemc" style="margin-left:6px;">★ Selected</span>' : ''}
          ${p.isTraditionalDefault ? '<span class="status-pill pill-trad" style="margin-left:6px;">Traditional</span>' : ''}
        </td>
        <td>${p.predictions.future_traffic.toLocaleString(undefined, {maximumFractionDigits:1})} Mbps</td>
        <td>${p.predictions.future_congestion_index.toFixed(1)}</td>
        <td>${p.predictions.predicted_energy.toFixed(4)} kWh</td>
        <td><code>${p.normTraffic.toFixed(2)}</code></td>
        <td><code>${p.normEnergy.toFixed(2)}</code></td>
        <td><strong style="font-size:0.95rem; color:${p.isOptimal ? '#10b981' : '#0f172a'};">${p.lemcIndex.toFixed(1)}</strong></td>
      </tr>
    `).join("");
  }

  // Preset Scenario Handlers
  presetChips.forEach(chip => {
    chip.addEventListener("click", () => {
      if (chip.id === "btnRandomize") return;
      presetChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const presetKey = chip.getAttribute("data-preset");
      if (presets[presetKey]) {
        state.currentPreset = presetKey;
        state.paths = JSON.parse(JSON.stringify(presets[presetKey].paths));
        state.activePathId = "path-1";
        renderInputsForActivePath();
        updateNetworkState();
      }
    });
  });

  const btnRandomize = document.getElementById("btnRandomize");
  if (btnRandomize) {
    btnRandomize.addEventListener("click", () => {
      presetChips.forEach(c => c.classList.remove("active"));
      btnRandomize.classList.add("active");
      state.paths.forEach(p => {
        const tv = Math.round(1500 + Math.random() * 8000);
        const u = Math.round(3000 + Math.random() * 16000);
        const c = Math.round((5 + Math.random() * 65) * 10) / 10;
        const up = Math.round(tv * (0.2 + Math.random() * 0.25));
        const down = tv - up;
        const pwr = Math.round(800 + Math.random() * 1800);
        const en = Math.round((0.06 + Math.random() * 0.18) * 1000) / 1000;

        p.inputs = {
          Traffic_Volume_Mbps: tv,
          Active_User_Count: u,
          Congestion_Index: c,
          Uplink_Traffic_Mbps: up,
          Downlink_Traffic_Mbps: down,
          Total_Power_Watt: pwr,
          Energy_Consumption_kWh: en
        };
      });
      renderInputsForActivePath();
      updateNetworkState();
    });
  }

  // Mode Toggle Handlers
  modeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      modeButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.getAttribute("data-mode");
      state.currentMode = mode;
      sim.setMode(mode);
    });
  });

  // Action Buttons
  btnFirePacket.addEventListener("click", () => {
    sim.triggerSinglePacket();
  });

  let isStreaming = true;
  btnToggleStream.addEventListener("click", () => {
    isStreaming = !isStreaming;
    sim.isRunning = isStreaming;
    btnToggleStream.innerHTML = isStreaming 
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause Stream`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume Stream`;
  });

  streamRateSlider.addEventListener("input", (e) => {
    const rate = parseFloat(e.target.value);
    streamRateVal.textContent = `${rate} pkt/s`;
    sim.setPacketRate(rate);
  });

  btnToggleAudio.addEventListener("click", () => {
    const isAudioOn = sim.toggleAudio();
    btnToggleAudio.textContent = isAudioOn ? "🔊 Audio: On" : "🔇 Audio: Off";
  });

  btnResetStats.addEventListener("click", () => {
    sim.resetStats();
  });

  // Dynamic Weight Slider (Defaults to 50% / 50%)
  weightSlider.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    state.weightTraffic = val / 100;
    state.weightEnergy = (100 - val) / 100;
    weightTrafficLabel.textContent = `${val}%`;
    weightEnergyLabel.textContent = `${100 - val}%`;
    updateNetworkState();
  });

  // Initial load
  renderInputsForActivePath();
  updateNetworkState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
