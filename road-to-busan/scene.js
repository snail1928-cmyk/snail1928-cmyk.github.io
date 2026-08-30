import * as THREE from 'https://unpkg.com/three@0.169.0/build/three.module.js';

const canvas = document.querySelector('#driving-canvas');
const roadView = document.querySelector('.road-view');
const mirrorCanvases = {
  rear: document.querySelector('#rear-mirror-canvas'),
  left: document.querySelector('#left-mirror-canvas'),
  right: document.querySelector('#right-mirror-canvas')
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x15212c, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x15212c, 28, 125);

const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 180);
camera.position.set(0, 1.38, 1.15);

function createMirrorView(canvasElement, fieldOfView) {
  const mirrorRenderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
  mirrorRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.3));
  mirrorRenderer.setClearColor(0x0b1017, 1);
  mirrorRenderer.outputColorSpace = THREE.SRGBColorSpace;
  return { renderer: mirrorRenderer, camera: new THREE.PerspectiveCamera(fieldOfView, 1, .1, 180) };
}

const mirrorViews = {
  rear: createMirrorView(mirrorCanvases.rear, 46),
  left: createMirrorView(mirrorCanvases.left, 60),
  right: createMirrorView(mirrorCanvases.right, 60)
};
mirrorViews.left.camera.layers.enable(1);
mirrorViews.right.camera.layers.enable(1);

scene.add(new THREE.HemisphereLight(0xbde3ff, 0x101820, 2.2));
const headlight = new THREE.DirectionalLight(0xdceeff, 1.8);
headlight.position.set(5, 10, 6);
scene.add(headlight);

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(26, 300),
  new THREE.MeshStandardMaterial({ color: 0x263642, roughness: 0.94, metalness: 0 })
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -5);
scene.add(road);

// Ground beyond the shoulder gives side mirrors a readable roadside instead
// of making their reflected road appear to float in an empty background.
const terrain = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 300),
  new THREE.MeshStandardMaterial({ color: 0x1c302b, roughness: 1 })
);
terrain.rotation.x = -Math.PI / 2;
terrain.position.set(0, -.035, -5);
scene.add(terrain);

const shoulderMaterial = new THREE.MeshStandardMaterial({ color: 0x131f2a, roughness: 1 });
[-14.5, 14.5].forEach(x => {
  const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(3, 300), shoulderMaterial);
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.set(x, .002, -5);
  scene.add(shoulder);
});

const gridMaterial = new THREE.LineBasicMaterial({ color: 0xaed9ef, transparent: true, opacity: 0.42 });
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xd7f1ff, transparent: true, opacity: 0.66 });
const roadGrid = new THREE.Group();
scene.add(roadGrid);
function roadLine(points, material = gridMaterial) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, .025, z)));
  roadGrid.add(new THREE.Line(geometry, material));
}

[-6, -2, 2, 6].forEach((x, index) => roadLine([[x, 140], [x, -142]], index === 0 || index === 3 ? edgeMaterial : gridMaterial));
[-7, -15, -24, -35, -48, -64, -82, -103, -127].forEach(z => roadLine([[-6, z], [6, z]]));
 [7, 15, 24, 35, 48, 64, 82, 103, 127].forEach(z => roadLine([[-6, z], [6, z]]));

const laneX = [-4, 0, 4];
const rowDistance = [0, 10, 18, 28, 40, 54, 70, 88];
const colorMap = { blue: 0x227ec7, red: 0xcf3444, yellow: 0xd9a728, green: 0x2e9560, purple: 0x8952c7 };
const cars = new Map();
let targetCameraX = 0;
let sceneLaneCount = 3;
let laneSurfaces = [];
let activePhase = null;
let activeRouteKey = null;
let sceneryTravelRemaining = 0;

const phaseScenery = new THREE.Group();
const routeFeature = new THREE.Group();
scene.add(phaseScenery, routeFeature);

function lanePositions(count) {
  return Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * 4);
}

function refreshRoadLayout(laneCount) {
  sceneLaneCount = laneCount;
  roadGrid.clear();
  const positions = lanePositions(laneCount);
  const halfWidth = laneCount * 2;
  const boundaries = Array.from({ length: laneCount + 1 }, (_, index) => -halfWidth + index * 4);
  boundaries.forEach((x, index) => roadLine([[x, 140], [x, -142]], index === 0 || index === boundaries.length - 1 ? edgeMaterial : gridMaterial));
  [-7, -15, -24, -35, -48, -64, -82, -103, -127, 7, 15, 24, 35, 48, 64, 82, 103, 127].forEach(z => roadLine([[-halfWidth, z], [halfWidth, z]]));

  laneSurfaces.forEach(surface => scene.remove(surface));
  laneSurfaces = positions.map(x => {
    const laneSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(3.86, 299),
      new THREE.MeshStandardMaterial({ color: 0x273946, roughness: .96, metalness: 0 })
    );
    laneSurface.rotation.x = -Math.PI / 2;
    laneSurface.position.set(x, .012, -5);
    scene.add(laneSurface);
    return laneSurface;
  });
}

refreshRoadLayout(sceneLaneCount);

function addTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(.16 * scale, .22 * scale, 1.5 * scale, 6),
    new THREE.MeshStandardMaterial({ color: 0x5c4430, roughness: 1 })
  );
  trunk.position.y = .75 * scale;
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(.95 * scale, 3.2 * scale, 7),
    new THREE.MeshStandardMaterial({ color: 0x1e6045, roughness: 1 })
  );
  foliage.position.y = 2.45 * scale;
  tree.add(trunk, foliage);
  tree.position.set(x, 0, z);
  phaseScenery.add(tree);
}

function addBuilding(x, z, height, width = 4) {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, width * .78),
    new THREE.MeshStandardMaterial({ color: 0x324b5d, emissive: 0x0b1825, emissiveIntensity: .35, roughness: .82 })
  );
  building.position.set(x, height / 2, z);
  phaseScenery.add(building);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width * 1.05, .22, width * .84),
    new THREE.MeshStandardMaterial({ color: 0x6c8291, roughness: .85 })
  );
  roof.position.set(x, height + .1, z);
  phaseScenery.add(roof);
}

function addSeagull(x, y, z, scale = 1) {
  const wing = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.4 * scale, 0, 0), new THREE.Vector3(0, .38 * scale, 0), new THREE.Vector3(1.4 * scale, 0, 0)
  ]);
  const gull = new THREE.Line(wing, new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: .9 }));
  gull.position.set(x, y, z);
  phaseScenery.add(gull);
}

function setPhaseScenery(phase) {
  if (!phase || phase === activePhase) return;
  activePhase = phase;
  phaseScenery.clear();
  const style = {
    'city-1': { sky: 0x18293b, fog: 0x18293b, road: 0x2b3d4c, land: 0x25323c },
    'city-2': { sky: 0x40505a, fog: 0x40505a, road: 0x34434c, land: 0x395041 },
    highway: { sky: 0x56676b, fog: 0x56676b, road: 0x3b474d, land: 0x31533f },
    busan: { sky: 0x66899e, fog: 0x66899e, road: 0x465257, land: 0x416d67 }
  }[phase];
  renderer.setClearColor(style.sky, 1);
  mirrorViews.left.renderer.setClearColor(style.sky, 1);
  mirrorViews.right.renderer.setClearColor(style.sky, 1);
  scene.fog.color.setHex(style.fog);
  road.material.color.setHex(style.road);
  terrain.material.color.setHex(style.land);

  if (phase === 'city-1') {
    [-1, 1].forEach(side => {
      [18, 35, 57, 82, 112].forEach((distance, index) => addBuilding(side * (12 + (index % 2) * 3), -distance, 12 + (index % 3) * 7, 4 + (index % 2)));
    });
  } else if (phase === 'city-2') {
    [-1, 1].forEach(side => {
      [25, 62, 104].forEach((distance, index) => addBuilding(side * (12.5 + index), -distance, 8 + index * 3, 4));
      [14, 34, 48, 78, 94, 120].forEach((distance, index) => addTree(side * (10.5 + (index % 3) * 2.3), -distance, .75 + (index % 2) * .18));
    });
  } else if (phase === 'highway') {
    [-1, 1].forEach(side => [12, 24, 39, 55, 73, 94, 118, 142].forEach((distance, index) => addTree(side * (13 + (index % 3) * 2.5), -distance, .7 + (index % 3) * .15)));
  } else if (phase === 'busan') {
    [-1, 1].forEach(side => [22, 50, 84, 118].forEach((distance, index) => addTree(side * (13 + (index % 2) * 2), -distance, .7 + (index % 2) * .1)));
    [[-11, 8, -35, .9], [2, 10, -56, 1.1], [12, 7, -73, .72], [-4, 12, -92, .66], [8, 5.5, -28, .5]].forEach(args => addSeagull(...args));
  }
}

function makeRouteSign(label, color) {
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 320;
  signCanvas.height = 118;
  const context = signCanvas.getContext('2d');
  context.fillStyle = '#10202a';
  context.fillRect(0, 0, 320, 118);
  context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.lineWidth = 8;
  context.strokeRect(5, 5, 310, 108);
  context.fillStyle = '#f8fafc';
  context.font = 'bold 34px system-ui';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 160, 59);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(signCanvas), transparent: true }));
  sprite.scale.set(6.2, 2.3, 1);
  return sprite;
}

function setRouteFeature(routes, laneCount) {
  const visibleRoutes = Array.isArray(routes) ? routes.filter(Boolean) : (routes ? [routes] : []);
  const routeKey = visibleRoutes.length ? `${laneCount}:${visibleRoutes.map(route => `${route.routeKey}-${route.side}`).join('|')}` : 'none';
  if (routeKey === activeRouteKey) return;
  activeRouteKey = routeKey;
  routeFeature.clear();
  routeFeature.position.z = 0;
  if (!visibleRoutes.length) return;

  const roadEdge = laneCount * 2;
  visibleRoutes.forEach(route => {
    const direction = route.side === 'left' ? -1 : 1;
    const accent = route.type === 'charge' ? 0x22d3ee : route.type === 'busan' ? 0x86efac : 0xfacc15;
    const label = route.type === 'charge' ? 'CHARGE  →' : route.type === 'busan' ? 'BUSAN  →' : 'HIGHWAY  →';
    const exitShape = new THREE.Shape();
    exitShape.moveTo(direction * roadEdge, 10);
    exitShape.lineTo(direction * (roadEdge + 2.2), 10);
    exitShape.lineTo(direction * (roadEdge + 16), 76);
    exitShape.lineTo(direction * (roadEdge + 10), 76);
    exitShape.closePath();
    const ramp = new THREE.Mesh(
      new THREE.ShapeGeometry(exitShape),
      new THREE.MeshStandardMaterial({ color: 0x263941, roughness: .96 })
    );
    ramp.rotation.x = -Math.PI / 2;
    ramp.position.y = .018;
    routeFeature.add(ramp);

    const rampEdge = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(direction * (roadEdge + 1.1), .05, -12), new THREE.Vector3(direction * (roadEdge + 13), .05, -73)
      ]),
      new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: .9 })
    );
    routeFeature.add(rampEdge);
    const sign = makeRouteSign(label, accent);
    sign.position.set(direction * (roadEdge + 7.5), 4.2, -37);
    routeFeature.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(.16, 5.2, .16), new THREE.MeshStandardMaterial({ color: 0x9aaeba, roughness: .7 }));
    post.position.set(direction * (roadEdge + 7.5), 2.6, -37);
    routeFeature.add(post);
  });
}

function lampMaterial(color, intensity) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .34 });
}

function setLampState(mesh, { on, activeColor, inactiveColor, intensity }) {
  mesh.material.color.setHex(on ? activeColor : inactiveColor);
  mesh.material.emissive.setHex(on ? activeColor : inactiveColor);
  mesh.material.emissiveIntensity = on ? intensity : .06;
}

function createMirrorNpc(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.15, .62, 2.85),
    new THREE.MeshStandardMaterial({ color: colorMap[color], roughness: .5, metalness: .08 })
  );
  body.position.y = .44;
  const windscreen = new THREE.Mesh(
    new THREE.BoxGeometry(1.58, .48, 1.26),
    new THREE.MeshStandardMaterial({ color: 0x9ccfe0, roughness: .2, metalness: .18 })
  );
  windscreen.position.set(0, .92, -.25);
  const headlampLeft = new THREE.Mesh(new THREE.BoxGeometry(.42, .16, .08), lampMaterial(0xf4fbff, 3.6));
  const headlampRight = headlampLeft.clone();
  headlampLeft.position.set(-.67, .57, -1.46);
  headlampRight.position.set(.67, .57, -1.46);
  const blinkerLeft = new THREE.Mesh(new THREE.BoxGeometry(.36, .12, .08), lampMaterial(0x4a3105, .06));
  const blinkerRight = blinkerLeft.clone();
  blinkerRight.material = blinkerLeft.material.clone();
  blinkerLeft.position.set(-.67, .31, -1.46);
  blinkerRight.position.set(.67, .31, -1.46);
  group.add(body, windscreen, headlampLeft, headlampRight, blinkerLeft, blinkerRight);
  group.userData = { blinkerLeft, blinkerRight };
  return group;
}

function createControlledSideMirror(side) {
  const mirrorScene = new THREE.Scene();
  mirrorScene.background = new THREE.Color(0x1a2b35);
  mirrorScene.fog = new THREE.Fog(0x1a2b35, 23, 78);
  mirrorScene.add(new THREE.HemisphereLight(0xc7ebff, 0x111a20, 2.35));
  const light = new THREE.DirectionalLight(0xe1f3ff, 1.45);
  light.position.set(4, 8, -3);
  mirrorScene.add(light);
  const reflectionWorld = new THREE.Group();
  mirrorScene.add(reflectionWorld);

  // This is a deliberately composed reflection, not a flipped forward
  // camera. The player body stays at the outside edge, the current lane is
  // a narrow context strip, and the adjacent lane owns the usable view.
  // The mirror camera looks rearward, which reverses screen X. Keep this
  // world direction so the left mirror renders the player body on screen-left
  // and the right mirror renders it on screen-right.
  const direction = side === 'left' ? 1 : -1;
  const currentLaneWidth = 2.35;
  const adjacentLaneWidth = 7.35;
  const currentLaneX = direction * 3.75;
  const adjacentLaneX = direction * -1.1;
  const dividerX = direction * 2.58;
  const laneMaterial = new THREE.MeshStandardMaterial({ color: 0x314957, roughness: .96 });
  const currentLaneMaterial = new THREE.MeshStandardMaterial({ color: 0x476d7d, roughness: .96 });
  const adjacentLane = new THREE.Mesh(new THREE.PlaneGeometry(adjacentLaneWidth, 92), laneMaterial);
  adjacentLane.rotation.x = -Math.PI / 2;
  adjacentLane.position.set(adjacentLaneX, 0, 36);
  reflectionWorld.add(adjacentLane);
  const currentLane = new THREE.Mesh(new THREE.PlaneGeometry(currentLaneWidth, 92), currentLaneMaterial);
  currentLane.rotation.x = -Math.PI / 2;
  currentLane.position.set(currentLaneX, 0, 36);
  reflectionWorld.add(currentLane);

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xdaf5ff });
  const gridLineMaterial = new THREE.LineBasicMaterial({ color: 0xd7f4ff, transparent: true, opacity: .72 });
  const gridBarMaterial = new THREE.MeshBasicMaterial({ color: 0xbfe9f6, transparent: true, opacity: .66 });
  const roadDashes = [];
  for (let z = 6; z < 80; z += 8) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(.16, .035, 3.5), lineMaterial);
    dash.position.set(dividerX, .025, z);
    reflectionWorld.add(dash);
    roadDashes.push(dash);
  }
  [-5, 5].forEach(x => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(.14, .035, 92), lineMaterial);
    edge.position.set(x, .025, 36);
    reflectionWorld.add(edge);
  });

  // Mirror grid: the cell structure is intentionally visible here so a
  // player can read the NPC positions behind them, just as on the road.
  [dividerX].forEach(x => {
    const divider = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, .04, 0), new THREE.Vector3(x, .04, 92)]),
      gridLineMaterial
    );
    reflectionWorld.add(divider);
  });
  const mirrorGridRows = [5, 14, 24, 35, 48, 64, 80];
  mirrorGridRows.forEach(z => {
    const row = new THREE.Mesh(new THREE.BoxGeometry(10, .045, .11), gridBarMaterial);
    row.position.set(0, .04, z);
    reflectionWorld.add(row);
    roadDashes.push(row);
  });

  // The opaque side/body fragment belongs to the mirror scene itself. It is
  // purposefully substantial enough to read as the player car, never as a
  // transparent white sliver.
  const playerCar = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.45, .82, 5.7),
    new THREE.MeshStandardMaterial({ color: 0xd6e0e4, roughness: .3, metalness: .28, transparent: false, opacity: 1 })
  );
  body.position.y = .58;
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(2.15, .5, 2.65),
    new THREE.MeshStandardMaterial({ color: 0x162a35, roughness: .17, metalness: .38, transparent: false, opacity: 1 })
  );
  window.position.set(0, 1.2, 1.2);
  const doorLine = new THREE.Mesh(new THREE.BoxGeometry(2.48, .035, .08), new THREE.MeshStandardMaterial({ color: 0x314a56, roughness: .6 }));
  doorLine.position.set(0, .63, -.2);
  playerCar.add(body, window, doorLine);
  playerCar.position.set(direction * 4.15, .01, 2.4);
  mirrorScene.add(playerCar);

  const camera = mirrorViews[side].camera;
  camera.position.set(0, 1.85, -5.2);
  camera.lookAt(0, -2.1, 31);
  return {
    scene: mirrorScene,
    world: reflectionWorld,
    cars: new Map(),
    currentLaneX,
    adjacentLaneX,
    roadDashes,
    travelRemaining: 0,
    lateralOffset: 0,
    lateralTarget: 0,
    lastPlayerLane: null
  };
}

const controlledSideMirrors = {
  left: createControlledSideMirror('left'),
  right: createControlledSideMirror('right')
};

function updateControlledSideMirror(side, traffic, playerLane, signals, travelSteps = 0) {
  const mirror = controlledSideMirrors[side];
  mirror.travelRemaining += travelSteps * 5;
  if (mirror.lastPlayerLane !== null && mirror.lastPlayerLane !== playerLane) {
    // A lane change moves the reflected world sideways; the player-car
    // fragment stays attached to the mirror edge, as it would in a real car.
    const laneDelta = playerLane - mirror.lastPlayerLane;
    mirror.lateralTarget += laneDelta * (side === 'left' ? 2.1 : -2.1);
  }
  mirror.lastPlayerLane = playerLane;
  const adjacentLane = playerLane + (side === 'left' ? -1 : 1);
  const visible = traffic.filter(car => car.row < 0 && car.row >= -4 && (car.lane === playerLane || car.lane === adjacentLane));
  const visibleIds = new Set();
  visible.forEach(car => {
    visibleIds.add(car.id);
    let mirrorCar = mirror.cars.get(car.id);
    if (!mirrorCar) {
      mirrorCar = createMirrorNpc(car.color);
      mirror.cars.set(car.id, mirrorCar);
      mirror.world.add(mirrorCar);
    }
    const laneX = car.lane === playerLane ? mirror.currentLaneX : mirror.adjacentLaneX;
    const targetPosition = new THREE.Vector3(laneX, .02, rowDistance[Math.abs(car.row)] || 10);
    if (!mirrorCar.userData.target) {
      mirrorCar.position.copy(targetPosition);
      mirrorCar.userData.target = targetPosition;
    } else {
      mirrorCar.userData.target.copy(targetPosition);
    }
    const signal = signals[car.id] || car.signal;
    const blinkOn = Math.floor(performance.now() / 460) % 2 === 0 ? 4.8 : .45;
    setLampState(mirrorCar.userData.blinkerLeft, { on: signal === 'left', activeColor: 0xffbe18, inactiveColor: 0x4a3105, intensity: blinkOn });
    setLampState(mirrorCar.userData.blinkerRight, { on: signal === 'right', activeColor: 0xffbe18, inactiveColor: 0x4a3105, intensity: blinkOn });
  });
  mirror.cars.forEach((mirrorCar, id) => {
    if (!visibleIds.has(id)) {
      mirror.world.remove(mirrorCar);
      mirror.cars.delete(id);
    }
  });
}

function createCar(car) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.65, .72, 3.55),
    new THREE.MeshStandardMaterial({ color: colorMap[car.color], roughness: .52, metalness: .08 })
  );
  body.position.y = .54;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.02, .72, 1.7),
    new THREE.MeshStandardMaterial({ color: 0xa8d4e8, roughness: .2, metalness: .22 })
  );
  cabin.position.set(0, 1.2, -.35);
  group.add(cabin);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(.72, .2, .06), new THREE.MeshStandardMaterial({ color: 0xdde7ef }));
  plate.position.set(0, .45, 1.81);
  group.add(plate);

  // The player sees tail lamps on the road ahead; the side/rear mirrors see
  // approaching traffic from its front, so every NPC needs readable headlamps.
  const headlampLeft = new THREE.Mesh(new THREE.BoxGeometry(.5, .22, .08), lampMaterial(0xeaf8ff, 2.6));
  const headlampRight = headlampLeft.clone();
  headlampLeft.position.set(-.83, .72, -1.81);
  headlampRight.position.set(.83, .72, -1.81);
  group.add(headlampLeft, headlampRight);

  const stopLeft = new THREE.Mesh(new THREE.BoxGeometry(.54, .28, .09), lampMaterial(0x4c0610, .1));
  const stopRight = stopLeft.clone();
  stopRight.material = stopLeft.material.clone();
  stopLeft.position.set(-.83, .72, 1.81);
  stopRight.position.set(.83, .72, 1.81);
  group.add(stopLeft, stopRight);

  const blinkerLeft = new THREE.Mesh(new THREE.BoxGeometry(.52, .19, .09), lampMaterial(0x4a3105, .06));
  const blinkerRight = blinkerLeft.clone();
  blinkerRight.material = blinkerLeft.material.clone();
  blinkerLeft.position.set(-.83, .38, 1.81);
  blinkerRight.position.set(.83, .38, 1.81);
  group.add(blinkerLeft, blinkerRight);

  group.userData = { stopLeft, stopRight, blinkerLeft, blinkerRight, target: new THREE.Vector3() };
  scene.add(group);
  return group;
}

function createMirrorPlayerCar() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.72, .76, 4.9),
    new THREE.MeshStandardMaterial({ color: 0xd9e5ea, roughness: .3, metalness: .22 })
  );
  body.position.y = .55;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.16, .72, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x162d39, roughness: .16, metalness: .35 })
  );
  cabin.position.set(0, 1.19, -.28);
  const rearGlass = new THREE.Mesh(
    new THREE.BoxGeometry(2.18, .48, .16),
    new THREE.MeshStandardMaterial({ color: 0x4d778a, roughness: .12, metalness: .38 })
  );
  rearGlass.position.set(0, 1.08, 1.02);
  group.add(body, cabin, rearGlass);
  group.traverse(object => object.layers.set(1));
  scene.add(group);
  return group;
}

const mirrorPlayerCar = createMirrorPlayerCar();
mirrorPlayerCar.scale.set(.72, .72, .72);

function updateCarLights(group, car, brakingIds, signals) {
  const braking = brakingIds.has(car.id);
  setLampState(group.userData.stopLeft, { on: braking, activeColor: 0xff2138, inactiveColor: 0x4c0610, intensity: 9 });
  setLampState(group.userData.stopRight, { on: braking, activeColor: 0xff2138, inactiveColor: 0x4c0610, intensity: 9 });
  const signal = signals[car.id] || car.signal;
  setLampState(group.userData.blinkerLeft, { on: signal === 'left', activeColor: 0xffbe18, inactiveColor: 0x4a3105, intensity: 10 });
  setLampState(group.userData.blinkerRight, { on: signal === 'right', activeColor: 0xffbe18, inactiveColor: 0x4a3105, intensity: 10 });
}

function update({ traffic, playerLane, laneCount = 3, phase = 'city-1', routes = [], brakingIds = [], signals = {}, travelSteps = 0 }) {
  if (laneCount !== sceneLaneCount) refreshRoadLayout(laneCount);
  setPhaseScenery(phase);
  setRouteFeature(routes, laneCount);
  sceneryTravelRemaining += travelSteps * 10;
  const activeLaneX = lanePositions(laneCount);
  targetCameraX = activeLaneX[playerLane];
  mirrorPlayerCar.position.z = 3.1;
  laneSurfaces.forEach((laneSurface, index) => {
    laneSurface.material.color.setHex(index === playerLane ? 0x31505e : 0x273946);
  });
  const braking = new Set(brakingIds);
  const activeIds = new Set();

  traffic.filter(car => car.row !== 0 && car.row >= -4 && car.row <= 7).forEach(car => {
    activeIds.add(car.id);
    let group = cars.get(car.id);
    if (!group) {
      group = createCar(car);
      cars.set(car.id, group);
      group.position.set(activeLaneX[car.lane], .02, car.row > 0 ? -rowDistance[car.row] : rowDistance[Math.abs(car.row)]);
    }
    group.userData.target.set(activeLaneX[car.lane], .02, car.row > 0 ? -rowDistance[car.row] : rowDistance[Math.abs(car.row)]);
    updateCarLights(group, car, braking, signals);
  });

  cars.forEach((group, id) => {
    if (!activeIds.has(id)) {
      scene.remove(group);
      cars.delete(id);
    }
  });
}

function advanceControlledMirrorRoad(mirror) {
  if (mirror.travelRemaining > .02) {
    const distance = Math.min(mirror.travelRemaining, Math.max(.1, mirror.travelRemaining * .15));
    mirror.travelRemaining -= distance;
    mirror.roadDashes.forEach(dash => {
      dash.position.z += distance;
      if (dash.position.z > 82) dash.position.z -= 76;
    });
  }
  mirror.lateralOffset = THREE.MathUtils.lerp(mirror.lateralOffset, 0, .075);
  mirror.lateralOffset = THREE.MathUtils.lerp(mirror.lateralOffset, mirror.lateralTarget, .11);
  mirror.lateralTarget = THREE.MathUtils.lerp(mirror.lateralTarget, 0, .045);
  mirror.world.position.x = mirror.lateralOffset;
  mirror.world.rotation.z = THREE.MathUtils.lerp(mirror.world.rotation.z, -mirror.lateralOffset * .028, .12);
  mirror.cars.forEach(car => {
    if (car.userData.target) car.position.lerp(car.userData.target, .11);
  });
}

function advanceScenery(distance) {
  phaseScenery.children.forEach(object => {
    const pace = object.type === 'Line' ? .42 : 1;
    object.position.z += distance * pace;
    if (object.position.z > 18) object.position.z -= object.type === 'Line' ? 145 : 160;
  });
  routeFeature.position.z += distance;
  roadGrid.position.z += distance;
  if (roadGrid.position.z > 20) roadGrid.position.z -= 20;
}

function resize() {
  const { width, height } = roadView.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  Object.values(mirrorViews).forEach(view => {
    const rect = view.renderer.domElement.getBoundingClientRect();
    view.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    view.camera.aspect = rect.width / Math.max(1, rect.height);
    view.camera.updateProjectionMatrix();
  });
}

function renderMirrorViews() {
  const playerX = camera.position.x;
  const views = mirrorViews;

  views.rear.camera.position.set(playerX, 1.25, .4);
  views.rear.camera.lookAt(playerX, .8, 52);
  views.rear.renderer.render(scene, views.rear.camera);
  // Real side-mirror cameras: both render the actual road world behind the
  // player from an outward rear-facing angle. The mirror-only player car is
  // on layer 1, invisible in the main driving view but visible here.
  // The mirror cameras sit beside the car's middle/rear section, rather than
  // ahead of it. Their eye line is level with the side mirror and points
  // outward and backward along the adjacent lane.
  views.left.camera.position.set(playerX - 1.56, .86, .86);
  views.left.camera.lookAt(playerX - 3.72, .78, 42);
  views.right.camera.position.set(playerX + 1.56, .86, .86);
  views.right.camera.lookAt(playerX + 3.72, .78, 42);
  views.left.renderer.render(scene, views.left.camera);
  views.right.renderer.render(scene, views.right.camera);
}

function frame() {
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCameraX, .09);
  // Keep the mirror-only body locked to the camera rig, not to the next lane
  // target. This prevents it jumping sideways one frame ahead of the mirror
  // camera while a lane change is being eased.
  mirrorPlayerCar.position.x = camera.position.x;
  camera.lookAt(camera.position.x, 1.05, -31);
  if (sceneryTravelRemaining > .02) {
    const distance = Math.min(sceneryTravelRemaining, Math.max(.18, sceneryTravelRemaining * .15));
    sceneryTravelRemaining -= distance;
    advanceScenery(distance);
  }
  cars.forEach(group => group.position.lerp(group.userData.target, .12));
  renderer.render(scene, camera);
  renderMirrorViews();
  requestAnimationFrame(frame);
}

new ResizeObserver(resize).observe(roadView);
resize();
frame();

window.road3d = { update };
document.documentElement.classList.add('three-ready');
window.dispatchEvent(new Event('road3d-ready'));
