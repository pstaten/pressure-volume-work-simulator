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
  visualRelaxationRate: 9,
  dt: 1 / 120,
  maxPathPoints: 4200
};

const mass = initial.pressurePa * initial.volume / (Rd * initial.tempK);
const referenceCurves = [
  {
    tempC: 15,
    tempK: initial.tempK,
    labelAlpha: 1.34,
    isothermColor: "#157e6b",
    adiabatColor: "#8c4b95"
  },
  {
    tempC: 65,
    tempK: kelvinOffset + 65,
    labelAlpha: 1.15,
    isothermColor: "#0f9a7f",
    adiabatColor: "#a45daf"
  }
];

const state = {
  tempK: initial.tempK,
  volume: initial.volume,
  visualVolume: initial.volume,
  ambientPressurePa: initial.ambientPressurePa,
  insulated: true,
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
  insulated: document.getElementById("insulatedCheckbox")
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

function equilibriumVolume(tempK = state.tempK, ambientPressurePa = state.ambientPressurePa) {
  const targetVolume = mass * Rd * tempK / ambientPressurePa;
  return clamp(targetVolume, config.minVolume, config.maxVolume);
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
    pressureHpa: pathPressurePa() / 100
  }];
}

function pushPathPoint(alpha, pressureHpa) {
  const last = state.path[state.path.length - 1];
  if (!last || Math.abs(alpha - last.alpha) > 0.00001 || Math.abs(pressureHpa - last.pressureHpa) > 0.02) {
    state.path.push({ alpha, pressureHpa });
    if (state.path.length > config.maxPathPoints) state.path.shift();
  }
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

function applyInstantThermalEquilibrium() {
  const oldTempK = state.tempK;
  const oldVolume = state.volume;

  pushPathPoint(specificVolume(), pathPressurePa() / 100);

  const nextTempK = initial.ambientTempK;
  const nextVolume = equilibriumVolume(nextTempK, state.ambientPressurePa);
  const actualWorkJ = state.ambientPressurePa * (nextVolume - oldVolume);
  const deltaUJ = mass * Cv * (nextTempK - oldTempK);
  const actualHeatJ = deltaUJ + actualWorkJ;

  state.tempK = nextTempK;
  state.volume = nextVolume;
  state.heatJ += actualHeatJ;
  state.workJ += actualWorkJ;

  pushPathPoint(specificVolume(), pathPressurePa() / 100);
}

function resetSimulation() {
  state.tempK = initial.tempK;
  state.volume = initial.volume;
  state.visualVolume = initial.volume;
  state.ambientPressurePa = initial.ambientPressurePa;
  state.insulated = true;
  state.heatDirection = 0;
  state.pressureDirection = 0;
  state.paused = false;
  state.time = 0;
  resetAccountingReference();

  els.insulated.checked = true;
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

  const oldPressurePa = state.ambientPressurePa;

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

  return nextPressurePa - oldPressurePa;
}

function manualHeatInputJ(dt, baselineTempK, heatCapacity) {
  const requestedHeatJ = state.heatDirection * config.heatPowerW * dt;

  if (requestedHeatJ > 0) {
    const roomToHeatJ = Math.max(0, mass * heatCapacity * (config.maxTempK - baselineTempK));
    return Math.min(requestedHeatJ, roomToHeatJ);
  }

  if (requestedHeatJ < 0) {
    const roomToCoolJ = Math.max(0, mass * heatCapacity * (baselineTempK - config.minTempK));
    return -Math.min(-requestedHeatJ, roomToCoolJ);
  }

  return 0;
}

function recordPathPoint(force = false) {
  const last = state.path[state.path.length - 1];
  const alpha = specificVolume();
  const pressureHpa = pathPressurePa() / 100;
  if (force || !last || Math.abs(alpha - last.alpha) > 0.0012 || Math.abs(pressureHpa - last.pressureHpa) > 3) {
    pushPathPoint(alpha, pressureHpa);
  }
}

function pathPressurePa() {
  return pressurePa();
}

function integrate(dt) {
  const deltaAmbientPa = updateAmbientPressure(dt) || 0;
  const oldTempK = state.tempK;
  const oldVolume = state.volume;
  let manualHeatJ;
  let actualHeatJ;
  let actualWorkJ;
  let nextTempK;
  let nextVolume;

  if (!state.insulated) {
    nextTempK = initial.ambientTempK;
    nextVolume = equilibriumVolume(nextTempK, state.ambientPressurePa);
    actualWorkJ = mass * Rd * nextTempK * Math.log(Math.max(nextVolume, 1e-6) / Math.max(oldVolume, 1e-6));
    actualHeatJ = mass * Cv * (nextTempK - oldTempK) + actualWorkJ;
  } else {
    const oldAmbientPressurePa = Math.max(state.ambientPressurePa - deltaAmbientPa, 1e-6);
    const baselineTempK = oldTempK * Math.pow(state.ambientPressurePa / oldAmbientPressurePa, (gamma - 1) / gamma);
    manualHeatJ = manualHeatInputJ(dt, baselineTempK, Cp);
    actualHeatJ = manualHeatJ;
    const unconstrainedTempK = baselineTempK + manualHeatJ / (mass * Cp);
    const unconstrainedVolume = mass * Rd * unconstrainedTempK / state.ambientPressurePa;
    nextVolume = clamp(unconstrainedVolume, config.minVolume, config.maxVolume);
    if (Math.abs(nextVolume - unconstrainedVolume) > 1e-8) {
      actualWorkJ = state.ambientPressurePa * (nextVolume - oldVolume);
      nextTempK = oldTempK + (actualHeatJ - actualWorkJ) / (mass * Cv);
    } else {
      nextTempK = unconstrainedTempK;
      actualWorkJ = actualHeatJ - mass * Cv * (nextTempK - oldTempK);
    }
  }

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
  const volumeProgress = clamp((state.visualVolume - config.minVolume) / (config.maxVolume - config.minVolume), 0, 1);
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

  referenceCurves.forEach((curve) => {
    const alphaAt1000Hpa = Rd * curve.tempK / initial.pressurePa;
    drawDashedCurve(ctx, map, curve.isothermColor, [9, 7], (alpha) => Rd * curve.tempK / alpha / 100);
    drawDashedCurve(ctx, map, curve.adiabatColor, [3, 7], (alpha) => (initial.pressurePa / 100) * Math.pow(alphaAt1000Hpa / alpha, gamma));
  });

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

  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  referenceCurves.forEach((curve, index) => {
    const x = map.x(curve.labelAlpha);
    const y = map.y(Rd * curve.tempK / curve.labelAlpha / 100) + (index === 0 ? 8 : -18);
    ctx.fillStyle = curve.isothermColor;
    ctx.fillText(`${curve.tempC} °C`, x, y);
  });

  ctx.fillStyle = "#5f6b76";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

let accumulator = 0;
let lastTimestamp = performance.now();

function frame(timestamp) {
  const elapsed = Math.min(0.08, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;

  if (!state.paused) {
    accumulator += elapsed;
    while (accumulator >= config.dt) {
      integrate(config.dt);
      accumulator -= config.dt;
    }
  }

  const visualBlend = 1 - Math.exp(-config.visualRelaxationRate * elapsed);
  state.visualVolume += (state.volume - state.visualVolume) * visualBlend;
  if (Math.abs(state.visualVolume - state.volume) < 0.0005) state.visualVolume = state.volume;

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
  const wasInsulated = state.insulated;
  state.insulated = els.insulated.checked;
  if (wasInsulated && !state.insulated) {
    applyInstantThermalEquilibrium();
    recordPathPoint(true);
    updateUI();
  }
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
