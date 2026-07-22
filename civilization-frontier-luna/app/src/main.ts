/**
 * Cliente v0.01: menú → (solitario | sala privada) → selección de spawn →
 * partida → resumen.
 *
 * En solitario la simulación autoritativa corre en local con el mismo núcleo
 * determinista que usa el servidor. En multijugador el cliente solo emite
 * comandos y pinta el espejo filtrado por niebla que envía el servidor.
 */
import "./styles.css";
import { createMatch, defaultConfig, homeStructure, spawnIndicators, isValidSpawn } from "./sim/match";
import { applyCommand } from "./sim/commands";
import { tick } from "./sim/tick";
import { TICK_SECONDS, STRUCTURES, EDGES, RESOURCE_LABELS, VICTORY_THRESHOLD } from "./sim/constants";
import type { Command, CommandResult, EdgeKind, MatchState, Structure, StructureKind } from "./sim/types";
import { Camera, TILE } from "./client/camera";
import { Renderer, createMemory, type ClientMemory } from "./client/renderer";
import { computeVisibility } from "./sim/fog";
import { xyOf, idx, neighbors4, tilesOnSegment } from "./sim/grid";
import { structureOperating } from "./sim/economy";
import { NetSession } from "./net/session";
import { DEFAULT_PORT, type FinishedStats, type LobbyPlayer } from "./net/protocol";

type Mode =
  | { kind: "inspect" }
  | { kind: "build"; structure: StructureKind }
  | { kind: "connect"; edge: EdgeKind; fromId: number }
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
let selectedStructureId = -1;
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
let humanId = 0;
let session: NetSession | null = null;
let netFinishedStats: FinishedStats[] | null = null;

const netMode = (): boolean => session !== null && session.mirror !== null;

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

function me() {
  return state.players[humanId];
}

function humanRespawnReady(): boolean {
  const p = me();
  return p.evacuated && p.respawnsLeft > 0 && state.elapsed >= p.evacUntil;
}

function currentVisibility(): Uint8Array {
  if (netMode() && session!.mirror!.visibility) return session!.mirror!.visibility!;
  return computeVisibility(state, humanId);
}

function setStatus(text: string): void {
  $("statusBadge").textContent = text;
}

/**
 * Único punto de emisión de acciones del jugador. En local aplica el comando
 * al núcleo; en red lo envía al servidor (el resultado llega por cmd_result).
 */
function issueCommand(cmd: Command): CommandResult {
  if (!netMode()) return applyCommand(state, cmd);
  session!.issueCommand(cmd);
  return { ok: true };
}

function selectedStructure(): Structure | null {
  if (selectedStructureId < 0) return null;
  const st = state.structures[selectedStructureId];
  return st && st.hp > 0 ? st : null;
}

// ------------------------------------------------------------------ pantallas

function showScreen(id: "menuScreen" | "lobbyScreen" | "gameScreen"): void {
  for (const s of ["menuScreen", "lobbyScreen", "gameScreen"]) {
    $(s).classList.toggle("hidden", s !== id);
  }
}

function enterGameScreen(): void {
  showScreen("gameScreen");
  $("summaryModal").classList.add("hidden");
  $("spawnPanel").classList.remove("hidden");
  $<HTMLButtonElement>("confirmSpawnButton").disabled = true;
  $("eventLog").innerHTML = "";
  $("pauseButton").textContent = "⏸";
  $("speedButton").textContent = "×1";
  // El ritmo lo marca el servidor en multijugador.
  $("pauseButton").classList.toggle("hidden", netMode());
  $("speedButton").classList.toggle("hidden", netMode());
  mode = { kind: "inspect" };
  selectedStructureId = -1;
  selectedSpawnTile = -1;
  paused = false;
  speed = 1;
  accumulator = 0;
  lastEventIndex = 0;
  summaryShown = false;
  netFinishedStats = null;
  resizeCanvas();
  camera.fit(canvas.clientWidth, canvas.clientHeight);
  setStatus("Haz clic en el mapa para elegir dónde alunizar.");
  buildToolButtons();
  cancelAnimationFrame(raf);
  lastFrame = performance.now();
  raf = requestAnimationFrame(frame);
}

function startLocalMatch(seed: number, botCount: number): void {
  session?.disconnect();
  session = null;
  humanId = 0;
  const config = defaultConfig(seed);
  config.botCount = botCount;
  state = createMatch(config);
  memory = createMemory(state.tiles.length);
  renderer = new Renderer(state, memory);
  camera = new Camera(state.config.cols * TILE, state.config.rows * TILE);
  enterGameScreen();
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
    { label: `⚡ ${EDGES.energy_line.label}`, title: "Conecta dos estructuras propias con una línea de energía.", make: () => ({ kind: "connect", edge: "energy_line", fromId: -1 }) },
    { label: `◍ ${EDGES.oxygen_conduit.label}`, title: "Conecta un nodo de oxígeno con hábitats.", make: () => ({ kind: "connect", edge: "oxygen_conduit", fromId: -1 }) },
    { label: `⇄ ${EDGES.trade_route.label}`, title: "Conecta un puerto lunar con otra instalación para generar ingresos.", make: () => ({ kind: "connect", edge: "trade_route", fromId: -1 }) },
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
  document.querySelectorAll<HTMLButtonElement>("#modeButtons .tool-btn").forEach((b) => {
    let active = false;
    if (mode.kind === "inspect") active = b.dataset.mode?.startsWith("Expandir") ?? false;
    else if (mode.kind === "connect") active = b.dataset.mode?.includes(EDGES[mode.edge].label) ?? false;
    else if (mode.kind === "sabotage") active = b.dataset.mode?.includes("Sabotear") ?? false;
    else if (mode.kind === "rover") active = b.dataset.mode?.includes("rover") ?? false;
    b.classList.toggle("active", active);
  });
}

function updateHud(): void {
  const p = me();
  const setRes = (id: string, value: number, cap: number, rate: number) => {
    const el = $(id);
    el.querySelector(".res-val")!.textContent = `${Math.floor(value)}/${Math.round(cap)}`;
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

  updateAlerts();
  updateEventLog();
  updateSelectionPanel();
}

function updateAlerts(): void {
  const banner = $("alertBanner");
  const p = me();
  if (state.phase === "running" && p.evacuated) {
    banner.classList.remove("hidden");
    banner.classList.add("info");
    banner.textContent = humanRespawnReady()
      ? "Población en órbita: haz clic en un punto neutral válido para realunizar."
      : `Evacuación en curso… realunizaje disponible en ${Math.ceil(p.evacUntil - state.elapsed)}s`;
    return;
  }
  if (state.phase === "spawn_selection" && p.alive) {
    banner.classList.remove("hidden");
    banner.classList.add("info");
    banner.textContent = "Has alunizado. Esperando al resto de jugadores…";
    return;
  }
  banner.classList.remove("info");
  let worstO2 = Infinity;
  let worstEnergy = Infinity;
  for (const st of state.structures) {
    if (!st || st.owner !== humanId || st.hp <= 0) continue;
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
    if (ev.playerId >= 0 && ev.playerId !== humanId && !ev.important) continue;
    const li = document.createElement("li");
    if (ev.important) li.classList.add("important");
    li.innerHTML = `<time>${timeString(ev.at)}</time>${ev.text}`;
    log.prepend(li);
    while (log.children.length > 40) log.lastChild?.remove();
  }
}

function updateSelectionPanel(): void {
  const panel = $("selectionPanel");
  const st = selectedStructure();
  if (!st) {
    panel.classList.add("hidden");
    return;
  }
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
    if (me().alive) return; // ya alunizado, esperando al resto
    if (isValidSpawn(state, tile, humanId)) {
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
  const p = me();

  if (humanRespawnReady()) {
    const res = issueCommand({ type: "respawn", playerId: humanId, tile });
    if (!res.ok) setStatus(res.reason ?? "Punto no válido");
    else setStatus(netMode() ? "Solicitando realunizaje…" : "Colonia sucesora fundada. Protección temporal activa.");
    return;
  }
  if (!p.alive) return;

  switch (mode.kind) {
    case "build": {
      const res = issueCommand({ type: "build", playerId: humanId, kind: mode.structure, tile });
      if (!res.ok) setStatus(res.reason ?? "No se puede construir ahí");
      else {
        setStatus(`${STRUCTURES[mode.structure].label}: orden enviada. Recuerda conectarlo a tus redes.`);
        mode = { kind: "inspect" };
        refreshToolButtons();
      }
      return;
    }
    case "connect": {
      const sid = state.tiles[tile].structure;
      const st = sid >= 0 ? state.structures[sid] : undefined;
      if (!st || st.owner !== humanId || st.hp <= 0) {
        setStatus("Selecciona una estructura propia.");
        return;
      }
      if (mode.fromId < 0) {
        mode.fromId = st.id;
        setStatus(`Origen: ${STRUCTURES[st.kind].label}. Ahora elige el destino.`);
      } else if (mode.fromId !== st.id) {
        const res = issueCommand({ type: "connect", playerId: humanId, kind: mode.edge, a: mode.fromId, b: st.id });
        setStatus(res.ok ? `${EDGES[mode.edge].label}: orden enviada.` : (res.reason ?? "Conexión no válida"));
        mode.fromId = -1;
      }
      return;
    }
    case "sabotage": {
      const edge = findEnemyEdgeNear(tile);
      if (edge === null) {
        setStatus("No hay ninguna conexión enemiga al alcance ahí.");
        return;
      }
      const res = issueCommand({ type: "sabotage_edge", playerId: humanId, edgeId: edge });
      setStatus(res.ok ? "Sabotaje ordenado." : (res.reason ?? "Sabotaje no posible"));
      return;
    }
    case "rover": {
      const rover = state.rovers.find((r) => r.owner === humanId && r.kind === "explorer");
      if (!rover) {
        setStatus("No tienes rover explorador.");
        return;
      }
      const res = issueCommand({ type: "move_rover", playerId: humanId, roverId: rover.id, tile });
      setStatus(res.ok ? "Rover en camino." : (res.reason ?? "Orden no válida"));
      return;
    }
    case "inspect":
    default: {
      const sid = state.tiles[tile].structure;
      if (sid >= 0 && state.structures[sid]?.owner === humanId && state.structures[sid].hp > 0) {
        selectedStructureId = sid;
        return;
      }
      selectedStructureId = -1;
      const owner = state.tiles[tile].owner;
      if (owner === humanId) return;
      if (owner === -1) {
        const res = issueCommand({ type: "expand_toward", playerId: humanId, tile });
        if (res.ok) setStatus("Expansión dirigida hacia el punto marcado (consume energía y oxígeno).");
        return;
      }
      if (!currentVisibility()[tile]) return;
      const res = issueCommand({ type: "attack_tile", playerId: humanId, tile });
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
    if (edge.owner === humanId || edge.status === "cut") continue;
    const aTile = edge.aTile ?? state.structures[edge.a]?.tile;
    const bTile = edge.bTile ?? state.structures[edge.b]?.tile;
    if (aTile === undefined || bTile === undefined) continue;
    for (const t of tilesOnSegment(aTile, bTile, cols)) {
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
    hoverValid = isValidSpawn(state, hoverTile, humanId);
    if (state.phase === "spawn_selection" && hoverValid && !me().alive) {
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
    hoverValid = t.owner === humanId && t.structure === -1 && (!spec.requiresDeposit || t.deposit === spec.requiresDeposit);
  } else {
    hoverValid = true;
  }
}

// ------------------------------------------------------------------- bucle

function frame(now: number): void {
  const delta = Math.min(120, now - lastFrame);
  lastFrame = now;
  if (!netMode() && state.phase === "running" && !paused) {
    accumulator += (delta / 1000) * speed;
    let safety = 200;
    while (accumulator >= TICK_SECONDS && safety-- > 0) {
      tick(state, TICK_SECONDS);
      accumulator -= TICK_SECONDS;
    }
  }

  // En red, el panel de spawn se oculta al confirmarse nuestro alunizaje.
  if (state.phase !== "spawn_selection" || me().alive) {
    if (!$("spawnPanel").classList.contains("hidden") && me().alive) $("spawnPanel").classList.add("hidden");
  }

  resizeCanvas();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer.draw(ctx, camera, canvas.clientWidth, canvas.clientHeight, {
    hoverTile,
    hoverValid,
    selectedStructure: selectedStructure(),
    pendingEdgeFrom: mode.kind === "connect" && mode.fromId >= 0 ? (state.structures[mode.fromId] ?? null) : null,
    respawnMode: humanRespawnReady(),
    revealDeposits: state.phase !== "spawn_selection",
    humanId,
    visibility: netMode() ? session!.mirror!.visibility : undefined,
  });

  if (state.phase === "spawn_selection" && selectedSpawnTile >= 0 && !me().alive) {
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
  if (netMode() && !netFinishedStats) return; // esperar match_finished
  summaryShown = true;
  interface Row {
    id: number;
    name: string;
    color: string;
    human: boolean;
    alive: boolean;
    control: number;
    territory: number;
    population: number;
    structuresBuilt: number;
    edgesCut: number;
    score: number;
  }
  let rows: Row[];
  if (netMode()) {
    rows = netFinishedStats!;
  } else {
    const counts = new Map<number, number>();
    for (const t of state.tiles) if (t.owner >= 0) counts.set(t.owner, (counts.get(t.owner) ?? 0) + 1);
    rows = state.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      human: p.human,
      alive: p.alive,
      control: p.control,
      territory: counts.get(p.id) ?? 0,
      population: p.population,
      structuresBuilt: p.stats.structuresBuilt,
      edgesCut: p.stats.edgesCut,
      score: p.score,
    }));
  }
  rows.sort((a, b) => b.score - a.score);
  const winner = rows.find((r) => r.id === state.winner);
  $("summaryTitle").textContent =
    state.winner === humanId ? "🏆 Dominas la región lunar" : `Fin de la partida — vence ${winner?.name ?? "?"}`;
  const html = [
    "<tr><th>Colonia</th><th>Control</th><th>Territorio</th><th>Población</th><th>Estructuras</th><th>Cortes</th><th>Puntos</th></tr>",
  ];
  for (const r of rows) {
    html.push(
      `<tr class="${r.id === humanId ? "human" : ""}"><td><i class="player-dot" style="background:${r.color}"></i>${r.name}${r.alive ? "" : " ☠"}</td>` +
        `<td>${Math.round(r.control)}%</td><td>${r.territory}</td><td>${Math.floor(r.population)}</td>` +
        `<td>${r.structuresBuilt}</td><td>${r.edgesCut}</td><td>${r.score}</td></tr>`,
    );
  }
  $("summaryTable").innerHTML = html.join("");
  $("summaryModal").classList.remove("hidden");
}

// ------------------------------------------------------------------ red

function defaultServerUrl(): string {
  return `ws://${location.hostname || "localhost"}:${DEFAULT_PORT}`;
}

function showMultiError(text: string): void {
  const el = $("multiError");
  el.textContent = text;
  el.classList.remove("hidden");
}

function createSession(): NetSession {
  return new NetSession({
    onLobby(code, yourPlayerId, players, botCount) {
      showScreen("lobbyScreen");
      $("lobbyCode").textContent = code;
      const list = $("lobbyPlayers");
      list.innerHTML = "";
      for (const pl of players) {
        const li = document.createElement("li");
        li.innerHTML =
          `<i class="player-dot" style="background:${pl.color}"></i>${pl.name}` +
          (pl.isHost ? `<span class="host-tag">anfitrión</span>` : pl.connected ? "" : `<span class="offline">desconectado</span>`);
        list.appendChild(li);
      }
      const isHost = players.find((pl) => pl.playerId === yourPlayerId)?.isHost ?? false;
      $("lobbyStartButton").classList.toggle("hidden", !isHost);
      $("lobbyStatus").textContent = `${players.length}/16 jugadores · ${botCount} bots · ${
        isHost ? "puedes empezar cuando quieras" : "esperando al anfitrión"
      }`;
    },
    onGameStart(mirror) {
      humanId = mirror.humanId;
      state = mirror.state;
      memory = createMemory(state.tiles.length);
      renderer = new Renderer(state, memory);
      camera = new Camera(state.config.cols * TILE, state.config.rows * TILE);
      enterGameScreen();
    },
    onSnapshot() {
      // El frame loop pinta el espejo; nada que hacer aquí.
    },
    onFinished(winner, stats) {
      netFinishedStats = stats;
      state.winner = winner;
      state.phase = "finished";
    },
    onCmdResult(ok, reason) {
      if (!ok && reason) setStatus(reason);
    },
    onError(reason) {
      showMultiError(reason);
    },
    onClose() {
      if ($("gameScreen").classList.contains("hidden")) {
        showScreen("menuScreen");
        showMultiError("Conexión cerrada por el servidor.");
      } else if (state && state.phase !== "finished") {
        setStatus("⚠ Conexión perdida con el servidor. Vuelve al menú y reconéctate a la sala.");
      }
      session = null;
    },
  });
}

function playerName(): string {
  return $<HTMLInputElement>("playerNameInput").value.trim() || "Colono";
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
  const res = issueCommand({ type: "select_spawn", playerId: humanId, tile: selectedSpawnTile });
  if (!res.ok) {
    setStatus(res.reason ?? "Punto no válido");
    return;
  }
  $<HTMLButtonElement>("confirmSpawnButton").disabled = true;
  setStatus(
    netMode()
      ? "Alunizaje solicitado…"
      : "Construye un generador y un nodo de oxígeno, y conéctalos al hábitat antes de agotar reservas.",
  );
  if (!netMode()) $("spawnPanel").classList.add("hidden");
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
  session?.disconnect();
  session = null;
  showScreen("menuScreen");
  cancelAnimationFrame(raf);
});
window.addEventListener("resize", () => {
  if (camera) camera.clamp(canvas.clientWidth, canvas.clientHeight);
});

$("playButton").addEventListener("click", () => {
  const seedText = $<HTMLInputElement>("seedInput").value.trim();
  const seed = seedText ? hashSeed(seedText) : (Date.now() % 2147483647);
  const bots = Math.max(1, Math.min(15, parseInt($<HTMLInputElement>("botCountInput").value, 10) || 7));
  startLocalMatch(seed, bots);
});

$("hostButton").addEventListener("click", () => {
  $("multiError").classList.add("hidden");
  const url = $<HTMLInputElement>("serverInput").value.trim() || defaultServerUrl();
  const bots = Math.max(0, Math.min(15, parseInt($<HTMLInputElement>("botCountInput").value, 10) || 7));
  const seedText = $<HTMLInputElement>("seedInput").value.trim();
  session?.disconnect();
  session = createSession();
  session.connect(url, () => session!.createRoom(playerName(), bots, seedText ? hashSeed(seedText) : undefined));
});

$("joinButton").addEventListener("click", () => {
  $("multiError").classList.add("hidden");
  const url = $<HTMLInputElement>("serverInput").value.trim() || defaultServerUrl();
  const code = $<HTMLInputElement>("joinCodeInput").value.trim().toUpperCase();
  if (code.length !== 5) {
    showMultiError("Introduce el código de 5 letras de la sala.");
    return;
  }
  session?.disconnect();
  session = createSession();
  session.connect(url, () => session!.joinRoom(code, playerName()));
});

$("lobbyStartButton").addEventListener("click", () => session?.startGame());
$("lobbyLeaveButton").addEventListener("click", () => {
  session?.disconnect();
  session = null;
  showScreen("menuScreen");
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
      issueCommand: typeof issueCommand;
      tickMany: (n: number) => void;
      setSpeed: (s: number) => void;
      autoSpawn: () => boolean;
      isValidSpawn: (tile: number) => boolean;
      structureOperating: typeof structureOperating;
      homeStructure: (playerId: number) => number;
      neighbors4: typeof neighbors4;
      getHumanId: () => number;
      isNetMode: () => boolean;
    };
  }
}
window.__cfl = {
  getState: () => state,
  applyCommand,
  issueCommand,
  tickMany: (n: number) => {
    if (netMode()) return;
    for (let i = 0; i < n; i++) tick(state, TICK_SECONDS);
  },
  setSpeed: (s: number) => {
    speed = s;
  },
  autoSpawn: () => {
    for (let i = 0; i < state.tiles.length; i++) {
      if (isValidSpawn(state, i, humanId)) {
        selectedSpawnTile = i;
        const res = issueCommand({ type: "select_spawn", playerId: humanId, tile: i });
        if (res.ok) {
          if (!netMode()) $("spawnPanel").classList.add("hidden");
          return true;
        }
      }
    }
    return false;
  },
  isValidSpawn: (tile: number) => isValidSpawn(state, tile, humanId),
  structureOperating,
  homeStructure: (playerId: number) => homeStructure(state, playerId),
  neighbors4,
  getHumanId: () => humanId,
  isNetMode: () => netMode(),
};

if (params.has("seed")) {
  const bots = Math.max(1, Math.min(15, parseInt(params.get("bots") ?? "7", 10) || 7));
  startLocalMatch(hashSeed(params.get("seed")!), bots);
}
