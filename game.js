const buttons = [...document.querySelectorAll('[data-action]')];
const status = document.querySelector('#status');
const tripTime = document.querySelector('#trip-time');
const decisionTime = document.querySelector('#decision-time');
const speedDisplay = document.querySelector('#speed');
const energyDisplay = document.querySelector('#energy');
const energyGauge = document.querySelector('#energy-gauge');
const trafficView = document.querySelector('#traffic');
const turnLabel = document.querySelector('#turn-label');
const phaseLabel = document.querySelector('#phase-label');
const roadView = document.querySelector('.road-view');
const laneDisplay = document.querySelector('#lane-display');
const playerToken = document.querySelector('#player-token');
const leftMirrorCars = document.querySelector('#left-mirror-cars');
const rightMirrorCars = document.querySelector('#right-mirror-cars');
const leftMirrorLabel = document.querySelector('#left-mirror-label');
const rightMirrorLabel = document.querySelector('#right-mirror-label');
const leftMirror = document.querySelector('.left-mirror');
const rightMirror = document.querySelector('.right-mirror');
const rearMirrorCars = document.querySelector('#rear-mirror-cars');
const rearMirrorLabel = document.querySelector('#rear-mirror-label');
const rearMirror = document.querySelector('.rear-mirror');
const debugLog = document.querySelector('#debug-log');
const debugTurn = document.querySelector('#debug-turn');
const routeNotice = document.querySelector('#route-notice');
const failureScreen = document.querySelector('#failure-screen');
const failureKicker = document.querySelector('#failure-kicker');
const failureTitle = document.querySelector('#failure-title');
const failureReason = document.querySelector('#failure-reason');
const restartRun = document.querySelector('#restart-run');
const crashReplay = document.querySelector('#crash-replay');
const crashReplayCanvas = document.querySelector('#crash-replay-canvas');
const replayTurn = document.querySelector('#replay-turn');
const replayToggle = document.querySelector('#replay-toggle');
const replayScrubber = document.querySelector('#replay-scrubber');
const mainMenu = document.querySelector('#main-menu');
const startGame = document.querySelector('#start-game');
const leaderboardList = document.querySelector('#leaderboard-list');
const clearRunLog = document.querySelector('#clear-run-log');
const RUN_LOG_KEY = 'road-to-busan-run-log-v1';

const PLAYER_ROW = 0;
const FAR_ROW = 7;
const REAR_ROW = -4;
const phases = [
  { id: 'city-1', label: 'CITY 1', turns: 10, lanes: 3, density: 5 },
  { id: 'city-2', label: 'CITY 2', turns: 12, lanes: 3, density: 6 },
  { id: 'highway', label: 'HIGHWAY', turns: 20, lanes: 5, density: 8 },
  { id: 'busan', label: 'BUSAN', turns: 10, lanes: 4, density: 7 }
];
const personality = { blue: 'slow', red: 'cut-in', yellow: 'brake', green: 'fast', purple: 'unsignaled lane change' };
const NPC_BEHAVIOR = {
  blue: { speed: 40, spawn: 34, laneChange: .08 },
  yellow: { speed: 60, spawn: 24, brake: .25 },
  red: { speed: 80, spawn: 18, cutIn: .22 },
  green: { speed: 100, spawn: 14, laneChange: .14 },
  purple: { speed: 60, spawn: 10, unsignaledChange: .32 }
};
const COLOR_ORDER = Object.keys(NPC_BEHAVIOR);

let speed = 60;
let energy = 80;
let tripSeconds = 0;
let remaining = 5;
let locked = false;
let gameOver = false;
let turn = 1;
let phaseIndex = 0;
let phaseTurn = 1;
let lane = 1;
let playerStartLane = lane;
let blinker = null;
let lastDebugEvents = [];
let laneExtensions = [];
const routeSides = {};
let gameStarted = false;
let runRecorded = false;
let choiceLog = [];
let replayFrames = [];
let replayIndex = 0;
let replayTimer = null;
let replayProgress = 0;
const REPLAY_SEGMENT_MS = 1100;
const trafficNodes = new Map();
let traffic = [
  { id: 'blue-1', color: 'blue', speed: 40, lane: 0, row: 2 },
  { id: 'yellow-1', color: 'yellow', speed: 60, lane: 1, row: 6 },
  { id: 'red-1', color: 'red', speed: 80, lane: 2, row: 4 },
  { id: 'green-1', color: 'green', speed: 100, lane: 2, row: 7 },
  { id: 'purple-1', color: 'purple', speed: 60, lane: 0, row: 5 },
  { id: 'purple-rear', color: 'purple', speed: 60, lane: 0, row: -1 },
  { id: 'green-rear', color: 'green', speed: 100, lane: 2, row: -4 }
];

function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }

function randomColor() {
  const totalWeight = COLOR_ORDER.reduce((total, color) => total + NPC_BEHAVIOR[color].spawn, 0);
  let roll = Math.random() * totalWeight;
  for (const color of COLOR_ORDER) {
    roll -= NPC_BEHAVIOR[color].spawn;
    if (roll <= 0) return color;
  }
  return 'blue';
}

function adjacentTrafficLane(currentLane) {
  const validLanes = trafficLaneIndices();
  const options = [currentLane - 1, currentLane + 1].filter(lane => validLanes.includes(lane));
  return options.length ? randomItem(options) : currentLane;
}

function currentPhase() { return phases[phaseIndex]; }
function laneCount() { return currentPhase().lanes + laneExtensions.length; }
function laneName(index) {
  const laneTotal = laneCount();
  const offset = index - (laneTotal - 1) / 2;
  if (offset === 0) return 'center';
  // Even-lane roads have no literal centre cell. Name their two nearest
  // lanes "inner" so the dashboard never calls them "left 0.5".
  if (laneTotal % 2 === 0) return `${offset < 0 ? 'left' : 'right'} ${Math.abs(offset) === .5 ? 'inner' : 'outer'}`;
  return `${offset < 0 ? 'left' : 'right'} ${Math.abs(offset)}`;
}

function routeKeyFor(phaseId, turnInPhase) {
  return `${phaseId}:${turnInPhase}`;
}

function routeSideFor(phaseId, turnInPhase) {
  const key = routeKeyFor(phaseId, turnInPhase);
  // The final charger and Busan exit appear together. They must be on
  // opposite sides so the player makes a meaningful route choice.
  if (phaseId === 'highway' && turnInPhase === 20) {
    const chargeSide = routeSideFor('highway', 18);
    routeSides[key] = chargeSide === 'left' ? 'right' : 'left';
    return routeSides[key];
  }
  if (!routeSides[key]) routeSides[key] = Math.random() < .5 ? 'left' : 'right';
  return routeSides[key];
}

function routeAt(turnInPhase) {
  const phase = currentPhase().id;
  let route = null;
  if (phase === 'city-2' && turnInPhase === 6) route = { type: 'highway', required: false, label: 'HIGHWAY ENTRANCE' };
  if (phase === 'city-2' && turnInPhase === 12) route = { type: 'highway', required: true, label: 'FINAL HIGHWAY ENTRANCE' };
  if (phase === 'highway' && [6, 12, 18].includes(turnInPhase)) route = { type: 'charge', required: false, label: 'CHARGING EXIT' };
  if (phase === 'highway' && turnInPhase === 20) route = { type: 'busan', required: true, label: 'BUSAN EXIT' };
  if (!route) return null;
  const routeKey = routeKeyFor(phase, turnInPhase);
  const side = routeSideFor(phase, turnInPhase);
  const key = side === 'left' ? '5' : '6';
  return { ...route, routeKey, side, key, text: `${route.label} · ${side.toUpperCase()} EXIT LANE · PRESS ${key}${route.type === 'charge' ? ' · +30% ENERGY' : ''}` };
}

function routeEvent() { return routeAt(phaseTurn); }
function routePreview() {
  for (let turnsAway = 1; turnsAway <= 2; turnsAway += 1) {
    const route = routeAt(phaseTurn + turnsAway);
    if (route) return { ...route, turnsAway };
  }
  return null;
}
function sceneRoutes() {
  return [routeEvent(), routePreview()]
    .filter(Boolean)
    .filter((route, index, routes) => routes.findIndex(other => other.routeKey === route.routeKey) === index);
}
function exitLaneIndex(route) { return route.side === 'left' ? 0 : laneCount() - 1; }
function exitAction(route) { return route.side === 'left' ? 'lane-left' : 'lane-right'; }

function isExitLane(laneValue) {
  return laneExtensions.some(extension => laneValue === (extension.side === 'left' ? 0 : laneCount() - 1));
}

function trafficLaneIndices() {
  return Array.from({ length: laneCount() }, (_, index) => index).filter(index => !isExitLane(index));
}

function extendRoadForRoute(route) {
  if (!route || laneExtensions.some(extension => extension.routeKey === route.routeKey)) return;
  laneExtensions.push({ side: route.side, routeKey: route.routeKey });
  if (route.side === 'left') {
    lane += 1;
    playerStartLane += 1;
    traffic = traffic.map(car => ({ ...car, lane: car.lane + 1 }));
  }
  renderDebug([{ color: 'system', text: `${route.side.toUpperCase()} exit lane opens for ${route.label}.` }], `${currentPhase().label} · EXIT LANE OPEN`);
}

function collapseExitLane(extension) {
  if (!extension) return;
  if (extension.side === 'left') {
    lane = Math.max(0, lane - 1);
    playerStartLane = Math.max(0, playerStartLane - 1);
    traffic = traffic.map(car => ({ ...car, lane: car.lane - 1 }));
  } else {
    const leftExitRemains = laneExtensions.some(candidate => candidate.routeKey !== extension.routeKey && candidate.side === 'left');
    const restoredMaxLane = currentPhase().lanes - 1 + (leftExitRemains ? 1 : 0);
    lane = Math.min(restoredMaxLane, lane);
    playerStartLane = Math.min(restoredMaxLane, playerStartLane);
  }
  laneExtensions = laneExtensions.filter(candidate => candidate.routeKey !== extension.routeKey);
}

const labels = {
  'speed-up': 'Accelerating. The grid scrolls faster.',
  'speed-down': 'Slowing down. Below 80 km/h uses one grid cell.',
  'blink-left': 'Left blinker on.',
  'blink-right': 'Right blinker on.',
  'lane-left': 'Moving left.',
  'lane-right': 'Moving right.',
  nothing: 'Holding your lane and speed.'
};

function loadRunRecords() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RUN_LOG_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function renderLeaderboard() {
  const records = loadRunRecords();
  leaderboardList.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'local-leaderboard__empty';
    empty.textContent = 'No runs recorded yet. Your first trip will be saved here.';
    leaderboardList.append(empty);
    return;
  }
  records.forEach((record, index) => {
    const item = document.createElement('details');
    item.className = `run-record${record.outcome === 'BUSAN REACHED' ? ' win' : ''}`;
    const summary = document.createElement('summary');
    const top = document.createElement('span');
    top.className = 'run-record__top';
    const place = document.createElement('span');
    place.textContent = `#${index + 1} · ${record.phase}`;
    const outcome = document.createElement('strong');
    outcome.textContent = record.outcome;
    top.append(place, outcome);
    const meta = document.createElement('span');
    meta.className = 'run-record__meta';
    meta.textContent = `${record.time} · ${record.energy}% energy · ${record.actions.length} choices`;
    summary.append(top, meta);
    const reason = document.createElement('p');
    reason.className = 'run-record__reason';
    reason.textContent = record.reason;
    const log = document.createElement('ol');
    log.className = 'run-record__log';
    record.actions.forEach(action => {
      const line = document.createElement('li');
      line.textContent = `${action.phase} ${action.turn} · ${action.action}`;
      log.append(line);
    });
    item.append(summary, reason, log);
    leaderboardList.append(item);
  });
}

function recordRun(outcome, reason) {
  if (runRecorded || !gameStarted) return;
  runRecorded = true;
  const progress = phaseIndex * 100 + phaseTurn;
  const record = {
    outcome,
    reason,
    phase: `${currentPhase().label} ${String(phaseTurn).padStart(2, '0')} / ${String(currentPhase().turns).padStart(2, '0')}`,
    time: formatTime(tripSeconds),
    seconds: tripSeconds,
    energy,
    progress,
    actions: choiceLog,
    savedAt: Date.now()
  };
  const records = [...loadRunRecords(), record]
    .sort((a, b) => b.progress - a.progress || a.seconds - b.seconds)
    .slice(0, 10);
  try { window.localStorage.setItem(RUN_LOG_KEY, JSON.stringify(records)); } catch { /* local storage may be unavailable */ }
}

function captureReplayFrame({ crash = null } = {}) {
  replayFrames.push({
    phase: currentPhase().label,
    phaseTurn,
    lane,
    laneCount: laneCount(),
    cars: traffic.map(car => ({ id: car.id, color: car.color, lane: car.lane, row: car.row })),
    crash
  });
}

function stopReplay() {
  if (replayTimer) window.cancelAnimationFrame(replayTimer);
  replayTimer = null;
}

function drawReplayFrame(progress = 0) {
  const frame = replayFrames[replayIndex];
  if (!frame) return;
  const nextFrame = replayFrames[Math.min(replayIndex + 1, replayFrames.length - 1)];
  const context = crashReplayCanvas.getContext('2d');
  const { width, height } = crashReplayCanvas;
  const headerHeight = 28;
  const rows = FAR_ROW - REAR_ROW + 1;
  const cellWidth = width / frame.laneCount;
  const cellHeight = (height - headerHeight) / rows;
  const rowToY = row => headerHeight + (FAR_ROW - row) * cellHeight;
  const carColors = { blue: '#4ba7ff', red: '#fb5965', yellow: '#f6c544', green: '#55cf80', purple: '#b980ed' };

  context.fillStyle = '#08111b';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#142837';
  context.fillRect(0, headerHeight, width, height - headerHeight);
  context.strokeStyle = '#577083';
  context.lineWidth = 1;
  for (let column = 0; column <= frame.laneCount; column += 1) {
    context.beginPath();
    context.moveTo(column * cellWidth, headerHeight);
    context.lineTo(column * cellWidth, height);
    context.stroke();
  }
  for (let row = 0; row <= rows; row += 1) {
    context.beginPath();
    context.moveTo(0, headerHeight + row * cellHeight);
    context.lineTo(width, headerHeight + row * cellHeight);
    context.stroke();
  }

  const currentCars = new Map(frame.cars.map(car => [car.id, car]));
  const nextCars = new Map(nextFrame.cars.map(car => [car.id, car]));
  const carIds = new Set([...currentCars.keys(), ...nextCars.keys()]);
  carIds.forEach(id => {
    const from = currentCars.get(id) || nextCars.get(id);
    const to = nextCars.get(id) || currentCars.get(id);
    const car = {
      ...from,
      lane: from.lane + (to.lane - from.lane) * progress,
      row: from.row + (to.row - from.row) * progress
    };
    if (car.row < REAR_ROW || car.row > FAR_ROW || car.lane < 0 || car.lane >= frame.laneCount) return;
    const x = car.lane * cellWidth + cellWidth / 2;
    const y = rowToY(car.row) + cellHeight / 2;
    context.globalAlpha = currentCars.has(id) && nextCars.has(id) ? 1 : (currentCars.has(id) ? 1 - progress : progress);
    context.fillStyle = carColors[car.color] || '#cbd5e1';
    context.fillRect(x - cellWidth * .28, y - cellHeight * .25, cellWidth * .56, cellHeight * .5);
    context.strokeStyle = '#d7efff';
    context.strokeRect(x - cellWidth * .28, y - cellHeight * .25, cellWidth * .56, cellHeight * .5);
    context.globalAlpha = 1;
  });

  const replayLane = frame.lane + (nextFrame.lane - frame.lane) * progress;
  const playerX = replayLane * cellWidth + cellWidth / 2;
  const playerY = rowToY(PLAYER_ROW) + cellHeight / 2;
  context.fillStyle = '#ff4257';
  context.beginPath();
  context.arc(playerX, playerY, Math.min(cellWidth, cellHeight) * .26, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#fff2f2';
  context.lineWidth = 2;
  context.stroke();
  const crash = progress > .7 ? (nextFrame.crash || frame.crash) : frame.crash;
  if (crash) {
    context.strokeStyle = '#ff2b42';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(playerX - 13, playerY - 13);
    context.lineTo(playerX + 13, playerY + 13);
    context.moveTo(playerX + 13, playerY - 13);
    context.lineTo(playerX - 13, playerY + 13);
    context.stroke();
  }

  context.fillStyle = '#dcecff';
  context.font = '700 11px ui-monospace, monospace';
  context.fillText(`${frame.phase} · TURN ${String(frame.phaseTurn).padStart(2, '0')}`, 10, 18);
  context.fillStyle = crash ? '#ff8793' : '#9ab2c5';
  context.fillText(crash ? `CRASH · ${crash.color.toUpperCase()} INTERSECTION` : 'PLAYER · RED', width - 150, 18);
  replayTurn.textContent = `${replayIndex + 1} / ${replayFrames.length}`;
  replayScrubber.value = String(replayIndex);
}

function playReplay() {
  stopReplay();
  if (replayIndex >= replayFrames.length - 1) {
    replayToggle.textContent = 'Replay again';
    return;
  }
  replayToggle.textContent = 'Pause replay';
  const startedAt = performance.now() - replayProgress * REPLAY_SEGMENT_MS;
  const animate = now => {
    replayProgress = Math.min(1, (now - startedAt) / REPLAY_SEGMENT_MS);
    drawReplayFrame(replayProgress);
    if (replayProgress < 1) {
      replayTimer = window.requestAnimationFrame(animate);
      return;
    }
    replayIndex += 1;
    replayProgress = 0;
    replayTimer = null;
    if (replayIndex < replayFrames.length - 1) playReplay();
    else {
      drawReplayFrame();
      replayToggle.textContent = 'Replay again';
    }
  };
  replayTimer = window.requestAnimationFrame(animate);
}

function showCrashReplay() {
  if (!replayFrames.length) return;
  crashReplay.hidden = false;
  replayIndex = 0;
  replayProgress = 0;
  replayScrubber.max = String(Math.max(0, replayFrames.length - 1));
  drawReplayFrame();
  playReplay();
}

function formatTime(value) {
  const mins = Math.floor(value / 60).toString().padStart(2, '0');
  const secs = (value % 60).toFixed(1).padStart(4, '0');
  return `${mins}:${secs}`;
}

function cellKey(laneValue, row) { return `${laneValue}:${row}`; }
function occupied(cars = traffic) { return new Set(cars.map(car => cellKey(car.lane, car.row))); }

function renderDebug(events, heading = `TURN ${String(turn).padStart(2, '0')} · READY`) {
  lastDebugEvents = events;
  debugTurn.textContent = heading;
  debugLog.replaceChildren(...events.map(event => {
    const line = document.createElement('li');
    const tag = document.createElement('b');
    tag.className = event.color || 'system';
    tag.textContent = event.color ? event.color.toUpperCase() : 'SYSTEM';
    line.append(tag, event.text);
    return line;
  }));
}

function gridPosition(laneValue, row) { return `${laneName(laneValue)} r${row}`; }

function roadProjection(laneValue, row) {
  // The logical grid is projected into a road that narrows toward the horizon.
  // Row 0 is closest to the driver; row 7 is farthest away.
  const rowCenters = [91.5, 75.5, 61, 48.5, 38.5, 30.5, 24.5, 20];
  const top = rowCenters[Math.max(0, Math.min(FAR_ROW, row))];
  const depth = (top - 18) / 82;
  const roadHalfWidth = 10 + (1 - depth) * 34;
  const relativeLane = laneCount() === 1 ? 0 : laneValue / (laneCount() - 1) - .5;
  // Perspective scale is deliberately stronger than the grid taper so the
  // approach of an NPC reads immediately at a glance.
  return { left: 50 + relativeLane * roadHalfWidth, top, scale: .22 + depth * .58 };
}

function renderPlayerLane() {
  laneDisplay.textContent = laneName(lane).toUpperCase();
  roadView.style.setProperty('--road-shift', '0%');
  const projection = roadProjection(lane, PLAYER_ROW);
  playerToken.style.left = `${projection.left}%`;
  playerToken.style.top = `${projection.top}%`;
  syncThreeScene();
}

function syncThreeScene(brakingIds = new Set(), signalDirections = new Map(), travelSteps = 0) {
  if (!window.road3d) return;
  const signals = Object.fromEntries(traffic.map(car => [car.id, signalDirections.get(car.id) || car.signal || null]));
  const activeBrakes = new Set([...brakingIds, ...traffic.filter(car => car.braking).map(car => car.id)]);
  window.road3d.update({ traffic, playerLane: lane, laneCount: laneCount(), phase: currentPhase().id, routes: sceneRoutes(), brakingIds: [...activeBrakes], signals, travelSteps });
}

function renderTraffic(brakingIds = new Set(), signalDirections = new Map(), travelSteps = 0) {
  const visibleCars = traffic.filter(car => car.row > PLAYER_ROW && car.row <= FAR_ROW);
  const visibleIds = new Set();

  visibleCars.forEach(car => {
    visibleIds.add(car.id);
    let node = trafficNodes.get(car.id);
    if (!node) {
      node = document.createElement('div');
      node.dataset.carId = car.id;
      node.innerHTML = '<span></span><i class="stop-light"></i><i class="turn-signal blinker-left"></i><i class="turn-signal blinker-right"></i>';
      trafficNodes.set(car.id, node);
      trafficView.append(node);
    }
    // Temporary debug art: direct, one-to-one mapping from logical grid cell
    // to rendered grid cell. Row 0 is the fixed red player token.
    const projection = roadProjection(car.lane, car.row);
    const signal = signalDirections.get(car.id) || car.signal;
    node.className = `car car-${car.color}${brakingIds.has(car.id) || car.braking ? ' braking' : ''}${signal ? ` signal-${signal}` : ''}`;
    node.style.left = `${projection.left}%`;
    node.style.top = `${projection.top}%`;
    node.style.transform = `translate(-50%,-50%) scale(${projection.scale})`;
    node.title = `${car.color} car · ${car.speed} km/h · ${personality[car.color]} · grid ${laneName(car.lane)}, ${car.row}`;
  });

  trafficNodes.forEach((node, id) => {
    if (!visibleIds.has(id)) {
      node.remove();
      trafficNodes.delete(id);
    }
  });
  renderMirrors();
  syncThreeScene(brakingIds, signalDirections, travelSteps);
}

function renderMirror(carsContainer, label, mirror, direction) {
  const targetLane = lane + direction;
  const cars = targetLane < 0 || targetLane >= laneCount()
    ? []
    : traffic.filter(car => car.lane === targetLane && car.row <= PLAYER_ROW);
  carsContainer.replaceChildren(...cars.map(car => {
    const node = document.createElement('div');
    const closeness = Math.min(1, Math.max(0, (car.row + 4) / 4));
    node.className = `mirror-car ${car.color}`;
    node.style.left = '50%';
    node.style.top = `${75 - (car.row + 4) * 14.2}%`;
    node.style.transform = `translate(-50%,-50%) scale(${0.46 + closeness * .34})`;
    return node;
  }));
  const nearest = cars.sort((a, b) => b.row - a.row)[0];
  const side = direction < 0 ? 'LEFT' : 'RIGHT';
  label.textContent = nearest ? `${side} · ${nearest.color.toUpperCase()} BEHIND` : `${side} · CLEAR`;
  mirror.classList.toggle('alert', Boolean(nearest && nearest.row >= -1));
  mirror.classList.toggle('player-signal', blinker === (direction < 0 ? 'left' : 'right'));
}

function renderMirrors() {
  renderMirror(leftMirrorCars, leftMirrorLabel, leftMirror, -1);
  renderMirror(rightMirrorCars, rightMirrorLabel, rightMirror, 1);
  const rearCars = traffic.filter(car => car.row < PLAYER_ROW);
  rearMirrorCars.replaceChildren(...rearCars.map(car => {
    const node = document.createElement('div');
    const closeness = Math.min(1, Math.max(0, (car.row + 4) / 4));
    node.className = `mirror-car ${car.color}`;
    node.style.left = `${[23, 50, 77][car.lane]}%`;
    node.style.top = `${85.25 - (car.row + 4) * 19.5}%`;
    node.style.transform = `translate(-50%,-50%) scale(${0.3 + closeness * .48})`;
    return node;
  }));
  const nearestRear = rearCars.sort((a, b) => b.row - a.row)[0];
  rearMirrorLabel.textContent = nearestRear ? `REAR · ${rearCars.length} CAR${rearCars.length === 1 ? '' : 'S'}` : 'REAR · CLEAR';
  rearMirror.classList.toggle('alert', Boolean(nearestRear && nearestRear.row >= -1));
}

function endRun(reason, state = 'CRASH') {
  gameOver = true;
  buttons.forEach(button => { button.disabled = true; });
  status.textContent = `${state} — ${reason} Run ended at ${formatTime(tripSeconds)}. Refresh to retry.`;
  recordRun(state, reason);
  failureKicker.textContent = state === 'ROUTE LOST' ? 'NAVIGATION FAILURE' : 'RUN ENDED';
  failureTitle.textContent = state;
  failureReason.textContent = reason;
  failureScreen.hidden = false;
  if (state === 'CRASH') showCrashReplay();
}

function gridSteps(vehicleSpeed) {
  if (vehicleSpeed >= 100) return 3;
  if (vehicleSpeed >= 80) return 2;
  return 1;
}

function playerAdvance() { return gridSteps(speed); }

function energyCostForSpeed(vehicleSpeed) {
  if (vehicleSpeed >= 100) return 8;
  if (vehicleSpeed >= 80) return 4;
  return 2;
}

function resolveEnergy(action) {
  const used = energyCostForSpeed(speed);
  const recovered = action === 'speed-down' ? 1 : 0;
  energy = Math.max(0, Math.min(100, energy - used + recovered));
  energyDisplay.textContent = energy;
  energyGauge.style.setProperty('--energy-angle', `${energy * 3}deg`);
  return { used, recovered };
}

function crossedRows(from, to) {
  const direction = Math.sign(to - from);
  const rows = [];
  for (let row = from + direction; direction && (direction > 0 ? row <= to : row >= to); row += direction) rows.push(row);
  return rows;
}

function movementCorridor(startLane, startRow, endLane, endRow) {
  const rows = [startRow, ...crossedRows(startRow, endRow)];
  const cells = new Set();
  rows.forEach(row => {
    cells.add(cellKey(startLane, row));
    cells.add(cellKey(endLane, row));
  });
  return cells;
}

function intentFor(car) {
  const intent = { ...car, move: gridSteps(car.speed), targetLane: car.lane };
  const behavior = NPC_BEHAVIOR[car.color];
  const roll = Math.random();
  if (car.color === 'blue' && roll < behavior.laneChange) {
    intent.targetLane = adjacentTrafficLane(car.lane);
    intent.behavior = 'normal lane change';
  }
  if (car.color === 'yellow' && roll < behavior.brake) {
    intent.move = 0;
    intent.behavior = 'hard brake';
  }
  if (car.color === 'red' && !isExitLane(lane) && roll < behavior.cutIn) {
    const directionToPlayer = Math.sign(lane - car.lane);
    const candidate = car.lane + directionToPlayer;
    if (directionToPlayer && trafficLaneIndices().includes(candidate)) {
      intent.targetLane = candidate;
      intent.behavior = 'cut-in';
    }
  }
  if (car.color === 'green' && roll < behavior.laneChange) {
    intent.targetLane = adjacentTrafficLane(car.lane);
    intent.behavior = 'fast lane change';
  }
  if (car.color === 'purple' && roll < behavior.unsignaledChange) {
    intent.targetLane = adjacentTrafficLane(car.lane);
    intent.behavior = 'unsignaled lane change';
  }
  return intent;
}

function previewNpcIntent(proposals) {
  const plannedSignals = new Map();
  const plannedBrakes = new Set();
  const debugEvents = [];

  proposals.forEach(proposal => {
    if (proposal.color === 'yellow' && proposal.move === 0) {
      plannedBrakes.add(proposal.id);
      debugEvents.push({ color: proposal.color, text: 'brake lights on — holding position' });
    }
    if (proposal.targetLane !== proposal.lane) {
      const direction = proposal.targetLane > proposal.lane ? 'right' : 'left';
      if (proposal.color === 'purple') {
        debugEvents.push({ color: proposal.color, text: `plans diagonal ${direction} — NO SIGNAL` });
      } else {
        plannedSignals.set(proposal.id, direction);
        debugEvents.push({ color: proposal.color, text: `signals ${direction} — lane change planned` });
      }
    }
  });

  if (debugEvents.length) {
    renderTraffic(plannedBrakes, plannedSignals);
    renderDebug(debugEvents, `TURN ${String(turn).padStart(2, '0')} · SIGNALING`);
    status.textContent = 'NPCs signal their planned moves…';
  }
}

function resolveTraffic(action, proposals = traffic.map(intentFor)) {
  const notes = [];
  const debugEvents = [];
  const brakingIds = new Set();
  const signalDirections = new Map();
  const playerMove = playerAdvance();
  const startingCells = occupied();
  const resolved = [];
  const playerCorridor = movementCorridor(playerStartLane, PLAYER_ROW, lane, PLAYER_ROW);
  const claimed = new Set(playerCorridor);

  proposals.sort((a, b) => a.row - b.row).forEach(proposal => {
    let targetRow = proposal.row - (playerMove - proposal.move);
    let targetLane = proposal.targetLane;
    let target = cellKey(targetLane, targetRow);
    let corridor = movementCorridor(proposal.lane, proposal.row, targetLane, targetRow);
    let rearSafetyBrake = false;

    // Rear traffic is dangerous information, not an unavoidable hit. A car
    // that would enter the player's simultaneous path from behind brakes at
    // the last safe cell instead of crashing into the player.
    const crossesPlayerFromBehind = proposal.row < PLAYER_ROW
      && [...corridor].some(cell => playerCorridor.has(cell) && cell !== cellKey(proposal.lane, proposal.row));
    if (crossesPlayerFromBehind) {
      rearSafetyBrake = true;
      targetLane = proposal.lane;
      targetRow = -1;
      target = cellKey(targetLane, targetRow);
      corridor = movementCorridor(proposal.lane, proposal.row, targetLane, targetRow);
      brakingIds.add(proposal.id);
      signalDirections.delete(proposal.id);
    }

    if (proposal.color === 'yellow' && proposal.move === 0) {
      brakingIds.add(proposal.id);
      notes.push('Yellow brakes hard.');
    }
    if (targetLane !== proposal.lane && proposal.color !== 'purple') {
      signalDirections.set(proposal.id, targetLane > proposal.lane ? 'right' : 'left');
    }
    if (proposal.color === 'red' && targetLane !== proposal.lane) notes.push('Red signals, then cuts in.');
    if (proposal.color === 'purple' && targetLane !== proposal.lane) notes.push('Purple changes lane without signaling.');

    // A lane-changing car reserves its full diagonal corridor. Intersecting
    // the player's simultaneous corridor is an immediate collision.
    if ([...corridor].some(cell => playerCorridor.has(cell) && cell !== cellKey(proposal.lane, proposal.row))) {
      debugEvents.push({ color: proposal.color, text: 'diagonal corridor intersects you — CRASH' });
      renderDebug(debugEvents, `TURN ${String(turn).padStart(2, '0')} · COLLISION`);
      captureReplayFrame({ crash: { color: proposal.color } });
      endRun(`${proposal.color.toUpperCase()} crossed your movement corridor.`);
      return;
    }

    const blockedByNpc = [...corridor].some(cell => cell !== cellKey(proposal.lane, proposal.row) && startingCells.has(cell));
    const conflictsWithReservation = [...corridor].some(cell => cell !== cellKey(proposal.lane, proposal.row) && claimed.has(cell));
    if (blockedByNpc || conflictsWithReservation) {
      targetRow = proposal.row;
      targetLane = proposal.lane;
      target = cellKey(targetLane, targetRow);
      corridor = movementCorridor(proposal.lane, proposal.row, targetLane, targetRow);
      signalDirections.delete(proposal.id);
      brakingIds.add(proposal.id);
      debugEvents.push({ color: proposal.color, text: `path reserved — brakes and holds ${gridPosition(proposal.lane, proposal.row)}` });
    } else if (rearSafetyBrake) {
      notes.push(`${proposal.color[0].toUpperCase()}${proposal.color.slice(1)} yields from behind.`);
      debugEvents.push({ color: proposal.color, text: `rear safety brake — holds ${gridPosition(targetLane, targetRow)}` });
    } else if (proposal.move === 0) {
      debugEvents.push({ color: proposal.color, text: `brake lights — holds ${gridPosition(proposal.lane, proposal.row)}` });
    } else if (targetRow > FAR_ROW) {
      debugEvents.push({ color: proposal.color, text: `${proposal.move} cells — exits the forward grid` });
    } else if (targetLane !== proposal.lane) {
      const direction = targetLane > proposal.lane ? 'right' : 'left';
      const signal = proposal.color === 'purple' ? 'NO SIGNAL' : 'signal on';
      debugEvents.push({ color: proposal.color, text: `diagonal ${direction} to ${gridPosition(targetLane, targetRow)} · ${signal}` });
    } else {
      debugEvents.push({ color: proposal.color, text: `${proposal.move} cell${proposal.move === 1 ? '' : 's'}: ${gridPosition(proposal.lane, proposal.row)} → ${gridPosition(targetLane, targetRow)}` });
    }

    if (!claimed.has(target) && targetRow >= REAR_ROW) {
      resolved.push({
        ...proposal,
        lane: targetLane,
        row: targetRow,
        signal: signalDirections.get(proposal.id) || null,
        braking: brakingIds.has(proposal.id)
      });
      corridor.forEach(cell => claimed.add(cell));
    }
  });

  if (gameOver) {
    renderTraffic(brakingIds, signalDirections);
    return;
  }

  traffic = resolved.filter(car => car.row >= REAR_ROW && car.row <= FAR_ROW + 1);
  let attempt = 0;
  while (traffic.filter(car => car.row > PLAYER_ROW).length < currentPhase().density && attempt < 14) {
    const color = randomColor();
    const regularLanes = trafficLaneIndices();
    const candidate = { id: `${color}-${turn}-${attempt}`, color, speed: NPC_BEHAVIOR[color].speed, lane: randomItem(regularLanes), row: FAR_ROW };
    if (!occupied().has(cellKey(candidate.lane, candidate.row))) traffic.push(candidate);
    attempt += 1;
  }

  if (Math.random() < .38 && traffic.filter(car => car.row < PLAYER_ROW).length < 2) {
    const color = randomItem(['green', 'purple', 'red']);
    const regularLanes = trafficLaneIndices();
    const candidate = { id: `${color}-rear-${turn}`, color, speed: NPC_BEHAVIOR[color].speed, lane: randomItem(regularLanes), row: -4 };
    if (!occupied().has(cellKey(candidate.lane, candidate.row))) traffic.push(candidate);
  }

  captureReplayFrame();
  renderTraffic(brakingIds, signalDirections, playerMove);
  renderDebug(debugEvents, `TURN ${String(turn).padStart(2, '0')} · RESOLVED`);
  const energyText = `Energy −${energyCostForSpeed(speed)}%${action === 'speed-down' ? ' +1% regen' : ''}.`;
  status.textContent = `${labels[action]} ${energyText} ${notes[0] || `Grid scrolls ${playerMove || '0'} cell${playerMove === 1 ? '' : 's'}.`}`;
}

function updateRouteNotice() {
  const event = routeEvent();
  const preview = routePreview();
  const notice = event || preview;
  routeNotice.className = `route-notice${notice ? ' active' : ''}${notice && !notice.required ? ' optional' : ''}`;
  const previewLaneIsOpen = preview && laneExtensions.some(extension => extension.routeKey === preview.routeKey);
  routeNotice.textContent = event
    ? event.text
    : (preview ? `${preview.label} · ${preview.side.toUpperCase()} EXIT LANE ${previewLaneIsOpen ? 'OPEN' : 'OPENS'} · ${preview.turnsAway} TURN${preview.turnsAway === 1 ? '' : 'S'}` : '');
}

function seedTrafficForPhase() {
  const spawned = [];
  const phase = currentPhase();
  const occupiedCells = new Set();
  let attempt = 0;
  while (spawned.length < phase.density && attempt < phase.density * 8) {
    const color = randomColor();
    const laneValue = Math.floor(Math.random() * phase.lanes);
    const row = randomItem([2, 3, 4, 5, 6, 7]);
    const key = cellKey(laneValue, row);
    if (!occupiedCells.has(key)) {
      occupiedCells.add(key);
      spawned.push({ id: `${phase.id}-${color}-${attempt}`, color, speed: NPC_BEHAVIOR[color].speed, lane: laneValue, row });
    }
    attempt += 1;
  }
  if (phaseIndex > 0 || Math.random() < .55) {
    ['purple', 'green'].forEach((color, index) => {
      spawned.push({ id: `${phase.id}-rear-${color}`, color, speed: NPC_BEHAVIOR[color].speed, lane: Math.floor(Math.random() * phase.lanes), row: -3 - index });
    });
  }
  return spawned;
}

function enterPhase(index) {
  const oldLaneCount = laneCount();
  phaseIndex = index;
  phaseTurn = 1;
  laneExtensions = [];
  const newLaneCount = laneCount();
  lane = oldLaneCount === 1 ? 0 : Math.round(lane / (oldLaneCount - 1) * (newLaneCount - 1));
  playerStartLane = lane;
  traffic = seedTrafficForPhase();
  lastDebugEvents = [];
  captureReplayFrame();
  renderDebug([{ color: 'system', text: `${currentPhase().label} begins · ${newLaneCount} lanes active.` }], `${currentPhase().label} · START`);
  beginTurn();
}

function completeRun() {
  gameOver = true;
  buttons.forEach(button => { button.disabled = true; });
  recordRun('BUSAN REACHED', 'Reached Busan.');
  routeNotice.className = 'route-notice active optional';
  routeNotice.textContent = 'BUSAN REACHED · RUN COMPLETE';
  status.textContent = `BUSAN REACHED — ${formatTime(tripSeconds)} · ${energy}% energy remaining.`;
}

function continueRun() {
  const phase = currentPhase();
  if (phaseIndex === phases.length - 1 && phaseTurn === phase.turns) {
    completeRun();
    return;
  }
  turn += 1;
  phaseTurn += 1;
  if (phaseTurn > phase.turns) {
    enterPhase(phaseIndex + 1);
    return;
  }
  beginTurn();
}

function takeRouteExit(event) {
  if (event.type === 'charge') {
    energy = Math.min(100, energy + 30);
    energyDisplay.textContent = energy;
    energyGauge.style.setProperty('--energy-angle', `${energy * 3}deg`);
    status.textContent = 'Charging stop complete — +30% energy.';
    window.setTimeout(continueRun, 500);
    return;
  }
  const nextPhase = event.type === 'highway' ? 2 : 3;
  status.textContent = `${event.type === 'highway' ? 'Highway' : 'Busan'} exit taken.`;
  window.setTimeout(() => enterPhase(nextPhase), 500);
}

function choose(action) {
  if (!gameStarted || locked || gameOver) return;
  locked = true;
  playerStartLane = lane;
  document.querySelector(`[data-action="${action}"]`).classList.add('active');
  choiceLog.push({ phase: currentPhase().label, turn: String(phaseTurn).padStart(2, '0'), action: document.querySelector(`[data-action="${action}"] span`).textContent });
  const event = routeEvent();
  const takingExit = Boolean(event && action === exitAction(event) && lane === exitLaneIndex(event));

  if (event && event.required && !takingExit) {
    endRun(event.type === 'highway' ? 'Missed the final highway entrance.' : 'Missed the Busan exit.', 'ROUTE LOST');
    return;
  }

  // A player signal is deliberate and stays on through the entire turn and
  // the following decision window. Any new choice clears it unless that
  // choice is the other (or same) blinker.
  blinker = action === 'blink-left' ? 'left' : action === 'blink-right' ? 'right' : null;

  if (action === 'speed-up') speed = Math.min(100, speed + 20);
  if (action === 'speed-down') speed = Math.max(20, speed - 20);

  if (action === 'lane-left' || action === 'lane-right') {
    const targetLane = Math.max(0, Math.min(laneCount() - 1, lane + (action === 'lane-left' ? -1 : 1)));
    if (targetLane !== lane && occupied().has(cellKey(targetLane, PLAYER_ROW))) {
      const blockingCar = traffic.find(car => car.lane === targetLane && car.row === PLAYER_ROW);
      captureReplayFrame({ crash: { color: blockingCar?.color || 'NPC' } });
      endRun(`You moved into an occupied ${laneName(targetLane)} cell.`);
      return;
    }
    lane = targetLane;
  }

  speedDisplay.textContent = speed;
  renderMirrors();
  const energyChange = resolveEnergy(action);
  if (energy <= 0) {
    renderDebug([{ color: 'system', text: `Energy −${energyChange.used}% — battery depleted before traffic resolves.` }], `TURN ${String(turn).padStart(2, '0')} · POWER DOWN`);
    endRun('Battery depleted.', 'POWER DOWN');
    return;
  }
  if (takingExit) {
    takeRouteExit(event);
    return;
  }
  status.textContent = 'All traffic is moving…';
  window.setTimeout(() => {
    // NPCs reveal an intended lane change before they move. The actual grid
    // resolution remains simultaneous: once the brief signal beat ends, the
    // player and every NPC shift in the same frame.
    const proposals = traffic.map(intentFor);
    previewNpcIntent(proposals);
    window.setTimeout(() => {
      renderPlayerLane();
      resolveTraffic(action, proposals);
      if (!gameOver) window.setTimeout(continueRun, 1250);
    }, 560);
  }, 80);
}

function beginTurn() {
  if (gameOver) return;
  locked = false;
  remaining = 5;
  buttons.forEach(button => button.classList.remove('active'));
  const preview = routePreview();
  const routeInView = [routeEvent(), preview].filter(Boolean);
  laneExtensions
    .filter(extension => !routeInView.some(route => route.routeKey === extension.routeKey))
    .forEach(collapseExitLane);
  if (preview && preview.turnsAway === 2) extendRoadForRoute(preview);
  phaseLabel.childNodes[0].textContent = `${currentPhase().label} `;
  turnLabel.textContent = `${String(phaseTurn).padStart(2, '0')} / ${String(currentPhase().turns).padStart(2, '0')}`;
  const event = routeEvent();
  status.textContent = event
    ? `${event.required ? 'Mandatory' : 'Optional'} exit ahead. Move to the ${event.side} exit lane and press ${event.key}.`
    : `${currentPhase().label} ${phaseTurn}/${currentPhase().turns}: choose an action. Press 1–7.`;
  updateRouteNotice();
  renderTraffic();
  renderPlayerLane();
  if (!lastDebugEvents.length) renderDebug([{ color: 'system', text: 'Waiting for player input. NPC plans resolve together.' }]);
}

buttons.forEach(button => button.addEventListener('click', () => choose(button.dataset.action)));
restartRun.addEventListener('click', () => window.location.reload());
replayToggle.addEventListener('click', () => {
  if (replayTimer) {
    stopReplay();
    replayToggle.textContent = 'Resume replay';
    return;
  }
  if (replayIndex >= replayFrames.length - 1) {
    replayIndex = 0;
    replayProgress = 0;
  }
  drawReplayFrame();
  playReplay();
});
replayScrubber.addEventListener('input', () => {
  stopReplay();
  replayIndex = Number(replayScrubber.value);
  replayProgress = 0;
  drawReplayFrame();
  replayToggle.textContent = 'Resume replay';
});
startGame.addEventListener('click', () => {
  gameStarted = true;
  replayFrames = [];
  replayIndex = 0;
  replayProgress = 0;
  stopReplay();
  crashReplay.hidden = true;
  traffic = seedTrafficForPhase();
  captureReplayFrame();
  renderDebug([{ color: 'system', text: 'Random traffic seeded. Each NPC will roll behavior independently.' }], 'TURN 01 · RANDOMIZED');
  mainMenu.hidden = true;
  beginTurn();
});
clearRunLog.addEventListener('click', () => {
  try { window.localStorage.removeItem(RUN_LOG_KEY); } catch { /* local storage may be unavailable */ }
  renderLeaderboard();
});
window.addEventListener('keydown', event => {
  if (!gameStarted && event.key === 'Enter') startGame.click();
  if (gameStarted && /^[1-7]$/.test(event.key)) buttons[Number(event.key) - 1].click();
  if ((event.key === 'r' || event.key === 'R') && gameOver) window.location.reload();
});
window.addEventListener('road3d-ready', () => {
  renderTraffic();
  renderPlayerLane();
});

renderLeaderboard();
window.setInterval(() => {
  if (!gameStarted) return;
  tripSeconds += 0.1;
  tripTime.textContent = formatTime(tripSeconds);
  if (!locked && !gameOver) {
    remaining = Math.max(0, remaining - 0.1);
    decisionTime.textContent = remaining.toFixed(1);
    if (remaining <= 0) {
      status.textContent = 'Time expired — maintaining lane and speed.';
      choose('nothing');
    }
  }
}, 100);
