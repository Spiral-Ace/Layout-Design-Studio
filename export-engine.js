// ============================================================================
// 3D OBJ EXPORT
// ============================================================================
document.getElementById('btn-export-obj').onclick = () => {
  const pName = getProjectName();
  let objText = `# ${pName} - ${roomWidthFt}ft x ${roomLengthFt}ft CAD Layout\n# Units: Feet\n`;
  let vOffset = 1;

  function appendBox(name, x, y, z, w, h, l, angle = 0) {
    objText += `o ${name}\n`;
    const x0 = x - w/2, x1 = x + w/2;
    const y0 = y,       y1 = y + h;
    const z0 = z - l/2, z1 = z + l/2;
    const verts = [
      [x0,y0,z1], [x1,y0,z1], [x1,y0,z0], [x0,y0,z0],
      [x0,y1,z1], [x1,y1,z1], [x1,y1,z0], [x0,y1,z0]
    ];
    verts.forEach(v => {
      const dx = v[0] - x, dz = v[2] - z;
      const rx = x + dx * Math.cos(angle) + dz * Math.sin(angle);
      const rz = z - dx * Math.sin(angle) + dz * Math.cos(angle);
      objText += `v ${rx.toFixed(3)} ${v[1].toFixed(3)} ${rz.toFixed(3)}\n`;
    });
    const f = [
      [0,1,2,3], [7,6,5,4], [0,4,5,1],
      [1,5,6,2], [2,6,7,3], [3,7,4,0]
    ];
    f.forEach(face => objText += `f ${face[0]+vOffset} ${face[1]+vOffset} ${face[2]+vOffset} ${face[3]+vOffset}\n`);
    vOffset += 8;
  }

  // 1. Export Floor Tiles
  for (let fx = 0; fx < roomWidthFt; fx++) {
    for (let fy = 0; fy < roomLengthFt; fy++) {
      if (isInsideWarehouse(fx + 0.5, fy + 0.5)) {
        appendBox(`Floor_Tile_${fx}_${fy}`, fx + 0.5, -0.08, toWorldZ(fy + 0.5), 1, 0.08, 1);
      }
    }
  }

  // 2. Export Perimeter Walls
  const objWallPoints = customRoomOutline && customRoomOutline.length >= 3
    ? [...customRoomOutline, customRoomOutline[0]]
    : [[0,0],[0,roomLengthFt],[roomWidthFt,roomLengthFt],[roomWidthFt,0],[0,0]];
  for (let wi = 0; wi < objWallPoints.length - 1; wi++) {
    const [x1,y1] = objWallPoints[wi], [x2,y2] = objWallPoints[wi+1];
    const dx = x2 - x1, dz = toWorldZ(y2) - toWorldZ(y1), segLen = Math.hypot(dx,dz);
    if (segLen > 0.01) {
      const cx = (x1 + x2) / 2, cz = (toWorldZ(y1) + toWorldZ(y2)) / 2;
      appendBox(`Perimeter_Wall_${wi+1}`, cx, 0, cz, segLen, 8, 0.35, -Math.atan2(dz,dx));
    }
  }

  // 3. Export Placed Assets with Actual Heights and Clean Names
  bins.forEach(b => {
    const cx = b.x + b.w / 2, cz = toWorldZ(b.y + b.l / 2);
    const safeName = (b.label || `${b.type}_${b.id}`).replace(/[^a-zA-Z0-9_]+/g, '_');
    const h = b.type === 'pallet' ? (Number(b.heightFt) || 0.45) * Math.max(1, Number(b.tiers) || 1) : b.heightFt || (b.type === 'pallet' ? 0.45 : (b.type === 'palletpal' ? 3.0 : (b.type === 'shelf' ? 6.0 : (b.type === 'table' ? 3.0 : (b.type === 'fixture' ? 10.0 : (b.tiers || 1) * 3.2)))));
    appendBox(safeName, cx, 0, cz, b.w, h, b.l);
  });

  // 4. Export Fixed Equipment ONLY if Active in Scene
  if (conveyors.some(c => c.group.parent === scene)) {
    conveyors.forEach((c, idx) => {
      appendBox(`Uline_Conveyor_${idx+1}`, c.xFt + c.w/2, 0, toWorldZ(c.yStartFt + c.l/2), c.w, c.height, c.l);
    });
  }
  if (gorbelCrane.parent === scene) {
    const exportCraneX = 14 + gorbelCrane.position.x;
    const exportCraneZ = toWorldZ(0) + gorbelCrane.position.z;
    appendBox('GorbelCrane_BasePlate', exportCraneX, 0, exportCraneZ, 2.0, 0.22, 2.0);
    appendBox('GorbelCrane_Mast', exportCraneX, 0.22, exportCraneZ, 0.68, 10.0, 0.68);
  }

  const filename = `${slugifyProjectName(pName)}_v${slugifyProjectName(getProjectVersion())}_3D_mesh.obj`;
  downloadOrExportFile(filename, objText, 'text/plain', `3D OBJ Mesh in Feet (${bins.length} objects)`);
  const status = document.getElementById('cad-export-status');
  if (status) status.textContent = '3D OBJ mesh generated (units: feet).';
};

// ============================================================================
// 2D CAD DXF EXPORT
// ============================================================================
function cadDxfPair(code, value) { return `${code}\n${value}\n`; }
function cadDxfPolyline(points, layer, closed = true) {
  let out = cadDxfPair(0, 'LWPOLYLINE') + cadDxfPair(8, layer) + cadDxfPair(90, points.length) + cadDxfPair(70, closed ? 1 : 0);
  for (const pt of points) out += cadDxfPair(10, Number(pt[0].toFixed(4))) + cadDxfPair(20, Number(pt[1].toFixed(4)));
  return out;
}
function cadDxfRectangle(x, y, w, l, layer) {
  return cadDxfPolyline([[x, y], [x + w, y], [x + w, y + l], [x, y + l]], layer, true);
}
function cadDxfCircle(cx, cy, r, layer) {
  return cadDxfPair(0, 'CIRCLE') + cadDxfPair(8, layer) +
         cadDxfPair(10, Number(cx.toFixed(4))) +
         cadDxfPair(20, Number(cy.toFixed(4))) +
         cadDxfPair(30, 0.0) +
         cadDxfPair(40, Number(r.toFixed(4)));
}

function exportWarehouseDxf() {
  const pName = getProjectName();
  const name = slugifyProjectName(pName || 'warehouse');
  let entities = '';

  // 1. Perimeter Wall Outline
  const outline = customRoomOutline && customRoomOutline.length >= 3
    ? customRoomOutline
    : [[0, 0], [0, roomLengthFt], [roomWidthFt, roomLengthFt], [roomWidthFt, 0]];
  entities += cadDxfPolyline(outline, 'WALL_OUTLINE', true);

  // 2. Equipment Footprints (Correct Layers, No Double-Swap on Width/Length)
  bins.forEach(b => {
    const x = Number(b.x), y = Number(b.y), w = Number(b.w), l = Number(b.l);
    let layer = 'STEEL_BINS';
    if (b.type === 'shelf') layer = 'SHELVES';
    else if (b.type === 'table') layer = 'WORKBENCHES';
    else if (b.type === 'guardrail') layer = 'GUARDRAILS';
    else if (b.type === 'crane') layer = 'CRANE';
    else if (b.type === 'conveyor' || b.type === 'uline_rolling_conveyor') layer = 'CONVEYORS';
    else if (b.type === 'pallet' || b.type === 'palletpal') layer = 'PALLET_PALS';
    else if (b.type === 'fixture') layer = (b.label && b.label.includes('Column')) ? 'COLUMNS' : 'FIXTURES';
    entities += cadDxfRectangle(x, y, w, l, layer);
    if (b.type === 'crane') entities += cadDxfPolyline(getCraneBoomRect(b), 'CRANE_BOOM', true);   // boom collision box
  });

  // 3. Overhead Utility Drops
  if (customRoofDrops.electrical && customRoofDrops.electrical.length) {
    customRoofDrops.electrical.forEach(d => {
      entities += cadDxfCircle(Number(d.x), Number(d.y), 0.75, 'ELEC_DROPS');
    });
  }
  if (customRoofDrops.air && customRoofDrops.air.length) {
    customRoofDrops.air.forEach(d => {
      entities += cadDxfCircle(Number(d.x), Number(d.y), 0.75, 'AIR_DROPS');
    });
  }
  if (customRoofDrops.gas && customRoofDrops.gas.length) {
    customRoofDrops.gas.forEach(d => {
      entities += cadDxfCircle(Number(d.x), Number(d.y), 0.75, 'GAS_DROPS');
    });
  }

  // 4. Fixed Equipment ONLY if Visible
  if (conveyors.some(c => c.group.parent === scene)) {
    conveyors.forEach((c) => {
      entities += cadDxfRectangle(c.xFt, c.yStartFt, c.w, c.l, 'CONVEYORS');
    });
  }
  if (gorbelCrane.parent === scene) {
    const cx = 14 + gorbelCrane.position.x, cy = toWarehouseY(gorbelCrane.position.z);
    entities += cadDxfRectangle(cx - 1, cy - 1, 2, 2, 'CRANE');
  }

  // ASCII DXF R2000 Structure
  let dxf = '';
  dxf += cadDxfPair(0, 'SECTION') + cadDxfPair(2, 'HEADER');
  dxf += cadDxfPair(9, '$ACADVER') + cadDxfPair(1, 'AC1015');
  dxf += cadDxfPair(9, '$INSUNITS') + cadDxfPair(70, 2); // 2 = feet
  dxf += cadDxfPair(9, '$MEASUREMENT') + cadDxfPair(70, 0); // 0 = english/imperial
  dxf += cadDxfPair(0, 'ENDSEC') + cadDxfPair(0, 'SECTION') + cadDxfPair(2, 'TABLES');
  dxf += cadDxfPair(0, 'TABLE') + cadDxfPair(2, 'LAYER') + cadDxfPair(70, 9);
  [
    ['WALL_OUTLINE', 7], ['CONVEYORS', 4], ['SHELVES', 5], ['WORKBENCHES', 3],
    ['CRANE', 1], ['CRANE_BOOM', 30], ['STEEL_BINS', 2], ['PALLET_PALS', 2], ['COLUMNS', 6],
    ['FIXTURES', 8], ['ELEC_DROPS', 1], ['AIR_DROPS', 4], ['GAS_DROPS', 2]
  ].forEach(([layer, color]) => {
    dxf += cadDxfPair(0, 'LAYER') + cadDxfPair(2, layer) + cadDxfPair(70, 0) + cadDxfPair(62, color) + cadDxfPair(6, 'CONTINUOUS');
  });
  dxf += cadDxfPair(0, 'ENDTAB') + cadDxfPair(0, 'ENDSEC');
  dxf += cadDxfPair(0, 'SECTION') + cadDxfPair(2, 'ENTITIES') + entities + cadDxfPair(0, 'ENDSEC') + cadDxfPair(0, 'EOF');

  const filename = `${name}_v${slugifyProjectName(getProjectVersion())}_2D_plan.dxf`;
  downloadOrExportFile(filename, dxf, 'application/dxf', `2D CAD DXF Plan in Feet (${bins.length} objects)`);
  const status = document.getElementById('cad-export-status');
  if (status) status.textContent = '2D DXF plan exported with current wall outline and object footprints (units: feet).';
}
document.getElementById('btn-export-dxf').addEventListener('click', exportWarehouseDxf);
document.getElementById('btn-export-cad-obj').addEventListener('click', () => {
  document.getElementById('btn-export-obj').click();
});

// ============================================================================
// ============================================================================
// DYNAMIC PHOTO STUDIO & EQUIPMENT SCHEDULE CSV EXPORT ENGINE
// ============================================================================

function triggerCameraFlash() {
  const flash = document.getElementById('camera-flash-overlay');
  if (!flash) return;
  flash.style.transition = 'none';
  flash.style.opacity = '0.75';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flash.style.transition = 'opacity 0.35s ease-out';
      flash.style.opacity = '0';
    });
  });
}

async function capturePhoto(format = 'png', resolutionMultiplier = 1, customName = null) {
  triggerCameraFlash();
  const mimeType = (format === 'jpg' || format === 'jpeg') ? 'image/jpeg' : 'image/png';
  const ext = (format === 'jpg' || format === 'jpeg') ? 'jpg' : 'png';

  const baseW = window.innerWidth;
  const baseH = window.innerHeight;
  let targetW = Math.round(baseW * resolutionMultiplier);
  let targetH = Math.round(baseH * resolutionMultiplier);
  if (resolutionMultiplier === 2) {
    targetW = 1920;
    targetH = 1080;
  } else if (resolutionMultiplier === 4) {
    targetW = 3840;
    targetH = 2160;
  }

  // Save current renderer state
  const origPixelRatio = renderer.getPixelRatio();
  const origW = baseW;
  const origH = baseH;

  renderer.setPixelRatio(1);
  renderer.setSize(targetW, targetH, false);

  if (activeCam === perspCam) {
    perspCam.aspect = targetW / targetH;
    perspCam.updateProjectionMatrix();
  } else if (activeCam === orthoCam) {
    const a = targetW / targetH;
    const maxDim = Math.max(roomWidthFt, roomLengthFt);
    const orthoS = maxDim * 0.58;
    orthoCam.left = -orthoS * a;
    orthoCam.right = orthoS * a;
    orthoCam.top = orthoS;
    orthoCam.bottom = -orthoS;
    orthoCam.updateProjectionMatrix();
  }

  // Render high-res frame
  renderer.render(scene, activeCam);

  // Copy to export canvas
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetW;
  exportCanvas.height = targetH;
  const ctx = exportCanvas.getContext('2d');
  ctx.drawImage(renderer.domElement, 0, 0);

  // Optional Title Block Stamp
  const stampCheckbox = document.getElementById('chk-photo-stamp');
  const includeStamp = stampCheckbox ? stampCheckbox.checked : true;

  if (includeStamp) {
    const barHeight = Math.max(48, Math.round(targetH * 0.055));
    const pad = Math.round(barHeight * 0.28);

    // Dark HUD banner at bottom
    ctx.fillStyle = 'rgba(10, 15, 26, 0.88)';
    ctx.fillRect(0, targetH - barHeight, targetW, barHeight);

    // Cyan accent divider line
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, targetH - barHeight, targetW, Math.max(2, Math.round(targetH * 0.003)));

    const pName = getProjectName() || 'Warehouse CAD Layout';
    const pVer = getProjectVersion() || '1.0';
    const dims = `${roomWidthFt}'W × ${roomLengthFt}'L`;
    const viewLabel = getCameraModeLabel(currentCameraMode);
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    const fontSize = Math.max(12, Math.round(barHeight * 0.32));
    const subFontSize = Math.max(10, Math.round(barHeight * 0.24));

    // Left Title Block
    ctx.font = `bold ${fontSize}px "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`${pName} (v${pVer}) • ${dims}`, pad, targetH - barHeight + pad + fontSize * 0.78);

    ctx.font = `${subFontSize}px monospace`;
    ctx.fillStyle = '#94a3b8';
    const camStats = activeCam === perspCam
      ? `FOV: ${Math.round(perspCam.fov)}° • Height: ${Math.round(perspCam.position.y)}ft`
      : 'Orthographic 1:1 Scale';
    ctx.fillText(`Camera: ${viewLabel} • ${camStats}`, pad, targetH - pad);

    // Right Specs Block
    const totalAssets = bins.length;
    const totalDrops = (customRoofDrops.electrical?.length || 0) + (customRoofDrops.air?.length || 0) + (customRoofDrops.gas?.length || 0);
    const rightText = `${totalAssets} Placed Assets • ${totalDrops} Utility Drops`;

    ctx.font = `bold ${fontSize}px "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(rightText, targetW - pad, targetH - barHeight + pad + fontSize * 0.78);

    ctx.font = `${subFontSize}px monospace`;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(dateStr, targetW - pad, targetH - pad);
    ctx.textAlign = 'left';
  }

  // Restore original renderer dimensions
  renderer.setPixelRatio(origPixelRatio);
  renderer.setSize(origW, origH, false);
  if (activeCam === perspCam) {
    perspCam.aspect = origW / origH;
    perspCam.updateProjectionMatrix();
  } else if (activeCam === orthoCam) {
    const a = origW / origH;
    const maxDim = Math.max(roomWidthFt, roomLengthFt);
    const orthoS = maxDim * 0.58;
    orthoCam.left = -orthoS * a;
    orthoCam.right = orthoS * a;
    orthoCam.top = orthoS;
    orthoCam.bottom = -orthoS;
    orthoCam.updateProjectionMatrix();
  }
  renderer.render(scene, activeCam);

  const pSlug = slugifyProjectName(getProjectName());
  const modeSlug = currentCameraMode || 'photo';
  const filename = customName || `${pSlug}_${modeSlug}_${targetW}x${targetH}.${ext}`;

  return new Promise((resolve) => {
    exportCanvas.toBlob((blob) => {
      downloadOrExportFile(
        filename,
        blob,
        mimeType,
        `High-Res Photo (${targetW}×${targetH}) • ${getCameraModeLabel(currentCameraMode)}`
      );
      setCameraStatus(`✓ Saved ${ext.toUpperCase()}: ${filename} (${targetW}×${targetH})`);
      resolve(blob);
    }, mimeType, 0.95);
  });
}

async function capturePhotoPack() {
  // DESKTOP: ask for one folder up-front so the 4 images save without 4 dialogs.
  if (window.desktop && window.desktop.beginBatch) { const ok = await window.desktop.beginBatch(); if (!ok) return; }
  const initialMode = currentCameraMode;
  const initialCamPos = perspCam.position.clone();
  const initialTarget = controls.target.clone();
  const initialFov = perspCam.fov;

  const resSelect = document.getElementById('sel-photo-res');
  const resMult = resSelect ? Number(resSelect.value) || 2 : 2;
  const pSlug = slugifyProjectName(getProjectName());

  setCameraStatus('📸 Capturing Photo Pack... (1/4: Top 2D Blueprint)');
  setCameraView('top', false);
  await new Promise(r => setTimeout(r, 120));
  await capturePhoto('png', resMult, `${pSlug}_1_top_blueprint.png`);

  setCameraStatus('📸 Capturing Photo Pack... (2/4: 3D Isometric View)');
  setCameraView('iso', false);
  await new Promise(r => setTimeout(r, 120));
  await capturePhoto('png', resMult, `${pSlug}_2_isometric_overview.png`);

  setCameraStatus('📸 Capturing Photo Pack... (3/4: Eye-Level Walkthrough)');
  setCameraView('eye', false);
  await new Promise(r => setTimeout(r, 120));
  await capturePhoto('png', resMult, `${pSlug}_3_eye_level_walk.png`);

  setCameraStatus('📸 Capturing Photo Pack... (4/4: Aerial Drone 65°)');
  setCameraView('drone', false);
  await new Promise(r => setTimeout(r, 120));
  await capturePhoto('png', resMult, `${pSlug}_4_aerial_drone.png`);

  // Restore camera
  if (initialMode === 'top') {
    setCameraView('top', false);
  } else {
    activeCam = perspCam;
    controls.object = perspCam;
    perspCam.position.copy(initialCamPos);
    controls.target.copy(initialTarget);
    perspCam.fov = initialFov;
    perspCam.updateProjectionMatrix();
    controls.update();
  }
  setCameraStatus('✓ 4-Angle Photo Pack completed! All 4 high-res views generated.');
  if (window.desktop && window.desktop.endBatch) window.desktop.endBatch();
}

function exportEquipmentScheduleCsv() {
  const pName = getProjectName() || 'Warehouse Layout';
  const pVer = getProjectVersion() || '1.0';
  const now = new Date().toISOString();

  let csv = `# ==========================================================================\n`;
  csv += `# EQUIPMENT SCHEDULE & BILL OF MATERIALS (BOM)\n`;
  csv += `# Project: "${pName}" (v${pVer})\n`;
  csv += `# Facility Dimensions: ${roomWidthFt} ft (Width) x ${roomLengthFt} ft (Length) x 18 ft (Clear Ceiling)\n`;
  csv += `# Exported: ${now}\n`;
  csv += `# Units: Imperial Feet (ft) / Inches (in)\n`;
  csv += `# ==========================================================================\n\n`;

  // 1. Placed Equipment Table
  csv += `"SECTION 1: FLOOR-MOUNTED EQUIPMENT & ASSETS"\n`;
  csv += `"Item ID","Category","Type / Name","X (ft)","Y (ft)","Width (ft)","Length (ft)","Height (ft)","Tiers / Layers","Rotation (deg)","Color","Nearby Drops","Notes"\n`;

  bins.forEach((b, idx) => {
    const itemId = `EQ-${String(idx + 1).padStart(3, '0')}`;
    const cat = b.type ? b.type.toUpperCase() : 'EQUIPMENT';
    const label = b.label || (b.type === 'large' ? 'Large Steel Bin' : b.type === 'small' ? 'Small Steel Bin' : b.type);
    const x = (Math.round(b.x * 100) / 100).toFixed(2);
    const y = (Math.round(b.y * 100) / 100).toFixed(2);
    const w = (Math.round(b.w * 100) / 100).toFixed(2);
    const l = (Math.round(b.l * 100) / 100).toFixed(2);
    const h = (Math.round((b.assetHeight || b.heightFt || 4) * 100) / 100).toFixed(2);
    const tiers = b.tiers || 1;
    const rot = b.functionAngle || (b.rotated ? 90 : 0);
    const color = b.color || '#3b82f6';
    
    // Check nearby roof drops within 6 feet
    const nearby = [];
    (customRoofDrops.electrical || []).forEach(d => {
      const dist = Math.hypot(d.x - (b.x + b.w/2), d.y - (b.y + b.l/2));
      if (dist <= 6) nearby.push(`Elec #${d.id || d.name} (${dist.toFixed(1)}ft)`);
    });
    (customRoofDrops.air || []).forEach(d => {
      const dist = Math.hypot(d.x - (b.x + b.w/2), d.y - (b.y + b.l/2));
      if (dist <= 6) nearby.push(`Air #${d.id || d.name} (${dist.toFixed(1)}ft)`);
    });
    const dropsStr = nearby.join('; ') || 'None';
    const notes = b.customAssetId ? `Custom 3D Mesh (${b.customAssetId})` : 'Standard Catalog Equipment';

    csv += `"${itemId}","${cat}","${label}","${x}","${y}","${w}","${l}","${h}","${tiers}","${rot}","${color}","${dropsStr}","${notes}"\n`;
  });

  // 2. Fixed Conveyors
  csv += `\n"SECTION 2: CONVEYOR LINES"\n`;
  csv += `"Conveyor ID","Line Name","X Position (ft)","Y Start (ft)","Width (ft)","Length (ft)","Elevation (ft)","Power State","Status"\n`;
  conveyors.forEach((c, idx) => {
    const cId = `CV-${idx + 1}`;
    const name = `Gravity/Powered Conveyor Line ${idx + 1}`;
    const x = (c.xFt || 0).toFixed(2);
    const y = (c.yStartFt || 0).toFixed(2);
    const w = '3.00';
    const len = '10.00';
    const h = (c.height || 3).toFixed(2);
    const power = c.group && c.group.parent === scene ? 'Active / Visible' : 'Hidden';
    csv += `"${cId}","${name}","${x}","${y}","${w}","${len}","${h}","${power}","Operational"\n`;
  });

  // 3. Gorbel Crane System
  csv += `\n"SECTION 3: OVERHEAD CRANE SYSTEM"\n`;
  csv += `"System ID","Model / Equipment","Bridge Angle (deg)","Span X (ft)","Runway Z (ft)","Clearance Height","Capacity Rating","Status"\n`;
  const craneAngle = Number(craneAngleSlider ? craneAngleSlider.value : 0) || 0;
  csv += `"CR-001","Gorbel Work Station Bridge Crane","${craneAngle.toFixed(1)}","${gorbelCrane.position.x.toFixed(2)}","${gorbelCrane.position.z.toFixed(2)}","18.00 ft","2000 lbs (1 Ton)","Operational"\n`;

  // 4. Overhead Utilities (Roof Drops & Routes)
  csv += `\n"SECTION 4: OVERHEAD UTILITIES & DROP SCHEDULE"\n`;
  csv += `"Drop ID","Utility Type","X (ft)","Y (ft)","Drop Tier","Conduit / Pipe Size","Target Equipment / Region","Status"\n`;
  (customRoofDrops.electrical || []).forEach(d => {
    csv += `"${d.id || 'ELEC-DROP'}","Electrical (480V/120V)","${(d.x||0).toFixed(2)}","${(d.y||0).toFixed(2)}","Tier ${d.tier||1}","1.0 in EMT","Workstation / Machinery Power","Active"\n`;
  });
  (customRoofDrops.air || []).forEach(d => {
    csv += `"${d.id || 'AIR-DROP'}","Compressed Air (90-120 PSI)","${(d.x||0).toFixed(2)}","${(d.y||0).toFixed(2)}","Tier ${d.tier||1}","0.75 in Pipe","Pneumatic Tools / Levelers","Active"\n`;
  });
  (customRoofDrops.gas || []).forEach(d => {
    csv += `"${d.id || 'GAS-DROP'}","Gas / Specialty","${(d.x||0).toFixed(2)}","${(d.y||0).toFixed(2)}","Tier ${d.tier||1}","0.5 in Pipe","Specialty Utility","Active"\n`;
  });

  const filename = `${slugifyProjectName(pName)}_equipment_schedule_v${slugifyProjectName(pVer)}.csv`;
  downloadOrExportFile(
    filename,
    csv,
    'text/csv',
    `${bins.length} equipment items, ${conveyors.length} conveyors, Gorbel crane, ${((customRoofDrops.electrical?.length||0) + (customRoofDrops.air?.length||0))} utility drops`
  );
  setSaveStatus(`Exported Equipment Schedule (.CSV) with ${bins.length} assets and utility drops.`);
}

// Camera Sliders and Action Bindings
window.addEventListener('DOMContentLoaded', () => {
  const fovSlider = document.getElementById('camera-fov-slider');
  const fovBadge = document.getElementById('camera-fov-val');
  if (fovSlider) {
    fovSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (fovBadge) fovBadge.textContent = `${val}°`;
      if (activeCam === perspCam) {
        perspCam.fov = val;
        perspCam.updateProjectionMatrix();
      }
    });
  }

  const elevSlider = document.getElementById('camera-elev-slider');
  const elevBadge = document.getElementById('camera-elev-val');
  if (elevSlider) {
    elevSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (elevBadge) elevBadge.textContent = `${val} ft`;
      if (currentCameraMode === 'eye') {
        setEyeLevelHeight(val);
      } else if (activeCam === perspCam) {
        perspCam.position.y = val;
        controls.update();
      }
    });
  }

  document.getElementById('btn-snap-png')?.addEventListener('click', () => {
    const res = Number(document.getElementById('sel-photo-res')?.value) || 2;
    capturePhoto('png', res);
  });

  document.getElementById('btn-snap-jpg')?.addEventListener('click', () => {
    const res = Number(document.getElementById('sel-photo-res')?.value) || 2;
    capturePhoto('jpg', res);
  });

  document.getElementById('btn-photo-pack')?.addEventListener('click', () => {
    capturePhotoPack();
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    exportEquipmentScheduleCsv();
  });
});

// OFFLINE CUSTOM 3D ASSET LIBRARY
// ============================================================================
function setCustomAssetStatus(message, isError = false) {
  const el = document.getElementById('custom-asset-status');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#fca5a5' : '#6ee7b7';
}
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(binary);
}
function base64ToBytes(value) {
  const raw = atob(value || '');
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function safeAssetName(name) { return String(name || 'Imported Asset').replace(/\.[^.]+$/, '').replace(/[<>]/g, '').slice(0, 80) || 'Imported Asset'; }
function parseObjAsset(text) {
  const positions = [], normals = [], outPos = [], outNorm = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) positions.push([+parts[1], +parts[2], +parts[3]]);
    else if (parts[0] === 'vn' && parts.length >= 4) normals.push([+parts[1], +parts[2], +parts[3]]);
    else if (parts[0] === 'f' && parts.length >= 4) {
      const face = parts.slice(1).map(token => {
        const q = token.split('/'); let vi = parseInt(q[0], 10); if (vi < 0) vi = positions.length + vi + 1;
        let ni = q[2] ? parseInt(q[2], 10) : 0; if (ni < 0) ni = normals.length + ni + 1;
        return { v: positions[vi - 1], n: ni ? normals[ni - 1] : null };
      }).filter(v => v.v);
      for (let i = 1; i < face.length - 1; i++) for (const v of [face[0], face[i], face[i + 1]]) {
        outPos.push(...v.v); if (v.n) outNorm.push(...v.n);
      }
    }
  }
  if (!outPos.length) throw new Error('No triangular mesh faces were found in the OBJ file.');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  if (outNorm.length === outPos.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(outNorm, 3)); else geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.25, roughness: 0.65, side: THREE.DoubleSide }));
  const group = new THREE.Group(); group.add(mesh); normalizePrototype(group); return group;
}
function normalizePrototype(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (!Number.isFinite(box.min.x) || box.isEmpty()) throw new Error('The model has no visible geometry.');
  const centerX = (box.min.x + box.max.x) / 2, centerZ = (box.min.z + box.max.z) / 2;
  group.position.x -= centerX; group.position.z -= centerZ; group.position.y -= box.min.y;
  group.updateMatrixWorld(true);
  return group;
}
function parseGltfAsset(asset) {
  let json, binChunk = null;
  if (asset.format === 'glb') {
    const bytes = base64ToBytes(asset.data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('This is not a valid GLB file.');
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true); offset += 8;
      const chunk = bytes.slice(offset, offset + length); offset += length;
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk).replace(/\u0000+$/g, '').trim());
      else if (type === 0x004e4942) binChunk = chunk;
    }
  } else json = JSON.parse(asset.data);
  if (!json || !Array.isArray(json.meshes)) throw new Error('No glTF mesh data was found.');
  const fileMap = asset.files || {};
  const buffers = (json.buffers || []).map((b, i) => {
    if (b.uri && b.uri.startsWith('data:')) return base64ToBytes(b.uri.split(',')[1]);
    if (b.uri) {
      const key = Object.keys(fileMap).find(k => k.toLowerCase() === decodeURIComponent(b.uri).toLowerCase() || k.split('/').pop().toLowerCase() === decodeURIComponent(b.uri).split('/').pop().toLowerCase());
      if (!key) throw new Error('Missing referenced glTF buffer: ' + b.uri + '. Select the .gltf and referenced .bin files together.');
      return base64ToBytes(fileMap[key]);
    }
    if (i === 0 && binChunk) return binChunk;
    throw new Error('A glTF buffer is missing. Select all referenced .bin files together.');
  });
  function gltfImageDataUri(imageDef) {
    if (imageDef.uri && imageDef.uri.startsWith('data:')) return imageDef.uri;
    if (imageDef.uri) {
      const baseName = decodeURIComponent(imageDef.uri).split('/').pop();
      const key = Object.keys(fileMap).find(k => k.toLowerCase() === baseName.toLowerCase() || k.split('/').pop().toLowerCase() === baseName.toLowerCase());
      if (!key) return null;
      const ext = key.split('.').pop().toLowerCase(); const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
      return `data:${mime};base64,${fileMap[key]}`;
    }
    if (imageDef.bufferView !== undefined) {
      const bv = json.bufferViews[imageDef.bufferView], raw = buffers[bv.buffer || 0];
      const slice = raw.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      return `data:${imageDef.mimeType || 'image/png'};base64,${bytesToBase64(slice)}`;
    }
    return null;
  }
  const textureUris = (json.textures || []).map(t => { const imageDef = json.images?.[t.source]; return imageDef ? gltfImageDataUri(imageDef) : null; });
  const comp = {5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
  const compBytes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
  const typeCount = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
  function accessorData(index) {
    const a = json.accessors[index], bv = json.bufferViews[a.bufferView], data = buffers[bv.buffer || 0];
    const Ctor = comp[a.componentType]; if (!Ctor) throw new Error('Unsupported glTF component type.');
    const n = typeCount[a.type], size = compBytes[a.componentType], stride = bv.byteStride || n * size;
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0), result = new Ctor(a.count * n);
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < n; j++) {
      const off = start + i * stride + j * size; let v;
      if (a.componentType === 5126) v = dv.getFloat32(off, true);
      else if (a.componentType === 5125) v = dv.getUint32(off, true);
      else if (a.componentType === 5123) v = dv.getUint16(off, true);
      else if (a.componentType === 5122) v = dv.getInt16(off, true);
      else if (a.componentType === 5121) v = dv.getUint8(off);
      else v = dv.getInt8(off);
      if (a.normalized && a.componentType !== 5126) {
        if (a.componentType === 5121) v /= 255; else if (a.componentType === 5123) v /= 65535;
        else if (a.componentType === 5120) v = Math.max(-1, v / 127); else if (a.componentType === 5122) v = Math.max(-1, v / 32767);
      }
      result[i*n+j] = v;
    }
    return { data: result, count: a.count, itemSize: n, componentType: a.componentType };
  }
  const group = new THREE.Group();
  (json.meshes || []).forEach((meshDef, meshIndex) => (meshDef.primitives || []).forEach(primitive => {
    if (primitive.mode !== undefined && primitive.mode !== 4) return;
    if (primitive.attributes?.POSITION === undefined) return;
    const pos = accessorData(primitive.attributes.POSITION), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.data), pos.itemSize));
    if (primitive.attributes.NORMAL !== undefined) { const n = accessorData(primitive.attributes.NORMAL); geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n.data), n.itemSize)); }
    if (primitive.attributes.COLOR_0 !== undefined) { const c = accessorData(primitive.attributes.COLOR_0); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(c.data), c.itemSize)); }
    if (primitive.attributes.TEXCOORD_0 !== undefined) { const uv = accessorData(primitive.attributes.TEXCOORD_0); geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv.data), uv.itemSize)); }
    if (primitive.indices !== undefined) { const idx = accessorData(primitive.indices); geo.setIndex(new THREE.BufferAttribute(idx.data, 1)); }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals(); geo.computeBoundingBox();
    const matDef = json.materials?.[primitive.material]?.pbrMetallicRoughness || {};
    const f = matDef.baseColorFactor || [0.58,0.64,0.72,1];
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(f[0],f[1],f[2]), metalness: Math.max(0,Math.min(1,matDef.metallicFactor ?? 0.2)), roughness: Math.max(0,Math.min(1,matDef.roughnessFactor ?? 0.65)), vertexColors: !!geo.getAttribute('color'), transparent: f[3] < 1, opacity: f[3], side: THREE.DoubleSide });
    const texIndex = json.materials?.[primitive.material]?.pbrMetallicRoughness?.baseColorTexture?.index;
    if (texIndex !== undefined && textureUris[texIndex]) { mat.map = new THREE.TextureLoader().load(textureUris[texIndex], () => { mat.needsUpdate = true; }); mat.needsUpdate = true; }
    const modelMesh = new THREE.Mesh(geo, mat);
    const node = (json.nodes || []).find(n => n.mesh === meshIndex);
    if (node) {
      const matrix = new THREE.Matrix4();
      if (Array.isArray(node.matrix) && node.matrix.length === 16) matrix.fromArray(node.matrix);
      else matrix.compose(new THREE.Vector3(...(node.translation || [0,0,0])), new THREE.Quaternion(...(node.rotation || [0,0,0,1])), new THREE.Vector3(...(node.scale || [1,1,1])));
      modelMesh.applyMatrix4(matrix);
    }
    group.add(modelMesh);
  }));
  if (!group.children.length) throw new Error('No supported triangle meshes were found in this glTF/GLB file.');
  normalizePrototype(group); return group;
}
function buildCustomPrototype(asset) {
  if (customAssetCache.has(asset.id)) return customAssetCache.get(asset.id);
  let prototype;
  if (asset.format === 'obj') prototype = parseObjAsset(asset.data);
  else if (asset.format === 'glb' || asset.format === 'gltf') prototype = parseGltfAsset(asset);
  else throw new Error('Unsupported model format. Use OBJ, GLB, or glTF.');
  customAssetCache.set(asset.id, prototype); return prototype;
}
function buildCustomAssetVisual(wFt, lFt, isSelected, settings) {
  const group = new THREE.Group();
  const asset = customAssetLibrary.find(a => a.id === settings.customAssetId);
  if (!asset) {
    const missing = new THREE.Mesh(new THREE.BoxGeometry(wFt, 1, lFt), new THREE.MeshStandardMaterial({color:0xef4444, wireframe:true}));
    group.add(missing); return group;
  }
  const prototype = buildCustomPrototype(asset).clone(true);
  prototype.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(prototype), size = box.getSize(new THREE.Vector3());
  const sx = (settings.rotated ? lFt : wFt) / Math.max(0.001, size.x), sz = (settings.rotated ? wFt : lFt) / Math.max(0.001, size.z), sy = (sx + sz) / 2;
  prototype.scale.set(sx, sy, sz);
  if (settings.rotated) prototype.rotation.y = Math.PI / 2;
  prototype.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const tint = settings.color && settings.color !== '#ffffff' ? new THREE.Color(settings.color) : null; if (tint) { if (Array.isArray(o.material)) o.material = o.material.map(m => { const c=m.clone(); if (c.color) c.color.multiply(tint); return c; }); else if (o.material) { o.material=o.material.clone(); if (o.material.color) o.material.color.multiply(tint); } } } });
  group.add(prototype);
  if (isSelected) {
    const boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(wFt, Math.max(0.5, size.y * sy), lFt));
    const wire = new THREE.LineSegments(boxGeo, new THREE.LineBasicMaterial({color:0xfef08a}));
    wire.position.y = Math.max(0.5, size.y * sy) / 2; group.add(wire);
    const handleMat = new THREE.MeshBasicMaterial({color:0xfef08a});
    const handleGeo = new THREE.BoxGeometry(0.35,0.35,0.35);
    [{dir:'nw',x:-wFt/2,z:-lFt/2},{dir:'ne',x:wFt/2,z:-lFt/2},{dir:'sw',x:-wFt/2,z:lFt/2},{dir:'se',x:wFt/2,z:lFt/2}].forEach(c=>{const h=new THREE.Mesh(handleGeo,handleMat);h.position.set(c.x,0.25,c.z);h.userData.resizeHandle=c.dir;group.add(h);});
  }
  return group;
}
function renderCustomAssetLibrary() {
  const list = document.getElementById('custom-asset-list'); if (!list) return;
  list.innerHTML = '';
  if (!customAssetLibrary.length) { list.innerHTML = '<div style="font-size:11px;color:#64748b;padding:6px">No custom models imported yet.</div>'; }
  customAssetLibrary.forEach(asset => {
    const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px;border:1px solid rgba(148,163,184,.25);border-radius:6px;background:rgba(15,23,42,.45)';
    const radio = document.createElement('input'); radio.type='radio'; radio.name='custom-asset-choice'; radio.checked=asset.id===selectedCustomAssetId; radio.style.width='auto'; radio.addEventListener('change',()=>{selectedCustomAssetId=asset.id;renderCustomAssetLibrary();});
    const label = document.createElement('div'); label.style.cssText='flex:1;min-width:0;font-size:11px;color:#e2e8f0;overflow-wrap:anywhere'; label.textContent=asset.name+' ('+asset.format.toUpperCase()+')';
    const rename = document.createElement('button'); rename.textContent='Rename'; rename.style.fontSize='10px'; rename.addEventListener('click',async ()=>{const next=await appPrompt('Enter new name for asset:',asset.name,'Rename 3D Asset');if(next&&next.trim()){asset.name=next.trim().slice(0,80);renderCustomAssetLibrary();}});
    const remove = document.createElement('button'); remove.textContent='×'; remove.title='Remove from library'; remove.style.cssText='font-size:13px;padding:3px 7px;color:#fca5a5'; remove.addEventListener('click',async ()=>{if(!(await appConfirm('Remove '+asset.name+' from the custom library? Placed copies will become missing placeholders.','Remove Asset')))return;customAssetLibrary=customAssetLibrary.filter(a=>a.id!==asset.id);customAssetCache.delete(asset.id);if(selectedCustomAssetId===asset.id)selectedCustomAssetId=null;renderCustomAssetLibrary();});
    row.append(radio,label,rename,remove); list.appendChild(row);
  });
  document.getElementById('btn-place-asset').disabled = !selectedCustomAssetId || !customAssetLibrary.some(a=>a.id===selectedCustomAssetId);
}
function base64FromDataUri(uri) { return String(uri).split(',')[1] || ''; }
async function importCustomAssets() {
  const input = document.getElementById('input-import-asset'); const files = Array.from(input.files || []);
  if (!files.length) { setCustomAssetStatus('Choose one or more OBJ, GLB, or glTF files first.', true); return; }
  const fileMap = {};
  for (const f of files) fileMap[f.name] = f;
  const primary = files.filter(f => /\.(obj|glb|gltf)$/i.test(f.name));
  if (!primary.length) { setCustomAssetStatus('Select an OBJ, GLB, or glTF model file. Referenced .bin files can be selected alongside a .gltf file.', true); return; }
  try {
    let imported = 0;
    for (const file of primary) {
      const ext = file.name.split('.').pop().toLowerCase();
      const id = 'asset_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
      let asset = {id, name:safeAssetName(file.name), format:ext, data:'', files:{}};
      if (ext === 'obj') asset.data = await file.text();
      else if (ext === 'glb') asset.data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
      else {
        asset.data = await file.text();
        const parsed = JSON.parse(asset.data);
        for (const b of (parsed.buffers || [])) if (b.uri && !b.uri.startsWith('data:')) {
          const baseName = decodeURIComponent(b.uri).split('/').pop();
          const match = fileMap[baseName] || files.find(f=>f.name.toLowerCase()===baseName.toLowerCase());
          if (match) asset.files[match.name] = bytesToBase64(new Uint8Array(await match.arrayBuffer()));
        }
        for (const image of (parsed.images || [])) if (image.uri && !image.uri.startsWith('data:')) {
          const baseName = decodeURIComponent(image.uri).split('/').pop(); const match = fileMap[baseName] || files.find(f=>f.name.toLowerCase()===baseName.toLowerCase());
          if (match) asset.files[match.name] = bytesToBase64(new Uint8Array(await match.arrayBuffer()));
        }
      }
      buildCustomPrototype(asset);
      customAssetLibrary.push(asset); selectedCustomAssetId=id; imported++;
    }
    renderCustomAssetLibrary();
    setCustomAssetStatus(`Imported ${imported} model(s).`);
  } catch (err) { console.error(err); setCustomAssetStatus('Import failed: '+(err.message || String(err)), true); }
  finally { input.value=''; }
}
document.getElementById('btn-import-asset').addEventListener('click', importCustomAssets);
document.getElementById('btn-place-asset').addEventListener('click', () => {
  const asset = customAssetLibrary.find(a=>a.id===selectedCustomAssetId); if (!asset) return;
  const pos = findNextOpenSlot(4,4); spawnBin('custom',pos.x,pos.y,4,4,1,asset.id,asset.name);
  setCustomAssetStatus(`Placed “${asset.name}”.`);
});

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
}

// ============================================================================
// COMPLETE PROJECT HTML EXPORT
// ============================================================================
async function exportCompleteProjectHtml() {
  // DESKTOP: build the standalone HTML from the packaged source files (document.outerHTML would reference external files).
  if (window.desktop && window.desktop.exportStandaloneHtml) { return window.desktopExportStandaloneHtml(); }
  try {
    syncProjectMeta(getProjectName(), getProjectVersion());
    const project = collectLayoutProject();
    const currentHtml = document.documentElement.outerHTML;
    const cleanHtml = '<!DOCTYPE html>\n' + currentHtml
      .replace(/(<script id="embedded-asset-library" type="application\/json">)[\s\S]*?(<\/script>)/, (_, open, close) => open + escapeJsonForHtml(customAssetLibrary) + close)
      .replace(/(<script id="embedded-project-json" type="application\/json">)[\s\S]*?(<\/script>)/, (_, open, close) => open + '\n' + JSON.stringify(project, null, 2) + '\n' + close);
    const base = projectFolderSlug(project.projectName, project.projectVersion);
    const innerName = `${base}_studio.html`;
    await saveAsProjectFolder({
      folderName: base + '_studio',
      innerFilename: innerName,
      content: cleanHtml,
      readme: makeProjectReadme({
        projectName: project.projectName,
        projectVersion: project.projectVersion,
        primaryFile: innerName,
        kind: 'Standalone offline Layout Design Studio HTML',
        extraLines: [
          `Objects: ${project.bins.length}`,
          'Double-click the .html in Chrome, Edge, or Firefox to run the offline studio.'
        ]
      }),
      description: `Studio folder with ${innerName}`,
      statusSetter: setSaveStatus
    });
  } catch (err) {
    console.error(err);
    setSaveStatus('HTML export failed: ' + (err.message || String(err)), true);
  }
}
document.getElementById('btn-export-html').addEventListener('click', exportCompleteProjectHtml);
document.getElementById('btn-export-html-asset').addEventListener('click', exportCompleteProjectHtml);

// ============================================================================
// COMPLETE PROJECT DATA COLLECTOR & JSON SAVE
// ============================================================================
function collectLayoutProject() {
  const liftSlider = document.getElementById('lift-slider');
  return {
    app: 'Warehouse Crane Viewer',
    formatVersion: 3,
    projectName: getProjectName(),
    projectVersion: getProjectVersion(),
    projectMode: (typeof getProjectMode === 'function') ? getProjectMode() : 'warehouse',
    savedAt: new Date().toISOString(),
    bins: bins.map(b => ({
      id: b.id,
      type: b.type,
      x: Math.round(b.x * 100) / 100,
      y: Math.round(b.y * 100) / 100,
      w: Math.round(b.w * 100) / 100,
      l: Math.round(b.l * 100) / 100,
      rotated: !!b.rotated,
      facing: Number.isInteger(b.facing) ? b.facing : undefined,
      tiers: b.tiers,
      color: b.color,
      tableTopColor: b.type === 'table' ? (b.tableTopColor || '#f1ebdd') : undefined,
      tableOverheadOption: b.type === 'table' ? b.tableOverheadOption === true : undefined,
      tableVariant: b.type === 'table' ? (b.tableVariant === 'monitor' ? 'monitor' : 'packing') : undefined,
      gantryPoints: b.type === 'gantrycrane' ? (b.gantryPoints === 2 ? 2 : 4) : undefined,
      assetHeight: b.assetHeight,
      heightFt: b.heightFt,
      functionAngle: b.functionAngle || 0,
      boomLengthFt: b.type === 'crane' ? Math.round(getCraneBoomLength(b, b.w, b.l) * 10) / 10 : undefined,
      conveyorRunning: b.conveyorRunning !== false,
      customAssetId: b.customAssetId || null,
      label: b.label || ''
    })),
    customAssetLibrary,
    settings: {
      craneAngle: Number(craneAngleSlider.value) || 0,
      gorbelCraneOffsetX: gorbelCrane.position.x,
      gorbelCraneOffsetZ: gorbelCrane.position.z,
      liftHeight: conveyors[0] ? conveyors[0].height : (Number(liftSlider.value) || 3),
      conveyorHeights: conveyors.map(c => c.height),
      conveyorPositions: conveyors.map(c => ({ xFt: c.xFt, yStartFt: c.yStartFt })),
      fixedConveyorsVisible: conveyors.some(c => c.group.parent === scene),
      gorbelCraneVisible: gorbelCrane.parent === scene,
      preserveEmptyLayout: suppressDefaultShelvesOnLoad,
      snapIncrement,
      roomWidthFt,
      roomLengthFt,
      wallNotchRemoved: true,
      customRoomOutline: customRoomOutline ? customRoomOutline.map(p => [...p]) : null,
      wallsVisible: wallsGroup.visible,
      cameraView: activeCam === orthoCam ? 'top' : 'iso'
    },
    roofUtilities: {
      description: 'Overhead Utility Routing and Drops from Drawing',
      electricalDrops: (customRoofDrops.electrical || []).map(d => ({
        id: d.id, name: d.name || 'Electrical Drop', x: d.x, y: d.y, tier: d.tier || 1, size: d.size || 0.1
      })),
      airDrops: (customRoofDrops.air || []).map(d => ({
        id: d.id, name: d.name || 'Air Drop', x: d.x, y: d.y, tier: d.tier || 1, size: d.size || 0.1
      })),
      gasDrops: (customRoofDrops.gas || []).map(d => ({
        id: d.id, name: d.name || 'Gas Drop', x: d.x, y: d.y, tier: d.tier || 1, size: d.size || 0.1
      })),
      routes: customRoofRoutes
    },
    customRoofDrops,
    customRoofRoutes
  };
}

function setSaveStatus(message, isError = false) {
  const el = document.getElementById('save-layout-status');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#fca5a5' : '#6ee7b7';
}

document.getElementById('btn-save-layout').addEventListener('click', async () => {
  try {
    syncProjectMeta(getProjectName(), getProjectVersion());
    const project = collectLayoutProject();
    const jsonText = JSON.stringify(project, null, 2);
    const base = projectFolderSlug(project.projectName, project.projectVersion);
    const innerName = `${base}.json`;
    await saveAsProjectFolder({
      folderName: base,
      innerFilename: innerName,
      content: jsonText,
      readme: makeProjectReadme({
        projectName: project.projectName,
        projectVersion: project.projectVersion,
        primaryFile: innerName,
        kind: 'Layout Design Studio project JSON',
        extraLines: [
          `Objects: ${project.bins.length}`,
          `Room: ${project.settings?.roomWidthFt || '?'} ft × ${project.settings?.roomLengthFt || '?'} ft`,
          'Open this .json via Project → Open Project in Layout Design Studio.'
        ]
      }),
      description: `Project folder with ${innerName} · ${project.bins.length} objects`,
      statusSetter: setSaveStatus
    });
  } catch (err) {
    console.error(err);
    setSaveStatus('Could not save project: ' + (err.message || String(err)), true);
  }
});