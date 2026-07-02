const Rd = 287;
const Cv = 718;
const Cp = Cv + Rd;
const gamma = Cp / Cv;
const kelvinOffset = 273.15;

const initial = {
  pressurePa: 100000,
  ambientPressurePa: 100000,
  tempK: 288.15,
  ambientTempK: 288.15,
  volume: 0.5
};

const config = {
  minAmbientPa: 50000,
  maxAmbientPa: 200000,
  pressureRatePaPerS: 35000,
  minTempK: 140,
  maxTempK: 580,
  minVolume: 0,
  maxVolume: 2.0,
  heatPowerW: 70000,
  conductionTauS: 3,
  pistonMobility: 6.0e-5,
  maxVolumeRate: 0.42,
  dt: 1 / 120,
  maxPathPoints: 4200
};

const mass = initial.pressurePa * initial.volume / (Rd * initial.tempK);
const alpha0 = initial.volume / mass;

const state = {
  tempK: initial.tempK,
  volume: initial.volume,
  ambientPressurePa: initial.ambientPressurePa,
  insulated: true,
  locked: false,
  heatDirection: 0,
  pressureDirection: 0,
  paused: false,
  time: 0,
  heatJ: 0,
  workJ: 0,
  referenceTempK: initial.tempK,
  path: []
};

const els = {
  plot: document.getElementById("plotCanvas"),
  gas: document.getElementById("gasRegion"),
  shaft: document.getElementById("pistonShaft"),
  piston: document.getElementById("piston"),
  heat: document.getElementById("heatButton"),
  cool: document.getElementById("coolButton"),
  pressureUp: document.getElementById("pressureUpButton"),
  pressureDown: document.getElementById("pressureDownButton"),
  ambientPressure: document.getElementById("ambientPressureValue"),
  temp: document.getElementById("tempReadout"),
  pressure: document.getElementById("pressureReadout"),
  volume: document.getElementById("volumeReadout"),
  alpha: document.getElementById("alphaReadout"),
  heatReadout: document.getElementById("heatReadout"),
  workReadout: document.getElementById("workReadout"),
  energyReadout: document.getElementById("energyReadout"),
  massReadout: document.getElementById("massReadout"),
  reset: document.getElementById("resetButton"),
  clearPath: document.getElementById("clearPathButton"),
  pause: document.getElementById("pauseButton"),
  insulated: document.getElementById("insulatedCheckbox"),
  locked: document.getElementById("lockedCheckbox")
};

const plot = {
  alphaMin: config.minVolume / mass,
  alphaMax: config.maxVolume / mass,
  pMin: 400,
  pMax: 2200,
  margin: {
    left: 66,
    right: 24,
    top: 24,
    bottom: 58
  }
};

const pistonVisual = {
  minPercent: 4,
  maxPercent: 94
};

function pressurePa() {
  return mass * Rd * state.tempK / Math.max(state.volume, 1e-6);
}

function specificVolume() {
  return state.volume / mass;
}

function celsius(tempK) {
  return tempK - kelvinOffset;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatSignedKj(valueJ) {
  let valueKj = valueJ / 1000;
  if (Math.abs(valueKj) < 0.005) valueKj = 0;
  const sign = valueKj > 0 ? "+" : "";
  return `${sign}${valueKj.toFixed(2)} kJ`;
}

function interpolateColor(a, b, t) {
  const boundedT = clamp(t, 0, 1);
  const r = Math.round(a[0] + (b[0] - a[0]) * boundedT);
  const g = Math.round(a[1] + (b[1] - a[1]) * boundedT);
  const bl = Math.round(a[2] + (b[2] - a[2]) * boundedT);
  return `rgb(${r}, ${g}, ${bl})`;
}

function gasColor(tempK) {
  const deepCold = [14, 57, 122];
  const cold = [71, 151, 205];
  const neutral = [246, 250, 252];
  const hot = [206, 73, 47];
  const deepHot = [124, 16, 14];
  const pivot = initial.tempK;

  if (tempK < config.minTempK) {
    return interpolateColor(cold, deepCold, (config.minTempK - tempK) / 90);
  }

  if (tempK <= pivot) {
    return interpolateColor(cold, neutral, (tempK - config.minTempK) / (pivot - config.minTempK));
  }

  if (tempK <= config.maxTempK) {
    return interpolateColor(neutral, hot, (tempK - pivot) / (config.maxTempK - pivot));
  }

  return interpolateColor(hot, deepHot, (tempK - config.maxTempK) / 180);
}

function resetPath() {
  state.path = [{
    alpha: specificVolume(),
    pressureHpa: pressurePa() / 100
  }];
}

function resetAccountingReference() {
  state.heatJ = 0;
  state.workJ = 0;
  state.referenceTempK = state.tempK;
}

function clearPathAndAccounting() {
  resetPath();
  resetAccountingReference();
  updateUI();
}

function resetSimulation() {
  state.tempK = initial.tempK;
  state.volume = initial.volume;
  state.ambientPressurePa = initial.ambientPressurePa;
  state.insulated = true;
  state.locked = false;
  state.heatDirection = 0;
  state.pressureDirection = 0;
  state.paused = false;
  state.time = 0;
  resetAccountingReference();

  els.insulated.checked = true;
  els.locked.checked = false;
  updateHeldButtonStates();
  els.pause.textContent = "Pause";
  els.pause.setAttribute("aria-pressed", "false");
  resetPath();
  updateUI();
}

function updateHeldButtonStates() {
  els.heat.classList.toggle("active", state.heatDirection > 0);
  els.cool.classList.toggle("active", state.heatDirection < 0);
  els.pressureUp.classList.toggle("active", state.pressureDirection > 0);
  els.pressureDown.classList.toggle("active", state.pressureDirection < 0);
}

function setHeatDirection(direction) {
  state.heatDirection = direction;
  updateHeldButtonStates();
}

function setPressureDirection(direction) {
  state.pressureDirection = direction;
  updateHeldButtonStates();
}

function updateAmbientPressure(dt) {
  if (state.pressureDirection === 0) return;

  const nextPressurePa = clamp(
    state.ambientPressurePa + state.pressureDirection * config.pressureRatePaPerS * dt,
    config.minAmbientPa,
    config.maxAmbientPa
  );

  state.ambientPressurePa = nextPressurePa;

  if (
    (nextPressurePa <= config.minAmbientPa && state.pressureDirection < 0) ||
    (nextPressurePa >= config.maxAmbientPa && state.pressureDirection > 0)
  ) {
    setPressureDirection(0);
  }
}

function conductiveHeatRate() {
  let qdot = 0;
  if (!state.insulated) {
    qdot += mass * Cv * (initial.ambientTempK - state.tempK) / config.conductionTauS;
  }
  return qdot;
}

function manualHeatInputJ(dt, baselineTempK) {
  const requestedHeatJ = state.heatDirection * config.heatPowerW * dt;

  if (requestedHeatJ > 0) {
    const roomToHeatJ = Math.max(0, mass * Cv * (config.maxTempK - baselineTempK));
    return Math.min(requestedHeatJ, roomToHeatJ);
  }

  if (requestedHeatJ < 0) {
    const roomToCoolJ = Math.max(0, mass * Cv * (baselineTempK - config.minTempK));
    return -Math.min(-requestedHeatJ, roomToCoolJ);
  }

  return 0;
}

function recordPathPoint(force = false) {
  const last = state.path[state.path.length - 1];
  const alpha = specificVolume();
  const pressureHpa = pressurePa() / 100;
  if (force || !last || Math.abs(alpha - last.alpha) > 0.0012 || Math.abs(pressureHpa - last.pressureHpa) > 3) {
    state.path.push({ alpha, pressureHpa });
    if (state.path.length > config.maxPathPoints) state.path.shift();
  }
}

function volumeRate(pGasPa) {
  if (state.locked) return 0;

  const pressureDifference = pGasPa - state.ambientPressurePa;
  let dVdt = config.pistonMobility * pressureDifference;
  dVdt = clamp(dVdt, -config.maxVolumeRate, config.maxVolumeRate);

  if (state.volume <= config.minVolume && dVdt < 0) return 0;
  if (state.volume >= config.maxVolume && dVdt > 0) return 0;
  return dVdt;
}

function integrate(dt) {
  const pGasPa = pressurePa();
  let dVdt = volumeRate(pGasPa);
  let nextVolume = state.volume + dVdt * dt;

  if (nextVolume < config.minVolume) {
    nextVolume = config.minVolume;
    dVdt = (nextVolume - state.volume) / dt;
  }
  if (nextVolume > config.maxVolume) {
    nextVolume = config.maxVolume;
    dVdt = (nextVolume - state.volume) / dt;
  }

  const workRate = pGasPa * dVdt;
  const conductiveHeatJ = conductiveHeatRate() * dt;
  const actualWorkJ = workRate * dt;
  const baselineTempK = state.tempK + (conductiveHeatJ - actualWorkJ) / (mass * Cv);
  const manualHeatJ = manualHeatInputJ(dt, baselineTempK);
  const actualHeatJ = conductiveHeatJ + manualHeatJ;
  const nextTempK = baselineTempK + manualHeatJ / (mass * Cv);

  state.volume = nextVolume;
  state.tempK = nextTempK;
  state.heatJ += actualHeatJ;
  state.workJ += actualWorkJ;
  state.time += dt;

  recordPathPoint();
}

function updateUI() {
  const pGasPa = pressurePa();
  const alpha = specificVolume();
  const volumeProgress = clamp((state.volume - config.minVolume) / (config.maxVolume - config.minVolume), 0, 1);
  const pistonLeftPercent = pistonVisual.minPercent + volumeProgress * (pistonVisual.maxPercent - pistonVisual.minPercent);
  const deltaU = mass * Cv * (state.tempK - state.referenceTempK);

  els.gas.style.width = `${pistonLeftPercent}%`;
  els.shaft.style.width = `calc(${pistonLeftPercent}% - 7px)`;
  els.piston.style.left = `calc(${pistonLeftPercent}% - 7px)`;
  els.gas.style.backgroundColor = gasColor(state.tempK);

  els.temp.textContent = `${celsius(state.tempK).toFixed(1)} °C`;
  els.pressure.textContent = `${(pGasPa / 100).toFixed(0)} hPa`;
  els.volume.textContent = `${state.volume.toFixed(3)} m³`;
  els.alpha.textContent = `${alpha.toFixed(3)} m³/kg`;
  els.ambientPressure.textContent = `${(state.ambientPressurePa / 100).toFixed(0)} hPa`;
  els.heatReadout.textContent = formatSignedKj(state.heatJ);
  els.workReadout.textContent = formatSignedKj(state.workJ);
  els.energyReadout.textContent = formatSignedKj(deltaU);
  els.massReadout.textContent = `${mass.toFixed(3)} kg`;

  els.pressureDown.disabled = state.ambientPressurePa <= config.minAmbientPa;
  els.pressureUp.disabled = state.ambientPressurePa >= config.maxAmbientPa;
  drawPlot();
}

function canvasSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(320, Math.round(rect.width));
  const cssHeight = Math.max(280, Math.round(rect.height));
  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  return { width: cssWidth, height: cssHeight, dpr };
}

function plotMapper(width, height) {
  const m = plot.margin;
  const plotWidth = width - m.left - m.right;
  const plotHeight = height - m.top - m.bottom;
  return {
    x(alpha) {
      return m.left + ((alpha - plot.alphaMin) / (plot.alphaMax - plot.alphaMin)) * plotWidth;
    },
    y(pressureHpa) {
      return m.top + (1 - ((pressureHpa - plot.pMin) / (plot.pMax - plot.pMin))) * plotHeight;
    },
    left: m.left,
    right: width - m.right,
    top: m.top,
    bottom: height - m.bottom,
    width: plotWidth,
    height: plotHeight
  };
}

function drawDashedCurve(ctx, map, color, dash, pressureForAlpha) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dash);
  ctx.beginPath();
  const samples = 140;
  let started = false;
  for (let i = 0; i <= samples; i += 1) {
    const alpha = plot.alphaMin + (plot.alphaMax - plot.alphaMin) * (i / samples);
    const pressureHpa = pressureForAlpha(alpha);
    const x = map.x(alpha);
    const y = map.y(pressureHpa);
    if (pressureHpa < plot.pMin || pressureHpa > plot.pMax) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawPlot() {
  const canvas = els.plot;
  const ctx = canvas.getContext("2d");
  const { width, height, dpr } = canvasSize(canvas);
  const map = plotMapper(width, height);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#fbfcfd";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#c9d4db";
  ctx.lineWidth = 1;
  ctx.strokeRect(map.left, map.top, map.width, map.height);

  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "#5f6b76";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const yTicks = [500, 750, 1000, 1250, 1500, 1750, 2000];
  yTicks.forEach((tick) => {
    const y = map.y(tick);
    ctx.strokeStyle = tick === 1000 ? "#becad2" : "#e5ebef";
    ctx.beginPath();
    ctx.moveTo(map.left, y);
    ctx.lineTo(map.right, y);
    ctx.stroke();
    ctx.fillText(String(tick), map.left - 10, y);
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xTicks = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
  xTicks.forEach((tick) => {
    if (tick < plot.alphaMin || tick > plot.alphaMax) return;
    const x = map.x(tick);
    ctx.strokeStyle = "#e5ebef";
    ctx.beginPath();
    ctx.moveTo(x, map.top);
    ctx.lineTo(x, map.bottom);
    ctx.stroke();
    ctx.fillText(tick.toFixed(2), x, map.bottom + 12);
  });

  ctx.fillStyle = "#17202a";
  ctx.font = "13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("specific volume, α (m³/kg)", map.left + map.width / 2, height - 18);

  ctx.save();
  ctx.translate(18, map.top + map.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("p (hPa)", 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(map.left, map.top, map.width, map.height);
  ctx.clip();

  drawDashedCurve(ctx, map, "#157e6b", [9, 7], (alpha) => Rd * initial.tempK / alpha / 100);
  drawDashedCurve(ctx, map, "#8c4b95", [3, 7], (alpha) => (initial.pressurePa / 100) * Math.pow(alpha0 / alpha, gamma));

  if (state.path.length > 1) {
    ctx.strokeStyle = "#15202b";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    state.path.forEach((point, index) => {
      const x = map.x(point.alpha);
      const y = map.y(point.pressureHpa);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  const currentX = map.x(specificVolume());
  const currentY = map.y(pressurePa() / 100);
  ctx.fillStyle = "#c84f25";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(currentX, currentY, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#5f6b76";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("T = 15 °C", map.x(1.34), map.y(Rd * initial.tempK / 1.34 / 100) + 8);
}

let accumulator = 0;
let lastTimestamp = performance.now();

function frame(timestamp) {
  const elapsed = Math.min(0.08, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;

  updateAmbientPressure(elapsed);

  if (!state.paused) {
    accumulator += elapsed;
    while (accumulator >= config.dt) {
      integrate(config.dt);
      accumulator -= config.dt;
    }
  }

  updateUI();
  requestAnimationFrame(frame);
}

function bindHoldButton(button, start, stop) {
  let keyboardActive = false;

  button.addEventListener("pointerdown", (event) => {
    if (button.disabled || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
    start();
  });

  const stopPointerHold = (event) => {
    event.preventDefault();
    if (button.hasPointerCapture && button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }
    stop();
  };

  button.addEventListener("pointerup", stopPointerHold);
  button.addEventListener("pointercancel", stopPointerHold);
  button.addEventListener("lostpointercapture", stop);

  button.addEventListener("keydown", (event) => {
    if (button.disabled || keyboardActive || (event.key !== " " && event.key !== "Enter")) return;
    event.preventDefault();
    keyboardActive = true;
    start();
  });

  button.addEventListener("keyup", (event) => {
    if (!keyboardActive || (event.key !== " " && event.key !== "Enter")) return;
    event.preventDefault();
    keyboardActive = false;
    stop();
  });

  button.addEventListener("blur", () => {
    keyboardActive = false;
    stop();
  });
}

bindHoldButton(els.heat, () => setHeatDirection(1), () => setHeatDirection(0));
bindHoldButton(els.cool, () => setHeatDirection(-1), () => setHeatDirection(0));
bindHoldButton(els.pressureUp, () => setPressureDirection(1), () => setPressureDirection(0));
bindHoldButton(els.pressureDown, () => setPressureDirection(-1), () => setPressureDirection(0));

els.insulated.addEventListener("change", () => {
  state.insulated = els.insulated.checked;
});

els.locked.addEventListener("change", () => {
  state.locked = els.locked.checked;
  recordPathPoint(true);
});

els.reset.addEventListener("click", resetSimulation);
els.clearPath.addEventListener("click", clearPathAndAccounting);
els.pause.addEventListener("click", () => {
  state.paused = !state.paused;
  els.pause.textContent = state.paused ? "Resume" : "Pause";
  els.pause.setAttribute("aria-pressed", String(state.paused));
});

window.addEventListener("resize", drawPlot);

resetSimulation();
requestAnimationFrame(frame);
