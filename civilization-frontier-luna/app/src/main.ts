/**
 * Cliente v0.01: menú → selección de spawn → partida → resumen.
 * La simulación corre localmente con el mismo núcleo determinista que
 * usaría un servidor autoritativo; el cliente solo emite comandos.
 */
import "./styles.css";
import { createMatch, defaultConfig, homeStructure, spawnIndicators, isValidSpawn } from "./sim/match";
import { applyCommand } from "./sim/commands";
import { tick } from "./sim/tick";
import { TICK_SECONDS, STRUCTURES, EDGES, RESOURCE_LABELS, VICTORY_THRESHOLD } from "./sim/constants";
import type { EdgeKind, MatchState, Structure, StructureKind } from "./sim/types";
import { Camera, TILE } from "./client/camera";
import { Renderer, createMemory, type ClientMemory } from "./client/renderer";
import { computeVisibility } from "./sim/fog";
import { xyOf, idx, neighbors4, tilesOnSegment } from "./sim/grid";
import { structureOperating } from "./sim/economy";

type Mode =
  | { kind: "inspect" }
  | { kind: "build"; structure: StructureKind }
  | { kind: "connect"; edge: EdgeKind; from: Structure | null }
  | { kind: "sabotage" }
  | { kind: "rover" };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("gameCanvas");
const ctx = canvas.getContext("2d")!;

let state: MatchState;
let renderer: Renderer;
let memory: ClientMemory;
let camera: Camera;
let mode: Mode = { kind: "inspect" };
let selectedStructure: Structure | null = null;
let hoverTile = -1;
let hoverValid = false;
let selectedSpawnTile = -1;
let paused = false;
let speed = 1;
let accumulator = 0;
let lastFrame = performance.now();
let lastEventIndex = 0;
let raf = 0;
let summaryShown = false;

// ---------------------------------------------------------------- utilidades

function timeString(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function screenTile(ev: MouseEvent): number {
  const rect = canvas.getBoundingClientRect();
  const [wx, wy] = camera.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
  const x = Math.floor(wx / TILE);
  const y = Math.floor(wy / TILE);
  if (x < 0 || y < 0 || x >= state.config.cols || y >= state.config.rows) return -1;
  return idx(x, y, state.config.cols);
}

function humanRespawnReady(): boolean {
  const p = state.players[0];
  return p.evacuated && p.respawnsLeft > 0 && state.elapsed >= p.evacUntil;
}

function setStatus(text: string): void {
  $("statusBadge").textContent = text;
}

// ------------------------------------------------------------------ pantalla

function startMatch(seed: number, botCount: number): void {
  const config = defaultConfig(seed);
  config.botCount = botCount;
  state = createMatch(config);
  memory = createMemory(state.tiles.length);
  renderer = new Renderer(state, memory);
  camera = new Camera(state.config.cols * TILE, state.config.rows * TILE);
  mode = { kind: "inspect" };
  selectedStructure = null;
  selectedSpawnTile = -1;
  paused = false;
  speed = 1;
  accumulator = 0;
  lastEventIndex = 0;
  summaryShown = false;

  $("menuScreen").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  $("summaryModal").classList.add("hidden");
  $("spawnPanel").classList.remove("hidden");
  $<HTMLButtonElement>("confirmSpawnButton").disabled = true;
  $("eventLog").innerHTML = "";
  $("pauseButton").textContent = "⏸";
  $("speedButton").textContent = "×1";
  resizeCanvas();
  camera.fit(canvas.clientWidth, canvas.clientHeight);
  setStatus("Haz clic en el mapa para elegir dónde alunizar.");
  buildToolButtons();
  cancelAnimationFrame(raf);
  lastFrame = performance.now();
  raf = requestAnimationFrame(frame);
}

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
}

// ----------------------------------------------------------------- HUD

function buildToolButtons(): void {
  const buildBox = $("buildButtons");
  buildBox.innerHTML = "";
  (Object.keys(STRUCTURES) as StructureKind[]).forEach((kind) => {
    const spec = STRUCTURES[kind];
    const btn = document.createElement("button");
    btn.className = "tool-btn";
    btn.dataset.kind = kind;
    const cost = Object.entries(spec.cost)
      .map(([r, v]) => `${v} ${RESOURCE_LABELS[r as keyof typeof RESOURCE_LABELS].toLowerCase().split("/")[0]}`)
      .join(" + ");
    btn.innerHTML = `<span>${spec.label}</span><span class="cost">${cost}</span>`;
    btn.title = buildTooltip(kind);
    btn.addEventListener("click", () => {
      mode = { kind: "build", structure: kind };
      refreshToolButtons();
      setStatus(`Coloca: ${spec.label}. Clic en un tile propio libre${spec.requiresDeposit ? " sobre el depósito adecuado" : ""}.`);
    });
    buildBox.appendChild(btn);
  });

  const modeBox = $("modeButtons");
  modeBox.innerHTML = "";
  const modes: Array<{ label: string; title: string; make: () => Mode }> = [
    { label: "Expandir / Inspeccionar", title: "Clic en terreno neutral: expandir. Clic en estructura propia: inspeccionar. Clic en tile enemigo adyacente: atacar.", make: () => ({ kind: "inspect" }) },
    { label: `⚡ ${EDGES.energy_line.label}`, title: "Conecta dos estructuras propias con una línea de energía.", make: () => ({ kind: "connect", edge: "energy_line", from: null }) },
    { label: `◍ ${EDGES.oxygen_conduit.label}`, title: "Conecta un nodo de oxígeno con hábitats.", make: () => ({ kind: "connect", edge: "oxygen_conduit", from: null }) },
    { label: `⇄ ${EDGES.trade_route.label}`, title: "Conecta un puerto lunar con otra instalación para generar ingresos.", make: () => ({ kind: "connect", edge: "trade_route", from: null }) },
    { label: "✂ Sabotear conexión", title: "Corta una conexión enemiga al alcance de tu territorio.", make: () => ({ kind: "sabotage" }) },
    { label: "🛞 Mover rover", title: "Envía tu rover explorador a revelar terreno.", make: () => ({ kind: "rover" }) },
  ];
  for (const m of modes) {
    const btn = document.createElement("button");
    btn.className = "tool-btn";
    btn.dataset.mode = m.label;
    btn.innerHTML = `<span>${m.label}</span>`;
    btn.title = m.title;
    btn.addEventListener("click", () => {
      mode = m.make();
      refreshToolButtons();
      setStatus(m.title);
    });
    modeBox.appendChild(btn);
  }
  refreshToolButtons();
}

function buildTooltip(kind: StructureKind): string {
  switch (kind) {
    case "habitat":
      return "Capital local: población, almacenamiento y sostén del territorio. Necesita energía y oxígeno.";
    case "generator":
      return "Produce energía (menos en sombra polar). Origen de las líneas de energía.";
    case "oxygen_node":
      return "Produce oxígeno (mejor con hielo) y lo distribuye por conductos.";
    case "mine":
      return "Produce minerales. Solo sobre un depósito de minerales (cuadrado ocre).";
    case "ice_extractor":
      return "Produce agua/hielo. Solo sobre un depósito de hielo (punto celeste).";
    case "control_point":
      return "Amplía visión, defiende el territorio cercano y sostiene la expansión.";
    case "lunar_port":
      return "Centro logístico: permite rutas comerciales de larga distancia.";
  }
}

function refreshToolButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("#buildButtons .tool-btn").forEach((b) => {
    b.classList.toggle("active", mode.kind === "build" && mode.structure === b.dataset.kind);
  });
  const labels: Record<string, boolean> = {};
  document.querySelectorAll<HTMLButtonElement>("#modeButtons .tool-btn").forEach((b) => {
    let active = false;
    if (mode.kind === "inspect") active = b.dataset.mode?.startsWith("Expandir") ?? false;
    else if (mode.kind === "connect") active = b.dataset.mode?.includes(EDGES[mode.edge].label) ?? false;
    else if (mode.kind === "sabotage") active = b.dataset.mode?.includes("Sabotear") ?? false;
    else if (mode.kind === "rover") active = b.dataset.mode?.includes("rover") ?? false;
    b.classList.toggle("active", active);
    if (b.dataset.mode) labels[b.dataset.mode] = active;
  });
  void labels;
}

function updateHud(): void {
  const p = state.players[0];
  const setRes = (id: string, value: number, cap: number, rate: number) => {
    const el = $(id);
    el.querySelector(".res-val")!.textContent = `${Math.floor(value)}/${cap}`;
    const rateEl = el.querySelector(".res-rate");
    if (rateEl) {
      const sign = rate >= 0.05 ? "+" : "";
      rateEl.textContent = Math.abs(rate) < 0.05 ? "" : `${sign}${rate.toFixed(1)}/s`;
      rateEl.className = `res-rate ${rate >= 0.05 ? "pos" : rate <= -0.05 ? "neg" : ""}`;
    }
  };
  setRes("resEnergy", p.stocks.energy, p.capacity.energy, p.netRates.energy);
  setRes("resOxygen", p.stocks.oxygen, p.capacity.oxygen, p.netRates.oxygen);
  setRes("resMinerals", p.stocks.minerals, p.capacity.minerals, p.netRates.minerals);
  setRes("resIce", p.stocks.water_ice, p.capacity.water_ice, p.netRates.water_ice);
  $("resPop").querySelector(".res-val")!.textContent = `${Math.floor(p.population)}`;
  $("controlFill").style.width = `${p.control}%`;
  $("controlThreshold").style.left = `${VICTORY_THRESHOLD}%`;
  $("controlValue").textContent =
    p.controlHoldSeconds > 0
      ? `${Math.round(p.control)}% · ${Math.ceil(state.config.victoryHoldSeconds - p.controlHoldSeconds)}s`
      : `${Math.round(p.control)}%`;
  $("clockValue").textContent = timeString(state.elapsed);

  updateAlerts(p.id);
  updateEventLog();
  updateSelectionPanel();
}

function updateAlerts(playerId: number): void {
  const banner = $("alertBanner");
  const p = state.players[playerId];
  if (state.phase === "running" && p.evacuated) {
    banner.classList.remove("hidden");
    banner.classList.add("info");
    banner.textContent = humanRespawnReady()
      ? "Población en órbita: haz clic en un punto neutral válido para realunizar."
      : `Evacuación en curso… realunizaje disponible en ${Math.ceil(p.evacUntil - state.elapsed)}s`;
    return;
  }
  banner.classList.remove("info");
  // Peor reserva de oxígeno/energía entre estructuras propias.
  let worstO2 = Infinity;
  let worstEnergy = Infinity;
  for (const st of state.structures) {
    if (st.owner !== playerId || st.hp <= 0) continue;
    if (st.kind === "habitat" && !st.oxygenated) worstO2 = Math.min(worstO2, st.oxygenReserve);
    if (STRUCTURES[st.kind].needsPower && !st.powered) worstEnergy = Math.min(worstEnergy, st.energyReserve);
  }
  if (worstO2 !== Infinity) {
    banner.classList.remove("hidden");
    banner.textContent =
      worstO2 > 0
        ? `⚠ Hábitat sin suministro de oxígeno — reserva: ${Math.ceil(worstO2)}s. Conecta un nodo de oxígeno.`
        : "⚠ ¡Oxígeno agotado! Tu población está muriendo.";
  } else if (worstEnergy !== Infinity) {
    banner.classList.remove("hidden");
    banner.textContent =
      worstEnergy > 0
        ? `⚠ Estructura sin energía — reserva: ${Math.ceil(worstEnergy)}s. Tiende una línea desde un generador.`
        : "⚠ Estructuras fuera de servicio por falta de energía.";
  } else {
    banner.classList.add("hidden");
  }
}

function updateEventLog(): void {
  const log = $("eventLog");
  while (lastEventIndex < state.events.length) {
    const ev = state.events[lastEventIndex++];
    if (ev.playerId >= 0 && ev.playerId !== 0 && !ev.important) continue;
    const li = document.createElement("li");
    if (ev.important) li.classList.add("important");
    li.innerHTML = `<time>${timeString(ev.at)}</time>${ev.text}`;
    log.prepend(li);
    while (log.children.length > 40) log.lastChild?.remove();
  }
}

function updateSelectionPanel(): void {
  const panel = $("selectionPanel");
  if (!selectedStructure || selectedStructure.hp <= 0) {
    panel.classList.add("hidden");
    return;
  }
  const st = selectedStructure;
  const spec = STRUCTURES[st.kind];
  const rows: string[] = [`<h4>${spec.label}</h4>`];
  rows.push(`Integridad: ${Math.ceil(st.hp)}/${st.maxHp}`);
  if (spec.needsPower) {
    rows.push(
      st.powered
        ? `<span class="good">⚡ Conectada a la red</span>`
        : st.energyReserve > 0
          ? `<span class="warn">⚡ Sin red — reserva ${Math.ceil(st.energyReserve)}s</span>`
          : `<span class="warn">⚡ Fuera de servicio</span>`,
    );
  }
  if (st.kind === "habitat") {
    rows.push(
      st.oxygenated
        ? `<span class="good">◍ Oxígeno conectado</span>`
        : st.oxygenReserve > 0
          ? `<span class="warn">◍ Sin conducto — reserva ${Math.ceil(st.oxygenReserve)}s</span>`
          : `<span class="warn">◍ Población en peligro</span>`,
    );
  }
  panel.innerHTML = rows.join("<br>");
  panel.classList.remove("hidden");
}

// ------------------------------------------------------------------- entrada

function onCanvasClick(ev: MouseEvent): void {
  const tile = screenTile(ev);
  if (tile < 0) return;

  if (state.phase === "spawn_selection") {
    if (isValidSpawn(state, tile, 0)) {
      selectedSpawnTile = tile;
      $<HTMLButtonElement>("confirmSpawnButton").disabled = false;
      const ind = spawnIndicators(state, tile);
      $("indSafety").style.width = `${ind.safety * 100}%`;
      $("indResources").style.width = `${ind.resources * 100}%`;
      $("indRivals").style.width = `${ind.rivals * 100}%`;
      setStatus("Punto válido seleccionado. Pulsa «Alunizar aquí» o elige otro.");
    } else {
      setStatus("Punto no válido: evita tierras altas, sombra polar y zonas ocupadas.");
    }
    return;
  }

  if (state.phase !== "running") return;
  const p = state.players[0];

  if (humanRespawnReady()) {
    const res = applyCommand(state, { type: "respawn", playerId: 0, tile });
    if (!res.ok) setStatus(res.reason ?? "Punto no válido");
    else setStatus("Colonia sucesora fundada. Protección temporal activa.");
    return;
  }
  if (!p.alive) return;

  switch (mode.kind) {
    case "build": {
      const res = applyCommand(state, { type: "build", playerId: 0, kind: mode.structure, tile });
      if (!res.ok) setStatus(res.reason ?? "No se puede construir ahí");
      else {
        setStatus(`${STRUCTURES[mode.structure].label} construido. Recuerda conectarlo a tus redes.`);
        mode = { kind: "inspect" };
        refreshToolButtons();
      }
      return;
    }
    case "connect": {
      const sid = state.tiles[tile].structure;
      const st = sid >= 0 ? state.structures[sid] : undefined;
      if (!st || st.owner !== 0 || st.hp <= 0) {
        setStatus("Selecciona una estructura propia.");
        return;
      }
      if (!mode.from) {
        mode.from = st;
        setStatus(`Origen: ${STRUCTURES[st.kind].label}. Ahora elige el destino.`);
      } else if (mode.from.id !== st.id) {
        const res = applyCommand(state, { type: "connect", playerId: 0, kind: mode.edge, a: mode.from.id, b: st.id });
        setStatus(res.ok ? `${EDGES[mode.edge].label} tendida.` : (res.reason ?? "Conexión no válida"));
        mode.from = null;
      }
      return;
    }
    case "sabotage": {
      const edge = findEnemyEdgeNear(tile);
      if (!edge) {
        setStatus("No hay ninguna conexión enemiga al alcance ahí.");
        return;
      }
      const res = applyCommand(state, { type: "sabotage_edge", playerId: 0, edgeId: edge });
      setStatus(res.ok ? "Sabotaje efectuado." : (res.reason ?? "Sabotaje no posible"));
      return;
    }
    case "rover": {
      const rover = state.rovers.find((r) => r.owner === 0 && r.kind === "explorer");
      if (!rover) {
        setStatus("No tienes rover explorador.");
        return;
      }
      const res = applyCommand(state, { type: "move_rover", playerId: 0, roverId: rover.id, tile });
      setStatus(res.ok ? "Rover en camino." : (res.reason ?? "Orden no válida"));
      return;
    }
    case "inspect":
    default: {
      const sid = state.tiles[tile].structure;
      if (sid >= 0 && state.structures[sid].owner === 0 && state.structures[sid].hp > 0) {
        selectedStructure = state.structures[sid];
        return;
      }
      selectedStructure = null;
      const owner = state.tiles[tile].owner;
      if (owner === 0) return;
      if (owner === -1) {
        const res = applyCommand(state, { type: "expand_toward", playerId: 0, tile });
        if (res.ok) setStatus("Expansión dirigida hacia el punto marcado (consume energía y oxígeno).");
        return;
      }
      const visible = computeVisibility(state, 0);
      if (!visible[tile]) return;
      const res = applyCommand(state, { type: "attack_tile", playerId: 0, tile });
      setStatus(
        res.ok
          ? "Presionando el territorio enemigo."
          : (res.reason ?? "Para atacar necesitas territorio adyacente y recursos."),
      );
      return;
    }
  }
}

/** Busca la arista enemiga cuyo trazado pasa más cerca del tile pulsado. */
function findEnemyEdgeNear(tile: number): number | null {
  const cols = state.config.cols;
  let best: number | null = null;
  let bestDist = 2.6;
  for (const edge of state.edges) {
    if (edge.owner === 0 || edge.status === "cut") continue;
    const a = state.structures[edge.a];
    const b = state.structures[edge.b];
    if (!a || !b) continue;
    for (const t of tilesOnSegment(a.tile, b.tile, cols)) {
      const [tx, ty] = xyOf(t, cols);
      const [cx, cy] = xyOf(tile, cols);
      const d = Math.hypot(tx - cx, ty - cy);
      if (d < bestDist) {
        bestDist = d;
        best = edge.id;
      }
    }
  }
  return best;
}

function onCanvasHover(ev: MouseEvent): void {
  hoverTile = screenTile(ev);
  if (hoverTile < 0) {
    hoverValid = false;
    return;
  }
  if (state.phase === "spawn_selection" || humanRespawnReady()) {
    hoverValid = isValidSpawn(state, hoverTile, 0);
    if (state.phase === "spawn_selection" && hoverValid) {
      const ind = spawnIndicators(state, hoverTile);
      $("indSafety").style.width = `${ind.safety * 100}%`;
      $("indResources").style.width = `${ind.resources * 100}%`;
      $("indRivals").style.width = `${ind.rivals * 100}%`;
    }
    return;
  }
  if (mode.kind === "build") {
    const t = state.tiles[hoverTile];
    const spec = STRUCTURES[mode.structure];
    hoverValid = t.owner === 0 && t.structure === -1 && (!spec.requiresDeposit || t.deposit === spec.requiresDeposit);
  } else {
    hoverValid = true;
  }
}

// ------------------------------------------------------------------- bucle

function frame(now: number): void {
  const delta = Math.min(120, now - lastFrame);
  lastFrame = now;
  if (state.phase === "running" && !paused) {
    accumulator += (delta / 1000) * speed;
    let safety = 200;
    while (accumulator >= TICK_SECONDS && safety-- > 0) {
      tick(state, TICK_SECONDS);
      accumulator -= TICK_SECONDS;
    }
  }

  resizeCanvas();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer.draw(ctx, camera, canvas.clientWidth, canvas.clientHeight, {
    hoverTile,
    hoverValid,
    selectedStructure,
    pendingEdgeFrom: mode.kind === "connect" ? mode.from : null,
    respawnMode: humanRespawnReady(),
    revealDeposits: state.phase !== "spawn_selection",
  });

  // Marca del spawn elegido.
  if (state.phase === "spawn_selection" && selectedSpawnTile >= 0) {
    const [x, y] = xyOf(selectedSpawnTile, state.config.cols);
    ctx.save();
    ctx.setTransform(
      camera.scale * dpr, 0, 0, camera.scale * dpr,
      -camera.x * camera.scale * dpr, -camera.y * camera.scale * dpr,
    );
    ctx.strokeStyle = "#e8c268";
    ctx.lineWidth = 2 / camera.scale;
    ctx.beginPath();
    ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE * 1.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  updateHud();

  if (state.phase === "finished" && !summaryShown) showSummary();
  raf = requestAnimationFrame(frame);
}

function showSummary(): void {
  summaryShown = true;
  const counts = new Map<number, number>();
  for (const t of state.tiles) if (t.owner >= 0) counts.set(t.owner, (counts.get(t.owner) ?? 0) + 1);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const winner = state.players[state.winner];
  $("summaryTitle").textContent =
    state.winner === 0 ? "🏆 Dominas la región lunar" : `Fin de la partida — vence ${winner?.name ?? "?"}`;
  const rows = [
    "<tr><th>Colonia</th><th>Control</th><th>Territorio</th><th>Población</th><th>Estructuras</th><th>Cortes</th><th>Puntos</th></tr>",
  ];
  for (const p of ranked) {
    rows.push(
      `<tr class="${p.human ? "human" : ""}"><td><i class="player-dot" style="background:${p.color}"></i>${p.name}${p.alive ? "" : " ☠"}</td>` +
        `<td>${Math.round(p.control)}%</td><td>${counts.get(p.id) ?? 0}</td><td>${Math.floor(p.population)}</td>` +
        `<td>${p.stats.structuresBuilt}</td><td>${p.stats.edgesCut}</td><td>${p.score}</td></tr>`,
    );
  }
  $("summaryTable").innerHTML = rows.join("");
  $("summaryModal").classList.remove("hidden");
}

// ------------------------------------------------------------------ eventos

canvas.addEventListener("click", onCanvasClick);
canvas.addEventListener("mousemove", onCanvasHover);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

let panning = false;
let panLast: [number, number] = [0, 0];
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 2 || e.button === 1) {
    panning = true;
    panLast = [e.clientX, e.clientY];
  }
});
window.addEventListener("mouseup", () => (panning = false));
window.addEventListener("mousemove", (e) => {
  if (!panning) return;
  camera.pan(e.clientX - panLast[0], e.clientY - panLast[1], canvas.clientWidth, canvas.clientHeight);
  panLast = [e.clientX, e.clientY];
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    camera.zoomAt(
      e.clientX - rect.left,
      e.clientY - rect.top,
      e.deltaY < 0 ? 1.15 : 1 / 1.15,
      canvas.clientWidth,
      canvas.clientHeight,
    );
  },
  { passive: false },
);

$("confirmSpawnButton").addEventListener("click", () => {
  if (selectedSpawnTile < 0) return;
  const res = applyCommand(state, { type: "select_spawn", playerId: 0, tile: selectedSpawnTile });
  if (!res.ok) {
    setStatus(res.reason ?? "Punto no válido");
    return;
  }
  $("spawnPanel").classList.add("hidden");
  setStatus("Construye un generador y un nodo de oxígeno, y conéctalos al hábitat antes de agotar reservas.");
});

$("pauseButton").addEventListener("click", () => {
  paused = !paused;
  $("pauseButton").textContent = paused ? "▶" : "⏸";
});
$("speedButton").addEventListener("click", () => {
  speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
  $("speedButton").textContent = `×${speed}`;
});
$("rematchButton").addEventListener("click", () => {
  $("summaryModal").classList.add("hidden");
  $("gameScreen").classList.add("hidden");
  $("menuScreen").classList.remove("hidden");
  cancelAnimationFrame(raf);
});
window.addEventListener("resize", () => {
  if (state) camera.clamp(canvas.clientWidth, canvas.clientHeight);
});

$("playButton").addEventListener("click", () => {
  const seedText = $<HTMLInputElement>("seedInput").value.trim();
  const seed = seedText ? hashSeed(seedText) : (Date.now() % 2147483647);
  const bots = Math.max(1, Math.min(15, parseInt($<HTMLInputElement>("botCountInput").value, 10) || 7));
  startMatch(seed, bots);
});

function hashSeed(text: string): number {
  const n = Number(text);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ------------------------------------------------- arranque y depuración

const params = new URLSearchParams(location.search);
declare global {
  interface Window {
    __cfl?: {
      getState: () => MatchState;
      applyCommand: typeof applyCommand;
      tickMany: (n: number) => void;
      setSpeed: (s: number) => void;
      autoSpawn: () => boolean;
      isValidSpawn: (tile: number) => boolean;
      structureOperating: typeof structureOperating;
      homeStructure: (playerId: number) => number;
      neighbors4: typeof neighbors4;
    };
  }
}
window.__cfl = {
  getState: () => state,
  applyCommand,
  tickMany: (n: number) => {
    for (let i = 0; i < n; i++) tick(state, TICK_SECONDS);
  },
  setSpeed: (s: number) => {
    speed = s;
  },
  autoSpawn: () => {
    for (let i = 0; i < state.tiles.length; i++) {
      if (isValidSpawn(state, i, 0)) {
        selectedSpawnTile = i;
        const res = applyCommand(state, { type: "select_spawn", playerId: 0, tile: i });
        if (res.ok) {
          $("spawnPanel").classList.add("hidden");
          return true;
        }
      }
    }
    return false;
  },
  isValidSpawn: (tile: number) => isValidSpawn(state, tile, 0),
  structureOperating,
  homeStructure: (playerId: number) => homeStructure(state, playerId),
  neighbors4,
};

if (params.has("seed")) {
  const bots = Math.max(1, Math.min(15, parseInt(params.get("bots") ?? "7", 10) || 7));
  startMatch(hashSeed(params.get("seed")!), bots);
}
