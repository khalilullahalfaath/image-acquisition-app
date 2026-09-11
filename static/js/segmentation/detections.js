import {
  segResultBody, segSourceBody, segZoomLabel, segDetectionsBody,
  classSummaryBody, classChartBody, segTotalCellCount, btnSegAddCell, btnSaveSegmentation,
  segSelectAllCells, segBulkClassSelect, segTabDetections, segBulkActionsBar,
} from "../dom.js";
import { segState, SEG_LOW_CONFIDENCE_THRESHOLD } from "./state.js";
import { currentClassIndex, polygonCentroid } from "./utils.js";
import { switchSegImageTab, switchSegListTab } from "./tabs.js";
import { showToast } from "../modal.js";

// -----------------------------------------------------------------------
// Zoom & pan gambar
// -----------------------------------------------------------------------
export function applySegZoomTransform() {
  const transform = `translate(${segState.segPanX}px, ${segState.segPanY}px) scale(${segState.segZoom})`;
  const srcImg = segSourceBody.querySelector("img");
  if (srcImg) srcImg.style.transform = transform;
  const wrap = segResultBody.querySelector(".seg-overlay-wrap");
  if (wrap) wrap.style.transform = transform;
  const cursor = segState.segZoom > 1 ? "grab" : "default";
  segSourceBody.style.cursor = cursor;
  segResultBody.style.cursor = segState.segAddMode ? "crosshair" : cursor;
  // Mode tambah sel: polygon sel yang sudah ada juga harus tetap kelihatan
  // "crosshair" (bukan "pointer") biar nggak membingungkan -- klik tetap
  // nambah sel baru di posisi manapun, bukan pilih sel yang sudah ada.
  if (wrap) wrap.classList.toggle("seg-add-mode-active", segState.segAddMode);
  segZoomLabel.textContent = Math.round(segState.segZoom * 100) + "%";
}

export function resetSegZoom() {
  segState.segZoom = 1;
  segState.segPanX = 0;
  segState.segPanY = 0;
  applySegZoomTransform();
}

export function setSegZoom(newZoom) {
  segState.segZoom = Math.min(4, Math.max(1, newZoom));
  if (segState.segZoom === 1) {
    segState.segPanX = 0;
    segState.segPanY = 0;
  }
  applySegZoomTransform();
}

export function handleSegWheelZoom(e) {
  e.preventDefault();
  setSegZoom(segState.segZoom + (e.deltaY < 0 ? 0.15 : -0.15));
}

// Satu set handler mousedown/move/up dipakai bareng buat panel Gambar
// Sumber & Hasil Segmentasi -- kalau nggak zoom, mousedown+mouseup tanpa
// gerak berarti "klik" (dipakai buat nambah sel manual di segResultBody,
// lihat addManualCellAtEvent). Kalau lagi zoom (segState.segZoom>1) & mouse gerak,
// itu dianggap pan/geser, bukan klik.
export function segMouseDown(e) {
  if (e.button !== 0) return;
  segState.segPanActiveEl = e.currentTarget;
  segState.segMouseMoved = false;
  segState.segMouseDownX = e.clientX;
  segState.segMouseDownY = e.clientY;
  segState.segDragStartX = e.clientX - segState.segPanX;
  segState.segDragStartY = e.clientY - segState.segPanY;
}

export function segMouseMove(e) {
  if (!segState.segPanActiveEl) return;
  const dx = e.clientX - segState.segMouseDownX;
  const dy = e.clientY - segState.segMouseDownY;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) segState.segMouseMoved = true;
  if (segState.segMouseMoved && segState.segZoom > 1) {
    segState.segPanX = e.clientX - segState.segDragStartX;
    segState.segPanY = e.clientY - segState.segDragStartY;
    applySegZoomTransform();
  }
}

export function segMouseUp(e) {
  if (!segState.segPanActiveEl) return;
  const wasResultClick = !segState.segMouseMoved && segState.segPanActiveEl === segResultBody;
  const clickedInAddMode = wasResultClick && segState.segAddMode;
  const clickedForSelect = wasResultClick && !segState.segAddMode;
  segState.segPanActiveEl = null;
  if (clickedInAddMode) addManualCellAtEvent(e);
  else if (clickedForSelect) trySelectCellAtEvent(e);
}

// Klik langsung di sel (polygon) pada gambar Hasil Segmentasi -- highlight
// baris yang sesuai di panel Sel Terdeteksi (scroll ke situ + tandai aktif)
// supaya user bisa langsung ganti kelasnya lewat dropdown di baris itu atau
// shortcut angka 0-9, tanpa perlu cari baris satu-satu.
export function trySelectCellAtEvent(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const polygon = el && el.closest ? el.closest("polygon[data-cell-id]") : null;
  if (!polygon) return;
  const cellId = parseInt(polygon.dataset.cellId, 10);
  if (isNaN(cellId)) return;
  switchSegListTab("detections"); // pastikan panel Sel Terdeteksi kelihatan (bukan Hasil Folder)
  setActiveCell(cellId);
}

// -----------------------------------------------------------------------
// Tambah/hapus deteksi sel secara manual (koreksi hasil model, bukan cuma
// koreksi kelasnya)
// -----------------------------------------------------------------------
export function toggleSegAddMode() {
  segState.segAddMode = !segState.segAddMode;
  btnSegAddCell.classList.toggle("btn-toggle-active", segState.segAddMode);
  applySegZoomTransform(); // ikut update cursor jadi crosshair/default
  if (segState.segAddMode) {
    switchSegImageTab("result");
    showToast('Mode tambah sel aktif -- klik posisi sel di gambar. Klik tombol "Tambah Sel Manual" lagi buat matikan.');
  }
}

export function addManualCellAtEvent(e) {
  const svg = segResultBody.querySelector("svg");
  if (!svg || !segState.segImgW || !segState.segImgH) return;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
  const cx = Math.round(svgPt.x);
  const cy = Math.round(svgPt.y);
  if (cx < 0 || cy < 0 || cx > segState.segImgW || cy > segState.segImgH) return; // klik di luar area gambar

  const r = Math.max(6, Math.round(Math.min(segState.segImgW, segState.segImgH) * 0.03));
  const nPoints = 16;
  const mask = [];
  for (let p = 0; p < nPoints; p++) {
    const angle = (2 * Math.PI * p) / nPoints;
    mask.push([Math.round(cx + r * Math.cos(angle)), Math.round(cy + r * Math.sin(angle))]);
  }
  const nextId = segState.segDetections.reduce((max, d) => Math.max(max, d.id), -1) + 1;
  segState.segDetections.push({
    id: nextId,
    classIndex: 10, // default "Uncategorised" -- belum ada prediksi model, murni manual
    classLabel: "Uncategorised",
    confidence: 1,
    bbox: [cx - r, cy - r, 2 * r, 2 * r],
    mask,
    manual: true,
    correctedClassIndex: null,
    correctedClassLabel: null,
  });
  renderSegmentationOverlay();
  renderDetectionsList();
  updateClassSummaryFromDetections();
  btnSaveSegmentation.disabled = false;
  setActiveCell(nextId);
  showToast("Sel manual ditambahkan -- atur kelasnya di daftar sel (atau tekan tombol angka).");
}

export function deleteDetection(cellId) {
  segState.segDetections = segState.segDetections.filter((d) => d.id !== cellId);
  if (segState.segActiveCellId === cellId) segState.segActiveCellId = null;
  segState.segSelectedCellIds.delete(cellId);
  renderSegmentationOverlay();
  renderDetectionsList();
  updateClassSummaryFromDetections();
  btnSaveSegmentation.disabled = segState.segDetections.length === 0;
}

// Sinkronkan highlight baris di Daftar Sel <-> polygon di overlay gambar,
// dipakai baik dari klik mouse maupun navigasi panah keyboard.
export function setActiveCell(cellId) {
  segState.segActiveCellId = cellId;
  segDetectionsBody.querySelectorAll(".seg-detection-row").forEach((r) => {
    r.classList.toggle("seg-row-active", parseInt(r.dataset.cellId, 10) === cellId);
  });
  const svg = segResultBody.querySelector("svg");
  if (svg) {
    svg.querySelectorAll("polygon").forEach((p) => {
      p.classList.toggle("seg-polygon-active", parseInt(p.dataset.cellId, 10) === cellId);
    });
  }
  const activeRow = segDetectionsBody.querySelector(`.seg-detection-row[data-cell-id="${cellId}"]`);
  if (activeRow) activeRow.scrollIntoView({ block: "nearest" });
}

export async function loadClassLegend() {
  const res = await fetch("/api/segmentation/classes");
  segState.segClassLabels = await res.json();
  renderClassSummary(null);
  segBulkClassSelect.innerHTML = segState.segClassLabels
    .map((c) => `<option value="${c.index}">${c.label}</option>`)
    .join("");
}

// counts === null -> tampilan awal (belum ada hasil, semua "-")
export function renderClassSummary(counts) {
  if (!counts) segState.segHighlightedClassIndex = null; // reset kalau panel di-clear (belum ada hasil)
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  classSummaryBody.innerHTML = segState.segClassLabels
    .map((c) => {
      const count = counts ? counts[c.label] ?? 0 : null;
      const pct = counts && total > 0 ? (count / total) * 100 : 0;
      const pctText = counts ? pct.toFixed(1) + "%" : "";
      // Baris cuma bisa diklik kalau sudah ada hasil (counts != null) -- klik
      // toggle highlight kelas itu di overlay gambar (lihat toggleClassHighlight).
      const clickable = counts ? " seg-class-clickable" : "";
      const active = counts && segState.segHighlightedClassIndex === c.index ? " seg-class-row-active" : "";
      return `
        <div class="summary-row seg-class-summary-row${clickable}${active}" data-class-index="${c.index}">
          <span><span class="seg-color-dot" style="background:${c.color}"></span>${c.label}</span>
          <span class="seg-class-summary-stats">
            <span>${count === null ? "&ndash;" : count}</span>
            ${counts ? `<span class="seg-class-pct">(${pctText})</span>` : ""}
          </span>
        </div>
      `;
    })
    .join("");

  if (counts) {
    classSummaryBody.querySelectorAll(".seg-class-clickable").forEach((el) => {
      el.addEventListener("click", () => toggleClassHighlight(parseInt(el.dataset.classIndex, 10)));
    });
  }
  renderClassChart(counts);
}

// Pembulatan "nice" buat jarak antar gridline sumbu Y (0/1/2/5x10^n) --
// pola umum di library chart, biar angka di sumbu gampang dibaca (bukan
// pecahan aneh kayak 0, 3.33, 6.67).
function niceTickStep(maxValue, targetTicks = 5) {
  if (maxValue <= 0) return 1;
  const raw = maxValue / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / magnitude;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * magnitude;
}

// Grafik batang vertikal (SVG, tanpa library eksternal) buat ringkasan
// klasifikasi per kelas -- pelengkap tampilan Tabel, biar sekali lihat
// langsung kebaca kelas mana yang dominan.
export function renderClassChart(counts) {
  if (!counts) {
    classChartBody.innerHTML =
      '<span class="placeholder-text">Belum ada hasil untuk ditampilkan sebagai grafik.</span>';
    return;
  }

  const chartW = 820;
  const chartH = 340;
  const marginLeft = 34;
  const marginRight = 10;
  const marginTop = 20;
  const marginBottom = 96;
  const plotW = chartW - marginLeft - marginRight;
  const plotH = chartH - marginTop - marginBottom;

  const n = segState.segClassLabels.length;
  const maxCount = Math.max(1, ...segState.segClassLabels.map((c) => counts[c.label] ?? 0));
  const tickStep = niceTickStep(maxCount);
  const niceMax = Math.max(tickStep, Math.ceil(maxCount / tickStep) * tickStep);
  const ticks = [];
  for (let t = 0; t <= niceMax; t += tickStep) ticks.push(t);

  const gridlines = ticks
    .map((t) => {
      const y = marginTop + plotH - (t / niceMax) * plotH;
      return `
        <line x1="${marginLeft}" y1="${y}" x2="${marginLeft + plotW}" y2="${y}" stroke="var(--slate-200)" stroke-width="1" />
        <text x="${marginLeft - 6}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="var(--slate-500)">${t}</text>
      `;
    })
    .join("");

  const barGap = 10;
  const barW = (plotW - barGap * (n - 1)) / n;
  const bars = segState.segClassLabels
    .map((c, i) => {
      const count = counts[c.label] ?? 0;
      const barH = (count / niceMax) * plotH;
      const x = marginLeft + i * (barW + barGap);
      const y = marginTop + plotH - barH;
      const labelX = x + barW / 2;
      const dimmed =
        segState.segHighlightedClassIndex !== null && segState.segHighlightedClassIndex !== c.index ? ' opacity="0.35"' : "";
      const active = segState.segHighlightedClassIndex === c.index ? ' class="seg-class-bar-active"' : "";
      return `
        <g class="seg-class-chart-bar-group seg-class-clickable" data-class-index="${c.index}">
          <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(barH, 0)}" fill="${c.color}" rx="3"${dimmed}${active} />
          <rect x="${x}" y="${marginTop}" width="${barW}" height="${plotH}" fill="transparent" />
          ${count > 0 ? `<text x="${labelX}" y="${y - 4}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--slate-800)">${count}</text>` : ""}
          <text x="${labelX}" y="${marginTop + plotH + 14}" text-anchor="end" font-size="10" fill="var(--slate-500)" transform="rotate(-40 ${labelX} ${marginTop + plotH + 14})">${c.label}</text>
        </g>
      `;
    })
    .join("");

  const axisLine = `<line x1="${marginLeft}" y1="${marginTop + plotH}" x2="${marginLeft + plotW}" y2="${marginTop + plotH}" stroke="var(--slate-400)" stroke-width="1.5" />`;

  classChartBody.innerHTML = `<svg viewBox="0 0 ${chartW} ${chartH}" class="seg-class-chart-svg">${gridlines}${bars}${axisLine}</svg>`;

  classChartBody.querySelectorAll(".seg-class-clickable").forEach((el) => {
    el.addEventListener("click", () => toggleClassHighlight(parseInt(el.dataset.classIndex, 10)));
  });
}

// Klik baris/bar kelas di ringkasan -> highlight (dim yang lain) sel kelas
// itu di overlay Hasil Segmentasi. Klik lagi kelas yang sama -> matikan lagi.
export function toggleClassHighlight(classIndex) {
  segState.segHighlightedClassIndex = segState.segHighlightedClassIndex === classIndex ? null : classIndex;
  updateClassSummaryFromDetections(); // render ulang tabel + grafik dgn state highlight terbaru
  applySegClassHighlightToOverlay();
}

export function applySegClassHighlightToOverlay() {
  const svg = segResultBody.querySelector("svg");
  if (!svg) return;
  svg.querySelectorAll("polygon[data-cell-id]").forEach((p) => {
    const det = segState.segDetections.find((d) => d.id === parseInt(p.dataset.cellId, 10));
    const idx = det ? currentClassIndex(det) : null;
    p.classList.toggle("seg-polygon-dimmed", segState.segHighlightedClassIndex !== null && idx !== segState.segHighlightedClassIndex);
  });
  svg.querySelectorAll("text.seg-cell-number-label").forEach((t) => {
    const det = segState.segDetections.find((d) => d.id === parseInt(t.dataset.cellId, 10));
    const idx = det ? currentClassIndex(det) : null;
    t.classList.toggle("seg-label-dimmed", segState.segHighlightedClassIndex !== null && idx !== segState.segHighlightedClassIndex);
  });
}

export function updateClassSummaryFromDetections() {
  const counts = {};
  segState.segClassLabels.forEach((c) => (counts[c.label] = 0));
  segState.segDetections.forEach((d) => {
    const label = d.correctedClassLabel || d.classLabel;
    if (label in counts) counts[label] += 1;
  });
  renderClassSummary(counts);
}

export function renderSegmentationOverlay() {
  const colorFor = (idx) => (segState.segClassLabels[idx] ? segState.segClassLabels[idx].color : "#64748b");
  // Ukuran font label nomor diskalakan relatif ke dimensi gambar (bukan
  // ukuran layar) karena SVG viewBox pakai satuan pixel gambar asli --
  // biar tetap terbaca proporsional baik di gambar kecil maupun besar.
  const numberFontSize = Math.max(14, Math.round(Math.min(segState.segImgW, segState.segImgH) * 0.018));
  let polygons = "";
  let labels = "";
  segState.segDetections.forEach((d, i) => {
    const idx = currentClassIndex(d);
    const pts = d.mask.map((p) => p.join(",")).join(" ");
    // Confidence rendah -> garis putus-putus, biar langsung kelihatan mana
    // yang perlu diprioritaskan dicek manual.
    const dashed = !d.manual && d.confidence < SEG_LOW_CONFIDENCE_THRESHOLD ? ' stroke-dasharray="4,3"' : "";
    const activeClass = d.id === segState.segActiveCellId ? ' class="seg-polygon-active"' : "";
    polygons += `<polygon data-cell-id="${d.id}" points="${pts}" fill="${colorFor(idx)}33" stroke="${colorFor(idx)}" stroke-width="2"${dashed}${activeClass} />`;
    // Nomor label ini match sama "Sel #${i+1}" di daftar (renderDetectionsList)
    // supaya user gampang korelasikan mask di gambar dengan baris di daftar.
    const [cx, cy] = polygonCentroid(d.mask);
    labels += `<text class="seg-cell-number-label" data-cell-id="${d.id}" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="${numberFontSize}">${i + 1}</text>`;
  });
  segResultBody.innerHTML = `
    <div class="seg-overlay-wrap">
      <img src="${segState.segCurrentImageDataUrl}" alt="hasil segmentasi" />
      <svg viewBox="0 0 ${segState.segImgW} ${segState.segImgH}" preserveAspectRatio="xMidYMid meet">${polygons}${labels}</svg>
    </div>
  `;
  applySegZoomTransform();
  applySegClassHighlightToOverlay();
}

// Dipanggil tiap kali segState.segDetections berubah -- biar jumlah sel di
// samping tombol "Hasil Segmentasi" selalu konsisten sama daftar sel &
// overlay.
export function updateSegTotalCellCount() {
  segTotalCellCount.textContent =
    segState.segDetections.length > 0 ? `Jumlah sel terdeteksi: ${segState.segDetections.length} sel` : "";
}

export function renderDetectionsList() {
  updateSegTotalCellCount();
  const detectionsTabActive = segTabDetections.classList.contains("seg-image-tab-active");
  segBulkActionsBar.classList.toggle("view-hidden", segState.segDetections.length === 0 || !detectionsTabActive);
  if (segState.segDetections.length === 0) {
    segDetectionsBody.innerHTML = '<div class="summary-row">Tidak ada sel terdeteksi.</div>';
    return;
  }
  segDetectionsBody.innerHTML = segState.segDetections
    .map((d, i) => {
      const selectedIdx = currentClassIndex(d);
      const options = segState.segClassLabels
        .map((c) => `<option value="${c.index}" ${c.index === selectedIdx ? "selected" : ""}>${c.label}</option>`)
        .join("");
      const corrected =
        d.correctedClassIndex !== null &&
        d.correctedClassIndex !== undefined &&
        d.correctedClassIndex !== d.classIndex
          ? ' <span class="seg-corrected-tag">dikoreksi</span>'
          : "";
      const manualTag = d.manual ? ' <span class="seg-manual-tag">manual</span>' : "";
      const lowConf =
        !d.manual && d.confidence < SEG_LOW_CONFIDENCE_THRESHOLD
          ? ' <span class="seg-low-conf-tag">confidence rendah</span>'
          : "";
      const rowClass =
        "summary-row seg-detection-row" +
        (!d.manual && d.confidence < SEG_LOW_CONFIDENCE_THRESHOLD ? " seg-row-low-confidence" : "") +
        (d.id === segState.segActiveCellId ? " seg-row-active" : "");
      const checked = segState.segSelectedCellIds.has(d.id) ? " checked" : "";
      return `
        <div class="${rowClass}" data-cell-id="${d.id}">
          <input type="checkbox" class="seg-cell-checkbox" data-cell-id="${d.id}"${checked} />
          <span>Sel #${i + 1} (conf. ${(d.confidence * 100).toFixed(0)}%)${corrected}${manualTag}${lowConf}</span>
          <div class="seg-row-controls">
            <select class="seg-class-select" data-cell-id="${d.id}">${options}</select>
            <button type="button" class="seg-delete-btn" data-cell-id="${d.id}" title="Hapus deteksi ini">&times;</button>
          </div>
        </div>
      `;
    })
    .join("");

  segDetectionsBody.querySelectorAll(".seg-class-select").forEach((sel) => {
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", (e) => {
      const cellId = parseInt(e.target.dataset.cellId, 10);
      const newIndex = parseInt(e.target.value, 10);
      const det = segState.segDetections.find((d) => d.id === cellId);
      if (!det) return;
      det.correctedClassIndex = newIndex;
      det.correctedClassLabel = segState.segClassLabels[newIndex].label;
      renderDetectionsList();
      renderSegmentationOverlay();
      updateClassSummaryFromDetections();
    });
  });

  segDetectionsBody.querySelectorAll(".seg-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDetection(parseInt(btn.dataset.cellId, 10));
    });
  });

  segDetectionsBody.querySelectorAll(".seg-cell-checkbox").forEach((cb) => {
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", (e) => {
      const cellId = parseInt(e.target.dataset.cellId, 10);
      if (e.target.checked) segState.segSelectedCellIds.add(cellId);
      else segState.segSelectedCellIds.delete(cellId);
      segSelectAllCells.checked = segState.segSelectedCellIds.size === segState.segDetections.length;
    });
  });

  segDetectionsBody.querySelectorAll(".seg-detection-row").forEach((row) => {
    row.addEventListener("click", () => setActiveCell(parseInt(row.dataset.cellId, 10)));
  });
}

// -----------------------------------------------------------------------
// Koreksi massal (bulk) -- terapkan satu kelas ke banyak sel sekaligus,
// cocok buat kasus banyak sel yang salah diklasifikasi ke kelas yang sama
// (mis. banyak "Uncategorised" yang sebenarnya "Normal cell").
// -----------------------------------------------------------------------
export function toggleSegSelectAll() {
  if (segSelectAllCells.checked) {
    segState.segDetections.forEach((d) => segState.segSelectedCellIds.add(d.id));
  } else {
    segState.segSelectedCellIds.clear();
  }
  renderDetectionsList();
}

export function doSegBulkApply() {
  if (segState.segSelectedCellIds.size === 0) {
    showToast("Pilih minimal satu sel dulu (centang di samping tiap sel).");
    return;
  }
  const newIndex = parseInt(segBulkClassSelect.value, 10);
  const newLabel = segState.segClassLabels[newIndex].label;
  segState.segDetections.forEach((d) => {
    if (!segState.segSelectedCellIds.has(d.id)) return;
    d.correctedClassIndex = newIndex;
    d.correctedClassLabel = newLabel;
  });
  const count = segState.segSelectedCellIds.size;
  renderSegmentationOverlay();
  renderDetectionsList();
  updateClassSummaryFromDetections();
  btnSaveSegmentation.disabled = segState.segDetections.length === 0;
  showToast(`${count} sel diubah ke kelas "${newLabel}". Jangan lupa klik "Simpan Hasil".`);
}
