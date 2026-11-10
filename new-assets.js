/* ============================================================================
   NEW ASSETS for Layout Design Studio  (drop-in, does not modify existing code)

   Types added:
     'oildrum'        55-gal open-head steel drum, no lid, empty inside
     'spotwelder'     Floor-standing press-type industrial spot welder
     'weldcurtain'    Mobile translucent weld curtain (colour = curtain only)
     'downdrafttable' Donaldson Torit style downdraft workstation
     'forklift'       Toyota 8FGU25-class sit-down LP (propane) forklift

   Conventions copied from buildBinMesh():
     - feet, Y up, group centred on its X/Z footprint, floor at y = 0
     - MeshStandardMaterial only; box/cylinder construction; castShadow on
     - colorHex drives the asset's main painted body colour
     - "front" (operator / fork side) faces +Z, same as the large bin's front gate
     - contact shadow, CAD wire box and corner resize handles are added here,
       exactly like the end of buildBinMesh(), so selection behaves the same

   See the INTEGRATION block at the bottom for the 6 small hook-ups.
   ============================================================================ */

var NewAssets = (function () {
  'use strict';

  // ------------------------------------------------------------------ specs
  // w / l = default footprint (ft), h = natural height (ft), color = default paint
  const SPECS = {
    oildrum:        { w: 1.95, l: 1.95,  h: 2.875, color: '#1e4fa3', name: 'Bin',      icon: '🛢️', tile: 'Bin' },
    spotwelder:     { w: 2.6, l: 4.2,  h: 6.0,   color: '#7f95ab', name: 'Industrial Spot Welder',          icon: '', tile: 'Spot Welder' },
    weldcurtain:    { w: 6.5, l: 2.0,  h: 6.5,   color: '#f97316', name: 'Mobile Weld Curtain',             icon: '🛡️', tile: 'Weld Curtain' },
    downdrafttable: { w: 6.0, l: 3.5,  h: 4.0,   color: '#d3d7dc', name: 'Donaldson Downdraft Table',       icon: '🌬️', tile: 'Downdraft Table' },
    forklift:       { w: 3.8, l: 12.2, h: 7.1,   color: '#f26b1d', name: 'Toyota LP Forklift (Sit-Down)',   icon: '🚜', tile: 'Forklift' },
    fusebox:        { w: 2.5, l: 1.8,  h: 6.0,   color: '#6b7280', name: 'Electrical Fuse Box Cabinet',    icon: '🔌', tile: 'Fuse Box' },
    paintbooth:     { w: 12.0, l: 10.0, h: 9.0,  color: '#e5e7eb', name: 'Semi-Enclosed Paint Booth',     icon: '', tile: 'Paint Booth' },
    brakepress:     { w: 14.0, l: 6.5,  h: 9.5,  color: '#1e3a5f', name: '400-Ton Industrial Brake Press', icon: '🏭', tile: 'Brake Press' },
    gantrycrane:    { w: 20.0, l: 12.0, h: 14.0, color: '#f59e0b', name: 'Gantry Crane',                  icon: '🏗️', tile: 'Gantry Crane' }
  };

  // ---------------------------------------------------------------- helpers
  function mat(color, rough, metal, extra) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough, metalness: metal }, extra || {}));
  }
  function place(g, mesh, x, y, z) {
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
  }
  // Box: centre X/Z, BOTTOM y0, sizes sx/sy/sz
  function bx(g, cx, y0, cz, sx, sy, sz, m) {
    return place(g, new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m), cx, y0 + sy / 2, cz);
  }
  // Cylinder: centre (cx,cyc,cz), axis 'x' | 'y' | 'z'
  function cyl(g, cx, cyc, cz, rTop, rBot, h, m, axis, seg) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg || 20), m);
    if (axis === 'x') mesh.rotation.z = Math.PI / 2; else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    return place(g, mesh, cx, cyc, cz);
  }
  function tube(g, pts, r, m, seg) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, seg || 28, r, 8, false), m);
    mesh.castShadow = true; g.add(mesh); return mesh;
  }
  // Side-profile (z,y) polygon extruded across X, centred on x = 0
  function extrudeSide(pts, widthX, m) {
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1])));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: widthX, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2); geo.translate(widthX / 2, 0, 0);
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }
  // Printed plate (falls back to a plain coloured plate if no DOM canvas)
  function labelMat(text, bg, fg, pxW, pxH, fontPx) {
    if (typeof document === 'undefined') return mat(bg, 0.5, 0.1);
    try {
      const c = document.createElement('canvas'); c.width = pxW; c.height = pxH;
      const x = c.getContext('2d');
      x.fillStyle = bg; x.fillRect(0, 0, pxW, pxH);
      x.fillStyle = fg; x.font = 'bold ' + fontPx + 'px Arial, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, pxW / 2, pxH / 2);
      return new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.5, metalness: 0.1 });
    } catch (e) { return mat(bg, 0.5, 0.1); }
  }

  // ============================================================ 55 GAL DRUM
  // Steel open-head drum: 22.5 in dia x 34.5 in tall. No lid, empty inside:
  // rolled top bead, two rolling hoops, bottom chime, visible inner floor.
  function buildDrum(g, wFt, lFt, color) {
    const R = Math.min(wFt, lFt) * 0.48;
    const H = SPECS.oildrum.h;
    const s = R / 0.9375;                       // scale details if footprint is resized
    const paint = mat(color, 0.4, 0.55, { side: THREE.DoubleSide });
    const inside = mat(0x4a5058, 0.55, 0.6, { side: THREE.DoubleSide });
    const hoop = (arr, y) => {
      arr.push(new THREE.Vector2(R, y - 0.09 * s), new THREE.Vector2(R * 1.018, y - 0.05 * s),
               new THREE.Vector2(R * 1.026, y), new THREE.Vector2(R * 1.018, y + 0.05 * s),
               new THREE.Vector2(R, y + 0.09 * s));
    };
    const out = [];
    out.push(new THREE.Vector2(0.001, 0), new THREE.Vector2(R * 0.94, 0), new THREE.Vector2(R * 0.985, 0.03 * s),
             new THREE.Vector2(R, 0.07 * s));
    hoop(out, H * 0.31); hoop(out, H * 0.69);
    out.push(new THREE.Vector2(R, H - 0.09 * s), new THREE.Vector2(R * 1.016, H - 0.03 * s),   // rolled bead
             new THREE.Vector2(R * 1.012, H - 0.004 * s), new THREE.Vector2(R * 0.995, H + 0.008 * s),
             new THREE.Vector2(R * 0.978, H - 0.004 * s), new THREE.Vector2(R * 0.972, H - 0.03 * s),
             new THREE.Vector2(R * 0.968, H - 0.08 * s));
    place(g, new THREE.Mesh(new THREE.LatheGeometry(out, 56), paint), 0, 0, 0);
    // Inner wall and floor (separate material so the empty interior reads as bare steel)
    const inn = [new THREE.Vector2(R * 0.968, H - 0.08 * s), new THREE.Vector2(R * 0.966, 0.14 * s),
                 new THREE.Vector2(R * 0.93, 0.10 * s), new THREE.Vector2(R * 0.9, 0.085 * s),
                 new THREE.Vector2(0.001, 0.085 * s)];
    place(g, new THREE.Mesh(new THREE.LatheGeometry(inn, 56), inside), 0, 0, 0);
  }

  // =========================================================== SPOT WELDER
  // Floor-standing press-type spot welder: cabinet + transformer head, upper arm
  // with air cylinder, lower horn, copper electrodes, water hoses, control panel,
  // e-stop and guarded foot pedal. Operator side = +Z.
  function buildSpotWelder(g, wFt, lFt, color) {
    const body = mat(color, 0.5, 0.35), bodyDark = mat(0x2f353d, 0.6, 0.4), panel = mat(0x1f2937, 0.5, 0.3);
    const armMat = mat(0x9aa3ad, 0.35, 0.75), copper = mat(0xb87333, 0.28, 0.9), silver = mat(0xd1d5db, 0.28, 0.85);
    const black = mat(0x15181c, 0.6, 0.3), yellow = mat(0xfacc15, 0.45, 0.25), red = mat(0xdc2626, 0.4, 0.2);
    const blueHose = mat(0x2563eb, 0.5, 0.1), redHose = mat(0xdc2626, 0.5, 0.1);
    const screen = mat(0x16a34a, 0.3, 0.1, { emissive: 0x14532d, emissiveIntensity: 0.9 });

    const cw = wFt * 0.9, cd = Math.min(2.0, lFt * 0.46);
    const zc = -lFt / 2 + cd / 2 + 0.05, zFront = zc + cd / 2;

    bx(g, 0, 0, zc, cw + 0.06, 0.18, cd + 0.06, bodyDark);              // plinth
    bx(g, 0, 0.18, zc, cw, 2.97, cd, body);                               // cabinet
    bx(g, 0, 3.15, zc, cw + 0.03, 0.04, cd + 0.03, bodyDark);             // top cap
    // Side ventilation slots
    [-1, 1].forEach(sx => { for (let i = 0; i < 7; i++) bx(g, sx * (cw / 2 + 0.006), 0.9 + i * 0.1, zc, 0.012, 0.04, cd * 0.55, black); });
    // Door seam and handle
    bx(g, cw * 0.12, 0.35, zFront + 0.002, 0.012, 2.5, 0.012, black);
    cyl(g, cw * 0.4, 1.4, zFront + 0.05, 0.02, 0.02, 0.45, silver, 'y', 10);

    // Transformer head
    const headW = cw * 0.8, headD = cd * 0.82, headZ = zc - cd * 0.06, headFront = headZ + headD / 2;
    bx(g, 0, 3.19, headZ, headW, 2.41, headD, body);
    bx(g, 0, 5.6, headZ, headW + 0.04, 0.05, headD + 0.04, bodyDark);

    // Arms
    const tipZ = Math.min(lFt / 2 - 0.5, headFront + 2.2);
    const upLen = Math.max(0.8, tipZ - headFront + 0.3);
    bx(g, 0, 4.4, headFront + upLen / 2, 0.30, 0.42, upLen, armMat);        // upper arm
    const lowLen = Math.max(0.6, tipZ + 0.3 - zFront);
    bx(g, 0, 2.75, zFront - 0.02 + lowLen / 2, 0.30, 0.35, lowLen, armMat); // lower arm / horn
    // Electrodes (gap about 0.32 ft)
    cyl(g, 0, 4.2, tipZ, 0.09, 0.11, 0.40, copper, 'y');
    cyl(g, 0, 3.89, tipZ, 0.065, 0.035, 0.22, copper, 'y');
    cyl(g, 0, 3.21, tipZ, 0.10, 0.11, 0.22, copper, 'y');
    cyl(g, 0, 3.39, tipZ, 0.035, 0.065, 0.14, copper, 'y');
    // Air cylinder and rod
    bx(g, 0, 4.82, tipZ, 0.36, 0.08, 0.40, bodyDark);
    cyl(g, 0, 5.30, tipZ, 0.17, 0.17, 0.80, silver, 'y', 24);
    cyl(g, 0, 5.74, tipZ, 0.19, 0.19, 0.08, black, 'y', 24);
    cyl(g, 0, 4.88, tipZ, 0.19, 0.19, 0.08, black, 'y', 24);
    cyl(g, 0, 4.62, tipZ, 0.04, 0.04, 0.45, silver, 'y', 12);
    cyl(g, 0.12, 5.80, tipZ, 0.03, 0.03, 0.08, silver, 'y', 8);
    tube(g, [[0.2, 5.62, headZ], [0.25, 5.95, headZ + 0.4], [0.12, 5.95, tipZ - 0.3], [0.12, 5.82, tipZ]], 0.022, black);
    // Water hoses (blue supply / red return) to upper and lower electrodes
    tube(g, [[0.17, 5.2, headFront], [0.2, 5.0, headFront + 0.3], [0.19, 4.95, tipZ - 0.2], [0.13, 4.5, tipZ - 0.04], [0.09, 4.25, tipZ]], 0.024, blueHose);
    tube(g, [[-0.17, 5.2, headFront], [-0.2, 5.0, headFront + 0.3], [-0.19, 4.95, tipZ - 0.2], [-0.13, 4.5, tipZ - 0.04], [-0.09, 4.25, tipZ]], 0.024, redHose);
    tube(g, [[0.1, 2.5, zFront], [0.2, 2.95, zFront + 0.4], [0.12, 3.25, tipZ - 0.05]], 0.024, blueHose);
    tube(g, [[-0.1, 2.5, zFront], [-0.2, 2.95, zFront + 0.4], [-0.12, 3.25, tipZ - 0.05]], 0.024, redHose);

    // Control panel, display, knobs, e-stop
    const px = -cw * 0.2, pw = cw * 0.5;
    bx(g, px, 1.7, zFront + 0.06, pw, 0.95, 0.12, panel);
    bx(g, px - pw * 0.18, 2.25, zFront + 0.125, 0.4, 0.2, 0.01, screen);
    [-0.2, 0.05, 0.3].forEach(dx => cyl(g, px + dx, 1.9, zFront + 0.15, 0.06, 0.06, 0.06, silver, 'z', 16));
    cyl(g, px + pw * 0.32, 2.2, zFront + 0.13, 0.11, 0.11, 0.04, yellow, 'z', 20);
    cyl(g, px + pw * 0.32, 2.2, zFront + 0.17, 0.08, 0.08, 0.07, red, 'z', 20);
    cyl(g, px + pw * 0.32, 1.85, zFront + 0.13, 0.03, 0.03, 0.05, mat(0x22c55e, 0.4, 0.1, { emissive: 0x15803d, emissiveIntensity: 0.6 }), 'z', 12);

    // Guarded foot pedal with cable
    const fx = 0.6, fz = lFt / 2 - 0.5;
    bx(g, fx, 0, fz, 0.7, 0.1, 0.85, bodyDark);
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.65), black);
    pedal.rotation.x = -0.35; place(g, pedal, fx, 0.2, fz + 0.05);
    [-1, 1].forEach(sx => bx(g, fx + sx * 0.31, 0.1, fz, 0.04, 0.28, 0.8, yellow));
    bx(g, fx, 0.34, fz - 0.15, 0.66, 0.04, 0.5, yellow);
    tube(g, [[fx - 0.3, 0.16, fz - 0.3], [fx - 0.7, 0.09, fz - 1.1], [cw * 0.3, 0.09, zFront + 0.4], [cw * 0.3, 0.35, zFront + 0.03]], 0.025, black);
  }

  // ========================================================= WELD CURTAIN
  // Mobile H-base frame on locking casters. ONLY the curtain panels use colorHex;
  // the stand is fixed dark steel. Panels are translucent (opacity editable via
  // assetSettings.curtainOpacity, default 0.5).
  function buildWeldCurtain(g, wFt, lFt, color, opts) {
    const H = SPECS.weldcurtain.h;
    const steel = mat(0x4b535c, 0.45, 0.7), blk = mat(0x15181c, 0.7, 0.2), redM = mat(0xdc2626, 0.5, 0.2);
    const opa = Math.min(0.95, Math.max(0.15, Number(opts && opts.curtainOpacity) || 0.5));
    const cMat = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: opa, roughness: 0.28, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const cEdge = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: Math.min(0.95, opa + 0.38), roughness: 0.45, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const px = wFt / 2 - 0.12, footL = lFt * 0.94;

    // H-base: two foot rails + cross tube, casters at the four corners
    [-1, 1].forEach(sx => bx(g, sx * px, 0.2, 0, 0.12, 0.12, footL, steel));
    bx(g, 0, 0.2, 0, 2 * px, 0.1, 0.1, steel);
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
      const z = sz * (footL / 2 - 0.14);
      bx(g, sx * px, 0.2, z, 0.16, 0.03, 0.2, blk);
      bx(g, sx * px, 0.06, z, 0.05, 0.14, 0.12, blk);
      cyl(g, sx * px, 0.075, z, 0.075, 0.075, 0.05, blk, 'x', 16);
      if (sz < 0) bx(g, sx * px + 0.06, 0.11, z, 0.03, 0.03, 0.14, redM);   // brake lever
    }));
    // Uprights, finials, top rail
    const upH = H - 0.30;
    [-1, 1].forEach(sx => {
      cyl(g, sx * px, 0.26 + upH / 2, 0, 0.055, 0.055, upH, steel, 'y', 14);
      place(g, new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), steel), sx * px, H - 0.075, 0);
    });
    cyl(g, 0, H - 0.12, 0, 0.045, 0.045, 2 * px, steel, 'x', 14);
    // Hanging rings
    const nRing = Math.max(3, Math.floor((2 * px - 0.4) / 0.55) + 1);
    for (let i = 0; i < nRing; i++) {
      const x = -px + 0.25 + i * ((2 * px - 0.5) / (nRing - 1));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 16), steel);
      ring.rotation.y = Math.PI / 2; ring.castShadow = true; ring.position.set(x, H - 0.12, 0); g.add(ring);
    }
    // Curtain: header band, main translucent panel, bottom hem, pleat seams
    const cwid = 2 * (px - 0.1), yBot = 0.85, hemH = 0.28, hdrH = 0.42, yTop = H - 0.17;
    const mainBot = yBot + hemH, mainH = (yTop - hdrH) - mainBot;
    const soft = m => { m.castShadow = false; return m; };
    soft(bx(g, 0, yTop - hdrH, 0, cwid, hdrH, 0.02, cEdge));
    soft(bx(g, 0, mainBot, 0, cwid, mainH, 0.014, cMat));
    soft(bx(g, 0, yBot, 0, cwid, hemH, 0.02, cEdge));
    [-cwid / 4, 0, cwid / 4].forEach(x => soft(bx(g, x, mainBot, 0, 0.02, mainH, 0.024, cEdge)));
    const nGr = Math.max(4, Math.floor(cwid / 0.55));
    for (let i = 0; i < nGr; i++) {
      const x = -cwid / 2 + 0.2 + i * ((cwid - 0.4) / (nGr - 1));
      cyl(g, x, yTop - hdrH / 2, 0, 0.025, 0.025, 0.035, blk, 'z', 10);
    }
  }

  // ===================================================== DOWNDRAFT TABLE
  // Donaldson Torit DownFlo-style workstation: slotted grate work surface over a
  // filter plenum, access doors, optional rear backdraft panel, motor/fan module
  // with exhaust grille, start/stop controls and a differential-pressure gauge.
  // Back = -Z, operator = +Z, fan module on the right (+X).
  function buildDowndraftTable(g, wFt, lFt, color, opts) {
    const body = mat(color, 0.55, 0.25), bodyDark = mat(0x3b4048, 0.6, 0.4), grate = mat(0x4a5058, 0.45, 0.75);
    const black = mat(0x14171b, 0.7, 0.3), blue = mat(0x1d5fa8, 0.5, 0.25), silver = mat(0xcfd4da, 0.3, 0.85);
    const filt = mat(0xe3dcc8, 0.9, 0.0), white = mat(0xf8fafc, 0.4, 0.1);
    const green = mat(0x16a34a, 0.4, 0.1, { emissive: 0x15803d, emissiveIntensity: 0.5 });
    const red = mat(0xdc2626, 0.4, 0.1, { emissive: 0x991b1b, emissiveIntensity: 0.4 });
    const surfY = 2.85;
    const motorW = Math.min(1.15, wFt * 0.2), tableW = wFt - motorW;
    const x0 = -wFt / 2, tCx = x0 + tableW / 2, mCx = wFt / 2 - motorW / 2;
    const zB = -lFt / 2, zF = lFt / 2 - 0.15, D = zF - zB, zM = (zF + zB) / 2;

    // Plinth and leveling feet
    bx(g, 0, 0.06, zM, wFt - 0.12, 0.14, D - 0.12, black);
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => cyl(g, sx * (wFt / 2 - 0.2), 0.03, sz * (lFt / 2 - 0.2), 0.08, 0.08, 0.06, black, 'y', 12)));

    // Filter plenum shell (open top, grate sits on it)
    const wallH = surfY - 0.12 - 0.2;
    bx(g, tCx, 0.2, zF - 0.03, tableW, wallH, 0.06, body);
    bx(g, tCx, 0.2, zB + 0.03, tableW, wallH, 0.06, body);
    bx(g, x0 + 0.03, 0.2, zM, 0.06, wallH, D - 0.06, body);
    bx(g, x0 + tableW, 0.2, zM, 0.06, wallH, D - 0.06, body);
    bx(g, tCx, 0.2, zM, tableW - 0.06, 0.05, D - 0.12, bodyDark);
    // Two cartridge filters visible down through the slots
    [-1, 1].forEach(s => {
      const fx = tCx + s * tableW * 0.22;
      cyl(g, fx, 1.3, zM, 0.5, 0.5, 2.0, filt, 'y', 24);
      cyl(g, fx, 2.32, zM, 0.52, 0.52, 0.05, bodyDark, 'y', 24);
    });
    // Front access doors, handles, louvers
    [-1, 1].forEach(s => {
      const dx = tCx + s * tableW * 0.25;
      bx(g, dx, 0.28, zF + 0.012, tableW * 0.48, 2.3, 0.025, body);
      cyl(g, dx - s * tableW * 0.18, 1.4, zF + 0.065, 0.02, 0.02, 0.5, silver, 'y', 10);
      for (let i = 0; i < 4; i++) bx(g, dx, 0.42 + i * 0.1, zF + 0.028, tableW * 0.3, 0.03, 0.012, black);
    });
    bx(g, tCx, 0.28, zF + 0.01, 0.02, 2.3, 0.03, black);
    bx(g, tCx, 2.6, zF + 0.026, tableW, 0.12, 0.012, blue);                 // brand-blue accent band

    // Work surface: rim + slotted grate (bars run front-to-back)
    bx(g, x0 + 0.07, 2.73, zM, 0.14, 0.12, D - 0.04, body);
    bx(g, x0 + tableW - 0.07, 2.73, zM, 0.14, 0.12, D - 0.04, body);
    bx(g, tCx, 2.73, zF - 0.07, tableW, 0.12, 0.14, body);
    bx(g, tCx, 2.73, zB + 0.07, tableW, 0.12, 0.14, body);
    const gx0 = x0 + 0.14, gx1 = x0 + tableW - 0.14, gz0 = zB + 0.14, gz1 = zF - 0.14;
    const pitch = Math.max(0.12, (gx1 - gx0) / 110), nBar = Math.floor((gx1 - gx0) / pitch);
    for (let i = 0; i < nBar; i++) bx(g, gx0 + pitch * (i + 0.5), 2.75, (gz0 + gz1) / 2, 0.05, 0.10, gz1 - gz0, grate);
    [0.25, 0.5, 0.75].forEach(f => bx(g, (gx0 + gx1) / 2, 2.73, gz0 + (gz1 - gz0) * f, gx1 - gx0, 0.04, 0.05, grate));

    // Rear backdraft panel (turn off with assetSettings.downdraftBackguard = false)
    if (!opts || opts.downdraftBackguard !== false) {
      bx(g, tCx, 2.85, zB + 0.07, tableW, 1.10, 0.14, body);
      bx(g, tCx, 3.95, zB + 0.09, tableW + 0.04, 0.04, 0.18, bodyDark);
      const nSlot = Math.max(2, Math.floor(tableW / 0.7));
      [3.2, 3.55].forEach(y => { for (let i = 0; i < nSlot; i++) bx(g, x0 + (i + 0.5) * (tableW / nSlot), y, zB + 0.145, 0.5, 0.07, 0.012, black); });
    }

    // Motor / fan module
    bx(g, mCx, 0.2, zM, motorW, 3.1, D - 0.08, body);
    bx(g, mCx, 3.3, zM, motorW + 0.02, 0.05, D - 0.04, bodyDark);
    for (let i = 0; i < 6; i++) bx(g, mCx, 3.35, zM - D * 0.3 + i * (D * 0.6 / 5), motorW * 0.7, 0.03, 0.07, black);   // exhaust grille
    for (let i = 0; i < 8; i++) bx(g, mCx, 0.5 + i * 0.1, zF + 0.004, motorW * 0.7, 0.035, 0.02, black);               // intake louvers
    bx(g, mCx, 1.45, zF + 0.01, motorW * 0.8, 0.28, 0.012, labelMat('DONALDSON', '#1d5fa8', '#ffffff', 256, 64, 30));
    // Controls and DP gauge
    bx(g, mCx, 1.95, zF + 0.05, Math.min(0.85, motorW * 0.85), 1.05, 0.1, bodyDark);
    cyl(g, mCx, 2.65, zF + 0.11, 0.17, 0.17, 0.04, white, 'z', 28);
    bx(g, mCx + 0.03, 2.65, zF + 0.135, 0.1, 0.012, 0.008, black);
    cyl(g, mCx - 0.18, 2.2, zF + 0.11, 0.07, 0.07, 0.06, green, 'z', 16);
    cyl(g, mCx + 0.18, 2.2, zF + 0.11, 0.07, 0.07, 0.06, red, 'z', 16);
  }

  // ================================================================ FORKLIFT
  // Toyota 8FGU25-class, 5,000 lb, sit-down, LP (propane), pneumatic tyres.
  // Real dims used: W 3.78 ft, 8.67 ft to fork face + 42 in forks, guard 6.93 ft,
  // wheelbase 5.42 ft. Forks point +Z. colorHex = painted body (Toyota orange).
  function buildForklift(g, wFt, lFt, color) {
    const W = wFt, zR = -lFt / 2, zT = lFt / 2;
    const zFace = zT - 3.5, zFA = zFace - 1.65, zRA = zFA - 5.42, zM = zFace - 0.68;
    const paint = mat(color, 0.45, 0.35), dark = mat(0x2c3036, 0.55, 0.5), blk = mat(0x181a1d, 0.6, 0.3);
    const mastM = mat(0x30343a, 0.5, 0.55), chrome = mat(0xcfd4da, 0.2, 0.9), rubber = mat(0x111214, 0.95, 0.0);
    const rimM = mat(0xe5e7eb, 0.5, 0.4), seatM = mat(0x1b1d20, 0.85, 0.05), floorM = mat(0x2b2f36, 0.7, 0.4);
    const lamp = mat(0xfef3c7, 0.3, 0.1, { emissive: 0xfde68a, emissiveIntensity: 0.6 });
    const tail = mat(0xdc2626, 0.4, 0.1, { emissive: 0x991b1b, emissiveIntensity: 0.5 });
    const amber = mat(0xf59e0b, 0.3, 0.1, { emissive: 0xd97706, emissiveIntensity: 0.8 });
    const tankM = mat(0xe5e7eb, 0.4, 0.2), brass = mat(0xb59a3a, 0.35, 0.8);

    // --- Wheels (pneumatic 7.00-12 front, 6.00-9 rear)
    const wheel = (x, y, z, r, w) => {
      cyl(g, x, y, z, r, r, w, rubber, 'x', 32);
      cyl(g, x, y, z, r * 0.6, r * 0.6, w + 0.02, rimM, 'x', 28);
      const sgn = Math.sign(x) || 1;
      cyl(g, x + sgn * (w / 2 + 0.03), y, z, 0.12, 0.12, 0.05, dark, 'x', 14);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        cyl(g, x + sgn * (w / 2 + 0.02), y + Math.cos(a) * 0.22, z + Math.sin(a) * 0.22, 0.03, 0.03, 0.04, dark, 'x', 6);
      }
    };
    const fX = W / 2 - 0.40, rX = W / 2 - 0.60;
    [-1, 1].forEach(s => { wheel(s * fX, 1.1, zFA, 1.1, 0.65); wheel(s * rX, 0.89, zRA, 0.89, 0.55); });

    // --- Counterweight (rounded rear) + lower centre block
    const cwFront = zR + 2.55, cwW = W * 0.96;
    const cw = extrudeSide([[zR, 1.8], [zR, 2.9], [zR + 0.25, 3.3], [cwFront, 3.3], [cwFront, 1.8]], cwW, paint);
    g.add(cw);
    bx(g, 0, 0.5, (zR + 0.1 + cwFront) / 2, 2.0, 1.3, cwFront - zR - 0.1, dark);
    [-1, 1].forEach(s => bx(g, s * 1.4, 2.15, zR + 0.03, 0.3, 0.2, 0.04, tail));
    bx(g, 0, 2.3, zR + 0.015, 1.1, 0.3, 0.02, labelMat('TOYOTA', '#111111', '#ffffff', 256, 64, 40));

    // --- Frame, engine cover / seat base, floor, steps
    bx(g, 0, 0.55, (cwFront + 1.8) / 2, 2.2, 1.65, 1.8 - cwFront, dark);
    bx(g, 0, 2.2, -2.255, W * 0.78, 0.85, 2.55, paint);                       // engine cover
    bx(g, 0, 2.2, -0.1, 2.5, 0.04, 1.3, floorM);                              // floor plate
    bx(g, -0.4, 2.24, 0.35, 0.3, 0.1, 0.35, blk); bx(g, 0.1, 2.24, 0.35, 0.3, 0.1, 0.35, blk); bx(g, 0.55, 2.24, 0.4, 0.22, 0.08, 0.4, blk);   // pedals
    [-1, 1].forEach(s => bx(g, s * 1.485, 1.35, -1.15, 0.77, 0.08, 1.5, floorM));   // steps
    // Front fenders over steer tyres and the dash cowl
    [-1, 1].forEach(s => {
      bx(g, s * fX, 2.2, 0.93, 0.7, 0.22, 2.3, paint);
      bx(g, s * (fX - 0.1), 2.25, 2.1, 0.3, 0.18, 0.04, lamp);                // headlamps
    });
    bx(g, 0, 2.24, 0.825, 2.0, 1.36, 0.95, paint);
    bx(g, 0, 3.0, 1.25, 1.2, 0.35, 0.04, mat(0x0f172a, 0.4, 0.3, { emissive: 0x78350f, emissiveIntensity: 0.4 }));   // instrument cluster

    // --- Seat
    bx(g, 0, 3.05, -2.0, 1.5, 0.3, 1.4, seatM);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.28), seatM);
    back.rotation.x = -0.17; place(g, back, 0, 4.2, -2.78);
    bx(g, 0.78, 3.35, -2.0, 0.08, 0.35, 0.9, mat(0xf59e0b, 0.7, 0.05));        // seat-belt strap (orange)

    // --- Steering column + wheel, hydraulic levers
    const dir = new THREE.Vector3(0, 0.9, -0.4).normalize();
    const colBase = new THREE.Vector3(0, 3.6, 0.6), colLen = 1.0;
    const col = cyl(g, 0, 0, 0, 0.07, 0.07, colLen, blk, 'y', 12);
    col.position.copy(colBase).addScaledVector(dir, colLen / 2);
    col.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const wheelC = colBase.clone().addScaledVector(dir, colLen);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 10, 28), blk);
    sw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); sw.castShadow = true;
    sw.position.copy(wheelC); g.add(sw);
    const spin = cyl(g, 0, 0, 0, 0.04, 0.04, 0.16, blk, 'y', 8);
    spin.position.set(0.4, wheelC.y + 0.05, wheelC.z + 0.05);
    [-0.3, -0.05, 0.2].forEach(x => {
      cyl(g, x, 3.88, 0.5, 0.03, 0.03, 0.55, blk, 'y', 8);
      place(g, new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0x1d4ed8, 0.5, 0.2)), x, 4.18, 0.5);
    });

    // --- Overhead guard (black) with roof slats and rear strobe
    const gH = 6.93;
    [-1, 1].forEach(s => {
      bx(g, s * 1.3, 2.42, 1.0, 0.12, gH - 2.42, 0.12, blk);                  // front posts
      bx(g, s * 1.3, 3.3, -3.4, 0.12, gH - 3.3, 0.12, blk);                   // rear posts
      bx(g, s * 1.3, gH - 0.12, -1.2, 0.12, 0.12, 4.52, blk);                 // roof side rails
    });
    bx(g, 0, gH - 0.12, 1.0, 2.72, 0.12, 0.12, blk); bx(g, 0, gH - 0.12, -3.4, 2.72, 0.12, 0.12, blk);
    [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0].forEach(x => bx(g, x, gH - 0.09, -1.2, 0.05, 0.06, 4.4, blk));
    [-2.6, -1.4, -0.2].forEach(z => bx(g, 0, gH - 0.1, z, 2.6, 0.05, 0.05, blk));
    cyl(g, 1.0, gH + 0.02, -3.2, 0.12, 0.12, 0.04, dark, 'y', 14);
    cyl(g, 1.0, gH + 0.1, -3.2, 0.09, 0.09, 0.12, amber, 'y', 14);

    // --- Mast, lift/tilt cylinders, carriage, backrest, forks
    [-1, 1].forEach(s => {
      bx(g, s * 0.95, 0.35, zM, 0.32, 6.4, 0.5, mastM);                       // outer rails
      bx(g, s * 0.95, 0.5, zM + 0.2, 0.2, 5.9, 0.14, mat(0x8b9097, 0.4, 0.7)); // inner rails
      cyl(g, s * 0.35, 2.4, zM - 0.45, 0.09, 0.09, 4.2, chrome, 'y', 16);      // lift cylinders
      cyl(g, s * 1.05, 2.95, 1.35, 0.07, 0.07, 0.95, chrome, 'z', 14);        // tilt cylinders
    });
    bx(g, 0, 6.6, zM, 2.2, 0.2, 0.4, mastM); bx(g, 0, 3.0, zM, 1.6, 0.15, 0.35, mastM); bx(g, 0, 0.3, zM, 2.2, 0.3, 0.5, mastM);
    const zC = zFace - 0.28;
    bx(g, 0, 0.45, zC, 3.5, 0.28, 0.16, dark); bx(g, 0, 2.55, zC, 3.5, 0.28, 0.16, dark);
    [-1, 1].forEach(s => bx(g, s * 1.65, 0.45, zC, 0.12, 2.38, 0.16, dark));
    for (let i = 0; i < 11; i++) bx(g, -1.65 + i * 0.33, 2.83, zC, 0.07, 1.62, 0.08, dark);   // load backrest
    bx(g, 0, 3.6, zC, 3.4, 0.07, 0.08, dark); bx(g, 0, 4.45, zC, 3.4, 0.07, 0.08, dark);
    [-1, 1].forEach(s => {
      bx(g, s * 1.2, 0.03, (zFace - 0.18 + zT) / 2, 0.42, 0.133, zT - zFace + 0.18, dark);   // fork blade
      bx(g, s * 1.2, 0.03, zFace - 0.09, 0.42, 2.5, 0.18, dark);                              // fork shank
    });

    // --- LP tank on swing-out bracket across the rear of the counterweight
    const tz = -5.45, tr = 0.51, ty = 3.3 + 0.07 + tr;
    bx(g, 0, 3.3, tz, 1.6, 0.06, 1.1, dark);
    cyl(g, 0, ty, tz, tr, tr, 1.1, tankM, 'x', 28);
    [-1, 1].forEach(s => {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(tr, 22, 14), tankM);
      dome.scale.set(0.35, 1, 1); place(g, dome, s * 0.55, ty, tz);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(tr + 0.02, 0.02, 8, 24), dark);
      strap.rotation.y = Math.PI / 2; strap.castShadow = true; strap.position.set(s * 0.4, ty, tz); g.add(strap);
    });
    cyl(g, 0.82, ty, tz, 0.27, 0.27, 0.16, tankM, 'x', 20);                    // valve guard collar
    cyl(g, 0.93, ty, tz, 0.07, 0.07, 0.2, brass, 'x', 12);
    cyl(g, 0.93, ty + 0.1, tz, 0.045, 0.045, 0.12, brass, 'y', 10);
  }


  // ========================================================= FUSE BOX CABINET
  // Floor-standing industrial electrical enclosure (NEMA-style): gray steel
  // cabinet, hinged door with handle & latches, louvers, conduit knockouts,
  // high-voltage warning labels, mounting feet, and a top gland plate.
  // Front (door) faces +Z.
  function buildFuseBox(g, wFt, lFt, color) {
    const H = SPECS.fusebox.h;
    const body = mat(color, 0.48, 0.55);
    const bodyDark = mat(0x3f4650, 0.5, 0.5);
    const bodyLight = mat(0x9ca3af, 0.45, 0.4);
    const black = mat(0x1f2937, 0.6, 0.25);
    const yellow = mat(0xfacc15, 0.4, 0.2);
    const red = mat(0xdc2626, 0.4, 0.15);
    const chrome = mat(0xd1d5db, 0.25, 0.9);
    const vent = mat(0x111827, 0.7, 0.2);

    const cw = wFt * 0.96;
    const cd = lFt * 0.92;
    const footH = 0.28;
    const bodyH = H - footH - 0.08;
    const zF = cd / 2;
    const zB = -cd / 2;

    // Floor feet / plinth
    bx(g, 0, 0, 0, cw + 0.08, 0.08, cd + 0.08, bodyDark);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      bx(g, sx * (cw / 2 - 0.12), 0.08, sz * (cd / 2 - 0.12), 0.22, footH - 0.08, 0.22, bodyDark);
    });

    // Main cabinet body
    const y0 = footH;
    bx(g, 0, y0, 0, cw, bodyH, cd, body);
    // Slightly recessed top cap
    bx(g, 0, y0 + bodyH, 0, cw + 0.04, 0.06, cd + 0.04, bodyDark);

    // Door panel (front face, slightly proud)
    const doorT = 0.05;
    const doorInset = 0.06;
    const doorW = cw - doorInset * 2;
    const doorH = bodyH - doorInset * 2 - 0.08;
    const doorY = y0 + doorInset + 0.04;
    bx(g, 0, doorY, zF + doorT / 2 + 0.005, doorW, doorH, doorT, bodyLight);

    // Door perimeter seam
    bx(g, 0, doorY, zF + 0.002, doorW + 0.02, 0.03, 0.015, black); // top
    bx(g, 0, doorY + doorH - 0.03, zF + 0.002, doorW + 0.02, 0.03, 0.015, black); // bottom seam visual
    bx(g, -doorW / 2, doorY, zF + 0.002, 0.03, doorH, 0.015, black);
    bx(g, doorW / 2, doorY, zF + 0.002, 0.03, doorH, 0.015, black);

    // Hinges (left side)
    for (let i = 0; i < 3; i++) {
      const hy = doorY + doorH * (0.18 + i * 0.32);
      bx(g, -doorW / 2 - 0.02, hy, zF + 0.04, 0.08, 0.14, 0.06, chrome);
      cyl(g, -doorW / 2 - 0.02, hy + 0.07, zF + 0.04, 0.025, 0.025, 0.14, black, 'y', 10);
    }

    // Handle + lock escutcheon (right side)
    const hx = doorW / 2 - 0.22;
    const hy = doorY + doorH * 0.52;
    bx(g, hx, hy, zF + 0.06, 0.14, 0.55, 0.05, black);
    bx(g, hx, hy + 0.05, zF + 0.10, 0.08, 0.28, 0.06, chrome);
    cyl(g, hx, hy - 0.12, zF + 0.09, 0.045, 0.045, 0.05, chrome, 'z', 12);
    // Latch pads
    [0.22, 0.78].forEach(t => {
      bx(g, doorW / 2 - 0.06, doorY + doorH * t, zF + 0.07, 0.1, 0.12, 0.04, chrome);
    });

    // Side ventilation louvers
    [-1, 1].forEach(sx => {
      for (let i = 0; i < 8; i++) {
        bx(g, sx * (cw / 2 + 0.008), y0 + bodyH * 0.25 + i * 0.12, 0, 0.015, 0.04, cd * 0.45, vent);
      }
    });

    // Front door louvers (lower third)
    for (let i = 0; i < 5; i++) {
      bx(g, 0, doorY + 0.25 + i * 0.1, zF + doorT + 0.01, doorW * 0.55, 0.035, 0.02, vent);
    }

    // Top conduit knockouts / gland plate
    bx(g, 0, y0 + bodyH + 0.07, 0, cw * 0.7, 0.04, cd * 0.55, bodyDark);
    [-0.35, -0.12, 0.12, 0.35].forEach(ox => {
      cyl(g, ox * cw * 0.5, y0 + bodyH + 0.11, -cd * 0.1, 0.07, 0.07, 0.06, black, 'y', 14);
      cyl(g, ox * cw * 0.5, y0 + bodyH + 0.14, -cd * 0.1, 0.05, 0.05, 0.03, chrome, 'y', 12);
    });

    // High-voltage warning label (yellow)
    bx(g, -doorW * 0.22, doorY + doorH * 0.72, zF + doorT + 0.012, 0.7, 0.45, 0.015, yellow);
    bx(g, -doorW * 0.22, doorY + doorH * 0.72, zF + doorT + 0.02, 0.55, 0.32, 0.01, black);
    // Lightning bolt block (simple)
    bx(g, -doorW * 0.22, doorY + doorH * 0.74, zF + doorT + 0.025, 0.08, 0.22, 0.01, yellow);

    // Red "DANGER" strip
    bx(g, doorW * 0.28, doorY + doorH * 0.72, zF + doorT + 0.012, 0.55, 0.2, 0.015, red);

    // Manufacturer / panel nameplate
    bx(g, 0, doorY + doorH * 0.88, zF + doorT + 0.012, doorW * 0.5, 0.18, 0.012, black);
    bx(g, 0, doorY + doorH * 0.88, zF + doorT + 0.018, doorW * 0.42, 0.1, 0.008, bodyLight);

    // Small status pilot light
    cyl(g, doorW * 0.32, doorY + doorH * 0.55, zF + doorT + 0.03, 0.05, 0.05, 0.04,
      mat(0x22c55e, 0.35, 0.1, { emissive: 0x16a34a, emissiveIntensity: 0.7 }), 'z', 12);

    // Side mounting channels
    [-1, 1].forEach(sx => {
      bx(g, sx * (cw / 2 + 0.03), y0 + bodyH * 0.5, 0, 0.04, bodyH * 0.85, 0.1, bodyDark);
    });

    // Bottom cable entry skirt
    bx(g, 0, y0 + 0.06, zF - 0.02, cw * 0.6, 0.12, 0.08, black);
  }


  // ====================================================== SEMI-ENCLOSED PAINT BOOTH
  // Open-front industrial spray booth: side walls, rear exhaust plenum with filters,
  // ceiling with lights, grated floor over pit, manometer, control panel, and
  // red "PAINT BOOTH" header. Operator / open face toward +Z.
  function buildPaintBooth(g, wFt, lFt, color) {
    const H = SPECS.paintbooth.h;
    const shell = mat(color, 0.55, 0.25);
    const shellDark = mat(0x6b7280, 0.5, 0.35);
    const frame = mat(0x374151, 0.45, 0.55);
    const filter = mat(0xd6d3d1, 0.85, 0.05);
    const filterDark = mat(0xa8a29e, 0.8, 0.05);
    const grate = mat(0x57534e, 0.4, 0.7);
    const black = mat(0x1c1917, 0.65, 0.25);
    const red = mat(0xb91c1c, 0.4, 0.2);
    const yellow = mat(0xfacc15, 0.4, 0.15);
    const glass = new THREE.MeshStandardMaterial({
      color: 0xbae6fd, transparent: true, opacity: 0.22, roughness: 0.15, metalness: 0.1,
      side: THREE.DoubleSide, depthWrite: false
    });
    const lightMat = mat(0xfef9c3, 0.3, 0.05, { emissive: 0xfde68a, emissiveIntensity: 0.85 });
    const green = mat(0x22c55e, 0.35, 0.1, { emissive: 0x16a34a, emissiveIntensity: 0.55 });

    const W = wFt, D = lFt, wallT = 0.12;
    const zF = D / 2, zB = -D / 2;
    const openDepth = D * 0.12;          // open face setback
    const sideDepth = D - openDepth;    // enclosed depth
    const ceilingY = H - 0.2;
    // Single ultra-thin floor deck so placed assets sit on the warehouse floor
    // without clipping into a raised booth slab.
    const floorY = 0.02;

    // --- Thin single-layer floor pane (no thick plinth / grate stack) ---
    const gW = W - wallT * 2 - 0.1;
    const gD = sideDepth - 0.3;
    const gZ = zB + openDepth + gD / 2 + 0.05;
    bx(g, 0, floorY, gZ, gW, 0.03, gD, grate);
    // Faint perimeter outline so the work area still reads
    bx(g, 0, floorY + 0.005, gZ, gW, 0.01, 0.04, frame);
    bx(g, 0, floorY + 0.005, gZ, 0.04, 0.01, gD, frame);
    bx(g, -gW / 2, floorY + 0.005, gZ, 0.04, 0.01, gD, frame);
    bx(g,  gW / 2, floorY + 0.005, gZ, 0.04, 0.01, gD, frame);

    // --- Side walls (left / right), full height, open at +Z ---
    const wallH = ceilingY - floorY;
    const wallZc = zB + sideDepth / 2;
    [-1, 1].forEach(sx => {
      bx(g, sx * (W / 2 - wallT / 2), floorY, wallZc, wallT, wallH, sideDepth, shell);
      // Outer vertical frame posts at open edge
      bx(g, sx * (W / 2 - wallT / 2), floorY, zF - openDepth / 2, wallT + 0.06, wallH, 0.16, frame);
      // Window strip in side wall
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, wallH * 0.35, sideDepth * 0.35),
        glass
      );
      win.position.set(sx * (W / 2 - wallT / 2 - 0.01), floorY + wallH * 0.45, wallZc);
      win.castShadow = false;
      g.add(win);
      // Window frame
      bx(g, sx * (W / 2 - wallT / 2 - 0.02), floorY + wallH * 0.45, wallZc, 0.05, wallH * 0.38, sideDepth * 0.38, frame);
    });

    // --- Rear wall / exhaust plenum ---
    bx(g, 0, floorY, zB + wallT / 2, W - wallT * 2, wallH, wallT, shellDark);
    // Exhaust filter bank (rear face, inside)
    const fCols = 4, fRows = 3;
    const fAreaW = W * 0.72, fAreaH = wallH * 0.55;
    const fCellW = fAreaW / fCols, fCellH = fAreaH / fRows;
    const fBaseY = floorY + wallH * 0.2;
    const fBaseX = -fAreaW / 2;
    for (let r = 0; r < fRows; r++) {
      for (let c = 0; c < fCols; c++) {
        const fx = fBaseX + (c + 0.5) * fCellW;
        const fy = fBaseY + (r + 0.5) * fCellH;
        bx(g, fx, fy, zB + wallT + 0.08, fCellW * 0.88, fCellH * 0.85, 0.14, (r + c) % 2 ? filter : filterDark);
        // Filter frame
        bx(g, fx, fy, zB + wallT + 0.16, fCellW * 0.92, fCellH * 0.9, 0.03, frame);
      }
    }
    // Exhaust duct stub on roof rear
    bx(g, 0, H - 0.05, zB + 0.6, W * 0.35, 0.35, 0.9, shellDark);
    cyl(g, 0, H + 0.35, zB + 0.6, 0.45, 0.5, 0.7, shellDark, 'y', 20);
    // Fan housing
    cyl(g, 0, H + 0.85, zB + 0.6, 0.55, 0.55, 0.35, frame, 'y', 16);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bx(g, Math.cos(a) * 0.25, H + 0.95, zB + 0.6 + Math.sin(a) * 0.25, 0.08, 0.04, 0.35, black);
    }

    // --- Ceiling / roof panel ---
    bx(g, 0, ceilingY, wallZc, W, 0.14, sideDepth, shell);
    // Light fixtures (3 rows)
    [-W * 0.28, 0, W * 0.28].forEach(lx => {
      [-sideDepth * 0.25, sideDepth * 0.15].forEach(lz => {
        bx(g, lx, ceilingY - 0.1, zB + openDepth + sideDepth * 0.5 + lz * 0.3, 1.4, 0.08, 0.35, frame);
        bx(g, lx, ceilingY - 0.14, zB + openDepth + sideDepth * 0.5 + lz * 0.3, 1.25, 0.05, 0.25, lightMat);
      });
    });

    // --- Open-front header beam + strip curtains optional markers ---
    bx(g, 0, ceilingY, zF - openDepth / 2, W, 0.18, 0.2, frame);
    // Red PAINT BOOTH header board
    bx(g, 0, ceilingY + 0.2, zF - openDepth / 2, W * 0.7, 0.35, 0.08, red);
    bx(g, 0, ceilingY + 0.2, zF - openDepth / 2 + 0.05, W * 0.55, 0.18, 0.02, yellow);

    // Corner posts at open face
    [-1, 1].forEach(sx => {
      bx(g, sx * (W / 2 - 0.1), floorY, zF - openDepth / 2, 0.18, wallH + 0.1, 0.18, frame);
    });

    // --- Control panel on right exterior ---
    const px = W / 2 + 0.08;
    const pz = zB + sideDepth * 0.35;
    bx(g, px, floorY + 2.2, pz, 0.12, 2.4, 1.2, shellDark);
    bx(g, px + 0.07, floorY + 2.2, pz, 0.04, 2.2, 1.05, black);
    // Buttons / switches
    [[-0.25, 0.6, green], [0.25, 0.6, red], [-0.25, 0.2, yellow], [0.25, 0.2, frame]].forEach(([dy, dz, m]) => {
      cyl(g, px + 0.1, floorY + 2.2 + dy, pz + dz, 0.07, 0.07, 0.05, m, 'x', 12);
    });
    // Manometer gauge
    cyl(g, px + 0.1, floorY + 3.3, pz, 0.2, 0.2, 0.06, mat(0xf8fafc, 0.3, 0.1), 'x', 20);
    bx(g, px + 0.14, floorY + 3.3, pz, 0.02, 0.12, 0.015, black);

    // Safety yellow kick stripe along open threshold
    bx(g, 0, floorY + 0.05, zF - openDepth + 0.05, W - 0.3, 0.08, 0.12, yellow);

    // Side intake louvers near front
    [-1, 1].forEach(sx => {
      for (let i = 0; i < 6; i++) {
        bx(g, sx * (W / 2 - wallT - 0.02), floorY + 1.2 + i * 0.18, zF - openDepth - 0.4,
          0.04, 0.06, 0.5, black);
      }
    });
  }


  // ========================================================= 400-TON BRAKE PRESS
  // Hydraulic CNC press brake: heavy side frames, upper ram with punch, lower
  // bed with V-die, backgauge, hydraulic cylinders, pendant control, and
  // light-curtain posts. Operator side / open throat faces +Z.
  function buildBrakePress(g, wFt, lFt, color) {
    const H = SPECS.brakepress.h;
    const body = mat(color, 0.45, 0.45);
    const bodyDark = mat(0x0f172a, 0.5, 0.4);
    const bodyMid = mat(0x334155, 0.45, 0.5);
    const steel = mat(0x94a3b8, 0.3, 0.75);
    const steelDark = mat(0x475569, 0.35, 0.7);
    const yellow = mat(0xfacc15, 0.4, 0.2);
    const red = mat(0xdc2626, 0.4, 0.15);
    const black = mat(0x111827, 0.6, 0.25);
    const cyan = mat(0x22d3ee, 0.3, 0.1, { emissive: 0x0891b2, emissiveIntensity: 0.5 });
    const green = mat(0x22c55e, 0.35, 0.1, { emissive: 0x16a34a, emissiveIntensity: 0.45 });

    const W = wFt, D = lFt;
    const zF = D / 2, zB = -D / 2;
    // Side frame thickness and bed span
    const frameT = Math.min(1.4, W * 0.1);
    const bedW = W - frameT * 2.1;
    const bedD = Math.min(2.2, D * 0.38);
    const bedY = 2.6;
    const ramY = 5.4;
    const throatZ = zF - bedD / 2 - 0.15;

    // --- Floor base / foundation pads ---
    bx(g, 0, 0.08, 0, W * 0.95, 0.16, D * 0.9, bodyDark);
    [-1, 1].forEach(sx => {
      bx(g, sx * (W / 2 - frameT / 2), 0.05, 0, frameT + 0.3, 0.1, D * 0.85, black);
    });

    // Shared structural top — roof, frames, and rear guard all meet here.
    const bodyTop = H - 0.2;
    const frameBot = 0.16;
    const frameH = bodyTop - frameBot;

    // --- Left & right C-frames (side housings) ---
    [-1, 1].forEach(sx => {
      const fx = sx * (W / 2 - frameT / 2);
      // Main upright — tops exactly at bodyTop
      bx(g, fx, frameBot, zB + D * 0.35, frameT, frameH, D * 0.7, body);
      // Front throat extension (lower)
      bx(g, fx, frameBot, throatZ, frameT, bedY + 0.4, bedD + 0.5, body);
      // Upper beam connection into ram area — tops at bodyTop
      bx(g, fx, ramY - 0.3, throatZ, frameT, bodyTop - (ramY - 0.3), bedD + 0.35, body);
      // Side access panel lines
      bx(g, fx + sx * (frameT / 2 + 0.02), bodyTop * 0.45, zB + D * 0.2, 0.04, bodyTop * 0.35, D * 0.35, bodyDark);
      // Hydraulic cylinder housing under bodyTop
      cyl(g, fx, bodyTop - 0.95, throatZ - 0.1, 0.35, 0.4, 0.7, steelDark, 'y', 18);
      cyl(g, fx, bodyTop - 1.35, throatZ - 0.1, 0.22, 0.22, 0.4, steel, 'y', 14);
    });

    // --- Upper cross crown / ram beam ---
    bx(g, 0, ramY + 0.55, throatZ, bedW + 0.3, 1.1, bedD * 0.7, bodyMid);
    // Ram (moves down in real life — shown mid-stroke)
    bx(g, 0, ramY, throatZ + 0.05, bedW * 0.96, 0.55, bedD * 0.55, steelDark);
    // Punch / upper tool holder
    bx(g, 0, ramY - 0.35, throatZ + 0.08, bedW * 0.92, 0.28, 0.22, steel);
    // Punch tip (V-shaped approximation as thin bar)
    bx(g, 0, ramY - 0.55, throatZ + 0.08, bedW * 0.9, 0.12, 0.08, steelDark);

    // --- Interior work lights (illuminate clamps / die area) ---
    const workLight = mat(0xfff7ed, 0.2, 0.05, { emissive: 0xfde68a, emissiveIntensity: 1.2 });
    const workLightHot = mat(0xfffbeb, 0.15, 0.05, { emissive: 0xfef3c7, emissiveIntensity: 1.6 });
    // Overhead strip lights under the ram beam, aimed at the punch/die
    [-0.32, 0, 0.32].forEach(t => {
      bx(g, t * bedW, ramY + 0.35, throatZ + 0.15, bedW * 0.22, 0.06, 0.18, workLight);
      bx(g, t * bedW, ramY + 0.32, throatZ + 0.15, bedW * 0.18, 0.03, 0.12, workLightHot);
    });
    // Side throat lights on inner faces of the frames
    [-1, 1].forEach(sx => {
      bx(g, sx * (bedW / 2 - 0.08), bedY + 1.2, throatZ, 0.08, 1.4, 0.2, workLight);
      bx(g, sx * (bedW / 2 - 0.1), bedY + 1.2, throatZ, 0.04, 1.1, 0.14, workLightHot);
    });
    // Soft fill panel behind the die (helps clamps read against the dark body)
    bx(g, 0, bedY + 0.9, throatZ - bedD * 0.35, bedW * 0.7, 1.6, 0.04, workLight);

    // --- Front cover panel above the clamps / tool area ---
    // Visible shield on the operator face, just above the punch clamps.
    const coverBot = ramY + 0.15;
    const coverH = 1.6;
    const coverZ = throatZ + bedD * 0.42;
    bx(g, 0, coverBot + coverH / 2, coverZ, bedW + 0.2, coverH, 0.12, bodyMid);
    for (let i = 0; i < 3; i++) {
      bx(g, 0, coverBot + coverH * (0.25 + i * 0.25), coverZ + 0.07, bedW * 0.92, 0.05, 0.03, bodyDark);
    }
    bx(g, 0, coverBot + 0.08, coverZ + 0.05, bedW * 0.96, 0.12, 0.14, steelDark);
    bx(g, 0, coverBot + coverH * 0.8, coverZ + 0.08, bedW * 0.5, 0.18, 0.03, yellow);

    // --- Lower bed / die table ---
    bx(g, 0, bedY, throatZ, bedW, 0.55, bedD, steelDark);
    // V-die block
    bx(g, 0, bedY + 0.35, throatZ + 0.05, bedW * 0.9, 0.2, bedD * 0.45, steel);
    // Die slot
    bx(g, 0, bedY + 0.48, throatZ + 0.05, bedW * 0.88, 0.08, 0.12, black);
    // Bed support ribs under
    for (let i = 0; i < 5; i++) {
      const x = -bedW * 0.4 + i * (bedW * 0.2);
      bx(g, x, bedY - 0.45, throatZ, 0.15, 0.55, bedD * 0.7, bodyDark);
    }

    // --- Backgauge (rear of bed) ---
    const bgZ = throatZ - bedD / 2 - 0.5;
    bx(g, 0, bedY + 0.15, bgZ, bedW * 0.85, 0.12, 0.35, yellow);
    [-1, 1].forEach(sx => {
      cyl(g, sx * bedW * 0.35, bedY + 0.5, bgZ, 0.06, 0.06, 0.7, steel, 'y', 10);
      bx(g, sx * bedW * 0.35, bedY + 0.9, bgZ, 0.25, 0.15, 0.2, black);
    });
    // Backgauge bar
    bx(g, 0, bedY + 0.95, bgZ + 0.1, bedW * 0.75, 0.08, 0.08, steel);

    // --- Front support arms / sheet rests ---
    [-1, 1].forEach(sx => {
      const x = sx * bedW * 0.28;
      bx(g, x, bedY - 0.1, zF - 0.4, 0.2, 0.15, 1.6, steelDark);
      bx(g, x, bedY + 0.15, zF - 0.05, 0.35, 0.08, 0.9, steel);
      // Support leg
      bx(g, x, 0.2, zF - 0.9, 0.18, bedY - 0.2, 0.18, bodyDark);
    });

    // --- Front light-curtain posts ---
    [-1, 1].forEach(sx => {
      const x = sx * (bedW / 2 + 0.25);
      bx(g, x, 0.15, zF - 0.15, 0.14, 4.2, 0.14, yellow);
      bx(g, x, 4.35, zF - 0.15, 0.18, 0.12, 0.18, black);
      // Emitter/receiver windows
      for (let i = 0; i < 8; i++) {
        bx(g, x + sx * 0.08, 0.6 + i * 0.4, zF - 0.15, 0.04, 0.12, 0.08, red);
      }
    });

    // --- CNC control pendant (right side on swing arm) ---
    const px = W / 2 - frameT / 2 + 0.15;
    const pz = zF - 1.2;
    // Arm
    bx(g, px, 4.0, pz - 0.4, 0.12, 0.12, 1.0, steelDark);
    cyl(g, px, 4.0, pz - 0.9, 0.1, 0.1, 0.2, black, 'y', 12);
    // Pendant box
    bx(g, px + 0.25, 3.7, pz, 0.35, 1.1, 0.7, bodyDark);
    bx(g, px + 0.44, 3.85, pz, 0.04, 0.7, 0.55, black);
    // Screen
    bx(g, px + 0.47, 4.05, pz + 0.05, 0.02, 0.35, 0.4, cyan);
    // E-stop
    cyl(g, px + 0.45, 3.4, pz + 0.2, 0.08, 0.08, 0.06, red, 'x', 14);
    // Buttons
    [[-0.15, green], [0.0, yellow], [0.15, bodyMid]].forEach(([dz, m]) => {
      cyl(g, px + 0.45, 3.55, pz + dz, 0.05, 0.05, 0.04, m, 'x', 10);
    });

    // --- Hydraulic power unit (rear left) ---
    const hx = -W / 2 + frameT + 0.8;
    const hz = zB + 1.0;
    bx(g, hx, 0.2, hz, 1.6, 2.2, 1.4, bodyMid);
    bx(g, hx, 2.45, hz, 1.5, 0.12, 1.3, bodyDark);
    // Motor
    cyl(g, hx + 0.3, 1.6, hz + 0.85, 0.35, 0.35, 0.7, black, 'z', 16);
    // Tank sight glass
    bx(g, hx + 0.82, 1.2, hz, 0.04, 0.9, 0.15, cyan);
    // Warning stripe
    bx(g, hx, 0.35, hz + 0.72, 1.55, 0.2, 0.04, yellow);

    // --- Top crown label bar (under roof) ---
    bx(g, 0, bodyTop - 0.35, throatZ, bedW * 0.6, 0.25, 0.12, red);
    bx(g, 0, bodyTop - 0.35, throatZ + 0.07, bedW * 0.45, 0.12, 0.02, yellow);

    // --- Side safety panels (mesh look as dark strips) ---
    [-1, 1].forEach(sx => {
      const fx = sx * (W / 2 - frameT - 0.05);
      for (let i = 0; i < 10; i++) {
        bx(g, fx, 1.0 + i * 0.35, zF - 1.5, 0.04, 0.08, 1.8, black);
      }
    });

    // --- Rear panel (lower half only — tops at mid-height, stays in hitbox) ---
    const rearPanelW = W - frameT * 1.7;
    const rearPanelH = (bodyTop - 0.2) * 0.5; // bottom half only
    const rearPanelZ = zB + 0.15;
    const rearPanelY0 = 0.2;
    bx(g, 0, rearPanelY0 + rearPanelH / 2, rearPanelZ, rearPanelW, rearPanelH, 0.14, bodyDark);
    // Horizontal stiffener ribs
    for (let i = 1; i <= 2; i++) {
      bx(g, 0, rearPanelY0 + rearPanelH * (i / 3), rearPanelZ + 0.08, rearPanelW * 0.95, 0.08, 0.04, bodyMid);
    }
    // Vertical edge channels
    [-1, 1].forEach(sx => {
      bx(g, sx * (rearPanelW / 2 - 0.06), rearPanelY0 + rearPanelH / 2, rearPanelZ + 0.08, 0.1, rearPanelH, 0.08, steelDark);
    });
    // Access door seam on rear panel
    bx(g, -rearPanelW * 0.15, rearPanelY0 + rearPanelH * 0.5, rearPanelZ + 0.09, 0.04, rearPanelH * 0.7, 0.03, black);
    bx(g, -rearPanelW * 0.35, rearPanelY0 + rearPanelH * 0.55, rearPanelZ + 0.1, 0.08, 0.35, 0.05, steel);

    // --- Roof / top canopy ---
    // bodyTop is the underside; roof plate fills up to H. Hitbox = H.
    const roofT = H - bodyTop; // exactly fills bodyTop → H
    const roofY = bodyTop + roofT / 2;
    const roofW = W * 0.98;
    const roofD = D * 0.92;
    bx(g, 0, roofY, 0, roofW, roofT, roofD, bodyDark);
    bx(g, 0, bodyTop - 0.03, zF - 0.08, roofW * 0.98, 0.06, 0.1, bodyMid);
    bx(g, 0, bodyTop - 0.03, zB + 0.08, roofW * 0.98, 0.06, 0.1, bodyMid);
    for (let i = 0; i < 5; i++) {
      const x = -roofW * 0.4 + i * (roofW * 0.2);
      bx(g, x, bodyTop - 0.05, 0, 0.1, 0.08, roofD * 0.88, steelDark);
    }
    bx(g, 0, H - 0.03, 0, roofW + 0.08, 0.06, roofD + 0.08, steelDark);

  }


  // ============================================================== GANTRY CRANE
  // Portal gantry crane with toggleable 2-point (single girder, 2 legs) or
  // 4-point (double girder, 4 corner legs) configuration via assetSettings.gantryPoints.
  // Bridge spans local X; travel along Z; operator face / open side +Z.
  function buildGantryCrane(g, wFt, lFt, color, opts) {
    const H = SPECS.gantrycrane.h;
    const points = (opts && Number(opts.gantryPoints) === 2) ? 2 : 4;
    const yellow = mat(color, 0.4, 0.35);
    const yellowDark = mat(0xb45309, 0.45, 0.4);
    const steel = mat(0x94a3b8, 0.3, 0.75);
    const steelDark = mat(0x475569, 0.35, 0.7);
    const black = mat(0x1f2937, 0.55, 0.3);
    const red = mat(0xdc2626, 0.4, 0.2);
    const cyan = mat(0x22d3ee, 0.3, 0.1, { emissive: 0x0891b2, emissiveIntensity: 0.45 });

    const W = wFt, D = lFt;
    const legW = Math.min(0.7, W * 0.05);
    const legD = Math.min(0.7, D * 0.06);
    const beamH = 0.9;
    const railH = H - 1.2; // underside of bridge
    const zF = D / 2, zB = -D / 2;

    function leg(x, z) {
      // Vertical column
      bx(g, x, 0.15, z, legW, railH - 0.15, legD, yellow);
      // Base plate + bolts
      bx(g, x, 0.08, z, legW + 0.55, 0.16, legD + 0.55, steelDark);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        cyl(g, x + sx * (legW / 2 + 0.15), 0.22, z + sz * (legD / 2 + 0.15), 0.05, 0.05, 0.12, black, 'y', 8);
      });
      // Cap plate under bridge
      bx(g, x, railH - 0.08, z, legW + 0.25, 0.16, legD + 0.25, yellowDark);
      // Diagonal brace toward center (visual stiffness)
      const inwardX = x > 0 ? -0.4 : 0.4;
      const inwardZ = Math.abs(z) > 0.1 ? (z > 0 ? -0.35 : 0.35) : 0;
      // Knee brace block
      bx(g, x + inwardX * 0.3, railH * 0.55, z + inwardZ * 0.3, 0.2, 0.2, Math.max(0.8, Math.abs(z) * 0.3 + 0.5), yellowDark);
    }

    if (points === 2) {
      // Two legs at mid-depth, left and right — single girder bridge
      const legZ = 0;
      leg(-W / 2 + legW, legZ);
      leg( W / 2 - legW, legZ);
      // Single main girder spanning X
      bx(g, 0, railH + beamH / 2, legZ, W - legW * 0.5, beamH, 0.7, yellow);
      // Top chord / walkway
      bx(g, 0, railH + beamH + 0.08, legZ, W - legW, 0.12, 0.9, yellowDark);
      // End stops
      [-1, 1].forEach(sx => {
        bx(g, sx * (W / 2 - 0.3), railH + beamH / 2, legZ, 0.2, beamH + 0.2, 1.0, red);
      });
      // Trolley on single girder
      const tx = W * 0.12;
      bx(g, tx, railH - 0.15, legZ, 1.4, 0.35, 1.1, steelDark);
      // Hoist body
      bx(g, tx, railH - 0.7, legZ, 1.0, 0.7, 0.85, black);
      // Cable + hook
      cyl(g, tx, railH - 1.5, legZ, 0.04, 0.04, 1.2, steel, 'y', 8);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 14, Math.PI * 1.4), steel);
      hook.position.set(tx, railH - 2.2, legZ); hook.rotation.x = Math.PI / 2; hook.castShadow = true; g.add(hook);
      // Pendant station
      bx(g, W / 2 - 1.2, railH * 0.45, legZ + 0.6, 0.25, 0.7, 0.4, black);
      cyl(g, W / 2 - 1.2, railH * 0.45 + 0.25, legZ + 0.82, 0.06, 0.06, 0.05, red, 'z', 10);
    } else {
      // Four legs at corners — double girder bridge
      const insetX = W / 2 - legW;
      const insetZ = D / 2 - legD;
      leg(-insetX, -insetZ);
      leg( insetX, -insetZ);
      leg(-insetX,  insetZ);
      leg( insetX,  insetZ);
      // Sill beams connecting legs along Z (each side)
      [-insetX, insetX].forEach(x => {
        bx(g, x, railH + 0.2, 0, legW * 0.9, 0.4, D - legD * 1.5, yellowDark);
      });
      // Double bridge girders spanning X (front & rear)
      const girderSep = Math.min(D * 0.35, 3.5);
      [-girderSep / 2, girderSep / 2].forEach(gz => {
        bx(g, 0, railH + beamH / 2, gz, W - legW, beamH, 0.55, yellow);
        bx(g, 0, railH + beamH + 0.08, gz, W - legW * 1.2, 0.1, 0.7, yellowDark);
      });
      // Cross ties between girders
      for (let i = -2; i <= 2; i++) {
        bx(g, i * (W / 6), railH + beamH / 2, 0, 0.2, 0.25, girderSep + 0.3, steelDark);
      }
      // End carriages / stops
      [-1, 1].forEach(sx => {
        bx(g, sx * (W / 2 - 0.35), railH + beamH / 2, 0, 0.3, beamH + 0.25, girderSep + 1.0, red);
      });
      // Trolley spanning both girders
      const tx = W * 0.1;
      bx(g, tx, railH - 0.1, 0, 1.6, 0.3, girderSep + 0.6, steelDark);
      bx(g, tx, railH - 0.65, 0, 1.2, 0.75, 1.0, black);
      cyl(g, tx, railH - 1.5, 0, 0.045, 0.045, 1.3, steel, 'y', 8);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 8, 14, Math.PI * 1.4), steel);
      hook.position.set(tx, railH - 2.25, 0); hook.rotation.x = Math.PI / 2; hook.castShadow = true; g.add(hook);
      // Long-travel rails suggestion on ground (dashed blocks)
      [-insetZ, insetZ].forEach(z => {
        bx(g, 0, 0.06, z, W * 0.9, 0.08, 0.25, steelDark);
      });
      // Control pendant
      bx(g, insetX - 0.3, railH * 0.4, insetZ - 0.5, 0.3, 0.75, 0.45, black);
      bx(g, insetX - 0.3, railH * 0.55, insetZ - 0.28, 0.05, 0.35, 0.3, cyan);
      cyl(g, insetX - 0.3, railH * 0.3, insetZ - 0.28, 0.07, 0.07, 0.05, red, 'z', 10);
    }

    // Capacity label plate on girder
    bx(g, 0, railH + beamH + 0.2, points === 2 ? 0 : 0, Math.min(4, W * 0.25), 0.35, 0.08, red);
    bx(g, 0, railH + beamH + 0.2, points === 2 ? 0.05 : 0.05, Math.min(3.2, W * 0.2), 0.2, 0.03, yellow);
  }

  // =============================================================== FINISHING
  // Same finishing steps as the end of buildBinMesh(): contact shadow, CAD wire
  // box when selected (or in CAD mode), and corner resize handles when selected.
  function finish(g, type, wFt, lFt, isSelected) {
    const totalH = SPECS[type].h;
    const realistic = (typeof realisticMode !== 'undefined') && realisticMode;
    if (typeof getContactShadowTexture === 'function') {
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(wFt * 1.18, lFt * 1.18).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: getContactShadowTexture(), transparent: true, opacity: realistic ? 0.62 : 0.22, depthWrite: false }));
      shadow.position.y = 0.016; g.add(shadow);
    }
    if (isSelected || !realistic) {
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(wFt, totalH, lFt)),
        new THREE.LineBasicMaterial({ color: isSelected ? 0xfef08a : 0xffffff }));
      wire.position.y = totalH / 2; g.add(wire);
    }
    if (isSelected) {
      const hm = new THREE.MeshBasicMaterial({ color: 0xfef08a }), hg = new THREE.BoxGeometry(0.42, 0.42, 0.42);
      [{ dir: 'nw', x: -wFt / 2, z: -lFt / 2 }, { dir: 'ne', x: wFt / 2, z: -lFt / 2 },
       { dir: 'sw', x: -wFt / 2, z: lFt / 2 }, { dir: 'se', x: wFt / 2, z: lFt / 2 }].forEach(c => {
        const h = new THREE.Mesh(hg, hm); h.position.set(c.x, Math.min(totalH, 3.2), c.z);
        h.userData.resizeHandle = c.dir; g.add(h);
      });
    }
  }

  // ================================================================ PUBLIC API
  // Models are authored with "front" toward local +Z (facing 0 / South).
  // rotateSelected() swaps bin.w/bin.l and advances facing 0→1→2→3; we rebuild
  // geometry in the un-swapped modeling frame, then yaw the content group so the
  // front tracks facing. Selection wire + resize handles stay axis-aligned on the
  // AABB footprint (same convention as large/small bins and custom assets).
  // ---- extension point: other files add asset types without editing this one
  const REGISTRY = {};
  const HELPERS = { mat: mat, place: place, bx: bx, cyl: cyl, tube: tube };
  function build(type, wFt, lFt, tiers, isSelected, colorHex, assetSettings) {
    const spec = SPECS[type]; if (!spec) return null;
    const color = colorHex || spec.color, g = new THREE.Group(), o = assetSettings || {};
    const facing = Number.isInteger(o.facing)
      ? ((o.facing % 4) + 4) % 4
      : (o.rotated ? 1 : 0);
    const isSide = (facing % 2 === 1);
    // Un-swap footprint so model is built in its design axes, then rotate.
    const buildW = isSide ? lFt : wFt;
    const buildL = isSide ? wFt : lFt;
    const content = new THREE.Group();
    switch (type) {
      case 'oildrum':        buildDrum(content, buildW, buildL, color); break;
      case 'spotwelder':     buildSpotWelder(content, buildW, buildL, color); break;
      case 'weldcurtain':    buildWeldCurtain(content, buildW, buildL, color, o); break;
      case 'downdrafttable': buildDowndraftTable(content, buildW, buildL, color, o); break;
      case 'forklift':       buildForklift(content, buildW, buildL, color); break;
      case 'fusebox':        buildFuseBox(content, buildW, buildL, color); break;
      case 'paintbooth':     buildPaintBooth(content, buildW, buildL, color); break;
      case 'brakepress':     buildBrakePress(content, buildW, buildL, color); break;
      case 'gantrycrane':    buildGantryCrane(content, buildW, buildL, color, o); break;
      default:
        // Assets added at runtime through NewAssets.register() (e.g. home-assets.js)
        if (REGISTRY[type]) REGISTRY[type](content, buildW, buildL, color, o, HELPERS);
    }
    // Same yaw table as large/small bins (facing 0=S, 1=E, 2=N, 3=W).
    content.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][facing];
    g.add(content);
    finish(g, type, wFt, lFt, !!isSelected);
    return g;
  }
  return {
    SPECS: SPECS,
    helpers: HELPERS,
    // register(type, spec, builder): spec = { w, l, h, color, name, icon, tile, mode? }
    // builder(group, wFt, lFt, color, assetSettings, helpers) draws the model (front = +Z, floor y = 0)
    register: function (type, spec, builder) {
      if (!type || !spec || typeof builder !== 'function') return false;
      SPECS[type] = spec; REGISTRY[type] = builder; return true;
    },
    has: t => Object.prototype.hasOwnProperty.call(SPECS, t),
    build: build,
    naturalHeight: t => (SPECS[t] ? SPECS[t].h : 0),
    typeName: t => (SPECS[t] ? SPECS[t].name : null),
    // call once inside spawnBin() right after the binObj literal is created
    applyDefaults: function (b) {
      const s = SPECS[b.type]; if (!s) return;
      b.color = s.color; b.heightFt = s.h; b.tiers = 1;
      if (b.type === 'gantrycrane' && b.gantryPoints !== 2 && b.gantryPoints !== 4) b.gantryPoints = 4;
    }
  };
})();

// Global hook used by buildBinMesh()
function buildNewAssetMesh(type, wFt, lFt, tiers, isSelected, colorHex, assetSettings) {
  return NewAssets.build(type, wFt, lFt, tiers, isSelected, colorHex, assetSettings);
}
if (typeof module !== 'undefined' && module.exports) module.exports = NewAssets;

/* ============================================================================
   INTEGRATION (6 small hook-ups, all additive)

   1. Paste this whole file inside a <script> tag ABOVE your main app script.

   2. buildBinMesh(), directly under the existing custom-asset line:
        if (type === 'custom') return buildCustomAssetVisual(...);
      add:
        if (NewAssets.has(type)) return buildNewAssetMesh(type, wFt, lFt, tiers, isSelected, colorHex, assetSettings);

   3. spawnBin(), right after the `const binObj = { ... };` literal:
        NewAssets.applyDefaults(binObj);

   4. getDefaultAssetHeightFt(binObj), as its first line:
        if (NewAssets.has(binObj.type)) return NewAssets.naturalHeight(binObj.type);

   5. getObjectTypeName(b), as its first line:
        if (NewAssets.has(b.type)) return NewAssets.typeName(b.type);

   6. Asset picker: one tile + one click handler per type (copy the I-Beam pair):
        <button type="button" class="asset-tile" id="btn-add-oildrum" data-type="oildrum" title="Add 55 Gal Oil Drum">
          <span class="tile-preview" aria-hidden="true"><span class="tile-fallback">🛢️</span></span>
          <span class="tile-label">Oil Drum</span>
        </button>
        document.getElementById('btn-add-oildrum').onclick = () => {
          const s = NewAssets.SPECS.oildrum, pos = findNextOpenSlot(s.w, s.l);
          spawnBin('oildrum', pos.x, pos.y, s.w, s.l, 1, null, s.name);
        };
      Repeat for: spotwelder, weldcurtain, downdrafttable, forklift.
      Optional tile colours:  #pane-assets .asset-tile[data-type="forklift"] { --tile-color: #f26b1d; }
   ============================================================================ */
   
   let _cachedWireMeshTexture = null;
function getIndustrialWireMeshTexture() {
  if (_cachedWireMeshTexture) return _cachedWireMeshTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  const cells = 8;
  const step = 256 / cells;

  // Draw vertical galvanized steel wires
  for (let i = 0; i <= cells; i++) {
    const x = Math.round(i * step);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x - 3, 0, 6, 256);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x - 2, 0, 4, 256);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x - 1, 0, 1.5, 256);
  }

  // Draw horizontal galvanized steel wires
  for (let j = 0; j <= cells; j++) {
    const y = Math.round(j * step);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, y - 3, 256, 6);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, y - 2, 256, 4);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, y - 1, 256, 1.5);
  }

  // Draw weld nuggets at wire intersections
  ctx.fillStyle = '#94a3b8';
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      const x = Math.round(i * step);
      const y = Math.round(j * step);
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      ctx.fillStyle = '#94a3b8';
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  _cachedWireMeshTexture = tex;
  return tex;
}

// ============================================================================
// ADDABLE JIB CRANE: base plate, mast and boom are independent.
//  - Base plate = w x l (resize handles). Never changed by mast/boom edits.
//  - Mast height = assetHeight (vertical, up to 20 ft).
//  - Boom (arm) length = boomLengthFt, with its OWN collision box joined to the
//    mast pivot. It swings with the boom, counts toward room-bounds clamping,
//    stops at walls, and is exported to DXF on layer CRANE_BOOM.
// Swing is clockwise on the plan view (0 deg = boom points east, +X).
// ============================================================================
const CRANE_BOOM_BOX_W = 0.8, CRANE_BOOM_MIN = 2, CRANE_BOOM_MAX = 40, CRANE_MAST_MAX = 20;
const CRANE_MAST_FRAC = 0.28;
const PALLET_STACK_MAX = 15;   // most pallets in one stack   // mast sits this fraction of the base in from its north-west corner

function getCraneBoomLength(b, wFt, lFt) {
  const v = Number(b && b.boomLengthFt);
  if (Number.isFinite(v) && v > 0) return Math.max(CRANE_BOOM_MIN, Math.min(CRANE_BOOM_MAX, v));
  return Math.max(1, Math.min(wFt, lFt) * 0.82);   // legacy cranes saved before the boom had its own length
}
function getCranePivot(b, ox = b.x, oy = b.y) {
  return { x: ox + b.w / 2 - b.w * CRANE_MAST_FRAC, y: oy + b.l / 2 + b.l * CRANE_MAST_FRAC };
}
function craneBoomFrame(b, ox, oy, angleDeg) {
  const p = getCranePivot(b, ox, oy);
  const th = THREE.MathUtils.degToRad(Number(angleDeg) || 0);
  const dx = Math.cos(th), dy = -Math.sin(th);            // clockwise from east on the plan
  return { p, dx, dy, nx: -dy, ny: dx, hw: CRANE_BOOM_BOX_W / 2 };
}
function getCraneBoomRect(b, ox = b.x, oy = b.y, angleDeg = b.functionAngle, len = getCraneBoomLength(b, b.w, b.l)) {
  const f = craneBoomFrame(b, ox, oy, angleDeg);
  return [
    [f.p.x + f.nx * f.hw, f.p.y + f.ny * f.hw],
    [f.p.x + f.dx * len + f.nx * f.hw, f.p.y + f.dy * len + f.ny * f.hw],
    [f.p.x + f.dx * len - f.nx * f.hw, f.p.y + f.dy * len - f.ny * f.hw],
    [f.p.x - f.nx * f.hw, f.p.y - f.ny * f.hw]
  ];
}
function getCraneBoomPoints(b, ox = b.x, oy = b.y, angleDeg = b.functionAngle, len = getCraneBoomLength(b, b.w, b.l)) {
  if (!b || b.type !== 'crane') return [];
  const f = craneBoomFrame(b, ox, oy, angleDeg), pts = [], steps = Math.max(1, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const t = len * i / steps;
    pts.push([f.p.x + f.dx * t + f.nx * f.hw, f.p.y + f.dy * t + f.ny * f.hw],
             [f.p.x + f.dx * t - f.nx * f.hw, f.p.y + f.dy * t - f.ny * f.hw]);
  }
  return pts;
}
// Footprint extent relative to (b.x, b.y). Base only for everything except the crane, whose boom box is joined in.
function getBinExtent(b) {
  const e = { minX: 0, minY: 0, maxX: b.w, maxY: b.l };
  if (b.type === 'crane') getCraneBoomPoints(b).forEach(([x, y]) => {
    e.minX = Math.min(e.minX, x - b.x); e.maxX = Math.max(e.maxX, x - b.x);
    e.minY = Math.min(e.minY, y - b.y); e.maxY = Math.max(e.maxY, y - b.y);
  });
  return e;
}
function craneBoomInsideRoom(b, angleDeg, len) {
  return getCraneBoomPoints(b, b.x, b.y, angleDeg, len).every(([x, y]) => isInsideWarehouse(x, y));
}
// Swing the boom toward the requested angle, stopping where its collision box meets a wall.
function limitCraneSwing(b, requested, len) {
  const target = Math.max(0, Math.min(140, Math.round(Number(requested) || 0)));
  len = len == null ? getCraneBoomLength(b, b.w, b.l) : len;
  const cur = Math.max(0, Math.min(140, Math.round(Number(b.functionAngle) || 0)));
  if (!craneBoomInsideRoom(b, cur, len)) {
    let best = null;
    for (let a = 0; a <= 140; a++) if (craneBoomInsideRoom(b, a, len) && (best === null || Math.abs(a - target) < Math.abs(best - target))) best = a;
    return best === null ? target : best;
  }
  const dir = Math.sign(target - cur);
  let a = cur;
  while (a !== target) { const n = a + dir; if (!craneBoomInsideRoom(b, n, len)) break; a = n; }
  return a;
}
// Lengthen the boom toward the request, stopping where its collision box meets a wall (at the current swing).
function limitCraneBoomLength(b, requested) {
  const target = Math.max(CRANE_BOOM_MIN, Math.min(CRANE_BOOM_MAX, Math.round((Number(requested) || CRANE_BOOM_MIN) * 2) / 2));
  const cur = getCraneBoomLength(b, b.w, b.l), ang = Number(b.functionAngle) || 0;
  if (target <= cur) return target;
  let len = cur;
  while (len < target) { const n = Math.min(target, len + 0.5); if (!craneBoomInsideRoom(b, ang, n)) break; len = n; }
  return len;
}
// Rotate the boom on the existing model: instant, no rebuild while the slider is dragged.
function applyCraneSwingLive(b) {
  const jib = b.mesh && b.mesh.userData && b.mesh.userData.craneJib;
  if (!jib) { rebuildBinVisual(b); return; }
  jib.rotation.y = -THREE.MathUtils.degToRad(Number(b.functionAngle) || 0);
}
function disposeMeshGeometries(root) {
  if (!root) return;
  root.traverse(o => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
}

function buildBinMesh(wFt, lFt, tiers, isLarge, isSelected, colorHex, type = 'large', assetSettings = {}) {
  if (type === 'custom') return buildCustomAssetVisual(wFt, lFt, isSelected, assetSettings);
  if (typeof NewAssets !== 'undefined' && NewAssets.has(type)) return buildNewAssetMesh(type, wFt, lFt, tiers, isSelected, colorHex, assetSettings);
  const group = new THREE.Group();
  const tierH = 3.2;
  const defaultColor = type === 'table' ? 0x2563eb : (type === 'shelf' ? 0x1d4ed8 : (type === 'uline_rolling_conveyor' ? 0x1d4ed8 : (type === 'ibeam' ? 0x9ca3af : (type === 'crane' ? 0xeab308 : (type === 'conveyor' ? 0xeab308 : (isLarge ? 0x059669 : 0x0284c7))))));
  // Each object keeps its own editable material color.
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex || defaultColor,
    roughness: type === 'table' ? 0.72 : (type === 'shelf' ? 0.4 : 0.35),
    metalness: type === 'table' ? 0.05 : (type === 'shelf' ? 0.25 : 0.45)
  });

  // Detailed North American GMA-style 48 x 40 in stringer pallet.
  // Deckboards span the 40-in width and are spaced along the 48-in length.
  if (type === 'pallet') {
    // A stack is the same pallet built once per tier, each sitting on the one below.
    const palletUnitH = Math.max(0.2, Number(assetSettings.heightFt) || 0.396);
    const palletCount = Math.max(1, Math.min(PALLET_STACK_MAX, Math.round(Number(tiers)) || 1));
    const buildOnePallet = (group) => {
    const wood = new THREE.MeshStandardMaterial({ color: colorHex || 0xb88955, roughness: 0.94, metalness: 0.0 });
    const endGrain = new THREE.MeshStandardMaterial({ color: colorHex || 0xa97945, roughness: 0.96, metalness: 0.0 });
    const totalH = Math.max(0.2, Number(assetSettings.heightFt) || 0.396); // standard is about 4.75 in
    const boardT = Math.min(0.055, totalH * 0.14); // 5/8 in nominal
    const stringerH = Math.max(0.12, totalH - 2 * boardT);
    const stringerW = Math.min(0.115, wFt * 0.045); // approx. 1-3/8 in
    const topY = totalH - boardT / 2;
    const bottomY = boardT / 2;
    // Three lengthwise stringers. The outer stringers have visible fork-entry reliefs.
    [-wFt * 0.38, 0, wFt * 0.38].forEach((x, idx) => {
      if (idx === 1) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(stringerW, stringerH, lFt), endGrain);
        beam.position.set(x, boardT + stringerH / 2, 0); beam.castShadow = true; group.add(beam);
      } else {
        const notchLen = Math.min(lFt * 0.23, 0.75);
        const endLen = Math.max(0.25, (lFt - notchLen) / 2);
        const fullEndH = stringerH;
        [-1, 1].forEach(side => {
          const seg = new THREE.Mesh(new THREE.BoxGeometry(stringerW, fullEndH, endLen), endGrain);
          seg.position.set(x, boardT + fullEndH / 2, side * (lFt / 2 - endLen / 2)); seg.castShadow = true; group.add(seg);
        });
        const bridgeLen = Math.max(0.1, lFt - 2 * endLen);
        const bridgeH = stringerH * 0.58;
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(stringerW, bridgeH, bridgeLen), endGrain);
        bridge.position.set(x, boardT + stringerH - bridgeH / 2, 0); bridge.castShadow = true; group.add(bridge);
      }
    });
    // Seven top deckboards: two wide lead boards and five narrower interior boards.
    const topWidths = [0.458, 0.292, 0.292, 0.292, 0.292, 0.292, 0.458]; // ~5.5 in leads, 3.5 in interiors
    const topSpan = topWidths.reduce((a,b)=>a+b,0);
    const topGap = Math.max(0.012, (lFt - topSpan) / 6);
    let zCursor = -lFt / 2;
    topWidths.forEach((bw, i) => {
      const actualW = Math.min(bw, lFt / 7);
      const board = new THREE.Mesh(new THREE.BoxGeometry(wFt, boardT, actualW), i === 0 || i === 6 ? endGrain : wood);
      board.position.set(0, topY, zCursor + actualW / 2); board.castShadow = true; group.add(board);
      zCursor += actualW + topGap;
    });
    // Five underside boards, including wider lead boards, make the underside read correctly too.
    const bottomWidths = [0.458, 0.292, 0.292, 0.292, 0.458];
    const bottomSpan = bottomWidths.reduce((a,b)=>a+b,0);
    const bottomGap = Math.max(0.035, (lFt - bottomSpan) / 4);
    zCursor = -lFt / 2;
    bottomWidths.forEach((bw, i) => {
      const board = new THREE.Mesh(new THREE.BoxGeometry(wFt, boardT, bw), i === 0 || i === 4 ? endGrain : wood);
      board.position.set(0, bottomY, zCursor + bw / 2); board.castShadow = true; group.add(board);
      zCursor += bw + bottomGap;
    });
    // Subtle nail heads at each stringer/deckboard intersection.
    const nailMat = new THREE.MeshStandardMaterial({ color: 0x55504a, metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 7; i++) {
      const z = -lFt * 0.43 + i * (lFt * 0.143);
      [-wFt*0.38, 0, wFt*0.38].forEach(x => {
        const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.006,8), nailMat);
        nail.rotation.x = Math.PI/2; nail.position.set(x, totalH + 0.003, z); group.add(nail);
      });
    }
    };
    for (let pi = 0; pi < palletCount; pi++) {
      const onePallet = new THREE.Group(); onePallet.position.y = pi * palletUnitH;
      buildOnePallet(onePallet); group.add(onePallet);
    }
  }

  // PalletPal-style spring pallet level loader. Components are connected to the
  // lower chassis and rotating upper deck; avoid disconnected decorative parts.
  if (type === 'palletpal') {
    const h = Math.max(1.6, Number(assetSettings.heightFt) || 3.0);
    const red = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.48, metalness: 0.55 });
    const yellow = new THREE.MeshStandardMaterial({ color: colorHex || 0xfacc15, roughness: 0.42, metalness: 0.38 });
    const black = new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.5, metalness: 0.55 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.32, metalness: 0.78 });
    const dim = Math.min(wFt, lFt);
    const baseY = 0.08, baseH = 0.18, platformH = 0.16;
    const topY = h;
    const frameW = wFt * 0.78, frameL = lFt * 0.78;
    const baseTop = baseY + baseH;
    const deckBottom = topY - platformH;
    const sideX = frameW * 0.42, sideZ = frameL * 0.42;

    // Welded lower chassis rails and cross-members, with visible fork-entry gaps.
    const rail = (x,y,z,wx,hy,lz,material=red) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(wx,hy,lz), material);
      m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
    };
    rail(0, baseY+baseH/2, -frameL*0.40, frameW, baseH, 0.16);
    rail(0, baseY+baseH/2,  frameL*0.40, frameW, baseH, 0.16);
    rail(-frameW*0.42, baseY+baseH/2, 0, 0.16, baseH, frameL*0.80);
    rail( frameW*0.42, baseY+baseH/2, 0, 0.16, baseH, frameL*0.80);
    rail(0, baseTop-0.015, 0, frameW*0.70, 0.07, 0.16, black);

    // Rotating deck: steel underside ribs and a continuous yellow annular rim.
    const outerR = dim * 0.46, innerR = outerR * 0.82;
    const ringSide = new THREE.Mesh(new THREE.CylinderGeometry(outerR,outerR,platformH,48,1,true), yellow);
    ringSide.position.y = topY-platformH/2; ringSide.castShadow = true; group.add(ringSide);
    const ringTop = new THREE.Mesh(new THREE.RingGeometry(innerR,outerR,48), yellow);
    ringTop.rotation.x = -Math.PI/2; ringTop.position.y = topY-0.015; ringTop.castShadow = true; group.add(ringTop);
    const innerWall = new THREE.Mesh(new THREE.CylinderGeometry(innerR,innerR,platformH*0.94,48,1,true), yellow);
    innerWall.position.y = topY-platformH/2; group.add(innerWall);
    // Under-deck cross braces meet the central bearing and the perimeter frame.
    for (let i=0;i<4;i++) {
      const a = i*Math.PI/4;
      const brace = rail(0, deckBottom-0.06, 0, outerR*1.55, 0.10, 0.13, red);
      brace.rotation.y = a;
    }
    const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.24,0.16,20), steel);
    bearing.position.set(0, deckBottom-0.10, 0); bearing.castShadow = true; group.add(bearing);

    // Real crossed scissor links. Each diagonal runs between an actual lower
    // chassis pivot and the opposite upper-deck pivot, rather than floating mid-air.
    function addLink(a,b,width,depth,material) {
      const av = new THREE.Vector3(a.x,a.y,a.z), bv = new THREE.Vector3(b.x,b.y,b.z);
      const delta = new THREE.Vector3().subVectors(bv,av);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, delta.length(), depth), material);
      mesh.position.copy(av).add(bv).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), delta.normalize());
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
      return mesh;
    }
    const pivotY = (baseTop + deckBottom) / 2;
    [-1,1].forEach(sz => {
      // Two crossed arms per side plane; endpoints touch the lower and upper rails.
      const z = sz * frameL * 0.29;
      const lowerLeft = {x:-sideX*0.78,y:baseTop+0.02,z};
      const lowerRight = {x:sideX*0.78,y:baseTop+0.02,z};
      const upperLeft = {x:-sideX*0.78,y:deckBottom-0.02,z};
      const upperRight = {x:sideX*0.78,y:deckBottom-0.02,z};
      addLink(lowerLeft, upperRight, 0.13, 0.12, red);
      addLink(lowerRight, upperLeft, 0.13, 0.12, red);
      // Center pivot is physically placed at the intersection of the crossed links.
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,0.18,16), steel);
      pin.rotation.x = Math.PI/2; pin.position.set(0,pivotY,z); pin.castShadow = true; group.add(pin);
      [-1,1].forEach(sx => {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.035,12), steel);
        bolt.rotation.z = Math.PI/2; bolt.position.set(sx*sideX*0.78, sx===-1 ? baseTop+0.02 : deckBottom-0.02, z); group.add(bolt);
      });
    });

    // Four springs sit directly between chassis pads and underside-deck pads.
    const springBottom = baseTop + 0.08;
    const springTop = deckBottom - 0.12;
    const springHeight = Math.max(0.25, springTop - springBottom);
    const springRadius = Math.min(0.10, dim*0.028);
    const springTurns = 6;
    const springPoints = [];
    for (let i=0;i<=springTurns*20;i++) {
      const t=i/(springTurns*20), a=t*Math.PI*2*springTurns;
      springPoints.push(new THREE.Vector3(Math.cos(a)*springRadius, t*springHeight, Math.sin(a)*springRadius));
    }
    const springGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints), springTurns*24, 0.018, 6, false);
    [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([sx,sz]) => {
      const x=sx*frameW*0.30, z=sz*frameL*0.30;
      rail(x,springBottom-0.035,z,0.22,0.07,0.22,black);
      rail(x,springTop+0.035,z,0.22,0.07,0.22,black);
      const spring = new THREE.Mesh(springGeo, black);
      spring.position.set(x,springBottom,z); spring.castShadow = true; group.add(spring);
    });
    // Compact central guide post is anchored to the chassis and bearing, not a floating rod.
    const guideH = Math.max(0.2, springHeight*0.62);
    const guide = new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.09,guideH,14), steel);
    guide.position.set(0,springBottom+guideH/2,0); guide.castShadow = true; group.add(guide);
  }

  // ULINE H-3716-style end posts with TWO OPEN, SEPARATE RIBBED RAILS.
  // Important: no wide panel/web is created. Each rail is only a narrow horizontal member,
  // leaving a large, fully open gap between the upper and lower rails.
  if (type === 'guardrail') {
    const railLength = Math.max(wFt, lFt);
    const railAxisZ = lFt >= wFt;
    const postHeight = Math.max(3.58, Number(assetSettings.heightFt) || 3.58); // nominal 43 in
    const yellow = new THREE.MeshStandardMaterial({ color: colorHex || 0xffc400, metalness: 0.34, roughness: 0.32 });
    const yellowFace = new THREE.MeshStandardMaterial({ color: 0xffd12a, metalness: 0.25, roughness: 0.36 });
    const yellowEdge = new THREE.MeshStandardMaterial({ color: 0xb88900, metalness: 0.42, roughness: 0.34 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x858b91, metalness: 0.78, roughness: 0.27 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x252a30, metalness: 0.72, roughness: 0.30 });
    const postSize = 4 / 12;
    const plateSize = 10 / 12;
    const plateThickness = 0.625 / 12;
    const boltOffset = 0.32;
    const postCenterOffset = Math.max(0, railLength / 2 - postSize / 2);
    const postPositions = [-postCenterOffset, postCenterOffset];
    const box = (x, y, z, sx, sy, sz, material, target=group) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; target.add(mesh); return mesh;
    };
    const cylinder = (x,y,z,r,h,material,segments=12,target=group) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments), material);
      mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; target.add(mesh); return mesh;
    };
    const orientedBox = (along, y, across, length, height, depth, material, target=group) => {
      const x = railAxisZ ? across : along;
      const z = railAxisZ ? along : across;
      return railAxisZ ? box(x,y,z,depth,height,length,material,target) : box(x,y,z,length,height,depth,material,target);
    };

    // Square end posts and anchored 10 x 10 in base plates.
    postPositions.forEach(pos => {
      const px = railAxisZ ? 0 : pos;
      const pz = railAxisZ ? pos : 0;
      box(px, plateThickness/2, pz, plateSize, plateThickness, plateSize, darkSteel);
      box(px, plateThickness + 0.006, pz, plateSize*0.92, 0.012, plateSize*0.92, steel);
      box(px, plateThickness + 0.045, pz, postSize*1.14, 0.065, postSize*1.14, yellowEdge);
      box(px, plateThickness + (postHeight-plateThickness)/2, pz, postSize, postHeight-plateThickness, postSize, yellow);
      box(px, postHeight - 0.018, pz, postSize*0.94, 0.026, postSize*0.94, steel);
      box(px, postHeight - 0.034, pz, postSize*0.98, 0.012, postSize*0.98, yellowFace);
      [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([sx,sz]) => {
        const bx = px + sx*boltOffset, bz = pz + sz*boltOffset;
        cylinder(bx, plateThickness + 0.012, bz, 0.052, 0.018, steel, 16);
        cylinder(bx, plateThickness + 0.031, bz, 0.038, 0.028, darkSteel, 6);
        cylinder(bx, plateThickness + 0.047, bz, 0.023, 0.008, steel, 6);
      });
    });

    // Two independent formed-steel rail members. Each is a slim ribbed beam, NOT a panel.
    // Their vertical centers leave approximately 1.2 ft of visibly empty space between them.
    const railSpan = Math.max(0.5, railLength - postSize * 1.15);
    const railCenters = [1.05, 2.55];
    const railBodyH = 0.20;       // 2.4 in main rail face
    const railDepth = 0.14;
    const lipH = 0.045;
    railCenters.forEach((cy, index) => {
      const rail = new THREE.Group();
      // Slim central face and folded top/bottom edges form one individual rail.
      orientedBox(0, cy, 0, railSpan, railBodyH, railDepth * 0.76, yellowFace, rail);
      orientedBox(0, cy + railBodyH/2 + lipH/2 - 0.006, 0, railSpan, lipH, railDepth, yellow, rail);
      orientedBox(0, cy - railBodyH/2 - lipH/2 + 0.006, 0, railSpan, lipH, railDepth, yellowEdge, rail);
      // Shallow front-facing reinforcing bead along the center of each rail.
      orientedBox(0, cy, railDepth * 0.40, railSpan * 0.94, 0.045, railDepth * 0.42, index === 0 ? yellow : yellowFace, rail);
      // End collars and visible fasteners are limited to each rail's own height.
      [-1,1].forEach(sign => {
        const endAlong = sign * (railSpan/2 - 0.055);
        orientedBox(endAlong, cy, 0, 0.11, railBodyH + lipH*1.5, railDepth*1.08, yellowEdge, rail);
        const pos = sign * postCenterOffset;
        const faceAcross = postSize/2 + railDepth*0.53;
        const x = railAxisZ ? faceAcross : pos;
        const z = railAxisZ ? pos : faceAcross;
        const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.032,0.016,16), steel);
        washer.position.set(x, cy, z);
        if (railAxisZ) washer.rotation.z = Math.PI/2; else washer.rotation.x = Math.PI/2;
        washer.castShadow = true; washer.receiveShadow = true; rail.add(washer);
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.021,0.03,6), darkSteel);
        bolt.position.set(x + (railAxisZ ? 0.012 : 0), cy, z + (railAxisZ ? 0 : 0.012));
        if (railAxisZ) bolt.rotation.z = Math.PI/2; else bolt.rotation.x = Math.PI/2;
        bolt.castShadow = true; rail.add(bolt);
      });
      group.add(rail);
    });
  }

  // Addable structural steel I-beam, running lengthwise along the asset footprint.
  if (type === 'ibeam') {
    // Vertical wide-flange (W-shape) structural steel support column.
    // Built at a nominal 10 ft shaft height; rebuildBinVisual scales Y for user height.
    // Cross-section sits in plan (X/Z); shaft extrudes up Y. Footprint wFt x lFt is the base plate.
    const hFt = 10; // nominal modeled height — scaled externally via heightFt
    const steel = new THREE.MeshStandardMaterial({
      color: colorHex || 0x8b949e, metalness: 0.82, roughness: 0.30
    });
    const steelDark = new THREE.MeshStandardMaterial({
      color: 0x4b5563, metalness: 0.75, roughness: 0.38
    });
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x5b6570, metalness: 0.70, roughness: 0.42
    });
    const boltMat = new THREE.MeshStandardMaterial({
      color: 0x374151, metalness: 0.85, roughness: 0.28
    });
    const yellow = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, metalness: 0.25, roughness: 0.45
    });
    const add = (mesh, x, y, z) => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    // --- Plan proportions (wide-flange column) ---
    const plateW = wFt;
    const plateL = lFt;
    const colW = Math.min(wFt, lFt) * 0.72;          // flange width (X)
    const colD = Math.max(wFt, lFt) * 0.55;          // overall depth flange-to-flange (Z)
    const flangeT = Math.max(0.10, Math.min(0.22, colD * 0.12)); // flange thickness
    const webT = Math.max(0.08, Math.min(0.16, colW * 0.12));    // web thickness
    const fillet = Math.min(0.09, flangeT * 0.55);               // approximate root fillet
    const shaftH = hFt;
    const baseT = 0.18;
    const capT = 0.14;

    // Base plate
    add(new THREE.Mesh(new THREE.BoxGeometry(plateW, baseT, plateL), plateMat), 0, baseT / 2, 0);
    // Chamfer lip under plate edge (visual weight)
    add(new THREE.Mesh(new THREE.BoxGeometry(plateW * 0.92, 0.04, plateL * 0.92), steelDark), 0, 0.02, 0);

    // Anchor bolts: shank + hex nut + washer at four corners
    const bxOff = plateW / 2 - 0.28;
    const bzOff = plateL / 2 - 0.28;
    const boltR = 0.055;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const bx = sx * bxOff, bz = sz * bzOff;
      add(new THREE.Mesh(new THREE.CylinderGeometry(boltR, boltR, 0.32, 12), boltMat), bx, baseT + 0.10, bz);
      add(new THREE.Mesh(new THREE.CylinderGeometry(boltR * 1.8, boltR * 1.8, 0.03, 16), steelDark), bx, baseT + 0.015, bz);
      // hex nut (flattened cylinder approximation)
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(boltR * 1.55, boltR * 1.55, 0.07, 6), boltMat);
      add(nut, bx, baseT + 0.22, bz);
    });

    // Column shaft starts above the base plate
    const y0 = baseT;
    const yMid = y0 + shaftH / 2;

    // North & south flanges (thin plates spanning full height, offset in Z)
    const flangeGeo = new THREE.BoxGeometry(colW, shaftH, flangeT);
    add(new THREE.Mesh(flangeGeo, steel), 0, yMid, -colD / 2 + flangeT / 2);
    add(new THREE.Mesh(flangeGeo, steel), 0, yMid,  colD / 2 - flangeT / 2);

    // Web (connects inner faces of flanges)
    const webDepth = Math.max(0.08, colD - 2 * flangeT);
    add(new THREE.Mesh(new THREE.BoxGeometry(webT, shaftH, webDepth), steel), 0, yMid, 0);

    // Root fillets at each flange-web junction (cylinders running full height)
    const filletR = fillet;
    const filletGeo = new THREE.CylinderGeometry(filletR, filletR, shaftH, 10);
    const zN = -colD / 2 + flangeT;
    const zS =  colD / 2 - flangeT;
    [[-1, zN], [1, zN], [-1, zS], [1, zS]].forEach(([sx, z]) => {
      const f = new THREE.Mesh(filletGeo, steel);
      f.position.set(sx * (webT / 2 + filletR * 0.15), yMid, z + (z < 0 ? filletR * 0.15 : -filletR * 0.15));
      f.castShadow = true;
      group.add(f);
    });

    // Inner fillet filler blocks so the junction reads solid
    const fillT = filletR * 1.1;
    [[-1, zN], [1, zN], [-1, zS], [1, zS]].forEach(([sx, z]) => {
      const fill = new THREE.Mesh(new THREE.BoxGeometry(fillT, shaftH, fillT), steel);
      fill.position.set(sx * (webT / 2 + fillT / 2), yMid, z + (z < 0 ? fillT / 2 : -fillT / 2));
      fill.castShadow = true;
      group.add(fill);
    });

    // Base stiffener plates (gussets between flange and base plate)
    const stiffH = Math.min(1.1, shaftH * 0.12);
    const stiffT = 0.06;
    [-1, 1].forEach((sz) => {
      const z = sz * (colD / 2 - flangeT / 2);
      [-1, 1].forEach((sx) => {
        const st = new THREE.Mesh(new THREE.BoxGeometry(colW * 0.28, stiffH, stiffT), steelDark);
        st.position.set(sx * colW * 0.28, y0 + stiffH / 2, z);
        st.castShadow = true;
        group.add(st);
      });
    });
    [-1, 1].forEach((sx) => {
      const st = new THREE.Mesh(new THREE.BoxGeometry(stiffT, stiffH, webDepth * 0.7), steelDark);
      st.position.set(sx * (webT / 2 + stiffT / 2 + 0.02), y0 + stiffH / 2, 0);
      st.castShadow = true;
      group.add(st);
    });

    // Safety yellow band near base (warehouse hazard marking)
    const bandH = 0.55;
    const bandY = y0 + 0.85;
    const bandPad = 0.03;
    add(new THREE.Mesh(new THREE.BoxGeometry(colW + bandPad * 2, bandH, flangeT + bandPad), yellow),
      0, bandY, -colD / 2 + flangeT / 2);
    add(new THREE.Mesh(new THREE.BoxGeometry(colW + bandPad * 2, bandH, flangeT + bandPad), yellow),
      0, bandY,  colD / 2 - flangeT / 2);
    add(new THREE.Mesh(new THREE.BoxGeometry(webT + bandPad, bandH, webDepth + bandPad * 2), yellow),
      0, bandY, 0);

    // Cap plate on top of column
    const capW = Math.max(colW + 0.15, plateW * 0.72);
    const capL = Math.max(colD + 0.15, plateL * 0.72);
    add(new THREE.Mesh(new THREE.BoxGeometry(capW, capT, capL), plateMat), 0, y0 + shaftH + capT / 2, 0);
    const cxOff = capW / 2 - 0.18;
    const czOff = capL / 2 - 0.18;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8), boltMat),
        sx * cxOff, y0 + shaftH + capT + 0.02, sz * czOff);
    });
    add(new THREE.Mesh(new THREE.BoxGeometry(capW + 0.02, 0.03, capL + 0.02), yellow),
      0, y0 + shaftH + capT + 0.02, 0);
  }

  // Addable jib crane: simplified floor-mounted mast, rotating boom, hoist and hook.
  if (type === 'crane') {
    const hFt = Math.max(2, Number(assetSettings.assetHeight) || 8);
    const dark = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.55, roughness: 0.45 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.7, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(wFt, 0.18, lFt), dark);
    base.position.y = 0.09; group.add(base);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, hFt, 12), mat);
    mast.position.set(-wFt * CRANE_MAST_FRAC, hFt / 2 + 0.18, -lFt * CRANE_MAST_FRAC); group.add(mast);
    const jib = new THREE.Group();
    jib.position.set(-wFt * CRANE_MAST_FRAC, hFt + 0.18, -lFt * CRANE_MAST_FRAC);
    const boomLen = getCraneBoomLength(assetSettings, wFt, lFt);   // independent of the base plate
    const boom = new THREE.Mesh(new THREE.BoxGeometry(boomLen, 0.22, 0.24), mat);
    boom.position.x = boomLen / 2; jib.add(boom);
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.32), dark);
    trolley.position.x = boomLen * 0.65; jib.add(trolley);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,Math.max(0.4,hFt*0.25),8), steel);
    cable.position.set(boomLen*0.65,-Math.max(0.4,hFt*0.25)/2,0); jib.add(cable);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.12,0.035,8,12,Math.PI*1.5), steel);
    hook.position.set(boomLen*0.65,-Math.max(0.4,hFt*0.25)-0.12,0); jib.add(hook);
    jib.rotation.y = -THREE.MathUtils.degToRad(Number(assetSettings.functionAngle) || 0);   // clockwise on the plan
    group.userData.craneJib = jib;
    if (isSelected) {
      // Boom collision box, joined to the mast pivot and swinging with the boom (+ its floor footprint).
      const bw = CRANE_BOOM_BOX_W, boxMat = new THREE.LineBasicMaterial({ color: 0xfb923c });
      const boxEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(boomLen, 0.5, bw)), boxMat);
      boxEdges.position.set(boomLen / 2, 0, 0); jib.add(boxEdges);
      const floorBox = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -bw / 2), new THREE.Vector3(boomLen, 0, -bw / 2),
        new THREE.Vector3(boomLen, 0, bw / 2), new THREE.Vector3(0, 0, bw / 2)]), boxMat);
      floorBox.position.y = -(hFt + 0.18) + 0.05; jib.add(floorBox);
    }
    group.add(jib);
  } else if (type === 'conveyor') {
    // Match the built-in Uline scissor-lift conveyor model: yellow base/frame,
    // four articulated scissor arms, side rails, and a roller deck.
    // Build in design axes (length along local Z), then yaw by facing so Rotate (R)
    // turns the whole unit instead of stretching width/length.
    const requestedDeckHeight = Number(assetSettings.assetHeight);
    const hFt = Number.isFinite(requestedDeckHeight) ? Math.max(1, Math.min(4.2, requestedDeckHeight)) : 3;
    const facing = Number.isInteger(assetSettings.facing)
      ? ((assetSettings.facing % 4) + 4) % 4
      : (assetSettings.rotated ? 1 : 0);
    const isSide = (facing % 2 === 1);
    const cw = isSide ? lFt : wFt;  // build width
    const cl = isSide ? wFt : lFt;  // build length (along local +Z)
    const content = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({
      color: colorHex || 0xeab308, roughness: 0.35, metalness: 0.3
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.25, cl), frameMat);
    base.position.y = 0.125;
    content.add(base);

    const armLength = cl * 0.92;
    const armGeo = new THREE.BoxGeometry(0.18, 0.28, armLength);
    const arm1 = new THREE.Mesh(armGeo, frameMat);
    const arm2 = new THREE.Mesh(armGeo, frameMat);
    const arm3 = new THREE.Mesh(armGeo, frameMat);
    const arm4 = new THREE.Mesh(armGeo, frameMat);
    arm1.position.x = -cw / 2 + Math.min(0.25, cw * 0.2);
    arm2.position.x = -cw / 2 + Math.min(0.45, cw * 0.35);
    arm3.position.x =  cw / 2 - Math.min(0.25, cw * 0.2);
    arm4.position.x =  cw / 2 - Math.min(0.45, cw * 0.35);
    const midY = hFt / 2;
    const armAngle = Math.atan2(hFt - 0.35, Math.max(0.5, cl * 0.85));
    [arm1, arm3].forEach(a => { a.position.y = midY; a.rotation.x = armAngle; });
    [arm2, arm4].forEach(a => { a.position.y = midY; a.rotation.x = -armAngle; });
    content.add(arm1, arm2, arm3, arm4);

    const deckGroup = new THREE.Group();
    const railWidth = Math.min(0.2, cw * 0.12);
    const railL = new THREE.Mesh(new THREE.BoxGeometry(railWidth, 0.35, cl), frameMat);
    railL.position.x = -cw / 2 + railWidth / 2;
    const railR = railL.clone();
    railR.position.x = cw / 2 - railWidth / 2;
    deckGroup.add(railL, railR);

    const rollerMatLocal = new THREE.MeshStandardMaterial({
      color: assetSettings.conveyorRunning === false ? 0x475569 : 0xe2e8f0,
      metalness: 0.7, roughness: 0.25
    });
    const rollerCount = Math.max(3, Math.round(22 * cl / 8));
    const rollerGeo = new THREE.CylinderGeometry(0.1, 0.1, Math.max(0.2, cw - 0.4), 16);
    rollerGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < rollerCount; i++) {
      const roller = new THREE.Mesh(rollerGeo, rollerMatLocal);
      roller.position.z = -cl / 2 + Math.min(0.3, cl * 0.08) +
        (i / Math.max(1, rollerCount - 1)) * Math.max(0.1, cl - Math.min(0.6, cl * 0.16));
      deckGroup.add(roller);
    }
    deckGroup.position.y = hFt;
    content.add(deckGroup);
    content.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][facing];
    group.add(content);
  } else if (type === 'uline_rolling_conveyor') {
    // ========================================================================
    // HIGH-FIDELITY BLUE ULINE ROLLING CONVEYOR (Gravity Roller Conveyor on Casters)
    // Features powder-coated Uline Blue C-channel side frames, closely-spaced
    // 1.9" galvanized steel gravity rollers with hex axle ends, telescoping
    // H-stand support legs with locking knobs, and swivel caster wheels with brakes.
    // Automatically aligns rollers along the conveyor span when rotated (R).
    // ========================================================================
    const requestedDeckHeight = Number(assetSettings.assetHeight);
    const hFt = Number.isFinite(requestedDeckHeight) ? Math.max(1.5, Math.min(4.2, requestedDeckHeight)) : 2.8;
    const isHoriz = !!assetSettings.rotated || (wFt > lFt * 1.15);
    const convW = isHoriz ? lFt : wFt;
    const convL = isHoriz ? wFt : lFt;

    const convGroup = new THREE.Group();
    if (isHoriz) convGroup.rotation.y = Math.PI / 2;

    const ulineBlueMat = new THREE.MeshStandardMaterial({
      color: isSelected ? 0x38bdf8 : (colorHex || 0x1d4ed8),
      roughness: 0.34,
      metalness: 0.38
    });
    const darkBlueTrimMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.42,
      metalness: 0.45
    });
    const galvRollerMat = new THREE.MeshStandardMaterial({
      color: assetSettings.conveyorRunning === false ? 0x64748b : 0xe2e8f0,
      roughness: 0.22,
      metalness: 0.78
    });
    const galvLegMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.30,
      metalness: 0.72
    });
    const wheelTireMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.65,
      metalness: 0.15
    });
    const brakeRedMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.40,
      metalness: 0.25
    });

    // 1. Top Powder-Coated Uline Blue C-Channel Side Rails & End Stops
    const railH = 0.26;
    const railW = Math.min(0.14, Math.max(0.08, convW * 0.07));
    const railCenterY = hFt - railH / 2;
    const railX = convW / 2 - railW / 2;

    const sideRailGeo = new THREE.BoxGeometry(railW, railH, convL);
    const flangeLipGeo = new THREE.BoxGeometry(railW * 1.45, 0.045, convL);
    [-1, 1].forEach(dirX => {
      const sRail = new THREE.Mesh(sideRailGeo, ulineBlueMat);
      sRail.position.set(dirX * railX, railCenterY, 0);
      sRail.castShadow = true;
      sRail.receiveShadow = true;
      convGroup.add(sRail);

      // Upper & lower C-channel inward lips
      const topLip = new THREE.Mesh(flangeLipGeo, darkBlueTrimMat);
      topLip.position.set(dirX * (railX - dirX * railW * 0.18), hFt - 0.02, 0);
      convGroup.add(topLip);

      const botLip = new THREE.Mesh(flangeLipGeo, darkBlueTrimMat);
      botLip.position.set(dirX * (railX - dirX * railW * 0.18), hFt - railH + 0.02, 0);
      convGroup.add(botLip);
    });

    // End frame cross-ties & flip-up package stop bar at one end
    const endTieGeo = new THREE.BoxGeometry(Math.max(0.2, convW - railW * 2), 0.14, 0.10);
    [-convL / 2 + 0.06, convL / 2 - 0.06].forEach(ez => {
      const tie = new THREE.Mesh(endTieGeo, darkBlueTrimMat);
      tie.position.set(0, railCenterY - 0.04, ez);
      convGroup.add(tie);
    });
    // Package stop bar on the +Z end
    const stopBar = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.2, convW - 0.12), 0.12, 0.06), ulineBlueMat);
    stopBar.position.set(0, hFt + 0.06, convL / 2 - 0.04);
    convGroup.add(stopBar);

    // 2. Closely-Spaced Galvanized Steel Gravity Rollers + Hex Axle Pins
    const rollerCount = Math.max(6, Math.round(convL * 3.5));
    const rollerSpan = Math.max(0.2, convW - railW * 2 - 0.02);
    const rollerRadius = 0.075;
    const rollerGeo = new THREE.CylinderGeometry(rollerRadius, rollerRadius, rollerSpan, 14);
    rollerGeo.rotateZ(Math.PI / 2);
    const axleGeo = new THREE.CylinderGeometry(0.024, 0.024, convW + 0.03, 6);
    axleGeo.rotateZ(Math.PI / 2);

    for (let i = 0; i < rollerCount; i++) {
      const rz = -convL / 2 + 0.22 + (i / Math.max(1, rollerCount - 1)) * Math.max(0.1, convL - 0.44);
      const roller = new THREE.Mesh(rollerGeo, galvRollerMat);
      roller.position.set(0, hFt - 0.04, rz);
      roller.castShadow = true;
      roller.receiveShadow = true;
      convGroup.add(roller);

      const axle = new THREE.Mesh(axleGeo, darkBlueTrimMat);
      axle.position.set(0, hFt - 0.04, rz);
      convGroup.add(axle);
    }

    // 3. Telescoping Blue & Galvanized H-Stand Legs + Locking Swivel Casters
    const standPositionsZ = convL >= 9.5
      ? [-convL / 2 + 0.85, 0, convL / 2 - 0.85]
      : [-convL / 2 + Math.min(0.85, convL * 0.18), convL / 2 - Math.min(0.85, convL * 0.18)];

    const casterHeight = 0.34;
    const legTopY = hFt - railH;
    const totalLegH = Math.max(0.5, legTopY - casterHeight);
    const upperBlueLegH = totalLegH * 0.58;
    const lowerGalvLegH = totalLegH * 0.48;
    const legX = Math.max(0.15, convW / 2 - railW - 0.05);

    const upperLegGeo = new THREE.BoxGeometry(0.12, upperBlueLegH, 0.12);
    const lowerLegGeo = new THREE.BoxGeometry(0.085, lowerGalvLegH, 0.085);
    const hCrossBarGeo = new THREE.BoxGeometry(legX * 2, 0.09, 0.09);
    const knobGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8);
    knobGeo.rotateZ(Math.PI / 2);

    const casterPlateGeo = new THREE.BoxGeometry(0.20, 0.04, 0.20);
    const casterYokeGeo = new THREE.BoxGeometry(0.14, 0.16, 0.18);
    const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelHubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.09, 10);
    wheelHubGeo.rotateZ(Math.PI / 2);
    const brakePedalGeo = new THREE.BoxGeometry(0.09, 0.04, 0.12);

    standPositionsZ.forEach((sz, standIdx) => {
      [-1, 1].forEach(dirX => {
        const lx = dirX * legX;
        // Upper blue telescoping tube
        const uLeg = new THREE.Mesh(upperLegGeo, ulineBlueMat);
        uLeg.position.set(lx, legTopY - upperBlueLegH / 2, sz);
        uLeg.castShadow = true;
        convGroup.add(uLeg);

        // Lower galvanized inner telescoping tube
        const lLeg = new THREE.Mesh(lowerLegGeo, galvLegMat);
        lLeg.position.set(lx, casterHeight + lowerGalvLegH / 2, sz);
        lLeg.castShadow = true;
        convGroup.add(lLeg);

        // Height-locking star knob at telescoping joint
        const knob = new THREE.Mesh(knobGeo, wheelTireMat);
        knob.position.set(lx + dirX * 0.08, casterHeight + lowerGalvLegH - 0.06, sz);
        convGroup.add(knob);

        // Swivel caster top plate + yoke + rolling polyurethane wheel + red brake lever
        const cPlate = new THREE.Mesh(casterPlateGeo, galvLegMat);
        cPlate.position.set(lx, casterHeight - 0.02, sz);
        convGroup.add(cPlate);

        const cYoke = new THREE.Mesh(casterYokeGeo, galvLegMat);
        cYoke.position.set(lx, 0.20, sz + 0.03);
        convGroup.add(cYoke);

        const wheel = new THREE.Mesh(wheelGeo, wheelTireMat);
        wheel.position.set(lx, 0.12, sz + 0.04);
        wheel.castShadow = true;
        convGroup.add(wheel);

        const hub = new THREE.Mesh(wheelHubGeo, galvLegMat);
        hub.position.set(lx, 0.12, sz + 0.04);
        convGroup.add(hub);

        const brake = new THREE.Mesh(brakePedalGeo, brakeRedMat);
        brake.position.set(lx, 0.21, sz - 0.07);
        brake.rotation.x = 0.35;
        convGroup.add(brake);
      });

      // Upper & lower H-stand horizontal crossbars
      const topCross = new THREE.Mesh(hCrossBarGeo, ulineBlueMat);
      topCross.position.set(0, legTopY - 0.22, sz);
      convGroup.add(topCross);

      const botCross = new THREE.Mesh(hCrossBarGeo, galvLegMat);
      botCross.position.set(0, casterHeight + 0.28, sz);
      convGroup.add(botCross);

      // Diagonal sway brace on each H-stand
      const diagW = Math.max(0.2, legX * 2);
      const diagH = Math.max(0.2, (legTopY - 0.22) - (casterHeight + 0.28));
      const diagLen = Math.hypot(diagW, diagH);
      const diagBrace = new THREE.Mesh(new THREE.BoxGeometry(diagLen, 0.055, 0.055), ulineBlueMat);
      diagBrace.position.set(0, casterHeight + 0.28 + diagH / 2, sz);
      diagBrace.rotation.z = (standIdx % 2 === 0 ? 1 : -1) * Math.atan2(diagH, diagW);
      convGroup.add(diagBrace);
    });

    // Longitudinal lower tie-rod stringers connecting the H-stands for rolling stability
    if (standPositionsZ.length >= 2) {
      const tieSpanZ = standPositionsZ[standPositionsZ.length - 1] - standPositionsZ[0];
      const stringerGeo = new THREE.BoxGeometry(0.06, 0.07, tieSpanZ);
      [-legX, legX].forEach(lx => {
        const str = new THREE.Mesh(stringerGeo, ulineBlueMat);
        str.position.set(lx, casterHeight + 0.28, 0);
        convGroup.add(str);
      });
    }

    group.add(convGroup);
  // High-Fidelity Industrial Pallet Rack / Shelving Unit (Slotted Uprights, Step Beams, Wire Decking & Footplates)
  } else if (type === 'shelf') {
    const shelfCount = Math.max(2, tiers || 4);
    const hFt = 6.0;
    const wireDeckMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      map: getIndustrialWireMeshTexture(),
      transparent: true,
      alphaTest: 0.15,
      side: THREE.DoubleSide,
      roughness: 0.36,
      metalness: 0.72
    });
    const beamAccentMat = new THREE.MeshStandardMaterial({
      color: isSelected ? 0xfde047 : 0x3b82f6,
      roughness: 0.35,
      metalness: 0.42
    });
    const footPlateMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.68
    });

    for (let i = 0; i < shelfCount; i++) {
      const tierY = i === 0 ? 0.35 : (0.35 + (i / (shelfCount - 1)) * (hFt - 0.65));
      // Perimeter step beams
      const fbBeamGeo = new THREE.BoxGeometry(wFt - 0.04, 0.16, 0.11);
      [-lFt / 2 + 0.08, lFt / 2 - 0.08].forEach(bz => {
        const b = new THREE.Mesh(fbBeamGeo, mat);
        b.position.set(0, tierY, bz);
        b.castShadow = true;
        group.add(b);
      });
      const lrBeamGeo = new THREE.BoxGeometry(0.11, 0.16, lFt - 0.04);
      [-wFt / 2 + 0.08, wFt / 2 - 0.08].forEach(bx => {
        const b = new THREE.Mesh(lrBeamGeo, mat);
        b.position.set(bx, tierY, 0);
        b.castShadow = true;
        group.add(b);
      });
      // Galvanized wire decking + support waterfalls
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.2, wFt - 0.18), Math.max(0.2, lFt - 0.18)), wireDeckMat);
      deck.rotation.x = -Math.PI / 2;
      deck.position.y = tierY + 0.082;
      group.add(deck);

      const underPlate = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.2, wFt - 0.18), 0.04, Math.max(0.2, lFt - 0.18)),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.55 })
      );
      underPlate.position.y = tierY + 0.03;
      underPlate.castShadow = true;
      underPlate.receiveShadow = true;
      group.add(underPlate);
    }

    // 4 Slotted Upright Posts + Bolted Floor Footplates + Side Truss Bracing
    const postGeo = new THREE.BoxGeometry(0.16, hFt, 0.16);
    const footGeo = new THREE.BoxGeometry(0.30, 0.06, 0.30);
    const pxOff = Math.max(0.08, wFt / 2 - 0.09);
    const pzOff = Math.max(0.08, lFt / 2 - 0.09);
    [[-pxOff, -pzOff], [pxOff, -pzOff], [-pxOff, pzOff], [pxOff, pzOff]].forEach(([px, pz]) => {
      const p = new THREE.Mesh(postGeo, beamAccentMat);
      p.position.set(px, hFt / 2, pz);
      p.castShadow = true;
      group.add(p);

      const fp = new THREE.Mesh(footGeo, footPlateMat);
      fp.position.set(px, 0.03, pz);
      group.add(fp);
    });

    // Diagonal side Z-bracing between front & back uprights
    const braceSpanX = Math.max(0.2, wFt - 0.22);
    const diagLen = Math.hypot(braceSpanX, 1.6);
    const diagAngle = Math.atan2(1.6, braceSpanX);
    const diagGeo = new THREE.BoxGeometry(diagLen, 0.06, 0.06);
    [-pzOff, pzOff].forEach(bz => {
      [1.2, 3.0, 4.6].forEach((by, idx) => {
        const d = new THREE.Mesh(diagGeo, footPlateMat);
        d.position.set(0, by, bz);
        d.rotation.z = (idx % 2 === 0 ? 1 : -1) * diagAngle;
        group.add(d);
      });
    });
  } else if (type === 'fixture') {
    // High-Fidelity Industrial Steel Equipment Enclosure / Control Cabinet
    const cabH = 3.0;
    const plinthH = 0.22;
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.5 });
    const trimDarkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.6 });
    const chromeHandleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.22, metalness: 0.85 });

    // Forklift / floor plinth base
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.2, wFt - 0.08), plinthH, Math.max(0.2, lFt - 0.08)), plinthMat);
    plinth.position.y = plinthH / 2;
    plinth.castShadow = true;
    group.add(plinth);

    // Main cabinet body
    const bodyH = cabH - plinthH;
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(wFt, bodyH, lFt), mat);
    fixture.position.y = plinthH + bodyH / 2;
    fixture.castShadow = true;
    fixture.receiveShadow = true;
    group.add(fixture);

    // Top drip-shield overhang cap
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(wFt + 0.06, 0.08, lFt + 0.06), plinthMat);
    topCap.position.y = cabH + 0.02;
    group.add(topCap);

    // Front recessed access doors, center seam, handles & ventilation louvers
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, bodyH - 0.24, lFt + 0.03), trimDarkMat);
    seam.position.set(0, plinthH + bodyH / 2, 0);
    group.add(seam);

    [-0.14, 0.14].forEach(hx => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, lFt + 0.07), chromeHandleMat);
      handle.position.set(hx, plinthH + bodyH * 0.55, 0);
      group.add(handle);
    });
  } else if (type === 'table') {
    // High-Fidelity Industrial Butcher-Block Packing Workbench with Lower Steel Shelf & Leveling Feet
    const topThickness = 0.18;
    const legInset = Math.min(0.22, wFt * 0.12, lFt * 0.12);
    const legWidth = Math.min(0.16, Math.max(0.10, Math.min(wFt, lFt) * 0.055));
    const legHeight = 3.0 - topThickness;
    // Table style: 'packing' (lower shelf, optional overhead shelf/light) or 'monitor' (computer station: monitor on the top, no shelves).
    const isMonitorStation = assetSettings.tableVariant === 'monitor';

    // Separate materials: the table base uses the main object color, while the
    // countertop has its own independent color (default white).
    const requestedTopColor = /^#[0-9a-fA-F]{6}$/.test(assetSettings.tableTopColor || '')
      ? assetSettings.tableTopColor : '#f1ebdd';
    // Keep white work surfaces from clipping bright under the HDR environment
    // and overhead LEDs. Only soften near-white finishes in Realistic Mode;
    // user-selected colors and the CAD-mode appearance remain unchanged.
    const topColor = /^#f[0-9a-f]{5}$/i.test(requestedTopColor)
      ? '#f1ebdd' : requestedTopColor;
    // Rounded tabletop slab with a thick black perimeter band. The black
    // slab forms both the visible side fascia and the border on the top face;
    // the colored work surface is inset by about 1.2 inches on every side.
    const edgeBand = 0.10; // feet (~1.2 in)
    const cornerRadius = Math.min(0.20, Math.min(wFt, lFt) * 0.10);
    const blackEdgeMat = new THREE.MeshStandardMaterial({
      color: 0x111318,
      roughness: 0.38,
      metalness: 0.16
    });
    const butcherTopMat = new THREE.MeshStandardMaterial({
      color: topColor,
      roughness: 0.48,
      metalness: 0.02
    });
    const makeRoundedSlabGeometry = (width, length, depth, radius) => {
      const r = Math.max(0.025, Math.min(radius, width / 2 - 0.01, length / 2 - 0.01));
      const x = width / 2;
      const z = length / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-x + r, -z);
      shape.lineTo(x - r, -z);
      shape.quadraticCurveTo(x, -z, x, -z + r);
      shape.lineTo(x, z - r);
      shape.quadraticCurveTo(x, z, x - r, z);
      shape.lineTo(-x + r, z);
      shape.quadraticCurveTo(-x, z, -x, z - r);
      shape.lineTo(-x, -z + r);
      shape.quadraticCurveTo(-x, -z, -x + r, -z);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 8,
        steps: 1
      });
      // Shape is authored in XY and rotated flat onto the XZ tabletop plane.
      geometry.rotateX(Math.PI / 2);
      return geometry;
    };
    const tabletop = new THREE.Mesh(
      makeRoundedSlabGeometry(wFt, lFt, topThickness, cornerRadius),
      blackEdgeMat
    );
    tabletop.position.y = 3.0;
    tabletop.castShadow = true;
    tabletop.receiveShadow = true;
    group.add(tabletop);

    const insetW = Math.max(0.2, wFt - edgeBand * 2);
    const insetL = Math.max(0.2, lFt - edgeBand * 2);
    const insetTop = new THREE.Mesh(
      makeRoundedSlabGeometry(insetW, insetL, 0.012, Math.max(0.025, cornerRadius - edgeBand)),
      butcherTopMat
    );
    insetTop.position.y = 3.006;
    insetTop.castShadow = true;
    insetTop.receiveShadow = true;
    group.add(insetTop);

    const legMat = new THREE.MeshStandardMaterial({ color: colorHex || '#2563eb', roughness: 0.42, metalness: 0.28 });
    const chromeFootMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.85 });

    // Under-table steel apron frame
    const apronH = 0.16;
    const apronY = 3.0 - topThickness - apronH / 2;
    const apronW = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.2, wFt - legInset * 1.6), apronH, Math.max(0.2, lFt - legInset * 1.6)), legMat);
    apronW.position.y = apronY;
    group.add(apronW);

    [[-wFt/2+legInset,-lFt/2+legInset],[wFt/2-legInset,-lFt/2+legInset],[-wFt/2+legInset,lFt/2-legInset],[wFt/2-legInset,lFt/2-legInset]].forEach(([x,z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legWidth, legHeight, legWidth), legMat);
      leg.position.set(x, legHeight/2, z);
      leg.castShadow = true;
      group.add(leg);

      const footPad = new THREE.Mesh(new THREE.CylinderGeometry(legWidth * 0.8, legWidth * 0.9, 0.06, 12), chromeFootMat);
      footPad.position.set(x, 0.03, z);
      group.add(footPad);
    });

    // Lower galvanized steel storage shelf + cross braces
    const braceY = 0.85;
    const lowerShelf = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.15, wFt - 2 * legInset), 0.07, Math.max(0.15, lFt - 2 * legInset)),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.42, metalness: 0.62 })
    );
    lowerShelf.position.y = braceY;
    lowerShelf.castShadow = true;
    lowerShelf.receiveShadow = true;
    if (!isMonitorStation) group.add(lowerShelf);   // the computer station has no shelf

    // Optional packing-station accessory: raised shelf, support mounts, and
    // overhead fluorescent light. Build it in the table's unrotated local
    // coordinates, then rotate the whole accessory assembly with the table.
    // The base table swaps w/l when rotated, so use the inverse dimensions here
    // before rotating the accessory group to preserve its true orientation.
    if (assetSettings.tableOverheadOption === true && !isMonitorStation) {
      const accessoryGroup = new THREE.Group();
      const tableRotationSteps = Number.isInteger(assetSettings.facing)
        ? ((assetSettings.facing % 4) + 4) % 4
        : (assetSettings.rotated === true ? 1 : 0);
      const isTableRotated = tableRotationSteps % 2 === 1;
      const accessoryW = isTableRotated ? lFt : wFt;
      const accessoryL = isTableRotated ? wFt : lFt;
      const accessoryInset = Math.min(0.22, accessoryW * 0.12, accessoryL * 0.12);
      const mountMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.38, metalness: 0.72 });
      const shelfMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.55, metalness: 0.22 });
      const lightHousingMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.38, metalness: 0.42 });
      const diffuserMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xdbeafe, emissiveIntensity: 0.7, roughness: 0.24, metalness: 0.02 });
      const postH = 2.05;
      const postW = 0.09;
      const postX = Math.max(0.12, accessoryW / 2 - accessoryInset);
      const rearZ = -accessoryL / 2 + Math.max(0.16, Math.min(0.28, accessoryL * 0.08));
      [-postX, postX].forEach(px => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), mountMat);
        post.position.set(px, 3.0 + postH / 2, rearZ);
        post.castShadow = true;
        accessoryGroup.add(post);
      });
      const shelfDepth = Math.max(0.45, Math.min(0.8, accessoryL * 0.24));
      const upperShelf = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.3, accessoryW - 0.18), 0.07, shelfDepth), shelfMat
      );
      upperShelf.position.set(0, 3.75, rearZ + shelfDepth * 0.42);
      upperShelf.castShadow = true;
      upperShelf.receiveShadow = true;
      accessoryGroup.add(upperShelf);
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.25, accessoryW - 0.12), 0.08, 0.08), mountMat);
      crossbar.position.set(0, 5.0, rearZ);
      crossbar.castShadow = true;
      accessoryGroup.add(crossbar);

      // Real mounting structure for the overhead light: short risers extend
      // above the rear crossbar, then two steel cantilever arms run forward
      // from the uprights to the fixture. This removes the previous floating
      // appearance and makes the light visibly supported by the workstation.
      const fixtureBackZ = 0.05 - 0.16;
      const armSpan = Math.max(0.1, fixtureBackZ - rearZ);
      const armMidZ = rearZ + armSpan / 2;
      const armMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.34, metalness: 0.78 });
      [-postX, postX].forEach(px => {
        const riser = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), mountMat);
        riser.position.set(px, 5.13, rearZ);
        riser.castShadow = true;
        accessoryGroup.add(riser);

        const supportArm = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, armSpan), armMat);
        supportArm.position.set(px, 5.22, armMidZ);
        supportArm.castShadow = true;
        accessoryGroup.add(supportArm);

        // Small end plate bolts make the fixture connection readable at close range.
        [-1, 1].forEach(side => {
          const bolt = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10),
            chromeFootMat
          );
          bolt.rotation.z = Math.PI / 2;
          bolt.position.set(px + side * 0.038, 5.22, fixtureBackZ + 0.035);
          accessoryGroup.add(bolt);
        });
      });

      const housing = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.6, accessoryW - 0.35), 0.14, 0.32), lightHousingMat);
      housing.position.set(0, 5.12, 0.05);
      housing.castShadow = true;
      housing.receiveShadow = true;
      accessoryGroup.add(housing);
      // Thin dark rim around the diffuser gives the luminaire a finished edge.
      const lightRim = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.52, accessoryW - 0.44), 0.035, 0.27),
        mountMat
      );
      lightRim.position.set(0, 5.035, 0.05);
      accessoryGroup.add(lightRim);
      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.5, accessoryW - 0.48), 0.025, 0.24), diffuserMat);
      diffuser.position.set(0, 5.012, 0.05);
      diffuser.castShadow = true;
      accessoryGroup.add(diffuser);

      // A short flexible power lead follows the rear frame instead of ending in mid-air.
      const cableMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.72, metalness: 0.05 });
      const cableCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(accessoryW * 0.30, 5.16, 0.12),
        new THREE.Vector3(accessoryW * 0.30, 5.23, -0.02),
        new THREE.Vector3(accessoryW * 0.30, 5.22, rearZ + 0.12),
        new THREE.Vector3(accessoryW * 0.30, 4.98, rearZ + 0.12)
      ]);
      const powerLead = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 16, 0.018, 6, false), cableMat);
      accessoryGroup.add(powerLead);
      // Keep the accessory attached to the same local side through all four
      // quarter-turns, not just the two states of the rotated boolean.
      accessoryGroup.rotation.y = tableRotationSteps * Math.PI / 2;
      group.add(accessoryGroup);
    }

    // Computer station: a monitor standing on the countertop. No lower shelf, no overhead shelf.
    if (isMonitorStation) {
      const stationGroup = new THREE.Group();
      // Same rotation handling as the overhead accessory: build in the table's unrotated frame, then turn with it.
      const stationSteps = Number.isInteger(assetSettings.facing)
        ? ((assetSettings.facing % 4) + 4) % 4
        : (assetSettings.rotated === true ? 1 : 0);
      const stationTurned = stationSteps % 2 === 1;
      const stW = stationTurned ? lFt : wFt;
      const stL = stationTurned ? wFt : lFt;
      const topY = 3.006;                                          // top of the countertop
      const monW = Math.max(0.9, Math.min(1.9, stW - 0.5));        // roughly a 21-24 in monitor, scaled down on narrow tables
      const k = monW / 1.8;
      const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.42, metalness: 0.35 });
      const standMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.38, metalness: 0.6 });
      // A simple lit desktop image so the screen reads as a monitor that is switched on.
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
      const cx = cv.getContext('2d');
      const gr = cx.createLinearGradient(0, 0, 320, 180); gr.addColorStop(0, '#2563eb'); gr.addColorStop(1, '#0f172a');
      cx.fillStyle = gr; cx.fillRect(0, 0, 320, 180);
      cx.fillStyle = 'rgba(248,250,252,0.9)'; cx.fillRect(34, 24, 156, 96);
      cx.fillStyle = '#1e3a8a'; cx.fillRect(34, 24, 156, 12);
      cx.fillStyle = 'rgba(30,41,59,0.9)'; cx.fillRect(46, 48, 90, 6); cx.fillRect(46, 62, 120, 6); cx.fillRect(46, 76, 70, 6);
      cx.fillStyle = 'rgba(15,23,42,0.88)'; cx.fillRect(0, 164, 320, 16);
      const screenTex = new THREE.CanvasTexture(cv);
      const screenMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0 });

      const baseD = 0.62 * k, baseH = 0.03 * k + 0.01;
      const baseZ = -stL / 2 + Math.max(0.35, 0.2 + baseD / 2);    // just inside the rear edge, screen facing the operator (+Z)
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9 * k, baseH, baseD), standMat);
      base.position.set(0, topY + baseH / 2, baseZ); base.castShadow = true; stationGroup.add(base);
      const neckH = 0.5 * k, neckZ = baseZ - baseD * 0.2;
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.13 * k, neckH, 0.07 * k), standMat);
      neck.position.set(0, topY + baseH + neckH / 2, neckZ); neck.castShadow = true; stationGroup.add(neck);
      const panelH = 1.02 * k, panelD = 0.07 * k;
      const panelY = topY + baseH + neckH + panelH / 2 - 0.12 * k;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(monW, panelH, panelD), bezelMat);
      panel.position.set(0, panelY, neckZ + 0.02 * k); panel.castShadow = true; stationGroup.add(panel);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(monW - 0.1 * k, panelH - 0.14 * k), screenMat);
      screen.position.set(0, panelY + 0.025 * k, neckZ + 0.02 * k + panelD / 2 + 0.003); stationGroup.add(screen);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.03 * k, 0.015 * k, 0.01),
        new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.2 }));
      led.position.set(monW / 2 - 0.1 * k, panelY - panelH / 2 + 0.05 * k, neckZ + 0.02 * k + panelD / 2 + 0.004); stationGroup.add(led);
      stationGroup.rotation.y = stationSteps * Math.PI / 2;
      group.add(stationGroup);
    }
  } else if (type === 'large') {
    // ========================================================================
    // HIGH-FIDELITY LARGE OPEN-SIDED CORRUGATED STEEL HOPPER BIN (HOLLOW 3D)
    // Features 3 closed corrugated steel walls, 1 open access side (+Z local),
    // true hollow interior cavity, recessed floor deck, forklift pockets,
    // corner columns, and 4-corner pyramid stacking targets.
    // ========================================================================
    const defaultFacing = (assetSettings.x !== undefined && assetSettings.x <= 8) ? 1 : (assetSettings.rotated ? 1 : 0);
    const facing = Number.isInteger(assetSettings.facing) ? ((assetSettings.facing % 4) + 4) % 4 : defaultFacing;
    const isSideRotated = (facing % 2 === 1);
    const mouthW = isSideRotated ? lFt : wFt;
    const depthL = isSideRotated ? wFt : lFt;
    const rotAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

    const baseColorObj = new THREE.Color(colorHex || defaultColor);
    const darkTrimColor = baseColorObj.clone().multiplyScalar(0.68);
    const innerWallColor = baseColorObj.clone().multiplyScalar(0.52);

    const trimMat = new THREE.MeshStandardMaterial({
      color: isSelected ? 0xfde047 : darkTrimColor,
      roughness: 0.38,
      metalness: 0.42
    });
    const innerMat = new THREE.MeshStandardMaterial({
      color: innerWallColor,
      roughness: 0.62,
      metalness: 0.35
    });
    const floorDeckMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.72,
      metalness: 0.48
    });
    const skidSteelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.50,
      metalness: 0.60
    });
    const lugMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.35,
      metalness: 0.75
    });

    for (let t = 0; t < tiers; t++) {
      const yBase = t * tierH;
      const tierGroup = new THREE.Group();
      tierGroup.rotation.y = rotAngles[facing];

      const wallT = Math.min(0.12, Math.max(0.08, Math.min(mouthW, depthL) * 0.03));
      const postSize = Math.min(0.18, Math.max(0.12, Math.min(mouthW, depthL) * 0.045));
      const baseDeckY = yBase + 0.36;
      const deckThick = 0.10;
      const wallBottomY = baseDeckY + deckThick;
      const wallTopY = yBase + tierH - 0.04;
      const wallH = Math.max(0.4, wallTopY - wallBottomY);

      // 1. 4 Flared Corner Stacking Feet + Receiver Cups
      const footInsetX = mouthW / 2 - 0.20;
      const footInsetZ = depthL / 2 - 0.20;
      const footCupGeo = new THREE.BoxGeometry(0.40, 0.07, 0.40);
      const footLegGeo = new THREE.BoxGeometry(0.28, 0.30, 0.28);
      [
        [-footInsetX, -footInsetZ],
        [ footInsetX, -footInsetZ],
        [-footInsetX,  footInsetZ],
        [ footInsetX,  footInsetZ]
      ].forEach(([fx, fz]) => {
        const cup = new THREE.Mesh(footCupGeo, skidSteelMat);
        cup.position.set(fx, yBase + 0.035, fz);
        cup.castShadow = true;
        tierGroup.add(cup);

        const leg = new THREE.Mesh(footLegGeo, trimMat);
        leg.position.set(fx, yBase + 0.21, fz);
        leg.castShadow = true;
        tierGroup.add(leg);
      });

      // 2. Heavy-Duty Forklift Entry Skids / Pockets (Front-to-Back Channels)
      const skidOffsetX = Math.max(0.35, mouthW * 0.27);
      const skidLen = Math.max(0.4, depthL - 0.24);
      const skidOuterGeo = new THREE.BoxGeometry(0.32, 0.18, skidLen);
      const skidCavityGeo = new THREE.BoxGeometry(0.22, 0.11, skidLen + 0.02);
      const cavityDarkMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
      [-skidOffsetX, skidOffsetX].forEach(sx => {
        const skid = new THREE.Mesh(skidOuterGeo, skidSteelMat);
        skid.position.set(sx, yBase + 0.25, 0);
        skid.castShadow = true;
        tierGroup.add(skid);

        const hole = new THREE.Mesh(skidCavityGeo, cavityDarkMat);
        hole.position.set(sx, yBase + 0.24, 0);
        tierGroup.add(hole);
      });

      // Under-deck structural crossbars
      const crossSpan = Math.max(0.3, mouthW - 0.36);
      const crossGeo = new THREE.BoxGeometry(crossSpan, 0.10, 0.14);
      [-depthL * 0.28, 0, depthL * 0.28].forEach(cz => {
        const cb = new THREE.Mesh(crossGeo, skidSteelMat);
        cb.position.set(0, yBase + 0.31, cz);
        tierGroup.add(cb);
      });

      // 3. Recessed Heavy Steel Floor Plate & Dark Interior Wear Deck
      const outerFloor = new THREE.Mesh(
        new THREE.BoxGeometry(mouthW - 0.08, deckThick, depthL - 0.08),
        mat
      );
      outerFloor.position.set(0, baseDeckY + deckThick / 2, 0);
      outerFloor.castShadow = true;
      outerFloor.receiveShadow = true;
      tierGroup.add(outerFloor);

      const innerFloor = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.2, mouthW - wallT * 2 - 0.06), 0.025, Math.max(0.2, depthL - wallT * 2 - 0.06)),
        floorDeckMat
      );
      innerFloor.position.set(0, wallBottomY + 0.012, 0.02);
      innerFloor.receiveShadow = true;
      tierGroup.add(innerFloor);

      // Floor non-slip tread ribs inside the open cavity
      const floorRibCount = 4;
      const floorRibGeo = new THREE.BoxGeometry(Math.max(0.2, mouthW - wallT * 2 - 0.24), 0.02, 0.05);
      for (let r = 1; r <= floorRibCount; r++) {
        const fRib = new THREE.Mesh(floorRibGeo, skidSteelMat);
        const rz = -depthL / 2 + (depthL / (floorRibCount + 1)) * r;
        fRib.position.set(0, wallBottomY + 0.025, rz);
        tierGroup.add(fRib);
      }

      // 4. Three Closed Corrugated Steel Walls (Back -Z, Left -X, Right +X)
      const wallCenterY = wallBottomY + wallH / 2;

      // Back Wall (-Z)
      const backWallW = Math.max(0.2, mouthW - postSize * 1.2);
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(backWallW, wallH, wallT), mat);
      backWall.position.set(0, wallCenterY, -depthL / 2 + wallT / 2 + 0.04);
      backWall.castShadow = true;
      backWall.receiveShadow = true;
      tierGroup.add(backWall);

      const backInnerLiner = new THREE.Mesh(new THREE.BoxGeometry(backWallW - 0.06, wallH - 0.08, 0.02), innerMat);
      backInnerLiner.position.set(0, wallCenterY, -depthL / 2 + wallT + 0.045);
      tierGroup.add(backInnerLiner);

      // Left (-X) & Right (+X) Side Walls
      const sideWallL = Math.max(0.2, depthL - postSize * 1.2);
      const sideWallGeo = new THREE.BoxGeometry(wallT, wallH, sideWallL);
      const sideInnerGeo = new THREE.BoxGeometry(0.02, wallH - 0.08, sideWallL - 0.06);
      [-1, 1].forEach(dirX => {
        const sw = new THREE.Mesh(sideWallGeo, mat);
        sw.position.set(dirX * (mouthW / 2 - wallT / 2 - 0.04), wallCenterY, 0);
        sw.castShadow = true;
        sw.receiveShadow = true;
        tierGroup.add(sw);

        const sLiner = new THREE.Mesh(sideInnerGeo, innerMat);
        sLiner.position.set(dirX * (mouthW / 2 - wallT - 0.045), wallCenterY, 0);
        tierGroup.add(sLiner);
      });

      // Horizontal pressed steel corrugation ribs on Back, Left, and Right walls
      const ribCount = 4;
      const backRibGeo = new THREE.BoxGeometry(backWallW + 0.02, 0.09, 0.055);
      const sideRibGeo = new THREE.BoxGeometry(0.055, 0.09, sideWallL + 0.02);
      for (let r = 0; r < ribCount; r++) {
        const ry = wallBottomY + 0.28 + (r / Math.max(1, ribCount - 1)) * (wallH - 0.56);
        const bRib = new THREE.Mesh(backRibGeo, trimMat);
        bRib.position.set(0, ry, -depthL / 2 + 0.025);
        bRib.castShadow = true;
        tierGroup.add(bRib);

        [-1, 1].forEach(dirX => {
          const sRib = new THREE.Mesh(sideRibGeo, trimMat);
          sRib.position.set(dirX * (mouthW / 2 - 0.025), ry, 0);
          sRib.castShadow = true;
          tierGroup.add(sRib);
        });
      }

      // Vertical middle stiffener columns on Back, Left, and Right walls
      const vertStiffBack = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH, 0.07), trimMat);
      vertStiffBack.position.set(0, wallCenterY, -depthL / 2 + 0.03);
      tierGroup.add(vertStiffBack);
      [-1, 1].forEach(dirX => {
        const vertStiffSide = new THREE.Mesh(new THREE.BoxGeometry(0.07, wallH, 0.12), trimMat);
        vertStiffSide.position.set(dirX * (mouthW / 2 - 0.03), wallCenterY, 0);
        tierGroup.add(vertStiffSide);
      });

      // 5. Four Structural Corner Posts & Top Pyramid Stacking Lugs
      const postH = tierH - 0.30;
      const postGeo = new THREE.BoxGeometry(postSize, postH, postSize);
      const capPlateGeo = new THREE.BoxGeometry(postSize + 0.06, 0.06, postSize + 0.06);
      const lugConeGeo = new THREE.ConeGeometry(0.08, 0.11, 4);
      const postX = mouthW / 2 - postSize / 2 - 0.03;
      const postZ = depthL / 2 - postSize / 2 - 0.03;
      [
        [-postX, -postZ],
        [ postX, -postZ],
        [-postX,  postZ],
        [ postX,  postZ]
      ].forEach(([px, pz]) => {
        const post = new THREE.Mesh(postGeo, trimMat);
        post.position.set(px, yBase + 0.30 + postH / 2, pz);
        post.castShadow = true;
        tierGroup.add(post);

        const cap = new THREE.Mesh(capPlateGeo, lugMat);
        cap.position.set(px, yBase + tierH - 0.02, pz);
        tierGroup.add(cap);

        const lug = new THREE.Mesh(lugConeGeo, lugMat);
        lug.rotation.y = Math.PI / 4;
        lug.position.set(px, yBase + tierH + 0.055, pz);
        tierGroup.add(lug);
      });

      // Top Reinforced Tubular Rim along the 3 closed walls (Back, Left, Right)
      // Open side (+Z) has NO top bar so the front access and interior remain completely open!
      const rimThick = 0.14;
      const rimH = 0.11;
      const backRim = new THREE.Mesh(new THREE.BoxGeometry(mouthW - 0.06, rimH, rimThick), trimMat);
      backRim.position.set(0, yBase + tierH - rimH / 2 - 0.02, -depthL / 2 + rimThick / 2 + 0.03);
      tierGroup.add(backRim);

      const sideRimGeo = new THREE.BoxGeometry(rimThick, rimH, depthL - 0.06);
      [-1, 1].forEach(dirX => {
        const sRim = new THREE.Mesh(sideRimGeo, trimMat);
        sRim.position.set(dirX * (mouthW / 2 - rimThick / 2 - 0.03), yBase + tierH - rimH / 2 - 0.02, 0);
        tierGroup.add(sRim);
      });

      // 6. Open Side (+Z) Low Spill-Retaining Sill Lip & Angled Corner Gussets
      // Keeps 88% of the front wall wide open while giving a realistic hopper front sill
      const sillH = 0.30;
      const sillW = Math.max(0.2, mouthW - postSize * 2 - 0.04);
      const frontSill = new THREE.Mesh(new THREE.BoxGeometry(sillW, sillH, wallT), mat);
      frontSill.position.set(0, wallBottomY + sillH / 2, depthL / 2 - wallT / 2 - 0.04);
      frontSill.castShadow = true;
      tierGroup.add(frontSill);

      const frontSillCap = new THREE.Mesh(new THREE.BoxGeometry(sillW + 0.02, 0.06, wallT + 0.04), trimMat);
      frontSillCap.position.set(0, wallBottomY + sillH + 0.02, depthL / 2 - wallT / 2 - 0.04);
      tierGroup.add(frontSillCap);

      // Angled front hopper corner gussets (bottom & top corners of the open mouth)
      const gussetW = Math.min(0.32, mouthW * 0.09);
      const gussetGeo = new THREE.BoxGeometry(gussetW, 0.42, wallT);
      [-1, 1].forEach(dirX => {
        const botGusset = new THREE.Mesh(gussetGeo, trimMat);
        botGusset.position.set(
          dirX * (mouthW / 2 - postSize - gussetW / 2 - 0.02),
          wallBottomY + sillH + 0.18,
          depthL / 2 - wallT / 2 - 0.04
        );
        tierGroup.add(botGusset);
      });

      // Stenciled industrial identification plate on the front-left post
      const badgePlate = new THREE.Mesh(
        new THREE.BoxGeometry(postSize * 0.85, 0.28, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
      );
      badgePlate.position.set(-postX, wallTopY - 0.42, depthL / 2 - 0.02);
      tierGroup.add(badgePlate);

      group.add(tierGroup);
    }
  } else if (type === 'small') {
    // ========================================================================
    // HIGH-FIDELITY SMALL INDUSTRIAL WIRE MESH BIN (COLLAPSIBLE BULK CONTAINER)
    // Features see-through welded galvanized wire mesh walls, hollow interior,
    // heavy steel base frame, corrugated galvanized deck, flared pyramid
    // stacking feet, and a half-drop front gate with safety latches & ID plate.
    // ========================================================================
    const defaultFacing = assetSettings.rotated ? 1 : 0;
    const facing = Number.isInteger(assetSettings.facing) ? ((assetSettings.facing % 4) + 4) % 4 : defaultFacing;
    const isSideRotated = (facing % 2 === 1);
    const mouthW = isSideRotated ? lFt : wFt;
    const depthL = isSideRotated ? wFt : lFt;
    const rotAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

    const wireTex = getIndustrialWireMeshTexture();
    const meshWallMat = new THREE.MeshStandardMaterial({
      color: isSelected ? 0xfef08a : 0xe2e8f0,
      map: wireTex,
      transparent: true,
      alphaTest: 0.16,
      side: THREE.DoubleSide,
      roughness: 0.32,
      metalness: 0.78
    });
    const galvSteelMat = new THREE.MeshStandardMaterial({
      color: isSelected ? 0xfde047 : 0xcbd5e1,
      roughness: 0.34,
      metalness: 0.72
    });
    const galvDeckMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.48,
      metalness: 0.62
    });
    const latchMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.35,
      metalness: 0.30
    });
    const placardMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.50,
      metalness: 0.25
    });

    for (let t = 0; t < tiers; t++) {
      const yBase = t * tierH;
      const tierGroup = new THREE.Group();
      tierGroup.rotation.y = rotAngles[facing];

      const postSize = 0.13;
      const baseFrameY = yBase + 0.34;
      const baseFrameH = 0.12;
      const wallBottomY = baseFrameY + baseFrameH;
      const wallTopY = yBase + tierH - 0.04;
      const wallH = Math.max(0.4, wallTopY - wallBottomY);

      // 1. 4 Flared Pyramid / Cup Stacking Feet
      const footX = mouthW / 2 - 0.16;
      const footZ = depthL / 2 - 0.16;
      const cupFlangeGeo = new THREE.BoxGeometry(0.34, 0.05, 0.34);
      const pyramidGeo = new THREE.ConeGeometry(0.20, 0.16, 4);
      const legStubGeo = new THREE.BoxGeometry(0.14, 0.26, 0.14);
      [
        [-footX, -footZ],
        [ footX, -footZ],
        [-footX,  footZ],
        [ footX,  footZ]
      ].forEach(([fx, fz]) => {
        const flange = new THREE.Mesh(cupFlangeGeo, galvSteelMat);
        flange.position.set(fx, yBase + 0.025, fz);
        flange.castShadow = true;
        tierGroup.add(flange);

        const cone = new THREE.Mesh(pyramidGeo, galvSteelMat);
        cone.rotation.y = Math.PI / 4;
        cone.position.set(fx, yBase + 0.11, fz);
        tierGroup.add(cone);

        const stub = new THREE.Mesh(legStubGeo, mat);
        stub.position.set(fx, yBase + 0.22, fz);
        stub.castShadow = true;
        tierGroup.add(stub);
      });

      // 2. Heavy-Duty Base Perimeter Frame & Under-Deck Fork Stirrups
      const baseRailFrontBackGeo = new THREE.BoxGeometry(mouthW - 0.06, baseFrameH, 0.14);
      [-depthL / 2 + 0.11, depthL / 2 - 0.11].forEach(rz => {
        const rail = new THREE.Mesh(baseRailFrontBackGeo, mat);
        rail.position.set(0, baseFrameY + baseFrameH / 2, rz);
        rail.castShadow = true;
        tierGroup.add(rail);
      });
      const baseRailSideGeo = new THREE.BoxGeometry(0.14, baseFrameH, depthL - 0.06);
      [-mouthW / 2 + 0.11, mouthW / 2 - 0.11].forEach(rx => {
        const rail = new THREE.Mesh(baseRailSideGeo, mat);
        rail.position.set(rx, baseFrameY + baseFrameH / 2, 0);
        rail.castShadow = true;
        tierGroup.add(rail);
      });

      // Galvanized Corrugated Steel Floor Deck (Hollow Open Interior Base)
      const deckPlate = new THREE.Mesh(
        new THREE.BoxGeometry(mouthW - 0.22, 0.05, depthL - 0.22),
        galvDeckMat
      );
      deckPlate.position.set(0, baseFrameY + 0.06, 0);
      deckPlate.receiveShadow = true;
      tierGroup.add(deckPlate);

      // Deck stiffening ribs & under-deck fork channels
      const deckRibCount = 5;
      const deckRibGeo = new THREE.BoxGeometry(mouthW - 0.26, 0.04, 0.07);
      for (let i = 1; i <= deckRibCount; i++) {
        const dz = -depthL / 2 + (depthL / (deckRibCount + 1)) * i;
        const drib = new THREE.Mesh(deckRibGeo, galvSteelMat);
        drib.position.set(0, baseFrameY + 0.09, dz);
        tierGroup.add(drib);
      }

      // Fork-entry under-deck runners
      const runnerGeo = new THREE.BoxGeometry(0.18, 0.12, depthL - 0.20);
      [-mouthW * 0.26, mouthW * 0.26].forEach(rx => {
        const runner = new THREE.Mesh(runnerGeo, galvSteelMat);
        runner.position.set(rx, yBase + 0.28, 0);
        tierGroup.add(runner);
      });

      // 3. 4 Vertical Angle-Iron Corner Posts & Top Stacking Ears
      const postH = tierH - 0.30;
      const postGeo = new THREE.BoxGeometry(postSize, postH, postSize);
      const earGeo = new THREE.BoxGeometry(0.18, 0.12, 0.05);
      const px = mouthW / 2 - postSize / 2 - 0.04;
      const pz = depthL / 2 - postSize / 2 - 0.04;
      [
        [-px, -pz],
        [ px, -pz],
        [-px,  pz],
        [ px,  pz]
      ].forEach(([cx, cz]) => {
        const post = new THREE.Mesh(postGeo, mat);
        post.position.set(cx, yBase + 0.32 + postH / 2, cz);
        post.castShadow = true;
        tierGroup.add(post);

        const ear = new THREE.Mesh(earGeo, galvSteelMat);
        ear.position.set(cx, yBase + tierH + 0.03, cz);
        tierGroup.add(ear);
      });

      // 4. See-Through Galvanized Wire Mesh Walls (Back, Left, Right)
      const backMeshW = Math.max(0.2, mouthW - postSize * 2 - 0.06);
      const sideMeshL = Math.max(0.2, depthL - postSize * 2 - 0.06);
      const wallCenterY = wallBottomY + wallH / 2;

      // Back wire mesh panel (-Z)
      const backMesh = new THREE.Mesh(new THREE.PlaneGeometry(backMeshW, wallH), meshWallMat);
      backMesh.position.set(0, wallCenterY, -pz);
      tierGroup.add(backMesh);

      // Left (-X) & Right (+X) wire mesh panels
      const sideMeshGeo = new THREE.PlaneGeometry(sideMeshL, wallH);
      [-1, 1].forEach(dirX => {
        const sMesh = new THREE.Mesh(sideMeshGeo, meshWallMat);
        sMesh.rotation.y = Math.PI / 2;
        sMesh.position.set(dirX * px, wallCenterY, 0);
        tierGroup.add(sMesh);
      });

      // Top & Mid-Height Galvanized Frame Bars on Back, Left, Right
      const backBarGeo = new THREE.BoxGeometry(backMeshW + 0.04, 0.065, 0.065);
      const sideBarGeo = new THREE.BoxGeometry(0.065, 0.065, sideMeshL + 0.04);
      [wallTopY - 0.03, wallBottomY + wallH * 0.52].forEach(by => {
        const bBar = new THREE.Mesh(backBarGeo, galvSteelMat);
        bBar.position.set(0, by, -pz);
        tierGroup.add(bBar);

        [-1, 1].forEach(dirX => {
          const sBar = new THREE.Mesh(sideBarGeo, galvSteelMat);
          sBar.position.set(dirX * px, by, 0);
          tierGroup.add(sBar);
        });
      });

      // Vertical wire-mesh stiffener ribs on Back, Left, Right
      const vertStiffGeo = new THREE.BoxGeometry(0.055, wallH, 0.055);
      [-backMeshW * 0.26, backMeshW * 0.26].forEach(vx => {
        const vs = new THREE.Mesh(vertStiffGeo, galvSteelMat);
        vs.position.set(vx, wallCenterY, -pz);
        tierGroup.add(vs);
      });
      [-sideMeshL * 0.26, sideMeshL * 0.26].forEach(vz => {
        [-1, 1].forEach(dirX => {
          const vs = new THREE.Mesh(vertStiffGeo, galvSteelMat);
          vs.position.set(dirX * px, wallCenterY, vz);
          tierGroup.add(vs);
        });
      });

      // 5. Front Wall (+Z): Half-Drop Access Gate with Hinge Bar, Safety Latches & ID Placard
      const lowerGateH = wallH * 0.48;
      const upperGateH = wallH * 0.48;

      // Lower fixed wire mesh panel
      const frontLowerMesh = new THREE.Mesh(new THREE.PlaneGeometry(backMeshW, lowerGateH), meshWallMat);
      frontLowerMesh.position.set(0, wallBottomY + lowerGateH / 2, pz);
      tierGroup.add(frontLowerMesh);

      // Central horizontal hinge bar dividing the half-drop gate
      const hingeY = wallBottomY + lowerGateH + 0.02;
      const hingeBar = new THREE.Mesh(new THREE.BoxGeometry(backMeshW + 0.06, 0.08, 0.08), mat);
      hingeBar.position.set(0, hingeY, pz);
      tierGroup.add(hingeBar);

      // Upper half-drop gate wire mesh panel + top latch tube
      const frontUpperMesh = new THREE.Mesh(new THREE.PlaneGeometry(backMeshW - 0.06, upperGateH - 0.04), meshWallMat);
      frontUpperMesh.position.set(0, hingeY + 0.04 + upperGateH / 2, pz - 0.015);
      tierGroup.add(frontUpperMesh);

      const gateTopBar = new THREE.Mesh(new THREE.BoxGeometry(backMeshW, 0.075, 0.075), galvSteelMat);
      gateTopBar.position.set(0, wallTopY - 0.04, pz - 0.01);
      tierGroup.add(gateTopBar);

      // Red sliding spring-bolt gate latches on top-left and top-right of front drop gate
      const latchGeo = new THREE.BoxGeometry(0.24, 0.10, 0.11);
      [-px + 0.18, px - 0.18].forEach(lx => {
        const latch = new THREE.Mesh(latchGeo, latchMat);
        latch.position.set(lx, wallTopY - 0.04, pz + 0.02);
        tierGroup.add(latch);
      });

      // Welded dark sheet-metal Inventory ID Card / Label Plate on front upper gate
      const placard = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.03), placardMat);
      placard.position.set(0, hingeY + upperGateH * 0.52, pz + 0.025);
      tierGroup.add(placard);

      group.add(tierGroup);
    }
  // Guardrails have their own open-frame geometry above; never add the generic solid bin body.
  } else if (type !== 'pallet' && type !== 'palletpal' && type !== 'guardrail') for (let t = 0; t < tiers; t++) {
    const yBase = t * tierH;
    const body = new THREE.Mesh(new THREE.BoxGeometry(wFt - 0.08, tierH - 0.35, lFt - 0.08), mat);
    body.position.y = yBase + 0.35 + (tierH - 0.35) / 2;
    body.castShadow = true;
    group.add(body);
  }

  // Soft Ambient Occlusion Ground Contact Shadow under every asset for realistic floor grounding
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(wFt * 1.18, lFt * 1.18).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      opacity: realisticMode ? 0.62 : 0.22,
      depthWrite: false
    })
  );
  contactShadow.position.y = 0.016;
  group.add(contactShadow);

  // CAD Wireframe Outline: in Realistic Mode, show bounding wireframe ONLY when an asset is selected
  const totalH = type === 'pallet' ? (Number(assetSettings.heightFt) || 0.45) * Math.max(1, Math.min(PALLET_STACK_MAX, Math.round(Number(tiers)) || 1)) : type === 'palletpal' ? (Number(assetSettings.heightFt) || 3) : type === 'table' ? (assetSettings.tableVariant === 'monitor' ? 4.7 : (assetSettings.tableOverheadOption === true ? 5.25 : 3.0)) : type === 'fixture' ? 3.0 : type === 'shelf' ? 6.0 : type === 'guardrail' ? (Number(assetSettings.heightFt) || 3.5) : type === 'ibeam' ? (Number(assetSettings.heightFt) || 10) : type === 'crane' ? (Number(assetSettings.assetHeight) || 8) + 0.5 : (type === 'conveyor' || type === 'uline_rolling_conveyor') ? (Number(assetSettings.assetHeight) || (type === 'uline_rolling_conveyor' ? 2.8 : 3)) + 0.2 : tiers * tierH;
  if (isSelected || (!realisticMode && !['large', 'small'].includes(type))) {
    const boxEdge = new THREE.EdgesGeometry(new THREE.BoxGeometry(wFt, totalH, lFt));
    const wire = new THREE.LineSegments(
      boxEdge,
      new THREE.LineBasicMaterial({ color: isSelected ? 0xfef08a : 0xffffff })
    );
    wire.position.y = totalH / 2;
    group.add(wire);
  }

  // Interactive corner & edge resize handles when selected
  if (isSelected) {
    const handleMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const handleGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const corners = [
      { dir: 'nw', x: -wFt / 2, z: -lFt / 2 },
      { dir: 'ne', x:  wFt / 2, z: -lFt / 2 },
      { dir: 'sw', x: -wFt / 2, z:  lFt / 2 },
      { dir: 'se', x:  wFt / 2, z:  lFt / 2 }
    ];
    corners.forEach(c => {
      const hMesh = new THREE.Mesh(handleGeo, handleMat);
      hMesh.position.set(c.x, Math.min(totalH, 3.2), c.z);
      hMesh.userData.resizeHandle = c.dir;
      group.add(hMesh);
    });
  }

  return group;
}