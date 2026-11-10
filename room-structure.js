/* ============================================================================
   ROOM STRUCTURE for Layout Design Studio  -  doors, windows and archways

   Openings are cut into the perimeter walls. Each opening is anchored to a wall
   edge by name (rectangle: west / north / east / south, freeform room: edge0,
   edge1 ...) and a position measured along that wall, so it follows the wall
   when the room is resized or the facility contents are shifted.

   Position convention: "pos" = distance in feet from the wall's SOUTH end (walls
   that run north-south) or WEST end (walls that run east-west) to the CENTRE of
   the opening.

   Hooks (app.js, all small):
     rebuildPerimeterWalls()  RoomStructure.setEdges(defs) / .buildWall(...) / .finishWalls(group)
     loadProjectData()        RoomStructure.load(project.wallOpenings)
     resetToFreshProject()    RoomStructure.clear()
     shiftFacilityContents()  RoomStructure.shift(dx, dy)
   export-engine.js: collectLayoutProject() saves  wallOpenings: RoomStructure.serialize()

   LOAD ORDER: plain <script> before app.js (needs THREE only when functions run).
   ============================================================================ */

var RoomStructure = (function () {
  'use strict';

  const WALL_H = 8, WALL_T = 0.35, TRIM_W = 0.16;

  const PRESETS = {
    door:       { kind: 'door',    label: 'Door',        icon: '🚪', w: 3,   h: 6.67, sill: 0 },
    doubledoor: { kind: 'door',    label: 'Double Door', icon: '🚪', w: 6,   h: 6.67, sill: 0, double: true },
    window:     { kind: 'window',  label: 'Window',      icon: '🪟', w: 3,   h: 4,    sill: 3 },
    widewindow: { kind: 'window',  label: 'Wide Window', icon: '🪟', w: 5,   h: 4,    sill: 3 },
    archway:    { kind: 'opening', label: 'Archway',     icon: '⛩️', w: 4,   h: 7,    sill: 0 }
  };

  let openings = [];
  let nextId = 1;
  let edges = {};           // side -> edge geometry (rebuilt with every wall rebuild)
  let selectedId = null;
  let placing = null;       // preset key while in placement mode
  let dress = null;         // THREE.Group with frames, leaves, glass, swing arcs
  let ghost = null, hintEl = null, lastEval = null;
  const mats = {};

  // ------------------------------------------------------------ materials
  function M() {
    if (mats.trim) return mats;
    mats.trim = new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.6, metalness: 0 });
    mats.trimSel = new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0x6b5200, roughness: 0.5, metalness: 0 });
    mats.door = new THREE.MeshStandardMaterial({ color: 0x8b6a4a, roughness: 0.65, metalness: 0.02 });
    mats.knob = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.9 });
    mats.glass = new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });
    mats.arc = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    mats.arcLine = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
    mats.ghostOk = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45, depthWrite: false });
    mats.ghostBad = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.45, depthWrite: false });
    return mats;
  }

  // ------------------------------------------------------- edge geometry
  function roomPoly() {
    if (typeof customRoomOutline !== 'undefined' && customRoomOutline && customRoomOutline.length >= 3) return customRoomOutline;
    return [[0, 0], [0, roomLengthFt], [roomWidthFt, roomLengthFt], [roomWidthFt, 0]];
  }
  function isRect() { return !(typeof customRoomOutline !== 'undefined' && customRoomOutline && customRoomOutline.length >= 3); }

  function disposeDress() {
    if (!dress) return;
    dress.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    if (dress.parent) dress.parent.remove(dress);
    dress = null;
  }

  // Called at the start of rebuildPerimeterWalls(). Each edge is measured from its
  // west end (or south end if it runs north-south) so positions stay put when the
  // room grows to the east / north.
  function setEdges(sideDefs) {
    disposeDress();
    edges = {};
    const poly = roomPoly();
    sideDefs.forEach(function (def, i) {
      const a = def.a, b = def.b;
      const swap = (b[0] < a[0] - 1e-6) || (Math.abs(b[0] - a[0]) <= 1e-6 && b[1] < a[1]);
      const P0 = swap ? b : a, P1 = swap ? a : b;
      const p0 = { x: P0[0], z: toWorldZ(P0[1]) }, p1 = { x: P1[0], z: toWorldZ(P1[1]) };
      const dx = p1.x - p0.x, dz = p1.z - p0.z, len = Math.hypot(dx, dz);
      if (len < 0.01) return;
      const d = { x: dx / len, z: dz / len };
      // inward normal: try the left-hand perpendicular in plan space, flip if outside the room
      const ex = (P1[0] - P0[0]) / len, ey = (P1[1] - P0[1]) / len;
      let npx = -ey, npy = ex;
      const mx = (P0[0] + P1[0]) / 2, my = (P0[1] + P1[1]) / 2;
      if (!pointInPolygon(mx + npx * 0.4, my + npy * 0.4, poly)) { npx = -npx; npy = -npy; }
      edges[def.side] = {
        side: def.side, index: i, p0: p0, d: d, n: { x: npx, z: -npy },
        len: len, ang: Math.atan2(d.z, d.x), vertical: Math.abs(P1[0] - P0[0]) < 1e-6
      };
    });
  }

  // effective (clamped) placement of an opening on its wall, without changing stored data
  function fit(o) {
    const e = edges[o.side];
    if (!e) return null;
    if (o.w > e.len - 0.1) return { e: e, ok: false, pos: e.len / 2 };
    const hw = o.w / 2;
    return { e: e, ok: true, pos: Math.max(hw, Math.min(e.len - hw, o.pos)) };
  }
  function effH(o) { return Math.max(0.5, Math.min(o.h, WALL_H - o.sill - 0.05)); }

  function overlaps(side, pos, w, ignoreId) {
    return openings.some(function (o) {
      if (o.id === ignoreId || o.side !== side) return false;
      const f = fit(o);
      return f && f.ok && Math.abs(f.pos - pos) < (o.w + w) / 2 - 0.001;
    });
  }

  // ----------------------------------------------------------- wall pieces
  // Builds the wall of one edge as separate boxes around its openings. Returns false
  // (and builds nothing) when the edge has no usable opening, so app.js falls back to
  // its original single-box wall and nothing changes for plain walls.
  function buildWall(def, group, mat) {
    const e = edges[def.side];
    if (!e) return false;
    const list = openings.map(function (o) { return { o: o, f: fit(o) }; })
      .filter(function (x) { return x.o.side === def.side && x.f && x.f.ok; })
      .sort(function (a, b) { return a.f.pos - b.f.pos; });
    if (!list.length) return false;

    function piece(u0, u1, y0, y1) {
      if (u1 - u0 < 0.005 || y1 - y0 < 0.005) return;
      const uc = (u0 + u1) / 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, y1 - y0, WALL_T), mat);
      m.position.set(e.p0.x + e.d.x * uc, (y0 + y1) / 2, e.p0.z + e.d.z * uc);
      m.rotation.y = -e.ang;
      m.userData.wallExpandDir = def.dir;
      m.userData.wallEdgeSide = def.side;
      group.add(m);
    }
    let cursor = 0;
    list.forEach(function (x) {
      const u0 = x.f.pos - x.o.w / 2, u1 = x.f.pos + x.o.w / 2, top = x.o.sill + effH(x.o);
      if (u0 > cursor) piece(cursor, u0, 0, WALL_H);
      if (top < WALL_H) piece(Math.max(u0, cursor), u1, top, WALL_H);
      if (x.o.sill > 0.005) piece(Math.max(u0, cursor), u1, 0, x.o.sill);
      cursor = Math.max(cursor, u1);
    });
    if (cursor < e.len) piece(cursor, e.len, 0, WALL_H);
    return true;
  }

  // ------------------------------------------------------------- dressing
  function bxm(g, e, id, u, y, v, su, sy, sv, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(su, sy, sv), mat);
    m.position.set(e.p0.x + e.d.x * u + e.n.x * v, y, e.p0.z + e.d.z * u + e.n.z * v);
    m.rotation.y = -e.ang;
    m.castShadow = true;
    m.userData.rsId = id;
    g.add(m);
    return m;
  }
  function knob(g, e, id, u, y) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.52, 12), M().knob);
    m.rotation.order = 'YXZ';
    m.rotation.set(Math.PI / 2, -e.ang, 0);
    m.position.set(e.p0.x + e.d.x * u, y, e.p0.z + e.d.z * u);
    m.userData.rsId = id;
    g.add(m);
  }
  function arcFan(g, e, id, hu, sgnU, sgnV, r) {
    const N = 18, pos = [], line = [];
    function W(u, v) { return new THREE.Vector3(e.p0.x + e.d.x * u + e.n.x * v, 0.05, e.p0.z + e.d.z * u + e.n.z * v); }
    const H = W(hu, 0);
    let prev = null;
    for (let k = 0; k <= N; k++) {
      const phi = (k / N) * Math.PI / 2;
      const P = W(hu + sgnU * r * Math.cos(phi), sgnV * r * Math.sin(phi));
      line.push(P);
      if (prev) pos.push(H.x, H.y, H.z, prev.x, prev.y, prev.z, P.x, P.y, P.z);
      prev = P;
    }
    const fg = new THREE.BufferGeometry();
    (fg.setAttribute || fg.addAttribute).call(fg, 'position', new THREE.Float32BufferAttribute(pos, 3));
    const fan = new THREE.Mesh(fg, M().arc); fan.userData.rsId = id; g.add(fan);
    const lg = new THREE.BufferGeometry().setFromPoints(line.concat([H, line[0]]));
    const ln = new THREE.Line(lg, M().arcLine); ln.userData.rsId = id; g.add(ln);
  }

  function dressOpening(g, o, f) {
    const e = f.e, id = o.id, pos = f.pos, w = o.w, H = effH(o), sill = o.sill;
    const trim = (id === selectedId) ? M().trimSel : M().trim;
    const D = WALL_T + 0.1;

    // trim: two jambs + head (+ sill board for windows)
    const jh = H + TRIM_W, jy = sill + jh / 2 - 0.01;
    const ju = w / 2 - 0.01 + TRIM_W / 2;
    bxm(g, e, id, pos - ju, jy, 0, TRIM_W, jh, D, trim);
    bxm(g, e, id, pos + ju, jy, 0, TRIM_W, jh, D, trim);
    bxm(g, e, id, pos, sill + H + TRIM_W / 2 - 0.01, 0, w + 2 * TRIM_W - 0.02, TRIM_W, D, trim);

    if (o.kind === 'window') {
      bxm(g, e, id, pos, sill - 0.05, 0.1, w + 0.3, 0.1, 0.56, trim);            // inside sill ledge
      // glass + inner frame + bars
      bxm(g, e, id, pos, sill + H / 2, 0, w - 0.1, H - 0.1, 0.05, M().glass);
      const fw = 0.08;
      bxm(g, e, id, pos, sill + fw / 2, 0, w, fw, 0.18, trim);
      bxm(g, e, id, pos, sill + H - fw / 2, 0, w, fw, 0.18, trim);
      bxm(g, e, id, pos - w / 2 + fw / 2, sill + H / 2, 0, fw, H, 0.18, trim);
      bxm(g, e, id, pos + w / 2 - fw / 2, sill + H / 2, 0, fw, H, 0.18, trim);
      bxm(g, e, id, pos, sill + H * 0.5, 0, w, 0.07, 0.14, trim);                // meeting rail
      const bars = Math.max(1, Math.floor(w / 2.4));
      for (let k = 1; k <= bars; k++) bxm(g, e, id, pos - w / 2 + (w * k) / (bars + 1), sill + H / 2, 0, 0.07, H, 0.14, trim);
    } else if (o.kind === 'door') {
      const sgnV = o.swingIn === false ? -1 : 1;
      const leafH = H - 0.04, T = 0.14;
      if (o.double) {
        const lw = w / 2 - 0.03;
        [-1, 1].forEach(function (s) {            // s = -1 left leaf (hinge at start end), +1 right leaf
          const hu = pos + s * w / 2, sgnU = -s;
          bxm(g, e, id, pos + s * (w / 4), leafH / 2, 0, lw, leafH, T, M().door);
          knob(g, e, id, pos + s * 0.35, 3.0);
          arcFan(g, e, id, hu, sgnU, sgnV, w / 2);
        });
      } else {
        const hingeEnd = !!o.hingeEnd, sgnU = hingeEnd ? -1 : 1;
        const hu = pos + (hingeEnd ? w / 2 : -w / 2);
        bxm(g, e, id, pos, leafH / 2, 0, w - 0.06, leafH, T, M().door);
        knob(g, e, id, hu + sgnU * (w - 0.3), 3.0);
        arcFan(g, e, id, hu, sgnU, sgnV, w);
      }
    }
  }

  // Called once after all wall boxes are built.
  function finishWalls(group) {
    disposeDress();
    const valid = openings.map(function (o) { return { o: o, f: fit(o) }; }).filter(function (x) { return x.f && x.f.ok; });
    if (!valid.length) return;
    dress = new THREE.Group();
    dress.name = 'Wall Openings';
    valid.forEach(function (x) { dressOpening(dress, x.o, x.f); });
    group.add(dress);
  }

  // --------------------------------------------------------- data / state
  function rebuild() { if (typeof rebuildPerimeterWalls === 'function') rebuildPerimeterWalls(); renderPanel(); }
  function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }

  function serialize() {
    return openings.map(function (o) {
      return { preset: o.preset, kind: o.kind, side: o.side, pos: Math.round(o.pos * 100) / 100, w: o.w, h: o.h, sill: o.sill,
               swingIn: o.swingIn !== false, hingeEnd: !!o.hingeEnd, double: !!o.double };
    });
  }
  function load(arr) {
    openings = []; nextId = 1; selectedId = null;
    if (Array.isArray(arr)) arr.forEach(function (s) {
      if (!s || typeof s.side !== 'string') return;
      const kind = (s.kind === 'window' || s.kind === 'opening') ? s.kind : 'door';
      openings.push({
        id: nextId++, preset: PRESETS[s.preset] ? s.preset : kind, kind: kind, side: s.side,
        pos: num(s.pos, 3), w: Math.max(1, Math.min(30, num(s.w, 3))), h: Math.max(1, Math.min(WALL_H, num(s.h, 6.67))),
        sill: Math.max(0, Math.min(WALL_H - 1, num(s.sill, 0))), swingIn: s.swingIn !== false, hingeEnd: !!s.hingeEnd, double: !!s.double
      });
    });
    stopPlacing();
    renderPanel();
  }
  function clear() { load([]); }

  // facility contents were shifted (room grew west / south): keep openings with the contents
  function shift(dx, dy) {
    if (!isRect()) return;     // freeform outlines move their own points, openings follow the edge
    openings.forEach(function (o) {
      if (o.side === 'north' || o.side === 'south') o.pos += dx;
      else if (o.side === 'west' || o.side === 'east') o.pos += dy;
    });
  }

  // -------------------------------------------------------------- placing
  const rc = new THREE.Raycaster(), pv = new THREE.Vector2();
  function castFrom(e) {
    const r = renderer.domElement.getBoundingClientRect();
    pv.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(pv, activeCam);
    return rc;
  }
  function nearestEdge(pt) {
    let best = null, bestD = 3;
    Object.keys(edges).forEach(function (k) {
      const e = edges[k];
      const u = (pt.x - e.p0.x) * e.d.x + (pt.z - e.p0.z) * e.d.z;
      if (u < -1 || u > e.len + 1) return;
      const dist = Math.abs((pt.x - e.p0.x) * -e.d.z + (pt.z - e.p0.z) * e.d.x);
      if (dist < bestD) { bestD = dist; best = k; }
    });
    return best;
  }
  function evalAt(ev) {
    const p = PRESETS[placing];
    if (!p || typeof wallsGroup === 'undefined' || !wallsGroup.visible) return null;
    const r = castFrom(ev);
    const targets = wallsGroup.children.filter(function (c) { return c.userData && c.userData.wallEdgeSide; });
    const hit = r.intersectObjects(targets, false)[0];
    let pt = null, side = null;
    if (hit) { pt = hit.point; side = hit.object.userData.wallEdgeSide; }
    else {
      const v = new THREE.Vector3();
      if (r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -4), v)) { pt = v; side = nearestEdge(v); }
    }
    const e = side && edges[side];
    if (!pt || !e) return null;
    const u = (pt.x - e.p0.x) * e.d.x + (pt.z - e.p0.z) * e.d.z;
    const step = ev.shiftKey ? 0.1 : 0.5, hw = p.w / 2;
    const fits = e.len >= p.w + 0.1;
    const pos = fits ? Math.max(hw, Math.min(e.len - hw, Math.round(u / step) * step)) : e.len / 2;
    return { e: e, side: side, pos: pos, ok: fits && !overlaps(side, pos, p.w, null), preset: placing };
  }

  function showGhost(ev) {
    lastEval = evalAt(ev);
    if (!ghost) return;
    if (!lastEval) { ghost.visible = false; return; }
    const p = PRESETS[placing], e = lastEval.e, H = Math.min(p.h, WALL_H - p.sill - 0.05);
    ghost.visible = true;
    ghost.material = lastEval.ok ? M().ghostOk : M().ghostBad;
    ghost.scale.set(p.w, H, WALL_T + 0.25);
    ghost.position.set(e.p0.x + e.d.x * lastEval.pos, p.sill + H / 2, e.p0.z + e.d.z * lastEval.pos);
    ghost.rotation.y = -e.ang;
  }

  function setHint(text) {
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9999;padding:8px 14px;border-radius:10px;' +
        'background:rgba(15,23,42,.92);color:#e2e8f0;font:600 13px system-ui,sans-serif;border:1px solid rgba(56,189,248,.6);pointer-events:none;';
      document.body.appendChild(hintEl);
    }
    hintEl.textContent = text; hintEl.style.display = text ? 'block' : 'none';
  }

  function startPlacing(key) {
    if (!PRESETS[key]) return;
    stopPlacing();
    placing = key; lastEval = null;
    if (typeof closeFolderDrawer === 'function') { try { closeFolderDrawer(); } catch (err) { /* ignore */ } }
    ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M().ghostOk);
    ghost.visible = false; ghost.renderOrder = 5;
    scene.add(ghost);
    renderer.domElement.style.cursor = 'crosshair';
    setHint('Click a wall to place the ' + PRESETS[key].label + '  ·  Shift = fine snap  ·  Esc to cancel');
    renderPanel();
  }
  function stopPlacing() {
    if (ghost) { scene.remove(ghost); ghost.geometry.dispose(); ghost = null; }
    if (placing && typeof renderer !== 'undefined') renderer.domElement.style.cursor = '';
    placing = null; lastEval = null;
    if (hintEl) hintEl.style.display = 'none';
    renderPanel();
  }

  function addOpening(key, side, pos) {
    const p = PRESETS[key];
    const o = { id: nextId++, preset: key, kind: p.kind, side: side, pos: pos, w: p.w, h: p.h, sill: p.sill,
                swingIn: true, hingeEnd: false, double: !!p.double };
    openings.push(o); selectedId = o.id;
    return o;
  }

  // ---- document-level capture listeners (they run before the app's own canvas handlers)
  function onCanvas(e) { return typeof renderer !== 'undefined' && e.target === renderer.domElement; }
  let downAt = null;
  document.addEventListener('pointermove', function (e) {
    if (placing && onCanvas(e)) showGhost(e);
  }, true);
  document.addEventListener('pointerdown', function (e) {
    if (!onCanvas(e)) return;
    if (placing) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;     // right/middle button still orbits
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      showGhost(e);
      if (lastEval && lastEval.ok) {
        addOpening(placing, lastEval.side, lastEval.pos);
        if (!e.shiftKey) stopPlacing();
        rebuild();
      } else {
        setHint(lastEval ? 'That spot is taken or the wall is too short' : 'Click directly on a wall');
      }
      return;
    }
    if (e.button === 0 || e.pointerType !== 'mouse') downAt = { x: e.clientX, y: e.clientY };
  }, true);
  document.addEventListener('pointerup', function (e) {
    const start = downAt; downAt = null;
    if (!start || placing || !onCanvas(e) || !dress || !wallsGroup.visible) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;      // a drag, not a click
    const hits = castFrom(e).intersectObject(dress, true).filter(function (h) { return h.object.userData.rsId; });
    if (hits.length) { selectedId = hits[0].object.userData.rsId; rebuild(); }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && placing) { stopPlacing(); }
  }, true);
  document.addEventListener('projectmodechange', function () { stopPlacing(); });

  // ----------------------------------------------------------------- panel
  function wallLabel(side) {
    const m = { west: 'West wall', east: 'East wall', north: 'North wall', south: 'South wall' };
    if (m[side]) return m[side];
    const mm = /^edge(\d+)$/.exec(side);
    return mm ? 'Wall ' + (parseInt(mm[1], 10) + 1) : side;
  }
  function $(id) { return document.getElementById(id); }
  function sel() { return openings.find(function (o) { return o.id === selectedId; }) || null; }
  function r1(v) { return Math.round(v * 10) / 10; }

  function renderPanel() {
    const list = $('rs-list'), ed = $('rs-editor');
    if (!list || !ed) return;
    document.querySelectorAll('#rs-presets button[data-preset]').forEach(function (b) {
      b.classList.toggle('btn-amber', b.dataset.preset === placing);
    });
    if (!openings.length) {
      list.innerHTML = '<div style="font-size:11px;color:#94a3b8;">No doors or windows yet.</div>';
    } else {
      list.innerHTML = openings.map(function (o) {
        const f = fit(o), bad = !f || !f.ok;
        const note = !edges[o.side] ? ' · wall removed' : (bad ? ' · wall too short' : '');
        return '<button type="button" data-sel="' + o.id + '" class="' + (o.id === selectedId ? 'btn-amber' : '') + '" ' +
          'style="display:block;width:100%;text-align:left;margin-bottom:3px;font-size:11px;">' +
          (PRESETS[o.preset] ? PRESETS[o.preset].icon + ' ' + PRESETS[o.preset].label : o.kind) +
          ' · ' + wallLabel(o.side) + ' · ' + r1(o.pos) + '′' + note + '</button>';
      }).join('');
    }
    const o = sel();
    if (!o) { ed.innerHTML = ''; return; }
    const e = edges[o.side], from = e && e.vertical ? 'south' : 'west';
    const isDoor = o.kind === 'door';
    ed.innerHTML =
      '<div style="font-size:11px;color:#cbd5e1;font-weight:700;margin:6px 0 4px;">' + wallLabel(o.side) + ' — distance from ' + from + ' end to centre</div>' +
      '<div class="btn-row" style="align-items:center;gap:4px;">' +
        '<button type="button" data-nudge="-0.5" title="Toward the ' + from + ' end">◀ 0.5′</button>' +
        '<input type="number" data-f="pos" value="' + r1(o.pos) + '" step="0.1" style="width:62px;">' +
        '<button type="button" data-nudge="0.5" title="Away from the ' + from + ' end">0.5′ ▶</button>' +
      '</div>' +
      '<div class="btn-row" style="align-items:center;gap:6px;margin-top:6px;font-size:11px;">' +
        '<label>Width <input type="number" data-f="w" value="' + r1(o.w) + '" step="0.5" min="1" style="width:54px;"></label>' +
        '<label>Height <input type="number" data-f="h" value="' + r1(o.h) + '" step="0.5" min="1" style="width:54px;"></label>' +
        (o.kind === 'window' ? '<label>Sill <input type="number" data-f="sill" value="' + r1(o.sill) + '" step="0.5" min="0" style="width:54px;"></label>' : '') +
      '</div>' +
      '<div class="btn-row" style="margin-top:6px;">' +
        (isDoor ? '<button type="button" data-act="swing">Swing: ' + (o.swingIn !== false ? 'into room' : 'outward') + '</button>' : '') +
        (isDoor && !o.double ? '<button type="button" data-act="hinge">Flip hinge</button>' : '') +
        '<button type="button" class="btn-danger" data-act="delete">Delete</button>' +
      '</div>';
  }

  function applyField(o, field, value) {
    const old = { pos: o.pos, w: o.w, h: o.h, sill: o.sill };
    if (field === 'pos') o.pos = value;
    if (field === 'w') o.w = Math.max(1, Math.min(30, value));
    if (field === 'h') o.h = Math.max(1, Math.min(WALL_H - o.sill - 0.05, value));
    if (field === 'sill') { o.sill = Math.max(0, Math.min(WALL_H - 1, value)); o.h = Math.min(o.h, WALL_H - o.sill - 0.05); }
    const f = fit(o);
    if (f && f.ok) { o.pos = f.pos; if (overlaps(o.side, o.pos, o.w, o.id)) { Object.assign(o, old); } }
    else if (f) { Object.assign(o, old); }
    rebuild();
  }

  function wire() {
    const card = $('rs-card');
    if (!card || card.dataset.wired) return;
    card.dataset.wired = '1';
    card.addEventListener('click', function (ev) {
      const t = ev.target.closest('button'); if (!t) return;
      if (t.dataset.preset) { if (placing === t.dataset.preset) stopPlacing(); else startPlacing(t.dataset.preset); return; }
      if (t.dataset.sel) { selectedId = parseInt(t.dataset.sel, 10); rebuild(); return; }
      const o = sel(); if (!o) return;
      if (t.dataset.nudge) { applyField(o, 'pos', o.pos + parseFloat(t.dataset.nudge)); return; }
      if (t.dataset.act === 'swing') { o.swingIn = o.swingIn === false; rebuild(); }
      else if (t.dataset.act === 'hinge') { o.hingeEnd = !o.hingeEnd; rebuild(); }
      else if (t.dataset.act === 'delete') { openings = openings.filter(function (x) { return x.id !== o.id; }); selectedId = null; rebuild(); }
    });
    card.addEventListener('change', function (ev) {
      const t = ev.target; if (!t.dataset || !t.dataset.f) return;
      const o = sel(); if (!o) return;
      const v = parseFloat(t.value);
      if (Number.isFinite(v)) applyField(o, t.dataset.f, v); else renderPanel();
    });
    renderPanel();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  return {
    PRESETS: PRESETS,
    setEdges: setEdges, buildWall: buildWall, finishWalls: finishWalls,
    serialize: serialize, load: load, clear: clear, shift: shift,
    isPlacing: function () { return !!placing; },
    count: function () { return openings.length; }
  };
})();
