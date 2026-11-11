/* ============================================================================
   OPENINGS for Layout Design Studio  (doors + windows)

   Drag a door or window tile from the Equipment panel onto any wall. The wall is
   cut so the opening is a real hole, and a frame + door leaf / glass is built in
   it. Click an opening to select it, drag it along its wall, edit size / sill /
   swing in the small panel, or press Delete to remove it.

   Hooks (no edits to app.js):
     - wraps rebuildPerimeterWalls()  -> re-cuts the walls every time they rebuild
     - wraps collectLayoutProject()   -> saves  project.openings
     - wraps loadProjectData()        -> restores project.openings
     - wraps resetToFreshProject()    -> clears openings on "New"

   Each opening is anchored to a wall side + distance along it (feet), so it keeps
   its place when the room is resized with the wall handles.

   LOAD ORDER: after home-assets.js, before / after app.js does not matter
   (everything starts on DOMContentLoaded).   index.html:
       <script src="./openings.js"></script>
   ============================================================================ */
(function () {
  'use strict';

  const WALL_H = 8;          // matches rebuildPerimeterWalls()
  const WALL_T = 0.35;       // matches rebuildPerimeterWalls()
  const EDGE_MARGIN = 0.2;   // min wall left on each side of an opening (ft)
  const SNAP = 0.25;         // slide / drop snap (ft)
  const FRAME = 0.14;        // frame member thickness (ft)

  // ------------------------------------------------------------------ TYPES
  const TYPES = {
    'door-interior': { kind: 'door',   leaves: 1, name: 'Interior Door', icon: '🚪', w: 2.67, h: 6.67, sill: 0, minW: 2,   maxW: 4,  leaf: 0xb08a5e, frame: 0xe8e3d8, tile: '#b08a5e' },
    'door-exterior': { kind: 'door',   leaves: 1, name: 'Exterior Door', icon: '🚪', w: 3,    h: 6.67, sill: 0, minW: 2.5, maxW: 4,  leaf: 0x35546f, frame: 0xf1f5f9, tile: '#35546f' },
    'door-double':   { kind: 'door',   leaves: 2, name: 'Double Door',   icon: '🚪', w: 5,    h: 6.67, sill: 0, minW: 4,   maxW: 8,  leaf: 0xb08a5e, frame: 0xe8e3d8, tile: '#8a6a4a' },
    'door-sliding':  { kind: 'slider', leaves: 2, name: 'Sliding Door',  icon: '🪟', w: 6,    h: 6.67, sill: 0, minW: 4,   maxW: 12, leaf: 0x9ec9e8, frame: 0x4b5563, tile: '#64748b' },
    'window-std':    { kind: 'window', leaves: 1, name: 'Window',        icon: '🪟', w: 3,    h: 4,    sill: 3, minW: 1.5, maxW: 6,  leaf: 0x9ec9e8, frame: 0xf1f5f9, tile: '#38bdf8' },
    'window-wide':   { kind: 'window', leaves: 1, name: 'Wide Window',  icon: '🪟', w: 5,    h: 4,    sill: 3, minW: 3,   maxW: 10, leaf: 0x9ec9e8, frame: 0xf1f5f9, tile: '#0ea5e9' }
  };
  const ORDER = Object.keys(TYPES);

  // ------------------------------------------------------------------ STATE
  let openings = [];          // { id, type, side, t, w, h, sill, flipSide, flipHinge, x, y, _info }
  let selectedId = null;
  let idCounter = 1;
  let group = null;           // THREE.Group (child of wallsGroup) holding the built openings
  let ghost = null;           // placement preview while dragging a tile
  let tileDrag = null;        // { type, startX, startY, moved, info, t, valid }
  let slide = null;           // { id }
  let panelEl = null;
  let refreshQueued = false;
  let installed = false;
  const matCache = {};
  const ray = () => (ray._r || (ray._r = new THREE.Raycaster()));

  // ---------------------------------------------------------------- HELPERS
  function toWz(v) { return typeof toWorldZ === 'function' ? toWorldZ(v) : 44 - v; } // involution: ft<->world z
  function status(msg) { try { if (typeof setSaveStatus === 'function') setSaveStatus(msg); } catch (e) { /* ignore */ } }
  function find(id) { for (let i = 0; i < openings.length; i++) if (openings[i].id === id) return openings[i]; return null; }
  function snap(v) { return Math.round(v / SNAP) * SNAP; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }

  function mat(color, opts) {
    const key = color + JSON.stringify(opts || {});
    if (!matCache[key]) matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.6, metalness: 0.05 }, opts || {}));
    return matCache[key];
  }
  // box with its BASE at y0, centred on x / z
  function bx(g, cx, y0, cz, w, h, d, m) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  }

  // Describes one whole wall edge from a wall mesh made by rebuildPerimeterWalls()
  function wallInfo(mesh) {
    if (mesh.userData.__wall) return mesh.userData.__wall;
    const len = mesh.geometry.parameters.width, ry = mesh.rotation.y;
    const dx = Math.cos(ry), dz = -Math.sin(ry);      // local +X of the box, in world
    const info = {
      side: mesh.userData.wallEdgeSide, dir: mesh.userData.wallExpandDir,
      len: len, rotY: ry, dx: dx, dz: dz,
      ax: mesh.position.x - dx * len / 2, az: mesh.position.z - dz * len / 2
    };
    mesh.userData.__wall = info;
    return info;
  }
  function projectT(info, x, z) { return (x - info.ax) * info.dx + (z - info.az) * info.dz; }
  function clampT(info, t, w) {
    const lo = w / 2 + EDGE_MARGIN, hi = info.len - w / 2 - EDGE_MARGIN;
    return hi < lo ? null : clamp(t, lo, hi);
  }
  function sameWall(a, b) {
    return !!a && !!b && a.side === b.side && Math.abs(a.ax - b.ax) < 0.01 && Math.abs(a.az - b.az) < 0.01 && Math.abs(a.len - b.len) < 0.01;
  }
  function overlaps(info, t, w, ignoreId) {
    for (let i = 0; i < openings.length; i++) {
      const o = openings[i];
      if (o.id === ignoreId || !o._info || !sameWall(o._info, info)) continue;
      if (Math.abs(o.t - t) < (o.w + w) / 2 + 0.05) return true;
    }
    return false;
  }

  // ------------------------------------------------------- BUILD OPENING 3D
  function buildOpening(op, info) {
    const spec = TYPES[op.type];
    const g = new THREE.Group();
    g.userData.openingId = op.id;
    g.userData.__wall = info;
    const w = op.w, h = op.h, sill = op.sill, J = FRAME, D = WALL_T + 0.08;
    const frameM = mat(spec.frame, { roughness: 0.55 });
    const leafM = mat(spec.leaf, { roughness: 0.7 });
    const glassM = mat(0x9ec9e8, { transparent: true, opacity: 0.34, roughness: 0.1, metalness: 0.2, depthWrite: false });
    const metalM = mat(0xcbd5e1, { roughness: 0.3, metalness: 0.7 });
    const top = sill + h;

    if (spec.kind === 'window') {
      bx(g, -(w / 2 - J / 2), sill, 0, J, h, D, frameM);
      bx(g, (w / 2 - J / 2), sill, 0, J, h, D, frameM);
      bx(g, 0, sill, 0, w - 2 * J, J, D, frameM);
      bx(g, 0, top - J, 0, w - 2 * J, J, D, frameM);
      bx(g, 0, sill + J, 0, w - 2 * J, h - 2 * J, 0.04, glassM);
      if (w >= 3) bx(g, 0, sill + J, 0, 0.06, h - 2 * J, 0.07, frameM);       // vertical mullion
      if (h >= 3.5) bx(g, 0, sill + h / 2 - 0.03, 0, w - 2 * J, 0.06, 0.07, frameM); // horizontal mullion
      bx(g, 0, sill - 0.08, 0, w + 0.3, 0.08, WALL_T + 0.35, frameM);          // sill ledge
    } else {
      bx(g, -(w / 2 - J / 2), 0, 0, J, h, D, frameM);
      bx(g, (w / 2 - J / 2), 0, 0, J, h, D, frameM);
      bx(g, 0, top - J, 0, w - 2 * J, J, D, frameM);
      const side = op.flipSide ? -1 : 1;
      const hingeSign = op.flipHinge ? 1 : -1;      // default hinge on the -X jamb
      const arcMat = new THREE.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.85 });

      const addArc = function (hx, latchDir, r) {
        const pts = [];
        for (let k = 0; k <= 14; k++) {
          const a = (k / 14) * Math.PI / 2;
          pts.push(new THREE.Vector3(hx + r * Math.cos(a) * latchDir, 0.04, side * r * Math.sin(a)));
        }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat));
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(hx, 0.04, 0), new THREE.Vector3(hx, 0.04, side * r)]), arcMat));
      };

      if (spec.kind === 'slider') {
        const pw = (w - 2 * J) / 2, m = op.flipHinge ? -1 : 1;
        bx(g, 0, 0, 0, w - 2 * J, 0.05, D, frameM);                                    // track
        bx(g, -m * pw / 2, 0.05, -0.06 * side, pw, h - J - 0.05, 0.04, glassM);        // fixed pane
        bx(g, m * pw / 2, 0.05, 0.06 * side, pw, h - J - 0.05, 0.04, glassM);          // sliding pane
        bx(g, m * pw / 2, 0.05, 0.06 * side, 0.05, h - J - 0.05, 0.07, frameM);
        bx(g, m * (pw - 0.15), 2.8, 0.1 * side, 0.05, 1.1, 0.05, metalM);              // handle
      } else if (spec.leaves === 2) {
        const lw = (w - 2 * J) / 2 - 0.02;
        [-1, 1].forEach(function (s) {
          const cx = s * ((w - 2 * J) / 4);
          bx(g, cx, 0.03, 0, lw, h - J - 0.03, 0.1, leafM);
          bx(g, cx - s * (lw / 2 - 0.2), 3, 0.09 * side, 0.1, 0.1, 0.12, metalM);       // knob on the meeting edge
          addArc(s * ((w - 2 * J) / 2), -s, lw);
        });
      } else {
        const lw = w - 2 * J - 0.04;
        bx(g, 0, 0.03, 0, lw, h - J - 0.03, 0.1, leafM);
        bx(g, -hingeSign * (lw / 2 - 0.25), 3, 0.09 * side, 0.1, 0.1, 0.12, metalM);    // knob on the latch side
        bx(g, hingeSign * lw / 2, 0.5, 0.07 * side, 0.05, 0.3, 0.05, metalM);            // hinge hint (lower)
        addArc(hingeSign * lw / 2, -hingeSign, lw);
      }
    }

    // invisible but pickable box, so thin parts are easy to click
    const hit = bx(g, 0, sill, 0, w, h, WALL_T + 0.3,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.castShadow = false; hit.receiveShadow = false;

    if (op.id === selectedId) {
      const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.12, h + 0.12, WALL_T + 0.25));
      const ln = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0xfacc15 }));
      ln.position.set(0, sill + h / 2, 0);
      g.add(ln);
    }

    g.position.set(info.ax + info.dx * op.t, 0, info.az + info.dz * op.t);
    g.rotation.y = info.rotY;
    return g;
  }

  // ------------------------------------------------------ CUT THE WALLS
  function disposeGroup() {
    if (!group) return;
    group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    if (group.parent) group.parent.remove(group);
    group = null;
  }

  function anchorOpening(op, walls) {
    let best = null;
    walls.forEach(function (w) { if (!best && w.info.side === op.side) best = w; });
    if (!best && Number.isFinite(op.x) && Number.isFinite(op.y)) {
      const px = op.x, pz = toWz(op.y);
      let bd = 1.0;
      walls.forEach(function (w) {
        const t = clamp(projectT(w.info, px, pz), 0, w.info.len);
        const d = Math.hypot(px - (w.info.ax + w.info.dx * t), pz - (w.info.az + w.info.dz * t));
        if (d < bd) { bd = d; best = w; op.t = t; op.side = w.info.side; }
      });
    }
    return best;
  }

  function addWallPiece(src, info, s, e, y0, y1) {
    const l = e - s, h = y1 - y0;
    if (l < 0.02 || h < 0.02) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, WALL_T), src.material);
    const tc = (s + e) / 2;
    m.position.set(info.ax + info.dx * tc, (y0 + y1) / 2, info.az + info.dz * tc);
    m.rotation.y = info.rotY;
    m.castShadow = src.castShadow; m.receiveShadow = src.receiveShadow;
    m.userData = Object.assign({}, src.userData, { __wall: info });
    wallsGroup.add(m);
  }

  function applyOpenings() {
    openings.forEach(function (o) { o._info = null; });
    if (!openings.length || typeof wallsGroup === 'undefined') return;

    const walls = wallsGroup.children
      .filter(function (m) {
        return m.isMesh && m.userData && m.userData.wallEdgeSide !== undefined && m.geometry && m.geometry.parameters && m.geometry.parameters.width;
      })
      .map(function (m) { return { mesh: m, info: wallInfo(m), ops: [] }; });

    openings.forEach(function (op) {
      const w = anchorOpening(op, walls);
      if (!w) return;
      const t = clampT(w.info, op.t, op.w);
      if (t === null) return;                 // wall too short: kept, just not drawn
      op.t = t; op.side = w.info.side;
      w.ops.push(op);
    });

    group = new THREE.Group();
    group.name = 'openings';

    walls.forEach(function (w) {
      if (!w.ops.length) return;
      w.ops.sort(function (a, b) { return a.t - b.t; });
      const kept = [];
      let prevEnd = -Infinity;
      w.ops.forEach(function (op) {
        if (op.t - op.w / 2 < prevEnd + 0.01) return;   // overlapping: not drawn
        prevEnd = op.t + op.w / 2;
        kept.push(op);
      });

      let cursor = 0;
      kept.forEach(function (op) {
        const s = op.t - op.w / 2, e = op.t + op.w / 2, topY = op.sill + op.h;
        addWallPiece(w.mesh, w.info, cursor, s, 0, WALL_H);
        if (op.sill > 0.001) addWallPiece(w.mesh, w.info, s, e, 0, op.sill);
        if (topY < WALL_H - 0.001) addWallPiece(w.mesh, w.info, s, e, topY, WALL_H);
        cursor = e;
        op._info = w.info;
        group.add(buildOpening(op, w.info));
      });
      addWallPiece(w.mesh, w.info, cursor, w.info.len, 0, WALL_H);

      wallsGroup.remove(w.mesh);
      w.mesh.geometry.dispose();
    });

    wallsGroup.add(group);
    updatePanel();
  }

  function refresh() {
    if (typeof rebuildPerimeterWalls === 'function') rebuildPerimeterWalls();
    else applyOpenings();
  }
  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(function () { refreshQueued = false; refresh(); });
  }

  // ----------------------------------------------------------- PICKING
  function ndcOf(e) {
    const r = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  function overCanvas(e) { return document.elementFromPoint(e.clientX, e.clientY) === renderer.domElement; }
  function castAt(e, objects) {
    const rc = ray();
    rc.setFromCamera(ndcOf(e), activeCam);
    return rc.intersectObjects(objects, true);
  }
  function openingIdOf(obj) {
    for (let o = obj; o; o = o.parent) if (o.userData && o.userData.openingId !== undefined) return o.userData.openingId;
    return null;
  }
  function pickOpening(e) {
    if (!group) return null;
    const hits = castAt(e, group.children);
    for (let i = 0; i < hits.length; i++) {
      if (!hits[i].object.isMesh) continue;
      const id = openingIdOf(hits[i].object);
      if (id !== null) return { id: id, point: hits[i].point };
    }
    return null;
  }
  function pickWall(e) {
    if (typeof wallsGroup === 'undefined' || !wallsGroup.visible) return null;
    const hits = castAt(e, wallsGroup.children);
    for (let i = 0; i < hits.length; i++) {
      const obj = hits[i].object;
      if (!obj.isMesh) continue;
      for (let o = obj; o && o !== wallsGroup; o = o.parent) {
        if (o.userData && o.userData.__wall) return { info: o.userData.__wall, point: hits[i].point };
        if (o.userData && o.userData.wallEdgeSide !== undefined && o.geometry && o.geometry.parameters) return { info: wallInfo(o), point: hits[i].point };
      }
    }
    return null;
  }

  // -------------------------------------------------- SELECT / EDIT PANEL
  function select(id) {
    selectedId = id;
    if (typeof selectedBin !== 'undefined' && selectedBin && id !== null && typeof selectBin === 'function') selectBin(null);
    refresh();
    updatePanel();
  }

  function removeOpening(id) {
    openings = openings.filter(function (o) { return o.id !== id; });
    if (selectedId === id) selectedId = null;
    refresh();
    updatePanel();
  }

  function ensureStyle() {
    if (document.getElementById('openings-style')) return;
    const st = document.createElement('style');
    st.id = 'openings-style';
    st.textContent =
      '#openings-panel{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;display:none;align-items:center;gap:10px;flex-wrap:wrap;max-width:94vw;' +
      'padding:9px 12px;background:var(--bg-panel,rgba(18,22,31,.94));color:#e5e7eb;border:1px solid rgba(148,163,184,.28);border-radius:12px;font:12px/1.2 system-ui,Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45)}' +
      '#openings-panel .op-title{font-weight:700;margin-right:4px}' +
      '#openings-panel label{display:flex;align-items:center;gap:5px;color:#cbd5e1}' +
      '#openings-panel input{width:58px;padding:4px 5px;background:#0f172a;color:#e5e7eb;border:1px solid #334155;border-radius:6px;font:inherit}' +
      '#openings-panel button{padding:5px 9px;background:#1e293b;color:#e5e7eb;border:1px solid #334155;border-radius:6px;font:inherit;cursor:pointer}' +
      '#openings-panel button:hover{background:#334155}#openings-panel button:focus-visible,#openings-panel input:focus-visible{outline:2px solid #38bdf8;outline-offset:1px}' +
      '#openings-panel .op-del{border-color:#7f1d1d;color:#fca5a5}' +
      '#openings-drag-chip{position:fixed;z-index:70;pointer-events:none;padding:4px 9px;background:rgba(15,23,42,.92);color:#e5e7eb;border:1px solid #38bdf8;border-radius:8px;font:12px system-ui,Segoe UI,Arial,sans-serif;display:none}';
    document.head.appendChild(st);
  }

  function buildPanel() {
    if (panelEl) return;
    ensureStyle();
    panelEl = document.createElement('div');
    panelEl.id = 'openings-panel';
    panelEl.setAttribute('role', 'group');
    panelEl.setAttribute('aria-label', 'Selected door or window');
    panelEl.innerHTML =
      '<span class="op-title" id="op-title"></span>' +
      '<label>Width <input id="op-w" type="number" step="0.25" min="1" max="12"> ft</label>' +
      '<label>Height <input id="op-h" type="number" step="0.25" min="1" max="7.5"> ft</label>' +
      '<label id="op-sill-wrap">Sill <input id="op-sill" type="number" step="0.25" min="0.5" max="5"> ft</label>' +
      '<button type="button" id="op-flip-side">Flip swing side</button>' +
      '<button type="button" id="op-flip-hinge">Flip hinge</button>' +
      '<button type="button" class="op-del" id="op-del">Delete</button>' +
      '<button type="button" id="op-close" aria-label="Deselect">✕</button>';
    document.body.appendChild(panelEl);

    const sel = function () { return selectedId === null ? null : find(selectedId); };
    const onField = function (field) {
      return function (e) {
        const op = sel(); if (!op) return;
        const spec = TYPES[op.type];
        const prev = { w: op.w, h: op.h, sill: op.sill };
        let v = num(e.target.value, op[field]);
        if (field === 'w') v = clamp(v, spec.minW, spec.maxW);
        if (field === 'h') v = clamp(v, 1, WALL_H - 0.4 - op.sill);
        if (field === 'sill') v = clamp(v, 0.5, WALL_H - 0.4 - op.h);
        op[field] = v;
        const info = op._info;
        const t = info ? clampT(info, op.t, op.w) : op.t;
        if (info && (t === null || overlaps(info, t, op.w, op.id))) {
          op.w = prev.w; op.h = prev.h; op.sill = prev.sill;
          status('Not enough room on this wall for that size.');
        } else if (info) { op.t = t; }
        refresh(); updatePanel();
      };
    };
    panelEl.querySelector('#op-w').addEventListener('change', onField('w'));
    panelEl.querySelector('#op-h').addEventListener('change', onField('h'));
    panelEl.querySelector('#op-sill').addEventListener('change', onField('sill'));
    panelEl.querySelector('#op-flip-side').addEventListener('click', function () { const op = sel(); if (op) { op.flipSide = !op.flipSide; refresh(); } });
    panelEl.querySelector('#op-flip-hinge').addEventListener('click', function () { const op = sel(); if (op) { op.flipHinge = !op.flipHinge; refresh(); } });
    panelEl.querySelector('#op-del').addEventListener('click', function () { if (selectedId !== null) removeOpening(selectedId); });
    panelEl.querySelector('#op-close').addEventListener('click', function () { select(null); });
  }

  function updatePanel() {
    buildPanel();
    const op = selectedId === null ? null : find(selectedId);
    if (!op) { panelEl.style.display = 'none'; return; }
    const spec = TYPES[op.type];
    panelEl.style.display = 'flex';
    panelEl.querySelector('#op-title').textContent = spec.name;
    panelEl.querySelector('#op-w').value = (+op.w.toFixed(2));
    panelEl.querySelector('#op-h').value = (+op.h.toFixed(2));
    panelEl.querySelector('#op-sill').value = (+op.sill.toFixed(2));
    panelEl.querySelector('#op-sill-wrap').style.display = spec.kind === 'window' ? '' : 'none';
    panelEl.querySelector('#op-flip-side').style.display = spec.kind === 'window' ? 'none' : '';
    panelEl.querySelector('#op-flip-hinge').style.display = (spec.kind === 'door' && spec.leaves === 1) || spec.kind === 'slider' ? '' : 'none';
    panelEl.querySelector('#op-flip-hinge').textContent = spec.kind === 'slider' ? 'Flip sliding side' : 'Flip hinge';
  }

  // ------------------------------------------------ DRAG A TILE ONTO A WALL
  function ensureGhost() {
    if (ghost) return ghost;
    ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, WALL_T + 0.3),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.5, depthTest: false })
    );
    ghost.renderOrder = 999;
    ghost.visible = false;
    scene.add(ghost);
    return ghost;
  }
  function chipEl() {
    let c = document.getElementById('openings-drag-chip');
    if (!c) { ensureStyle(); c = document.createElement('div'); c.id = 'openings-drag-chip'; document.body.appendChild(c); }
    return c;
  }

  function beginTileDrag(type, e) {
    if (tileDrag) return;
    const spec = TYPES[type];
    tileDrag = { type: type, startX: e.clientX, startY: e.clientY, moved: false, info: null, t: 0, valid: false };
    const chip = chipEl();
    chip.textContent = spec.icon + ' ' + spec.name;
    chip.style.left = (e.clientX + 14) + 'px'; chip.style.top = (e.clientY + 14) + 'px';
    document.addEventListener('pointermove', onTileMove, true);
    document.addEventListener('pointerup', onTileUp, true);
    document.addEventListener('pointercancel', cancelTileDrag, true);
    document.addEventListener('keydown', onTileKey, true);
  }
  function endTileDrag() {
    document.removeEventListener('pointermove', onTileMove, true);
    document.removeEventListener('pointerup', onTileUp, true);
    document.removeEventListener('pointercancel', cancelTileDrag, true);
    document.removeEventListener('keydown', onTileKey, true);
    chipEl().style.display = 'none';
    if (ghost) ghost.visible = false;
    document.body.style.cursor = '';
    tileDrag = null;
  }
  function cancelTileDrag() { endTileDrag(); }
  function onTileKey(e) { if (e.key === 'Escape') cancelTileDrag(); }

  function onTileMove(e) {
    if (!tileDrag) return;
    if (!tileDrag.moved && Math.hypot(e.clientX - tileDrag.startX, e.clientY - tileDrag.startY) > 5) tileDrag.moved = true;
    if (!tileDrag.moved) return;
    const spec = TYPES[tileDrag.type];
    const chip = chipEl();
    chip.style.display = 'block';
    chip.style.left = (e.clientX + 14) + 'px'; chip.style.top = (e.clientY + 14) + 'px';
    document.body.style.cursor = 'grabbing';

    tileDrag.valid = false;
    const g = ensureGhost();
    g.visible = false;
    if (!overCanvas(e)) return;
    const hit = pickWall(e);
    if (!hit) return;
    let t = clampT(hit.info, snap(projectT(hit.info, hit.point.x, hit.point.z)), spec.w);
    if (t === null) return;
    tileDrag.info = hit.info; tileDrag.t = t;
    tileDrag.valid = !overlaps(hit.info, t, spec.w, null);

    g.scale.set(spec.w, spec.h, 1);
    g.position.set(hit.info.ax + hit.info.dx * t, spec.sill + spec.h / 2, hit.info.az + hit.info.dz * t);
    g.rotation.y = hit.info.rotY;
    g.material.color.setHex(tileDrag.valid ? 0x22c55e : 0xef4444);
    g.visible = true;
  }

  function onTileUp() {
    if (!tileDrag) return;
    const d = tileDrag;
    endTileDrag();
    if (!d.moved) { status('Drag the ' + TYPES[d.type].name + ' tile onto a wall to place it.'); return; }
    if (d.valid && d.info) addOpening(d.type, d.info, d.t);
    else status('Drop it on a wall that has room for it.');
  }

  function addOpening(type, info, t) {
    const spec = TYPES[type];
    const op = {
      id: idCounter++, type: type, side: info.side, t: t,
      w: spec.w, h: spec.h, sill: spec.sill, flipSide: false, flipHinge: false,
      x: info.ax + info.dx * t, y: toWz(info.az + info.dz * t), _info: info
    };
    openings.push(op);
    selectedId = op.id;
    refresh();
    updatePanel();
    status(spec.name + ' placed. Drag it along the wall, or edit it below.');
  }

  // -------------------------------------------- SELECT / SLIDE ON THE CANVAS
  function onCanvasDown(e) {
    if (tileDrag || e.button !== 0) return;
    const hit = pickOpening(e);
    if (!hit) { if (selectedId !== null) select(null); return; }
    e.stopImmediatePropagation();
    if (selectedId !== hit.id) select(hit.id);
    slide = { id: hit.id };
    if (typeof controls !== 'undefined') controls.enabled = false;
    window.addEventListener('pointermove', onSlideMove, true);
    window.addEventListener('pointerup', onSlideUp, true);
  }
  function onSlideMove(e) {
    if (!slide) return;
    const op = find(slide.id);
    if (!op || !op._info) return;
    const rc = ray();
    rc.setFromCamera(ndcOf(e), activeCam);
    const pt = new THREE.Vector3();
    if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(op.sill + op.h / 2)), pt)) return;
    const t = clampT(op._info, snap(projectT(op._info, pt.x, pt.z)), op.w);
    if (t === null || t === op.t || overlaps(op._info, t, op.w, op.id)) return;
    op.t = t;
    scheduleRefresh();
  }
  function onSlideUp() {
    window.removeEventListener('pointermove', onSlideMove, true);
    window.removeEventListener('pointerup', onSlideUp, true);
    slide = null;
    if (typeof controls !== 'undefined') controls.enabled = true;
  }

  function onKey(e) {
    if (selectedId === null) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); e.stopImmediatePropagation();
      removeOpening(selectedId);
    } else if (e.key === 'Escape') {
      select(null);
    }
  }

  // ---------------------------------------------------------------- TILES
  function buildTiles() {
    const grid = document.querySelector('#pane-assets .asset-picker-grid');
    if (!grid) return;
    ORDER.forEach(function (type) {
      const id = 'btn-add-opening-' + type;
      if (document.getElementById(id)) return;
      const s = TYPES[type];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'asset-tile';
      btn.id = id;
      btn.setAttribute('data-type', 'opening-' + type);
      btn.setAttribute('data-modes', 'home');
      btn.title = 'Drag onto a wall: ' + s.name + ' (' + s.w + '×' + s.h + ' ft)';
      btn.style.setProperty('--tile-color', s.tile);
      btn.style.touchAction = 'none';
      btn.innerHTML = '<span class="tile-preview" aria-hidden="true"><span class="tile-fallback">' + s.icon + '</span></span>' +
                      '<span class="tile-label">' + s.name + '</span>';
      btn.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        beginTileDrag(type, e);
      });
      btn.addEventListener('click', function (e) { e.preventDefault(); });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') status('Drag the ' + s.name + ' tile onto a wall to place it.');
      });
      grid.appendChild(btn);
    });
  }

  // ---------------------------------------------------- SAVE / LOAD HOOKS
  function serialize() {
    return openings.map(function (o) {
      const info = o._info;
      const x = info ? info.ax + info.dx * o.t : o.x;
      const y = info ? toWz(info.az + info.dz * o.t) : o.y;
      return { id: o.id, type: o.type, side: o.side, t: +o.t.toFixed(3), x: +num(x, 0).toFixed(3), y: +num(y, 0).toFixed(3),
               w: o.w, h: o.h, sill: o.sill, flipSide: !!o.flipSide, flipHinge: !!o.flipHinge };
    });
  }
  function loadFrom(arr) {
    const next = [];
    let maxId = 0;
    (Array.isArray(arr) ? arr : []).forEach(function (r) {
      const spec = r && TYPES[r.type];
      if (!spec) return;
      const w = clamp(num(r.w, spec.w), spec.minW, spec.maxW);
      const sill = spec.kind === 'window' ? clamp(num(r.sill, spec.sill), 0.5, 5) : 0;
      const h = clamp(num(r.h, spec.h), 1, WALL_H - 0.4 - sill);
      const id = Number.isFinite(Number(r.id)) ? Number(r.id) : ++maxId;
      maxId = Math.max(maxId, id);
      next.push({ id: id, type: r.type, side: r.side, t: num(r.t, w), x: num(r.x, NaN), y: num(r.y, NaN),
                  w: w, h: h, sill: sill, flipSide: !!r.flipSide, flipHinge: !!r.flipHinge, _info: null });
    });
    openings = next;
    idCounter = maxId + 1;
    selectedId = null;
    refresh();
    updatePanel();
  }
  function clearAll() { loadFrom([]); }

  function wrapGlobal(name, make) {
    const orig = window[name];
    if (typeof orig !== 'function') { console.warn('openings.js: ' + name + '() not found as a global function - skipped.'); return false; }
    window[name] = make(orig);
    return true;
  }

  function install() {
    if (installed) return;
    if (typeof THREE === 'undefined' || typeof wallsGroup === 'undefined' || typeof renderer === 'undefined' || typeof activeCam === 'undefined') {
      console.warn('openings.js: studio not ready - doors/windows disabled.');
      return;
    }
    installed = true;

    wrapGlobal('rebuildPerimeterWalls', function (orig) {
      return function () {
        disposeGroup();
        const r = orig.apply(this, arguments);
        try { applyOpenings(); } catch (err) { console.error('openings.js:', err); }
        return r;
      };
    });
    const savedOk = wrapGlobal('collectLayoutProject', function (orig) {
      return function () {
        const p = orig.apply(this, arguments);
        if (p && typeof p === 'object') p.openings = serialize();
        return p;
      };
    });
    wrapGlobal('loadProjectData', function (orig) {
      return function (project) {
        const r = orig.apply(this, arguments);
        loadFrom(project && project.openings);
        return r;
      };
    });
    wrapGlobal('resetToFreshProject', function (orig) {
      return function () {
        const r = orig.apply(this, arguments);
        clearAll();
        return r;
      };
    });
    if (!savedOk) console.warn('openings.js: doors/windows will not be saved until collectLayoutProject() is a global function.');

    renderer.domElement.addEventListener('pointerdown', onCanvasDown, true);
    window.addEventListener('keydown', onKey, true);
    buildTiles();
    buildPanel();

    // a project embedded in the page (standalone HTML export) may have loaded before the hooks existed
    try {
      const el = document.getElementById('embedded-project-json');
      const txt = el && el.textContent && el.textContent.trim();
      if (txt) { const proj = JSON.parse(txt); if (proj && Array.isArray(proj.openings) && proj.openings.length) loadFrom(proj.openings); }
    } catch (err) { /* no embedded openings */ }
  }

  window.Openings = {
    install: install,
    list: function () { return serialize(); },
    clear: clearAll,
    load: loadFrom,
    types: function () { return Object.keys(TYPES); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  window.addEventListener('load', function () { install(); buildTiles(); });
})();
