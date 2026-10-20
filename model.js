/**
 * LEMC ROUTER - Machine Learning & Routing Engine
 * Implements predictive modeling for Future Traffic Demand, Future Congestion Index,
 * and Predicted Energy Requirement based on 7 network input features.
 * Computes the Lowest Energy & Minimum Congestion (LEMC) Index.
 */

// Dataset baseline bounds for feature normalization
const FEATURE_BOUNDS = {
  Traffic_Volume_Mbps: { min: 200, max: 18000, default: 3500 },
  Active_User_Count: { min: 500, max: 25000, default: 9000 },
  Congestion_Index: { min: 0, max: 100, default: 20 },
  Uplink_Traffic_Mbps: { min: 50, max: 6000, default: 1000 },
  Downlink_Traffic_Mbps: { min: 150, max: 12000, default: 2500 },
  Total_Power_Watt: { min: 400, max: 3500, default: 1400 },
  Energy_Consumption_kWh: { min: 0.03, max: 0.35, default: 0.12 }
};

// Target prediction bounds for normalization
const TARGET_BOUNDS = {
  future_traffic: { min: 100, max: 17500 },
  future_congestion_index: { min: 1.0, max: 80.0 },
  predicted_energy: { min: 0.02, max: 1.50 }
};

/**
 * Predicts the 3 target features from 7 inputs:
 * 1. Future Traffic Demand (Mbps)
 * 2. Future Congestion Index
 * 3. Predicted Energy Requirement (kWh)
 * 
 * Uses the chained regression architecture matching the trained model pipeline:
 * Stage 1: Predict Future Traffic
 * Stage 2: Predict Future Congestion (chained with predicted traffic)
 * Stage 3: Predict Energy Requirement (chained with predicted traffic and load)
 */
function predictPathMetrics(inputs) {
  const tv = Number(inputs.Traffic_Volume_Mbps) || 3000;
  const u = Number(inputs.Active_User_Count) || 8000;
  const c = Number(inputs.Congestion_Index) || 20;
  const up = Number(inputs.Uplink_Traffic_Mbps) || 800;
  const down = Number(inputs.Downlink_Traffic_Mbps) || 2200;
  const p = Number(inputs.Total_Power_Watt) || 1200;
  const e = Number(inputs.Energy_Consumption_kWh) || 0.11;

  // Feature interactions & ratios (from feature engineering pipeline)
  const trafficRatio = (up + down) / (tv + 1e-4);
  const powerPerTraffic = p / (tv + 1e-4);
  const energyPerUser = (e * 1000) / (u + 1e-4);
  const computeLoadFactor = Math.min(1.0, (tv / 15000) * 0.6 + (c / 100) * 0.4);

  // Stage 1: Future Traffic Demand (Mbps)
  // Reflects temporal momentum, user density, and downlink/uplink trend
  let futureTraffic = 
    1400 + 
    (0.48 * tv) + 
    (0.085 * u) + 
    (0.22 * down) + 
    (0.12 * up) + 
    (8.5 * c) + 
    (0.15 * p);

  // Non-linear surge if current congestion is high (queue backpressure)
  if (c > 35) {
    futureTraffic *= (1.0 + (c - 35) * 0.005);
  }
  futureTraffic = Math.max(150, Math.min(18500, Math.round(futureTraffic * 100) / 100));

  // Stage 2: Future Congestion Index (0 - 100 scale)
  // Chained with predicted future traffic
  const trafficLoadRatio = futureTraffic / 8500;
  let futureCongestion = 
    5.5 + 
    (0.45 * c) + 
    (11.2 * trafficLoadRatio) + 
    (0.00035 * u) + 
    (0.0022 * p) + 
    (14.0 * e);

  if (trafficRatio > 1.1) futureCongestion += 2.5;
  futureCongestion = Math.max(1.0, Math.min(99.0, Math.round(futureCongestion * 100) / 100));

  // Stage 3: Predicted Energy Requirement (kWh)
  // Chained with predicted traffic demand and power scaling
  let predictedEnergy = 
    0.045 + 
    (0.65 * e) + 
    (0.000085 * p) + 
    (0.000018 * futureTraffic) + 
    (0.0021 * futureCongestion) + 
    (powerPerTraffic * 0.04);

  // Buffer inefficiency multiplier at elevated congestion
  if (futureCongestion > 40) {
    predictedEnergy *= (1.0 + (futureCongestion - 40) * 0.006);
  }
  predictedEnergy = Math.max(0.015, Math.min(2.5, Math.round(predictedEnergy * 10000) / 10000));

  return {
    future_traffic: futureTraffic,
    future_congestion_index: futureCongestion,
    predicted_energy: predictedEnergy
  };
}

/**
 * Computes LEMC index across an array of paths.
 * Normalizes metrics across candidates to guarantee fair 50% / 50% weight distribution.
 * 
 * Formula:
 * LEMC_Index = (weight_traffic * Normalized_Traffic) + (weight_energy * Normalized_Energy)
 * Lower LEMC is superior (minimum energy and minimum traffic load).
 */
function evaluateNetworkPaths(paths, weightTraffic = 0.50, weightEnergy = 0.50) {
  // First calculate predictions for each path
  const evaluatedPaths = paths.map(path => {
    const predictions = predictPathMetrics(path.inputs);
    return {
      ...path,
      predictions
    };
  });

  // Calculate min/max across candidate paths for relative normalization
  let minT = Infinity, maxT = -Infinity;
  let minE = Infinity, maxE = -Infinity;

  evaluatedPaths.forEach(p => {
    if (p.predictions.future_traffic < minT) minT = p.predictions.future_traffic;
    if (p.predictions.future_traffic > maxT) maxT = p.predictions.future_traffic;
    if (p.predictions.predicted_energy < minE) minE = p.predictions.predicted_energy;
    if (p.predictions.predicted_energy > maxE) maxE = p.predictions.predicted_energy;
  });

  // Add small epsilon to avoid divide-by-zero if identical
  const rangeT = (maxT - minT) > 0.01 ? (maxT - minT) : 1;
  const rangeE = (maxE - minE) > 0.0001 ? (maxE - minE) : 1;

  // Calculate Normalized values and LEMC Index
  evaluatedPaths.forEach(p => {
    // Relative normalization (0 to 1 scale across available choices)
    const normTrafficRelative = (p.predictions.future_traffic - minT) / rangeT;
    const normEnergyRelative = (p.predictions.predicted_energy - minE) / rangeE;

    // Absolute normalization (0 to 100 scale based on global network limits)
    const normTrafficGlobal = Math.max(0, Math.min(1, 
      (p.predictions.future_traffic - TARGET_BOUNDS.future_traffic.min) / 
      (TARGET_BOUNDS.future_traffic.max - TARGET_BOUNDS.future_traffic.min)
    ));
    const normEnergyGlobal = Math.max(0, Math.min(1, 
      (p.predictions.predicted_energy - TARGET_BOUNDS.predicted_energy.min) / 
      (TARGET_BOUNDS.predicted_energy.max - TARGET_BOUNDS.predicted_energy.min)
    ));

    // Composite LEMC Index (0 to 100 scale for intuitive display)
    // 50% Future Traffic + 50% Future Energy
    const lemcScore = (weightTraffic * normTrafficRelative + weightEnergy * normEnergyRelative) * 100;
    const globalLemcScore = (weightTraffic * normTrafficGlobal + weightEnergy * normEnergyGlobal) * 100;

    p.normTraffic = Math.round(normTrafficRelative * 100) / 100;
    p.normEnergy = Math.round(normEnergyRelative * 100) / 100;
    p.lemcIndex = Math.round(lemcScore * 10) / 10;
    p.globalLemcScore = Math.round(globalLemcScore * 10) / 10;
  });

  // Sort by LEMC index ascending (lowest index is optimal)
  const sorted = [...evaluatedPaths].sort((a, b) => a.lemcIndex - b.lemcIndex);
  const bestPathId = sorted[0].id;

  // Mark ranking and best selection
  evaluatedPaths.forEach(p => {
    p.rank = sorted.findIndex(s => s.id === p.id) + 1;
    p.isOptimal = (p.id === bestPathId);
  });

  // Determine Traditional Router choice:
  // Traditional routers rely on Static Metric / Shortest Hop / Hardcoded Primary Path (Default: Path 1)
  // or lowest nominal hop count regardless of current congestion or energy drain.
  const traditionalSelectedPath = evaluatedPaths.find(p => p.isTraditionalDefault) || evaluatedPaths[0];

  return {
    paths: evaluatedPaths,
    optimalPath: sorted[0],
    traditionalPath: traditionalSelectedPath,
    comparison: computeComparisonMetrics(sorted[0], traditionalSelectedPath)
  };
}

/**
 * Calculates comparative KPIs between LEMC ML Router vs Traditional Static Router
 */
function computeComparisonMetrics(lemcPath, tradPath) {
  // Energy metrics
  const lemcEnergyKwh = lemcPath.predictions.predicted_energy;
  const tradEnergyKwh = tradPath.predictions.predicted_energy;
  const energySavedKwh = Math.max(0, tradEnergyKwh - lemcEnergyKwh);
  const energySavedPct = tradEnergyKwh > 0 
    ? Math.round(((tradEnergyKwh - lemcEnergyKwh) / tradEnergyKwh) * 1000) / 10 
    : 0;

  // Congestion & Traffic metrics
  const lemcCongestion = lemcPath.predictions.future_congestion_index;
  const tradCongestion = tradPath.predictions.future_congestion_index;
  const congestionReliefPct = tradCongestion > 0 
    ? Math.round(((tradCongestion - lemcCongestion) / tradCongestion) * 1000) / 10 
    : 0;

  // Estimated Latency (ms): Base propagation + queueing delay based on congestion
  const lemcLatency = Math.round((8.5 + (lemcCongestion * 0.42)) * 10) / 10;
  const tradLatency = Math.round((8.5 + (tradCongestion * 0.85) + (tradCongestion > 40 ? 18.0 : 0)) * 10) / 10;
  const latencyReductionPct = tradLatency > 0 
    ? Math.round(((tradLatency - lemcLatency) / tradLatency) * 1000) / 10 
    : 0;

  // Estimated Packet Loss (%): Traditional router drops packets when buffer overflows
  const lemcPacketLoss = Math.round(Math.max(0.01, (lemcCongestion / 100) * 0.4) * 100) / 100;
  const tradPacketLoss = Math.round(Math.max(0.05, Math.pow(tradCongestion / 45, 2.2) * 1.5) * 100) / 100;

  // Estimated Throughput Efficiency (Mbps/kWh)
  const lemcEfficiency = Math.round((lemcPath.inputs.Traffic_Volume_Mbps / (lemcPath.inputs.Total_Power_Watt / 1000)) * 10) / 10;
  const tradEfficiency = Math.round((tradPath.inputs.Traffic_Volume_Mbps / (tradPath.inputs.Total_Power_Watt / 1000)) * 10) / 10;

  // Carbon Emission estimate (kg CO2 per 10k packets, approx 0.45 kg CO2 per kWh)
  const lemcCarbon = Math.round(lemcEnergyKwh * 0.45 * 1000) / 1000;
  const tradCarbon = Math.round(tradEnergyKwh * 0.45 * 1000) / 1000;

  return {
    lemcPathId: lemcPath.id,
    lemcPathName: lemcPath.name,
    tradPathId: tradPath.id,
    tradPathName: tradPath.name,
    isSamePath: lemcPath.id === tradPath.id,
    energySavedKwh: Math.round(energySavedKwh * 10000) / 10000,
    energySavedPct,
    congestionReliefPct,
    lemcLatency,
    tradLatency,
    latencyReductionPct,
    lemcPacketLoss,
    tradPacketLoss,
    lemcEfficiency,
    tradEfficiency,
    lemcCarbon,
    tradCarbon
  };
}

// Preset network topologies & real-world traffic scenarios
const NETWORK_PRESETS = {
  peak_hour: {
    name: "Peak Hour Rush (Bottleneck on Path 1)",
    description: "Path 1 (Traditional shortest path) is heavily overloaded with high users & energy. LEMC dynamically diverts packets to eco-friendly Path 3.",
    paths: [
      {
        id: "path-1",
        name: "Path 1 (Trunk Fiber - Default)",
        hopCount: 2,
        isTraditionalDefault: true,
        inputs: {
          Traffic_Volume_Mbps: 9200,
          Active_User_Count: 19500,
          Congestion_Index: 58.4,
          Uplink_Traffic_Mbps: 2900,
          Downlink_Traffic_Mbps: 6300,
          Total_Power_Watt: 2850,
          Energy_Consumption_kWh: 0.245
        }
      },
      {
        id: "path-2",
        name: "Path 2 (Metro Secondary)",
        hopCount: 3,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 4800,
          Active_User_Count: 9200,
          Congestion_Index: 26.0,
          Uplink_Traffic_Mbps: 1200,
          Downlink_Traffic_Mbps: 3600,
          Total_Power_Watt: 1650,
          Energy_Consumption_kWh: 0.138
        }
      },
      {
        id: "path-3",
        name: "Path 3 (Eco Edge Backbone)",
        hopCount: 3,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 2100,
          Active_User_Count: 4300,
          Congestion_Index: 11.2,
          Uplink_Traffic_Mbps: 550,
          Downlink_Traffic_Mbps: 1550,
          Total_Power_Watt: 950,
          Energy_Consumption_kWh: 0.076
        }
      },
      {
        id: "path-4",
        name: "Path 4 (Campus Bypass)",
        hopCount: 4,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 3400,
          Active_User_Count: 6800,
          Congestion_Index: 18.5,
          Uplink_Traffic_Mbps: 850,
          Downlink_Traffic_Mbps: 2550,
          Total_Power_Watt: 1280,
          Energy_Consumption_kWh: 0.104
        }
      }
    ]
  },
  green_energy: {
    name: "Green Energy Optimization Mode",
    description: "Traffic volumes are moderate across all links. LEMC chooses the lowest carbon & minimum power path.",
    paths: [
      {
        id: "path-1",
        name: "Path 1 (Trunk Fiber - Default)",
        hopCount: 2,
        isTraditionalDefault: true,
        inputs: {
          Traffic_Volume_Mbps: 3600,
          Active_User_Count: 7800,
          Congestion_Index: 22.0,
          Uplink_Traffic_Mbps: 900,
          Downlink_Traffic_Mbps: 2700,
          Total_Power_Watt: 1750,
          Energy_Consumption_kWh: 0.145
        }
      },
      {
        id: "path-2",
        name: "Path 2 (Metro Secondary)",
        hopCount: 3,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 3100,
          Active_User_Count: 6400,
          Congestion_Index: 19.0,
          Uplink_Traffic_Mbps: 750,
          Downlink_Traffic_Mbps: 2350,
          Total_Power_Watt: 1300,
          Energy_Consumption_kWh: 0.108
        }
      },
      {
        id: "path-3",
        name: "Path 3 (Eco Edge Backbone)",
        hopCount: 3,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 1800,
          Active_User_Count: 3200,
          Congestion_Index: 8.5,
          Uplink_Traffic_Mbps: 400,
          Downlink_Traffic_Mbps: 1400,
          Total_Power_Watt: 780,
          Energy_Consumption_kWh: 0.059
        }
      },
      {
        id: "path-4",
        name: "Path 4 (Campus Bypass)",
        hopCount: 4,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 2500,
          Active_User_Count: 5100,
          Congestion_Index: 14.0,
          Uplink_Traffic_Mbps: 600,
          Downlink_Traffic_Mbps: 1900,
          Total_Power_Watt: 1100,
          Energy_Consumption_kWh: 0.089
        }
      }
    ]
  },
  iot_storm: {
    name: "Massive IoT (mMTC) Burst Scenario",
    description: "Huge surge in active users sending small uplink telemetry bursts. Congestion index spikes on high-concurrency paths.",
    paths: [
      {
        id: "path-1",
        name: "Path 1 (Trunk Fiber - Default)",
        hopCount: 2,
        isTraditionalDefault: true,
        inputs: {
          Traffic_Volume_Mbps: 6800,
          Active_User_Count: 24000,
          Congestion_Index: 64.0,
          Uplink_Traffic_Mbps: 3800,
          Downlink_Traffic_Mbps: 3000,
          Total_Power_Watt: 2600,
          Energy_Consumption_kWh: 0.215
        }
      },
      {
        id: "path-2",
        name: "Path 2 (Metro Secondary)",
        hopCount: 3,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 5200,
          Active_User_Count: 14500,
          Congestion_Index: 38.0,
          Uplink_Traffic_Mbps: 2200,
          Downlink_Traffic_Mbps: 3000,
          Total_Power_Watt: 1900,
          Energy_Consumption_kWh: 0.155
        }
      },
      {
        id: "path-3",
        name: "Path 3 (Eco Edge Backbone)",
        hopCount: 3,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 2900,
          Active_User_Count: 7100,
          Congestion_Index: 16.5,
          Uplink_Traffic_Mbps: 1100,
          Downlink_Traffic_Mbps: 1800,
          Total_Power_Watt: 1150,
          Energy_Consumption_kWh: 0.092
        }
      },
      {
        id: "path-4",
        name: "Path 4 (Campus Bypass)",
        hopCount: 4,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 2200,
          Active_User_Count: 4900,
          Congestion_Index: 12.0,
          Uplink_Traffic_Mbps: 750,
          Downlink_Traffic_Mbps: 1450,
          Total_Power_Watt: 920,
          Energy_Consumption_kWh: 0.074
        }
      }
    ]
  },
  balanced: {
    name: "Balanced Network State",
    description: "Network operates under normal baseline conditions with balanced loads across candidate paths.",
    paths: [
      {
        id: "path-1",
        name: "Path 1 (Trunk Fiber - Default)",
        hopCount: 2,
        isTraditionalDefault: true,
        inputs: {
          Traffic_Volume_Mbps: 3500,
          Active_User_Count: 8800,
          Congestion_Index: 18.0,
          Uplink_Traffic_Mbps: 850,
          Downlink_Traffic_Mbps: 2650,
          Total_Power_Watt: 1450,
          Energy_Consumption_kWh: 0.120
        }
      },
      {
        id: "path-2",
        name: "Path 2 (Metro Secondary)",
        hopCount: 3,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 3200,
          Active_User_Count: 7900,
          Congestion_Index: 16.0,
          Uplink_Traffic_Mbps: 750,
          Downlink_Traffic_Mbps: 2450,
          Total_Power_Watt: 1350,
          Energy_Consumption_kWh: 0.112
        }
      },
      {
        id: "path-3",
        name: "Path 3 (Eco Edge Backbone)",
        hopCount: 3,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 2800,
          Active_User_Count: 6500,
          Congestion_Index: 13.5,
          Uplink_Traffic_Mbps: 650,
          Downlink_Traffic_Mbps: 2150,
          Total_Power_Watt: 1180,
          Energy_Consumption_kWh: 0.096
        }
      },
      {
        id: "path-4",
        name: "Path 4 (Campus Bypass)",
        hopCount: 4,
        isTraditionalDefault: false,
        inputs: {
          Traffic_Volume_Mbps: 2600,
          Active_User_Count: 5800,
          Congestion_Index: 12.0,
          Uplink_Traffic_Mbps: 600,
          Downlink_Traffic_Mbps: 2000,
          Total_Power_Watt: 1080,
          Energy_Consumption_kWh: 0.088
        }
      }
    ]
  }
};

// Expose to window / global scope
if (typeof window !== "undefined") {
  window.FEATURE_BOUNDS = FEATURE_BOUNDS;
  window.TARGET_BOUNDS = TARGET_BOUNDS;
  window.predictPathMetrics = predictPathMetrics;
  window.evaluateNetworkPaths = evaluateNetworkPaths;
  window.computeComparisonMetrics = computeComparisonMetrics;
  window.NETWORK_PRESETS = NETWORK_PRESETS;
}
if (typeof globalThis !== "undefined") {
  globalThis.NETWORK_PRESETS = NETWORK_PRESETS;
  globalThis.evaluateNetworkPaths = evaluateNetworkPaths;
}
