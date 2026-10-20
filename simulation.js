/**
 * LEMC ROUTER - Interactive Network Simulation & Canvas Engine
 * Handles high-performance 60fps packet animations, topology rendering,
 * queue modeling, congestion backpressure, and side-by-side comparison.
 */

class NetworkSimulation {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.packets = [];
    this.droppedPackets = [];
    this.isRunning = true;
    this.mode = "lemc"; // 'lemc', 'traditional', 'split'
    this.packetRate = 3; // packets per second
    this.lastPacketTime = 0;
    this.totalSent = 0;
    this.totalDelivered = 0;
    this.totalDropped = 0;
    this.audioEnabled = false;

    // Simulation state data
    this.evaluation = null;
    this.activeOptimalPathId = "path-3";
    this.activeTraditionalPathId = "path-1";

    // 1. Initialize nodes first so updateNodePositions has valid targets
    this.initNodes();
    // 2. Initialize audio subsystem
    this.initAudio();
    // 3. Initialize responsive canvas sizing and calculate coordinates
    this.initResize();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initAudio() {
    this.audioCtx = null;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn("AudioContext not supported", e);
    }
  }

  playTone(freq = 440, type = "sine", duration = 0.08, volume = 0.04) {
    if (!this.audioEnabled || !this.audioCtx) return;
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  initResize() {
    const resize = () => {
      const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : null;
      const dpr = window.devicePixelRatio || 1;
      this.width = (rect && rect.width > 50) ? rect.width : (this.canvas.clientWidth || 800);
      this.height = 420;
      this.canvas.width = this.width * dpr;
      this.canvas.height = this.height * dpr;
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.updateNodePositions();
    };
    window.addEventListener("resize", resize);
    resize();
  }

  initNodes() {
    this.nodes = {
      ingress: { id: "R_in", label: "Ingress Router (R0)", sublabel: "LEMC AI Decision Engine", x: 90, y: 210, type: "ingress" },
      egress: { id: "R_out", label: "Egress Gateway (R_dest)", sublabel: "Core Network Sink", x: 710, y: 210, type: "egress" },
      paths: [
        { id: "path-1", name: "Path 1", label: "Route 1: Primary Trunk (Default)", nodes: [] },
        { id: "path-2", name: "Path 2", label: "Route 2: Metro Secondary", nodes: [] },
        { id: "path-3", name: "Path 3", label: "Route 3: Eco Edge Backbone", nodes: [] },
        { id: "path-4", name: "Path 4", label: "Route 4: Campus Bypass", nodes: [] }
      ]
    };
  }

  updateNodePositions() {
    if (!this.width || !this.height || !this.nodes || !this.nodes.ingress) return;
    const paddingX = Math.max(90, this.width * 0.12);
    const startX = paddingX;
    const endX = this.width - paddingX;
    const midY = this.height / 2;

    this.nodes.ingress.x = startX;
    this.nodes.ingress.y = midY;

    this.nodes.egress.x = endX;
    this.nodes.egress.y = midY;

    const pathCount = this.nodes.paths.length;
    const topMargin = 60;
    const bottomMargin = 60;
    const availableHeight = this.height - topMargin - bottomMargin;
    const stepY = availableHeight / (pathCount - 1);

    this.nodes.paths.forEach((p, idx) => {
      const y = topMargin + idx * stepY;
      const hopCount = idx === 0 ? 1 : (idx === 3 ? 3 : 2); // Intermediate nodes
      p.nodes = [];
      const segmentWidth = (endX - startX) / (hopCount + 1);

      for (let h = 1; h <= hopCount; h++) {
        p.nodes.push({
          id: `${p.id}_n${h}`,
          label: `Sw-${idx + 1}.${h}`,
          x: startX + segmentWidth * h,
          y: y,
          queue: 0,
          maxQueue: 20
        });
      }
      p.y = y;
    });
  }

  updateEvaluation(evaluation) {
    this.evaluation = evaluation;
    this.activeOptimalPathId = evaluation.optimalPath.id;
    this.activeTraditionalPathId = evaluation.traditionalPath.id;

    // Update queue backpressure simulation based on congestion
    if (this.nodes && this.nodes.paths) {
      this.nodes.paths.forEach(p => {
        const pathData = evaluation.paths.find(ep => ep.id === p.id);
        if (pathData) {
          const cong = pathData.predictions.future_congestion_index;
          p.nodes.forEach(n => {
            n.queue = Math.min(20, Math.round((cong / 100) * 18));
            n.congestion = cong;
            n.energyKwh = pathData.predictions.predicted_energy;
          });
        }
      });
    }
  }

  setMode(mode) {
    this.mode = mode; // 'lemc', 'traditional', 'split'
  }

  setPacketRate(rate) {
    this.packetRate = Math.max(0.5, Math.min(20, rate));
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    if (this.audioEnabled && this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return this.audioEnabled;
  }

  spawnPacket(forcePathId = null, isTraditional = false) {
    let targetPathId = forcePathId;
    if (!targetPathId) {
      if (this.mode === "lemc") {
        targetPathId = this.activeOptimalPathId;
      } else if (this.mode === "traditional") {
        targetPathId = this.activeTraditionalPathId;
      } else if (this.mode === "split") {
        targetPathId = isTraditional ? this.activeTraditionalPathId : this.activeOptimalPathId;
      }
    }

    const pathObj = this.nodes.paths.find(p => p.id === targetPathId);
    if (!pathObj) return;

    const pathData = this.evaluation 
      ? this.evaluation.paths.find(p => p.id === targetPathId)
      : null;

    const congestion = pathData ? pathData.predictions.future_congestion_index : 20;
    const energy = pathData ? pathData.predictions.predicted_energy : 0.12;

    // Build waypoints: Ingress -> intermediate nodes -> Egress
    const waypoints = [
      { x: this.nodes.ingress.x, y: this.nodes.ingress.y },
      ...pathObj.nodes.map(n => ({ x: n.x, y: n.y, nodeRef: n })),
      { x: this.nodes.egress.x, y: this.nodes.egress.y }
    ];

    // Speed influenced by congestion (queue delay)
    // Low congestion = fast (1.0), high congestion = sluggish (0.35)
    const baseSpeed = 0.009;
    const speed = Math.max(0.003, baseSpeed * (1.0 - (congestion / 100) * 0.65));

    const packet = {
      id: Math.random().toString(36).substr(2, 9),
      pathId: targetPathId,
      pathName: pathObj.name,
      isTraditional: isTraditional || (this.mode === "traditional"),
      waypoints,
      currentSegment: 0,
      segmentProgress: 0,
      speed,
      x: waypoints[0].x,
      y: waypoints[0].y,
      size: 5.5,
      congestion,
      energy,
      color: (isTraditional || this.mode === "traditional") ? "#ef4444" : "#10b981",
      dropped: false
    };

    // Calculate drop chance for traditional path under heavy congestion
    const dropProbability = packet.isTraditional ? Math.min(0.35, Math.pow(congestion / 65, 3) * 0.35) : 0.005;
    if (Math.random() < dropProbability) {
      packet.willDropAtSegment = Math.max(1, Math.floor(waypoints.length / 2));
    }

    this.packets.push(packet);
    this.totalSent++;

    if (!packet.isTraditional) {
      this.playTone(520, "sine", 0.04, 0.03);
    } else {
      this.playTone(320, "triangle", 0.05, 0.035);
    }
  }

  triggerSinglePacket() {
    if (this.mode === "split") {
      this.spawnPacket(this.activeOptimalPathId, false);
      setTimeout(() => this.spawnPacket(this.activeTraditionalPathId, true), 80);
    } else {
      this.spawnPacket();
    }
  }

  animate(timestamp) {
    if (!this.lastPacketTime) this.lastPacketTime = timestamp;

    if (this.isRunning) {
      const interval = 1000 / this.packetRate;
      if (timestamp - this.lastPacketTime > interval) {
        if (this.mode === "split") {
          this.spawnPacket(this.activeOptimalPathId, false);
          this.spawnPacket(this.activeTraditionalPathId, true);
        } else {
          this.spawnPacket();
        }
        this.lastPacketTime = timestamp;
      }
    }

    this.update();
    this.render();

    requestAnimationFrame(this.animate);
  }

  update() {
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i];
      p.segmentProgress += p.speed;

      const p0 = p.waypoints[p.currentSegment];
      const p1 = p.waypoints[p.currentSegment + 1];

      if (!p0 || !p1) {
        this.packets.splice(i, 1);
        continue;
      }

      // Linear interpolation between waypoints with smooth ease
      p.x = p0.x + (p1.x - p0.x) * p.segmentProgress;
      p.y = p0.y + (p1.y - p0.y) * p.segmentProgress;

      // Check for packet drop event
      if (p.willDropAtSegment === p.currentSegment && p.segmentProgress > 0.55 && !p.dropped) {
        p.dropped = true;
        this.totalDropped++;
        this.playTone(180, "sawtooth", 0.12, 0.05);

        // Particle explosion for drop
        for (let k = 0; k < 6; k++) {
          this.droppedPackets.push({
            x: p.x,
            y: p.y,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            alpha: 1.0,
            size: 3.5
          });
        }
        this.packets.splice(i, 1);
        continue;
      }

      if (p.segmentProgress >= 1.0) {
        p.currentSegment++;
        p.segmentProgress = 0;

        if (p.currentSegment >= p.waypoints.length - 1) {
          // Packet arrived safely at Egress
          this.packets.splice(i, 1);
          this.totalDelivered++;
          this.playTone(880, "sine", 0.04, 0.02);
        }
      }
    }

    // Update dropped packet particles
    for (let j = this.droppedPackets.length - 1; j >= 0; j--) {
      const dp = this.droppedPackets[j];
      dp.x += dp.vx;
      dp.y += dp.vy;
      dp.alpha -= 0.035;
      if (dp.alpha <= 0) {
        this.droppedPackets.splice(j, 1);
      }
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear background (light grey-white theme canvas)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    // Subtle grid pattern for tech aesthetic
    this.renderBackgroundGrid(ctx, w, h);

    // Render physical links
    this.renderLinks(ctx);

    // Render intermediate path nodes
    this.renderIntermediateNodes(ctx);

    // Render Ingress and Egress routers
    this.renderGateways(ctx);

    // Render in-flight packets
    this.renderPackets(ctx);

    // Render dropped packet burst particles
    this.renderDroppedParticles(ctx);

    // Render HUD status overlay
    this.renderHUD(ctx);
  }

  renderBackgroundGrid(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 1;
    const gridSize = 24;

    ctx.beginPath();
    for (let x = 0; x < w; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  renderLinks(ctx) {
    ctx.save();

    this.nodes.paths.forEach(p => {
      const isOptimal = p.id === this.activeOptimalPathId;
      const isTraditional = p.id === this.activeTraditionalPathId;

      const pathData = this.evaluation 
        ? this.evaluation.paths.find(ep => ep.id === p.id)
        : null;

      const congestion = pathData ? pathData.predictions.future_congestion_index : 20;

      // Link waypoints
      const pts = [
        { x: this.nodes.ingress.x, y: this.nodes.ingress.y },
        ...p.nodes.map(n => ({ x: n.x, y: n.y })),
        { x: this.nodes.egress.x, y: this.nodes.egress.y }
      ];

      // Determine styling based on active mode
      let strokeColor = "#e2e8f0";
      let lineWidth = 2.5;
      let lineDash = [];

      if (this.mode === "lemc" && isOptimal) {
        strokeColor = "#10b981"; // Emerald green highlight
        lineWidth = 4.5;
      } else if (this.mode === "traditional" && isTraditional) {
        strokeColor = congestion > 40 ? "#ef4444" : "#f59e0b"; // Warning red / amber
        lineWidth = 4.5;
      } else if (this.mode === "split") {
        if (isOptimal) {
          strokeColor = "#10b981";
          lineWidth = 4.0;
        } else if (isTraditional) {
          strokeColor = "#ef4444";
          lineWidth = 4.0;
        }
      }

      // Draw outer soft glow for selected paths
      if ((this.mode === "lemc" && isOptimal) || (this.mode === "traditional" && isTraditional) || (this.mode === "split" && (isOptimal || isTraditional))) {
        ctx.save();
        ctx.strokeStyle = (isOptimal && (this.mode === "lemc" || this.mode === "split")) 
          ? "rgba(16, 185, 129, 0.22)" 
          : "rgba(239, 68, 68, 0.22)";
        ctx.lineWidth = lineWidth + 7;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
          else ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Draw main line
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();

      // Draw path label in middle
      const midNode = p.nodes[Math.floor(p.nodes.length / 2)] || pts[1];
      ctx.fillStyle = "#64748b";
      ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      
      let badgeText = p.name;
      if (isOptimal) badgeText += " ★ LEMC Optimal";
      if (isTraditional) badgeText += " (Traditional)";
      ctx.fillText(badgeText, midNode.x, p.y - 18);
    });

    ctx.restore();
  }

  renderIntermediateNodes(ctx) {
    this.nodes.paths.forEach(p => {
      const isOptimal = p.id === this.activeOptimalPathId;
      const isTraditional = p.id === this.activeTraditionalPathId;

      p.nodes.forEach(n => {
        ctx.save();

        // Node circle background
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(n.x, n.y, 14, 0, Math.PI * 2);
        ctx.fill();

        // Node border
        let borderColor = "#cbd5e1";
        let glowColor = "transparent";
        if (isOptimal && (this.mode === "lemc" || this.mode === "split")) {
          borderColor = "#10b981";
          glowColor = "rgba(16, 185, 129, 0.25)";
        } else if (isTraditional && (this.mode === "traditional" || this.mode === "split")) {
          borderColor = n.congestion > 40 ? "#ef4444" : "#f59e0b";
          glowColor = n.congestion > 40 ? "rgba(239, 68, 68, 0.25)" : "rgba(245, 158, 11, 0.25)";
        }

        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2.8;
        ctx.stroke();
        ctx.shadowColor = "transparent";

        // Inner switch icon (crossed arrows or dual core dots)
        ctx.fillStyle = borderColor;
        ctx.beginPath();
        ctx.arc(n.x - 4, n.y, 2.5, 0, Math.PI * 2);
        ctx.arc(n.x + 4, n.y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Render queue stack badge if congested
        if (n.queue > 4) {
          ctx.fillStyle = n.queue > 12 ? "#ef4444" : "#f59e0b";
          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.fillText(`Q:${n.queue}`, n.x, n.y + 24);
        }

        ctx.restore();
      });
    });
  }

  renderGateways(ctx) {
    ctx.save();

    // Helper for large, professional router chassis
    const drawGateway = (node, isIngress = true) => {
      const w = 72;
      const h = 44;
      const rx = node.x - w / 2;
      const ry = node.y - h / 2;
      const r = 8;

      ctx.save();

      // Outer drop shadow
      ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;

      // Router chassis body
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = isIngress ? "#0ea5e9" : "#6366f1";
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + w - r, ry);
      ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
      ctx.lineTo(rx + w, ry + h - r);
      ctx.quadraticCurveTo(rx + w, ry + h, rx + w - r, ry + h);
      ctx.lineTo(rx + r, ry + h);
      ctx.quadraticCurveTo(rx, ry + h, rx, ry + h - r);
      ctx.lineTo(rx, ry + r);
      ctx.quadraticCurveTo(rx, ry, rx + r, ry);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowColor = "transparent";

      // Dual Antennas sticking out on top
      ctx.strokeStyle = isIngress ? "#0ea5e9" : "#6366f1";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";

      // Left Antenna
      ctx.beginPath();
      ctx.moveTo(rx + 16, ry);
      ctx.lineTo(rx + 12, ry - 14);
      ctx.stroke();
      ctx.fillStyle = isIngress ? "#0ea5e9" : "#6366f1";
      ctx.beginPath();
      ctx.arc(rx + 12, ry - 14, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Right Antenna
      ctx.beginPath();
      ctx.moveTo(rx + w - 16, ry);
      ctx.lineTo(rx + w - 12, ry - 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx + w - 12, ry - 14, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Front Face Bezel (inset dark grey faceplate)
      ctx.fillStyle = "#f8fafc";
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.fillRect(rx + 6, ry + 8, w - 12, h - 16);
      ctx.strokeRect(rx + 6, ry + 8, w - 12, h - 16);

      // Router Status LEDs on front faceplate
      // Power LED (Green)
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(rx + 14, ry + 16, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Link / AI Status LED
      ctx.fillStyle = isIngress ? "#0ea5e9" : "#6366f1";
      ctx.beginPath();
      ctx.arc(rx + 22, ry + 16, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // 3 Gigabit Ethernet Ports
      for (let p = 0; p < 3; p++) {
        const px = rx + 33 + (p * 10);
        const py = ry + 13;
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(px, py, 7, 7);
        // tiny port clip
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(px + 1.5, py + 4, 4, 3);
      }

      // Router Ventilation Grille slots on bottom
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1.2;
      for (let g = 0; g < 4; g++) {
        ctx.beginPath();
        ctx.moveTo(rx + 14 + (g * 12), ry + 32);
        ctx.lineTo(rx + 22 + (g * 12), ry + 32);
        ctx.stroke();
      }

      // Router Primary Label
      ctx.textAlign = "center";
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(node.label, node.x, ry + h + 18);

      // Router Sublabel
      ctx.fillStyle = "#64748b";
      ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText(node.sublabel, node.x, ry + h + 32);

      ctx.restore();
    };

    drawGateway(this.nodes.ingress, true);
    drawGateway(this.nodes.egress, false);
    ctx.restore();
  }

  renderPackets(ctx) {
    ctx.save();

    this.packets.forEach(p => {
      // Packet glow
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright white center
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    ctx.restore();
  }

  renderDroppedParticles(ctx) {
    ctx.save();
    this.droppedPackets.forEach(dp => {
      ctx.fillStyle = `rgba(239, 68, 68, ${dp.alpha})`;
      ctx.beginPath();
      ctx.arc(dp.x, dp.y, dp.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  renderHUD(ctx) {
    ctx.save();
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";

    // Mode Tag
    const modeBadge = this.mode === "lemc" 
      ? "ACTIVE MODE: LEMC AI STEERING (OPTIMAL)"
      : (this.mode === "traditional" 
          ? "ACTIVE MODE: TRADITIONAL ROUTING (STATIC SHORTEST)" 
          : "ACTIVE MODE: SPLIT DUAL COMPARISON");

    const badgeColor = this.mode === "lemc" 
      ? "#10b981" 
      : (this.mode === "traditional" ? "#ef4444" : "#6366f1");

    ctx.fillStyle = badgeColor;
    ctx.fillRect(16, 14, 8, 8);

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(modeBadge, 30, 22);

    // Live In-flight counters
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px monospace";
    ctx.fillText(`In-Flight: ${this.packets.length} | Delivered: ${this.totalDelivered} | Drops: ${this.totalDropped}`, this.width - 16, 22);

    ctx.restore();
  }

  resetStats() {
    this.totalSent = 0;
    this.totalDelivered = 0;
    this.totalDropped = 0;
    this.packets = [];
    this.droppedPackets = [];
  }
}

if (typeof window !== "undefined") {
  window.NetworkSimulation = NetworkSimulation;
}
if (typeof globalThis !== "undefined") {
  globalThis.NetworkSimulation = NetworkSimulation;
}
