// Friendly message when the required 3D library cannot load (usually because
// this computer has no internet access or a network filter blocks the CDN).
if (typeof THREE === 'undefined') {
  document.body.innerHTML = `
    <main style="font:16px/1.5 system-ui,Segoe UI,Arial,sans-serif;max-width:720px;margin:10vh auto;padding:28px;color:#e5e7eb;background:#111827;border:1px solid #374151;border-radius:14px">
      <h1 style="margin:0 0 12px">Layout Design Studio</h1>
      <p>The 3D viewer could not load its graphics library.</p>
      <p><strong>Check that this computer is connected to the internet</strong>, then reopen this HTML file in an up-to-date version of Chrome, Edge, Firefox, or Safari. If you are on a work network, its security filter may be blocking the library CDN.</p>
    </main>`;
  throw new Error('Three.js failed to load. Check internet access and CDN availability.');
}
// All custom asset data is stored in this HTML or in the project JSON. No network access is used.
let customAssetLibrary = [];
const customAssetCache = new Map();
let selectedCustomAssetId = null;
let currentProjectName = 'Warehouse Project';
let currentProjectVersion = '1.0';
function getProjectName() { const el = document.getElementById('project-name'); return (el?.value || currentProjectName || 'Warehouse Project').trim().slice(0,100) || 'Warehouse Project'; }
function getProjectVersion() { const el = document.getElementById('project-version'); return (el?.value || currentProjectVersion || '1.0').trim().slice(0,24) || '1.0'; }
function syncProjectMeta(name, version) { currentProjectName = String(name || 'Warehouse Project').slice(0,100); currentProjectVersion = String(version || '1.0').slice(0,24); const n=document.getElementById('project-name'); const v=document.getElementById('project-version'); if(n)n.value=currentProjectName; if(v)v.value=currentProjectVersion; document.title = `${currentProjectName} — Layout Design Studio v${currentProjectVersion}`; }

// ============================================================================
// PROJECT MODE  ('warehouse' | 'home')
// Saved in every project as  projectMode.  Missing/unknown values (all older
// projects) load as 'warehouse', so existing files behave exactly as before.
// NOTE: the URL/exe launch parameter ?mode= is already used for new/open/load,
// so this field is deliberately named "projectMode" (URL: ?projectmode=home).
// ============================================================================
const PROJECT_MODES = {
  warehouse: { label: 'Warehouse', defaultName: 'New Warehouse Project' },
  home:      { label: 'Home',      defaultName: 'New Home Layout' }
};
let currentProjectMode = 'warehouse';
function normalizeProjectMode(m) {
  m = String(m || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROJECT_MODES, m) ? m : 'warehouse';
}
function getProjectMode() { return currentProjectMode; }
function setProjectMode(m) {
  const next = normalizeProjectMode(m);
  const changed = next !== currentProjectMode;
  currentProjectMode = next;
  if (document.body) document.body.dataset.projectMode = next;   // CSS hook: body[data-project-mode="home"]
  if (changed) document.dispatchEvent(new CustomEvent('projectmodechange', { detail: { mode: next } }));
  return next;
}
window.getProjectMode = getProjectMode;
window.setProjectMode = setProjectMode;
window.addEventListener('DOMContentLoaded', () => { if (document.body) document.body.dataset.projectMode = currentProjectMode; });

try {
  const embeddedAssets = JSON.parse(document.getElementById('embedded-asset-library')?.textContent || '[]');
  if (Array.isArray(embeddedAssets)) customAssetLibrary = embeddedAssets;
} catch (e) { console.warn('Embedded asset library could not be read.', e); }
try {
  const embeddedProjectText = document.getElementById('embedded-project-json')?.textContent || 'null';
  window.__embeddedWarehouseProject = JSON.parse(embeddedProjectText);
  if (window.__embeddedWarehouseProject && Array.isArray(window.__embeddedWarehouseProject.bins)) {
    window.__INITIAL_PROJECT_DATA = window.__embeddedWarehouseProject;
  }
} catch (e) { window.__embeddedWarehouseProject = null; }

// ============================================================================
// 1. SCENE, CAMERA & ORBIT CONTROLS
//    Coordinate Mapping:
//    Warehouse X (0 to 36 ft) -> Three.js X (0 to 36)
//    Warehouse Y (0 to 44 ft, South to North) -> Three.js Z (44 down to 0)
//    Warehouse Elevation -> Three.js Y (up)
// ============================================================================

// ============================================================================
// WINDOWS FILE EXPLORER TOP-BAR & DROPDOWN DIRECTORY CONTROLLER
// ============================================================================
const EXPLORER_FOLDERS = {
  project: {
    id: 'project',
    icon: '',
    name: 'Project & File Manager',
    desc: 'Create, version, save, and export complete self-contained projects'
  },
  assets: {
    id: 'assets',
    icon: '',
    name: 'Equipment & Assets',
    desc: 'Click a tile to place that asset on the floor'
  },
  roof: {
    id: 'roof',
    icon: '',
    name: 'Overhead Roof Utilities',
    desc: 'Map and route electrical, gas, and compressed-air lines with vertical drops'
  },
  floor: {
    id: 'floor',
    icon: '',
    name: 'Floor, Walls & Perimeter Grid',
    desc: 'Resize room perimeter, adjust 1ft grid snaps, slices, and wall push/pull'
  },
  inspector: {
    id: 'inspector',
    icon: '',
    name: 'Selected Asset Inspector',
    desc: 'Inspect, coordinate, nudge, recolor, and configure the selected floor object'
  },
  environment: {
    id: 'environment',
    icon: '',
    name: 'Live Environment Controls',
    desc: 'Adjust Uline scissor lift heights and Gorbel crane swing arc'
  },
  library: {
    id: 'library',
    icon: '',
    name: 'Offline Custom 3D Library',
    desc: 'Import and place external OBJ, GLB, and glTF models locally'
  },
  camera: {
    id: 'camera',
    icon: '',
    name: 'Camera Studio & Photo Booth',
    desc: 'Multi-angle 3D views, eye-level walk, drone shots, and 4K photo exports'
  },
  export: {
    id: 'export',
    icon: '',
    name: 'CAD, BIM & Schedule Export Hub',
    desc: 'Export 2D AutoCAD DXF, 3D OBJ mesh, and itemized CSV Equipment Schedules'
  }
};

let currentExplorerFolder = null;
let explorerHistory = ['project'];
let explorerHistoryIndex = 0;

function updateNavButtons() {
  const btnBack = document.getElementById('exp-btn-back');
  const btnFwd = document.getElementById('exp-btn-fwd');
  if (btnBack) btnBack.disabled = (explorerHistoryIndex <= 0);
  if (btnFwd) btnFwd.disabled = (explorerHistoryIndex >= explorerHistory.length - 1);
}

function explorerNavBack() {
  if (explorerHistoryIndex > 0) {
    explorerHistoryIndex--;
    openFolder(explorerHistory[explorerHistoryIndex], false);
  }
}

function explorerNavForward() {
  if (explorerHistoryIndex < explorerHistory.length - 1) {
    explorerHistoryIndex++;
    openFolder(explorerHistory[explorerHistoryIndex], false);
  }
}

function openFolder(folderKey, addToHistory = true) {
  if (!EXPLORER_FOLDERS[folderKey]) return;
  const folder = EXPLORER_FOLDERS[folderKey];
  currentExplorerFolder = folderKey;

  if (addToHistory) {
    if (explorerHistoryIndex < explorerHistory.length - 1) {
      explorerHistory = explorerHistory.slice(0, explorerHistoryIndex + 1);
    }
    if (explorerHistory[explorerHistory.length - 1] !== folderKey) {
      explorerHistory.push(folderKey);
      explorerHistoryIndex = explorerHistory.length - 1;
    }
  }
  updateNavButtons();

  // Update ribbon tab active states
  document.querySelectorAll('.exp-tab').forEach(tab => {
    const isActive = (tab.getAttribute('data-folder') === folderKey);
    tab.classList.toggle('active', isActive);
  });

  // Update address bar breadcrumb
  const crumbIcon = document.getElementById('exp-crumb-icon');
  const crumbText = document.getElementById('exp-crumb-text');
  if (crumbIcon) crumbIcon.textContent = folder.icon;
  if (crumbText) crumbText.textContent = folder.name;

  // Update dropdown header
  const dropIcon = document.getElementById('exp-drop-icon');
  const dropTitle = document.getElementById('exp-drop-title');
  const dropDesc = document.getElementById('exp-drop-desc');
  if (dropIcon) dropIcon.textContent = folder.icon;
  if (dropTitle) dropTitle.textContent = folder.name;
  if (dropDesc) dropDesc.textContent = folder.desc;

  // If this panel is already islanded, focus the floating island instead of the docked drawer
  if (islandedPanels.has(folderKey)) {
    focusPanelIsland(folderKey);
    document.querySelectorAll('.exp-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-folder') === folderKey);
    });
    return;
  }

  // Activate corresponding pane (only panes still in the docked dropdown body)
  document.querySelectorAll('#explorer-dropdown-body > .explorer-pane').forEach(p => p.classList.remove('active'));
  const activePane = document.getElementById('pane-' + folderKey);
  if (activePane && activePane.parentElement && activePane.parentElement.id === 'explorer-dropdown-body') {
    activePane.classList.add('active');
  }

  // Show dropdown with smooth transition
  const dropdown = document.getElementById('explorer-dropdown');
  if (dropdown) dropdown.classList.remove('explorer-dropdown-hidden');
}

function closeFolderDrawer() {
  currentExplorerFolder = null;
  document.querySelectorAll('.exp-tab').forEach(tab => tab.classList.remove('active'));
  const dropdown = document.getElementById('explorer-dropdown');
  if (dropdown) dropdown.classList.add('explorer-dropdown-hidden');
}

function toggleFolder(folderKey) {
  if (currentExplorerFolder === folderKey) {
    closeFolderDrawer();
  } else {
    openFolder(folderKey);
  }
}

function selectFolderTab(folderKey) {
  toggleFolder(folderKey);
}

function toggleCurrentFolder() {
  if (currentExplorerFolder) closeFolderDrawer();
  else openFolder('assets');
}

// Close drawer on Escape key or outside canvas click
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // Prefer closing the front-most floating island first
  if (islandedPanels.size) {
    let topKey = null, topZ = -1;
    islandedPanels.forEach((rec, key) => {
      const z = Number(rec.el.style.zIndex) || 0;
      if (z >= topZ) { topZ = z; topKey = key; }
    });
    if (topKey) { closePanelIsland(topKey); return; }
  }
  if (currentExplorerFolder) closeFolderDrawer();
});

// Canvas click closes open folder drawer so user can immediately navigate in 3D
window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');
  if (container) {
    container.addEventListener('pointerdown', (e) => {
      if (currentExplorerFolder) {
        closeFolderDrawer();
      }
    });
  }
  updateNavButtons();
});

// ============================================================================
// FLOATING PANEL ISLANDS — detach any toolbar section so it does not block the view
// ============================================================================
const islandedPanels = new Map(); // folderKey -> { el, folderKey }
let islandZCounter = 90;
let islandDragState = null;
let islandResizeState = null;
let islandCascadeIndex = 0;

function getPaneHome() {
  return document.getElementById('explorer-dropdown-body');
}

function markIslandTabState(folderKey, islanded) {
  document.querySelectorAll(`.exp-tab[data-folder="${folderKey}"]`).forEach(tab => {
    tab.classList.toggle('is-islanded', !!islanded);
  });
}

function bringIslandToFront(el) {
  islandZCounter += 1;
  el.style.zIndex = String(islandZCounter);
  document.querySelectorAll('.panel-island').forEach(n => n.classList.remove('island-focused'));
  el.classList.add('island-focused');
}

function focusPanelIsland(folderKey) {
  const rec = islandedPanels.get(folderKey);
  if (!rec) return;
  bringIslandToFront(rec.el);
  // subtle flash
  rec.el.style.transition = 'box-shadow .2s ease, border-color .2s ease';
  rec.el.style.borderColor = 'rgba(250,204,21,.7)';
  setTimeout(() => { if (rec.el) rec.el.style.borderColor = ''; }, 450);
}

function dockPanelIsland(folderKey, { openAfter = true } = {}) {
  const rec = islandedPanels.get(folderKey);
  if (!rec) return;
  const home = getPaneHome();
  const pane = document.getElementById('pane-' + folderKey);
  if (home && pane) {
    home.appendChild(pane);
    pane.classList.remove('active');
  }
  rec.el.remove();
  islandedPanels.delete(folderKey);
  markIslandTabState(folderKey, false);
  if (openAfter) openFolder(folderKey);
}

function closePanelIsland(folderKey) {
  const rec = islandedPanels.get(folderKey);
  if (!rec) return;
  const home = getPaneHome();
  const pane = document.getElementById('pane-' + folderKey);
  if (home && pane) {
    home.appendChild(pane);
    pane.classList.remove('active');
  }
  rec.el.remove();
  islandedPanels.delete(folderKey);
  markIslandTabState(folderKey, false);
}

function islandCurrentPanel() {
  const folderKey = currentExplorerFolder;
  if (!folderKey) return;
  if (islandedPanels.has(folderKey)) {
    focusPanelIsland(folderKey);
    closeFolderDrawer();
    return;
  }
  const pane = document.getElementById('pane-' + folderKey);
  const home = getPaneHome();
  const host = document.getElementById('panel-islands-host');
  const folder = EXPLORER_FOLDERS[folderKey];
  if (!pane || !home || !host || !folder) return;

  // Build floating island chrome
  const island = document.createElement('div');
  island.className = 'panel-island island-focused';
  island.dataset.folder = folderKey;
  island.setAttribute('role', 'dialog');
  island.setAttribute('aria-label', folder.name + ' (floating)');

  const header = document.createElement('div');
  header.className = 'panel-island-header';
  header.innerHTML = `
    <div class="panel-island-title-group">
      <span class="panel-island-icon">${folder.icon || '📦'}</span>
      <div style="min-width:0">
        <div class="panel-island-title">${folder.name}</div>
        <div class="panel-island-sub">Floating island · drag header to move</div>
      </div>
    </div>
    <div class="panel-island-actions">
      <button type="button" class="island-dock" title="Dock back into the top toolbar">⤓ Dock</button>
      <button type="button" class="island-close" title="Close island">✕</button>
    </div>`;

  const body = document.createElement('div');
  body.className = 'panel-island-body';
  // Move live pane node so all controls/IDs keep working
  pane.classList.add('active');
  body.appendChild(pane);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'panel-island-resize';
  resizeHandle.title = 'Resize';

  island.append(header, body, resizeHandle);
  host.appendChild(island);

  // Cascade position so multiple islands don't stack perfectly
  const offset = (islandCascadeIndex % 6) * 28;
  islandCascadeIndex += 1;
  const startLeft = Math.min(window.innerWidth - 320, 24 + offset);
  const startTop = Math.min(window.innerHeight - 200, 90 + offset);
  island.style.left = startLeft + 'px';
  island.style.top = startTop + 'px';
  bringIslandToFront(island);

  islandedPanels.set(folderKey, { el: island, folderKey });
  markIslandTabState(folderKey, true);

  header.querySelector('.island-dock').addEventListener('click', (e) => {
    e.stopPropagation();
    dockPanelIsland(folderKey, { openAfter: true });
  });
  header.querySelector('.island-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closePanelIsland(folderKey);
  });

  header.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button')) return;
    e.preventDefault();
    bringIslandToFront(island);
    const rect = island.getBoundingClientRect();
    islandDragState = {
      el: island,
      ox: e.clientX - rect.left,
      oy: e.clientY - rect.top
    };
    header.setPointerCapture?.(e.pointerId);
  });

  resizeHandle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    bringIslandToFront(island);
    const rect = island.getBoundingClientRect();
    islandResizeState = {
      el: island,
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height
    };
    resizeHandle.setPointerCapture?.(e.pointerId);
  });

  island.addEventListener('pointerdown', () => bringIslandToFront(island));

  // Roll up the docked drawer so the island is the free-floating panel
  closeFolderDrawer();
}

window.addEventListener('pointermove', (e) => {
  if (islandDragState) {
    const { el, ox, oy } = islandDragState;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = e.clientX - ox;
    let top = e.clientY - oy;
    left = Math.max(4, Math.min(window.innerWidth - 48, left));
    top = Math.max(4, Math.min(window.innerHeight - 48, top));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }
  if (islandResizeState) {
    const { el, startX, startY, startW, startH } = islandResizeState;
    const newW = Math.max(280, Math.min(window.innerWidth - 16, startW + (e.clientX - startX)));
    const newH = Math.max(160, Math.min(window.innerHeight - 16, startH + (e.clientY - startY)));
    el.style.width = newW + 'px';
    el.style.height = newH + 'px';
    el.style.maxHeight = 'none';
  }
});
window.addEventListener('pointerup', () => {
  islandDragState = null;
  islandResizeState = null;
});
window.addEventListener('pointercancel', () => {
  islandDragState = null;
  islandResizeState = null;
});

document.getElementById('exp-drop-island')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  islandCurrentPanel();
});

window.openFolder = openFolder;
window.closeFolderDrawer = closeFolderDrawer;
window.toggleFolder = toggleFolder;
window.selectFolderTab = selectFolderTab;
window.toggleCurrentFolder = toggleCurrentFolder;
window.explorerNavBack = explorerNavBack;
window.explorerNavForward = explorerNavForward;
window.islandCurrentPanel = islandCurrentPanel;
window.dockPanelIsland = dockPanelIsland;
window.closePanelIsland = closePanelIsland;


const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f131a);

// Perspective & Orthographic Cameras
// Large far plane keeps floor/walls stable when zoomed out on big layouts.
const CAM_NEAR = 0.05;
const CAM_FAR = 12000;
const aspect = window.innerWidth / window.innerHeight;
const perspCam = new THREE.PerspectiveCamera(45, aspect, CAM_NEAR, CAM_FAR);
perspCam.position.set(37, 95, 85);

const orthoSize = 46;
const orthoCam = new THREE.OrthographicCamera(
  -orthoSize * aspect, orthoSize * aspect,
  orthoSize, -orthoSize, CAM_NEAR, CAM_FAR
);
orthoCam.position.set(37, 120, 5);

let activeCam = perspCam;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
  logarithmicDepthBuffer: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
// Cap DPR for speed on retina displays (2x fills 4x the pixels)
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // faster than PCFSoftShadowMap
// Keep native linear color encoding so all hex asset colors and floor tiles retain deep, rich saturation without gamma wash-out
container.appendChild(renderer.domElement);

// High-contrast, low-glare industrial reflection environment so metallic surfaces get crisp specular rims without washing out colors
let studioEnvTexture = null;
(function initStudioEnvironment() {
  try {
    if (typeof THREE.PMREMGenerator === 'function') {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x090d16);

      // Subtle overhead skylight strips against dark industrial ceiling
      const skyStripGeo = new THREE.PlaneGeometry(48, 8);
      const skyMat = new THREE.MeshBasicMaterial({ color: 0x475569, side: THREE.DoubleSide });
      [-26, 0, 26].forEach(z => {
        const s = new THREE.Mesh(skyStripGeo, skyMat);
        s.rotation.x = Math.PI / 2;
        s.position.set(0, 44, z);
        envScene.add(s);
      });

      const sideWallGeo = new THREE.PlaneGeometry(90, 32);
      const warmWall = new THREE.Mesh(sideWallGeo, new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide }));
      warmWall.position.set(55, 12, 0);
      warmWall.rotation.y = -Math.PI / 2;
      envScene.add(warmWall);

      const coolWall = new THREE.Mesh(sideWallGeo, new THREE.MeshBasicMaterial({ color: 0x1e293b, side: THREE.DoubleSide }));
      coolWall.position.set(-55, 12, 0);
      coolWall.rotation.y = Math.PI / 2;
      envScene.add(coolWall);

      const groundBounce = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 120),
        new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide })
      );
      groundBounce.rotation.x = -Math.PI / 2;
      groundBounce.position.y = -18;
      envScene.add(groundBounce);

      studioEnvTexture = pmrem.fromScene(envScene, 0.04).texture;
      scene.environment = null;
      pmrem.dispose();
    }
  } catch (e) {
    console.warn('Environment map setup fallback:', e);
  }
})();

let realisticMode = true;
// Split-button UI is synced by updateViewModeSplitUI() after materials boot / mode changes.


const controls = new THREE.OrbitControls(activeCam, renderer.domElement);
controls.target.set(37, 0, 5);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.minDistance = 2;
controls.maxDistance = 6000;
controls.update();

// Crisp High-Contrast Industrial Lighting + Full-Floor 2048x2048 Soft Shadows
// Match setRealisticMode() so first frame is not dull vs after CAD↔Realistic toggle
const ambientLight = new THREE.AmbientLight(0xffffff, 0.62);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x0f172a, 0.0);
hemiLight.position.set(37, 60, 5);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.72);
dirLight.position.set(54, 78, 48);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 800;
dirLight.shadow.camera.left = -160;
dirLight.shadow.camera.right = 160;
dirLight.shadow.camera.top = 160;
dirLight.shadow.camera.bottom = -160;
dirLight.shadow.bias = -0.00035;
dirLight.shadow.normalBias = 0.02;
dirLight.target.position.set(37, 0, 5);
scene.add(dirLight);
scene.add(dirLight.target);

/** Expand camera + shadow range for larger rooms so zoom-out does not clip the floor. */
function updateRenderDistanceForRoom() {
  const span = Math.max(roomWidthFt || BASE_ROOM_WIDTH_FT, roomLengthFt || BASE_ROOM_LENGTH_FT, 40);
  const far = Math.max(CAM_FAR, span * 40);
  const near = CAM_NEAR;
  perspCam.near = near;
  perspCam.far = far;
  perspCam.updateProjectionMatrix();
  orthoCam.near = near;
  orthoCam.far = far;
  orthoCam.updateProjectionMatrix();
  controls.maxDistance = Math.max(2000, span * 35);

  const half = Math.max(120, span * 1.35);
  dirLight.shadow.camera.left = -half;
  dirLight.shadow.camera.right = half;
  dirLight.shadow.camera.top = half;
  dirLight.shadow.camera.bottom = -half;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = Math.max(400, span * 6);
  dirLight.shadow.camera.updateProjectionMatrix();
  dirLight.position.set(
    (roomWidthFt || span) * 0.72,
    Math.max(78, span * 1.05),
    (roomLengthFt || span) * 0.55
  );
  dirLight.target.position.set((roomWidthFt || span) / 2, 0, toWorldZ((roomLengthFt || span) / 2));
  dirLight.target.updateMatrixWorld();
}

// ============================================================================
// 2. EXPANDABLE FLOOR PERIMETER & 1ft x 1ft TILES (1-Grid = 1ft Increments)
// ============================================================================
const BASE_ROOM_WIDTH_FT = 20;
const BASE_ROOM_LENGTH_FT = 20;
const MIN_ROOM_WIDTH_FT = 5;
const MAX_ROOM_WIDTH_FT = 250;
const MIN_ROOM_LENGTH_FT = 5;
const MAX_ROOM_LENGTH_FT = 250;

let roomWidthFt = BASE_ROOM_WIDTH_FT;
let roomLengthFt = BASE_ROOM_LENGTH_FT;
let wallNotchRemoved = true; // legacy saved-project compatibility; notch/angle editing has been retired
let customRoomOutline = null; // array of [x,y] coordinates in feet; null means rectangle

function toWorldZ(yFt) { return 44 - yFt; }
function toWarehouseY(worldZ) { return 44 - worldZ; }

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1], xj = points[j][0], yj = points[j][1];
    const crosses = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

// Exact floor footprint: either a user-defined polygon or the standard rectangle.
function isInsideWarehouse(x, y) {
  if (customRoomOutline && customRoomOutline.length >= 3) return pointInPolygon(x, y, customRoomOutline);
  return x >= 0 && x <= roomWidthFt && y >= 0 && y <= roomLengthFt;
}

const floorGroup = new THREE.Group();
scene.add(floorGroup);
const gridLinesGroup = new THREE.Group();
scene.add(gridLinesGroup);
const farExtensionGroup = new THREE.Group();
farExtensionGroup.visible = false;
scene.add(farExtensionGroup);

// Invisible mathematical drag plane at Y=0 for reliable dragging everywhere
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Procedural Polished Concrete & Butcher-Block Wood & Contact Shadow Textures
function createPolishedConcreteTexture(baseHex, speckLight, speckDark, { joints = true } = {}) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 128, 128);
  // Soft trowel mottling & aggregate (fresh poured look)
  for (let i = 0; i < 520; i++) {
    const x = (i * 73) % 128;
    const y = (i * 41 + 17) % 128;
    const sz = (i % 4) + 1;
    ctx.fillStyle = (i % 2 === 0) ? speckLight : speckDark;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, y, sz, sz);
  }
  ctx.globalAlpha = 1;
  // Large soft moisture / curing clouds
  for (let i = 0; i < 18; i++) {
    const x = (i * 37) % 128;
    const y = (i * 53 + 11) % 128;
    const r = 12 + (i % 8) * 3;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.07)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // CAD mode only: expansion joint border per tile
  if (joints) {
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 126, 126);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

let _cachedContactShadowTex = null;
function getContactShadowTexture() {
  if (_cachedContactShadowTex) return _cachedContactShadowTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 18, 64, 64, 62);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.48)');
  grad.addColorStop(0.65, 'rgba(15, 23, 42, 0.24)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  _cachedContactShadowTex = new THREE.CanvasTexture(c);
  return _cachedContactShadowTex;
}

let _cachedButcherBlockTex = null;
function getButcherBlockTexture() {
  if (_cachedButcherBlockTex) return _cachedButcherBlockTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const stripColors = ['#c68b49', '#b97d3d', '#cf9655', '#b07436', '#c28644', '#cb9150'];
  const strips = 16;
  const sh = 256 / strips;
  for (let i = 0; i < strips; i++) {
    ctx.fillStyle = stripColors[i % stripColors.length];
    ctx.fillRect(0, i * sh, 256, sh);
    ctx.fillStyle = 'rgba(69, 26, 3, 0.16)';
    ctx.fillRect(0, i * sh, 256, 1.5);
    // Finger-joint & grain streaks
    ctx.fillStyle = 'rgba(254, 243, 199, 0.09)';
    ctx.fillRect(((i * 53) % 180), i * sh + 3, 65, sh - 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  _cachedButcherBlockTex = tex;
  return tex;
}

let _cachedRibbedWallTex = null;
function getRibbedWallTexture() {
  if (_cachedRibbedWallTex) return _cachedRibbedWallTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, 0, 256, 256);
  // Vertical architectural metal cladding ribs
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(248, 250, 252, 0.14)';
    ctx.fillRect(x, 0, 3, 256);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.20)';
    ctx.fillRect(x + 3, 0, 3, 256);
  }
  // Concrete wainscot lower band
  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 184, 256, 72);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, 180, 256, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  _cachedRibbedWallTex = tex;
  return tex;
}

// Shared geometries & high-contrast industrial concrete materials for 1ft x 1ft tiles
const tileGeo = new THREE.PlaneGeometry(0.975, 0.975);
tileGeo.rotateX(-Math.PI / 2);
const texTileEven = createPolishedConcreteTexture('#9aa6b5', 'rgba(226,232,240,0.18)', 'rgba(51,65,85,0.24)', { joints: true });
const texTileOdd  = createPolishedConcreteTexture('#8e9bab', 'rgba(203,213,225,0.16)', 'rgba(30,41,59,0.26)', { joints: true });
// Seamless grey slab texture used only by the realistic-mode floor overlay
const texWetConcrete = createPolishedConcreteTexture('#8b95a3', 'rgba(200,210,220,0.14)', 'rgba(60,72,88,0.18)', { joints: false });
const matTileEven = new THREE.MeshStandardMaterial({
  color: 0xffffff, map: texTileEven, roughness: 0.78, metalness: 0.02, envMapIntensity: 0.0,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, depthWrite: true
});
const matTileOdd  = new THREE.MeshStandardMaterial({
  color: 0xffffff, map: texTileOdd, roughness: 0.82, metalness: 0.02, envMapIntensity: 0.0,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, depthWrite: true
});

// Opaque grey concrete overlay for Realistic mode (hides grid without destroying CAD floor)
const realisticFloorOverlay = new THREE.Group();
realisticFloorOverlay.name = 'RealisticFloorOverlay';
realisticFloorOverlay.visible = false;
scene.add(realisticFloorOverlay);
const matRealisticFloor = new THREE.MeshStandardMaterial({
  // Uniform neutral grey concrete: no texture map, joints, mottling, or repeating pattern.
  color: 0x8797aa,
  map: null,
  roughness: 0.9,
  metalness: 0.0,
  envMapIntensity: 0.02,
  depthWrite: true
});

const matTileExtEven = matTileEven;
const matTileExtOdd  = matTileOdd;
const majorLineMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.65 });

// Continuous sub-floor concrete slab base underneath the 1x1ft tiles so gaps look like real concrete control joints
const subSlabGroup = new THREE.Group();
scene.add(subSlabGroup);
const highBayLightsGroup = new THREE.Group();
highBayLightsGroup.name = 'OverheadHighBayLights';
scene.add(highBayLightsGroup);

function rebuildHighBayLightsAndSlab() {
  while (subSlabGroup.children.length) {
    const c = subSlabGroup.children.pop();
    subSlabGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
  }
  while (highBayLightsGroup.children.length) {
    const c = highBayLightsGroup.children.pop();
    highBayLightsGroup.remove(c);
    c.traverse?.(p => { if (p.geometry) p.geometry.dispose(); });
  }

  // Dark concrete joint bed & slab edge thickness. Follow the actual polygon
  // bounds so outward wall jut-outs (including negative X/Y) gain floor support
  // without moving any existing wall or asset coordinates.
  const slabBounds = customRoomOutline && customRoomOutline.length >= 3
    ? customRoomOutline.reduce((b, p) => ({ minX: Math.min(b.minX,p[0]), maxX: Math.max(b.maxX,p[0]), minY: Math.min(b.minY,p[1]), maxY: Math.max(b.maxY,p[1]) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
    : { minX: 0, maxX: roomWidthFt, minY: 0, maxY: roomLengthFt };
  const slabW = Math.max(1, slabBounds.maxX - slabBounds.minX);
  const slabL = Math.max(1, slabBounds.maxY - slabBounds.minY);
  const slabMesh = new THREE.Mesh(
    new THREE.BoxGeometry(slabW + 0.6, 0.24, slabL + 0.6),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75, metalness: 0.1 })
  );
  slabMesh.position.set((slabBounds.minX + slabBounds.maxX) / 2, -0.12, toWorldZ((slabBounds.minY + slabBounds.maxY) / 2));
  slabMesh.receiveShadow = true;
  subSlabGroup.add(slabMesh);

  // Overhead "fake" LED fixture meshes + point lights removed — they clutter
  // realistic view. Scene lighting comes from ambient + directional only.
  highBayLightsGroup.visible = false;
}


let cumulativeWestShiftFt = 0;
let cumulativeSouthShiftFt = 0;

// Shifts all placed items, conveyors, cranes, utility drops, routes, and custom outlines
// so that expanding West or South moves ONLY that wall, generating space on that side
// while leaving the opposite wall and all contents fixed in relative space.
function shiftFacilityContents(dxFt, dyFt) {
  if (!dxFt && !dyFt) return;
  cumulativeWestShiftFt += dxFt;
  cumulativeSouthShiftFt += dyFt;

  // 1. Shift placed equipment/bins
  bins.forEach(b => {
    b.x = Math.round((b.x + dxFt) * 100) / 100;
    b.y = Math.round((b.y + dyFt) * 100) / 100;
    syncBinPosition(b);
  });

  // 2. Shift conveyors
  conveyors.forEach(c => {
    c.xFt = Math.round((c.xFt + dxFt) * 100) / 100;
    c.yStartFt = Math.round((c.yStartFt + dyFt) * 100) / 100;
    c.yStart = c.yStartFt;
    c.group.position.set(c.xFt + c.w / 2, 0, toWorldZ(c.yStartFt + c.l / 2));
  });

  // 3. Shift Gorbel crane
  if (gorbelCrane) {
    gorbelCrane.position.x = Math.round((gorbelCrane.position.x + dxFt) * 100) / 100;
    gorbelCrane.position.z = Math.round((gorbelCrane.position.z - dyFt) * 100) / 100;
  }

  // 4. Shift fixed structural fixtures
  if (fixedSteelIBeamColumn) {
    fixedSteelIBeamColumn.position.x += dxFt;
    fixedSteelIBeamColumn.position.z -= dyFt;
  }
  if (fixedAdjacentFixtureBox) {
    fixedAdjacentFixtureBox.position.x += dxFt;
    fixedAdjacentFixtureBox.position.z -= dyFt;
  }

  // 5. Shift overhead utility drops
  for (const k of ['electrical', 'gas', 'air']) {
    (customRoofDrops[k] || []).forEach(d => {
      d.x = Math.round((d.x + dxFt) * 100) / 100;
      d.y = Math.round((d.y + dyFt) * 100) / 100;
    });
    // 6. Shift overhead utility routes
    (customRoofRoutes[k] || []).forEach(route => {
      route.forEach(pt => {
        pt.x = Math.round((pt.x + dxFt) * 100) / 100;
        pt.y = Math.round((pt.y + dyFt) * 100) / 100;
      });
    });
  }
  renderAllCustomRoofRoutes();
  refreshRoofDropAssetSelect();

  // 7. If custom room outline exists, shift all points
  if (customRoomOutline && customRoomOutline.length >= 3) {
    customRoomOutline = customRoomOutline.map(p => [
      Math.round((p[0] + dxFt) * 100) / 100,
      Math.round((p[1] + dyFt) * 100) / 100
    ]);
    const outlineEl = document.getElementById('custom-room-outline');
    if (outlineEl) outlineEl.value = customRoomOutline.map(p => p.join(',')).join('\n');
  }
}

// Expands or shrinks the facility in specified direction(s) in clean 1ft grid increments.
// 'east'   : expands East wall (+X outward). West wall & contents stay fixed.
// 'west'   : expands West wall (-X outward). East wall stays fixed. Space generates on West side!
// 'north'  : expands North wall (+Y outward). South wall & contents stay fixed.
// 'south'  : expands South wall (-Y outward). North wall stays fixed. Space generates on South side!
// 'both-x' : expands outward in 2 directions symmetrically (+1ft West AND +1ft East per 2ft amount).
// 'both-y' : expands outward in 2 directions symmetrically (+1ft South AND +1ft North per 2ft amount).
// 'ne','nw','se','sw': corner expansion in 2 directions simultaneously!
function expandFacility(direction, amountFt) {
  const amt = Math.round(Number(amountFt) || 0);
  if (amt === 0) return false;

  if (direction === 'east') {
    const nextW = roomWidthFt + amt;
    if (nextW < MIN_ROOM_WIDTH_FT || nextW > MAX_ROOM_WIDTH_FT) return false;
    if (amt < 0) {
      const maxX = Math.max(...bins.map(b => b.x + b.w), ...conveyors.map(c => c.xFt + c.w), 10);
      if (nextW < maxX) return false;
    }
    setRoomDimensions(nextW, roomLengthFt);
    return true;
  }

  if (direction === 'west') {
    const nextW = roomWidthFt + amt;
    if (nextW < MIN_ROOM_WIDTH_FT || nextW > MAX_ROOM_WIDTH_FT) return false;
    if (amt < 0) {
      const minX = Math.min(...bins.map(b => b.x), ...conveyors.map(c => c.xFt), 999);
      if (minX < Math.abs(amt)) return false;
    }
    shiftFacilityContents(amt, 0);
    setRoomDimensions(nextW, roomLengthFt);
    return true;
  }

  if (direction === 'north') {
    const nextL = roomLengthFt + amt;
    if (nextL < MIN_ROOM_LENGTH_FT || nextL > MAX_ROOM_LENGTH_FT) return false;
    if (amt < 0) {
      const maxY = Math.max(...bins.map(b => b.y + b.l), ...conveyors.map(c => c.yStartFt + c.l), 10);
      if (nextL < maxY) return false;
    }
    setRoomDimensions(roomWidthFt, nextL);
    return true;
  }

  if (direction === 'south') {
    const nextL = roomLengthFt + amt;
    if (nextL < MIN_ROOM_LENGTH_FT || nextL > MAX_ROOM_LENGTH_FT) return false;
    if (amt < 0) {
      const minY = Math.min(...bins.map(b => b.y), ...conveyors.map(c => c.yStartFt), 999);
      if (minY < Math.abs(amt)) return false;
    }
    shiftFacilityContents(0, amt);
    setRoomDimensions(roomWidthFt, nextL);
    return true;
  }

  if (direction === 'both-x') {
    const half = Math.round(amt / 2);
    if (half === 0) return false;
    const nextW = roomWidthFt + half * 2;
    if (nextW < MIN_ROOM_WIDTH_FT || nextW > MAX_ROOM_WIDTH_FT) return false;
    if (half < 0) {
      const minX = Math.min(...bins.map(b => b.x), ...conveyors.map(c => c.xFt), 999);
      if (minX < Math.abs(half)) return false;
      const maxX = Math.max(...bins.map(b => b.x + b.w), ...conveyors.map(c => c.xFt + c.w), 10);
      if (nextW < maxX - half) return false;
    }
    shiftFacilityContents(half, 0);
    setRoomDimensions(nextW, roomLengthFt);
    return true;
  }

  if (direction === 'both-y') {
    const half = Math.round(amt / 2);
    if (half === 0) return false;
    const nextL = roomLengthFt + half * 2;
    if (nextL < MIN_ROOM_LENGTH_FT || nextL > MAX_ROOM_LENGTH_FT) return false;
    if (half < 0) {
      const minY = Math.min(...bins.map(b => b.y), ...conveyors.map(c => c.yStartFt), 999);
      if (minY < Math.abs(half)) return false;
      const maxY = Math.max(...bins.map(b => b.y + b.l), ...conveyors.map(c => c.yStartFt + c.l), 10);
      if (nextL < maxY - half) return false;
    }
    shiftFacilityContents(0, half);
    setRoomDimensions(roomWidthFt, nextL);
    return true;
  }

  return false;
}

function rebuildFloorTilesAndGrid() {
  while (floorGroup.children.length) {
    const child = floorGroup.children.pop();
    floorGroup.remove(child);
    // Shared tileGeo must not be disposed; InstancedMesh has no unique geometry copy
  }
  while (gridLinesGroup.children.length) {
    const lineObj = gridLinesGroup.children.pop();
    gridLinesGroup.remove(lineObj);
    if (lineObj.geometry) lineObj.geometry.dispose();
  }

  // Bounds (supports custom multipoint outlines, including negative jut-outs)
  const floorBounds = customRoomOutline && customRoomOutline.length >= 3
    ? customRoomOutline.reduce((b, p) => ({ minX: Math.min(b.minX,p[0]), maxX: Math.max(b.maxX,p[0]), minY: Math.min(b.minY,p[1]), maxY: Math.max(b.maxY,p[1]) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
    : { minX: 0, maxX: roomWidthFt, minY: 0, maxY: roomLengthFt };
  const floorMinX = Math.floor(floorBounds.minX), floorMaxX = Math.ceil(floorBounds.maxX);
  const floorMinY = Math.floor(floorBounds.minY), floorMaxY = Math.ceil(floorBounds.maxY);

  // PERFORMANCE: two InstancedMeshes (even/odd checker) instead of thousands of Mesh objects.
  // A 74×78 room was ~5,700 draw objects; a 150×150 room was ~22,500. Now always 2 draws.
  const evenPos = [];
  const oddPos = [];
  for (let x = floorMinX; x < floorMaxX; x++) {
    for (let y = floorMinY; y < floorMaxY; y++) {
      if (!isInsideWarehouse(x + 0.5, y + 0.5)) continue;
      const isEven = ((x + y) % 2 + 2) % 2 === 0;
      (isEven ? evenPos : oddPos).push(x + 0.5, y);
    }
  }

  const _floorDummy = rebuildFloorTilesAndGrid._dummy || (rebuildFloorTilesAndGrid._dummy = new THREE.Object3D());
  function addTileInstances(positions, material) {
    const count = positions.length / 2;
    if (!count) return;
    const mesh = new THREE.InstancedMesh(tileGeo, material, count);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      _floorDummy.position.set(positions[i * 2], 0.01, toWorldZ(positions[i * 2 + 1] + 0.5));
      _floorDummy.rotation.set(0, 0, 0);
      _floorDummy.scale.set(1, 1, 1);
      _floorDummy.updateMatrix();
      mesh.setMatrixAt(i, _floorDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    floorGroup.add(mesh);
  }
  addTileInstances(evenPos, matTileEven);
  addTileInstances(oddPos, matTileOdd);
  floorGroup.frustumCulled = false;

  // 4-Foot major grid lines (single LineSegments draw)
  const majorPts = [];
  const xStops = [];
  for (let x = Math.ceil(floorMinX / 4) * 4; x <= floorMaxX; x += 4) xStops.push(x);
  if (!xStops.includes(floorMinX)) xStops.unshift(floorMinX);
  if (!xStops.includes(floorMaxX)) xStops.push(floorMaxX);

  const yStops = [];
  for (let y = Math.ceil(floorMinY / 4) * 4; y <= floorMaxY; y += 4) yStops.push(y);
  if (!yStops.includes(floorMinY)) yStops.unshift(floorMinY);
  if (!yStops.includes(floorMaxY)) yStops.push(floorMaxY);

  xStops.forEach(x => {
    majorPts.push(new THREE.Vector3(x, 0.03, toWorldZ(floorMinY)), new THREE.Vector3(x, 0.03, toWorldZ(floorMaxY)));
  });
  yStops.forEach(y => {
    majorPts.push(new THREE.Vector3(floorMinX, 0.03, toWorldZ(y)), new THREE.Vector3(floorMaxX, 0.03, toWorldZ(y)));
  });
  gridLinesGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(majorPts), majorLineMat));
  // CAD grid is always rebuilt fully visible; realistic mode hides it via setRealisticMode / overlay
  gridLinesGroup.visible = (typeof realisticMode === 'undefined') ? true : !realisticMode;
  if (typeof majorLineMat !== 'undefined' && majorLineMat) {
    majorLineMat.opacity = 0.65;
    majorLineMat.transparent = true;
    majorLineMat.visible = true;
  }
  rebuildRealisticFloorOverlay();
  rebuildHighBayLightsAndSlab();
  if (typeof rebuildUtilitiesGrid === 'function') rebuildUtilitiesGrid();
}

function rebuildRealisticFloorOverlay() {
  if (typeof realisticFloorOverlay === 'undefined' || !realisticFloorOverlay) return;
  while (realisticFloorOverlay.children.length) {
    const c = realisticFloorOverlay.children.pop();
    realisticFloorOverlay.remove(c);
    if (c.geometry) c.geometry.dispose();
  }
  const floorBounds = customRoomOutline && customRoomOutline.length >= 3
    ? customRoomOutline.reduce((b, p) => ({
        minX: Math.min(b.minX, p[0]), maxX: Math.max(b.maxX, p[0]),
        minY: Math.min(b.minY, p[1]), maxY: Math.max(b.maxY, p[1])
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
    : { minX: 0, maxX: roomWidthFt, minY: 0, maxY: roomLengthFt };
  const w = Math.max(1, floorBounds.maxX - floorBounds.minX);
  const l = Math.max(1, floorBounds.maxY - floorBounds.minY);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.02, l + 0.02).rotateX(-Math.PI / 2),
    matRealisticFloor
  );
  // Slightly above CAD tiles/grid so it fully covers them in realistic view
  mesh.position.set(
    (floorBounds.minX + floorBounds.maxX) / 2,
    0.04,
    toWorldZ((floorBounds.minY + floorBounds.maxY) / 2)
  );
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  realisticFloorOverlay.add(mesh);
  realisticFloorOverlay.visible = !!realisticMode;
}


// Hover Tile Highlight
const hoverTile = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 })
);
hoverTile.position.y = 0.04;
hoverTile.visible = false;
scene.add(hoverTile);

// ============================================================================
// 3. PERIMETER WALLS & 1-GRID WALL EXPANSION HANDLES
// ============================================================================
const wallsGroup = new THREE.Group();
scene.add(wallsGroup);
const wallHandlesGroup = new THREE.Group();
scene.add(wallHandlesGroup);

// Roof utility layer is independent of placed assets, so Clear All Objects leaves it intact.
const roofUtilitiesGroup = new THREE.Group();
roofUtilitiesGroup.name = 'Roof Utilities';
scene.add(roofUtilitiesGroup);

// Semi-transparent utilities reference grid (toggleable; sits at overhead utility height)
const UTILITIES_GRID_Y = 20.85; // just under conduit runs at roofY=21
const utilitiesGridGroup = new THREE.Group();
utilitiesGridGroup.name = 'Utilities Grid';
utilitiesGridGroup.visible = false;
scene.add(utilitiesGridGroup);
const utilitiesGridMinorMat = new THREE.LineBasicMaterial({
  color: 0xa78bfa, transparent: true, opacity: 0.18, depthWrite: false
});
const utilitiesGridMajorMat = new THREE.LineBasicMaterial({
  color: 0xc4b5fd, transparent: true, opacity: 0.38, depthWrite: false
});
const utilitiesGridPlaneMat = new THREE.MeshBasicMaterial({
  color: 0x7c3aed, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide
});

function rebuildUtilitiesGrid() {
  while (utilitiesGridGroup.children.length) {
    const child = utilitiesGridGroup.children.pop();
    utilitiesGridGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
  const floorBounds = customRoomOutline && customRoomOutline.length >= 3
    ? customRoomOutline.reduce((b, p) => ({
        minX: Math.min(b.minX, p[0]), maxX: Math.max(b.maxX, p[0]),
        minY: Math.min(b.minY, p[1]), maxY: Math.max(b.maxY, p[1])
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
    : { minX: 0, maxX: roomWidthFt, minY: 0, maxY: roomLengthFt };
  const minX = Math.floor(floorBounds.minX);
  const maxX = Math.ceil(floorBounds.maxX);
  const minY = Math.floor(floorBounds.minY);
  const maxY = Math.ceil(floorBounds.maxY);
  const w = Math.max(1, maxX - minX);
  const l = Math.max(1, maxY - minY);

  // Soft translucent plane so the layer reads as a sheet above the floor
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    utilitiesGridPlaneMat
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(minX + w / 2, UTILITIES_GRID_Y, toWorldZ(minY + l / 2));
  plane.renderOrder = 5;
  utilitiesGridGroup.add(plane);

  const minorPts = [];
  const majorPts = [];
  for (let x = minX; x <= maxX; x++) {
    const a = new THREE.Vector3(x, UTILITIES_GRID_Y, toWorldZ(minY));
    const b = new THREE.Vector3(x, UTILITIES_GRID_Y, toWorldZ(maxY));
    if (x % 4 === 0) { majorPts.push(a, b); } else { minorPts.push(a, b); }
  }
  for (let y = minY; y <= maxY; y++) {
    const a = new THREE.Vector3(minX, UTILITIES_GRID_Y, toWorldZ(y));
    const b = new THREE.Vector3(maxX, UTILITIES_GRID_Y, toWorldZ(y));
    if (y % 4 === 0) { majorPts.push(a, b); } else { minorPts.push(a, b); }
  }
  if (minorPts.length) {
    const minor = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(minorPts), utilitiesGridMinorMat);
    minor.renderOrder = 6;
    utilitiesGridGroup.add(minor);
  }
  if (majorPts.length) {
    const major = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(majorPts), utilitiesGridMajorMat);
    major.renderOrder = 7;
    utilitiesGridGroup.add(major);
  }
}

function setUtilitiesGridVisible(visible) {
  utilitiesGridGroup.visible = !!visible;
  const chk = document.getElementById('toggle-utilities-grid');
  if (chk && chk.checked !== !!visible) chk.checked = !!visible;
  // While the utilities grid is active, floor-layer assets are non-interactive
  // so overhead routing can be edited without grabbing bins/equipment.
  if (utilitiesGridGroup.visible) {
    if (typeof selectedBin !== 'undefined' && selectedBin) {
      try { selectBin(null); } catch (_) {}
    }
    isDraggingBin = false;
    isResizingBin = false;
    activeResizeDir = null;
    if (typeof updateAssetLockUI === 'function') updateAssetLockUI();
    const readout = document.getElementById('coord-readout');
    if (readout) readout.textContent = '📐 Utilities grid ON — floor assets locked (draw/edit overhead routes safely)';
  } else if (typeof updateAssetLockUI === 'function') {
    updateAssetLockUI();
  }
}

function areFloorAssetsInteractionBlocked() {
  return !!(assetInteractionLocked || (typeof utilitiesGridGroup !== 'undefined' && utilitiesGridGroup.visible));
}
const roofUtilityGroups = { electrical: new THREE.Group(), gas: new THREE.Group(), air: new THREE.Group() };
Object.entries(roofUtilityGroups).forEach(([key, group]) => { group.name = 'Roof ' + key; roofUtilitiesGroup.add(group); });
const roofUtilityMaterials = {
  electrical: new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x4a0808, emissiveIntensity: 0.28, roughness: 0.42, metalness: 0.25 }),
  gas: new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x4a3b00, emissiveIntensity: 0.2, roughness: 0.5, metalness: 0.15 }),
  air: new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x082f49, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.3 })
};
const customRoofRoutes = { electrical: [], gas: [], air: [] };
const customRoofDrops = { electrical: [], gas: [], air: [] };
const customRoofDropGroups = { electrical: new THREE.Group(), gas: new THREE.Group(), air: new THREE.Group() };
Object.entries(customRoofDropGroups).forEach(([key, group]) => { group.name = 'Vertical drops ' + key; roofUtilityGroups[key].add(group); });
let roofDropPlacementMode = false;
const customRoofRouteGroups = { electrical: new THREE.Group(), gas: new THREE.Group(), air: new THREE.Group() };
const customRoofRoutePickGroups = { electrical: new THREE.Group(), gas: new THREE.Group(), air: new THREE.Group() };
Object.entries(customRoofRouteGroups).forEach(([key, group]) => { group.name = 'Custom roof route ' + key; group.userData.isCustomRoofRouteGroup = true; roofUtilityGroups[key].add(group); });
Object.entries(customRoofRoutePickGroups).forEach(([key, group]) => { group.name = 'Wide selection targets ' + key; group.visible = false; roofUtilityGroups[key].add(group); });
const roofDropHoverBox = new THREE.Group();
const roofDropHoverFill = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.72), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.28, depthTest: false }));
const roofDropHoverEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.72, 0.18, 0.72)), new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false, linewidth: 2 }));
roofDropHoverBox.add(roofDropHoverFill, roofDropHoverEdges); roofDropHoverBox.visible = false; roofDropHoverBox.renderOrder = 999; scene.add(roofDropHoverBox);
let roofRouteDrawing = false, roofRoutePointerDown = false, roofRouteCurrentPoints = [];
function clearCustomRoofMeshes(key) {
  for (const group of [customRoofRouteGroups[key], customRoofRoutePickGroups[key]]) {
    while (group.children.length) { const obj = group.children[group.children.length - 1]; group.remove(obj); obj.traverse?.(part => { if (part.geometry) part.geometry.dispose(); }); }
  }
}
function renderCustomRoofRoute(key) {
  clearCustomRoofMeshes(key);
  const group = customRoofRouteGroups[key], pts = customRoofRoutes[key];
  const roofY = 21, material = roofUtilityMaterials[key];
  const pickGroup = customRoofRoutePickGroups[key];
  const pickMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  for (const route of pts) {
    for (let i=1; i<route.length; i++) {
      const a = new THREE.Vector3(route[i-1].x, roofY, toWorldZ(route[i-1].y));
      const b = new THREE.Vector3(route[i].x, roofY, toWorldZ(route[i].y));
      const delta = new THREE.Vector3().subVectors(b,a), len = delta.length(); if (len < 0.01) continue;
      // Slightly thicker pipe runs, with no joint spheres: the spheres caused
      // oversized bulbs at every grid point and turn.
      const radius = key === 'gas' ? 0.115 : 0.09;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,len,12), material);
      mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()); group.add(mesh);
      // Broad invisible hit tube: much easier to hover/click than the visible pipe.
      const pickDelta = new THREE.Vector3().subVectors(b,a), pickLen = pickDelta.length();
      const pickMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.48,0.48,pickLen,10), pickMaterial);
      pickMesh.position.copy(a).add(b).multiplyScalar(.5); pickMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),pickDelta.normalize());
      pickMesh.userData.roofRouteKey = key; pickGroup.add(pickMesh);
    }
  }
  if (roofRouteDrawing && key === document.getElementById('custom-roof-type')?.value && roofRouteCurrentPoints.length > 1) {
    for (let i=1;i<roofRouteCurrentPoints.length;i++) {
      const a=roofRouteCurrentPoints[i-1], b=roofRouteCurrentPoints[i], va=new THREE.Vector3(a.x,roofY,toWorldZ(a.y)), vb=new THREE.Vector3(b.x,roofY,toWorldZ(b.y));
      const d=new THREE.Vector3().subVectors(vb,va), len=d.length(); if(!len) continue;
      const previewRadius = document.getElementById('custom-roof-type')?.value === 'gas' ? 0.095 : 0.075; const m=new THREE.Mesh(new THREE.CylinderGeometry(previewRadius,previewRadius,len,12),material); m.position.copy(va).add(vb).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); group.add(m);
    }
  }
}
function renderCustomRoofDrops(key) {
  const group = customRoofDropGroups[key];
  while (group.children.length) { const obj = group.children[group.children.length - 1]; group.remove(obj); obj.traverse?.(part => { if (part.geometry) part.geometry.dispose(); }); }
  const material = roofUtilityMaterials[key];
  const selectedId = document.getElementById('roof-drop-asset-select')?.value || '';
  for (const drop of customRoofDrops[key]) {
    const isSelected = drop.id === selectedId;
    // High-contrast yellow selection halo and base marker make the active drop easy to find in a crowded layout.
    if (isSelected) {
      const haloMat = new THREE.MeshBasicMaterial({ color: 0xffea00, transparent: true, opacity: 0.38, depthWrite: false });
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 21 - Math.max(6.4, Math.min(19.2, Number(drop.tier) * 6.4 || 6.4)), 16, 1, true), haloMat);
      const selectedBaseY = Math.max(6.4, Math.min(19.2, Number(drop.tier) * 6.4 || 6.4));
      halo.position.set(drop.x, (selectedBaseY + 21) / 2, toWorldZ(drop.y)); halo.userData.dropId = drop.id; group.add(halo);
      const marker = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.075, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffea00, depthTest: false }));
      marker.rotation.x = Math.PI / 2; marker.position.set(drop.x, selectedBaseY + 0.08, toWorldZ(drop.y)); marker.renderOrder = 20; marker.userData.dropId = drop.id; group.add(marker);
      const topMarker = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffea00, depthTest: false }));
      topMarker.position.set(drop.x, 21, toWorldZ(drop.y)); topMarker.renderOrder = 20; topMarker.userData.dropId = drop.id; group.add(topMarker);
    }
    // Utility drops begin at the selected service tier (Tier 1 = 6.4 ft),
    // then rise to the overhead roof utility line so they visually connect.
    const baseY = Math.max(6.4, Math.min(19.2, Number(drop.tier) * 6.4 || 6.4));
    const topY = 21;
    const size = Math.max(0.05, Math.min(1.5, Number(drop.size) || 0.1));
    const z = toWorldZ(drop.y);
    const a = new THREE.Vector3(drop.x, baseY, z);
    const b = new THREE.Vector3(drop.x, topY, z);
    const delta = new THREE.Vector3().subVectors(b, a), len = delta.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(size/2,size/2,len,12), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), delta.normalize());
    mesh.userData.isRoofVerticalDrop = true; mesh.userData.dropId = drop.id; group.add(mesh);
    // Electrical outlet enclosure is fixed at the selected tier end.
    if (key === 'electrical') {
      const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.48,0.22), new THREE.MeshStandardMaterial({color:0xf8fafc, roughness:0.65}));
      outlet.position.set(drop.x,baseY+0.24,z); outlet.userData.dropId=drop.id; group.add(outlet);
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.26,0.28,0.025), new THREE.MeshStandardMaterial({color:0xd1d5db})); face.position.set(drop.x,baseY+0.24,z+0.12); face.userData.dropId=drop.id; group.add(face);
      for (const dx of [-0.055,0.055]) { const slot = new THREE.Mesh(new THREE.BoxGeometry(0.025,0.09,0.012), new THREE.MeshStandardMaterial({color:0x334155})); slot.position.set(drop.x+dx,baseY+0.25,z+0.14); slot.userData.dropId=drop.id; group.add(slot); }
    } else if (key === 'gas') {
      const fitting = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,0.22,16), new THREE.MeshStandardMaterial({color:0xd1d5db,metalness:0.75,roughness:0.25}));
      fitting.rotation.x=Math.PI/2; fitting.position.set(drop.x,baseY+0.12,z); fitting.userData.dropId=drop.id; group.add(fitting);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.09,0.025,8,16), new THREE.MeshStandardMaterial({color:0x94a3b8,metalness:0.8})); rim.position.set(drop.x,baseY+0.12,z+0.13); rim.userData.dropId=drop.id; group.add(rim);
    } else {
      // Air hose reel is mounted just below the roof-line connection.
      const reelY = topY - 0.25;
      const reel = new THREE.Mesh(new THREE.TorusGeometry(0.34,0.075,10,24), new THREE.MeshStandardMaterial({color:0x1e293b,metalness:0.45,roughness:0.45}));
      reel.position.set(drop.x,reelY,z); reel.userData.dropId=drop.id; group.add(reel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.16,16), new THREE.MeshStandardMaterial({color:0x94a3b8,metalness:0.65})); hub.rotation.x=Math.PI/2; hub.position.set(drop.x,reelY,z+0.03); hub.userData.dropId=drop.id; group.add(hub);
      const hoseLength = Math.max(0.1, topY - baseY - 0.7); const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,hoseLength,8), new THREE.MeshStandardMaterial({color:0x38bdf8,roughness:0.6})); hose.position.set(drop.x,baseY + hoseLength/2,z); hose.userData.dropId=drop.id; group.add(hose);
    }
  }
}
function renderAllCustomRoofRoutes() { Object.keys(customRoofRoutes).forEach(key => { renderCustomRoofRoute(key); renderCustomRoofDrops(key); }); }
function roofGridPoint(e) {
  updatePointer(e); raycaster.setFromCamera(pointer, activeCam);
  const hit = new THREE.Vector3(); if (!raycaster.ray.intersectPlane(dragPlane,hit)) return null;
  const x=Math.max(0,Math.min(roomWidthFt,Math.round(hit.x))), y=Math.max(0,Math.min(roomLengthFt,Math.round(toWarehouseY(hit.z))));
  return isInsideWarehouse(x,y) ? {x,y} : null;
}
function updateRoofRouteStatus(msg) { const el=document.getElementById('roof-route-status'); if(el) el.textContent=msg; }
function addRoofRoutePoint(pt) { const last=roofRouteCurrentPoints[roofRouteCurrentPoints.length-1]; if(!last || last.x!==pt.x || last.y!==pt.y) { roofRouteCurrentPoints.push(pt); renderCustomRoofRoute(document.getElementById('custom-roof-type').value); updateRoofRouteStatus(`Drawing ${document.getElementById('custom-roof-type').selectedOptions[0].text}: ${pt.x} ft, ${pt.y} ft · ${roofRouteCurrentPoints.length} points`); } }
function finishRoofRoute() {
  if(roofRouteCurrentPoints.length>1) { customRoofRoutes[document.getElementById('custom-roof-type').value].push(roofRouteCurrentPoints.map(p=>({...p}))); }
  roofRouteDrawing=false; roofRoutePointerDown=false; roofRouteCurrentPoints=[]; renderAllCustomRoofRoutes(); controls.enabled=true; renderer.domElement.style.cursor='';
  updateRoofRouteStatus('Route saved. Start another line or choose a line type to draw.');
}

function rebuildRoofUtilities() {
  Object.values(roofUtilityGroups).forEach(group => {
    for (const child of [...group.children]) {
      if (child.userData?.isCustomRoofRouteGroup || child === customRoofDropGroups.electrical || child === customRoofDropGroups.gas || child === customRoofDropGroups.air) continue;
      group.remove(child);
      child.traverse?.(part => { if (part.geometry) part.geometry.dispose(); });
    }
  });
  const w = roomWidthFt, l = roomLengthFt, roofY = 21;
  const addRun = (group, x1, y1, x2, y2, radius, material) => {
    const a = new THREE.Vector3(x1, roofY, toWorldZ(y1));
    const b = new THREE.Vector3(x2, roofY, toWorldZ(y2));
    const delta = new THREE.Vector3().subVectors(b, a);
    const len = delta.length();
    if (len < 0.1) return;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  };
  // Start with a clean roof: utilities are added only when the user draws custom routes.
  roofUtilityGroups.electrical.visible = document.getElementById('toggle-roof-electrical')?.checked ?? true;
  roofUtilityGroups.gas.visible = document.getElementById('toggle-roof-gas')?.checked ?? true;
  roofUtilityGroups.air.visible = document.getElementById('toggle-roof-air')?.checked ?? true;
  roofUtilitiesGroup.visible = document.getElementById('toggle-roof-utilities')?.checked ?? true;
  renderAllCustomRoofRoutes();
}

const wallMat = new THREE.MeshStandardMaterial({
  color: 0x94a3b8,
  map: getRibbedWallTexture(),
  roughness: 0.48,
  metalness: 0.32,
  transparent: true,
  opacity: 0.68
});
const wallExpandMat = new THREE.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.72 });
const wallHandleMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
const wallHandleCornerMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
let wallDragHighlightActive = false;

function rebuildPerimeterWalls() {
  while (wallsGroup.children.length) {
    const child = wallsGroup.children.pop();
    wallsGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
  }
  while (wallHandlesGroup.children.length) {
    const h = wallHandlesGroup.children.pop();
    wallHandlesGroup.remove(h);
    h.traverse(part => { if (part.geometry) part.geometry.dispose(); });
  }

  // One continuous wall segment per outline edge (or rectangle side).
  // Custom shapes come exclusively from the multipoint freeform room editor.
  const rightX = roomWidthFt;
  const backY = roomLengthFt;
  const sideDefs = customRoomOutline && customRoomOutline.length >= 3
    ? customRoomOutline.map((pt, i) => ({ side: `edge${i}`, a: pt, b: customRoomOutline[(i + 1) % customRoomOutline.length], dir: `edge${i}` }))
    : [
        { side: 'west', a: [0, 0], b: [0, backY], dir: 'west' },
        { side: 'north', a: [0, backY], b: [rightX, backY], dir: 'north' },
        { side: 'east', a: [rightX, backY], b: [rightX, 0], dir: 'east' },
        { side: 'south', a: [rightX, 0], b: [0, 0], dir: 'south' }
      ];
  sideDefs.forEach(def => {
    const x1 = def.a[0], y1 = def.a[1];
    const x2 = def.b[0], y2 = def.b[1];
    const z1 = toWorldZ(y1), z2 = toWorldZ(y2);
    const dx = x2 - x1, dz = z2 - z1;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.01) return;
    const wallGeo = new THREE.BoxGeometry(Math.max(0.1, segLen), 8, 0.35);
    const wallMesh = new THREE.Mesh(wallGeo, wallDragHighlightActive ? wallExpandMat : wallMat);
    wallMesh.position.set((x1 + x2) / 2, 4, (z1 + z2) / 2);
    wallMesh.rotation.y = -Math.atan2(dz, dx);
    wallMesh.userData.wallExpandDir = def.dir;
    wallMesh.userData.wallEdgeSide = def.side;
    wallsGroup.add(wallMesh);
  });

  // Interactive 3D bidirectional arrow handles on the East (+X) and Far/North (+Y) walls.
  // Every arrow component carries the direction metadata so the existing drag interaction
  // works regardless of whether the user grabs the shaft or either arrowhead.
  const backStartX = 0;
  const northMidX = (backStartX + rightX) / 2;
  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15, emissive: 0x6b4f00, emissiveIntensity: 0.42,
    roughness: 0.3, metalness: 0.28
  });

  function addBidirectionalWallArrow(dir, x, y, z) {
    const arrow = new THREE.Group();
    arrow.position.set(x, y, z);
    const alongX = dir === 'east' || dir === 'west';
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.55, 12), arrowMat);
    if (alongX) shaft.rotation.z = Math.PI / 2;
    else shaft.rotation.x = Math.PI / 2;
    shaft.userData.wallExpandDir = dir;
    arrow.add(shaft);

    const headLength = 0.58;
    const headRadius = 0.27;
    const plusHead = new THREE.Mesh(new THREE.ConeGeometry(headRadius, headLength, 12), arrowMat);
    const minusHead = new THREE.Mesh(new THREE.ConeGeometry(headRadius, headLength, 12), arrowMat);
    if (alongX) {
      plusHead.rotation.z = -Math.PI / 2;  // points +X
      minusHead.rotation.z = Math.PI / 2; // points -X
      plusHead.position.x = 1.12;
      minusHead.position.x = -1.12;
    } else {
      plusHead.rotation.x = Math.PI / 2;   // points +Z
      minusHead.rotation.x = -Math.PI / 2; // points -Z
      plusHead.position.z = 1.12;
      minusHead.position.z = -1.12;
    }
    plusHead.userData.wallExpandDir = dir;
    minusHead.userData.wallExpandDir = dir;
    arrow.add(plusHead, minusHead);
    wallHandlesGroup.add(arrow);
  }

  function addCornerHandle(dir, x, y, z) {
    const handleGroup = new THREE.Group();
    handleGroup.position.set(x, y, z);
    const cornerCube = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.35, 1.35), wallHandleCornerMat);
    cornerCube.userData.wallExpandDir = dir;
    handleGroup.add(cornerCube);
    const edgeWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.4, 1.4, 1.4)),
      new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
    );
    edgeWire.userData.wallExpandDir = dir;
    handleGroup.add(edgeWire);
    handleGroup.userData.wallExpandDir = dir;
    wallHandlesGroup.add(handleGroup);
  }

  if (!customRoomOutline) {
    // 4 bidirectional arrows for directional wall expansion
    addBidirectionalWallArrow('north', northMidX, 4.25, toWorldZ(backY));
    addBidirectionalWallArrow('east', rightX, 4.25, toWorldZ(backY / 2));
    addBidirectionalWallArrow('west', 0, 4.25, toWorldZ(backY / 2));
    addBidirectionalWallArrow('south', rightX / 2, 4.25, toWorldZ(0));

    // 4 corner handles for simultaneous 2-direction expansion
    addCornerHandle('ne', rightX, 4.2, toWorldZ(backY));
    addCornerHandle('nw', 0, 4.2, toWorldZ(backY));
    addCornerHandle('se', rightX, 4.2, toWorldZ(0));
    addCornerHandle('sw', 0, 4.2, toWorldZ(0));
  }
}

rebuildFloorTilesAndGrid();
rebuildPerimeterWalls();
rebuildRoofUtilities();
if (typeof updateRenderDistanceForRoom === 'function') updateRenderDistanceForRoom();

function nearestRoofRoutePoint(key, pt) {
  let best = null, bestDistance = Infinity;
  for (const route of customRoofRoutes[key]) {
    for (let i=1; i<route.length; i++) {
      const a=route[i-1], b=route[i];
      const vx=b.x-a.x, vy=b.y-a.y, denom=vx*vx+vy*vy;
      const t=denom ? Math.max(0,Math.min(1,((pt.x-a.x)*vx+(pt.y-a.y)*vy)/denom)) : 0;
      const x=a.x+t*vx, y=a.y+t*vy, distance=Math.hypot(pt.x-x,pt.y-y);
      if(distance<bestDistance) { bestDistance=distance; best={x,y}; }
    }
  }
  // Keep the exact projected position on the route so the drop meets the overhead line.
  return bestDistance <= 2.0 ? {x:best.x,y:best.y} : null;
}
let roofDropAssetPlacementType = null;
let roofDropAssetIdCounter = 1;
function refreshRoofDropAssetSelect(preferredId='') {
  const sel=document.getElementById('roof-drop-asset-select'); if(!sel) return;
  const old=preferredId || sel.value; sel.innerHTML='<option value="">No drop selected</option>';
  for (const key of ['electrical','gas','air']) for (const d of customRoofDrops[key]) { const o=document.createElement('option'); o.value=d.id; o.textContent=`${key==='air'?'Air / Hose Reel':key[0].toUpperCase()+key.slice(1)} — X ${d.x} ft, Y ${d.y} ft`; sel.appendChild(o); }
  sel.value=old; updateRoofDropAssetEditor();
}
function getSelectedRoofDrop() { const id=document.getElementById('roof-drop-asset-select')?.value; if(!id) return null; for(const key of ['electrical','gas','air']) { const d=customRoofDrops[key].find(x=>x.id===id); if(d) return {key,drop:d}; } return null; }
function updateRoofDropAssetEditor() {
  const item = getSelectedRoofDrop();
  const tier = document.getElementById('roof-drop-asset-tier');
  const size = document.getElementById('roof-drop-asset-size');
  const label = document.getElementById('roof-drop-size-label');
  const posX = document.getElementById('roof-drop-pos-x');
  const posY = document.getElementById('roof-drop-pos-y');
  const nudgeBtns = [
    'btn-roof-drop-nudge-left', 'btn-roof-drop-nudge-right',
    'btn-roof-drop-nudge-up', 'btn-roof-drop-nudge-down'
  ].map(id => document.getElementById(id));
  const stepLabel = document.getElementById('roof-drop-nudge-step');
  if (stepLabel) stepLabel.textContent = String(Number(snapIncrement) || 0.5);
  if (tier) tier.disabled = !item;
  if (size) size.disabled = !item;
  if (posX) posX.disabled = !item;
  if (posY) posY.disabled = !item;
  nudgeBtns.forEach(btn => { if (btn) btn.disabled = !item; });
  if (label) label.textContent = (item?.drop.size ?? 0.1).toFixed(2) + ' ft';
  if (item && tier) tier.value = String(item.drop.tier);
  if (item && size) size.value = String(item.drop.size);
  if (item && posX && document.activeElement !== posX) posX.value = Number(item.drop.x).toFixed(2);
  if (item && posY && document.activeElement !== posY) posY.value = Number(item.drop.y).toFixed(2);
  if (!item) {
    if (posX) posX.value = '';
    if (posY) posY.value = '';
  }
}
function clampRoofDropPosition(x, y) {
  const bounds = (typeof customRoomOutline !== 'undefined' && customRoomOutline && customRoomOutline.length >= 3)
    ? customRoomOutline.reduce((b, p) => ({
        minX: Math.min(b.minX, p[0]), maxX: Math.max(b.maxX, p[0]),
        minY: Math.min(b.minY, p[1]), maxY: Math.max(b.maxY, p[1])
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
    : { minX: 0, maxX: roomWidthFt, minY: 0, maxY: roomLengthFt };
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, Number(x) || 0)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, Number(y) || 0))
  };
}
function applySelectedRoofDropPosition(x, y, { refreshSelect = true } = {}) {
  const item = getSelectedRoofDrop();
  if (!item) return;
  const clamped = clampRoofDropPosition(x, y);
  item.drop.x = Math.round(clamped.x * 100) / 100;
  item.drop.y = Math.round(clamped.y * 100) / 100;
  renderCustomRoofDrops(item.key);
  if (refreshSelect) refreshRoofDropAssetSelect(item.drop.id);
  else updateRoofDropAssetEditor();
  updateRoofRouteStatus(`Drop moved to X ${item.drop.x.toFixed(2)} ft, Y ${item.drop.y.toFixed(2)} ft.`);
}
function nudgeSelectedRoofDrop(dx, dy) {
  const item = getSelectedRoofDrop();
  if (!item) return;
  const step = Number(snapIncrement) || 0.5;
  applySelectedRoofDropPosition(item.drop.x + dx * step, item.drop.y + dy * step);
}

// ============================================================================
// CTRL + RIGHT-CLICK → pick nearby utility drop & open Roof properties
// ============================================================================
const UTILITY_DROP_PICK_RADIUS_FT = 4.0;
const utilityDropTypeLabel = {
  electrical: 'Electrical',
  gas: 'Gas',
  air: 'Air / Hose Reel'
};
const utilityDropTypeColor = {
  electrical: '#ef4444',
  gas: '#facc15',
  air: '#38bdf8'
};

function hideUtilityDropContextMenu() {
  const menu = document.getElementById('utility-drop-context-menu');
  if (menu) {
    menu.classList.remove('open');
    menu.innerHTML = '';
  }
}

function openUtilityDropInProperties(dropId) {
  if (!dropId) return;
  // Ensure Roof Utilities pane is visible with properties
  try {
    if (typeof openFolder === 'function') openFolder('roof');
    else if (typeof selectFolderTab === 'function') selectFolderTab('roof');
  } catch (_) {}
  const sel = document.getElementById('roof-drop-asset-select');
  if (sel) {
    // Rebuild options in case list is stale, then select
    if (typeof refreshRoofDropAssetSelect === 'function') refreshRoofDropAssetSelect(dropId);
    else {
      sel.value = dropId;
      if (typeof updateRoofDropAssetEditor === 'function') updateRoofDropAssetEditor();
    }
  }
  // Highlight selected drop meshes
  try {
    Object.keys(customRoofDrops).forEach(k => renderCustomRoofDrops(k));
  } catch (_) {}
  // Scroll editor into view inside the dropdown body
  const editor = document.getElementById('roof-drop-asset-editor');
  if (editor) {
    requestAnimationFrame(() => {
      editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      editor.style.outline = '1px solid rgba(167,139,250,.7)';
      editor.style.outlineOffset = '2px';
      setTimeout(() => { editor.style.outline = ''; editor.style.outlineOffset = ''; }, 1200);
    });
  }
  const item = typeof getSelectedRoofDrop === 'function' ? getSelectedRoofDrop() : null;
  if (item && typeof updateRoofRouteStatus === 'function') {
    updateRoofRouteStatus(`Selected ${utilityDropTypeLabel[item.key] || item.key} drop at X ${Number(item.drop.x).toFixed(2)} ft, Y ${Number(item.drop.y).toFixed(2)} ft.`);
  }
  hideUtilityDropContextMenu();
}

function collectNearbyUtilityDrops(worldX, worldY, radiusFt = UTILITY_DROP_PICK_RADIUS_FT) {
  const found = [];
  for (const key of ['electrical', 'gas', 'air']) {
    for (const d of (customRoofDrops[key] || [])) {
      const dist = Math.hypot(Number(d.x) - worldX, Number(d.y) - worldY);
      if (dist <= radiusFt) {
        found.push({ key, drop: d, dist });
      }
    }
  }
  found.sort((a, b) => a.dist - b.dist);
  return found;
}

function collectUtilityDropsFromRayHits(hits) {
  const byId = new Map();
  for (const hit of hits) {
    let obj = hit.object;
    let dropId = null;
    let key = null;
    while (obj) {
      if (obj.userData?.dropId) {
        dropId = obj.userData.dropId;
        break;
      }
      obj = obj.parent;
    }
    if (!dropId) continue;
    for (const k of ['electrical', 'gas', 'air']) {
      const d = (customRoofDrops[k] || []).find(x => x.id === dropId);
      if (d) { key = k; byId.set(dropId, { key, drop: d, dist: hit.distance }); break; }
    }
  }
  return [...byId.values()].sort((a, b) => a.dist - b.dist);
}

function showUtilityDropContextMenu(clientX, clientY, candidates) {
  const menu = document.getElementById('utility-drop-context-menu');
  if (!menu) return;
  menu.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'udm-title';
  title.textContent = 'Select Utility Drop';
  menu.appendChild(title);

  if (!candidates.length) {
    const empty = document.createElement('div');
    empty.className = 'udm-empty';
    empty.textContent = 'No utility drops near this point.';
    menu.appendChild(empty);
    const hint = document.createElement('div');
    hint.className = 'udm-hint';
    hint.textContent = 'Ctrl + Right-click near a drop to select it.';
    menu.appendChild(hint);
  } else {
    candidates.forEach(({ key, drop, dist }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'udm-item';
      btn.setAttribute('role', 'menuitem');
      const dot = document.createElement('span');
      dot.className = 'udm-dot';
      dot.style.background = utilityDropTypeColor[key] || '#a78bfa';
      const body = document.createElement('div');
      const name = document.createElement('div');
      name.textContent = `${utilityDropTypeLabel[key] || key} · ${drop.name || drop.id}`;
      const meta = document.createElement('div');
      meta.className = 'udm-meta';
      meta.textContent = `X ${Number(drop.x).toFixed(2)} ft, Y ${Number(drop.y).toFixed(2)} ft · ${dist.toFixed(1)} ft away`;
      body.append(name, meta);
      btn.append(dot, body);
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openUtilityDropInProperties(drop.id);
      });
      menu.appendChild(btn);
    });
  }

  menu.classList.add('open');
  // Position within viewport
  const pad = 8;
  menu.style.left = '0px';
  menu.style.top = '0px';
  // Force layout
  const rect = menu.getBoundingClientRect();
  let left = clientX;
  let top = clientY;
  if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
  if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
  left = Math.max(pad, left);
  top = Math.max(pad, top);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function handleUtilityDropContextPick(e) {
  // Only Ctrl/Cmd + right mouse button
  if (!(e.ctrlKey || e.metaKey)) return false;
  if (e.button !== 2 && e.type !== 'contextmenu') return false;
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

  updatePointer(e);
  raycaster.setFromCamera(pointer, activeCam);

  // Prefer direct mesh hits on drop geometry
  const dropGroups = Object.values(customRoofDropGroups || {}).filter(Boolean);
  const meshHits = dropGroups.length
    ? raycaster.intersectObjects(dropGroups, true)
    : [];
  let candidates = collectUtilityDropsFromRayHits(meshHits);

  // Also include nearby drops by floor plan distance under the cursor
  const planeHit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
    const wx = planeHit.x;
    const wy = toWarehouseY(planeHit.z);
    const nearby = collectNearbyUtilityDrops(wx, wy, UTILITY_DROP_PICK_RADIUS_FT);
    const seen = new Set(candidates.map(c => c.drop.id));
    for (const n of nearby) {
      if (!seen.has(n.drop.id)) {
        candidates.push(n);
        seen.add(n.drop.id);
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
  }

  showUtilityDropContextMenu(e.clientX, e.clientY, candidates);
  return true;
}

// Capture-phase so OrbitControls contextmenu suppress doesn't eat Ctrl+Right-click
renderer.domElement.addEventListener('contextmenu', (e) => {
  if (e.ctrlKey || e.metaKey) {
    handleUtilityDropContextPick(e);
  } else {
    hideUtilityDropContextMenu();
  }
}, true);

document.addEventListener('pointerdown', (e) => {
  const menu = document.getElementById('utility-drop-context-menu');
  if (!menu || !menu.classList.contains('open')) return;
  if (menu.contains(e.target)) return;
  hideUtilityDropContextMenu();
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideUtilityDropContextMenu();
}, true);
function addRoofDropAsset(key,pt) { const drop={id:'drop-'+(roofDropAssetIdCounter++),x:pt.x,y:pt.y,tier:Number(document.getElementById('roof-drop-asset-tier').value)||1,size:Number(document.getElementById('roof-drop-asset-size').value)||0.1}; customRoofDrops[key].push(drop); renderCustomRoofDrops(key); refreshRoofDropAssetSelect(drop.id); updateRoofRouteStatus(`${key==='air'?'Air / hose reel':key[0].toUpperCase()+key.slice(1)} drop asset added${pt.snapped?' and snapped to the nearest '+key+' roof line':''} at X ${pt.x.toFixed(2)} ft, Y ${pt.y.toFixed(2)} ft. Select it below to edit height and size.`); }
function placeRoofVerticalDrop(pt) { if(!roofDropAssetPlacementType) return; addRoofDropAsset(roofDropAssetPlacementType,pt); roofDropAssetPlacementType=null; controls.enabled=true; renderer.domElement.style.cursor=''; }

// Visibility toggles for the overhead utility layer and individual utility types.
document.getElementById('toggle-roof-utilities').addEventListener('change', e => { roofUtilitiesGroup.visible = e.target.checked; });
document.getElementById('toggle-utilities-grid')?.addEventListener('change', e => {
  setUtilitiesGridVisible(e.target.checked);
});
// Build utilities grid once definitions are live (starts hidden until toggled on).
if (typeof rebuildUtilitiesGrid === 'function') rebuildUtilitiesGrid();

document.getElementById('toggle-roof-electrical').addEventListener('change', e => { roofUtilityGroups.electrical.visible = e.target.checked; });
document.getElementById('toggle-roof-gas').addEventListener('change', e => { roofUtilityGroups.gas.visible = e.target.checked; });
document.getElementById('toggle-roof-air').addEventListener('change', e => { roofUtilityGroups.air.visible = e.target.checked; });
const roofTypeSelect = document.getElementById('custom-roof-type');
document.getElementById('btn-roof-draw').addEventListener('click', () => {
  roofRouteDrawing=true; roofRoutePointerDown=false; roofRouteCurrentPoints=[]; controls.enabled=false; renderAllCustomRoofRoutes();
  renderer.domElement.style.cursor='crosshair'; updateRoofRouteStatus('Drawing mode active — click points along the floor grid (or click-drag), then press Finish line to save.');
});
document.getElementById('btn-roof-finish').addEventListener('click', finishRoofRoute);
for (const [id,key] of [['btn-add-drop-electrical','electrical'],['btn-add-drop-gas','gas'],['btn-add-drop-air','air']]) document.getElementById(id).addEventListener('click',()=>{ roofDropAssetPlacementType=key; roofDropPlacementMode=false; roofDropHoverBox.visible=false; Object.values(customRoofRoutePickGroups).forEach(g=>g.visible=false); controls.enabled=true; renderer.domElement.style.cursor='crosshair'; updateRoofRouteStatus(`Adding ${key==='air'?'Air / Hose Reel':key[0].toUpperCase()+key.slice(1)} asset — click near a matching roof utility line to snap to its nearest point; otherwise it places on the floor grid. The drop starts at the selected tier and rises to the roof utility line. The placement type stays active until the click succeeds.`); });
document.getElementById('roof-drop-asset-select').addEventListener('change',()=>{ updateRoofDropAssetEditor(); Object.keys(customRoofDrops).forEach(renderCustomRoofDrops); });
document.getElementById('roof-drop-asset-tier').addEventListener('change',()=>{const item=getSelectedRoofDrop();if(!item)return;item.drop.tier=Number(document.getElementById('roof-drop-asset-tier').value);renderCustomRoofDrops(item.key);updateRoofRouteStatus('Selected utility drop start tier updated; the drop rises to the roof utility line.');});
document.getElementById('roof-drop-asset-size').addEventListener('input',()=>{const item=getSelectedRoofDrop();if(!item)return;item.drop.size=Number(document.getElementById('roof-drop-asset-size').value);document.getElementById('roof-drop-size-label').textContent=item.drop.size.toFixed(2)+' ft';renderCustomRoofDrops(item.key);});
document.getElementById('roof-drop-pos-x')?.addEventListener('change', () => {
  const item = getSelectedRoofDrop(); if (!item) return;
  applySelectedRoofDropPosition(document.getElementById('roof-drop-pos-x').value, item.drop.y);
});
document.getElementById('roof-drop-pos-y')?.addEventListener('change', () => {
  const item = getSelectedRoofDrop(); if (!item) return;
  applySelectedRoofDropPosition(item.drop.x, document.getElementById('roof-drop-pos-y').value);
});
document.getElementById('btn-roof-drop-nudge-left')?.addEventListener('click', () => nudgeSelectedRoofDrop(-1, 0));
document.getElementById('btn-roof-drop-nudge-right')?.addEventListener('click', () => nudgeSelectedRoofDrop(1, 0));
document.getElementById('btn-roof-drop-nudge-up')?.addEventListener('click', () => nudgeSelectedRoofDrop(0, 1));
document.getElementById('btn-roof-drop-nudge-down')?.addEventListener('click', () => nudgeSelectedRoofDrop(0, -1));
document.getElementById('btn-roof-drop-delete').addEventListener('click',()=>{const item=getSelectedRoofDrop();if(!item)return;customRoofDrops[item.key]=customRoofDrops[item.key].filter(d=>d.id!==item.drop.id);renderCustomRoofDrops(item.key);refreshRoofDropAssetSelect();updateRoofRouteStatus('Selected drop asset deleted.');});
document.getElementById('btn-roof-drop-clear').addEventListener('click',()=>{for(const key of ['electrical','gas','air']){customRoofDrops[key]=[];renderCustomRoofDrops(key);}refreshRoofDropAssetSelect();updateRoofRouteStatus('All vertical drop assets cleared.');});
document.getElementById('btn-roof-undo').addEventListener('click', () => { if(roofRouteDrawing && roofRouteCurrentPoints.length) { roofRouteCurrentPoints.pop(); renderCustomRoofRoute(roofTypeSelect.value); updateRoofRouteStatus(`Removed last point. ${roofRouteCurrentPoints.length} points remain in the active line.`); } else { const arr=customRoofRoutes[roofTypeSelect.value]; if(arr.length) { arr[arr.length-1].pop(); if(arr[arr.length-1].length<2) arr.pop(); renderCustomRoofRoute(roofTypeSelect.value); } } });
document.getElementById('btn-roof-clear-route').addEventListener('click', () => { const key=roofTypeSelect.value; customRoofRoutes[key]=[]; customRoofDrops[key]=[]; renderCustomRoofDrops(key); roofRouteCurrentPoints=[]; roofRoutePointerDown=false; roofRouteDrawing=false; roofDropPlacementMode=false; roofDropAssetPlacementType=null; roofDropHoverBox.visible=false; Object.values(customRoofRoutePickGroups).forEach(g=>g.visible=false); controls.enabled=true; renderer.domElement.style.cursor=''; clearCustomRoofMeshes(key); renderCustomRoofRoute(key); updateRoofRouteStatus('All lines of the selected type cleared.'); });
roofTypeSelect.addEventListener('change', () => { if(roofRouteDrawing) { roofRouteCurrentPoints=[]; renderAllCustomRoofRoutes(); } });
renderer.domElement.addEventListener('pointermove', e => {
  if (!roofDropPlacementMode) return;
  const key = roofTypeSelect.value;
  updatePointer(e); raycaster.setFromCamera(pointer, activeCam);
  const group = customRoofRoutePickGroups[key];
  const hits = group && group.visible ? raycaster.intersectObjects(group.children, true) : [];
  if (!hits.length) { roofDropHoverBox.visible=false; renderer.domElement.style.cursor='crosshair'; return; }
  const hit = hits[0].point;
  const pt = nearestRoofRoutePoint(key, { x: hit.x, y: toWarehouseY(hit.z) });
  if (!pt) { roofDropHoverBox.visible=false; return; }
  roofDropHoverBox.position.set(pt.x, 10.62, toWorldZ(pt.y)); roofDropHoverBox.visible=true;
  renderer.domElement.style.cursor='pointer';
  updateRoofRouteStatus(`Selection point ready — X ${pt.x} ft, Y ${pt.y} ft. Click to place the vertical drop.`);
}, true);
renderer.domElement.addEventListener('pointerdown', e => {
  if(roofDropAssetPlacementType && !(e.pointerType==='mouse' && e.button!==0)) {
    const gridPt=roofGridPoint(e); if(!gridPt){updateRoofRouteStatus('Click inside the warehouse floor grid to place the drop asset.');return;}
    const snapped=nearestRoofRoutePoint(roofDropAssetPlacementType,gridPt);
    const pt=snapped ? {...snapped,snapped:true} : gridPt;
    e.preventDefault(); e.stopImmediatePropagation(); placeRoofVerticalDrop(pt); return;
  }
  if(roofDropPlacementMode && !(e.pointerType==='mouse' && e.button!==0)) {
    const key = roofTypeSelect.value;
    updatePointer(e); raycaster.setFromCamera(pointer, activeCam);
    const group = customRoofRoutePickGroups[key];
    const hits = group && group.visible ? raycaster.intersectObjects(group.children, true) : [];
    e.preventDefault(); e.stopImmediatePropagation();
    if(!hits.length) { updateRoofRouteStatus('Hover over a pipe segment until the green selection box appears, then click.'); return; }
    const hit = hits[0].point;
    const pt = nearestRoofRoutePoint(key, { x: hit.x, y: toWarehouseY(hit.z) });
    if(!pt) { updateRoofRouteStatus('Move the pointer onto a pipe segment until the green box appears.'); return; }
    placeRoofVerticalDrop(pt);
    roofDropHoverBox.visible=false; Object.values(customRoofRoutePickGroups).forEach(g=>g.visible=false);
    return;
  }
  if(!roofRouteDrawing || (e.pointerType==='mouse' && e.button!==0)) return;
  const pt=roofGridPoint(e); if(!pt) { updateRoofRouteStatus('Click inside the warehouse floor area to add a line point.'); return; }
  e.preventDefault(); e.stopImmediatePropagation();
  // Support ordinary point-and-click drawing as well as click-drag drawing.
  // Snap each new point to one axis relative to the previous point so routes stay orthogonal.
  const last=roofRouteCurrentPoints[roofRouteCurrentPoints.length-1];
  let next=pt;
  if(last) {
    const dx=pt.x-last.x, dy=pt.y-last.y;
    next=Math.abs(dx)>=Math.abs(dy) ? {x:pt.x,y:last.y} : {x:last.x,y:pt.y};
  }
  roofRoutePointerDown=true; controls.enabled=false; renderer.domElement.setPointerCapture?.(e.pointerId); addRoofRoutePoint(next);
}, true);
renderer.domElement.addEventListener('pointermove', e => {
  if(!roofRouteDrawing || !roofRoutePointerDown) return;
  const pt=roofGridPoint(e);
  if(pt) {
    const last=roofRouteCurrentPoints[roofRouteCurrentPoints.length-1];
    // Orthogonal-only routing: every segment is locked to one grid axis.
    // Choose the dominant direction of travel and keep the other coordinate
    // identical to the previous point, so a route can never run diagonally.
    if(last) {
      const dx = pt.x - last.x, dy = pt.y - last.y;
      if(Math.max(Math.abs(dx), Math.abs(dy)) >= 2) {
        const next = Math.abs(dx) >= Math.abs(dy)
          ? { x: pt.x, y: last.y }
          : { x: last.x, y: pt.y };
        if(next.x !== last.x || next.y !== last.y) {
          e.preventDefault(); e.stopImmediatePropagation(); addRoofRoutePoint(next);
        }
      }
    }
  }
}, true);
renderer.domElement.addEventListener('pointerup', e => {
  if(roofRouteDrawing && roofRoutePointerDown) { e.preventDefault(); e.stopImmediatePropagation(); roofRoutePointerDown=false; updateRoofRouteStatus(`Line paused at ${roofRouteCurrentPoints.length} points. Drag again to continue, or press Finish line to save.`); }
}, true);


// ============================================================================
// 4. THREE ULINE 8ft x 3ft SCISSOR LIFT CONVEYORS (X = 14..17, Y = 9..33)
// ============================================================================
const conveyors = [];
const yellowMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.35, metalness: 0.3 });
const rollerMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.7 });

function createUlineConveyor(xFt, yStartFt) {
  const group = new THREE.Group();
  const w = 3, l = 8;
  const cx = xFt + w / 2;
  const cz = toWorldZ(yStartFt + l / 2);
  group.position.set(cx, 0, cz);

  // Base Frame
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, l), yellowMat);
  base.position.y = 0.125;
  group.add(base);

  // Scissor Arms
  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, l * 0.92), yellowMat);
  const arm2 = arm1.clone();
  const arm3 = arm1.clone();
  const arm4 = arm1.clone();
  arm1.position.x = -w/2 + 0.25;
  arm2.position.x = -w/2 + 0.45;
  arm3.position.x =  w/2 - 0.25;
  arm4.position.x =  w/2 - 0.45;
  group.add(arm1, arm2, arm3, arm4);

  // Top Roller Deck
  const deckGroup = new THREE.Group();
  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, l), yellowMat);
  railL.position.x = -w / 2 + 0.1;
  const railR = railL.clone();
  railR.position.x = w / 2 - 0.1;
  deckGroup.add(railL, railR);

  const rollerGeo = new THREE.CylinderGeometry(0.1, 0.1, w - 0.4, 16);
  rollerGeo.rotateZ(Math.PI / 2);
  for (let i = 0; i < 22; i++) {
    const r = new THREE.Mesh(rollerGeo, rollerMat);
    r.position.z = -l / 2 + 0.3 + (i / 21) * (l - 0.6);
    deckGroup.add(r);
  }
  group.add(deckGroup);
  scene.add(group);

  return { group, deckGroup, arms: [arm1, arm2, arm3, arm4], l, w, xFt, yStartFt, yStart: yStartFt, height: 3.0 };
}

[9, 17, 25].forEach(yStart => { const c = createUlineConveyor(14, yStart); scene.remove(c.group); conveyors.push(c); });

const conveyorSliderIds = ['lift-slider', 'lift-slider-2', 'lift-slider-3'];
const conveyorValIds = ['lift-val', 'lift-val-2', 'lift-val-3'];

function updateSingleConveyorHeight(idx, hFt) {
  const c = conveyors[idx];
  if (!c) return;
  const clampedH = Math.max(1.0, Math.min(4.2, Number(hFt) || 3.0));
  c.height = clampedH;
  c.deckGroup.position.y = clampedH;
  const midY = clampedH / 2;
  const angle = Math.atan2(clampedH - 0.35, c.l * 0.85);
  c.arms[0].position.y = midY; c.arms[0].rotation.x =  angle;
  c.arms[1].position.y = midY; c.arms[1].rotation.x = -angle;
  c.arms[2].position.y = midY; c.arms[2].rotation.x =  angle;
  c.arms[3].position.y = midY; c.arms[3].rotation.x = -angle;

  const sliderEl = document.getElementById(conveyorSliderIds[idx]);
  if (sliderEl && parseFloat(sliderEl.value) !== clampedH) {
    sliderEl.value = clampedH.toFixed(1);
  }
  const valEl = document.getElementById(conveyorValIds[idx]);
  if (valEl) {
    valEl.textContent = `${clampedH.toFixed(1)} ft (${Math.round(clampedH * 12)}")`;
  }
}

function updateConveyorHeight(hFt) {
  if (Array.isArray(hFt)) {
    hFt.forEach((h, idx) => updateSingleConveyorHeight(idx, h));
  } else {
    conveyors.forEach((_, idx) => updateSingleConveyorHeight(idx, hFt));
  }
}
updateConveyorHeight(3.0);

// ============================================================================
// 5. FLOOR MARKINGS & FIXTURES (Blue Uline Shelves are movable & resizable objects)
// ============================================================================
const DEFAULT_BLUE_SHELVES = [];

// Structural Steel I-Beam Column at X = 34..36, Y = 17..19 (replaces the middle 2ft x 2ft shelf)
function createSteelIBeamColumn(xFt, yFt, wFt = 2, lFt = 2, hFt = 10) {
  const group = new THREE.Group();
  const cx = xFt + wFt / 2;
  const cz = toWorldZ(yFt + lFt / 2);
  group.position.set(cx, 0, cz);

  const iBeamSteelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.32,
    metalness: 0.78
  });
  const basePlateMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.45,
    metalness: 0.65
  });
  const safetyStripeMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.4,
    metalness: 0.2
  });

  // Floor anchor base plate (2ft x 2ft footprint)
  const basePlate = new THREE.Mesh(new THREE.BoxGeometry(wFt, 0.16, lFt), basePlateMat);
  basePlate.position.y = 0.08;
  basePlate.receiveShadow = true;
  group.add(basePlate);

  // 4 anchor bolts on base plate corners
  const boltGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.24, 10);
  const bxOff = wFt / 2 - 0.22;
  const bzOff = lFt / 2 - 0.22;
  [[-bxOff, -bzOff], [bxOff, -bzOff], [-bxOff, bzOff], [bxOff, bzOff]].forEach(([bx, bz]) => {
    const bolt = new THREE.Mesh(boltGeo, iBeamSteelMat);
    bolt.position.set(bx, 0.16, bz);
    group.add(bolt);
  });

  // Wide-flange Steel I-Beam profile (flanges along Z/North-South, web along X/East-West)
  const beamW = wFt * 0.72;
  const beamD = lFt * 0.72;
  const flangeT = 0.16;
  const webT = 0.14;

  const flangeGeo = new THREE.BoxGeometry(beamW, hFt, flangeT);
  const northFlange = new THREE.Mesh(flangeGeo, iBeamSteelMat);
  northFlange.position.set(0, hFt / 2, -beamD / 2 + flangeT / 2);
  northFlange.castShadow = true;
  northFlange.receiveShadow = true;
  group.add(northFlange);

  const southFlange = new THREE.Mesh(flangeGeo, iBeamSteelMat);
  southFlange.position.set(0, hFt / 2, beamD / 2 - flangeT / 2);
  southFlange.castShadow = true;
  southFlange.receiveShadow = true;
  group.add(southFlange);

  const webGeo = new THREE.BoxGeometry(webT, hFt, beamD - 2 * flangeT);
  const webMesh = new THREE.Mesh(webGeo, iBeamSteelMat);
  webMesh.position.set(0, hFt / 2, 0);
  webMesh.castShadow = true;
  webMesh.receiveShadow = true;
  group.add(webMesh);

  // Safety yellow column base collar & crisp wireframe outline for 2D/3D CAD visibility
  const collarH = 3.5;
  const collarEdge = new THREE.EdgesGeometry(new THREE.BoxGeometry(beamW + 0.04, collarH, beamD + 0.04));
  const collarWire = new THREE.LineSegments(collarEdge, new THREE.LineBasicMaterial({ color: 0xfacc15 }));
  collarWire.position.y = collarH / 2;
  group.add(collarWire);

  const topCap = new THREE.Mesh(new THREE.BoxGeometry(wFt * 0.84, 0.14, lFt * 0.84), safetyStripeMat);
  topCap.position.y = hFt + 0.07;
  group.add(topCap);

  const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(beamW, hFt, beamD));
  const edgeWire = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xe2e8f0 }));
  edgeWire.position.y = hFt / 2;
  group.add(edgeWire);

  scene.add(group);
  return group;
}
const fixedSteelIBeamColumn = createSteelIBeamColumn(34, 17, 2, 2, 10); scene.remove(fixedSteelIBeamColumn);

// Unshaded fixtures & bottom [C] / [X] boxes
const tableMat = new THREE.MeshStandardMaterial({ color: 0x64748b });
function addFixtureBox(xFt, yFt, wFt, lFt, hFt = 3) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(wFt, hFt, lFt), tableMat);
  m.position.set(xFt + wFt / 2, hFt / 2, toWorldZ(yFt + lFt / 2));
  scene.add(m);
  return m;
}
const fixedAdjacentFixtureBox = addFixtureBox(34, 11, 2, 6, 3.0); scene.remove(fixedAdjacentFixtureBox);
// The two grey boxes are created below as editable assets so they can be selected and deleted.

// Red Triangle Swing Zone on Floor
const triPts = [
  new THREE.Vector3(1, 0.05, toWorldZ(1)),
  new THREE.Vector3(14, 0.05, toWorldZ(15)),
  new THREE.Vector3(14, 0.05, toWorldZ(15)),
  new THREE.Vector3(24, 0.05, toWorldZ(1)),
  new THREE.Vector3(1, 0.05, toWorldZ(1)),
  new THREE.Vector3(24, 0.05, toWorldZ(1)),
  new THREE.Vector3(15, 0.05, toWorldZ(1)),
  new THREE.Vector3(19, 0.05, toWorldZ(8))
];
const gorbelSwingEnvelope = new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints(triPts),
  new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 })
);

// Gorbel-style freestanding jib crane model. The red floor triangle is the
// existing swing-envelope marking from the layout; this is a visual model,
// not a manufacturer-certified or dimensionally verified crane design.
const gorbelCrane = new THREE.Group();
gorbelCrane.add(gorbelSwingEnvelope); // Keep the swing-envelope marking with the crane when it moves.
const craneYellow = new THREE.MeshStandardMaterial({ color: 0xf4b400, roughness: 0.38, metalness: 0.28 });
const craneDark = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.48, metalness: 0.55 });
const craneSteel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3, metalness: 0.7 });
const craneBlack = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.45, metalness: 0.35 });
const craneX = 14, craneY = 0, craneZ = toWorldZ(craneY);
// Floor base plate and anchor feet
const craneBase = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 2.0), craneDark);
craneBase.position.set(craneX, 0.11, craneZ); gorbelCrane.add(craneBase);
const anchorGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.18, 12);
[[-0.72,-0.72],[0.72,-0.72],[-0.72,0.72],[0.72,0.72]].forEach(([dx,dz]) => {
  const bolt = new THREE.Mesh(anchorGeo, craneSteel); bolt.position.set(craneX+dx,0.20,craneZ+dz); gorbelCrane.add(bolt);
});
// Vertical mast stays fixed; the jib assembly rotates around the mast through 140 degrees.
const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.38,10,16), craneYellow);
mast.position.set(craneX,5.2,craneZ); mast.castShadow = true; gorbelCrane.add(mast);
const jibAssembly = new THREE.Group();
jibAssembly.position.set(craneX, 0, craneZ);
const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.48,0.48,0.30,16), craneDark);
collar.position.set(0,9.55,0); jibAssembly.add(collar);
// Boom reaches the center of the nearest rolling conveyor (the first 8 ft conveyor: x=14..17, y=9..17).
const boomEndX = 15.5, boomEndY = 13.0;
const boomLocalX = boomEndX - craneX;
const boomLocalZ = toWorldZ(boomEndY) - craneZ;
const boomLength = Math.sqrt(boomLocalX*boomLocalX + boomLocalZ*boomLocalZ);
const boomAngle = Math.atan2(-boomLocalZ, boomLocalX);
const boom = new THREE.Mesh(new THREE.BoxGeometry(boomLength,0.48,0.62), craneYellow);
boom.position.set(boomLocalX/2,9.55,boomLocalZ/2);
boom.rotation.y = boomAngle; boom.castShadow = true; jibAssembly.add(boom);
const rail = new THREE.Mesh(new THREE.BoxGeometry(boomLength-0.7,0.12,0.16), craneDark);
rail.position.set(boomLocalX/2,9.25,boomLocalZ/2); rail.rotation.y=boomAngle; jibAssembly.add(rail);
const stop = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.58,0.72), craneDark);
stop.position.set(boomLocalX,9.55,boomLocalZ); jibAssembly.add(stop);
// Trolley, motor, hoist and hanging hook at the working end.
const workX = boomLocalX - 0.8, workZ = boomLocalZ;
const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.38,0.82), craneDark);
trolley.position.set(workX,9.02,workZ); jibAssembly.add(trolley);
const motor = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.62,0.56), craneYellow);
motor.position.set(workX,8.55,workZ); jibAssembly.add(motor);
const hoistCable = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,2.2,8), craneBlack);
hoistCable.position.set(workX,7.15,workZ); jibAssembly.add(hoistCable);
const hookStem = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.32,10), craneSteel);
hookStem.position.set(workX,5.92,workZ); jibAssembly.add(hookStem);
const hook = new THREE.Mesh(new THREE.TorusGeometry(0.20,0.055,8,16,Math.PI*1.55), craneSteel);
hook.rotation.x = Math.PI/2; hook.position.set(workX,5.70,workZ); jibAssembly.add(hook);
gorbelCrane.add(jibAssembly);
const craneAngleSlider = document.getElementById('crane-angle-slider');
const craneAngleVal = document.getElementById('crane-angle-val');
function setCraneSwingAngle(degrees) {
  const angle = Math.max(0, Math.min(140, Number(degrees) || 0));
  jibAssembly.rotation.y = THREE.MathUtils.degToRad(angle);
  craneAngleSlider.value = String(angle);
  craneAngleVal.textContent = `${angle}° / 140°`;
}
craneAngleSlider.addEventListener('input', e => setCraneSwingAngle(e.target.value));
document.getElementById('crane-angle-home').addEventListener('click', () => setCraneSwingAngle(0));

// ============================================================================
// 6. MOVABLE STEEL BINS SYSTEM (4ft x 4ft Large & 3ft x 3.5ft Small)
// ============================================================================
const bins = [];
let selectedBin = null;
let suppressDefaultShelvesOnLoad = false;
let isDraggingBin = false;
let isDraggingGorbelCrane = false;
let isDraggingFixedConveyor = false;
let activeFixedConveyor = null;
let fixedConveyorDragOffset = new THREE.Vector3();
let gorbelDragOffset = new THREE.Vector3();
let isResizingBin = false;
let isDraggingWall = false;
let activeWallExpandDir = null;
let wallDragStartPoint = new THREE.Vector3();
let wallDragStartWidth = 36;
let wallDragStartLength = 44;
let wallDragAppliedX = 0;
let wallDragAppliedY = 0;
let wallDragSymmetric = false;
let activeWallEdgeIndex = null;
let wallEdgeDragOutline = null;
let activeResizeDir = null;
let resizeStartBounds = null;
let dragOffset = new THREE.Vector3();
let snapIncrement = 0.5;
let binIdCounter = 1;

const matLargeBin = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.35, metalness: 0.45 });
const matSmallBin = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.45 });
const matBinSelected = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.3, emissive: 0x451a03 });

// Cached procedural textures & materials for high-fidelity Industrial Wire Mesh Bins


function spawnBin(type, xFt, yFt, customW, customL, customTiers, customAssetId = null, label = "") {
  const isLarge = type === 'large';
  const baseW = customW ?? (type === 'custom' ? 4.0 : (type === 'pallet' ? 3.333 : (type === 'palletpal' ? 4.0 : (type === 'fixture' ? 2.0 : (type === 'table' ? 3.0 : (type === 'shelf' ? 2.0 : (type === 'ibeam' ? 2.0 : (type === 'guardrail' ? 0.5 : (type === 'crane' ? 4.0 : (type === 'uline_rolling_conveyor' ? 2.0 : (type === 'conveyor' ? 3.0 : (isLarge ? 4.0 : 3.0))))))))))));
  const baseL = customL ?? (type === 'custom' ? 4.0 : (type === 'pallet' ? 4.0 : (type === 'palletpal' ? 4.0 : (type === 'fixture' ? 2.0 : (type === 'table' ? 5.0 : (type === 'shelf' ? 4.0 : (type === 'ibeam' ? 4.0 : (type === 'guardrail' ? 6.0 : (type === 'crane' ? 4.0 : (type === 'uline_rolling_conveyor' ? 8.0 : (type === 'conveyor' ? 8.0 : (isLarge ? 4.0 : 3.5))))))))))));
  const defaultTiers = customTiers ?? (type === 'shelf' ? 4 : 1);

  const binObj = {
    id: binIdCounter++,
    type,
    w: baseW,
    l: baseL,
    x: xFt, // Bottom-left corner X in warehouse feet
    y: yFt, // Bottom-left corner Y in warehouse feet
    rotated: false,
    facing: (type === 'large' && xFt <= 8) ? 1 : 0,
    tiers: defaultTiers,
    color: type === 'custom' ? '#ffffff' : (type === 'fixture' ? '#64748b' : (type === 'table' ? '#2563eb' : (type === 'pallet' ? '#b88955' : (type === 'palletpal' ? '#facc15' : (type === 'shelf' ? '#1d4ed8' : (type === 'uline_rolling_conveyor' ? '#1d4ed8' : (type === 'ibeam' ? '#9ca3af' : (type === 'guardrail' ? '#facc15' : (type === 'crane' ? '#eab308' : (type === 'conveyor' ? '#eab308' : (isLarge ? '#059669' : '#0284c7'))))))))))),
    assetHeight: type === 'crane' ? 8 : (type === 'uline_rolling_conveyor' ? 2.8 : (type === 'conveyor' ? 3 : undefined)),
    heightFt: type === 'pallet' ? 0.45 : (type === 'palletpal' ? 3 : (type === 'table' || type === 'fixture' ? 3 : (type === 'shelf' ? 6 : (type === 'ibeam' ? 10 : (type === 'guardrail' ? 3.5 : (type === 'custom' ? 6 : defaultTiers * 3.2)))))),
    functionAngle: 0, conveyorRunning: true, customAssetId: customAssetId || null,
    boomLengthFt: type === 'crane' ? Math.round(Math.min(baseW, baseL) * 0.82 * 10) / 10 : undefined,
    tableTopColor: type === 'table' ? '#ffffff' : undefined,
    tableOverheadOption: false,
    tableVariant: type === 'table' ? 'packing' : undefined,
    label: label || '',
    mesh: null
  };

  if (typeof NewAssets !== 'undefined') NewAssets.applyDefaults(binObj);

  rebuildBinVisual(binObj);
  bins.push(binObj);
  updateCountsUI();
  selectBin(binObj);
  return binObj;
}

function spawnDefaultBlueShelves() {
  DEFAULT_BLUE_SHELVES.forEach(s => {
    spawnBin('shelf', s.x, s.y, s.w, s.l, s.tiers);
  });
  selectBin(null);
}

function getDefaultAssetHeightFt(binObj) {
  if (typeof NewAssets !== 'undefined' && NewAssets.has(binObj.type)) return NewAssets.naturalHeight(binObj.type);
  if (binObj.type === 'pallet') return Number(binObj.heightFt) || 0.45;
  if (binObj.type === 'palletpal') return Number(binObj.heightFt) || 3;
  if (binObj.type === 'table' || binObj.type === 'fixture') return 3;
  if (binObj.type === 'shelf') return 6;
  if (binObj.type === 'ibeam') return 10;
  if (binObj.type === 'guardrail') return Number(binObj.heightFt) || 3.5;
  if (binObj.type === 'custom') return 6;
  return Math.max(1, Number(binObj.tiers) || 1) * 3.2;
}

function rebuildBinVisual(binObj) {
  if (binObj.mesh) { scene.remove(binObj.mesh); disposeMeshGeometries(binObj.mesh); }
  const isSel = selectedBin === binObj;
  const mesh = buildBinMesh(binObj.w, binObj.l, binObj.tiers, binObj.type === 'large', isSel, binObj.color, binObj.type, binObj);
  // For bins, shelves, tables, fixtures, and imported models, scale vertically
  // around the floor plane to the user-selected physical height. Crane mast and
  // conveyor deck heights are modeled directly by their dedicated controls.
  if (['large', 'small'].includes(binObj.type)) {
    // Bin geometry already contains one full 3.2 ft body per tier.
    // Do not rescale it to a stale heightFt value from tier 1, or the tiers
    // collapse into the same total height and visually overlap instead of stacking.
    binObj.heightFt = Math.max(1, Number(binObj.tiers) || 1) * 3.2;
    mesh.scale.y = 1;
  } else if (typeof NewAssets !== 'undefined' && NewAssets.has(binObj.type)) {
    const natural = NewAssets.naturalHeight(binObj.type) || 1;
    if (binObj.type === 'gantrycrane') {
      // Gantry crane supports height adjustment — scale legs/bridge from natural height.
      const target = Math.max(6, Math.min(30, Number(binObj.heightFt) || natural));
      binObj.heightFt = target;
      mesh.scale.y = target / natural;
    } else {
      // Other NewAssets stay at authored height (avoids roof/guard overshoot).
      binObj.heightFt = natural;
      mesh.scale.y = 1;
    }
  } else if (!['crane', 'conveyor', 'uline_rolling_conveyor'].includes(binObj.type)) {
    const baseHeight = getDefaultAssetHeightFt(binObj);
    const targetHeight = Number(binObj.heightFt) || baseHeight;
    mesh.scale.y = Math.max(0.1, Math.min(6, targetHeight / baseHeight));
  }
  mesh.userData.binRef = binObj;
  mesh.traverse(child => { child.userData.binRef = binObj; });
  binObj.mesh = mesh;
  syncBinPosition(binObj);
  scene.add(mesh);
}

function syncBinPosition(binObj) {
  // Respect the actual edited room outline, including outward wall jut-outs.
  // The old 0..roomWidthFt / 0..roomLengthFt clamp trapped bins behind the
  // original rectangular wall threshold even when the floor/wall outline grew.
  if (customRoomOutline && customRoomOutline.length >= 3) {
    const bounds = customRoomOutline.reduce((b, p) => ({
      minX: Math.min(b.minX, p[0]), maxX: Math.max(b.maxX, p[0]),
      minY: Math.min(b.minY, p[1]), maxY: Math.max(b.maxY, p[1])
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const ext = getBinExtent(binObj);   // base footprint, plus the boom collision box for cranes
    const minY = (binObj.type === 'fixture' ? Math.min(-1, bounds.minY) : bounds.minY) - ext.minY;
    const minX = bounds.minX - ext.minX;
    const maxX = Math.max(minX, bounds.maxX - ext.maxX);
    const maxY = Math.max(minY, bounds.maxY - ext.maxY);
    const desiredX = Math.max(minX, Math.min(maxX, Number(binObj.x) || 0));
    const desiredY = Math.max(minY, Math.min(maxY, Number(binObj.y) || 0));

    // Prefer a location where the whole bin footprint remains inside the
    // polygon. Search outward from the drag target in half-foot increments so
    // bins can enter jut-outs without being allowed through unrelated walls.
    const fits = (x, y) => {
      const inset = 0.02;
      return [
        [x + inset, y + inset], [x + binObj.w - inset, y + inset],
        [x + inset, y + binObj.l - inset], [x + binObj.w - inset, y + binObj.l - inset]
      ].every(pt => pointInPolygon(pt[0], pt[1], customRoomOutline))
        && getCraneBoomPoints(binObj, x, y).every(pt => pointInPolygon(pt[0], pt[1], customRoomOutline));
    };
    let best = null, bestDist = Infinity;
    const step = Math.max(0.25, Number(snapIncrement) || 0.5);
    const radius = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    for (let r = 0; r <= radius && !best; r += step) {
      for (let dx = -r; dx <= r + 1e-6; dx += step) {
        for (const dy of [-r, r]) {
          const x = Math.max(minX, Math.min(maxX, desiredX + dx));
          const y = Math.max(minY, Math.min(maxY, desiredY + dy));
          const d = (x - desiredX) ** 2 + (y - desiredY) ** 2;
          if (d < bestDist && fits(x, y)) { best = { x, y }; bestDist = d; }
        }
      }
      for (let dy = -r + step; dy < r - 1e-6; dy += step) {
        for (const dx of [-r, r]) {
          const x = Math.max(minX, Math.min(maxX, desiredX + dx));
          const y = Math.max(minY, Math.min(maxY, desiredY + dy));
          const d = (x - desiredX) ** 2 + (y - desiredY) ** 2;
          if (d < bestDist && fits(x, y)) { best = { x, y }; bestDist = d; }
        }
      }
    }
    if (best) { binObj.x = best.x; binObj.y = best.y; }
    else { binObj.x = desiredX; binObj.y = desiredY; }
  } else {
    // Standard rectangular warehouse bounds when no custom outline is active.
    const ext = getBinExtent(binObj);   // base footprint, plus the boom collision box for cranes
    binObj.x = Math.max(-ext.minX, Math.min(roomWidthFt - ext.maxX, binObj.x));
    const minY = (binObj.type === 'fixture' ? -1 : 0) - ext.minY;
    binObj.y = Math.max(minY, Math.min(roomLengthFt - ext.maxY, binObj.y));
  }
  const centerX = binObj.x + binObj.w / 2;
  const centerZ = toWorldZ(binObj.y + binObj.l / 2);
  binObj.mesh.position.set(centerX, 0, centerZ);
}

// ============================================================================
// ASSET TILE THUMBNAILS — render real 3D models into the Assets picker
// ============================================================================
const ASSET_TILE_THUMB_SPECS = [
  { dataType: 'large',         type: 'large',                 w: 4,     l: 4,   tiers: 1, settings: {} },
  { dataType: 'small',         type: 'small',                 w: 3,     l: 3.5, tiers: 1, settings: {} },
  { dataType: 'pallet',        type: 'pallet',                w: 3.333, l: 4,   tiers: 1, settings: { heightFt: 0.45 } },
  { dataType: 'palletpal',     type: 'palletpal',             w: 4,     l: 4,   tiers: 1, settings: { heightFt: 3.0 } },
  { dataType: 'table',         type: 'table',                 w: 3,     l: 5,   tiers: 1, settings: {} },
  { dataType: 'shelf',         type: 'shelf',                 w: 2,     l: 4,   tiers: 4, settings: {} },
  { dataType: 'crane',         type: 'crane',                 w: 4,     l: 4,   tiers: 1, settings: { assetHeight: 8, functionAngle: 35 } },
  { dataType: 'conveyor',      type: 'conveyor',              w: 3,     l: 8,   tiers: 1, settings: { assetHeight: 3.0 } },
  { dataType: 'blue-conveyor', type: 'uline_rolling_conveyor', w: 2,     l: 8,   tiers: 1, settings: { assetHeight: 2.8, conveyorRunning: true } },
  { dataType: 'ibeam',         type: 'ibeam',                 w: 2,     l: 4,   tiers: 1, settings: { heightFt: 10 } },
  { dataType: 'guardrail',     type: 'guardrail',             w: 0.5,   l: 6,   tiers: 1, settings: { heightFt: 3.5 } },
  // NewAssets — 3D model thumbs (footprints match SPECS)
  { dataType: 'oildrum',         type: 'oildrum',         w: 1.95, l: 1.95, tiers: 1, settings: { heightFt: 2.875 } },
  { dataType: 'spotwelder',      type: 'spotwelder',      w: 2.6,  l: 4.2,  tiers: 1, settings: { heightFt: 6.0 } },
  { dataType: 'weldcurtain',     type: 'weldcurtain',     w: 6.5,  l: 2.0,  tiers: 1, settings: { heightFt: 6.5 } },
  { dataType: 'downdrafttable',  type: 'downdrafttable',  w: 6.0,  l: 3.5,  tiers: 1, settings: { heightFt: 4.0 } },
  { dataType: 'forklift',        type: 'forklift',        w: 3.8,  l: 12.2, tiers: 1, settings: { heightFt: 7.1 } },
  { dataType: 'fusebox',         type: 'fusebox',         w: 2.5,  l: 1.8,  tiers: 1, settings: { heightFt: 6.0 } },
  { dataType: 'paintbooth',      type: 'paintbooth',      w: 12.0, l: 10.0, tiers: 1, settings: { heightFt: 9.0 } },
  { dataType: 'brakepress',      type: 'brakepress',      w: 14.0, l: 6.5,  tiers: 1, settings: { heightFt: 9.5 } },
  { dataType: 'gantrycrane',     type: 'gantrycrane',     w: 20.0, l: 12.0, tiers: 1, settings: { heightFt: 14.0, gantryPoints: 4 } },
  // Home mode furniture (home-assets.js)
  { dataType: 'bed',             type: 'bed',             w: 5.4,  l: 6.9,  tiers: 1, settings: { heightFt: 3.5 } },
  { dataType: 'dresser',         type: 'dresser',         w: 5.0,  l: 1.6,  tiers: 1, settings: { heightFt: 2.65 } },
  { dataType: 'loveseat',        type: 'loveseat',        w: 5.0,  l: 3.0,  tiers: 1, settings: { heightFt: 2.9 } },
  { dataType: 'computer-desk',   type: 'computer-desk',   w: 5.0,  l: 2.5,  tiers: 1, settings: { heightFt: 2.45 } },
  { dataType: 'bookshelf',       type: 'bookshelf',       w: 3.5,  l: 1.1,  tiers: 1, settings: { heightFt: 6.0 } },
  { dataType: 'cube-shelf',      type: 'cube-shelf',      w: 5.1,  l: 1.3,  tiers: 1, settings: { heightFt: 7.6 } },
  { dataType: 'media-center',    type: 'media-center',    w: 6.0,  l: 1.7,  tiers: 1, settings: { heightFt: 4.4 } },
  { dataType: 'recliner',        type: 'recliner',        w: 3.0,  l: 4.2,  tiers: 1, settings: { heightFt: 3.5 } },
  { dataType: 'sectional',       type: 'sectional',       w: 7.5,  l: 6.5,  tiers: 1, settings: { heightFt: 3.0 } },
  { dataType: 'coffee-table',    type: 'coffee-table',    w: 4.0,  l: 2.0,  tiers: 1, settings: { heightFt: 1.5 } }
];

// DEV TOOL (not used at runtime any more): renders every asset in
// ASSET_TILE_THUMB_SPECS with the live 3D builders and hands back PNG data URLs.
// Run exportAssetThumbnailsJS() from the console to (re)create asset-thumbs.js.
function generateAssetTileThumbnails(opts) {
  opts = opts || {};
  if (typeof THREE === 'undefined' || typeof buildBinMesh !== 'function') return;
  const SIZE = opts.size || 160;
  let thumbRenderer;
  try {
    thumbRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    });
  } catch (err) {
    console.warn('Asset tile thumbnails unavailable:', err);
    return;
  }
  thumbRenderer.setSize(SIZE, SIZE, false);
  thumbRenderer.setPixelRatio(1);
  thumbRenderer.setClearColor(0x000000, 0);
  thumbRenderer.shadowMap.enabled = false;

  const thumbScene = new THREE.Scene();
  const amb = new THREE.AmbientLight(0xffffff, 0.72);
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(4.5, 9, 6);
  const fill = new THREE.DirectionalLight(0xb0c4de, 0.35);
  fill.position.set(-5, 4, -3);
  thumbScene.add(amb, key, fill);

  const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 200);

  ASSET_TILE_THUMB_SPECS.forEach(spec => {
    try {
      const settings = Object.assign({
        type: spec.type,
        heightFt: spec.settings.heightFt,
        assetHeight: spec.settings.assetHeight,
        functionAngle: spec.settings.functionAngle || 0,
        conveyorRunning: spec.settings.conveyorRunning !== false,
        tiers: spec.tiers,
        rotated: false,
        facing: 0,
        gantryPoints: spec.settings.gantryPoints
      }, spec.settings);

      const mesh = buildBinMesh(
        spec.w, spec.l, spec.tiers,
        spec.type === 'large',
        false,
        null,
        spec.type,
        settings
      );

      // Apply same height scaling as live assets for non-crane/conveyor types
      if (['large', 'small'].includes(spec.type)) {
        mesh.scale.y = 1;
      } else if (typeof NewAssets !== 'undefined' && NewAssets.has(spec.type)) {
        const natural = NewAssets.naturalHeight(spec.type) || 1;
        if (spec.type === 'gantrycrane') {
          const target = Number(settings.heightFt) || natural;
          mesh.scale.y = Math.max(0.1, Math.min(6, target / natural));
        } else {
          mesh.scale.y = 1;
        }
      } else if (!['crane', 'conveyor', 'uline_rolling_conveyor'].includes(spec.type)) {
        const baseH = (typeof getDefaultAssetHeightFt === 'function')
          ? getDefaultAssetHeightFt({ type: spec.type, tiers: spec.tiers })
          : (spec.type === 'shelf' ? 6 : (spec.type === 'pallet' ? 0.45 : (spec.type === 'palletpal' ? 3 : (spec.type === 'table' ? 3 : (spec.type === 'ibeam' ? 10 : (spec.type === 'guardrail' ? 3.5 : 4))))));
        const targetH = Number(settings.heightFt) || baseH;
        mesh.scale.y = Math.max(0.1, Math.min(6, targetH / Math.max(0.2, baseH)));
      }

      thumbScene.add(mesh);
      mesh.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.5);

      // 3/4 isometric-ish framing so the model reads clearly in a square
      const dist = maxDim * 2.15;
      cam.position.set(
        center.x + dist * 0.72,
        center.y + dist * 0.62,
        center.z + dist * 0.72
      );
      cam.near = Math.max(0.01, dist / 80);
      cam.far = dist * 20;
      cam.lookAt(center.x, center.y + size.y * 0.08, center.z);
      cam.updateProjectionMatrix();

      thumbRenderer.render(thumbScene, cam);
      const dataUrl = thumbRenderer.domElement.toDataURL('image/png');

      if (typeof opts.onImage === 'function') {
        opts.onImage(spec.dataType, dataUrl);
        thumbScene.remove(mesh);
        mesh.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose && m.dispose());
            else if (obj.material.dispose) obj.material.dispose();
          }
        });
        return;
      }

      const tile = document.querySelector(`#pane-assets .asset-tile[data-type="${spec.dataType}"]`);
      if (tile) {
        const preview = tile.querySelector('.tile-preview');
        if (preview) {
          preview.innerHTML = '';
          const img = document.createElement('img');
          img.src = dataUrl;
          img.alt = '';
          img.draggable = false;
          preview.appendChild(img);
        }
      }

      thumbScene.remove(mesh);
      mesh.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose && m.dispose());
          else if (obj.material.dispose) obj.material.dispose();
        }
      });
    } catch (err) {
      console.warn('Thumbnail failed for', spec.dataType, err);
    }
  });

  thumbRenderer.dispose();
  if (thumbRenderer.forceContextLoss) thumbRenderer.forceContextLoss();
}

// ----------------------------------------------------------------------------
// STATIC PNG THUMBNAILS (embedded as base64)
// Tiles read  window.ASSET_THUMB_DATA[<data-type>]  from asset-thumbs.js, which
// must be loaded BEFORE app.js:   <script src="asset-thumbs.js"></script>
// If an entry is missing the tile keeps its emoji fallback.
// ----------------------------------------------------------------------------
function applyStaticAssetThumbnails() {
  const data = window.ASSET_THUMB_DATA || {};
  ASSET_TILE_THUMB_SPECS.forEach(spec => {
    const url = data[spec.dataType];
    if (!url) return;
    const tile = document.querySelector(`#pane-assets .asset-tile[data-type="${spec.dataType}"]`);
    const preview = tile && tile.querySelector('.tile-preview');
    if (!preview || preview.querySelector('img')) return;
    const img = new Image();
    img.alt = '';
    img.draggable = false;
    img.src = url;
    preview.innerHTML = '';
    preview.appendChild(img);
  });
}

// ONE-TIME TOOL: run  exportAssetThumbnailsJS()  in the dev console.
// Renders every asset with the live 3D builders and downloads ONE file,
// asset-thumbs.js (all PNGs as base64). Put it next to app.js and load it first.
// Re-run it any time a model or its ASSET_TILE_THUMB_SPECS entry changes.
function exportAssetThumbnailsJS(size = 256) {
  const map = {};
  generateAssetTileThumbnails({ size, onImage: (name, url) => { map[name] = url; } });
  const names = Object.keys(map);
  const body = '/* Auto-generated by exportAssetThumbnailsJS() - static asset tile thumbnails */\n' +
    'window.ASSET_THUMB_DATA = ' + JSON.stringify(map, null, 1) + ';\n';
  const blob = new Blob([body], { type: 'text/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'asset-thumbs.js';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  console.log(`asset-thumbs.js: ${names.length} thumbnails, ${(body.length / 1024).toFixed(0)} KB`);
}
window.exportAssetThumbnailsJS = exportAssetThumbnailsJS;

// Apply once the Equipment panel is first opened (tiles exist by then)
let thumbnailsGenerated = false;
const originalOpenFolder = window.openFolder;
if (typeof originalOpenFolder === 'function') {
  window.openFolder = function(folderKey, addToHistory = true) {
    originalOpenFolder(folderKey, addToHistory);
    if (folderKey === 'assets' && !thumbnailsGenerated) {
      thumbnailsGenerated = true;
      setTimeout(applyStaticAssetThumbnails, 0);
    }
  };
}

function findNextOpenSlot(w, l) {
  const index = bins.length;
  // Place neatly in columns on left or right side of conveyor
  const col = index % 4;
  const row = Math.floor(index / 4);
  const x = col < 2 ? 3 + col * 4.5 : 19 + (col - 2) * 4.5;
  const y = 4 + row * 4.5;
  return { x: Math.min(32, x), y: Math.min(39, y) };
}

function selectBin(binObj) {
  const prev = selectedBin;
  selectedBin = binObj;
  if (prev) rebuildBinVisual(prev);
  if (selectedBin) rebuildBinVisual(selectedBin);
  updateSelectedUI();
}

// ============================================================================
// 7. POINTER CAPTURE DRAG-AND-DROP ENGINE (Fixes OrbitControls Conflict)
// ============================================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const planeIntersect = new THREE.Vector3();

function updatePointer(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function getObjectTypeName(b) {
  if (typeof NewAssets !== 'undefined' && NewAssets.has(b.type)) return NewAssets.typeName(b.type);
  if (b.type === 'custom') { const a = customAssetLibrary.find(x => x.id === b.customAssetId); return a ? a.name : 'Custom 3D Asset'; }
  if (b.type === 'shelf') return 'Blue Shelf';
  if (b.type === 'table') return b.tableVariant === 'monitor' ? 'Computer Station (Table + Monitor)' : 'Packing Table';
  if (b.type === 'crane') return 'Jib Crane';
  if (b.type === 'uline_rolling_conveyor') return 'Blue Uline Rolling Conveyor';
  if (b.type === 'conveyor') return 'Conveyor';
  if (b.type === 'guardrail') return '2-Rib Double Guard Rail';
  if (b.type === 'fixture') return 'Grey Box';
  if (b.type === 'large') return 'Large Open-Sided Bin';
  if (b.type === 'small') return 'Industrial Mesh Bin';
  return 'Bin';
}

// ============================================================================
// EYE-LEVEL SQUARE-LOCK & SAFE 360° LOOK-AROUND SYSTEM (No Accidental Asset Edits)
// ============================================================================
let eyeLevelSquare = { x: 18, y: 12 };
let lastClickedFloorSquare = { x: 18, y: 12 };
let eyeLevelHeightFt = 5.5;
let eyeLevelYaw = 0;       // 0 = North (-Z world / +Y warehouse), PI/2 = East (+X)
let eyeLevelPitch = -0.05; // radians (-1.42 to +1.42)
let eyeLevelLookDragging = false;
let eyeLevelPointerStart = { x: 0, y: 0, yaw: 0, pitch: 0 };
let eyeLevelPickSquareMode = false;
let assetInteractionLocked = false;

// 3D Floor Marker showing the locked 1ft x 1ft Eye-Level standing square
const eyeLevelMarkerGroup = new THREE.Group();
eyeLevelMarkerGroup.name = 'EyeLevelLockedSquareMarker';
(function buildEyeLevelSquareMarker() {
  const ringGeo = new THREE.RingGeometry(0.24, 0.42, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.045;
  ring.renderOrder = 950;
  eyeLevelMarkerGroup.add(ring);

  const borderEdge = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.04, 0.98));
  const borderLine = new THREE.LineSegments(borderEdge, new THREE.LineBasicMaterial({ color: 0x67e8f9, depthTest: false }));
  borderLine.position.y = 0.04;
  borderLine.renderOrder = 951;
  eyeLevelMarkerGroup.add(borderLine);
})();
scene.add(eyeLevelMarkerGroup);

function syncEyeLevelMarkerAndUI() {
  eyeLevelSquare.x = Math.max(0, Math.min(roomWidthFt - 1, Math.floor(Number(eyeLevelSquare.x) || 0)));
  eyeLevelSquare.y = Math.max(0, Math.min(roomLengthFt - 1, Math.floor(Number(eyeLevelSquare.y) || 0)));
  eyeLevelMarkerGroup.position.set(eyeLevelSquare.x + 0.5, 0, toWorldZ(eyeLevelSquare.y + 0.5));
  // Show marker when in 2D/3D or picking a square; hide directly under feet when in eye-level unless picking
  eyeLevelMarkerGroup.visible = (currentCameraMode !== 'eye' || eyeLevelPickSquareMode);

  const hudX = document.getElementById('hud-eye-x');
  const hudY = document.getElementById('hud-eye-y');
  const paneX = document.getElementById('pane-eye-x');
  const paneY = document.getElementById('pane-eye-y');
  if (hudX && document.activeElement !== hudX) hudX.value = String(eyeLevelSquare.x);
  if (hudY && document.activeElement !== hudY) hudY.value = String(eyeLevelSquare.y);
  if (paneX && document.activeElement !== paneX) paneX.value = String(eyeLevelSquare.x);
  if (paneY && document.activeElement !== paneY) paneY.value = String(eyeLevelSquare.y);

  const eyeHud = document.getElementById('eye-level-hud');
  if (eyeHud) {
    eyeHud.style.display = (currentCameraMode === 'eye' || eyeLevelPickSquareMode) ? 'flex' : 'none';
  }
  const pickBtn = document.getElementById('btn-hud-pick-square');
  const botPickBtn = document.getElementById('btn-bottom-pick-eye');
  if (pickBtn) {
    pickBtn.textContent = eyeLevelPickSquareMode ? '🎯 Click Any Floor Tile…' : '📍 Click Floor Square';
    pickBtn.className = eyeLevelPickSquareMode ? 'btn-amber' : 'btn-cyan';
  }
  if (botPickBtn) {
    botPickBtn.textContent = eyeLevelPickSquareMode ? '🎯 Click Any Floor Tile…' : '📍 Pick Eye Square';
    botPickBtn.className = eyeLevelPickSquareMode ? 'btn-amber' : 'btn-cyan';
  }
  const botEyeBtn = document.getElementById('btn-bottom-eye');
  if (botEyeBtn) {
    botEyeBtn.className = currentCameraMode === 'eye' ? 'btn-emerald' : '';
  }
  updateAssetLockUI();
}

function updateAssetLockUI() {
  const utilGridOn = typeof utilitiesGridGroup !== 'undefined' && utilitiesGridGroup.visible;
  const effectiveLock = (currentCameraMode === 'eye') || assetInteractionLocked || utilGridOn;
  const botLockBtn = document.getElementById('btn-bottom-lock-assets');
  if (botLockBtn) {
    botLockBtn.textContent = effectiveLock
      ? (utilGridOn && !assetInteractionLocked && currentCameraMode !== 'eye' ? 'Floor Locked (Utilities Grid)' : 'Assets Locked: ON')
      : 'Lock Assets: OFF';
    botLockBtn.className = effectiveLock ? 'btn-emerald' : '';
  }
  const paneChk = document.getElementById('chk-lock-assets-pane');
  // Only mirror the manual lock checkbox when grid is not the sole reason for lock
  if (paneChk && !utilGridOn) paneChk.checked = (currentCameraMode === 'eye') || assetInteractionLocked;
}

function setAssetInteractionLock(locked) {
  assetInteractionLocked = !!locked;
  if (assetInteractionLocked && selectedBin) {
    selectBin(null);
  }
  updateAssetLockUI();
  const effectiveLock = (currentCameraMode === 'eye') || assetInteractionLocked;
  setCameraStatus(effectiveLock
    ? 'Assets Locked — Click & drag anywhere to pan/orbit camera safely without touching or resizing assets.'
    : 'Asset interaction enabled — Click assets to select, move, or resize.');
}

function applyEyeLevelCameraTransform() {
  if (currentCameraMode !== 'eye') return;
  cameraTransition = null;
  activeCam = perspCam;
  perspCam.up.set(0, 1, 0);
  // Keep camera strictly locked to the center of the selected 1ft x 1ft square!
  const camX = eyeLevelSquare.x + 0.5;
  const camY = eyeLevelHeightFt;
  const camZ = toWorldZ(eyeLevelSquare.y + 0.5);
  perspCam.position.set(camX, camY, camZ);

  const lookDist = 20;
  const cosP = Math.cos(eyeLevelPitch);
  const lookX = camX + Math.sin(eyeLevelYaw) * cosP * lookDist;
  const lookY = camY + Math.sin(eyeLevelPitch) * lookDist;
  const lookZ = camZ - Math.cos(eyeLevelYaw) * cosP * lookDist;

  controls.target.set(lookX, lookY, lookZ);
  perspCam.lookAt(lookX, lookY, lookZ);
}

function startEyeLevelSquarePick(switchToTopMap = false) {
  if (selectedBin) selectBin(null);
  if (switchToTopMap && currentCameraMode !== 'top') {
    setCameraView('top', false);
  }
  eyeLevelPickSquareMode = true;
  syncEyeLevelMarkerAndUI();
  renderer.domElement.style.cursor = 'crosshair';
  const msg = '🎯 Click any 1ft × 1ft floor square to lock the Eye-Level camera there (assets are ignored while picking).';
  document.getElementById('coord-readout').textContent = msg;
  setCameraStatus(msg);
}

function applyEyeSquareFromInputs(source = 'hud') {
  const xEl = document.getElementById(source === 'pane' ? 'pane-eye-x' : 'hud-eye-x');
  const yEl = document.getElementById(source === 'pane' ? 'pane-eye-y' : 'hud-eye-y');
  if (!xEl || !yEl) return;
  eyeLevelSquare.x = Math.max(0, Math.min(roomWidthFt - 1, Math.floor(Number(xEl.value) || 0)));
  eyeLevelSquare.y = Math.max(0, Math.min(roomLengthFt - 1, Math.floor(Number(yEl.value) || 0)));
  lastClickedFloorSquare = { ...eyeLevelSquare };
  if (currentCameraMode !== 'eye') {
    setCameraView('eye', false);
  } else {
    applyEyeLevelCameraTransform();
    syncEyeLevelMarkerAndUI();
  }
  document.getElementById('coord-readout').textContent =
    `🚶 Eye-Level Locked at Square (X: ${eyeLevelSquare.x} ft, Y: ${eyeLevelSquare.y} ft) · Drag to look 360° (Assets Locked)`;
}

function stepEyeLevelSquare(dx, dy) {
  eyeLevelSquare.x = Math.max(0, Math.min(roomWidthFt - 1, eyeLevelSquare.x + dx));
  eyeLevelSquare.y = Math.max(0, Math.min(roomLengthFt - 1, eyeLevelSquare.y + dy));
  lastClickedFloorSquare = { ...eyeLevelSquare };
  if (currentCameraMode !== 'eye') {
    setCameraView('eye', false);
  } else {
    applyEyeLevelCameraTransform();
    syncEyeLevelMarkerAndUI();
  }
  document.getElementById('coord-readout').textContent =
    `🚶 Stepped Eye-Level Square to (X: ${eyeLevelSquare.x} ft, Y: ${eyeLevelSquare.y} ft) · Drag to look 360° (Assets Locked)`;
}

function setEyeLookCardinal(yawRad) {
  eyeLevelYaw = yawRad;
  eyeLevelPitch = -0.04;
  if (currentCameraMode !== 'eye') {
    setCameraView('eye', false);
  } else {
    applyEyeLevelCameraTransform();
  }
}

function setEyeLevelHeight(val) {
  eyeLevelHeightFt = Math.max(2.5, Math.min(14.0, Number(val) || 5.5));
  const badge = document.getElementById('hud-eye-height-val');
  if (badge) badge.textContent = `${eyeLevelHeightFt.toFixed(1)}'`;
  const elevSlider = document.getElementById('camera-elev-slider');
  const elevBadge = document.getElementById('camera-elev-val');
  if (elevSlider) elevSlider.value = String(Math.round(eyeLevelHeightFt));
  if (elevBadge) elevBadge.textContent = `${eyeLevelHeightFt.toFixed(1)} ft`;
  if (currentCameraMode === 'eye') {
    applyEyeLevelCameraTransform();
  }
}

// Use capture phase (true) so object clicks are caught BEFORE OrbitControls
let activeTouchCount = 0;
renderer.domElement.addEventListener('touchstart', (e) => {
  activeTouchCount = e.touches ? e.touches.length : 0;
  if (activeTouchCount > 1 && (isDraggingBin || isDraggingGorbelCrane || isDraggingFixedConveyor || isResizingBin || isDraggingWall)) {
    isDraggingBin = false; isDraggingGorbelCrane = false; isDraggingFixedConveyor = false;
    activeFixedConveyor = null; isResizingBin = false; isDraggingWall = false;
    controls.enabled = true;
  }
}, { passive: true });
renderer.domElement.addEventListener('touchend', (e) => {
  activeTouchCount = e.touches ? e.touches.length : 0;
}, { passive: true });

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' && activeTouchCount > 1) return;
  updatePointer(e);
  raycaster.setFromCamera(pointer, activeCam);

  // 1. Freeform multi-point room editor (edit corners / insert on edges / draw new)
  if (freeformRoomDrawMode && (e.pointerType !== 'mouse' || e.button === 0)) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const snap = e.shiftKey ? 0.5 : 1.0;
      const x = Math.round(planeIntersect.x / snap) * snap;
      const y = Math.round(toWarehouseY(planeIntersect.z) / snap) * snap;
      handleFreeformCanvasPointerDown(x, y);
    }
    return;
  }

  // 1. If picking a 1ft x 1ft floor square for Eye-Level camera lock (ignores all assets!)
  if (eyeLevelPickSquareMode && (e.pointerType !== 'mouse' || e.button === 0)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const fx = Math.max(0, Math.min(roomWidthFt - 1, Math.floor(planeIntersect.x)));
      const fy = Math.max(0, Math.min(roomLengthFt - 1, Math.floor(toWarehouseY(planeIntersect.z))));
      eyeLevelSquare = { x: fx, y: fy };
      lastClickedFloorSquare = { x: fx, y: fy };
      eyeLevelPickSquareMode = false;
      setCameraView('eye', false);
      const msg = `🚶 Locked Eye-Level Camera to Square (X: ${fx} ft, Y: ${fy} ft) — Drag anywhere to pan/look 360° (Assets Locked)`;
      document.getElementById('coord-readout').textContent = msg;
      setCameraStatus(msg);
    }
    return;
  }

  // 2. If in Eye-Level mode, lock position to the square and pan/look 360° WITHOUT interacting with any assets!
  if (currentCameraMode === 'eye') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (selectedBin) selectBin(null);
    controls.enabled = false;
    eyeLevelLookDragging = true;
    eyeLevelPointerStart = {
      x: e.clientX,
      y: e.clientY,
      yaw: eyeLevelYaw,
      pitch: eyeLevelPitch
    };
    renderer.domElement.style.cursor = 'grabbing';
    return;
  }

  if (e.pointerType === 'mouse' && e.button !== 0) return;

  // 3. Lock Assets mode OR utilities-grid mode: skip floor asset/wall picking
  if (typeof areFloorAssetsInteractionBlocked === 'function' ? areFloorAssetsInteractionBlocked() : assetInteractionLocked) {
    if (selectedBin) selectBin(null);
    return;
  }

  const binMeshes = bins.map(b => b.mesh);
  const hits = raycaster.intersectObjects(binMeshes, true);

  if (hits.length > 0) {
    e.stopImmediatePropagation();
    controls.enabled = false;

    const hitObj = hits[0].object;
    const hitBin = hitObj.userData.binRef;
    const resizeDir = hitObj.userData.resizeHandle;

    selectBin(hitBin);

    if (resizeDir) {
      isResizingBin = true;
      activeResizeDir = resizeDir;
      resizeStartBounds = {
        xMin: hitBin.x,
        xMax: hitBin.x + hitBin.w,
        yMin: hitBin.y,
        yMax: hitBin.y + hitBin.l
      };
      renderer.domElement.style.cursor = 'nwse-resize';
      return;
    }

    isDraggingBin = true;
    renderer.domElement.style.cursor = 'grabbing';

    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      dragOffset.set(
        planeIntersect.x - hitBin.mesh.position.x,
        0,
        planeIntersect.z - hitBin.mesh.position.z
      );
    }
  } else {
    // The original fixed Gorbel jib crane is draggable independently of addable assets.
    const craneHits = gorbelCrane.parent === scene ? raycaster.intersectObject(gorbelCrane, true) : [];
    if (craneHits.length > 0) {
      e.stopImmediatePropagation();
      controls.enabled = false;
      isDraggingGorbelCrane = true;
      renderer.domElement.style.cursor = 'grabbing';
      if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
        gorbelDragOffset.set(
          planeIntersect.x - gorbelCrane.position.x,
          0,
          planeIntersect.z - gorbelCrane.position.z
        );
      }
      document.getElementById('coord-readout').textContent =
        `Dragging Fixed Gorbel Jib Crane — X: ${(14 + gorbelCrane.position.x).toFixed(1)} ft, Y: ${toWarehouseY(toWorldZ(0) + gorbelCrane.position.z).toFixed(1)} ft`;
      return;
    }
    // The three original fixed Uline conveyors are movable independently of addable conveyor assets.
    for (const conveyor of conveyors) {
      if (conveyor.group.parent !== scene) continue;
      const conveyorHits = raycaster.intersectObject(conveyor.group, true);
      if (conveyorHits.length > 0) {
        e.stopImmediatePropagation();
        controls.enabled = false;
        isDraggingFixedConveyor = true;
        activeFixedConveyor = conveyor;
        renderer.domElement.style.cursor = 'grabbing';
        if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
          fixedConveyorDragOffset.set(
            planeIntersect.x - conveyor.group.position.x,
            0,
            planeIntersect.z - conveyor.group.position.z
          );
        }
        document.getElementById('coord-readout').textContent =
          `Dragging Fixed Conveyor — X: ${conveyor.xFt.toFixed(1)} ft, Y: ${conveyor.yStartFt.toFixed(1)} ft`;
        return;
      }
    }
    // Check if user clicked a Wall Expansion Handle or wall mesh
    const wallTargets = [...wallHandlesGroup.children, ...wallsGroup.children.filter(w => w.userData.wallExpandDir)];
    const wallHits = raycaster.intersectObjects(wallTargets, true);
    if (wallHits.length > 0 && wallHits[0].object.userData.wallExpandDir) {
      e.stopImmediatePropagation();
      controls.enabled = false;
      if (selectedBin) selectBin(null);
      isDraggingWall = true;
      wallDragHighlightActive = true;
      activeWallExpandDir = wallHits[0].object.userData.wallExpandDir;
      wallDragStartWidth = roomWidthFt;
      wallDragStartLength = roomLengthFt;
      wallDragAppliedX = 0;
      wallDragAppliedY = 0;
      wallDragSymmetric = document.getElementById('chk-symmetric-expand')?.checked || e.shiftKey || e.altKey;
      if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) wallDragStartPoint.copy(planeIntersect);
      activeWallEdgeIndex = null;
      wallEdgeDragOutline = null;
      wallsGroup.children.forEach(w => { if (w.material) w.material = wallExpandMat; });
      renderer.domElement.style.cursor = 'move';
      return;
    }
    // Clicked empty floor -> deselect, record clicked floor square for Eye-Level lock, and allow camera orbit
    if (selectedBin) selectBin(null);
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const fx = Math.floor(planeIntersect.x);
      const fy = Math.floor(toWarehouseY(planeIntersect.z));
      if (isInsideWarehouse(fx + 0.5, fy + 0.5)) {
        lastClickedFloorSquare = { x: fx, y: fy };
        eyeLevelSquare = { x: fx, y: fy };
        syncEyeLevelMarkerAndUI();
      }
    }
  }
}, true);

window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  raycaster.setFromCamera(pointer, activeCam);

  if (freeformRoomDrawMode) {
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const snap = e.shiftKey ? 0.5 : 1.0;
      const hoverX = Math.round(planeIntersect.x / snap) * snap;
      const hoverY = Math.round(toWarehouseY(planeIntersect.z) / snap) * snap;
      if (freeformDragVertex >= 0) handleFreeformCanvasDrag(hoverX, hoverY);
      else handleFreeformCanvasHover(hoverX, hoverY);
    }
    return;
  }

  // If picking a floor square for Eye-Level camera lock, highlight floor square directly (ignore all assets)
  if (eyeLevelPickSquareMode) {
    renderer.domElement.style.cursor = 'crosshair';
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const fx = Math.max(0, Math.min(roomWidthFt - 1, Math.floor(planeIntersect.x)));
      const fy = Math.max(0, Math.min(roomLengthFt - 1, Math.floor(toWarehouseY(planeIntersect.z))));
      hoverTile.visible = true;
      hoverTile.position.set(fx + 0.5, 0.04, toWorldZ(fy + 0.5));
      document.getElementById('coord-readout').textContent =
        `🎯 Click to Lock Eye-Level Camera on Square: (X: ${fx} ft, Y: ${fy} ft)`;
    }
    return;
  }

  // If in Eye-Level mode: handle 360° stationary pan/look around from the locked square, and ignore all asset hovers
  if (currentCameraMode === 'eye') {
    hoverTile.visible = false;
    if (eyeLevelLookDragging) {
      const dx = e.clientX - eyeLevelPointerStart.x;
      const dy = e.clientY - eyeLevelPointerStart.y;
      const sensitivity = 0.0042;
      eyeLevelYaw = eyeLevelPointerStart.yaw + dx * sensitivity;
      eyeLevelPitch = Math.max(-1.42, Math.min(1.42, eyeLevelPointerStart.pitch - dy * sensitivity));
      applyEyeLevelCameraTransform();
      renderer.domElement.style.cursor = 'grabbing';
      const degYaw = ((Math.round((eyeLevelYaw * 180 / Math.PI) % 360) + 360) % 360);
      const degPitch = Math.round(eyeLevelPitch * 180 / Math.PI);
      document.getElementById('coord-readout').textContent =
        `🚶 Eye-Level Locked at Square (X: ${eyeLevelSquare.x}', Y: ${eyeLevelSquare.y}') · Azimuth: ${degYaw}° · Pitch: ${degPitch >= 0 ? '+' : ''}${degPitch}° (Assets Locked)`;
    } else {
      renderer.domElement.style.cursor = 'grab';
    }
    return;
  }

  // Lock Assets or utilities-grid mode: skip floor asset hover cursors
  if (typeof areFloorAssetsInteractionBlocked === 'function' ? areFloorAssetsInteractionBlocked() : assetInteractionLocked) {
    renderer.domElement.style.cursor = 'grab';
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const fx = Math.floor(planeIntersect.x);
      const fy = Math.floor(toWarehouseY(planeIntersect.z));
      if (isInsideWarehouse(fx + 0.5, fy + 0.5)) {
        hoverTile.visible = true;
        hoverTile.position.set(fx + 0.5, 0.04, toWorldZ(fy + 0.5));
        const utilOn = typeof utilitiesGridGroup !== 'undefined' && utilitiesGridGroup.visible;
        document.getElementById('coord-readout').textContent = utilOn
          ? `📐 Utilities grid · floor assets locked · Tile (X: ${fx} ft, Y: ${fy} ft)`
          : `Assets Locked (Safe Pan) · Tile (X: ${fx} ft, Y: ${fy} ft)`;
      }
    }
    return;
  }

  // -1. If actively dragging a Wall / Floor Expansion Handle or Corner (1ft grid steps)
  if (isDraggingWall && activeWallExpandDir) {
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const deltaX = planeIntersect.x - wallDragStartPoint.x;
      const deltaY = toWarehouseY(planeIntersect.z) - toWarehouseY(wallDragStartPoint.z);
      const isSym = wallDragSymmetric || document.getElementById('chk-symmetric-expand')?.checked;

      if (activeWallExpandDir === 'east') {
        const targetStep = Math.round(deltaX);
        const diff = targetStep - wallDragAppliedX;
        if (diff !== 0) {
          if (isSym) {
            expandFacility('both-x', diff * 2);
          } else {
            expandFacility('east', diff);
          }
          wallDragAppliedX = targetStep;
        }
        document.getElementById('coord-readout').textContent = isSym
          ? `Symmetrical 2-Direction Expansion -> Width: ${roomWidthFt} ft (${roomWidthFt}×${roomLengthFt}')`
          : `Expanding East Wall Outward (+X) -> Width: ${roomWidthFt} ft • West wall fixed`;
        return;
      }

      if (activeWallExpandDir === 'west') {
        const targetStep = Math.round(-deltaX); // positive when pulling Westward
        const diff = targetStep - wallDragAppliedX;
        if (diff !== 0) {
          if (isSym) {
            expandFacility('both-x', diff * 2);
          } else {
            expandFacility('west', diff);
          }
          wallDragAppliedX = targetStep;
        }
        document.getElementById('coord-readout').textContent = isSym
          ? `Symmetrical 2-Direction Expansion -> Width: ${roomWidthFt} ft (${roomWidthFt}×${roomLengthFt}')`
          : `Expanding West Wall Outward (-X) -> Width: ${roomWidthFt} ft • East wall fixed`;
        return;
      }

      if (activeWallExpandDir === 'north') {
        const targetStep = Math.round(deltaY); // positive when pulling Northward
        const diff = targetStep - wallDragAppliedY;
        if (diff !== 0) {
          if (isSym) {
            expandFacility('both-y', diff * 2);
          } else {
            expandFacility('north', diff);
          }
          wallDragAppliedY = targetStep;
        }
        document.getElementById('coord-readout').textContent = isSym
          ? `Symmetrical 2-Direction Expansion -> Length: ${roomLengthFt} ft (${roomWidthFt}×${roomLengthFt}')`
          : `Expanding North Wall Outward (+Y) -> Length: ${roomLengthFt} ft • South wall fixed`;
        return;
      }

      if (activeWallExpandDir === 'south') {
        const targetStep = Math.round(-deltaY); // positive when pulling Southward
        const diff = targetStep - wallDragAppliedY;
        if (diff !== 0) {
          if (isSym) {
            expandFacility('both-y', diff * 2);
          } else {
            expandFacility('south', diff);
          }
          wallDragAppliedY = targetStep;
        }
        document.getElementById('coord-readout').textContent = isSym
          ? `Symmetrical 2-Direction Expansion -> Length: ${roomLengthFt} ft (${roomWidthFt}×${roomLengthFt}')`
          : `Expanding South Wall Outward (-Y) -> Length: ${roomLengthFt} ft • North wall fixed`;
        return;
      }

      // Simultaneous 2-Direction Corner Expansion Handles
      if (activeWallExpandDir === 'ne') {
        const targetStepX = Math.round(deltaX);
        const targetStepY = Math.round(deltaY);
        const diffX = targetStepX - wallDragAppliedX;
        const diffY = targetStepY - wallDragAppliedY;
        if (diffX !== 0) { expandFacility(isSym ? 'both-x' : 'east', isSym ? diffX * 2 : diffX); wallDragAppliedX = targetStepX; }
        if (diffY !== 0) { expandFacility(isSym ? 'both-y' : 'north', isSym ? diffY * 2 : diffY); wallDragAppliedY = targetStepY; }
        document.getElementById('coord-readout').textContent = `Expanding NE Corner in 2 Directions -> ${roomWidthFt} ft × ${roomLengthFt} ft (+E, +N)`;
        return;
      }

      if (activeWallExpandDir === 'nw') {
        const targetStepX = Math.round(-deltaX);
        const targetStepY = Math.round(deltaY);
        const diffX = targetStepX - wallDragAppliedX;
        const diffY = targetStepY - wallDragAppliedY;
        if (diffX !== 0) { expandFacility(isSym ? 'both-x' : 'west', isSym ? diffX * 2 : diffX); wallDragAppliedX = targetStepX; }
        if (diffY !== 0) { expandFacility(isSym ? 'both-y' : 'north', isSym ? diffY * 2 : diffY); wallDragAppliedY = targetStepY; }
        document.getElementById('coord-readout').textContent = `Expanding NW Corner in 2 Directions -> ${roomWidthFt} ft × ${roomLengthFt} ft (+W, +N)`;
        return;
      }

      if (activeWallExpandDir === 'se') {
        const targetStepX = Math.round(deltaX);
        const targetStepY = Math.round(-deltaY);
        const diffX = targetStepX - wallDragAppliedX;
        const diffY = targetStepY - wallDragAppliedY;
        if (diffX !== 0) { expandFacility(isSym ? 'both-x' : 'east', isSym ? diffX * 2 : diffX); wallDragAppliedX = targetStepX; }
        if (diffY !== 0) { expandFacility(isSym ? 'both-y' : 'south', isSym ? diffY * 2 : diffY); wallDragAppliedY = targetStepY; }
        document.getElementById('coord-readout').textContent = `Expanding SE Corner in 2 Directions -> ${roomWidthFt} ft × ${roomLengthFt} ft (+E, +S)`;
        return;
      }

      if (activeWallExpandDir === 'sw') {
        const targetStepX = Math.round(-deltaX);
        const targetStepY = Math.round(-deltaY);
        const diffX = targetStepX - wallDragAppliedX;
        const diffY = targetStepY - wallDragAppliedY;
        if (diffX !== 0) { expandFacility(isSym ? 'both-x' : 'west', isSym ? diffX * 2 : diffX); wallDragAppliedX = targetStepX; }
        if (diffY !== 0) { expandFacility(isSym ? 'both-y' : 'south', isSym ? diffY * 2 : diffY); wallDragAppliedY = targetStepY; }
        document.getElementById('coord-readout').textContent = `Expanding SW Corner in 2 Directions -> ${roomWidthFt} ft × ${roomLengthFt} ft (+W, +S)`;
        return;
      }
    }
    return;
  }

  // Move a built-in fixed conveyor on the floor plane, preserving its 3ft x 8ft footprint.
  if (isDraggingFixedConveyor && activeFixedConveyor) {
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const centerX = planeIntersect.x - fixedConveyorDragOffset.x;
      const centerZ = planeIntersect.z - fixedConveyorDragOffset.z;
      const rawX = centerX - activeFixedConveyor.w / 2;
      const rawY = toWarehouseY(centerZ) - activeFixedConveyor.l / 2;
      const maxX = Math.max(0, roomWidthFt - activeFixedConveyor.w);
      const maxY = Math.max(0, roomLengthFt - activeFixedConveyor.l);
      activeFixedConveyor.xFt = Math.max(0, Math.min(maxX, Math.round(rawX / snapIncrement) * snapIncrement));
      activeFixedConveyor.yStartFt = Math.max(0, Math.min(maxY, Math.round(rawY / snapIncrement) * snapIncrement));
      activeFixedConveyor.yStart = activeFixedConveyor.yStartFt;
      activeFixedConveyor.group.position.set(
        activeFixedConveyor.xFt + activeFixedConveyor.w / 2,
        0,
        toWorldZ(activeFixedConveyor.yStartFt + activeFixedConveyor.l / 2)
      );
      document.getElementById('coord-readout').textContent =
        `Fixed Conveyor — X: ${activeFixedConveyor.xFt.toFixed(1)} ft, Y: ${activeFixedConveyor.yStartFt.toFixed(1)} ft (3 ft × 8 ft)`;
    }
    return;
  }

  // Move the original fixed Gorbel crane on the floor plane, snapped to the current grid increment.
  if (isDraggingGorbelCrane) {
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const targetX = Math.round((planeIntersect.x - gorbelDragOffset.x) / snapIncrement) * snapIncrement;
      const targetZ = Math.round((planeIntersect.z - gorbelDragOffset.z) / snapIncrement) * snapIncrement;
      const minX = -13, maxX = Math.max(minX, roomWidthFt - 15);
      const minZ = toWorldZ(Math.max(0, roomLengthFt - 2)) - toWorldZ(0), maxZ = 0;
      gorbelCrane.position.x = Math.max(minX, Math.min(maxX, targetX));
      gorbelCrane.position.z = Math.max(minZ, Math.min(maxZ, targetZ));
      document.getElementById('coord-readout').textContent =
        `Fixed Gorbel Jib Crane — X: ${(14 + gorbelCrane.position.x).toFixed(1)} ft, Y: ${toWarehouseY(toWorldZ(0) + gorbelCrane.position.z).toFixed(1)} ft`;
    }
    return;
  }

  // 0. If actively resizing via a yellow corner handle
  if (isResizingBin && selectedBin && resizeStartBounds) {
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const maxY = roomLengthFt;
      const minSize = 0.5;
      const snappedX = Math.max(0, Math.min(roomWidthFt, Math.round(planeIntersect.x / snapIncrement) * snapIncrement));
      const snappedY = Math.max(0, Math.min(maxY, Math.round(toWarehouseY(planeIntersect.z) / snapIncrement) * snapIncrement));

      let { xMin, xMax, yMin, yMax } = resizeStartBounds;
      // 'nw' (-X, -Z => North/maxY), 'ne' (+X, -Z => North/maxY), 'sw' (-X, +Z => South/minY), 'se' (+X, +Z => South/minY)
      if (activeResizeDir.includes('w')) {
        xMin = Math.min(snappedX, xMax - minSize);
      } else if (activeResizeDir.includes('e')) {
        xMax = Math.max(snappedX, xMin + minSize);
      }
      if (activeResizeDir.includes('n')) {
        yMax = Math.max(snappedY, yMin + minSize);
      } else if (activeResizeDir.includes('s')) {
        yMin = Math.min(snappedY, yMax - minSize);
      }

      selectedBin.x = Math.round(xMin * 10) / 10;
      selectedBin.y = Math.round(yMin * 10) / 10;
      selectedBin.w = Math.round((xMax - xMin) * 10) / 10;
      selectedBin.l = Math.round((yMax - yMin) * 10) / 10;

      rebuildBinVisual(selectedBin);
      updateSelectedUI();
      document.getElementById('coord-readout').textContent =
        `Resizing ${getObjectTypeName(selectedBin)} #${selectedBin.id} -> ${selectedBin.w.toFixed(1)}ft × ${selectedBin.l.toFixed(1)}ft at (X: ${selectedBin.x.toFixed(1)}', Y: ${selectedBin.y.toFixed(1)}')`;
    }
    return;
  }

  // 1. If actively dragging an object, move it along the mathematical floor plane
  if (isDraggingBin && selectedBin) {
    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
      const targetCenterX = planeIntersect.x - dragOffset.x;
      const targetCenterZ = planeIntersect.z - dragOffset.z;

      let rawX = targetCenterX - selectedBin.w / 2;
      let rawY = toWarehouseY(targetCenterZ) - selectedBin.l / 2;

      selectedBin.x = Math.round(rawX / snapIncrement) * snapIncrement;
      selectedBin.y = Math.round(rawY / snapIncrement) * snapIncrement;

      syncBinPosition(selectedBin);
      updateSelectedUI();
      document.getElementById('coord-readout').textContent =
        `Dragging ${getObjectTypeName(selectedBin)} #${selectedBin.id} -> X: ${selectedBin.x.toFixed(1)} ft, Y: ${selectedBin.y.toFixed(1)} ft`;
    }
    return;
  }

  // 2. Otherwise check if hovering over a bin/shelf/table or its corner resize handle
  const binMeshes = bins.map(b => b.mesh);
  const binHits = raycaster.intersectObjects(binMeshes, true);
  if (binHits.length > 0) {
    const hitObj = binHits[0].object;
    const b = hitObj.userData.binRef;
    hoverTile.visible = false;
    if (hitObj.userData.resizeHandle) {
      renderer.domElement.style.cursor = 'nwse-resize';
      document.getElementById('coord-readout').textContent =
        `Resize Handle on ${getObjectTypeName(b)} #${b.id} (${b.w}'×${b.l}') — Drag corner to resize`;
    } else {
      renderer.domElement.style.cursor = 'grab';
      document.getElementById('coord-readout').textContent =
        `Hover ${getObjectTypeName(b)} #${b.id} (${b.w}'×${b.l}') at X: ${b.x.toFixed(1)}', Y: ${b.y.toFixed(1)}' — Click & Drag to move`;
    }
    return;
  }

  // Hover affordance for the original fixed conveyors.
  for (const conveyor of conveyors) {
    if (conveyor.group.parent !== scene) continue;
    if (raycaster.intersectObject(conveyor.group, true).length > 0) {
      renderer.domElement.style.cursor = 'grab';
      document.getElementById('coord-readout').textContent =
        `Fixed Conveyor (3 ft × 8 ft) at X: ${conveyor.xFt.toFixed(1)} ft, Y: ${conveyor.yStartFt.toFixed(1)} ft — Click & drag to move`;
      hoverTile.visible = false;
      return;
    }
  }

  // Check if hovering over a Wall Expansion Handle or wall mesh
  {
    const wallTargets = [...wallHandlesGroup.children, ...wallsGroup.children.filter(w => w.userData.wallExpandDir)];
    const handleHits = raycaster.intersectObjects(wallTargets, true);
    if (handleHits.length > 0 && handleHits[0].object.userData.wallExpandDir) {
      const dir = handleHits[0].object.userData.wallExpandDir;
      hoverTile.visible = false;
      const cursorMap = {
        east: 'ew-resize', west: 'ew-resize', north: 'ns-resize', south: 'ns-resize',
        ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize'
      };
      renderer.domElement.style.cursor = cursorMap[dir] || 'pointer';

      const labelMap = {
        east: '▶ East Wall (+X) — Drag East to expand width outward (or Shift-drag for both directions)',
        west: '◀ West Wall (-X) — Drag West to expand width outward (East wall stays fixed)',
        north: '▲ North Wall (+Y) — Drag North to expand length outward (South wall stays fixed)',
        south: '▼ South Wall (-Y) — Drag South to expand length outward (North wall stays fixed)',
        ne: '↗ NE Corner Handle — Drag to expand East (+X) and North (+Y) in 2 directions',
        nw: '↖ NW Corner Handle — Drag to expand West (-X) and North (+Y) in 2 directions',
        se: '↘ SE Corner Handle — Drag to expand East (+X) and South (-Y) in 2 directions',
        sw: '↙ SW Corner Handle — Drag to expand West (-X) and South (-Y) in 2 directions'
      };
      document.getElementById('coord-readout').textContent = labelMap[dir] || 'Wall Resize Handle — Drag in 1ft grid steps';
      return;
    }
  }

  renderer.domElement.style.cursor = 'default';

  // 3. Floor tile coordinate readout
  if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
    const fx = Math.floor(planeIntersect.x);
    const fy = Math.floor(toWarehouseY(planeIntersect.z));
    if (isInsideWarehouse(fx + 0.5, fy + 0.5)) {
      hoverTile.visible = true;
      hoverTile.position.set(fx + 0.5, 0.04, toWorldZ(fy + 0.5));
      document.getElementById('coord-readout').textContent =
        `1ft × 1ft Tile: (X: ${fx} ft, Y: ${fy} ft)`;
    } else {
      hoverTile.visible = false;
    }
  }
});

// In Eye-Level mode, mouse wheel smoothly zooms FOV without moving off the locked floor square
renderer.domElement.addEventListener('wheel', (e) => {
  if (currentCameraMode === 'eye') {
    e.preventDefault();
    e.stopImmediatePropagation();
    const nextFov = Math.max(25, Math.min(90, Math.round(perspCam.fov + (e.deltaY > 0 ? 3 : -3))));
    perspCam.fov = nextFov;
    perspCam.updateProjectionMatrix();
    const fovSlider = document.getElementById('camera-fov-slider');
    const fovBadge = document.getElementById('camera-fov-val');
    if (fovSlider) fovSlider.value = String(nextFov);
    if (fovBadge) fovBadge.textContent = `${nextFov}°`;
  }
}, { passive: false, capture: true });

window.addEventListener('pointerup', () => {
  // Faux wall dragging retired

  if (eyeLevelLookDragging) {
    eyeLevelLookDragging = false;
    if (currentCameraMode === 'eye') {
      renderer.domElement.style.cursor = 'grab';
    }
  }
  if (isDraggingBin || isDraggingGorbelCrane || isDraggingFixedConveyor || isResizingBin || isDraggingWall) {
    isDraggingBin = false;
    isDraggingGorbelCrane = false;
    isDraggingFixedConveyor = false;
    activeFixedConveyor = null;
    isResizingBin = false;
    isDraggingWall = false;
    if (wallDragHighlightActive) {
      wallDragHighlightActive = false;
      rebuildPerimeterWalls();
    }
    activeWallExpandDir = null;
    activeWallEdgeIndex = null; wallEdgeDragOutline = null;
    activeResizeDir = null;
    resizeStartBounds = null;
    controls.enabled = true;
    renderer.domElement.style.cursor = 'default';
  }
});

// ============================================================================
// 8. UI CONTROLS, KEYBOARD NUDGE & DIRECT X/Y INPUTS
// ============================================================================
function updateCountsUI() {
  const lCount = bins.filter(b => b.type === 'large').length;
  const sCount = bins.filter(b => b.type === 'small').length;
  const shelfCount = bins.filter(b => b.type === 'shelf').length;
  document.getElementById('count-large').textContent = lCount;
  document.getElementById('count-small').textContent = sCount;
  const shelfBadge = document.getElementById('count-shelf');
  if (shelfBadge) shelfBadge.textContent = shelfCount;
}

function updateSelectedUI() {
  const lbl = document.getElementById('sel-label');
  const inpX = document.getElementById('inp-x');
  const inpY = document.getElementById('inp-y');
  const inpW = document.getElementById('inp-width');
  const inpL = document.getElementById('inp-length');
  const inpColor = document.getElementById('inp-color');
  const inpLabel = document.getElementById('inp-label');
  const btns = ['btn-rotate','btn-stack','btn-clone','btn-delete','btn-nudge-left','btn-nudge-right','btn-nudge-up','btn-nudge-down'];

  if (!selectedBin) {
    lbl.textContent = 'Click any asset to select, move, resize, or delete';
    inpX.value = ''; inpY.value = '';
    inpX.disabled = true; inpY.disabled = true;
    inpW.disabled = true; inpL.disabled = true; inpColor.disabled = true;
    if (inpLabel) { inpLabel.value = ''; inpLabel.disabled = true; }
    const tableOptions = document.getElementById('packing-table-options');
    if (tableOptions) tableOptions.style.display = 'none';
    const gantryOptsHide = document.getElementById('gantry-crane-options');
    if (gantryOptsHide) gantryOptsHide.style.display = 'none';
    btns.forEach(id => document.getElementById(id).disabled = true);
    return;
  }
  if (inpLabel) {
    inpLabel.disabled = false;
    inpLabel.value = selectedBin.label || '';
  }

  const customSelectedAsset = selectedBin.type === 'custom' ? customAssetLibrary.find(a => a.id === selectedBin.customAssetId) : null;
  const isAnyConveyor = selectedBin.type === 'conveyor' || selectedBin.type === 'uline_rolling_conveyor';
  const typeLabel = ({custom: customSelectedAsset?.name || 'Custom 3D Asset', pallet: 'Standard Pallet', palletpal: 'PalletPal Leveler', table: (selectedBin.tableVariant === 'monitor' ? 'Computer Station' : 'Packing Table'), shelf: 'Blue Shelf', fixture: 'Grey Box', crane: 'Jib Crane', conveyor: 'Conveyor', uline_rolling_conveyor: 'Blue Uline Rolling Conveyor'})[selectedBin.type] || ((typeof NewAssets !== 'undefined' && NewAssets.has(selectedBin.type)) ? NewAssets.typeName(selectedBin.type) : null) || 'Bin';
  const facingNames = ['South (-Y)', 'East (+X)', 'North (+Y)', 'West (-X)'];
  const binFacingIdx = Number.isInteger(selectedBin.facing) ? ((selectedBin.facing % 4) + 4) % 4 : ((selectedBin.type === 'large' && selectedBin.x <= 8) ? 1 : (selectedBin.rotated ? 1 : 0));
  const detailSuffix = selectedBin.type === 'custom' ? ' · imported model' : selectedBin.type === 'pallet' ? ((Number(selectedBin.tiers) || 1) > 1 ? ` · stack of ${selectedBin.tiers} · ${(Number(selectedBin.heightFt || 0.45) * selectedBin.tiers).toFixed(2)}ft high` : ` · ${Number(selectedBin.heightFt || 0.45).toFixed(2)}ft high`) : selectedBin.type === 'palletpal' ? ` · ${Number(selectedBin.heightFt || 3).toFixed(1)}ft platform` : selectedBin.type === 'table' ? ' · 3ft high' : selectedBin.type === 'shelf' ? ` · ${selectedBin.tiers} shelves` : selectedBin.type === 'guardrail' ? ` · ${Number(selectedBin.heightFt || 3.5).toFixed(1)}ft high` : selectedBin.type === 'gantrycrane' ? ` · ${Number(selectedBin.heightFt || 14).toFixed(1)}ft high` : selectedBin.type === 'crane' ? ` · ${selectedBin.assetHeight || 8}ft mast` : isAnyConveyor ? ` · ${selectedBin.assetHeight || (selectedBin.type === 'uline_rolling_conveyor' ? 2.8 : 3)}ft deck` : selectedBin.type === 'large' ? ` · Open Side: ${facingNames[binFacingIdx]}` : selectedBin.type === 'small' ? ` · Mesh Bin (Gate: ${facingNames[binFacingIdx]})` : ' ' + selectedBin.type.toUpperCase();
  lbl.textContent = `${typeLabel} #${selectedBin.id} (${selectedBin.w}ft × ${selectedBin.l}ft${detailSuffix})`;
  inpX.disabled = false; inpY.disabled = false;
  inpW.disabled = false; inpL.disabled = false; inpColor.disabled = false;
  inpX.value = selectedBin.x.toFixed(1);
  inpY.value = selectedBin.y.toFixed(1);
  inpW.value = selectedBin.w.toFixed(1);
  inpL.value = selectedBin.l.toFixed(1);
  inpColor.value = selectedBin.color || ({pallet:'#b88955', palletpal:'#facc15', shelf:'#1d4ed8', uline_rolling_conveyor:'#1d4ed8', crane:'#eab308', conveyor:'#eab308', large:'#059669', small:'#0284c7', table:'#2563eb', fixture:'#64748b', ibeam:'#9ca3af'})[selectedBin.type] || '#0284c7';
  const tableOptions = document.getElementById('packing-table-options');
  if (tableOptions) {
    tableOptions.style.display = selectedBin.type === 'table' ? 'block' : 'none';
    const gantryOptions = document.getElementById('gantry-crane-options');
    if (gantryOptions) {
      gantryOptions.style.display = selectedBin.type === 'gantrycrane' ? 'block' : 'none';
      const gpSel = document.getElementById('sel-gantry-points');
      if (gpSel) gpSel.value = selectedBin.gantryPoints === 2 ? '2' : '4';
    }
    const topColorInput = document.getElementById('inp-tabletop-color');
    const overheadInput = document.getElementById('inp-table-overhead-option');
    if (topColorInput) topColorInput.value = /^#[0-9a-fA-F]{6}$/.test(selectedBin.tableTopColor || '') ? selectedBin.tableTopColor : '#ffffff';
    if (overheadInput) overheadInput.checked = selectedBin.tableOverheadOption === true;
    const variantSel = document.getElementById('sel-table-variant');
    const isStation = selectedBin.type === 'table' && selectedBin.tableVariant === 'monitor';
    if (variantSel) variantSel.value = isStation ? 'monitor' : 'packing';
    if (overheadInput) {
      overheadInput.disabled = isStation;   // no overhead shelf on the computer station
      const ovLabel = document.getElementById('table-overhead-label'); if (ovLabel) ovLabel.style.opacity = isStation ? '0.45' : '1';
    }
    const variantNote = document.getElementById('table-variant-note');
    if (variantNote) variantNote.textContent = isStation ? 'Computer station: monitor on the countertop, no lower shelf and no overhead shelf.' : 'Default: blue table base with white countertop.';
  }
  document.getElementById('btn-stack').textContent = selectedBin.type === 'table'
    ? 'Stack Tier: N/A'
    : (selectedBin.type === 'shelf' ? `Shelves: ${selectedBin.tiers} (S)` : (selectedBin.type === 'pallet' ? `Pallet Stack: ${selectedBin.tiers} (S)` : `Stack Tier: ${selectedBin.tiers} (S)`));
  btns.forEach(id => document.getElementById(id).disabled = false);
  // Stacking tiers apply only to the two bin types; shelves use the same control for shelf count.
  // Pallets, PalletPal, tables, fixtures, I-beams, cranes, conveyors and imported assets are not tier-stacked.
  document.getElementById('btn-stack').disabled = !['large','small','shelf','pallet'].includes(selectedBin.type);
  const assetControls = document.getElementById('asset-function-controls');
  const isCraneOrConveyor = selectedBin.type === 'crane' || isAnyConveyor;
  assetControls.style.display = 'block';
  document.getElementById('asset-function-title').textContent = (selectedBin.type === 'palletpal' ? 'PalletPal Height Adjustment' : isCraneOrConveyor ? (selectedBin.type === 'crane' ? 'Jib Crane Functions' : 'Conveyor Functions') : 'Asset Height Adjustment');
  document.getElementById('asset-height-row').style.display = 'block';
  document.getElementById('asset-height-label').textContent = selectedBin.type === 'crane' ? 'Mast height' : (selectedBin.type === 'gantrycrane' ? 'Gantry height' : (selectedBin.type === 'palletpal' ? 'Platform height' : (selectedBin.type === 'pallet' ? 'Height per pallet' : (isAnyConveyor ? 'Deck height' : 'Height (ft)'))));
  document.getElementById('asset-height-slider').min = selectedBin.type === 'crane' ? '4' : (selectedBin.type === 'gantrycrane' ? '6' : (selectedBin.type === 'pallet' ? '0.2' : (selectedBin.type === 'uline_rolling_conveyor' ? '1.5' : (selectedBin.type === 'conveyor' ? '1' : '1'))));
  document.getElementById('asset-height-slider').max = selectedBin.type === 'crane' ? String(CRANE_MAST_MAX) : (selectedBin.type === 'gantrycrane' ? '30' : (selectedBin.type === 'pallet' ? '1' : (selectedBin.type === 'palletpal' ? '5' : (isAnyConveyor ? '4.2' : '20'))));
  document.getElementById('asset-height-slider').step = selectedBin.type === 'crane' ? '0.5' : (selectedBin.type === 'pallet' ? '0.05' : (['palletpal','conveyor','uline_rolling_conveyor'].includes(selectedBin.type) ? '0.1' : '0.5'));
  const currentHeight = isCraneOrConveyor ? (Number(selectedBin.assetHeight) || (selectedBin.type === 'crane' ? 8 : (selectedBin.type === 'uline_rolling_conveyor' ? 2.8 : 3))) : (Number(selectedBin.heightFt) || getDefaultAssetHeightFt(selectedBin));
  document.getElementById('asset-height-slider').value = String(currentHeight);
  document.getElementById('asset-height-value').textContent = `${currentHeight.toFixed(1)} ft`;
  document.getElementById('asset-angle-row').style.display = selectedBin.type === 'crane' ? 'block' : 'none';
  document.getElementById('asset-angle-slider').value = selectedBin.functionAngle || 0;
  document.getElementById('asset-angle-value').textContent = `${selectedBin.functionAngle || 0}°`;
  const boomRow = document.getElementById('asset-boom-row');
  if (boomRow) {
    boomRow.style.display = selectedBin.type === 'crane' ? 'block' : 'none';
    if (selectedBin.type === 'crane') {
      const bl = Math.round(getCraneBoomLength(selectedBin, selectedBin.w, selectedBin.l) * 10) / 10;
      document.getElementById('asset-boom-slider').value = String(bl);
      document.getElementById('asset-boom-value').textContent = `${bl.toFixed(1)} ft`;
    }
  }
  const stackRow = document.getElementById('asset-stack-row');
  if (stackRow) {
    stackRow.style.display = selectedBin.type === 'pallet' ? 'block' : 'none';
    if (selectedBin.type === 'pallet') {
      const n = Math.max(1, Math.min(PALLET_STACK_MAX, Number(selectedBin.tiers) || 1));
      document.getElementById('asset-stack-slider').value = String(n);
      document.getElementById('asset-stack-value').textContent = `${n} pallet${n === 1 ? '' : 's'}`;
    }
  }
  document.getElementById('asset-conveyor-row').style.display = isAnyConveyor ? 'block' : 'none';
  document.getElementById('asset-conveyor-running').checked = selectedBin.conveyorRunning !== false;
}

function nudgeSelected(dx, dy) {
  if (!selectedBin) return;
  selectedBin.x = Math.round((selectedBin.x + dx) * 10) / 10;
  selectedBin.y = Math.round((selectedBin.y + dy) * 10) / 10;
  syncBinPosition(selectedBin);
  updateSelectedUI();
}

function rotateSelected() {
  if (!selectedBin) return;
  const tmp = selectedBin.w;
  selectedBin.w = selectedBin.l;
  selectedBin.l = tmp;
  selectedBin.rotated = !selectedBin.rotated;
  const curFacing = Number.isInteger(selectedBin.facing)
    ? selectedBin.facing
    : ((selectedBin.type === 'large' && selectedBin.x <= 8) ? 1 : 0);
  selectedBin.facing = (curFacing + 1) % 4;
  rebuildBinVisual(selectedBin);
  updateSelectedUI();
}

function stackSelected() {
  if (!selectedBin || !['large', 'small', 'shelf', 'pallet'].includes(selectedBin.type)) return;
  if (selectedBin.type === 'pallet') {
    // Each tier is one more full pallet on top; heightFt stays the height of a single pallet.
    const cur = Math.max(1, Number(selectedBin.tiers) || 1);
    selectedBin.tiers = cur >= PALLET_STACK_MAX ? 1 : cur + 1;
  } else if (selectedBin.type === 'shelf') {
    selectedBin.tiers = selectedBin.tiers >= 6 ? 2 : selectedBin.tiers + 1;
    // Shelf count changes within the fixed 6 ft shelving unit.
    selectedBin.heightFt = 6;
  } else {
    // Bin tiers are actual vertical 3.2 ft bodies, not a visual scaling factor.
    selectedBin.tiers = (Math.max(1, Number(selectedBin.tiers) || 1) % 3) + 1;
    selectedBin.heightFt = selectedBin.tiers * 3.2;
  }
  rebuildBinVisual(selectedBin);
  updateSelectedUI();
}

function cloneSelected() {
  if (!selectedBin) return;
  const source = selectedBin;
  const nb = spawnBin(source.type, source.x + 1.0, source.y + 1.0, undefined, undefined, undefined, source.customAssetId || null);
  nb.w = source.w;
  nb.l = source.l;
  nb.rotated = !!source.rotated;
  nb.facing = Number.isInteger(source.facing) ? source.facing : ((source.type === 'large' && source.x <= 8) ? 1 : 0);
  nb.tiers = source.tiers;
  nb.color = source.color;
  nb.assetHeight = source.assetHeight; nb.heightFt = source.heightFt; nb.functionAngle = source.functionAngle || 0; nb.boomLengthFt = source.boomLengthFt; nb.conveyorRunning = source.conveyorRunning !== false;
  nb.tableTopColor = source.tableTopColor || '#f1ebdd'; nb.tableOverheadOption = source.tableOverheadOption === true; nb.tableVariant = source.tableVariant === 'monitor' ? 'monitor' : 'packing';
  rebuildBinVisual(nb);
  updateSelectedUI();
}

function deleteSelected() {
  if (!selectedBin) return;
  scene.remove(selectedBin.mesh);
  const idx = bins.indexOf(selectedBin);
  if (idx > -1) bins.splice(idx, 1);
  selectedBin = null;
  updateCountsUI();
  updateSelectedUI();
}

// Button Wiring
document.getElementById('btn-add-large').onclick = () => {
  const pos = findNextOpenSlot(4, 4);
  spawnBin('large', pos.x, pos.y);
};
document.getElementById('btn-add-small').onclick = () => {
  const pos = findNextOpenSlot(3, 3.5);
  spawnBin('small', pos.x, pos.y);
};
document.getElementById('btn-add-table').onclick = () => {
  const pos = findNextOpenSlot(3, 5);
  spawnBin('table', pos.x, pos.y);
};
document.getElementById('btn-add-shelf').onclick = () => {
  const pos = findNextOpenSlot(2, 4);
  spawnBin('shelf', pos.x, pos.y, 2, 4, 4);
};
document.getElementById('btn-add-crane').onclick = () => {
  const pos = findNextOpenSlot(4, 4);
  spawnBin('crane', pos.x, pos.y, 4, 4, 1);
};
document.getElementById('btn-add-conveyor').onclick = () => {
  const pos = findNextOpenSlot(3, 8);
  spawnBin('conveyor', pos.x, pos.y, 3, 8, 1);
};
document.getElementById('btn-add-blue-conveyor').onclick = () => {
  const pos = findNextOpenSlot(2, 8);
  spawnBin('uline_rolling_conveyor', pos.x, pos.y, 2, 8, 1, null, 'Blue Uline Rolling Conveyor');
};
document.getElementById('btn-add-pallet').onclick = () => { const pos = findNextOpenSlot(3.333, 4); spawnBin('pallet', pos.x, pos.y, 3.333, 4, 1); };
document.getElementById('btn-add-palletpal').onclick = () => { const pos = findNextOpenSlot(4, 4); spawnBin('palletpal', pos.x, pos.y, 4, 4, 1); };
document.getElementById('btn-add-ibeam').onclick = () => {
  const pos = findNextOpenSlot(2, 4);
  spawnBin('ibeam', pos.x, pos.y, 2, 4, 1);
};
document.getElementById('btn-add-guardrail').onclick = () => {
  const pos = findNextOpenSlot(0.5, 6);
  spawnBin('guardrail', pos.x, pos.y, 0.5, 6, 1);
};
document.getElementById('btn-add-oildrum').onclick = () => {
  const s = NewAssets.SPECS.oildrum, pos = findNextOpenSlot(s.w, s.l);
  spawnBin('oildrum', pos.x, pos.y, s.w, s.l, 1, null, s.name);
};
document.getElementById('btn-add-spotwelder').onclick = () => {
  const s = NewAssets.SPECS.spotwelder, pos = findNextOpenSlot(s.w, s.l);
  spawnBin('spotwelder', pos.x, pos.y, s.w, s.l, 1, null, s.name);
};
document.getElementById('btn-add-weldcurtain').onclick = () => {
  const s = NewAssets.SPECS.weldcurtain, pos = findNextOpenSlot(s.w, s.l);
  spawnBin('weldcurtain', pos.x, pos.y, s.w, s.l, 1, null, s.name);
};
document.getElementById('btn-add-downdrafttable').onclick = () => {
  const s = NewAssets.SPECS.downdrafttable, pos = findNextOpenSlot(s.w, s.l);
  spawnBin('downdrafttable', pos.x, pos.y, s.w, s.l, 1, null, s.name);
};
document.getElementById('btn-add-forklift').onclick = () => {
  const s = NewAssets.SPECS.forklift, pos = findNextOpenSlot(s.w, s.l);
  spawnBin('forklift', pos.x, pos.y, s.w, s.l, 1, null, s.name);
};
document.getElementById('btn-add-fusebox').onclick = () => {
  const s = NewAssets.SPECS.fusebox, pos = findNextOpenSlot(s.w, s.l);
  spawnBin('fusebox', pos.x, pos.y, s.w, s.l, 1, null, s.name);
};
document.getElementById('btn-add-paintbooth').onclick = () => {
  const s = NewAssets.SPECS.paintbooth, pos = findNextOpenSlot(s.w, s.l);
  spawnBin('paintbooth', pos.x, pos.y, s.w, s.l, 1, null, s.name);
};
document.getElementById('btn-add-brakepress').onclick = () => {
  const s = NewAssets.SPECS.brakepress, pos = findNextOpenSlot(s.w, s.l);
  spawnBin('brakepress', pos.x, pos.y, s.w, s.l, 1, null, s.name);
};
document.getElementById('btn-add-gantrycrane').onclick = () => {
  const s = NewAssets.SPECS.gantrycrane, pos = findNextOpenSlot(s.w, s.l);
  const b = spawnBin('gantrycrane', pos.x, pos.y, s.w, s.l, 1, null, s.name);
  if (b) b.gantryPoints = 4;
};
// ---- Home mode furniture tiles (home-assets.js). Placed inside the actual room, first free spot.
function findOpenRoomSlot(w, l) {
  const step = 0.5;
  for (let y = 0; y <= roomLengthFt - l + 1e-6; y += step) {
    for (let x = 0; x <= roomWidthFt - w + 1e-6; x += step) {
      const hit = bins.some(b => x < b.x + b.w && x + w > b.x && y < b.y + b.l && y + l > b.y);
      if (!hit) return { x, y };
    }
  }
  return findNextOpenSlot(w, l);   // room full: fall back to the warehouse placement
}
// Bind all home mode assets (including ones registered in home-assets.js after app.js runs)
function bindHomeAssetButtons() {
  if (typeof NewAssets === 'undefined' || !NewAssets.SPECS) return;
  Object.keys(NewAssets.SPECS).forEach(type => {
    const s = NewAssets.SPECS[type];
    if (s && s.mode === 'home') {
      const btn = document.getElementById('btn-add-' + type);
      if (btn && !btn.onclick) {
        btn.onclick = () => {
          const pos = findOpenRoomSlot(s.w, s.l);
          spawnBin(type, pos.x, pos.y, s.w, s.l, 1, null, s.name);
        };
      }
    }
  });
}
bindHomeAssetButtons();
window.addEventListener('DOMContentLoaded', bindHomeAssetButtons);
window.addEventListener('load', bindHomeAssetButtons);
document.getElementById('btn-batch-large').onclick = () => {
  const qty = parseInt(document.getElementById('qty-large').value) || 1;
  for (let i = 0; i < qty; i++) {
    const pos = findNextOpenSlot(4, 4);
    spawnBin('large', pos.x, pos.y);
  }
};
document.getElementById('btn-batch-small').onclick = () => {
  const qty = parseInt(document.getElementById('qty-small').value) || 1;
  for (let i = 0; i < qty; i++) {
    const pos = findNextOpenSlot(3, 3.5);
    spawnBin('small', pos.x, pos.y);
  }
};

document.getElementById('inp-x').addEventListener('input', (e) => {
  if (!selectedBin) return;
  selectedBin.x = parseFloat(e.target.value) || 0;
  syncBinPosition(selectedBin);
});
document.getElementById('inp-y').addEventListener('input', (e) => {
  if (!selectedBin) return;
  selectedBin.y = parseFloat(e.target.value) || 0;
  syncBinPosition(selectedBin);
});

function applySelectedBinSize() {
  if (!selectedBin) return;
  const w = parseFloat(document.getElementById('inp-width').value);
  const l = parseFloat(document.getElementById('inp-length').value);
  if (!Number.isFinite(w) || !Number.isFinite(l) || w < 0.2 || l < 0.2) return;
  selectedBin.w = Math.min(roomWidthFt, w);
  selectedBin.l = Math.min(roomLengthFt, l);
  syncBinPosition(selectedBin);
  rebuildBinVisual(selectedBin);
  document.getElementById('sel-label').textContent =
    `${getObjectTypeName(selectedBin)} #${selectedBin.id} (${selectedBin.w}ft × ${selectedBin.l}ft)`;
}
document.getElementById('inp-width').addEventListener('input', applySelectedBinSize);
document.getElementById('inp-length').addEventListener('input', applySelectedBinSize);
document.getElementById('inp-width').addEventListener('change', () => { applySelectedBinSize(); updateSelectedUI(); });
document.getElementById('inp-length').addEventListener('change', () => { applySelectedBinSize(); updateSelectedUI(); });
document.getElementById('inp-color').addEventListener('input', (e) => {
  if (!selectedBin) return;
  selectedBin.color = e.target.value;
  rebuildBinVisual(selectedBin);
  updateSelectedUI();
});
document.getElementById('inp-tabletop-color').addEventListener('input', (e) => {
  if (!selectedBin || selectedBin.type !== 'table') return;
  selectedBin.tableTopColor = e.target.value;
  rebuildBinVisual(selectedBin);
  updateSelectedUI();
});
document.getElementById('sel-gantry-points').addEventListener('change', (e) => {
  if (!selectedBin || selectedBin.type !== 'gantrycrane') return;
  selectedBin.gantryPoints = e.target.value === '2' ? 2 : 4;
  rebuildBinVisual(selectedBin);
  updateSelectedUI();
});
document.getElementById('sel-table-variant').addEventListener('change', (e) => {
  if (!selectedBin || selectedBin.type !== 'table') return;
  selectedBin.tableVariant = e.target.value === 'monitor' ? 'monitor' : 'packing';
  rebuildBinVisual(selectedBin);
  updateSelectedUI();
});
document.getElementById('inp-table-overhead-option').addEventListener('change', (e) => {
  if (!selectedBin || selectedBin.type !== 'table') return;
  selectedBin.tableOverheadOption = !!e.target.checked;
  rebuildBinVisual(selectedBin);
  updateSelectedUI();
});
document.getElementById('inp-label')?.addEventListener('input', (e) => {
  if (!selectedBin) return;
  selectedBin.label = e.target.value;
  const lbl = document.getElementById('sel-label');
  if (lbl) {
    const customAsset = selectedBin.type === 'custom' ? customAssetLibrary.find(a => a.id === selectedBin.customAssetId) : null;
    const typeLabel = ({custom: customAsset?.name || 'Custom 3D Asset', pallet: 'Standard Pallet', palletpal: 'PalletPal Leveler', table: (selectedBin.tableVariant === 'monitor' ? 'Computer Station' : 'Packing Table'), shelf: 'Blue Shelf', fixture: 'Grey Box', crane: 'Jib Crane', conveyor: 'Conveyor'})[selectedBin.type] || ((typeof NewAssets !== 'undefined' && NewAssets.has(selectedBin.type)) ? NewAssets.typeName(selectedBin.type) : null) || 'Bin';
    lbl.textContent = `${selectedBin.label || typeLabel} #${selectedBin.id} (${selectedBin.w}ft × ${selectedBin.l}ft)`;
  }
});
function applySelectedAssetHeight(rawValue) {
  if (!selectedBin) return;
  const slider = document.getElementById('asset-height-slider');
  const specialAsset = ['crane', 'conveyor', 'uline_rolling_conveyor'].includes(selectedBin.type);
  const minHeight = selectedBin.type === 'crane' ? 4 : (selectedBin.type === 'gantrycrane' ? 6 : (selectedBin.type === 'pallet' ? 0.2 : (selectedBin.type === 'uline_rolling_conveyor' ? 1.5 : 1)));
  const maxHeight = selectedBin.type === 'crane' ? CRANE_MAST_MAX : (selectedBin.type === 'gantrycrane' ? 30 : (selectedBin.type === 'pallet' ? 1 : (selectedBin.type === 'palletpal' ? 5 : (['conveyor','uline_rolling_conveyor'].includes(selectedBin.type) ? 4.2 : 20))));
  const step = selectedBin.type === 'crane' ? 0.5 : (selectedBin.type === 'pallet' ? 0.05 : (['palletpal','conveyor','uline_rolling_conveyor'].includes(selectedBin.type) ? 0.1 : 0.5));
  let height = Number(rawValue);
  if (!Number.isFinite(height)) height = specialAsset ? (selectedBin.type === 'crane' ? 8 : (selectedBin.type === 'uline_rolling_conveyor' ? 2.8 : 3)) : getDefaultAssetHeightFt(selectedBin);
  height = Math.max(minHeight, Math.min(maxHeight, Math.round(height / step) * step));
  height = Math.round(height * 10) / 10;
  if (specialAsset) selectedBin.assetHeight = height;
  else selectedBin.heightFt = height;

  // Rebuild immediately so the model and its selection outline reflect the height.
  rebuildBinVisual(selectedBin);
  slider.value = String(height);
  document.getElementById('asset-height-value').textContent = `${height.toFixed(1)} ft`;
  updateSelectedUI();
}

document.getElementById('asset-height-slider').addEventListener('input', e => {
  applySelectedAssetHeight(e.target.value);
});
document.getElementById('asset-height-slider').addEventListener('change', e => {
  applySelectedAssetHeight(e.target.value);
});
document.getElementById('asset-angle-slider').addEventListener('input', e => {
  if (!selectedBin || selectedBin.type !== 'crane') return;
  const requested = Math.round(Number(e.target.value) || 0);
  const allowed = limitCraneSwing(selectedBin, requested);   // boom collision box stops at walls
  selectedBin.functionAngle = allowed;
  applyCraneSwingLive(selectedBin);                          // rotate in place: no rebuild per slider tick
  e.target.value = String(allowed);
  document.getElementById('asset-angle-value').textContent = allowed !== requested ? `${allowed}° (wall limit)` : `${allowed}°`;
});
document.getElementById('asset-stack-slider').addEventListener('input', e => {
  if (!selectedBin || selectedBin.type !== 'pallet') return;
  selectedBin.tiers = Math.max(1, Math.min(PALLET_STACK_MAX, Math.round(Number(e.target.value)) || 1));
  rebuildBinVisual(selectedBin); updateSelectedUI();
});
document.getElementById('asset-boom-slider').addEventListener('input', e => {
  if (!selectedBin || selectedBin.type !== 'crane') return;
  const requested = Number(e.target.value) || CRANE_BOOM_MIN;
  const allowed = limitCraneBoomLength(selectedBin, requested);   // base plate (w x l) is never touched
  selectedBin.boomLengthFt = allowed;
  rebuildBinVisual(selectedBin);
  e.target.value = String(allowed);
  document.getElementById('asset-boom-value').textContent = `${allowed.toFixed(1)} ft` + (allowed < requested - 0.01 ? ' (wall limit)' : '');
});
document.getElementById('asset-conveyor-running').addEventListener('change', e => {
  if (!selectedBin || !['conveyor', 'uline_rolling_conveyor'].includes(selectedBin.type)) return;
  selectedBin.conveyorRunning = e.target.checked;
  rebuildBinVisual(selectedBin); updateSelectedUI();
});

document.getElementById('btn-nudge-left').onclick  = () => nudgeSelected(-snapIncrement, 0);
document.getElementById('btn-nudge-right').onclick = () => nudgeSelected(snapIncrement, 0);
document.getElementById('btn-nudge-up').onclick    = () => nudgeSelected(0, snapIncrement);
document.getElementById('btn-nudge-down').onclick  = () => nudgeSelected(0, -snapIncrement);
document.getElementById('btn-rotate').onclick      = rotateSelected;
document.getElementById('btn-stack').onclick       = stackSelected;
document.getElementById('btn-clone').onclick       = cloneSelected;
document.getElementById('btn-delete').onclick      = deleteSelected;

document.getElementById('btn-clear-bins').onclick = () => {
  for (let i = bins.length - 1; i >= 0; i--) {
    if (bins[i].type !== 'shelf') {
      scene.remove(bins[i].mesh);
      if (selectedBin === bins[i]) selectedBin = null;
      bins.splice(i, 1);
    }
  }
  updateCountsUI();
  updateSelectedUI();
};

document.getElementById('btn-clear-all-objects').onclick = async () => {
  if (!(await appConfirm('Clear all objects from the warehouse? This removes all bins, shelves, columns, movable assets, utility drops, routes, and fixed equipment. The floor and walls will remain.', 'Clear All Objects'))) return;
  bins.forEach(b => { if (b.mesh) scene.remove(b.mesh); });
  bins.length = 0;
  selectedBin = null;
  suppressDefaultShelvesOnLoad = true;
  scene.remove(gorbelCrane);
  conveyors.forEach(c => scene.remove(c.group));
  scene.remove(fixedSteelIBeamColumn);
  scene.remove(fixedAdjacentFixtureBox);

  // Clear overhead utility drops and routes
  for (const key of ['electrical', 'gas', 'air']) {
    customRoofDrops[key] = [];
    customRoofRoutes[key] = [];
    if (customRoofDropGroups[key]) {
      while (customRoofDropGroups[key].children.length) {
        const obj = customRoofDropGroups[key].children.pop();
        customRoofDropGroups[key].remove(obj);
        obj.traverse?.(part => {
          if (part.geometry) part.geometry.dispose();
          if (part.material && part.material.dispose) part.material.dispose();
        });
      }
    }
    clearCustomRoofMeshes(key);
  }
  roofRouteCurrentPoints = [];
  roofRouteDrawing = false;
  roofRoutePointerDown = false;
  roofDropPlacementMode = false;
  roofDropAssetPlacementType = null;
  if (roofDropHoverBox) roofDropHoverBox.visible = false;
  renderAllCustomRoofRoutes();
  refreshRoofDropAssetSelect();
  updateRoofRouteStatus('No route drawing in progress.');

  isDraggingBin = false;
  isDraggingGorbelCrane = false;
  isDraggingFixedConveyor = false;
  activeFixedConveyor = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = 'default';
  updateCountsUI();
  updateSelectedUI();
  document.getElementById('coord-readout').textContent = 'All objects cleared — floor and walls preserved.';
  setSaveStatus('All placed objects and overhead drops cleared. Floor and walls preserved. Save or export the project to keep this layout.');
};

// Keyboard Shortcuts (Arrow keys to move selected bin, R to rotate, S to stack, Del to remove)
window.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
  if (e.key === 'Escape' && eyeLevelPickSquareMode) {
    eyeLevelPickSquareMode = false;
    syncEyeLevelMarkerAndUI();
    renderer.domElement.style.cursor = currentCameraMode === 'eye' ? 'grab' : 'default';
    return;
  }
  if (currentCameraMode === 'eye') {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); eyeLevelYaw -= 0.08; applyEyeLevelCameraTransform(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); eyeLevelYaw += 0.08; applyEyeLevelCameraTransform(); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); eyeLevelPitch = Math.min(1.42, eyeLevelPitch + 0.06); applyEyeLevelCameraTransform(); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); eyeLevelPitch = Math.max(-1.42, eyeLevelPitch - 0.06); applyEyeLevelCameraTransform(); return; }
    if (e.key === 'w' || e.key === 'W') { e.preventDefault(); stepEyeLevelSquare(0, 1); return; }
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); stepEyeLevelSquare(0, -1); return; }
    if (e.key === 'a' || e.key === 'A') { e.preventDefault(); stepEyeLevelSquare(-1, 0); return; }
    if (e.key === 'd' || e.key === 'D') { e.preventDefault(); stepEyeLevelSquare(1, 0); return; }
    return;
  }
  if (!selectedBin) return;
  if (e.key === 'ArrowLeft')  { e.preventDefault(); nudgeSelected(-snapIncrement, 0); }
  if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelected(snapIncrement, 0); }
  if (e.key === 'ArrowUp')    { e.preventDefault(); nudgeSelected(0, snapIncrement); }
  if (e.key === 'ArrowDown')  { e.preventDefault(); nudgeSelected(0, -snapIncrement); }
  if (e.key === 'r' || e.key === 'R') rotateSelected();
  if (e.key === 's' || e.key === 'S') stackSelected();
  if (e.key === 'c' || e.key === 'C') cloneSelected();
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
});

function setSnap(val) {
  snapIncrement = val;
  document.getElementById('snap-1').className  = val === 1.0 ? 'btn-amber' : '';
  document.getElementById('snap-05').className = val === 0.5 ? 'btn-amber' : '';
  document.getElementById('snap-01').className = val === 0.1 ? 'btn-amber' : '';
}

// Conveyor Lift Sliders (Independent per Conveyor)
document.getElementById('lift-slider').addEventListener('input', (e) => {
  updateSingleConveyorHeight(0, parseFloat(e.target.value));
});
document.getElementById('lift-slider-2').addEventListener('input', (e) => {
  updateSingleConveyorHeight(1, parseFloat(e.target.value));
});
document.getElementById('lift-slider-3').addEventListener('input', (e) => {
  updateSingleConveyorHeight(2, parseFloat(e.target.value));
});
document.getElementById('btn-reset-conveyors').addEventListener('click', () => {
  updateConveyorHeight(3.0);
});

// Camera Views
let currentCameraMode = 'iso';
let cameraTransition = null;

function getCameraModeLabel(mode) {
  const map = {
    'iso': '3D Isometric View',
    'top': '2D Top Blueprint (1:1 Grid)',
    'front': 'South Front Elevation',
    'rear': 'North Rear Elevation',
    'east': 'East Profile Elevation',
    'west': 'West Profile Elevation',
    'corner-sw': 'Southwest Corner Perspective',
    'corner-se': 'Southeast Corner Perspective',
    'corner-nw': 'Northwest Corner Perspective',
    'corner-ne': 'Northeast Corner Perspective',
    'eye': 'Eye-Level Walkthrough (5.5ft)',
    'drone': 'Aerial Drone (65° Pitch)',
    'focus': 'Asset Close-Up Framing'
  };
  return map[mode] || 'Custom Perspective';
}

function setCameraStatus(msg) {
  const el = document.getElementById('camera-photo-status');
  if (el) el.textContent = msg;
}

function startCameraTransition(endPos, endTarget, durationMs = 400) {
  cameraTransition = {
    startPos: perspCam.position.clone(),
    endPos: endPos.clone(),
    startTarget: controls.target.clone(),
    endTarget: endTarget.clone(),
    startTime: performance.now(),
    durationMs: Math.max(100, durationMs)
  };
}

function updateCameraTransition() {
  if (!cameraTransition) return;
  const now = performance.now();
  const elapsed = now - cameraTransition.startTime;
  const progress = Math.min(1, elapsed / cameraTransition.durationMs);

  // Smooth ease-in-out quadratic curve
  const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

  perspCam.position.lerpVectors(cameraTransition.startPos, cameraTransition.endPos, ease);
  controls.target.lerpVectors(cameraTransition.startTarget, cameraTransition.endTarget, ease);
  controls.update();

  if (progress >= 1) {
    cameraTransition = null;
  }
}

function rotateCameraOrbit(deg) {
  if (currentCameraMode === 'eye') {
    eyeLevelYaw += (deg * Math.PI / 180);
    applyEyeLevelCameraTransform();
    setCameraStatus(`Eye-Level look rotated ${deg > 0 ? '+' : ''}${deg}° on Square (${eyeLevelSquare.x}', ${eyeLevelSquare.y}')`);
    return;
  }
  if (activeCam !== perspCam) setCameraView('iso', false);
  const rad = deg * Math.PI / 180;
  const offset = new THREE.Vector3().subVectors(perspCam.position, controls.target);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const newX = offset.x * cos - offset.z * sin;
  const newZ = offset.x * sin + offset.z * cos;
  perspCam.position.set(controls.target.x + newX, perspCam.position.y, controls.target.z + newZ);
  controls.update();
  setCameraStatus(`Camera orbited ${deg > 0 ? '+' : ''}${deg}°`);
}

function focusSelectedAsset() {
  if (!selectedBin) {
    setCameraStatus('Select an asset on the floor first to frame it in 3D.');
    return;
  }
  const b = selectedBin;
  const h = b.assetHeight || b.heightFt || 4;
  const targetLookAt = new THREE.Vector3(
    b.x + b.w / 2,
    h * 0.5,
    toWorldZ(b.y + b.l / 2)
  );
  const span = Math.max(b.w, b.l, 4);
  const dist = span * 2.4;
  const targetPos = new THREE.Vector3(
    targetLookAt.x + dist * 0.7,
    targetLookAt.y + dist * 0.6,
    targetLookAt.z + dist * 0.7
  );

  activeCam = perspCam;
  perspCam.up.set(0, 1, 0);
  controls.object = perspCam;
  perspCam.fov = 45;
  perspCam.updateProjectionMatrix();
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  startCameraTransition(targetPos, targetLookAt, 450);
  currentCameraMode = 'focus';
  setCameraStatus(`Framed asset: ${b.label || b.type} (${b.w}' × ${b.l}')`);
}

function setCameraView(mode, animate = true) {
  currentCameraMode = mode;
  const cx = roomWidthFt / 2;
  const cy = roomLengthFt / 2;
  const cz = toWorldZ(cy);
  const maxDim = Math.max(roomWidthFt, roomLengthFt);

  const fovSlider = document.getElementById('camera-fov-slider');
  const fovBadge = document.getElementById('camera-fov-val');
  const elevSlider = document.getElementById('camera-elev-slider');
  const elevBadge = document.getElementById('camera-elev-val');

  if (mode !== 'eye') {
    eyeLevelLookDragging = false;
    controls.enabled = true;
    renderer.domElement.style.cursor = eyeLevelPickSquareMode ? 'crosshair' : 'default';
  }

  if (mode === 'top') {
    activeCam = orthoCam;
    const newOrthoSize = maxDim * 0.58;
    const a = window.innerWidth / window.innerHeight;
    orthoCam.left = -newOrthoSize * a;
    orthoCam.right = newOrthoSize * a;
    orthoCam.top = newOrthoSize;
    orthoCam.bottom = -newOrthoSize;
    orthoCam.position.set(cx, 130, cz);
    orthoCam.up.set(0, 0, -1);
    orthoCam.updateProjectionMatrix();
    controls.object = orthoCam;
    controls.target.set(cx, 0, cz);
    controls.enableRotate = false;
    controls.maxPolarAngle = Math.PI / 2;
    controls.update();
    syncEyeLevelMarkerAndUI();
    setCameraStatus('Switched to: 2D Top Blueprint (1:1 Grid)');
    return;
  }

  // Perspective Camera
  activeCam = perspCam;
  perspCam.up.set(0, 1, 0);
  controls.object = perspCam;
  controls.enableRotate = true;

  let targetPos = new THREE.Vector3();
  let targetLookAt = new THREE.Vector3(cx, 0, cz);
  let targetFov = 45;

  if (mode === 'iso') {
    targetPos.set(cx, maxDim * 1.25, cz + maxDim * 1.05);
    targetLookAt.set(cx, 0, cz);
    targetFov = 45;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  } else if (mode === 'front') {
    targetPos.set(cx, 25, cz + maxDim * 1.15);
    targetLookAt.set(cx, 8, cz);
    targetFov = 45;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  } else if (mode === 'rear') {
    targetPos.set(cx, 25, cz - maxDim * 1.15);
    targetLookAt.set(cx, 8, cz);
    targetFov = 45;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  } else if (mode === 'east') {
    targetPos.set(cx + maxDim * 1.15, 25, cz);
    targetLookAt.set(cx, 8, cz);
    targetFov = 45;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  } else if (mode === 'west') {
    targetPos.set(cx - maxDim * 1.15, 25, cz);
    targetLookAt.set(cx, 8, cz);
    targetFov = 45;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  } else if (mode === 'corner-sw') {
    targetPos.set(cx - maxDim * 0.95, maxDim * 0.72, cz + maxDim * 0.95);
    targetLookAt.set(cx, 4, cz);
    targetFov = 48;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  } else if (mode === 'corner-se') {
    targetPos.set(cx + maxDim * 0.95, maxDim * 0.72, cz + maxDim * 0.95);
    targetLookAt.set(cx, 4, cz);
    targetFov = 48;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  } else if (mode === 'corner-nw') {
    targetPos.set(cx - maxDim * 0.95, maxDim * 0.72, cz - maxDim * 0.95);
    targetLookAt.set(cx, 4, cz);
    targetFov = 48;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  } else if (mode === 'corner-ne') {
    targetPos.set(cx + maxDim * 0.95, maxDim * 0.72, cz - maxDim * 0.95);
    targetLookAt.set(cx, 4, cz);
    targetFov = 48;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  } else if (mode === 'eye') {
    // Deselect any active asset so no resize handles are shown and lock onto eyeLevelSquare
    if (selectedBin) selectBin(null);
    if (lastClickedFloorSquare && Number.isFinite(lastClickedFloorSquare.x) && Number.isFinite(lastClickedFloorSquare.y)) {
      eyeLevelSquare = {
        x: Math.max(0, Math.min(roomWidthFt - 1, Math.floor(lastClickedFloorSquare.x))),
        y: Math.max(0, Math.min(roomLengthFt - 1, Math.floor(lastClickedFloorSquare.y)))
      };
    }
    perspCam.fov = 65;
    perspCam.updateProjectionMatrix();
    if (fovSlider) fovSlider.value = '65';
    if (fovBadge) fovBadge.textContent = '65°';
    if (elevSlider) elevSlider.value = String(Math.round(eyeLevelHeightFt));
    if (elevBadge) elevBadge.textContent = `${eyeLevelHeightFt.toFixed(1)} ft`;
    controls.enabled = false;
    applyEyeLevelCameraTransform();
    syncEyeLevelMarkerAndUI();
    renderer.domElement.style.cursor = 'grab';
    const msg = `🚶 Eye-Level Locked at Square (X: ${eyeLevelSquare.x} ft, Y: ${eyeLevelSquare.y} ft) — Drag to pan/look 360° safely (Assets Locked)`;
    document.getElementById('coord-readout').textContent = msg;
    setCameraStatus(msg);
    return;
  } else if (mode === 'drone') {
    // Steep aerial inspection drone
    targetPos.set(cx, maxDim * 1.05, cz + maxDim * 0.45);
    targetLookAt.set(cx, 0, cz - 8);
    targetFov = 55;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
  }

  perspCam.fov = targetFov;
  perspCam.updateProjectionMatrix();

  if (fovSlider) fovSlider.value = targetFov;
  if (fovBadge) fovBadge.textContent = `${targetFov}°`;
  if (elevSlider) elevSlider.value = Math.round(targetPos.y);
  if (elevBadge) elevBadge.textContent = `${Math.round(targetPos.y)} ft`;

  if (!animate) {
    cameraTransition = null;
    perspCam.position.copy(targetPos);
    controls.target.copy(targetLookAt);
    controls.update();
  } else {
    startCameraTransition(targetPos, targetLookAt, 400);
  }

  syncEyeLevelMarkerAndUI();
  setCameraStatus(`Camera: ${getCameraModeLabel(mode)}`);
}

function updateViewModeSplitUI() {
  const realisticBtn = document.getElementById('btn-view-realistic');
  const cadBtn = document.getElementById('btn-view-cad');
  if (realisticBtn) {
    realisticBtn.classList.toggle('is-active', !!realisticMode);
    realisticBtn.setAttribute('aria-pressed', realisticMode ? 'true' : 'false');
  }
  if (cadBtn) {
    cadBtn.classList.toggle('is-active', !realisticMode);
    cadBtn.setAttribute('aria-pressed', !realisticMode ? 'true' : 'false');
  }
  // Legacy single-button id (if any older HUD still references it)
  const legacy = document.getElementById('btn-toggle-realism');
  if (legacy) {
    legacy.textContent = realisticMode ? '✨ Realistic: ON' : '📐 CAD Mode';
    legacy.className = realisticMode ? 'btn-emerald' : 'btn-amber';
  }
}

function setRealisticMode(enabled, { silent = false } = {}) {
  const next = !!enabled;
  // Always apply materials/lights so UI and filter stay in sync even if re-clicking active side
  realisticMode = next;

  // Soft studio env only in Realistic — gives metals/paint proper specular response.
  // CAD stays environment-free for flat technical shading.
  if (typeof studioEnvTexture !== 'undefined' && studioEnvTexture) {
    scene.environment = realisticMode ? studioEnvTexture : null;
  } else {
    scene.environment = null;
  }

  if (realisticMode) {
    ambientLight.intensity = 0.62;
    hemiLight.intensity = 0.0;
    dirLight.intensity = 0.72;
  } else {
    // Slightly flatter, brighter ambient CAD look
    ambientLight.intensity = 0.78;
    hemiLight.intensity = 0.12;
    dirLight.intensity = 0.55;
  }

  if (typeof highBayLightsGroup !== 'undefined' && highBayLightsGroup) {
    highBayLightsGroup.visible = false; // decorative roof LEDs disabled
  }

  // CAD floor tiles: solid checker colors in CAD, textured under the overlay otherwise
  if (typeof matTileEven !== 'undefined' && matTileEven) {
    matTileEven.map = realisticMode ? texTileEven : null;
    matTileOdd.map = realisticMode ? texTileOdd : null;
    matTileEven.color.setHex(realisticMode ? 0xffffff : 0xb0bccb);
    matTileOdd.color.setHex(realisticMode ? 0xffffff : 0xa3b0c0);
    matTileEven.roughness = 0.78;
    matTileOdd.roughness = 0.82;
    matTileEven.envMapIntensity = 0.0;
    matTileOdd.envMapIntensity = 0.0;
    matTileEven.needsUpdate = true;
    matTileOdd.needsUpdate = true;
  }

  // CAD grid stays intact — only hide the group in Realistic (do not mutate line material)
  if (typeof gridLinesGroup !== 'undefined' && gridLinesGroup) {
    gridLinesGroup.visible = !realisticMode;
  }
  if (typeof majorLineMat !== 'undefined' && majorLineMat) {
    majorLineMat.opacity = 0.65;
    majorLineMat.transparent = true;
    majorLineMat.visible = true;
    majorLineMat.needsUpdate = true;
  }
  // Opaque grey concrete overlay covers grid in Realistic only
  if (typeof realisticFloorOverlay !== 'undefined' && realisticFloorOverlay) {
    realisticFloorOverlay.visible = !!realisticMode;
  }
  if (typeof matRealisticFloor !== 'undefined' && matRealisticFloor) {
    matRealisticFloor.envMapIntensity = realisticMode ? 0.08 : 0.0;
    matRealisticFloor.needsUpdate = true;
  }

  if (typeof wallMat !== 'undefined' && wallMat) {
    wallMat.map = realisticMode ? getRibbedWallTexture() : null;
    wallMat.opacity = realisticMode ? 0.68 : 0.55;
    wallMat.envMapIntensity = realisticMode ? 0.15 : 0.0;
    wallMat.needsUpdate = true;
  }

  if (Array.isArray(bins)) bins.forEach(b => rebuildBinVisual(b));
  if (typeof updateViewModeSplitUI === 'function') updateViewModeSplitUI();

  if (!silent) {
    const msg = realisticMode
      ? '✨ Photorealistic PBR Mode ON — Studio reflections, soft shadows & polished concrete slab active.'
      : '📐 CAD Schematic Mode ON — Flat technical shading and full CAD wireframe bounding boxes active.';
    const readout = document.getElementById('coord-readout');
    if (readout) readout.textContent = msg;
    if (typeof setCameraStatus === 'function') setCameraStatus(msg);
  }
}

function toggleRealisticMode() {
  setRealisticMode(!realisticMode);
}

function toggleWalls() {
  wallsGroup.visible = !wallsGroup.visible;
  wallHandlesGroup.visible = wallsGroup.visible;
}

function setRoomDimensions(newWidthFt, newLengthFt) {
  const clampedW = Math.max(MIN_ROOM_WIDTH_FT, Math.min(MAX_ROOM_WIDTH_FT, Math.round(Number(newWidthFt) || BASE_ROOM_WIDTH_FT)));
  const clampedL = Math.max(MIN_ROOM_LENGTH_FT, Math.min(MAX_ROOM_LENGTH_FT, Math.round(Number(newLengthFt) || BASE_ROOM_LENGTH_FT)));
  const changed = (clampedW !== roomWidthFt || clampedL !== roomLengthFt);

  roomWidthFt = clampedW;
  roomLengthFt = clampedL;
  // Sync UI inputs, sliders, and badges
  const wDiff = roomWidthFt - BASE_ROOM_WIDTH_FT;
  const lDiff = roomLengthFt - BASE_ROOM_LENGTH_FT;
  const wSign = wDiff >= 0 ? `+${wDiff}'` : `${wDiff}'`;
  const lSign = lDiff >= 0 ? `+${lDiff}'` : `${lDiff}'`;

  const sizeBadge = document.getElementById('floor-size-val');
  const expDims = document.getElementById('exp-room-dims');
  if (expDims) expDims.textContent = `${roomWidthFt}' × ${roomLengthFt}'`;
  if (sizeBadge) sizeBadge.textContent = `${roomWidthFt} ft × ${roomLengthFt} ft`;
  const wBadge = document.getElementById('room-width-badge');
  if (wBadge) wBadge.textContent = `${roomWidthFt} ft (${wSign})`;
  const lBadge = document.getElementById('room-length-badge');
  if (lBadge) lBadge.textContent = `${roomLengthFt} ft (${lSign})`;

  const inpW = document.getElementById('inp-room-width');
  if (inpW && document.activeElement !== inpW) inpW.value = String(roomWidthFt);
  const sliderW = document.getElementById('slider-room-width');
  if (sliderW) sliderW.value = String(roomWidthFt);

  const inpL = document.getElementById('inp-room-length');
  if (inpL && document.activeElement !== inpL) inpL.value = String(roomLengthFt);
  const sliderL = document.getElementById('slider-room-length');
  if (sliderL) sliderL.value = String(roomLengthFt);

  const binInpW = document.getElementById('inp-width');
  if (binInpW) binInpW.max = String(roomWidthFt);
  const binInpL = document.getElementById('inp-length');
  if (binInpL) binInpL.max = String(roomLengthFt);

  const hudTitle = document.querySelector('.hud-title');
  if (hudTitle) {
    if (roomWidthFt === BASE_ROOM_WIDTH_FT && roomLengthFt === BASE_ROOM_LENGTH_FT) {
      hudTitle.textContent = 'Layout Design Studio';
    } else {
      hudTitle.textContent = `WAREHOUSE CAD LAYOUT — ${roomWidthFt}ft × ${roomLengthFt}ft (${wSign} W, ${lSign} L · 1ft Grid Steps)`;
    }
  }

  if (changed) {
    rebuildFloorTilesAndGrid();
    rebuildPerimeterWalls();
    bins.forEach(b => syncBinPosition(b));
    if (selectedBin) updateSelectedUI();
  }
  if (typeof updateRenderDistanceForRoom === 'function') updateRenderDistanceForRoom();
}

// 1-Grid (1 ft) Stepper Buttons, Number Inputs, and Sliders for Width (X) & Length (Y)
document.getElementById('btn-width-dec').addEventListener('click', () => setRoomDimensions(roomWidthFt - 1, roomLengthFt));
document.getElementById('btn-width-inc').addEventListener('click', () => setRoomDimensions(roomWidthFt + 1, roomLengthFt));
document.getElementById('inp-room-width').addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  if (Number.isFinite(val)) setRoomDimensions(val, roomLengthFt);
});
document.getElementById('inp-room-width').addEventListener('change', (e) => {
  setRoomDimensions(parseInt(e.target.value, 10) || BASE_ROOM_WIDTH_FT, roomLengthFt);
  e.target.value = String(roomWidthFt);
});
document.getElementById('slider-room-width').addEventListener('input', (e) => {
  setRoomDimensions(parseInt(e.target.value, 10), roomLengthFt);
});

document.getElementById('btn-length-dec').addEventListener('click', () => setRoomDimensions(roomWidthFt, roomLengthFt - 1));
document.getElementById('btn-length-inc').addEventListener('click', () => setRoomDimensions(roomWidthFt, roomLengthFt + 1));
document.getElementById('inp-room-length').addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  if (Number.isFinite(val)) setRoomDimensions(roomWidthFt, val);
});
document.getElementById('inp-room-length').addEventListener('change', (e) => {
  setRoomDimensions(roomWidthFt, parseInt(e.target.value, 10) || BASE_ROOM_LENGTH_FT);
  e.target.value = String(roomLengthFt);
});
document.getElementById('slider-room-length').addEventListener('input', (e) => {
  setRoomDimensions(roomWidthFt, parseInt(e.target.value, 10));
});

document.getElementById('btn-reset-floor').addEventListener('click', () => {
  if (cumulativeWestShiftFt !== 0 || cumulativeSouthShiftFt !== 0) {
    shiftFacilityContents(-cumulativeWestShiftFt, -cumulativeSouthShiftFt);
    cumulativeWestShiftFt = 0;
    cumulativeSouthShiftFt = 0;
  }
  customRoomOutline = null;
  if (typeof stopFreeformRoomDrawing === 'function') stopFreeformRoomDrawing();
  setRoomDimensions(BASE_ROOM_WIDTH_FT, BASE_ROOM_LENGTH_FT);
  rebuildFloorTilesAndGrid();
  rebuildPerimeterWalls();
  if (typeof updateFreeformUIStats === 'function') updateFreeformUIStats();
});

// Symmetrical 2-Direction Quick Expand Buttons
document.getElementById('btn-expand-both-w')?.addEventListener('click', () => {
  expandFacility('both-x', 2);
});
document.getElementById('btn-expand-both-l')?.addEventListener('click', () => {
  expandFacility('both-y', 2);
});

// Directional Wall Expansion & Shrink Buttons
document.getElementById('btn-expand-west')?.addEventListener('click', () => {
  expandFacility('west', 1);
});
document.getElementById('btn-shrink-west')?.addEventListener('click', () => {
  expandFacility('west', -1);
});
document.getElementById('btn-expand-east')?.addEventListener('click', () => {
  expandFacility('east', 1);
});
document.getElementById('btn-shrink-east')?.addEventListener('click', () => {
  expandFacility('east', -1);
});

document.getElementById('btn-expand-north')?.addEventListener('click', () => {
  expandFacility('north', 1);
});
document.getElementById('btn-shrink-north')?.addEventListener('click', () => {
  expandFacility('north', -1);
});
document.getElementById('btn-expand-south')?.addEventListener('click', () => {
  expandFacility('south', 1);
});
document.getElementById('btn-shrink-south')?.addEventListener('click', () => {
  expandFacility('south', -1);
});

// Backwards-compatible wireup for old dec/inc buttons
document.getElementById('btn-width-dec')?.addEventListener('click', () => {
  const isSym = document.getElementById('chk-symmetric-expand')?.checked;
  if (isSym) expandFacility('both-x', -2);
  else expandFacility('east', -1);
});
document.getElementById('btn-width-inc')?.addEventListener('click', () => {
  const isSym = document.getElementById('chk-symmetric-expand')?.checked;
  if (isSym) expandFacility('both-x', 2);
  else expandFacility('east', 1);
});
document.getElementById('btn-length-dec')?.addEventListener('click', () => {
  const isSym = document.getElementById('chk-symmetric-expand')?.checked;
  if (isSym) expandFacility('both-y', -2);
  else expandFacility('north', -1);
});
document.getElementById('btn-length-inc')?.addEventListener('click', () => {
  const isSym = document.getElementById('chk-symmetric-expand')?.checked;
  if (isSym) expandFacility('both-y', 2);
  else expandFacility('north', 1);
});

// ============================================================================
// 📐 MULTI-POINT FREEFORM ROOM EDITOR ENGINE
// Edit existing outline in place (drag corners / insert on edges).
// Equipment & bins are never cleared — only walls + floor footprint update.
// ============================================================================
let freeformRoomDrawMode = false;
let freeformEditMode = true; // true = edit current outline; false = draw a brand-new outline from scratch
let freeformPoints = [];
let freeformDragVertex = -1;
const freeformPreviewGroup = new THREE.Group();
freeformPreviewGroup.name = 'Freeform Room Outline Preview';
scene.add(freeformPreviewGroup);

let freeformHoverMarker = null;
let freeformRubberBandLine = null;
let freeformOutlineLine = null;
const freeformVertexMarkers = [];

function getDefaultRoomOutlinePts() {
  return [[0, 0], [roomWidthFt, 0], [roomWidthFt, roomLengthFt], [0, roomLengthFt]];
}

function getActiveRoomOutlinePts() {
  if (customRoomOutline && customRoomOutline.length >= 3) {
    return customRoomOutline.map(p => [Number(p[0]), Number(p[1])]);
  }
  return getDefaultRoomOutlinePts();
}

function initFreeformPreview() {
  if (freeformHoverMarker) return;
  const hGeom = new THREE.SphereGeometry(0.55, 16, 16);
  const hMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
  freeformHoverMarker = new THREE.Mesh(hGeom, hMat);
  freeformHoverMarker.visible = false;
  freeformPreviewGroup.add(freeformHoverMarker);

  const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
  const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0.1,0), new THREE.Vector3(0,0.1,0)]);
  freeformRubberBandLine = new THREE.Line(geom, lineMat);
  freeformRubberBandLine.visible = false;
  freeformPreviewGroup.add(freeformRubberBandLine);

  const loopMat = new THREE.LineBasicMaterial({ color: 0x0ea5e9, linewidth: 3 });
  const loopGeom = new THREE.BufferGeometry();
  freeformOutlineLine = new THREE.Line(loopGeom, loopMat);
  freeformOutlineLine.visible = false;
  freeformPreviewGroup.add(freeformOutlineLine);
}

function calculatePolygonArea(pts) {
  if (!pts || pts.length < 3) return 0;
  let area = 0.0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return Math.round(Math.abs(area) / 2.0);
}

function projectPointToSegment(px, py, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-8) {
    const dist = Math.hypot(px - a[0], py - a[1]);
    return { dist, point: [a[0], a[1]], t: 0 };
  }
  let t = ((px - a[0]) * abx + (py - a[1]) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a[0] + t * abx, qy = a[1] + t * aby;
  return { dist: Math.hypot(px - qx, py - qy), point: [qx, qy], t };
}

function updateFreeformUIStats() {
  const current = freeformRoomDrawMode && freeformPoints.length >= 3
    ? freeformPoints
    : getActiveRoomOutlinePts();

  const cornersEl = document.getElementById('freeform-stat-corners');
  const areaEl = document.getElementById('freeform-stat-area');
  const spanEl = document.getElementById('freeform-stat-span');
  const textarea = document.getElementById('freeform-points-textarea');

  const area = calculatePolygonArea(current);
  const minX = Math.min(...current.map(p => p[0]));
  const maxX = Math.max(...current.map(p => p[0]));
  const minY = Math.min(...current.map(p => p[1]));
  const maxY = Math.max(...current.map(p => p[1]));
  const spanW = Math.round(maxX - Math.min(0, minX));
  const spanL = Math.round(maxY - Math.min(0, minY));

  if (cornersEl) cornersEl.textContent = `${current.length} corners`;
  if (areaEl) areaEl.textContent = `${area.toLocaleString()} sq ft`;
  if (spanEl) spanEl.textContent = `${spanW}' × ${spanL}'`;
  if (textarea && !freeformRoomDrawMode) {
    textarea.value = current.map(p => `${p[0]}, ${p[1]}`).join('\n');
  }
}

function renderFreeformVisuals() {
  initFreeformPreview();

  while (freeformVertexMarkers.length) {
    const m = freeformVertexMarkers.pop();
    freeformPreviewGroup.remove(m);
    if (m.geometry) m.geometry.dispose();
  }

  if (!freeformRoomDrawMode || freeformPoints.length === 0) {
    if (freeformOutlineLine) freeformOutlineLine.visible = false;
    if (freeformRubberBandLine) freeformRubberBandLine.visible = false;
    if (freeformHoverMarker) freeformHoverMarker.visible = false;
    return;
  }

  const threePts = [];
  freeformPoints.forEach((pt, idx) => {
    const worldX = pt[0];
    const worldZ = toWorldZ(pt[1]);
    threePts.push(new THREE.Vector3(worldX, 0.2, worldZ));

    const isDrag = (idx === freeformDragVertex);
    const isFirst = (idx === 0);
    const radius = isDrag ? 0.85 : (isFirst ? 0.7 : 0.55);
    const color = isDrag ? 0xf472b6 : (isFirst ? 0x10b981 : 0xf59e0b);
    const geom = new THREE.SphereGeometry(radius, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: color });
    const sphere = new THREE.Mesh(geom, mat);
    sphere.position.set(worldX, 0.35, worldZ);
    freeformPreviewGroup.add(sphere);
    freeformVertexMarkers.push(sphere);
  });

  // Closed loop preview when editing / enough points
  if (threePts.length >= 2) {
    const loopPts = freeformEditMode && threePts.length >= 3
      ? [...threePts, threePts[0].clone()]
      : threePts;
    freeformOutlineLine.geometry.dispose();
    freeformOutlineLine.geometry = new THREE.BufferGeometry().setFromPoints(loopPts);
    freeformOutlineLine.visible = true;
  } else {
    freeformOutlineLine.visible = false;
  }

  const counter = document.getElementById('freeform-point-counter');
  const hudCount = document.getElementById('freeform-hud-count');
  const modeLabel = freeformEditMode ? 'edit' : 'draw';
  if (counter) counter.textContent = `${freeformPoints.length} corner${freeformPoints.length === 1 ? '' : 's'} (${modeLabel})`;
  if (hudCount) hudCount.textContent = `${freeformPoints.length} · ${modeLabel}`;
  updateFreeformUIStats();
}

function showFreeformControls(modeTitle, helpText, statusText) {
  const ctrl = document.getElementById('freeform-drawing-controls');
  const hud = document.getElementById('freeform-hud');
  const helpEl = document.getElementById('freeform-mode-help');
  const titleEl = document.getElementById('freeform-mode-title');
  if (ctrl) ctrl.style.display = 'block';
  if (hud) hud.style.display = 'flex';
  if (titleEl) titleEl.textContent = modeTitle;
  if (helpEl) helpEl.textContent = helpText;
  renderer.domElement.style.cursor = 'crosshair';
  renderFreeformVisuals();
  if (statusText) setSaveStatus(statusText);
}

/** Draw a brand-new multipoint custom perimeter from scratch (original multipoint tool). */
function startFreeformDrawNew() {
  freeformRoomDrawMode = true;
  freeformDragVertex = -1;
  freeformEditMode = false;
  freeformPoints = [];
  initFreeformPreview();
  showFreeformControls(
    '✏️ Multipoint Drawing Active',
    'Click floor corners to build a custom perimeter (L-shape, angles, notches). Snap 1 ft (hold Shift for 0.5 ft). Place at least 3 corners, then click the first corner or press Apply. Equipment stays in place.',
    'Multipoint draw mode: click corners on the floor to create a custom room outline.'
  );
}

/** Edit the current outline in place — drag corners / insert on edges. */
function startFreeformEditExisting() {
  freeformRoomDrawMode = true;
  freeformDragVertex = -1;
  freeformEditMode = true;
  freeformPoints = getActiveRoomOutlinePts();
  initFreeformPreview();
  showFreeformControls(
    '✥ Outline Edit Mode Active',
    'Drag any corner to remap a wall section. Click a wall edge to insert a corner. Apply rebuilds walls only — equipment stays. Use “Draw New Custom Outline” if you want a full redraw.',
    'Edit mode: drag corners to remap a section. Equipment is kept.'
  );
}

function startFreeformRoomDrawing() {
  // Back-compat: default to multipoint draw-new (the original create-custom-walls tool)
  startFreeformDrawNew();
}

function stopFreeformRoomDrawing() {
  freeformRoomDrawMode = false;
  freeformDragVertex = -1;
  freeformPoints = [];
  freeformEditMode = true;
  const ctrl = document.getElementById('freeform-drawing-controls');
  const hud = document.getElementById('freeform-hud');
  const toggleBtn = document.getElementById('btn-freeform-draw-toggle');

  if (ctrl) ctrl.style.display = 'none';
  if (hud) hud.style.display = 'none';
  // dual entry buttons remain visible; controls panel hides above

  renderer.domElement.style.cursor = 'default';
  renderFreeformVisuals();
}

function handleFreeformCanvasPointerDown(x, y) {
  const VERTEX_HIT = 1.75;
  let best = -1, bestD = VERTEX_HIT;
  freeformPoints.forEach((p, i) => {
    const d = Math.hypot(x - p[0], y - p[1]);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best >= 0) {
    freeformDragVertex = best;
    renderFreeformVisuals();
    return;
  }

  // Insert a corner on the nearest edge (edit mode, closed outline)
  if (freeformEditMode && freeformPoints.length >= 3) {
    const EDGE_HIT = 1.35;
    let bestEdge = -1, bestEdgeD = EDGE_HIT, bestPt = null;
    for (let i = 0; i < freeformPoints.length; i++) {
      const a = freeformPoints[i];
      const b = freeformPoints[(i + 1) % freeformPoints.length];
      // Skip near endpoints (those are vertex grabs)
      const proj = projectPointToSegment(x, y, a, b);
      if (proj.t > 0.08 && proj.t < 0.92 && proj.dist < bestEdgeD) {
        bestEdgeD = proj.dist;
        bestEdge = i;
        bestPt = [
          Math.round(proj.point[0] * 100) / 100,
          Math.round(proj.point[1] * 100) / 100
        ];
      }
    }
    if (bestEdge >= 0 && bestPt) {
      freeformPoints.splice(bestEdge + 1, 0, bestPt);
      freeformDragVertex = bestEdge + 1;
      renderFreeformVisuals();
      setSaveStatus(`Inserted corner #${freeformDragVertex + 1}. Drag to position, then Apply.`);
      return;
    }
    // In edit mode, ignore empty-space clicks so we never replace the whole layout by accident
    setSaveStatus('Edit mode: drag a corner or click a wall edge to insert. Press Clear only to redraw from scratch.');
    return;
  }

  // Draw-from-scratch mode: append corners; close by clicking first point
  if (freeformPoints.length >= 3) {
    const p0 = freeformPoints[0];
    if (Math.hypot(x - p0[0], y - p0[1]) <= 2.0) {
      applyFreeformRoomOutline(freeformPoints);
      return;
    }
  }
  if (freeformPoints.length > 0) {
    const last = freeformPoints[freeformPoints.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) < 0.25) return;
  }
  freeformPoints.push([x, y]);
  renderFreeformVisuals();
}

function handleFreeformCanvasClick(x, y) {
  // Kept for compatibility — pointerdown path is primary
  handleFreeformCanvasPointerDown(x, y);
}

function handleFreeformCanvasDrag(x, y) {
  if (freeformDragVertex < 0 || freeformDragVertex >= freeformPoints.length) return;
  freeformPoints[freeformDragVertex] = [x, y];
  renderFreeformVisuals();
}

function handleFreeformCanvasHover(x, y) {
  if (!freeformRoomDrawMode) return;
  initFreeformPreview();

  if (freeformDragVertex >= 0) {
    handleFreeformCanvasDrag(x, y);
    return;
  }

  const worldZ = toWorldZ(y);
  freeformHoverMarker.position.set(x, 0.3, worldZ);
  freeformHoverMarker.visible = true;

  // Highlight when near a vertex (drag target)
  let nearVertex = false;
  for (const p of freeformPoints) {
    if (Math.hypot(x - p[0], y - p[1]) <= 1.75) { nearVertex = true; break; }
  }
  if (nearVertex) {
    freeformHoverMarker.material.color.setHex(0xf472b6);
    renderer.domElement.style.cursor = 'move';
  } else if (!freeformEditMode && freeformPoints.length >= 3 && Math.hypot(x - freeformPoints[0][0], y - freeformPoints[0][1]) <= 2.0) {
    freeformHoverMarker.material.color.setHex(0x10b981);
    renderer.domElement.style.cursor = 'pointer';
  } else {
    freeformHoverMarker.material.color.setHex(0x38bdf8);
    renderer.domElement.style.cursor = 'crosshair';
  }

  // Rubber band only in draw-from-scratch mode
  if (!freeformEditMode && freeformPoints.length > 0) {
    const last = freeformPoints[freeformPoints.length - 1];
    const pts = [
      new THREE.Vector3(last[0], 0.2, toWorldZ(last[1])),
      new THREE.Vector3(x, 0.2, worldZ)
    ];
    freeformRubberBandLine.geometry.dispose();
    freeformRubberBandLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    freeformRubberBandLine.visible = true;
  } else if (freeformRubberBandLine) {
    freeformRubberBandLine.visible = false;
  }
}

function handleFreeformCanvasPointerUp() {
  freeformDragVertex = -1;
  renderFreeformVisuals();
}

function applyFreeformRoomOutline(pts) {
  const pointsToApply = pts && pts.length ? pts : freeformPoints;
  if (!pointsToApply || pointsToApply.length < 3) {
    alert('At least 3 corners are required to define a warehouse perimeter.');
    return false;
  }

  const cleaned = pointsToApply.map(p => [
    Math.round(Number(p[0]) * 100) / 100,
    Math.round(Number(p[1]) * 100) / 100
  ]);

  if (cleaned.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    alert('Invalid coordinates found. Please verify numbers.');
    return false;
  }

  const minX = Math.min(...cleaned.map(p => p[0]));
  const maxX = Math.max(...cleaned.map(p => p[0]));
  const minY = Math.min(...cleaned.map(p => p[1]));
  const maxY = Math.max(...cleaned.map(p => p[1]));

  const spanW = maxX - Math.min(0, minX);
  const spanL = maxY - Math.min(0, minY);

  if (spanW < MIN_ROOM_WIDTH_FT || spanL < MIN_ROOM_LENGTH_FT) {
    alert(`Room footprint must span at least ${MIN_ROOM_WIDTH_FT}' × ${MIN_ROOM_LENGTH_FT}'.`);
    return false;
  }

  // Normalize only if outline drifts into negative space — shift contents with it so layout stays aligned
  const shiftX = minX < 0 ? -minX : 0;
  const shiftY = minY < 0 ? -minY : 0;
  const normalized = cleaned.map(p => [
    Math.round((p[0] + shiftX) * 100) / 100,
    Math.round((p[1] + shiftY) * 100) / 100
  ]);

  if (shiftX !== 0 || shiftY !== 0) {
    // Keep equipment locked to the walls when origin is rebased
    if (typeof shiftFacilityContents === 'function') {
      shiftFacilityContents(shiftX, shiftY);
    }
  }

  const finalMaxX = Math.max(...normalized.map(p => p[0]));
  const finalMaxY = Math.max(...normalized.map(p => p[1]));

  // Walls + floor only — never clear bins / equipment
  customRoomOutline = normalized;
  setRoomDimensions(Math.max(MIN_ROOM_WIDTH_FT, Math.ceil(finalMaxX)), Math.max(MIN_ROOM_LENGTH_FT, Math.ceil(finalMaxY)));
  rebuildFloorTilesAndGrid();
  rebuildPerimeterWalls();

  stopFreeformRoomDrawing();
  updateFreeformUIStats();

  const area = calculatePolygonArea(normalized);
  setSaveStatus(`Updated room outline (${normalized.length} corners, ${area.toLocaleString()} sq ft). Equipment layout preserved.`);
  if (typeof recordState === 'function') recordState('Change Room Outline');
  return true;
}


window.addEventListener('pointerup', () => {
  if (typeof freeformDragVertex !== 'undefined' && freeformDragVertex >= 0 && typeof handleFreeformCanvasPointerUp === 'function') {
    handleFreeformCanvasPointerUp();
  }
}, true);
window.addEventListener('pointercancel', () => {
  if (typeof freeformDragVertex !== 'undefined' && freeformDragVertex >= 0 && typeof handleFreeformCanvasPointerUp === 'function') {
    handleFreeformCanvasPointerUp();
  }
}, true);

// UI Event Handlers
document.getElementById('btn-freeform-draw-new')?.addEventListener('click', () => {
  if (freeformRoomDrawMode && !freeformEditMode) stopFreeformRoomDrawing();
  else startFreeformDrawNew();
});
document.getElementById('btn-freeform-edit-existing')?.addEventListener('click', () => {
  if (freeformRoomDrawMode && freeformEditMode) stopFreeformRoomDrawing();
  else startFreeformEditExisting();
});
document.getElementById('btn-freeform-draw-toggle')?.addEventListener('click', () => {
  if (freeformRoomDrawMode) stopFreeformRoomDrawing();
  else startFreeformDrawNew();
});

document.getElementById('btn-freeform-apply')?.addEventListener('click', () => applyFreeformRoomOutline());
document.getElementById('btn-hud-apply')?.addEventListener('click', () => applyFreeformRoomOutline());

document.getElementById('btn-freeform-undo')?.addEventListener('click', () => {
  if (freeformPoints.length > 0) {
    freeformPoints.pop();
    renderFreeformVisuals();
  }
});
document.getElementById('btn-hud-undo')?.addEventListener('click', () => {
  if (freeformPoints.length > 0) {
    freeformPoints.pop();
    renderFreeformVisuals();
  }
});

document.getElementById('btn-freeform-clear')?.addEventListener('click', () => {
  freeformPoints = [];
  freeformEditMode = false;
  freeformDragVertex = -1;
  renderFreeformVisuals();
  setSaveStatus('Cleared — now drawing a brand-new outline from scratch. Place 3+ corners, then Apply. Equipment will still be kept.');
});
document.getElementById('btn-hud-clear')?.addEventListener('click', () => {
  freeformPoints = [];
  freeformEditMode = false;
  freeformDragVertex = -1;
  renderFreeformVisuals();
  setSaveStatus('Cleared — draw a new outline from scratch, then Apply.');
});

document.getElementById('btn-freeform-cancel')?.addEventListener('click', stopFreeformRoomDrawing);
document.getElementById('btn-hud-cancel')?.addEventListener('click', stopFreeformRoomDrawing);

// Architectural Presets
document.getElementById('btn-preset-rect')?.addEventListener('click', () => {
  applyFreeformRoomOutline([[0,0], [74,0], [74,78], [0,78]]);
});

document.getElementById('btn-preset-lshape')?.addEventListener('click', () => {
  applyFreeformRoomOutline([[0,0], [74,0], [74,42], [42,42], [42,78], [0,78]]);
});

document.getElementById('btn-preset-cutcorner')?.addEventListener('click', () => {
  applyFreeformRoomOutline([[0,0], [54,0], [74,20], [74,78], [0,78]]);
});

document.getElementById('btn-preset-tshape')?.addEventListener('click', () => {
  applyFreeformRoomOutline([[18,0], [56,0], [56,28], [74,28], [74,78], [0,78], [0,28], [18,28]]);
});

// Manual Coordinates Textarea
document.getElementById('btn-freeform-apply-text')?.addEventListener('click', () => {
  const text = document.getElementById('freeform-points-textarea')?.value || '';
  const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = [];
  for (const line of lines) {
    const parts = line.split(/[\s,]+/).map(Number);
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      parsed.push([parts[0], parts[1]]);
    }
  }
  if (parsed.length >= 3) {
    applyFreeformRoomOutline(parsed);
  } else {
    alert('Please provide at least 3 valid X, Y coordinate pairs (one per line).');
  }
});

document.getElementById('btn-freeform-reset-text')?.addEventListener('click', () => {
  applyFreeformRoomOutline([[0,0], [74,0], [74,78], [0,78]]);
});

// Sync UI stats on startup
setTimeout(updateFreeformUIStats, 500);

// UNIVERSAL DOWNLOAD & EXPORT SYSTEM (Works reliably in desktop, mobile, & iframes)
// ============================================================================

// ============================================================================
// PROJECT FOLDER EXPORT (real directory via File System Access API when available)
// ============================================================================
function crc32Table() {
  if (crc32Table._t) return crc32Table._t;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  crc32Table._t = table;
  return table;
}
function crc32Bytes(bytes) {
  const table = crc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function utf8Encode(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(str));
  const s = unescape(encodeURIComponent(String(str)));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function u16(n) { const b = new Uint8Array(2); b[0] = n & 255; b[1] = (n >>> 8) & 255; return b; }
function u32(n) {
  const b = new Uint8Array(4);
  b[0] = n & 255; b[1] = (n >>> 8) & 255; b[2] = (n >>> 16) & 255; b[3] = (n >>> 24) & 255;
  return b;
}
function concatBytes(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** Build an uncompressed (STORE) ZIP from { path: string|Uint8Array|Blob-like text } entries. */
function buildZipArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  // DOS time/date
  const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((Math.floor(now.getSeconds() / 2)) & 31);
  const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

  for (const [rawPath, content] of entries) {
    const name = String(rawPath).replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBytes = utf8Encode(name);
    let data;
    if (content instanceof Uint8Array) data = content;
    else if (typeof content === 'string') data = utf8Encode(content);
    else data = utf8Encode(String(content ?? ''));
    const crc = crc32Bytes(data);
    const size = data.length;

    const localHeader = concatBytes([
      u32(0x04034b50), // local file header signature
      u16(20),         // version needed
      u16(0x0800),     // general purpose bit flag (UTF-8)
      u16(0),          // compression method STORE
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),          // extra length
      nameBytes,
      data
    ]);
    localParts.push(localHeader);

    const central = concatBytes([
      u32(0x02014b50), // central directory header
      u16(20),         // version made by
      u16(20),         // version needed
      u16(0x0800),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0), // extra
      u16(0), // comment
      u16(0), // disk start
      u16(0), // internal attr
      u32(0), // external attr
      u32(offset),
      nameBytes
    ]);
    centralParts.push(central);
    offset += localHeader.length;
  }

  const centralDir = concatBytes(centralParts);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0), u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0)
  ]);
  return concatBytes([...localParts, centralDir, end]);
}

function projectFolderSlug(name, version) {
  const n = (typeof slugifyProjectName === 'function' ? slugifyProjectName(name) : String(name || 'project').replace(/\s+/g, '_')) || 'project';
  const v = (typeof slugifyProjectName === 'function' ? slugifyProjectName(version) : String(version || '1').replace(/\s+/g, '_')) || '1';
  return `${n}_v${v}`;
}

function makeProjectReadme({ projectName, projectVersion, primaryFile, kind, extraLines = [] }) {
  const lines = [
    `${projectName || 'Warehouse Project'} (v${projectVersion || '1.0'})`,
    '='.repeat(48),
    '',
    'This folder was created by Layout Design Studio.',
    'Open the primary project file from this folder.',
    'Keep README and the project file together if you move the folder.',
    '',
    `Primary file: ${primaryFile}`,
    `Type: ${kind}`,
    '',
    'How to use:',
    kind.includes('HTML')
      ? '  • Double-click the .html file (or Open with Chrome/Edge/Firefox) to run the offline studio.'
      : '  • In Layout Design Studio use Project → Open Project and select the .json file.',
    '  • Keep files together if you move the folder.',
    '',
    `Exported: ${new Date().toISOString()}`,
    ...extraLines.map(String),
    ''
  ];
  return lines.join('\n');
}

function supportsDirectoryFolderExport() {
  return typeof window.showDirectoryPicker === 'function';
}

async function writeTextToDirectoryHandle(dirHandle, fileName, content) {
  const handle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  if (content instanceof Uint8Array) {
    await writable.write(content);
  } else {
    await writable.write(String(content ?? ''));
  }
  await writable.close();
}

/**
 * Write a real project folder on disk (Chrome / Edge File System Access API).
 * User picks a parent directory; we create folderName/ with the project files inside.
 * Falls back to a single binary-safe file download when the folder API is unavailable.
 */
async function saveAsProjectFolder({ folderName, innerFilename, content, readme, description = '', extraFiles = [], statusSetter = null }) {
  const folder = String(folderName || 'project').replace(/[\\/:*?"<>|]+/g, '_').replace(/\.+$/, '') || 'project';
  const inner = String(innerFilename || 'project.bin').replace(/^.*[\\/]/, '');
  const setStatus = (msg, isErr) => {
    if (typeof statusSetter === 'function') statusSetter(msg, isErr);
    else if (typeof setSaveStatus === 'function') setSaveStatus(msg, isErr);
  };

  // Preferred path: native folder on disk
  if (supportsDirectoryFolderExport()) {
    try {
      const parent = await window.showDirectoryPicker({
        id: 'layout-design-studio-exports',
        mode: 'readwrite',
        startIn: 'documents'
      });
      let target = parent;
      try {
        target = await parent.getDirectoryHandle(folder, { create: true });
      } catch (err) {
        // If create under selected dir fails, write into the selected directory itself
        console.warn('Could not create subfolder, writing into selected directory:', err);
        target = parent;
      }
      await writeTextToDirectoryHandle(target, inner, content);
      if (readme) await writeTextToDirectoryHandle(target, 'README.txt', readme);
      for (const [rel, data] of (extraFiles || [])) {
        const safe = String(rel).replace(/\\/g, '/').replace(/^\/+/, '').split('/').pop();
        if (safe) await writeTextToDirectoryHandle(target, safe, data);
      }
      const where = target.name === folder ? folder : `${parent.name}/${folder}`;
      setStatus(`Saved project folder “${where}” with ${inner}${readme ? ' + README.txt' : ''}.`);
      // Lightweight success dialog (no zip / no raw blob tab)
      const backdrop = document.getElementById('export-dialog-backdrop');
      if (backdrop) {
        const headingEl = document.getElementById('export-dialog-heading');
        const msgEl = document.getElementById('export-dialog-msg');
        const fileEl = document.getElementById('export-dialog-filename');
        const statsEl = document.getElementById('export-dialog-stats');
        const linkEl = document.getElementById('export-dialog-download-link');
        const copyBtn = document.getElementById('export-dialog-copy-btn');
        const newTabBtn = document.getElementById('export-dialog-newtab-btn');
        const previewContainer = document.getElementById('export-dialog-preview');
        if (headingEl) headingEl.textContent = 'Project Folder Saved';
        if (fileEl) fileEl.textContent = `${folder}/${inner}`;
        if (statsEl) statsEl.textContent = description || 'Written as a real folder on your computer';
        if (msgEl) msgEl.textContent = `Files were written to a folder on disk (not a ZIP and not a raw browser tab). Location: ${folder}/ — open ${inner} from that folder when you need it.`;
        if (previewContainer) previewContainer.style.display = 'none';
        if (linkEl) { linkEl.removeAttribute('href'); linkEl.style.display = 'none'; }
        if (copyBtn) copyBtn.style.display = 'none';
        if (newTabBtn) newTabBtn.style.display = 'none';
        const doneBtn = document.getElementById('export-dialog-done-btn');
        const closeBtn = document.getElementById('export-dialog-close-btn');
        const close = () => {
          backdrop.style.display = 'none';
          if (linkEl) linkEl.style.display = '';
          if (copyBtn) copyBtn.style.display = '';
          if (newTabBtn) newTabBtn.style.display = '';
        };
        if (doneBtn) doneBtn.onclick = close;
        if (closeBtn) closeBtn.onclick = close;
        backdrop.style.display = 'flex';
      }
      return { mode: 'folder', folder, inner };
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
        setStatus('Folder save cancelled.', true);
        return { mode: 'cancelled' };
      }
      console.warn('Directory folder export failed, falling back to file download:', err);
    }
  }

  // Fallback: single file download with binary-safe MIME so the browser does not open raw text
  const lower = inner.toLowerCase();
  let mime = 'application/octet-stream';
  if (lower.endsWith('.json')) mime = 'application/octet-stream';
  else if (lower.endsWith('.html') || lower.endsWith('.htm')) mime = 'application/octet-stream';
  const blob = new Blob([typeof content === 'string' ? content : content], { type: mime });
  downloadOrExportFile(
    inner,
    blob,
    mime,
    (description || `Project file ${inner}`) + ' · Tip: use Chrome/Edge for “Save as folder” (File System Access API)'
  );
  setStatus(
    supportsDirectoryFolderExport()
      ? `Saved ${inner} as a file download (folder write unavailable this time).`
      : `Saved ${inner} as a single file. For a real folder on disk, use Chrome or Edge (folder picker).`,
    false
  );
  return { mode: 'file', inner };
}

function downloadOrExportFile(filename, contentTextOrBlob, mimeType, description = '') {

  // DESKTOP: route every export through the native Save dialog instead of a browser download.
  if (window.desktop && window.desktop.saveFile) {
    window.desktopSaveFromApp(filename, contentTextOrBlob, mimeType);
    return;
  }
  let blob = null;
  let url = null;
  const isBlob = (contentTextOrBlob instanceof Blob);
  const isDataUrl = (typeof contentTextOrBlob === 'string' && contentTextOrBlob.startsWith('data:'));

  if (isBlob) {
    blob = contentTextOrBlob;
    url = URL.createObjectURL(blob);
  } else if (isDataUrl) {
    url = contentTextOrBlob;
  } else {
    try {
      blob = new Blob([contentTextOrBlob], { type: mimeType });
      url = URL.createObjectURL(blob);
    } catch (e) {
      url = 'data:' + (mimeType || 'text/plain') + ';charset=utf-8,' + encodeURIComponent(contentTextOrBlob);
    }
  }

  // 1. Trigger automated browser file download
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); }, 600);
  } catch (err) {
    console.warn('Direct automated download blocked by browser/sandbox:', err);
  }

  // 2. Display the Interactive Export Dialog Modal so the user can verify,
  // click a direct download link, preview image, or copy to clipboard if in an iframe.
  const backdrop = document.getElementById('export-dialog-backdrop');
  if (backdrop) {
    const headingEl = document.getElementById('export-dialog-heading');
    const msgEl = document.getElementById('export-dialog-msg');
    const fileEl = document.getElementById('export-dialog-filename');
    const statsEl = document.getElementById('export-dialog-stats');
    const linkEl = document.getElementById('export-dialog-download-link');
    const copyBtn = document.getElementById('export-dialog-copy-btn');
    const newTabBtn = document.getElementById('export-dialog-newtab-btn');
    const closeBtn = document.getElementById('export-dialog-close-btn');
    const doneBtn = document.getElementById('export-dialog-done-btn');
    const imgPreviewEl = document.getElementById('export-dialog-img-preview');
    const previewContainer = document.getElementById('export-dialog-preview');

    if (headingEl) headingEl.textContent = `File Ready: ${filename}`;
    if (fileEl) fileEl.textContent = filename;

    let sizeBytes = 0;
    if (blob) sizeBytes = blob.size;
    else if (typeof contentTextOrBlob === 'string') sizeBytes = contentTextOrBlob.length;
    const sizeKb = (sizeBytes / 1024).toFixed(1);
    if (statsEl) statsEl.textContent = `Size: ${sizeKb} KB • ${description || 'Warehouse Layout Deliverable'}`;
    if (msgEl) {
      const isZip = /\.zip$/i.test(filename) || (mimeType && mimeType.includes('zip'));
      msgEl.textContent = isZip
        ? 'Your project folder ZIP is ready. Download the .zip, extract the folder on your computer, then open the .json or .html inside — this avoids the browser showing raw file text.'
        : 'Your file has been generated. If your browser did not prompt for download automatically (or if you are inside an embedded viewer), click the download button below or copy the content.';
    }

    // Image preview in modal
    const isImage = (mimeType && mimeType.startsWith('image/')) || filename.match(/\.(png|jpe?g|webp)$/i);
    if (previewContainer && imgPreviewEl) {
      if (isImage) {
        imgPreviewEl.src = url;
        previewContainer.style.display = 'block';
      } else {
        previewContainer.style.display = 'none';
      }
    }

    if (linkEl) {
      linkEl.href = url;
      linkEl.download = filename;
    }

    if (copyBtn) {
      if (isImage) {
        copyBtn.textContent = '📋 Copy Image to Clipboard';
        copyBtn.onclick = async () => {
          try {
            if (blob && navigator.clipboard && window.ClipboardItem) {
              await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
              copyBtn.textContent = '✓ Copied Image to Clipboard!';
            } else {
              copyBtn.textContent = '✓ Image ready for download';
            }
          } catch(e) {
            console.warn('Clipboard image write failed:', e);
            copyBtn.textContent = 'Use Download Button Below';
          }
          setTimeout(() => { copyBtn.textContent = '📋 Copy Image to Clipboard'; }, 3000);
        };
      } else {
        copyBtn.textContent = '📋 Copy Content to Clipboard';
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(contentTextOrBlob);
            copyBtn.textContent = '✓ Copied to Clipboard!';
          } catch (err) {
            const ta = document.createElement('textarea');
            ta.value = contentTextOrBlob;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            copyBtn.textContent = '✓ Copied to Clipboard!';
          }
          setTimeout(() => { copyBtn.textContent = '📋 Copy Content to Clipboard'; }, 2500);
        };
      }
    }

    if (newTabBtn) {
      newTabBtn.onclick = () => {
        const tab = window.open();
        if (tab) {
          if (mimeType && mimeType.includes('html')) {
            tab.document.write(contentTextOrBlob);
            tab.document.close();
          } else {
            tab.location.href = url;
          }
        }
      };
    }

    function closeExportDialog() {
      backdrop.style.display = 'none';
      if (url && url.startsWith('blob:')) {
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch(e){} }, 10000);
      }
    }
    if (closeBtn) closeBtn.onclick = closeExportDialog;
    if (doneBtn) doneBtn.onclick = closeExportDialog;

    backdrop.style.display = 'flex';
  }
}

function slugifyProjectName(value) {
  return String(value || 'warehouse_project').trim().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'warehouse_project';
}

document.getElementById('btn-bump-version').addEventListener('click', () => {
  const input = document.getElementById('project-version');
  const value = (input.value || '1.0').trim();
  const match = value.match(/^(.*?)(\d+)$/);
  input.value = match ? `${match[1]}${Number(match[2]) + 1}` : `${value}.1`;
  syncProjectMeta(getProjectName(), input.value);
  setSaveStatus(`Project version set to ${getProjectVersion()}. Save or export to create this version.`);
});
document.getElementById('project-name').addEventListener('change', () => syncProjectMeta(getProjectName(), getProjectVersion()));
document.getElementById('project-version').addEventListener('change', () => syncProjectMeta(getProjectName(), getProjectVersion()));

document.getElementById('btn-new-project').addEventListener('click', async () => {
  if (!(await appConfirm('Start a new project? This clears the current layout, overhead drops, and custom asset library in this session. Export or save your current project first if you need to keep it.', 'Start New Project'))) return;
  const keepMode = getProjectMode();
  const defName = PROJECT_MODES[keepMode].defaultName;
  const name = await appPrompt('Name for the new project:', defName, 'Project Name');
  if (name === null) return;
  resetToFreshProject(name.trim() || defName, true, BASE_ROOM_WIDTH_FT, BASE_ROOM_LENGTH_FT, keepMode);
  setCustomAssetStatus('Fresh blank 20 ft × 20 ft project created. Add assets as needed, then save or export your project.');
  setSaveStatus(`New blank project “${getProjectName()}” v${getProjectVersion()} (20 ft × 20 ft) is ready.`);
});

document.getElementById('btn-load-layout').addEventListener('click', () => {
  document.getElementById('input-load-layout').click();
});

// ============================================================================
// CENTRAL PROJECT LOADER ENGINE
// ============================================================================
function loadProjectData(project, sourceLabel = 'Project') {
  if (!project || !Array.isArray(project.bins) || !project.settings) {
    throw new Error('This does not look like a saved Warehouse Crane Viewer project.');
  }

  syncProjectMeta(project.projectName || sourceLabel.replace(/\.(json|html?)$/i,''), project.projectVersion || '1.0');
  setProjectMode(project.projectMode);

  if (Array.isArray(project.customAssetLibrary)) {
    customAssetLibrary = project.customAssetLibrary;
    customAssetCache.clear();
    renderCustomAssetLibrary();
  }

  const allowedTypes = new Set(['large', 'small', 'table', 'shelf', 'crane', 'conveyor', 'uline_rolling_conveyor', 'fixture', 'custom', 'pallet', 'palletpal', 'ibeam', 'guardrail', 'oildrum', 'spotwelder', 'weldcurtain', 'downdrafttable', 'forklift', 'fusebox', 'paintbooth', 'brakepress', 'gantrycrane']);
  if (project.bins.some(b => !(allowedTypes.has(b.type) || (typeof NewAssets !== 'undefined' && NewAssets.has(b.type))) || ![b.x,b.y,b.w,b.l].every(Number.isFinite))) {
    throw new Error('The project file contains an invalid object.');
  }

  // 1. SET ROOM DIMENSIONS FIRST so bin positions are NEVER clamped/squashed to old room bounds!
  const settings = project.settings || {};
  const loadedW = Number.isFinite(Number(settings.roomWidthFt)) ? Number(settings.roomWidthFt) : BASE_ROOM_WIDTH_FT;
  const loadedL = Number.isFinite(Number(settings.roomLengthFt)) ? Number(settings.roomLengthFt) : BASE_ROOM_LENGTH_FT;
  customRoomOutline = Array.isArray(settings.customRoomOutline) && settings.customRoomOutline.length >= 3
    ? settings.customRoomOutline.map(p => [Number(p[0]), Number(p[1])]).filter(p => p.every(Number.isFinite)) : null;

  setRoomDimensions(loadedW, loadedL);

  // 2. Clear existing placed objects
  bins.forEach(b => { if (b.mesh) scene.remove(b.mesh); });
  bins.length = 0;
  selectedBin = null;
  binIdCounter = 1;

  // 3. Restore bins with ALL properties including label, now safe against 74x78 boundaries
  project.bins.forEach(saved => {
    if (saved.type === 'shelf' && Math.abs(saved.x - 34) < 0.1 && Math.abs(saved.y - 17) < 0.1 && Math.abs(saved.w - 2) < 0.1 && Math.abs(saved.l - 2) < 0.1) {
      return; // Skip legacy shelf replaced by I-beam
    }
    const obj = spawnBin(saved.type, saved.x, saved.y, saved.w, saved.l, saved.tiers, saved.customAssetId || null, saved.label || '');
    obj.id = Number.isInteger(saved.id) && saved.id > 0 ? saved.id : obj.id;
    obj.w = Math.max(0.2, Math.min(MAX_ROOM_WIDTH_FT, Number(saved.w)));
    obj.l = Math.max(0.2, Math.min(MAX_ROOM_LENGTH_FT, Number(saved.l)));
    obj.rotated = !!saved.rotated;
    obj.facing = Number.isInteger(saved.facing) ? ((saved.facing % 4) + 4) % 4 : ((saved.type === 'large' && saved.x <= 8) ? 1 : (saved.rotated ? 1 : 0));
    obj.label = saved.label || '';
    obj.assetHeight = saved.type === 'crane' ? Math.max(4,Math.min(CRANE_MAST_MAX,Number(saved.assetHeight)||8)) : (saved.type === 'uline_rolling_conveyor' ? Math.max(1.5,Math.min(4.2,Number(saved.assetHeight)||2.8)) : (saved.type === 'conveyor' ? Math.max(1,Math.min(4.2,Number(saved.assetHeight)||3)) : undefined));
    obj.heightFt = ['crane','conveyor','uline_rolling_conveyor'].includes(saved.type) ? undefined : Math.max(0.2, Math.min(25, Number(saved.heightFt) || getDefaultAssetHeightFt(obj)));
    obj.functionAngle = Math.max(0,Math.min(140,Number(saved.functionAngle)||0));
    obj.boomLengthFt = saved.type === 'crane' ? Math.max(CRANE_BOOM_MIN, Math.min(CRANE_BOOM_MAX, Number(saved.boomLengthFt) || Math.round(Math.min(obj.w, obj.l) * 0.82 * 10) / 10)) : undefined;
    obj.conveyorRunning = saved.conveyorRunning !== false;
    const maxTiers = saved.type === 'shelf' ? 6 : (saved.type === 'pallet' ? PALLET_STACK_MAX : 3);
    obj.tiers = Math.max(1, Math.min(maxTiers, Math.round(Number(saved.tiers) || (saved.type === 'shelf' ? 4 : 1))));
    if (typeof saved.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(saved.color)) obj.color = saved.color;
    obj.tableTopColor = saved.type === 'table' && typeof saved.tableTopColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(saved.tableTopColor) ? saved.tableTopColor : '#f1ebdd';
    obj.tableOverheadOption = saved.type === 'table' && saved.tableOverheadOption === true;
    obj.tableVariant = saved.type === 'table' ? (saved.tableVariant === 'monitor' ? 'monitor' : 'packing') : undefined;
    obj.gantryPoints = saved.type === 'gantrycrane' ? (saved.gantryPoints === 2 ? 2 : 4) : undefined;
    rebuildBinVisual(obj);
  });

  suppressDefaultShelvesOnLoad = project.settings.preserveEmptyLayout === true;
  if (!project.bins.some(b => b.type === 'shelf') && !suppressDefaultShelvesOnLoad && !project.bins.length) {
    spawnDefaultBlueShelves();
  }

  binIdCounter = Math.max(1, ...bins.map(b => b.id + 1));
  updateCountsUI();
  selectBin(null);

  // 4. Fixed equipment visibility
  if (settings.gorbelCraneVisible === false) scene.remove(gorbelCrane);
  else if (gorbelCrane.parent !== scene) scene.add(gorbelCrane);

  if (settings.fixedConveyorsVisible === false) {
    conveyors.forEach(c => scene.remove(c.group));
    if (fixedSteelIBeamColumn) scene.remove(fixedSteelIBeamColumn);
    if (fixedAdjacentFixtureBox) scene.remove(fixedAdjacentFixtureBox);
  } else {
    conveyors.forEach(c => { if (c.group.parent !== scene) scene.add(c.group); });
    if (fixedSteelIBeamColumn && fixedSteelIBeamColumn.parent !== scene) scene.add(fixedSteelIBeamColumn);
    if (fixedAdjacentFixtureBox && fixedAdjacentFixtureBox.parent !== scene) scene.add(fixedAdjacentFixtureBox);
  }

  setCraneSwingAngle(settings.craneAngle ?? 0);
  gorbelCrane.position.x = Number.isFinite(Number(settings.gorbelCraneOffsetX)) ? Number(settings.gorbelCraneOffsetX) : 0;
  gorbelCrane.position.z = Number.isFinite(Number(settings.gorbelCraneOffsetZ)) ? Number(settings.gorbelCraneOffsetZ) : 0;

  if (Array.isArray(settings.conveyorPositions)) {
    conveyors.forEach((c, idx) => {
      const pos = settings.conveyorPositions[idx];
      if (!pos) return;
      const maxX = Math.max(0, roomWidthFt - c.w);
      const maxY = Math.max(0, roomLengthFt - c.l);
      c.xFt = Math.max(0, Math.min(maxX, Number.isFinite(Number(pos.xFt)) ? Number(pos.xFt) : 14));
      c.yStartFt = Math.max(0, Math.min(maxY, Number.isFinite(Number(pos.yStartFt)) ? Number(pos.yStartFt) : [9,17,25][idx]));
      c.yStart = c.yStartFt;
      c.group.position.set(c.xFt + c.w / 2, 0, toWorldZ(c.yStartFt + c.l / 2));
    });
  }

  if (Array.isArray(settings.conveyorHeights) && settings.conveyorHeights.length > 0) {
    conveyors.forEach((_, idx) => {
      const rawH = settings.conveyorHeights[idx] ?? settings.liftHeight ?? 3.0;
      updateSingleConveyorHeight(idx, Math.max(1, Math.min(4.2, Number(rawH) || 3.0)));
    });
  }

  setSnap([0.1, 0.5, 1].includes(Number(settings.snapIncrement)) ? Number(settings.snapIncrement) : 0.5);

  // 5. Restore roof utilities
  for (const k of ['electrical', 'gas', 'air']) {
    customRoofDrops[k] = [];
    customRoofRoutes[k] = [];
  }

  if (project.customRoofDrops && typeof project.customRoofDrops === 'object') {
    for (const k of ['electrical', 'gas', 'air']) {
      if (Array.isArray(project.customRoofDrops[k])) {
        customRoofDrops[k] = project.customRoofDrops[k].map(d => ({
          id: d.id || ('drop-' + Math.random().toString(36).slice(2, 7)),
          name: d.name || (k + ' drop'),
          x: Number(d.x) || 0,
          y: Number(d.y) || 0,
          tier: Number(d.tier) || 1,
          size: Number(d.size) || 0.1
        }));
      }
    }
  } else if (project.roofUtilities && typeof project.roofUtilities === 'object') {
    if (Array.isArray(project.roofUtilities.electricalDrops)) {
      customRoofDrops.electrical = project.roofUtilities.electricalDrops.map(d => ({
        id: d.id, name: d.name, x: Number(d.x), y: Number(d.y), tier: Number(d.tier) || 1, size: Number(d.size) || 0.1
      }));
    }
    if (Array.isArray(project.roofUtilities.airDrops)) {
      customRoofDrops.air = project.roofUtilities.airDrops.map(d => ({
        id: d.id, name: d.name, x: Number(d.x), y: Number(d.y), tier: Number(d.tier) || 1, size: Number(d.size) || 0.1
      }));
    }
    if (Array.isArray(project.roofUtilities.gasDrops)) {
      customRoofDrops.gas = project.roofUtilities.gasDrops.map(d => ({
        id: d.id, name: d.name, x: Number(d.x), y: Number(d.y), tier: Number(d.tier) || 1, size: Number(d.size) || 0.1
      }));
    }
  }

  if (project.customRoofRoutes && typeof project.customRoofRoutes === 'object') {
    for (const k of ['electrical', 'gas', 'air']) {
      if (Array.isArray(project.customRoofRoutes[k])) {
        customRoofRoutes[k] = project.customRoofRoutes[k];
      }
    }
  } else if (project.roofUtilities && project.roofUtilities.routes && typeof project.roofUtilities.routes === 'object') {
    for (const k of ['electrical', 'gas', 'air']) {
      if (Array.isArray(project.roofUtilities.routes[k])) {
        customRoofRoutes[k] = project.roofUtilities.routes[k];
      }
    }
  }

  renderAllCustomRoofRoutes();
  refreshRoofDropAssetSelect();

  rebuildFloorTilesAndGrid();
  rebuildPerimeterWalls();
  wallsGroup.visible = settings.wallsVisible !== false;
  wallHandlesGroup.visible = wallsGroup.visible;
  setCameraView(settings.cameraView === 'iso' ? 'iso' : 'top');
  setSaveStatus('Opened “' + getProjectName() + '” v' + getProjectVersion() + ' (' + bins.length + ' objects, ' + (customRoofDrops.electrical.length + customRoofDrops.air.length + customRoofDrops.gas.length) + ' roof drops).');
  return true;
}

document.getElementById('input-load-layout').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const fileText = await file.text();
    let project;
    if (/\.(html?)$/i.test(file.name) || /<html[\s>]/i.test(fileText.slice(0, 1000))) {
      const match = fileText.match(/<script id="embedded-project-json" type="application\/json">([\s\S]*?)<\/script>/i);
      if (!match) throw new Error('This HTML file does not contain an embedded project.');
      project = JSON.parse(match[1]);
      const assetMatch = fileText.match(/<script id="embedded-asset-library" type="application\/json">([\s\S]*?)<\/script>/i);
      if (assetMatch && !Array.isArray(project.customAssetLibrary)) project.customAssetLibrary = JSON.parse(assetMatch[1]);
    } else {
      project = JSON.parse(fileText);
    }
    loadProjectData(project, file.name);
  } catch (err) {
    console.error(err);
    setSaveStatus(`Could not load layout: ${err.message || 'invalid project file'}`, true);
  } finally {
    event.target.value = '';
  }
});

// Direct project loader for auto-saved sessions and launcher snapshots
function loadProjectObjectIntoStudio(projObj, sourceLabel = 'Saved Session') {
  try {
    return loadProjectData(projObj, sourceLabel);
  } catch (e) {
    console.error('Failed to load project object:', e);
    return false;
  }
}

function resetToFreshProject(projectName = 'New Warehouse Project', emptyFloor = true, widthFt = BASE_ROOM_WIDTH_FT, lengthFt = BASE_ROOM_LENGTH_FT, modeKey = 'warehouse') {
  setProjectMode(modeKey);
  // 1. Clear all placed bins & equipment
  bins.forEach(b => { if (b.mesh) scene.remove(b.mesh); });
  bins.length = 0;
  selectedBin = null;
  binIdCounter = 1;
  isDraggingBin = false;
  isDraggingGorbelCrane = false;
  isDraggingFixedConveyor = false;
  activeFixedConveyor = null;
  suppressDefaultShelvesOnLoad = emptyFloor;

  // 2. Clear fixed equipment when starting empty
  if (emptyFloor) {
    scene.remove(gorbelCrane);
    conveyors.forEach(c => scene.remove(c.group));
    if (fixedSteelIBeamColumn) scene.remove(fixedSteelIBeamColumn);
    if (fixedAdjacentFixtureBox) scene.remove(fixedAdjacentFixtureBox);
  } else {
    if (gorbelCrane.parent !== scene) scene.add(gorbelCrane);
    conveyors.forEach(c => { if (c.group.parent !== scene) scene.add(c.group); });
    if (fixedSteelIBeamColumn && fixedSteelIBeamColumn.parent !== scene) scene.add(fixedSteelIBeamColumn);
    if (fixedAdjacentFixtureBox && fixedAdjacentFixtureBox.parent !== scene) scene.add(fixedAdjacentFixtureBox);
  }

  // 3. Thoroughly purge all overhead roof utilities (drops, routes, hover helpers)
  for (const key of ['electrical', 'gas', 'air']) {
    customRoofDrops[key] = [];
    customRoofRoutes[key] = [];
    if (customRoofDropGroups[key]) {
      while (customRoofDropGroups[key].children.length) {
        const obj = customRoofDropGroups[key].children.pop();
        customRoofDropGroups[key].remove(obj);
        obj.traverse?.(part => {
          if (part.geometry) part.geometry.dispose();
          if (part.material && part.material.dispose) part.material.dispose();
        });
      }
    }
    clearCustomRoofMeshes(key);
  }
  roofRouteCurrentPoints = [];
  roofRouteDrawing = false;
  roofRoutePointerDown = false;
  roofDropPlacementMode = false;
  roofDropAssetPlacementType = null;
  if (roofDropHoverBox) roofDropHoverBox.visible = false;
  renderAllCustomRoofRoutes();
  refreshRoofDropAssetSelect();
  updateRoofRouteStatus('No route drawing in progress.');

  // 4. Reset custom room outline (freeform multipoint editor state)
  customRoomOutline = null;
  if (typeof stopFreeformRoomDrawing === 'function') stopFreeformRoomDrawing();
  if (typeof updateFreeformUIStats === 'function') updateFreeformUIStats();

  // 5. Reset custom asset library
  customAssetLibrary = [];
  customAssetCache.clear();
  selectedCustomAssetId = null;
  renderCustomAssetLibrary();

  // 6. Set clean warehouse dimensions (defaulting to standard 20 ft × 20 ft)
  const targetW = Number.isFinite(widthFt) ? widthFt : BASE_ROOM_WIDTH_FT;
  const targetL = Number.isFinite(lengthFt) ? lengthFt : BASE_ROOM_LENGTH_FT;
  setRoomDimensions(targetW, targetL);
  wallNotchRemoved = true;
  rebuildFloorTilesAndGrid();
  rebuildPerimeterWalls();
  wallsGroup.visible = true;
  wallHandlesGroup.visible = true;

  const outlineTextarea = document.getElementById('custom-room-outline');
  if (outlineTextarea) {
    outlineTextarea.value = `0,0\n${roomWidthFt},0\n${roomWidthFt},${roomLengthFt}\n0,${roomLengthFt}`;
  }

  // 7. Reset crane & conveyors to factory defaults
  setCraneSwingAngle(0);
  if (gorbelCrane) {
    gorbelCrane.position.x = 0;
    gorbelCrane.position.z = 0;
  }
  conveyors.forEach((c, idx) => {
    c.xFt = 14;
    c.yStartFt = [9, 17, 25][idx];
    c.yStart = c.yStartFt;
    c.group.position.set(c.xFt + c.w / 2, 0, toWorldZ(c.yStartFt + c.l / 2));
    updateSingleConveyorHeight(idx, 3.0);
  });
  const craneSlider = document.getElementById('crane-angle-slider');
  if (craneSlider) craneSlider.value = '0';
  const craneVal = document.getElementById('crane-angle-val');
  if (craneVal) craneVal.textContent = '0°';

  // 8. Reset scene cameras, UI controls, and status
  setSnap(0.5);
  setCameraView('iso');
  if (!emptyFloor) {
    spawnDefaultBlueShelves();
  }
  updateCountsUI();
  selectBin(null);
  updateSelectedUI();
  controls.enabled = true;
  renderer.domElement.style.cursor = 'default';
  const importInput = document.getElementById('input-import-asset');
  if (importInput) importInput.value = '';
  document.getElementById('coord-readout').textContent = `X: 0 ft, Y: 0 ft · ${roomWidthFt} ft × ${roomLengthFt} ft fresh blank layout`;
  syncProjectMeta(projectName.trim() || 'New Warehouse Project', '1.0');
  setSaveStatus(`Fresh blank project “${getProjectName()}” v${getProjectVersion()} (${roomWidthFt} ft × ${roomLengthFt} ft) ready.`);
}

// Startup Initialization: Load embedded project if present, otherwise default
if (window.__embeddedWarehouseProject && Array.isArray(window.__embeddedWarehouseProject.bins)) {
  loadProjectData(window.__embeddedWarehouseProject, 'Embedded_Project');
} else {
  spawnDefaultBlueShelves();
  spawnBin('fixture', 13, -1, 2, 2, 1);
  spawnBin('fixture', 19, -1, 6, 3, 1);
  selectBin(null);
}

// ============================================================================
// STANDALONE DESKTOP & MOBILE APP ENHANCEMENTS
// ============================================================================
function appModalDialog({ title = 'Confirm', message = '', isPrompt = false, defaultValue = '' }) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById('app-modal-backdrop');
    const titleEl = document.getElementById('app-modal-title');
    const msgEl = document.getElementById('app-modal-msg');
    const inputEl = document.getElementById('app-modal-input');
    const okBtn = document.getElementById('app-modal-ok');
    const cancelBtn = document.getElementById('app-modal-cancel');
    if (!backdrop) {
      resolve(isPrompt ? defaultValue : true);
      return;
    }
    titleEl.textContent = title;
    msgEl.textContent = message;
    if (isPrompt) {
      inputEl.style.display = 'block';
      inputEl.value = defaultValue || '';
    } else {
      inputEl.style.display = 'none';
    }
    backdrop.classList.add('open');
    if (isPrompt) setTimeout(() => { inputEl.focus(); inputEl.select(); }, 30);
    else setTimeout(() => okBtn.focus(), 30);

    function cleanup(result) {
      backdrop.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      inputEl.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onOk() { cleanup(isPrompt ? inputEl.value : true); }
    function onCancel() { cleanup(isPrompt ? null : false); }
    function onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    inputEl.addEventListener('keydown', onKey);
  });
}
function appConfirm(message, title = 'Confirm Action') {
  return appModalDialog({ title, message, isPrompt: false });
}
function appPrompt(message, defaultValue = '', title = 'Input Required') {
  return appModalDialog({ title, message, isPrompt: true, defaultValue });
}

// Floating Quick-Action Bar
(function setupQuickActionBar() {
  const qaBar = document.getElementById('quick-action-bar');
  const qaLabel = document.getElementById('qa-label');
  const qaRotate = document.getElementById('qa-rotate');
  const qaStack = document.getElementById('qa-stack');
  const qaClone = document.getElementById('qa-clone');
  const qaInspect = document.getElementById('qa-inspect');
  const qaDelete = document.getElementById('qa-delete');

  if (qaRotate) qaRotate.addEventListener('click', () => rotateSelected());
  if (qaStack) qaStack.addEventListener('click', () => stackSelected());
  if (qaClone) qaClone.addEventListener('click', () => cloneSelected());
  if (qaDelete) qaDelete.addEventListener('click', () => deleteSelected());
  if (qaInspect) qaInspect.addEventListener('click', () => {
    openFolder('inspector');
  });

  const origUpdateSelectedUI = updateSelectedUI;
  updateSelectedUI = function() {
    origUpdateSelectedUI();
    if (!qaBar) return;
    if (!selectedBin) {
      qaBar.classList.remove('visible');
      return;
    }
    qaBar.classList.add('visible');
    const customAsset = selectedBin.type === 'custom' ? customAssetLibrary.find(a => a.id === selectedBin.customAssetId) : null;
    const typeLabel = ({custom: customAsset?.name || 'Custom 3D Asset', pallet: 'Standard Pallet', palletpal: 'PalletPal Leveler', table: (selectedBin.tableVariant === 'monitor' ? 'Computer Station' : 'Packing Table'), shelf: 'Blue Shelf', fixture: 'Grey Box', crane: 'Jib Crane', conveyor: 'Conveyor'})[selectedBin.type] || ((typeof NewAssets !== 'undefined' && NewAssets.has(selectedBin.type)) ? NewAssets.typeName(selectedBin.type) : null) || 'Bin';
    qaLabel.textContent = `${selectedBin.label || typeLabel} #${selectedBin.id} (${selectedBin.w}'×${selectedBin.l}')`;
    const stackDisabled = ['table','crane','conveyor','uline_rolling_conveyor','custom','fixture','palletpal','ibeam','oildrum','spotwelder','weldcurtain','downdrafttable','forklift','fusebox','paintbooth','brakepress','gantrycrane'].includes(selectedBin.type) || (typeof NewAssets !== 'undefined' && NewAssets.has(selectedBin.type));
    qaStack.style.display = stackDisabled ? 'none' : 'inline-block';
    qaStack.textContent = selectedBin.type === 'shelf' ? `☰ Shelves: ${selectedBin.tiers}` : (selectedBin.type === 'pallet' ? `☰ Stack: ${selectedBin.tiers}` : `☰ Tier: ${selectedBin.tiers}`);
  };
  updateSelectedUI();
})();

// Fullscreen Button
(function setupFullscreenButton() {
  const fsBtn = document.getElementById('btn-fullscreen');
  if (!fsBtn) return;
  fsBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.textContent = document.fullscreenElement ? '⛶ Exit Fullscreen' : '⛶ Fullscreen';
  });
})();

// LocalStorage Auto-Save
const AUTOSAVE_KEY = 'layout_design_studio_autosave_v1';
function saveToLocalStorage() {
  try {
    const proj = collectLayoutProject();
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(proj));
  } catch (e) {}
}
const SNAPSHOTS_KEY = 'layout_design_studio_snapshots_v1';

(function setupLauncherAndAutoSave() {
  const overlay = document.getElementById('launcher-overlay');
  const openLauncherBtn = document.getElementById('btn-open-launcher');
  const closeBtn = document.getElementById('launcher-close-btn');
  const btnNew = document.getElementById('launcher-btn-new');
  const btnOpen = document.getElementById('launcher-btn-open');
  const btnLoad = document.getElementById('launcher-btn-load');
  const loadDrawer = document.getElementById('launcher-load-drawer');
  const loadList = document.getElementById('launcher-load-list');
  const saveSnapBtn = document.getElementById('launcher-save-snapshot-btn');
  const statusText = document.getElementById('launcher-status-text');

  function hideLauncher() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
  }
  function showLauncher(openLoadTab = false) {
    if (!overlay) return;
    renderLoadDrawerItems();
    if (openLoadTab && loadDrawer) loadDrawer.classList.add('active');
    overlay.style.display = 'flex';
    overlay.classList.remove('hidden');
  }

  function getSavedSnapshots() {
    try {
      const arr = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function saveSnapshotToList(name) {
    try {
      const snaps = getSavedSnapshots();
      const proj = collectLayoutProject();
      proj.projectName = name || proj.projectName || 'Saved Layout';
      snaps.unshift({
        id: 'snap_' + Date.now(),
        title: `${proj.projectName} (v${proj.projectVersion})`,
        savedAt: new Date().toLocaleString(),
        objectCount: proj.bins.length,
        project: proj
      });
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snaps.slice(0, 15)));
      renderLoadDrawerItems();
    } catch (e) {
      console.warn('Could not save snapshot:', e);
    }
  }

  function renderLoadDrawerItems() {
    if (!loadList) return;
    loadList.innerHTML = '';

    // 1. Auto-saved session item
    try {
      const savedRaw = localStorage.getItem(AUTOSAVE_KEY);
      if (savedRaw) {
        const autoProj = JSON.parse(savedRaw);
        if (autoProj && Array.isArray(autoProj.bins)) {
          const item = document.createElement('div');
          item.className = 'launcher-load-item';
          item.innerHTML = `
            <div>
              <div style="font-size:12px;font-weight:700;color:#6ee7b7;">⚡ Last Auto-Saved Session: ${autoProj.projectName || 'Warehouse Project'} (v${autoProj.projectVersion || '1.0'})</div>
              <div style="font-size:11px;color:#94a3b8;">${autoProj.bins.length} placed object(s) • ${autoProj.settings?.roomWidthFt || 36}ft × ${autoProj.settings?.roomLengthFt || 44}ft floor</div>
            </div>
          `;
          const loadBtn = document.createElement('button');
          loadBtn.className = 'btn-emerald';
          loadBtn.style.cssText = 'flex:0 0 auto;padding:6px 12px;font-size:11px;';
          loadBtn.textContent = 'Load Session';
          loadBtn.onclick = () => {
            loadProjectObjectIntoStudio(autoProj, 'AutoSaved_Session');
            hideLauncher();
          };
          item.appendChild(loadBtn);
          loadList.appendChild(item);
        }
      }
    } catch (e) {}

    // 2. User-saved snapshots
    const snaps = getSavedSnapshots();
    snaps.forEach((snap) => {
      const item = document.createElement('div');
      item.className = 'launcher-load-item';
      const info = document.createElement('div');
      info.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:#e2e8f0;">📌 ${snap.title}</div>
        <div style="font-size:11px;color:#94a3b8;">Saved ${snap.savedAt} • ${snap.objectCount} object(s)</div>
      `;
      const btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex;gap:6px;flex:0 0 auto;';
      const useBtn = document.createElement('button');
      useBtn.className = 'btn-cyan';
      useBtn.style.cssText = 'padding:5px 10px;font-size:11px;';
      useBtn.textContent = 'Load';
      useBtn.onclick = () => {
        loadProjectObjectIntoStudio(snap.project, snap.title);
        hideLauncher();
      };
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-danger';
      delBtn.style.cssText = 'padding:5px 8px;font-size:11px;';
      delBtn.textContent = '✕';
      delBtn.onclick = () => {
        const next = getSavedSnapshots().filter(s => s.id !== snap.id);
        localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next));
        renderLoadDrawerItems();
      };
      btnGroup.append(useBtn, delBtn);
      item.append(info, btnGroup);
      loadList.appendChild(item);
    });

    // 3. Built-in presets
    const presetItem = document.createElement('div');
    presetItem.className = 'launcher-load-item';
    presetItem.innerHTML = `
      <div>
        <div style="font-size:12px;font-weight:700;color:#38bdf8;">🏭 Standard 20×20' Empty Warehouse Template</div>
        <div style="font-size:11px;color:#94a3b8;">Clean 20ft × 20ft empty floor grid</div>
      </div>
    `;
    const presetBtn = document.createElement('button');
    presetBtn.style.cssText = 'flex:0 0 auto;padding:6px 12px;font-size:11px;';
    presetBtn.textContent = 'Load Template';
    presetBtn.onclick = () => {
      if (window.__embeddedWarehouseProject && Array.isArray(window.__embeddedWarehouseProject.bins)) {
        loadProjectData(window.__embeddedWarehouseProject, 'Standard Warehouse Layout');
      } else {
        resetToFreshProject('Standard Warehouse Layout', true, BASE_ROOM_WIDTH_FT, BASE_ROOM_LENGTH_FT);
      }
      hideLauncher();
    };
    presetItem.appendChild(presetBtn);
    loadList.appendChild(presetItem);

    const assetItem = document.createElement('div');
    assetItem.className = 'launcher-load-item';
    assetItem.innerHTML = `
      <div>
        <div style="font-size:12px;font-weight:700;color:#fde047;">📦 Load / Import Custom 3D Asset (.OBJ, .GLB, .GLTF)</div>
        <div style="font-size:11px;color:#94a3b8;">Import external 3D CAD models into your current warehouse library</div>
      </div>
    `;
    const assetBtn = document.createElement('button');
    assetBtn.className = 'btn-amber';
    assetBtn.style.cssText = 'flex:0 0 auto;padding:6px 12px;font-size:11px;';
    assetBtn.textContent = 'Browse 3D Models';
    assetBtn.onclick = () => {
      hideLauncher();
      openFolder('library');
      const assetInput = document.getElementById('input-import-asset');
      if (assetInput) assetInput.click();
    };
    assetItem.appendChild(assetBtn);
    loadList.appendChild(assetItem);
  }

  if (openLauncherBtn) openLauncherBtn.addEventListener('click', () => showLauncher(false));
  if (closeBtn) closeBtn.addEventListener('click', hideLauncher);

  // New-project type selector (Warehouse / Home). Only affects the NEW button;
  // Open/Load take the mode from the file. Does not change the current project.
  let launcherNewMode = 'warehouse';
  const NEW_DESC = {
    warehouse: 'Create a fresh blank 20ft × 20ft warehouse floor with no equipment, drops, or leftover assets.',
    home: 'Create a fresh blank room for a home layout (couches, TV, dresser, etc.).'
  };
  document.querySelectorAll('.launcher-mode-btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      launcherNewMode = normalizeProjectMode(btn.dataset.mode);
      document.querySelectorAll('.launcher-mode-btn[data-mode]').forEach(b => {
        const on = b.dataset.mode === launcherNewMode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const desc = document.querySelector('#launcher-btn-new .launcher-opt-desc');
      if (desc) desc.textContent = NEW_DESC[launcherNewMode];
    });
  });

  if (btnNew) {
    btnNew.addEventListener('click', async () => {
      hideLauncher();
      const newMode = launcherNewMode;
      const defName = PROJECT_MODES[newMode].defaultName;
      const name = await appPrompt(`Enter a name for your new ${PROJECT_MODES[newMode].label.toLowerCase()} project:`, defName, 'New Project');
      if (name === null) {
        showLauncher(false);
        return;
      }
      resetToFreshProject(name, true, BASE_ROOM_WIDTH_FT, BASE_ROOM_LENGTH_FT, newMode);
    });
  }

  // Function to clear all autosave and snapshot states
  function clearAllAutosaveStates() {
    const keysToRemove = [
      AUTOSAVE_KEY,
      SNAPSHOTS_KEY,
      'layout_design_studio_autosave_v1',
      'layout_design_studio_snapshots_v1',
      'layout_studio_autosave',
      'layout_studio_snapshots',
      'warehouse_layout_autosave'
    ];
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch(e) {}
    });
    renderLoadDrawerItems();
    if (statusText) {
      statusText.textContent = 'All autosave load states have been cleared.';
    }
  }

  const clearAutosavesBtn = document.getElementById('launcher-clear-autosaves-btn');
  if (clearAutosavesBtn) {
    clearAutosavesBtn.addEventListener('click', async () => {
      // Non-blocking modal if available, fallback to confirm
      if (typeof appConfirm === 'function') {
        const confirmed = await appConfirm('Are you sure you want to clear all autosaved sessions and local snapshots? This cannot be undone.', 'Clear All Autosaves');
        if (confirmed) clearAllAutosaveStates();
      } else if (confirm('Are you sure you want to clear all autosaved sessions and local snapshots? This cannot be undone.')) {
        clearAllAutosaveStates();
      }
    });
  }

  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      const inputLoad = document.getElementById('input-load-layout');
      if (inputLoad) {
        inputLoad.value = '';
        inputLoad.click();
        const onFileChosen = () => {
          hideLauncher();
          inputLoad.removeEventListener('change', onFileChosen);
        };
        inputLoad.addEventListener('change', onFileChosen);
      }
    });
  }

  if (btnLoad) {
    btnLoad.addEventListener('click', () => {
      if (!loadDrawer) return;
      renderLoadDrawerItems();
      loadDrawer.classList.toggle('active');
    });
  }

  if (saveSnapBtn) {
    saveSnapBtn.addEventListener('click', async () => {
      const name = await appPrompt('Snapshot name:', getProjectName(), 'Save Local Snapshot');
      if (name !== null) saveSnapshotToList(name.trim() || getProjectName());
    });
  }

  // Handle URL / exe startup mode
  const params = new URLSearchParams(window.location.search);
  const launchMode = (params.get('mode') || window.__EXE_LAUNCH_MODE || '').toLowerCase();

  if (!launchMode) {
    // Always show the Launcher first when the file loads
    showLauncher(false);
  } else if (launchMode === 'new') {
    const passedName = params.get('name') || window.__EXE_PROJECT_NAME || 'New Warehouse Project';
    const passedMode = params.get('projectmode') || window.__EXE_PROJECT_MODE || 'warehouse';
    resetToFreshProject(passedName, true, BASE_ROOM_WIDTH_FT, BASE_ROOM_LENGTH_FT, passedMode);
    hideLauncher();
  } else if (launchMode === 'default' || launchMode === 'open') {
    resetToFreshProject('Standard Warehouse Layout', true);
    hideLauncher();
  } else if (launchMode === 'load') {
    const savedRaw = localStorage.getItem(AUTOSAVE_KEY);
    if (savedRaw) {
      try {
        const savedProj = JSON.parse(savedRaw);
        if (loadProjectObjectIntoStudio(savedProj, 'AutoSaved_Session')) {
          hideLauncher();
        } else {
          showLauncher(true);
        }
      } catch (e) {
        showLauncher(true);
      }
    } else {
      showLauncher(true);
    }
  }

  setInterval(saveToLocalStorage, 12000);
  window.addEventListener('beforeunload', saveToLocalStorage);
})();

// Register Service Worker for PWA
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}


window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const a = width / height;
  renderer.setSize(width, height);
  perspCam.aspect = a;
  perspCam.updateProjectionMatrix();
  const maxDim = Math.max(roomWidthFt, roomLengthFt);
  const orthoS = maxDim * 0.58;
  orthoCam.left = -orthoS * a;
  orthoCam.right = orthoS * a;
  orthoCam.top = orthoS;
  orthoCam.bottom = -orthoS;
  orthoCam.updateProjectionMatrix();
});

// ============================================================================
// GLOBAL LAYOUT UNDO (button + Ctrl/Cmd+Z)
// Captures project-state snapshots around user interactions, including object
// placement/editing, room dimensions, roof utilities, and project loads.
// ============================================================================
(function installGlobalUndo() {
  const MAX_UNDO_STEPS = 40;
  const undoHistory = [];
  let pendingSnapshot = null;
  let pendingStartedAt = 0;
  let lastInteractionAt = 0;
  let pointerGestureActive = false;
  let applyingUndo = false;
  let pollHandle = null;
  const undoButton = document.getElementById('btn-global-undo');
  const undoStatus = document.getElementById('global-undo-status');

  function stateSnapshot() {
    try {
      const state = collectLayoutProject();
      delete state.savedAt;
      return JSON.stringify(state);
    } catch (_) { return null; }
  }

  function refreshUndoUi() {
    if (undoButton) undoButton.disabled = undoHistory.length === 0;
    if (undoStatus) undoStatus.textContent = undoHistory.length
      ? `${undoHistory.length} change${undoHistory.length === 1 ? '' : 's'} available`
      : 'No changes to undo';
  }

  function beginCapture() {
    if (applyingUndo) return;
    if (!pendingSnapshot) {
      const snapshot = stateSnapshot();
      if (snapshot === null) return;
      pendingSnapshot = snapshot;
      pendingStartedAt = Date.now();
    }
    lastInteractionAt = Date.now();
    if (!pollHandle) pollHandle = window.setInterval(checkForChange, 100);
  }

  function checkForChange() {
    if (!pendingSnapshot || applyingUndo) return;
    const current = stateSnapshot();
    if (current === null) return;
    if (current !== pendingSnapshot && !pointerGestureActive && Date.now() - lastInteractionAt >= 250) {
      undoHistory.push(pendingSnapshot);
      if (undoHistory.length > MAX_UNDO_STEPS) undoHistory.shift();
      pendingSnapshot = null;
      pendingStartedAt = 0;
      refreshUndoUi();
      return;
    }
    // Avoid keeping stale no-op snapshots forever, while allowing confirmation
    // dialogs and other delayed actions enough time to finish.
    if (Date.now() - pendingStartedAt > 60000) {
      pendingSnapshot = null;
      pendingStartedAt = 0;
    }
  }

  function isTextEditingTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('textarea, [contenteditable="true"], input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"])');
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.target?.closest?.('#global-undo-control')) return;
    pointerGestureActive = true;
    beginCapture();
  }, true);
  document.addEventListener('pointerup', () => {
    pointerGestureActive = false;
    lastInteractionAt = Date.now();
  }, true);
  document.addEventListener('pointercancel', () => {
    pointerGestureActive = false;
    lastInteractionAt = Date.now();
  }, true);
  document.addEventListener('click', (e) => {
    if (e.target?.closest?.('#global-undo-control')) return;
    beginCapture();
  }, true);
  document.addEventListener('change', (e) => {
    if (e.target?.closest?.('#global-undo-control') || isTextEditingTarget(e.target)) return;
    beginCapture();
  }, true);
  document.addEventListener('input', (e) => {
    if (e.target?.closest?.('#global-undo-control') || isTextEditingTarget(e.target)) return;
    beginCapture();
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (isTextEditingTarget(e.target)) return; // preserve normal text-field undo
      e.preventDefault();
      e.stopPropagation();
      performUndo();
      return;
    }
    if (isTextEditingTarget(e.target)) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace','r','R','s','S','c','C'].includes(e.key)) beginCapture();
  }, true);

  function performUndo() {
    if (!undoHistory.length || applyingUndo) return;
    const previous = undoHistory.pop();
    pendingSnapshot = null;
    pendingStartedAt = 0;
    applyingUndo = true;
    try {
      loadProjectData(JSON.parse(previous), 'Undo');
      if (undoStatus) undoStatus.textContent = undoHistory.length
        ? `Undid last change · ${undoHistory.length} left`
        : 'Undid last change';
    } catch (err) {
      console.error('Undo failed:', err);
      undoHistory.push(previous);
      if (undoStatus) undoStatus.textContent = 'Undo failed — current layout retained';
    } finally {
      applyingUndo = false;
      refreshUndoUi();
    }
  }

  if (undoButton) undoButton.addEventListener('click', performUndo);
  window.addEventListener('blur', () => { pointerGestureActive = false; lastInteractionAt = Date.now(); });
  window.layoutDesignStudioUndo = performUndo;
  refreshUndoUi();
})();

if (typeof updateViewModeSplitUI === 'function') updateViewModeSplitUI();
// Apply full Realistic lighting/materials after assets & floor exist so first paint matches post-toggle look
try {
  if (typeof setRealisticMode === 'function') setRealisticMode(true, { silent: true });
} catch (e) { console.warn('Initial realistic mode apply failed:', e); }

function animate() {
  requestAnimationFrame(animate);
  if (currentCameraMode === 'eye') {
    applyEyeLevelCameraTransform();
  } else {
    updateCameraTransition();
    controls.update();
  }
  renderer.render(scene, activeCam);
}
animate();
function parseObjAsset(text) {
  const positions = [], normals = [], outPos = [], outNorm = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) {
      positions.push([+parts[1], +parts[2], +parts[3]]);
    } else if (parts[0] === 'vn' && parts.length >= 4) {
      normals.push([+parts[1], +parts[2], +parts[3]]);
    } else if (parts[0] === 'f' && parts.length >= 4) {
      const parseVertex = (token) => {
        const pParts = token.split('/');
        const pi = parseInt(pParts[0], 10) - 1;
        const ni = pParts[2] ? parseInt(pParts[2], 10) - 1 : -1;
        return {
          pos: positions[pi] || [0, 0, 0],
          norm: (ni >= 0 && normals[ni]) ? normals[ni] : [0, 1, 0]
        };
      };
      const v1 = parseVertex(parts[1]);
      const v2 = parseVertex(parts[2]);
      const v3 = parseVertex(parts[3]);
      
      outPos.push(...v1.pos, ...v2.pos, ...v3.pos);
      outNorm.push(...v1.norm, ...v2.norm, ...v3.norm);

      // Handle quads by triangulating
      if (parts.length >= 5) {
        const v4 = parseVertex(parts[4]);
        outPos.push(...v1.pos, ...v3.pos, ...v4.pos);
        outNorm.push(...v1.norm, ...v3.norm, ...v4.norm);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(outNorm, 3));
  if (!outNorm.length || outNorm.every(n => n === 0)) {
    geom.computeVertexNormals();
  }
  geom.computeBoundingBox();
  return geom;
}

// Handle local file drop/import for 3D assets
document.getElementById('btn-import-asset')?.addEventListener('click', () => {
  const input = document.getElementById('input-import-asset');
  if (!input || !input.files || !input.files.length) {
    setCustomAssetStatus('Please select one or more .obj, .glb, or .gltf files first.', true);
    return;
  }
  
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    const fileName = file.name;
    reader.onload = function (e) {
      try {
        const content = e.target.result;
        const assetId = 'asset_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const assetName = safeAssetName(fileName);
        
        if (fileName.toLowerCase().endsWith('.obj')) {
          customAssetLibrary.push({
            id: assetId,
            name: assetName,
            format: 'obj',
            data: bytesToBase64(new TextEncoder().encode(content))
          });
          
          setCustomAssetStatus(`Successfully imported ${assetName} (.OBJ)!`);
          refreshCustomAssetList();
        } else {
          setCustomAssetStatus(`Imported ${assetName}.`, false);
        }
      } catch (err) {
        console.error('Import error:', err);
        setCustomAssetStatus('Error parsing asset file.', true);
      }
      postProcessImport();
    };
    if (file.name.toLowerCase().endsWith('.obj')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
});

function refreshCustomAssetList() {
  const listEl = document.getElementById('custom-asset-list');
  if (!listEl) return;
  if (!customAssetLibrary.length) {
    listEl.innerHTML = '<div style="font-size:11px;color:#64748b;padding:6px">No custom models imported yet.</div>';
    return;
  }
  listEl.innerHTML = '';
  customAssetLibrary.forEach(asset => {
    const item = document.createElement('div');
    item.className = 'custom-asset-item';
    item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:#1e293b;border-radius:6px;font-size:11px;margin-bottom:4px;';
    item.innerHTML = `<span>📦 ${asset.name}</span><button type="button" class="btn-cyan" style="padding:3px 8px;font-size:10px;" onclick="placeImportedAsset('${asset.id}')">Place</button>`;
    listEl.appendChild(item);
  });
}

function placeImportedAsset(id) {
  const asset = customAssetLibrary.find(a => a.id === id);
  if (!asset) return;
  const pos = findNextOpenSlot(4, 4);
  spawnBin('custom', pos.x, pos.y, 4, 4, 1, asset.id, asset.name);
}

function postProcessImport() {
  const btn = document.getElementById('btn-place-asset');
  if (btn) btn.disabled = false;
}