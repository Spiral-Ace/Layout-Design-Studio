/* ============================================================================
   HOME ASSETS for Layout Design Studio  (home mode furniture)

   Types added (registered into NewAssets, so every existing hook that already
   handles NewAssets types - spawn, heights, names, save/load, rotation, selection
   box and resize handles - works for these with no extra code):
     'bed'       Queen bed with headboard, mattress, comforter and two pillows
     'dresser'   6-drawer dresser with bar pulls
     'loveseat'  Two-seat loveseat with rolled arms, back cushions, throw pillows

   Same conventions as new-assets.js: feet, Y up, group centred on its X/Z
   footprint, floor at y = 0, "front" faces +Z, colorHex = main colour
   (bed: comforter, dresser: wood body, loveseat: upholstery).

   LOAD ORDER: after new-assets.js, before app.js.
   ============================================================================ */
(function () {
  'use strict';
  if (typeof NewAssets === 'undefined' || typeof NewAssets.register !== 'function') {
    console.warn('home-assets.js: NewAssets.register() not found - load new-assets.js first.');
    return;
  }
  const H = NewAssets.helpers;
  const mat = H.mat, bx = H.bx, cyl = H.cyl;

  // lighten / darken a colour string by dl (-1..1 in HSL lightness)
  function shade(color, dl) { return new THREE.Color(color).offsetHSL(0, 0, dl).getHex(); }

  // ------------------------------------------------------------------ BED
  function buildBed(g, w, l, color) {
    const wood = mat(0x6b4a2f, 0.7, 0.05), woodD = mat(0x4f3622, 0.75, 0.05);
    const panel = mat(0x7d5a3b, 0.8, 0.02), linen = mat(0xf1ede5, 0.95, 0);
    const duvet = mat(color, 0.92, 0), duvetL = mat(shade(color, 0.1), 0.92, 0);
    const pillowM = mat(0xfaf8f4, 0.95, 0);
    const hb = 0.4, legS = 0.28, legH = 0.45, frameH = 0.6, mattH = 0.8;
    const topFrame = legH + frameH;            // 1.05
    const topMatt = topFrame + mattH;          // 1.85

    // legs
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      bx(g, c[0] * (w / 2 - legS / 2), 0, c[1] * (l / 2 - legS / 2), legS, legH, legS, woodD);
    });
    // headboard (tall, at the back / -Z) with an inset panel
    bx(g, 0, 0.2, -l / 2 + hb / 2, w, 3.3, hb, wood);
    bx(g, 0, 1.5, -l / 2 + hb + 0.04, w - 0.5, 1.8, 0.08, panel);
    // side rails + platform
    bx(g, 0, legH, hb / 2, w, frameH, l - hb, wood);
    // mattress
    const md = l - hb - 0.1, mz = (hb - 0.06) / 2;
    bx(g, 0, topFrame, mz, w - 0.24, mattH, md, linen);
    // comforter: covers the foot ~64% of the mattress, with side + foot drops
    const zFront = l / 2 - 0.06, cd = md * 0.64, cz = zFront - cd / 2;
    bx(g, 0, topMatt, cz, w - 0.1, 0.12, cd + 0.04, duvet);
    bx(g, -(w - 0.1) / 2, topMatt - 0.5, cz, 0.08, 0.62, cd + 0.04, duvet);
    bx(g, (w - 0.1) / 2, topMatt - 0.5, cz, 0.08, 0.62, cd + 0.04, duvet);
    bx(g, 0, topMatt - 0.5, zFront + 0.02, w - 0.1, 0.62, 0.08, duvet);
    // folded-back band at the top edge of the comforter
    bx(g, 0, topMatt, zFront - cd + 0.28, w - 0.1, 0.17, 0.56, duvetL);
    // two pillows
    const pw = (w - 0.24) / 2 - 0.18;
    [-1, 1].forEach(function (sx) {
      const p = bx(g, sx * (pw / 2 + 0.1), topMatt, -l / 2 + hb + 0.62, pw, 0.3, 1.0, pillowM);
      p.rotation.x = -0.12;
    });
  }

  // -------------------------------------------------------------- DRESSER
  function buildDresser(g, w, l, color) {
    const body = mat(color, 0.62, 0.04), face = mat(shade(color, 0.05), 0.58, 0.04);
    const topM = mat(shade(color, -0.05), 0.45, 0.06), legM = mat(shade(color, -0.12), 0.7, 0.04);
    const metal = mat(0x2b2f36, 0.35, 0.85);
    const legH = 0.3, bodyH = 2.2;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      cyl(g, c[0] * (w / 2 - 0.28), legH / 2, c[1] * (l / 2 - 0.22), 0.09, 0.06, legH, legM, 'y', 12);
    });
    bx(g, 0, legH, 0, w, bodyH, l, body);
    bx(g, 0, legH + bodyH, 0, w + 0.08, 0.14, l + 0.08, topM);   // top slab, slight overhang
    // 3 rows x 2 columns of drawer fronts on the +Z face
    const m = 0.12, gap = 0.05, cols = 2, rows = 3;
    const cw = (w - 2 * m - gap * (cols - 1)) / cols;
    const rh = (bodyH - 2 * m - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = -w / 2 + m + cw / 2 + c * (cw + gap);
        const y0 = legH + m + r * (rh + gap);
        bx(g, cx, y0, l / 2 + 0.015, cw, rh, 0.05, face);
        bx(g, cx, y0 + rh * 0.6, l / 2 + 0.065, Math.min(0.5, cw * 0.4), 0.05, 0.05, metal);   // bar pull
      }
    }
  }

  // ------------------------------------------------------------- LOVESEAT
  function buildLoveseat(g, w, l, color) {
    const fab = mat(color, 0.95, 0), cush = mat(shade(color, 0.04), 0.95, 0);
    const accent = mat(0xd9b36a, 0.92, 0), legM = mat(0x3b2a1e, 0.7, 0.05);
    const armW = 0.5, armBodyH = 1.55, iw = w - 2 * armW;
    // legs
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      cyl(g, c[0] * (w / 2 - 0.3), 0.15, c[1] * (l / 2 - 0.3), 0.09, 0.07, 0.3, legM, 'y', 12);
    });
    // base frame, back and rolled arms
    bx(g, 0, 0.3, 0, w - 0.02, 0.6, l, fab);
    bx(g, 0, 0.9, -l / 2 + 0.35, iw, 2.0, 0.7, fab);
    [-1, 1].forEach(function (sx) {
      const ax = sx * (w / 2 - armW / 2);
      bx(g, ax, 0.3, 0, armW, armBodyH, l, fab);
      cyl(g, ax, 0.3 + armBodyH, 0, armW / 2, armW / 2, l, fab, 'z', 20);   // rolled top
    });
    // two seat cushions + two back cushions
    const cw = iw / 2 - 0.02, seatZ = (-l / 2 + 0.7 + l / 2 - 0.05) / 2, seatD = l - 0.75;
    [-1, 1].forEach(function (sx) {
      const cx = sx * (cw / 2 + 0.02);
      bx(g, cx, 0.9, seatZ, cw, 0.55, seatD, cush);
      const bk = bx(g, cx, 1.45, -l / 2 + 0.7 + 0.22, cw, 1.3, 0.45, cush);
      bk.rotation.x = -0.1;
    });
    // two throw pillows
    [-1, 1].forEach(function (sx) {
      const p = bx(g, sx * (iw / 2 - 0.6), 1.45, -l / 2 + 1.05, 0.95, 0.95, 0.28, accent);
      p.rotation.x = -0.45; p.rotation.y = sx * 0.35;
    });
	 }
	  // ---------------------------------------------------- COMPUTER DESK
  function buildComputerDesk(g, w, l, color) {
    const topM  = mat(color, 0.5, 0.04);
    const bodyM = mat(shade(color, -0.03), 0.62, 0.03);
    const faceM = mat(shade(color, 0.05), 0.6, 0.03);
    const metal = mat(0x2b2f36, 0.35, 0.85);

    const legH = 2.3, topT = 0.15;
    const pedW = 1.5, pedD = l - 0.3, pedX = w / 2 - pedW / 2;

    // worktop
    bx(g, 0, legH, 0, w, topT, l, topM);

    // open side: two square steel legs + rails
    [-1, 1].forEach(function (sz) {
      bx(g, -w / 2 + 0.22, 0, sz * (l / 2 - 0.22), 0.12, legH, 0.12, metal);
    });
    bx(g, -w / 2 + 0.22, 0.5, 0, 0.09, 0.09, l - 0.44, metal);
    const railX0 = -w / 2 + 0.22, railX1 = pedX - pedW / 2;
    bx(g, (railX0 + railX1) / 2, 0.5, -l / 2 + 0.15, railX1 - railX0, 0.09, 0.09, metal);

    // 3-drawer pedestal on the right
    bx(g, pedX, 0, 0, pedW, legH, pedD, bodyM);
    const rows = 3, m = 0.1, gap = 0.06;
    const rh = (legH - 2 * m - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) {
      const y0 = m + r * (rh + gap);
      bx(g, pedX, y0, pedD / 2 + 0.02, pedW - 2 * m, rh, 0.05, faceM);
      bx(g, pedX, y0 + rh - 0.16, pedD / 2 + 0.07, pedW * 0.45, 0.06, 0.06, metal);
    }
  }

  // --------------------------------------------------------- BOOKSHELF
  const BOOK_COLORS = [0x8c3b32, 0x2f4858, 0x6b7f3a, 0xb8894a, 0x4a3b6b, 0x9c6b3f, 0x35586b];

  function bookRow(g, x0, y, z, count, maxH, depth) {
    const tw = [0.10, 0.14, 0.09, 0.12, 0.16, 0.11, 0.13];   // thickness
    const hf = [0.80, 0.95, 0.70, 0.88, 0.75, 0.92, 0.66];   // height factor
    let x = x0;
    for (let i = 0; i < count; i++) {
      const t = tw[i % tw.length], hh = maxH * hf[i % hf.length];
      bx(g, x + t / 2, y, z, t, hh, depth, mat(BOOK_COLORS[i % BOOK_COLORS.length], 0.85, 0));
      x += t + 0.02;
    }
  }

  function buildBookshelf(g, w, l, color) {
    const shelfH = 6.0, t = 0.1, boardT = 0.12, boards = 5;
    const wood  = mat(color, 0.6, 0.03);
    const woodD = mat(shade(color, -0.1), 0.7, 0.03);
    const backM = mat(shade(color, -0.16), 0.85, 0.02);
    const innerW = w - 2 * t, boardD = l - 0.07;

    // side panels + back
    [-1, 1].forEach(function (sx) {
      bx(g, sx * (w / 2 - t / 2), 0, 0, t, shelfH, l, woodD);
    });
    bx(g, 0, 0, -l / 2 + 0.03, w, shelfH, 0.06, backM);

    // horizontal boards (bottom, 3 x middle, top) with a row of books on each
    const step = (shelfH - boardT) / (boards - 1);
    const counts = [7, 5, 9, 6];
    for (let i = 0; i < boards; i++) {
      const y = i * step;
      bx(g, 0, y, 0, innerW, boardT, boardD, wood);
      if (i < boards - 1) {
        bookRow(g, -innerW / 2 + 0.1, y + boardT, 0.05,
                counts[i], Math.min(1.15, step - 0.35), boardD * 0.72);
      }
    }
  }

  // -------------------------------------------------- 4 x 6 CUBE SHELF
  // cols = cubes across, rows = cubes high.  Swap for a 6-wide / 4-high unit.
  const CUBE = { cols: 4, rows: 6, cell: 1.15, t: 0.1 };
  CUBE.w = CUBE.cols * CUBE.cell + (CUBE.cols + 1) * CUBE.t;   // 5.1
  CUBE.h = CUBE.rows * CUBE.cell + (CUBE.rows + 1) * CUBE.t;   // 7.6
  CUBE.l = CUBE.cell + 0.15;                                   // 1.3

  function buildCubeShelf(g, w, l, color) {
    const wood  = mat(color, 0.62, 0.03);
    const woodD = mat(shade(color, -0.08), 0.68, 0.03);
    const backM = mat(shade(color, -0.16), 0.85, 0.02);
    const cols = CUBE.cols, rows = CUBE.rows, cell = CUBE.cell, t = CUBE.t;

    // vertical dividers (cols + 1)
    for (let c = 0; c <= cols; c++) {
      bx(g, -w / 2 + t / 2 + c * (cell + t), 0, 0, t, CUBE.h, l, woodD);
    }
    // horizontal shelves (rows + 1)
    for (let r = 0; r <= rows; r++) {
      bx(g, 0, r * (cell + t), 0, w, t, l, wood);
    }
    // back panel
    bx(g, 0, 0, -l / 2 + 0.03, w, CUBE.h, 0.06, backM);
  }

  // ------------------------------------------------------ MEDIA CENTER
  function buildMediaCenter(g, w, l, color) {
    const bodyM = mat(color, 0.6, 0.04);
    const bodyD = mat(shade(color, -0.08), 0.68, 0.04);
    const faceM = mat(shade(color, 0.05), 0.55, 0.04);
    const topM  = mat(shade(color, -0.04), 0.45, 0.06);
    const metal = mat(0x2b2f36, 0.35, 0.85);
    const dark  = mat(0x15181c, 0.55, 0.15);
    const glass = mat(0x0d1014, 0.12, 0.25);

    const legH = 0.3, bodyH = 1.6, topT = 0.12, slabT = 0.12;
    const bayW = 2.0, cabW = (w - bayW) / 2, cabX = w / 2 - cabW / 2;

    // legs
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      cyl(g, c[0] * (w / 2 - 0.3), legH / 2, c[1] * (l / 2 - 0.25), 0.1, 0.07, legH, metal, 'y', 12);
    });

    // bottom slab
    bx(g, 0, legH, 0, w, slabT, l, bodyD);

    // two closed side cabinets with doors + vertical bar pulls
    [-1, 1].forEach(function (sx) {
      bx(g, sx * cabX, legH + slabT, 0, cabW, bodyH - slabT, l, bodyM);
      bx(g, sx * cabX, legH + slabT + 0.06, l / 2 + 0.02, cabW - 0.12, bodyH - slabT - 0.18, 0.05, faceM);
      bx(g, sx * (cabX - cabW / 2 + 0.16), legH + 0.48, l / 2 + 0.08, 0.06, 0.7, 0.06, metal);
    });

    // open centre bay: back panel + mid shelf
    bx(g, 0, legH + slabT, -l / 2 + 0.06, bayW, bodyH - slabT, 0.12, bodyD);
    bx(g, 0, legH + slabT + (bodyH - slabT) * 0.5, 0, bayW, 0.08, l - 0.12, bodyD);

    // top slab
    bx(g, 0, legH + bodyH, 0, w + 0.1, topT, l + 0.1, topM);

    // flat-screen TV (delete these 4 lines for a bare console)
    const tvY = legH + bodyH + topT;
    bx(g, 0, tvY, 0, 1.8, 0.08, 0.55, metal);                       // foot
    bx(g, 0, tvY + 0.08, -0.08, 0.35, 0.36, 0.16, metal);           // neck
    bx(g, 0, tvY + 0.44, 0, 3.6, 1.94, 0.12, dark);                 // bezel
    bx(g, 0, tvY + 0.52, 0.07, 3.42, 1.78, 0.02, glass);            // screen
  }

  // -------------------------------------------------------- RECLINER
  function buildRecliner(g, w, l, color) {
    const fab  = mat(color, 0.95, 0);
    const cush = mat(shade(color, 0.05), 0.95, 0);
    const legM = mat(0x3b2a1e, 0.7, 0.05);

    const L = l, bodyD = 2.9, bodyZ = -L / 2 + bodyD / 2;
    const armW = 0.45, iw = w - 2 * armW, legH = 0.3;

    // legs
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        cyl(g, sx * (w / 2 - 0.35), legH / 2, bodyZ + sz * (bodyD / 2 - 0.35),
            0.1, 0.07, legH, legM, 'y', 12);
      });
    });

    // frame
    bx(g, 0, legH, bodyZ, w, 0.7, bodyD, fab);

    // arms + rolled tops
    [-1, 1].forEach(function (sx) {
      const ax = sx * (w / 2 - armW / 2);
      bx(g, ax, legH, bodyZ, armW, 1.7, bodyD, fab);
      cyl(g, ax, legH + 1.7, bodyZ, armW / 2, armW / 2, bodyD, fab, 'z', 20);
    });

    // seat cushion
    bx(g, 0, legH + 0.7, bodyZ + 0.15, iw, 0.5, bodyD - 0.35, cush);

    // back + reclined back cushion
    const back = bx(g, 0, legH + 0.7, -L / 2 + 0.4, iw, 2.5, 0.8, fab);
    back.rotation.x = -0.06;
    const bc = bx(g, 0, legH + 0.75, -L / 2 + 0.95, iw - 0.06, 2.1, 0.45, cush);
    bc.rotation.x = -0.1;

    // extended footrest + support
    bx(g, 0, 0.55, L / 2 - 0.65, iw + 0.1, 0.45, 1.3, cush);
    bx(g, 0, 0.15, L / 2 - 1.0, iw * 0.5, 0.42, 0.55, fab);
  }

  // ----------------------------------------------------- L-SHAPE COUCH
  function buildSectional(g, w, l, color) {
    const fab    = mat(color, 0.95, 0);
    const cush   = mat(shade(color, 0.04), 0.95, 0);
    const accent = mat(0xc98f52, 0.92, 0);
    const legM   = mat(0x3b2a1e, 0.7, 0.05);

    const legH = 0.25, seatH = 0.6;                 // base top = 0.85
    const armW = 0.55, backT = 0.6, backTop = 3.0, armTop = 2.3;
    const runD = 3.0;                               // depth of both runs
    const W = w, L = l;
    const zFrontMain = -L / 2 + runD;               // -0.25
    const xReturn = W / 2 - runD;                   //  0.75
    const xReturnBack = W / 2 - backT;              //  3.15

    // legs
    [[-W / 2 + 0.35, -L / 2 + 0.35], [W / 2 - 0.35, -L / 2 + 0.35],
     [-W / 2 + 0.35, zFrontMain - 0.35], [xReturn + 0.35, zFrontMain - 0.35],
     [xReturn + 0.35, L / 2 - 0.35], [W / 2 - 0.35, L / 2 - 0.35]].forEach(function (p) {
      cyl(g, p[0], legH / 2, p[1], 0.09, 0.07, legH, legM, 'y', 12);
    });

    // ---- main run (back on -Z)
    bx(g, 0, legH, (-L / 2 + zFrontMain) / 2, W, seatH, runD, fab);
    bx(g, 0, legH + seatH, -L / 2 + backT / 2, W, backTop - (legH + seatH), backT, fab);
    bx(g, -W / 2 + armW / 2, legH, (-L / 2 + zFrontMain) / 2, armW, armTop - legH, runD, fab);
    cyl(g, -W / 2 + armW / 2, armTop, (-L / 2 + zFrontMain) / 2, armW / 2, armW / 2, runD, fab, 'z', 20);

    // ---- return / chaise (back on +X, arm at +Z)
    bx(g, (xReturn + W / 2) / 2, legH, (zFrontMain + L / 2) / 2, runD, seatH, L / 2 - zFrontMain, fab);
    bx(g, W / 2 - backT / 2, legH + seatH, (zFrontMain + L / 2) / 2, backT, backTop - (legH + seatH), L / 2 - zFrontMain, fab);
    bx(g, (xReturn + xReturnBack) / 2, legH, L / 2 - armW / 2, xReturnBack - xReturn, armTop - legH, armW, fab);
    cyl(g, (xReturn + xReturnBack) / 2, armTop, L / 2 - armW / 2, armW / 2, armW / 2, xReturnBack - xReturn, fab, 'x', 20);

    // ---- seat cushions
    const seatY = legH + seatH, seatT = 0.5;
    const mainW = xReturnBack - (-W / 2 + armW);          // 6.35
    const cw = mainW / 2;
    [-1, 1].forEach(function (sx, i) {
      const cx = i === 0 ? -W / 2 + armW + cw / 2 : xReturnBack - cw / 2;
      bx(g, cx, seatY, -L / 2 + backT + (runD - backT) / 2, cw, seatT, runD - backT, cush);
    });
    bx(g, (xReturn + xReturnBack) / 2, seatY, (zFrontMain + (L / 2 - armW)) / 2,
       xReturnBack - xReturn, seatT, (L / 2 - armW) - zFrontMain, cush);

    // ---- back cushions
    const bkY = seatY + seatT, bkH = 1.4;
    [-1, 1].forEach(function (sx, i) {
      const cx = i === 0 ? -W / 2 + armW + cw / 2 : xReturnBack - cw / 2;
      const bk = bx(g, cx, bkY, -L / 2 + backT + 0.23, cw - 0.06, bkH, 0.45, cush);
      bk.rotation.x = -0.1;
    });
    const rb = bx(g, xReturnBack - 0.23, bkY, (zFrontMain + (L / 2 - armW)) / 2,
                  0.45, bkH, (L / 2 - armW) - zFrontMain - 0.1, cush);
    rb.rotation.z = -0.1;

    // ---- throw pillows
    [[-W / 2 + armW + 0.5, -L / 2 + backT + 0.55, 0.35],
     [xReturn + 0.55, L / 2 - armW - 0.55, -0.35],
     [xReturnBack - 0.6, zFrontMain + 0.6, 0.4]].forEach(function (p) {
      const pl = bx(g, p[0], seatY + seatT, p[1], 0.9, 0.9, 0.28, accent);
      pl.rotation.x = -0.45; pl.rotation.y = p[2];
    });
  }
  //------ COFFEE TABLE
  function buildCoffeeTable(g, w, l, color) {
    const topM   = mat(color, 0.5, 0.04);
    const shelfM = mat(shade(color, -0.06), 0.62, 0.04);
    const legM   = mat(shade(color, -0.12), 0.65, 0.04);

    const tableH = 1.5, topT = 0.15;

    bx(g, 0, tableH - topT, 0, w, topT, l, topM);          // top
    bx(g, 0, 0.35, 0, w - 0.4, 0.1, l - 0.3, shelfM);      // lower shelf

    // tapered legs
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      cyl(g, c[0] * (w / 2 - 0.16), (tableH - topT) / 2, c[1] * (l / 2 - 0.16),
          0.07, 0.11, tableH - topT, legM, 'y', 12);
    });

    // a small stack of books on top
    let by = tableH;
    [[1.0, 0.10, 0.70, 0x8c3b32],
     [0.85, 0.09, 0.60, 0x2f4858],
     [0.90, 0.08, 0.62, 0xb8894a]].forEach(function (b, i) {
      const m = bx(g, -0.7, by, 0.1, b[0], b[1], b[2], mat(b[3], 0.85, 0));
      m.rotation.y = (i - 1) * 0.12;
      by += b[1];
    });
  }                                          // ← (1) closes buildCoffeeTable HERE, after the books

  // ---------------------------------------------------------- NIGHTSTAND
  function buildNightstand(g, w, l, color) {
    const body  = mat(color, 0.62, 0.04), face  = mat(shade(color, 0.05), 0.58, 0.04);
    const topM  = mat(shade(color, -0.05), 0.45, 0.06), legM = mat(shade(color, -0.12), 0.7, 0.04);
    const metal = mat(0x2b2f36, 0.35, 0.85);
    const legH = 0.4, bodyH = 1.65, topT = 0.14;

    // tapered legs
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      cyl(g, c[0] * (w / 2 - 0.14), legH / 2, c[1] * (l / 2 - 0.14),
          0.06, 0.09, legH, legM, 'y', 12);
    });
    // body
    bx(g, 0, legH, 0, w, bodyH, l, body);
    // top slab with slight overhang
    bx(g, 0, legH + bodyH, 0, w + 0.1, topT, l + 0.1, topM);
    // 2 stacked drawers on the +Z face
    const m = 0.1, gap = 0.05, rows = 2;
    const rh = (bodyH - 2 * m - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) {
      const y0 = legH + m + r * (rh + gap);
      bx(g, 0, y0, l / 2 + 0.015, w - 2 * m, rh, 0.05, face);
      bx(g, 0, y0 + rh * 0.6, l / 2 + 0.07,
         Math.min(0.55, w * 0.45), 0.05, 0.05, metal);   // bar pull
    }                                          // ← (2) closes the for loop only
  }                                            // ← (3) closes buildNightstand only
    // ---------------------------------------------------------- REFRIGERATOR
  function buildRefrigerator(g, w, l, color) {
    const steel  = mat(color, 0.32, 0.72);
    const steelD = mat(shade(color, -0.06), 0.4, 0.68);
    const metal  = mat(0x2b2f36, 0.35, 0.85);
    const trim   = mat(0x6b7280, 0.4, 0.55);

    const legH = 0.15, bodyH = 6.05;
    const freezerH = 2.1, gapH = 0.05, topMargin = 0.05;
    const margin = 0.06, doorGap = 0.06;
    const doorW = (w - 2 * margin - doorGap) / 2;

    const bottomY = legH + 0.05;
    const drawerTop = bottomY + freezerH;
    const doorsBottom = drawerTop + gapH;
    const doorsTop = legH + bodyH - topMargin;
    const doorsH = doorsTop - doorsBottom;

    // feet
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      bx(g, c[0] * (w / 2 - 0.15), 0, c[1] * (l / 2 - 0.15), 0.15, legH, 0.15, metal);
    });
    // main body
    bx(g, 0, legH, 0, w, bodyH, l, steel);
    // French doors (upper)
    bx(g, -(doorW + doorGap) / 2, doorsBottom, l / 2 + 0.02, doorW, doorsH, 0.04, steelD);
    bx(g,  (doorW + doorGap) / 2, doorsBottom, l / 2 + 0.02, doorW, doorsH, 0.04, steelD);
    // Freezer drawer (lower)
    bx(g, 0, bottomY, l / 2 + 0.02, w - 2 * margin, freezerH, 0.04, steelD);
    // gap trim
    bx(g, 0, drawerTop, l / 2 + 0.03, w - 2 * margin, gapH, 0.02, trim);
    // vertical handles on French doors
    const handleH = doorsH * 0.55, handleY = doorsBottom + doorsH * 0.2;
    bx(g, -doorGap / 2 - 0.04, handleY, l / 2 + 0.09, 0.05, handleH, 0.06, metal);
    bx(g,  doorGap / 2 + 0.04, handleY, l / 2 + 0.09, 0.05, handleH, 0.06, metal);
    // horizontal handle on freezer
    bx(g, 0, bottomY + freezerH * 0.5, l / 2 + 0.09, w * 0.55, 0.06, 0.06, metal);
    // top cap
    bx(g, 0, legH + bodyH, 0, w + 0.02, 0.05, l + 0.02, steelD);
  }

  // ---------------------------------------------------------------- RANGE
  function buildRange(g, w, l, color) {
    const bodyM  = mat(color, 0.45, 0.55);
    const bodyD  = mat(shade(color, -0.06), 0.5, 0.5);
    const cooktopM = mat(0x1f2937, 0.35, 0.7);
    const burner = mat(0x0f172a, 0.4, 0.4);
    const metal  = mat(0x9ca3af, 0.3, 0.75);
    const glass  = mat(0x111827, 0.15, 0.3);

    const legH = 0.1, bodyH = 2.6, topT = 0.08, backguardH = 0.5;

    // small feet
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      bx(g, c[0] * (w / 2 - 0.1), 0, c[1] * (l / 2 - 0.1), 0.12, legH, 0.12, metal);
    });
    // oven body
    bx(g, 0, legH, 0, w, bodyH, l, bodyM);
    // oven door front
    bx(g, 0, legH + 0.05, l / 2 + 0.02, w - 0.15, bodyH - 0.35, 0.04, bodyD);
    // oven door window
    bx(g, 0, legH + 0.4, l / 2 + 0.04, w * 0.6, 0.9, 0.02, glass);
    // oven handle
    bx(g, 0, legH + bodyH - 0.25, l / 2 + 0.06, w * 0.7, 0.06, 0.05, metal);
    // cooktop
    bx(g, 0, legH + bodyH, 0, w, topT, l, cooktopM);
    // backguard
    bx(g, 0, legH + bodyH + topT, -l / 2 + 0.1, w, backguardH, 0.2, bodyM);
    // 4 burner discs on cooktop
    const bR = 0.26;
    [[-w / 4, -l / 4 + 0.1], [w / 4, -l / 4 + 0.1], [-w / 4, l / 4], [w / 4, l / 4]].forEach(function (pos) {
      cyl(g, pos[0], legH + bodyH + topT + 0.01, pos[1], bR, bR, 0.02, burner, 'y', 16);
    });
    // 4 control knobs on backguard face (+Z)
    [-0.85, -0.3, 0.3, 0.85].forEach(function (kx) {
      cyl(g, kx, legH + bodyH + topT + backguardH * 0.5, -l / 2 + 0.22,
          0.06, 0.06, 0.08, metal, 'z', 12);
    });
  }

  // ----------------------------------------------------------- DISHWASHER
  function buildDishwasher(g, w, l, color) {
    const bodyM  = mat(color, 0.4, 0.55);
    const faceM  = mat(shade(color, 0.04), 0.35, 0.6);
    const metal  = mat(0x9ca3af, 0.28, 0.8);
    const panel  = mat(0x111827, 0.4, 0.35);

    const legH = 0.1, bodyH = 2.75;

    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      bx(g, c[0] * (w / 2 - 0.1), 0, c[1] * (l / 2 - 0.1), 0.12, legH, 0.12, metal);
    });
    // main body
    bx(g, 0, legH, 0, w, bodyH, l, bodyM);
    // door panel (+Z)
    bx(g, 0, legH + 0.05, l / 2 + 0.02, w - 0.08, bodyH - 0.1, 0.04, faceM);
    // control strip along top of door
    bx(g, 0, legH + bodyH - 0.28, l / 2 + 0.04, w - 0.08, 0.18, 0.03, panel);
    // bar handle
    bx(g, 0, legH + bodyH - 0.5, l / 2 + 0.08, w * 0.7, 0.06, 0.06, metal);
  }

  // --------------------------------------------------------- KITCHEN SINK
  function buildKitchenSink(g, w, l, color) {
    const body  = mat(color, 0.62, 0.03);
    const bodyD = mat(shade(color, -0.1), 0.68, 0.03);
    const face  = mat(shade(color, 0.05), 0.58, 0.03);
    const topM  = mat(0xd1d5db, 0.28, 0.32);
    const sink  = mat(0x9ca3af, 0.2, 0.85);
    const sinkD = mat(0x6b7280, 0.35, 0.75);
    const faucetM = mat(0x4b5563, 0.25, 0.85);
    const metal = mat(0x2b2f36, 0.35, 0.85);

    const legH = 0.15, bodyH = 2.6, topT = 0.15;
    const topOverFront = 0.12, topOverSide = 0.05;
    const topW = w + topOverSide * 2;
    const topL = l + topOverFront;
    const topZ = topOverFront / 2;
    const sinkTopY = legH + bodyH + topT;

    // toe kick + body
    bx(g, 0, 0, 0.05, w - 0.1, legH, l - 0.1, bodyD);
    bx(g, 0, legH, 0, w, bodyH, l, body);
    // two door panels
    bx(g, -w / 4, legH + 0.1, l / 2 + 0.015, w / 2 - 0.06, bodyH - 0.2, 0.03, face);
    bx(g,  w / 4, legH + 0.1, l / 2 + 0.015, w / 2 - 0.06, bodyH - 0.2, 0.03, face);
    // two handles
    bx(g, -w / 4, legH + bodyH * 0.7, l / 2 + 0.06, 0.4, 0.05, 0.05, metal);
    bx(g,  w / 4, legH + bodyH * 0.7, l / 2 + 0.06, 0.4, 0.05, 0.05, metal);
    // countertop
    bx(g, 0, legH + bodyH, topZ, topW, topT, topL, topM);
    // sink basin (recessed into countertop)
    const sinkW = w * 0.72, sinkL = l * 0.55, basinDepth = 0.55;
    bx(g, 0, sinkTopY - basinDepth, topZ, sinkW, 0.05, sinkL, sinkD);           // floor
    bx(g, 0, sinkTopY - basinDepth, topZ - sinkL / 2 + 0.03, sinkW, basinDepth, 0.06, sink);
    bx(g, 0, sinkTopY - basinDepth, topZ + sinkL / 2 - 0.03, sinkW, basinDepth, 0.06, sink);
    bx(g, -sinkW / 2 + 0.03, sinkTopY - basinDepth, topZ, 0.06, basinDepth, sinkL, sink);
    bx(g,  sinkW / 2 - 0.03, sinkTopY - basinDepth, topZ, 0.06, basinDepth, sinkL, sink);
    // faucet at back of basin
    const fZ = topZ - sinkL / 2 - 0.12;
    cyl(g, 0, sinkTopY + 0.05, fZ, 0.06, 0.07, 0.1, faucetM, 'y', 12);          // base
    cyl(g, 0, sinkTopY + 0.30, fZ, 0.045, 0.05, 0.45, faucetM, 'y', 12);        // post
    bx(g, 0, sinkTopY + 0.48, fZ + 0.18, 0.08, 0.08, 0.36, faucetM);           // arm
    bx(g, 0, sinkTopY + 0.40, fZ + 0.32, 0.06, 0.10, 0.06, faucetM);           // nozzle
  }

  // -------------------------------------------------------- BASE CABINET
  function buildBaseCabinet(g, w, l, color) {
    const body  = mat(color, 0.62, 0.03);
    const bodyD = mat(shade(color, -0.1), 0.68, 0.03);
    const face  = mat(shade(color, 0.05), 0.58, 0.03);
    const topM  = mat(0xd1d5db, 0.28, 0.32);
    const metal = mat(0x2b2f36, 0.35, 0.85);

    const legH = 0.15, bodyH = 2.6, topT = 0.15;
    const topOverFront = 0.12, topOverSide = 0.05;
    const topW = w + topOverSide * 2;
    const topL = l + topOverFront;
    const topZ = topOverFront / 2;

    // toe kick + body
    bx(g, 0, 0, 0.05, w - 0.1, legH, l - 0.1, bodyD);
    bx(g, 0, legH, 0, w, bodyH, l, body);
    // upper drawer panel
    bx(g, 0, legH + bodyH - 0.55, l / 2 + 0.015, w - 0.1, 0.45, 0.03, face);
    // lower door panel
    bx(g, 0, legH + 0.1, l / 2 + 0.015, w - 0.1, bodyH - 0.75, 0.03, face);
    // pulls
    bx(g, 0, legH + bodyH - 0.35, l / 2 + 0.06, Math.min(0.5, w * 0.4), 0.05, 0.05, metal);
    bx(g, 0, legH + bodyH - 1.0, l / 2 + 0.06, 0.05, 0.4, 0.05, metal);
    // countertop
    bx(g, 0, legH + bodyH, topZ, topW, topT, topL, topM);
  }

  // ------------------------------------------------------- KITCHEN ISLAND
  function buildKitchenIsland(g, w, l, color) {
    const body   = mat(color, 0.62, 0.03);
    const bodyD  = mat(shade(color, -0.1), 0.68, 0.03);
    const topM   = mat(0xd1d5db, 0.25, 0.3);
    const topEdge = mat(shade(0xd1d5db, -0.08), 0.3, 0.28);
    const metal  = mat(0x2b2f36, 0.35, 0.85);

    const overhang = 0.2, legH = 0.15, bodyH = 2.45, topT = 0.15;
    const cabW = w - overhang * 2, cabL = l - overhang * 2;

    // toe kick + body
    bx(g, 0, 0, 0, cabW - 0.1, legH, cabL - 0.1, bodyD);
    bx(g, 0, legH, 0, cabW, bodyH, cabL, body);
    // 3 paneled fronts on +Z face + pulls
    const nPanels = 3, panelGap = 0.1, sideMargin = 0.15;
    const panelW = (cabW - sideMargin * 2 - (nPanels - 1) * panelGap) / nPanels;
    for (let i = 0; i < nPanels; i++) {
      const cx = -cabW / 2 + sideMargin + panelW / 2 + i * (panelW + panelGap);
      bx(g, cx, legH + 0.15, cabL / 2 + 0.015, panelW, bodyH - 0.3, 0.03, bodyD);
      bx(g, cx, legH + bodyH * 0.6, cabL / 2 + 0.06,
         Math.min(0.4, panelW * 0.5), 0.05, 0.05, metal);
    }
    // countertop
    bx(g, 0, legH + bodyH, 0, w, topT, l, topM);
    bx(g, 0, legH + bodyH + topT, 0, w + 0.02, 0.02, l + 0.02, topEdge);
  }

  // --------------------------------------------------------- DINING TABLE
  function buildDiningTable(g, w, l, color) {
    const topM   = mat(color, 0.5, 0.04);
    const topEdge = mat(shade(color, -0.08), 0.55, 0.04);
    const legM   = mat(shade(color, -0.15), 0.62, 0.04);
    const apronM = mat(shade(color, -0.05), 0.6, 0.04);

    const legH = 2.3, topT = 0.16, legS = 0.22, legInset = 0.05;
    const legX = w / 2 - legS / 2 - legInset;
    const legZ = l / 2 - legS / 2 - legInset;

    // top + edge
    bx(g, 0, legH, 0, w, topT, l, topM);
    bx(g, 0, legH, 0, w + 0.02, topT * 0.6, l + 0.02, topEdge);
    // apron
    const apronW = 2 * legX - legS;
    const apronL = 2 * legZ - legS;
    bx(g, 0, legH - 0.18, 0, apronW, 0.15, apronL, apronM);
    // 4 legs
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      bx(g, c[0] * legX, 0, c[1] * legZ, legS, legH, legS, legM);
    });
  }
    // ------------------------------------------------------------ TOILET
  function buildToilet(g, w, l, color) {
    const porc  = mat(color, 0.28, 0.02);
    const porcD = mat(shade(color, -0.06), 0.38, 0.02);
    const seatM = mat(shade(color, -0.15), 0.55, 0.02);
    const metal = mat(0x9ca3af, 0.25, 0.85);

    const baseH = 0.1, bowlH = 1.15, seatT = 0.12;
    const tankD = 0.7, tankH = 2.3;
    const tankZ = -l / 2 + tankD / 2;
    const bowlBackZ = -l / 2 + tankD + 0.06;
    const bowlFrontZ = l / 2 - 0.18;
    const bowlD = bowlFrontZ - bowlBackZ;
    const bowlZ = (bowlBackZ + bowlFrontZ) / 2;

    // base plinth
    bx(g, 0, 0, bowlZ, w * 0.4, baseH, bowlD * 0.85, porcD);
    // bowl body
    bx(g, 0, baseH, bowlZ, w * 0.65, bowlH, bowlD, porc);
    // seat
    bx(g, 0, baseH + bowlH, bowlZ + 0.02, w * 0.72, seatT, bowlD + 0.04, seatM);
    // tank at back
    bx(g, 0, baseH, tankZ, w, tankH, tankD, porc);
    // tank lid
    bx(g, 0, baseH + tankH, tankZ, w + 0.04, 0.08, tankD + 0.04, porcD);
    // flush lever on the side
    cyl(g, w / 2 - 0.1, baseH + tankH * 0.55, tankZ + 0.02, 0.04, 0.04, 0.12, metal, 'x', 10);
  }

  // ------------------------------------------------------------ VANITY
  function buildVanity(g, w, l, color) {
    const body  = mat(color, 0.62, 0.03);
    const bodyD = mat(shade(color, -0.1), 0.68, 0.03);
    const face  = mat(shade(color, 0.05), 0.58, 0.03);
    const topM  = mat(0xe5e7eb, 0.25, 0.15);
    const sinkM = mat(0xf8fafc, 0.2, 0.2);
    const faucetM = mat(0x4b5563, 0.25, 0.85);
    const metal = mat(0x2b2f36, 0.35, 0.85);

    const legH = 0.15, bodyH = 2.35, topT = 0.15;
    const topOverFront = 0.1, topOverSide = 0.05;
    const topW = w + topOverSide * 2;
    const topL = l + topOverFront;
    const topZ = topOverFront / 2;
    const topY = legH + bodyH + topT;

    // toe kick + body
    bx(g, 0, 0, 0.03, w - 0.08, legH, l - 0.06, bodyD);
    bx(g, 0, legH, 0, w, bodyH, l, body);
    // two door panels
    bx(g, -w / 4, legH + 0.1, l / 2 + 0.015, w / 2 - 0.06, bodyH - 0.2, 0.03, face);
    bx(g,  w / 4, legH + 0.1, l / 2 + 0.015, w / 2 - 0.06, bodyH - 0.2, 0.03, face);
    // handles
    bx(g, -0.08, legH + bodyH * 0.72, l / 2 + 0.07, 0.05, 0.4, 0.05, metal);
    bx(g,  0.08, legH + bodyH * 0.72, l / 2 + 0.07, 0.05, 0.4, 0.05, metal);
    // countertop
    bx(g, 0, legH + bodyH, topZ, topW, topT, topL, topM);
    // sink basin (recessed)
    const basinW = w * 0.55, basinD = l * 0.45, basinDepth = 0.45;
    bx(g, 0, topY - basinDepth, topZ, basinW, 0.05, basinD, sinkM);
    bx(g, 0, topY - basinDepth, topZ - basinD / 2 + 0.03, basinW, basinDepth, 0.06, sinkM);
    bx(g, 0, topY - basinDepth, topZ + basinD / 2 - 0.03, basinW, basinDepth, 0.06, sinkM);
    bx(g, -basinW / 2 + 0.03, topY - basinDepth, topZ, 0.06, basinDepth, basinD, sinkM);
    bx(g,  basinW / 2 - 0.03, topY - basinDepth, topZ, 0.06, basinDepth, basinD, sinkM);
    // faucet
    const fZ = topZ - topL / 2 + 0.18;
    cyl(g, 0, topY + 0.02, fZ, 0.05, 0.06, 0.08, faucetM, 'y', 12);
    cyl(g, 0, topY + 0.22, fZ, 0.035, 0.04, 0.35, faucetM, 'y', 12);
    bx(g, 0, topY + 0.38, fZ + 0.14, 0.06, 0.06, 0.28, faucetM);
    bx(g, 0, topY + 0.30, fZ + 0.26, 0.05, 0.08, 0.05, faucetM);
  }

  // ------------------------------------------------------------ SHOWER
  function buildShower(g, w, l, color) {
    const tray  = mat(color, 0.55, 0.02);
    const trayD = mat(shade(color, -0.1), 0.65, 0.02);
    const wall  = mat(0xe2e8f0, 0.5, 0.05);
    const glass = mat(0x0d1014, 0.08, 0.15);
    const metal = mat(0x9ca3af, 0.28, 0.85);
    const chrome = mat(0x6b7280, 0.25, 0.9);

    const trayH = 0.15, wallH = 6.85, wallT = 0.15;

    // tray + rim
    bx(g, 0, 0, 0, w, trayH, l, tray);
    bx(g, 0, trayH - 0.02, 0, w + 0.02, 0.03, l + 0.02, trayD);
    // back wall (-Z)
    bx(g, 0, trayH, -l / 2 + wallT / 2, w, wallH, wallT, wall);
    // left wall (-X)
    bx(g, -w / 2 + wallT / 2, trayH, 0, wallT, wallH, l, wall);
    // glass front (+Z)
    bx(g, 0, trayH, l / 2 - 0.04, w - wallT - 0.1, wallH - 0.2, 0.06, glass);
    // glass right (+X)
    bx(g, w / 2 - 0.04, trayH, 0, 0.06, wallH - 0.2, l - wallT - 0.1, glass);
    // glass door handle
    bx(g, 0, trayH + wallH * 0.55, l / 2 + 0.02, 0.05, 0.6, 0.06, chrome);
    // shower arm + head disc
    const headZ = -l / 2 + wallT;
    cyl(g, 0, trayH + wallH * 0.85, headZ + 0.15, 0.04, 0.04, 0.3, chrome, 'z', 12);
    cyl(g, 0, trayH + wallH * 0.85 - 0.02, headZ + 0.3, 0.22, 0.22, 0.04, metal, 'y', 20);
    // control valve
    cyl(g, 0, trayH + 1.15, headZ + 0.06, 0.12, 0.12, 0.06, chrome, 'z', 16);
  }

  // ----------------------------------------------------------- BATHTUB
  function buildBathtub(g, w, l, color) {
    const tubM  = mat(color, 0.32, 0.02);
    const inner = mat(shade(color, -0.06), 0.4, 0.02);
    const faucetM = mat(0x9ca3af, 0.25, 0.9);

    const tubH = 2.0, wallT = 0.22, floorY = 0.35;

    // interior floor (sunk)
    bx(g, 0, 0, 0, w - wallT * 2, floorY, l - wallT * 2, inner);
    // 4 side walls
    bx(g, 0, 0, -l / 2 + wallT / 2, w, tubH, wallT, tubM);
    bx(g, 0, 0,  l / 2 - wallT / 2, w, tubH, wallT, tubM);
    bx(g, -w / 2 + wallT / 2, 0, 0, wallT, tubH, l - 2 * wallT, tubM);
    bx(g,  w / 2 - wallT / 2, 0, 0, wallT, tubH, l - 2 * wallT, tubM);
    // drain
    cyl(g, 0, floorY + 0.02, 0, 0.12, 0.12, 0.03, faucetM, 'y', 16);
    // faucet at back wall
    cyl(g, 0, tubH + 0.2, -l / 2 + 0.15, 0.055, 0.065, 0.4, faucetM, 'y', 12);
    bx(g, 0, tubH + 0.35, -l / 2 + 0.32, 0.09, 0.09, 0.35, faucetM);
  }

  // ------------------------------------------------------ PEDESTAL SINK
  function buildPedestalSink(g, w, l, color) {
    const porc  = mat(color, 0.28, 0.02);
    const porcD = mat(shade(color, -0.08), 0.4, 0.02);
    const faucetM = mat(0x4b5563, 0.25, 0.85);

    const pedH = 2.55, basinT = 0.05;
    const pedW = w * 0.42, pedL = l * 0.55;
    const basinW = w * 0.95, basinL = l * 0.85;

    // pedestal
    bx(g, 0, 0, 0, pedW, pedH, pedL, porc);
    // basin top
    bx(g, 0, pedH, 0, basinW, basinT, basinL, porc);
    // basin well
    bx(g, 0, pedH - 0.35, 0, basinW * 0.7, 0.32, basinL * 0.7, porcD);
    // front lip
    bx(g, 0, pedH, basinL / 2 - 0.1, basinW, 0.08, 0.06, porc);
    // faucet
    cyl(g, 0, pedH + 0.15, -basinL / 2 + 0.15, 0.05, 0.06, 0.25, faucetM, 'y', 12);
    bx(g, 0, pedH + 0.28, -basinL / 2 + 0.28, 0.06, 0.06, 0.28, faucetM);
    bx(g, 0, pedH + 0.18, -basinL / 2 + 0.42, 0.05, 0.08, 0.05, faucetM);
  }

  // ------------------------------------------------------ LINEN CABINET
  function buildLinenCabinet(g, w, l, color) {
    const body  = mat(color, 0.62, 0.03);
    const bodyD = mat(shade(color, -0.1), 0.68, 0.03);
    const face  = mat(shade(color, 0.05), 0.58, 0.03);
    const metal = mat(0x2b2f36, 0.35, 0.85);
    const legH = 0.3, bodyH = 5.6;

    // legs
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      cyl(g, c[0] * (w / 2 - 0.15), legH / 2, c[1] * (l / 2 - 0.12), 0.07, 0.05, legH, bodyD, 'y', 12);
    });

    // body + top slab
    bx(g, 0, legH, 0, w, bodyH, l, body);
    bx(g, 0, legH + bodyH, 0, w + 0.06, 0.1, l + 0.06, bodyD);

    // 4 door panels (2 rows × 2 cols)
    const m = 0.08, gap = 0.04, rows = 2, cols = 2;
    const cw = (w - 2 * m - gap * (cols - 1)) / cols;
    const rh = (bodyH - 2 * m - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = -w / 2 + m + cw / 2 + c * (cw + gap);
        const y0 = legH + m + r * (rh + gap);
        bx(g, cx, y0, l / 2 + 0.015, cw, rh, 0.04, face);
        const knobX = cx + (c === 0 ? cw * 0.35 : -cw * 0.35);
        cyl(g, knobX, y0 + rh * 0.5, l / 2 + 0.06, 0.04, 0.04, 0.06, metal, 'z', 10);
      }
    }
  }

  // -------------------------------------------------------- TOWEL STAND
  function buildTowelStand(g, w, l, color) {
    const chrome = mat(color, 0.25, 0.9);
    const towelM = mat(0xd1d5db, 0.9, 0);
    const towelA = mat(0xf1f5f9, 0.92, 0);

    const barH = 5.0;
    const baseW = w * 0.85, baseD = l * 0.85;

    // base + 2 posts
    bx(g, 0, 0, 0, baseW, 0.06, baseD, chrome);
    bx(g, -w * 0.35, 0, 0, 0.06, barH, 0.06, chrome);
    bx(g,  w * 0.35, 0, 0, 0.06, barH, 0.06, chrome);
    // 3 horizontal bars
    [1.8, 3.2, 4.6].forEach(function (y) {
      cyl(g, 0, y, 0, 0.035, 0.035, w * 0.75, chrome, 'x', 10);
    });
    // folded towels draped on two bars
    bx(g, -w * 0.1, 1.9, 0, w * 0.35, 0.6, 0.4, towelM);
    bx(g,  w * 0.12, 3.3, 0, w * 0.28, 0.55, 0.35, towelA);
  }

  // -------------------------------------------------------------- register
  NewAssets.register('bed',      { w: 5.4, l: 6.9, h: 3.5,  color: '#5f7f9f', name: 'Queen Bed',          icon: '🛏️', tile: 'Queen Bed', mode: 'home' }, buildBed);
  NewAssets.register('dresser',  { w: 5.0, l: 1.6, h: 2.65, color: '#8a5a3c', name: '6-Drawer Dresser',   icon: '🗄️', tile: 'Dresser',   mode: 'home' }, buildDresser);
  NewAssets.register('loveseat', { w: 5.0, l: 3.0, h: 2.9,  color: '#5b6b7a', name: 'Loveseat',           icon: '🛋️', tile: 'Loveseat',  mode: 'home' }, buildLoveseat);
  NewAssets.register('computer-desk', { w: 5.0, l: 2.5, h: 2.45, color: '#8a6a4a', name: 'Computer Desk',      icon: '🖥️', tile: 'Computer Desk',  mode: 'home' }, buildComputerDesk);
  NewAssets.register('bookshelf',     { w: 3.5, l: 1.1, h: 6.0,  color: '#7a5636', name: 'Bookshelf',          icon: '📚', tile: 'Bookshelf',      mode: 'home' }, buildBookshelf);
  NewAssets.register('cube-shelf',    { w: CUBE.w, l: CUBE.l, h: CUBE.h, color: '#c9bda8', name: '4x6 Cube Shelf', icon: '🗃️', tile: 'Cube Shelf', mode: 'home' }, buildCubeShelf);
  NewAssets.register('media-center',  { w: 6.0, l: 1.7, h: 4.4,  color: '#4a4f57', name: 'Media Center',       icon: '📺', tile: 'Media Center',   mode: 'home' }, buildMediaCenter);
  NewAssets.register('recliner',      { w: 3.0, l: 4.2, h: 3.5,  color: '#7d5a44', name: 'Recliner',           icon: '💺', tile: 'Recliner',       mode: 'home' }, buildRecliner);
  NewAssets.register('sectional',     { w: 7.5, l: 6.5, h: 3.0,  color: '#6f7a6a', name: 'L-Shape Couch',      icon: '🛋️', tile: 'L-Shape Couch',  mode: 'home' }, buildSectional);
  NewAssets.register('coffee-table',  { w: 4.0, l: 2.0, h: 1.5,  color: '#7a5a3c', name: 'Coffee Table',       icon: '☕', tile: 'Coffee Table',   mode: 'home' }, buildCoffeeTable);
    NewAssets.register('nightstand', { w: 2.0, l: 1.6, h: 2.2, color: '#8a5a3c', name: 'Nightstand', icon: '🌙', tile: 'Nightstand', mode: 'home' }, buildNightstand);
   NewAssets.register('refrigerator',  { w: 3.0, l: 2.5, h: 6.25, color: '#c4c8ce', name: 'Refrigerator', icon: '🧊', tile: 'Refrigerator',  mode: 'home' }, buildRefrigerator);
  NewAssets.register('range',         { w: 2.5, l: 2.2, h: 3.28, color: '#3d4754', name: 'Range',        icon: '🔥', tile: 'Range',         mode: 'home' }, buildRange);
  NewAssets.register('dishwasher',    { w: 2.5, l: 2.2, h: 2.85, color: '#9ca3af', name: 'Dishwasher',   icon: '🫧', tile: 'Dishwasher',    mode: 'home' }, buildDishwasher);
  NewAssets.register('kitchen-sink',  { w: 3.0, l: 2.2, h: 3.5,  color: '#8a5a3c', name: 'Kitchen Sink', icon: '🚰', tile: 'Kitchen Sink',  mode: 'home' }, buildKitchenSink);
  NewAssets.register('base-cabinet',  { w: 3.0, l: 2.0, h: 2.9,  color: '#8a5a3c', name: 'Base Cabinet', icon: '🗄️', tile: 'Base Cabinet',  mode: 'home' }, buildBaseCabinet);
  NewAssets.register('kitchen-island',{ w: 6.0, l: 3.0, h: 2.8,  color: '#5f4832', name: 'Kitchen Island', icon: '🍳', tile: 'Kitchen Island', mode: 'home' }, buildKitchenIsland);
  NewAssets.register('dining-table',  { w: 6.0, l: 3.5, h: 2.45, color: '#7a5636', name: 'Dining Table', icon: '🍽️', tile: 'Dining Table',  mode: 'home' }, buildDiningTable);
   NewAssets.register('toilet',         { w: 2.0, l: 2.5, h: 2.5,  color: '#f1f5f9', name: 'Toilet',        icon: '🚽', tile: 'Toilet',         mode: 'home' }, buildToilet);
  NewAssets.register('vanity',         { w: 4.0, l: 1.8, h: 3.0,  color: '#8a5a3c', name: 'Vanity',        icon: '🧴', tile: 'Vanity',         mode: 'home' }, buildVanity);
  NewAssets.register('shower',         { w: 4.0, l: 4.0, h: 7.0,  color: '#cbd5e1', name: 'Shower Stall',  icon: '🚿', tile: 'Shower Stall',   mode: 'home' }, buildShower);
  NewAssets.register('bathtub',        { w: 5.5, l: 2.7, h: 2.4,  color: '#f1f5f9', name: 'Bathtub',       icon: '🛁', tile: 'Bathtub',        mode: 'home' }, buildBathtub);
  NewAssets.register('pedestal-sink',  { w: 2.0, l: 1.5, h: 3.0,  color: '#f1f5f9', name: 'Pedestal Sink', icon: '🚰', tile: 'Pedestal Sink',  mode: 'home' }, buildPedestalSink);
  NewAssets.register('linen-cabinet',  { w: 2.0, l: 1.5, h: 6.0,  color: '#8a5a3c', name: 'Linen Cabinet', icon: '🧺', tile: 'Linen Cabinet',  mode: 'home' }, buildLinenCabinet);
  NewAssets.register('towel-stand',    { w: 2.5, l: 1.0, h: 5.0,  color: '#cbd5e1', name: 'Towel Stand',   icon: '🧻', tile: 'Towel Stand',    mode: 'home' }, buildTowelStand);
 // -------------------------------------------------------------- AUTO-SYNC
  // Automatically builds HTML tiles, click handlers, and thumbnail specs
  // for every asset registered in NewAssets with mode: 'home'.
  function autoSyncHomeAssets() {
    if (typeof NewAssets === 'undefined' || !NewAssets.SPECS) return;
    const grid = document.querySelector('#pane-assets .asset-picker-grid');
    if (!grid) return;

    Object.keys(NewAssets.SPECS).forEach(function (type) {
      const s = NewAssets.SPECS[type];
      if (!s || s.mode !== 'home') return;

      // 1. Auto-create the HTML button tile if it doesn't exist yet
      let btn = document.getElementById('btn-add-' + type);
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'asset-tile';
        btn.id = 'btn-add-' + type;
        btn.setAttribute('data-type', type);
        btn.setAttribute('data-modes', 'home');
        btn.title = 'Add ' + (s.name || type) + ' (' + s.w + '×' + s.l + ' ft)';
        btn.innerHTML =
          '<span class="tile-preview" aria-hidden="true"><span class="tile-fallback">' + (s.icon || '🛋️') + '</span></span>' +
          '<span class="tile-label">' + (s.tile || s.name || type) + '</span>';
        grid.appendChild(btn);
      }

      // 2. Apply tile color inline (eliminates the need for CSS rules per asset)
      if (s.color) {
        btn.style.setProperty('--tile-color', s.color);
      }

      // 3. Wire up the click handler to spawn the furniture in the room
      btn.onclick = function () {
        const pos = typeof findOpenRoomSlot === 'function'
          ? findOpenRoomSlot(s.w, s.l)
          : findNextOpenSlot(s.w, s.l);
        spawnBin(type, pos.x, pos.y, s.w, s.l, 1, null, s.name);
      };

      // 4. Register in ASSET_TILE_THUMB_SPECS so exportAssetThumbnailsJS() renders it
      if (typeof ASSET_TILE_THUMB_SPECS !== 'undefined' && Array.isArray(ASSET_TILE_THUMB_SPECS)) {
        const exists = ASSET_TILE_THUMB_SPECS.some(function (item) { return item.dataType === type; });
        if (!exists) {
          ASSET_TILE_THUMB_SPECS.push({
            dataType: type,
            type: type,
            w: s.w,
            l: s.l,
            tiers: 1,
            settings: { heightFt: s.h }
          });
        }
      }
    });

    // Apply static PNG thumbnails if asset-thumbs.js is already loaded
    if (typeof applyStaticAssetThumbnails === 'function') {
      applyStaticAssetThumbnails();
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', autoSyncHomeAssets);
  } else {
    autoSyncHomeAssets();
  }
  window.addEventListener('load', autoSyncHomeAssets);

})();