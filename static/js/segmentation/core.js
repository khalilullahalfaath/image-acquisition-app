import {
  btnSegSelectImage, segImagePathEl, segSourceBody, btnRunSegmentation,
  segPatientNameInput, btnSegAddCell, segResultBody, btnLoadSegmentation,
  btnSaveSegmentation, segSelectAllCells, segDetectionsBody, segBulkActionsBar,
} from "../dom.js";
import { segState } from "./state.js";
import { segFolderOf } from "./utils.js";
import { switchSegImageTab } from "./tabs.js";
import {
  renderSegmentationOverlay, renderDetectionsList, updateClassSummaryFromDetections,
  renderClassSummary, resetSegZoom,
} from "./detections.js";
import { showConfirmModal, showToast } from "../modal.js";

export function resetSegmentationResults() {
  segState.segDetections = [];
  segState.segActiveCellId = null;
  segState.segAddMode = false;
  segState.segSelectedCellIds = new Set();
  segSelectAllCells.checked = false;
  btnSegAddCell.classList.remove("btn-toggle-active");
  btnSegAddCell.disabled = true;
  resetSegZoom();
  segResultBody.innerHTML =
    '<span class="placeholder-text">Belum ada hasil<br />Klik "Jalankan Segmentasi" (hasilnya masih data dummy/placeholder)</span>';
  segDetectionsBody.innerHTML = '<div class="summary-row">Belum ada hasil.</div>';
  segBulkActionsBar.classList.add("view-hidden");
  renderClassSummary(null);
  btnSaveSegmentation.disabled = true;
  switchSegImageTab("source");
}

export async function doSelectSegmentationImage() {
  btnSegSelectImage.disabled = true;
  btnSegSelectImage.textContent = "Memilih...";
  const res = await fetch("/api/segmentation/select-image", { method: "POST" });
  btnSegSelectImage.disabled = false;
  btnSegSelectImage.textContent = "Pilih Gambar";
  const data = await res.json();
  if (!data.ok) {
    if (data.message) showToast(data.message);
    return;
  }
  segState.segSelectedPath = data.path;
  segState.segActiveFolder = segFolderOf(data.path);
  segState.segCurrentImageDataUrl = `data:image/png;base64,${data.image}`;
  segImagePathEl.textContent = "Gambar: " + data.path;
  segSourceBody.innerHTML = `<img src="${segState.segCurrentImageDataUrl}" alt="${data.filename}" />`;
  btnRunSegmentation.disabled = false;
  resetSegmentationResults();
}

// Logic bersama buat menerapkan hasil segmentasi yang dimuat balik ke UI --
// dipakai baik lewat dialog file (doLoadSegmentationResult) maupun klik
// langsung di daftar "Hasil di Folder Ini" (doLoadSegmentationResultByPath),
// jadi kontraknya konsisten dari dua jalur itu.
export function applyLoadedSegmentationResult(data) {
  segState.segSelectedPath = data.path;
  if (data.path) segState.segActiveFolder = segFolderOf(data.path);
  segPatientNameInput.value = data.patientId || "";
  segImagePathEl.textContent = data.path
    ? "Gambar: " + data.path + (data.detailFile ? ` (dimuat dari ${data.detailFile})` : "")
    : `Dimuat dari ${data.detailFile} (path gambar sumber tidak tercatat)`;

  segState.segDetections = (data.detections || []).map((d) => ({
    ...d,
    correctedClassIndex: d.correctedClassIndex ?? null,
    correctedClassLabel: d.correctedClassLabel ?? null,
  }));
  segState.segActiveCellId = null;
  segState.segAddMode = false;
  segState.segSelectedCellIds = new Set();
  segSelectAllCells.checked = false;
  btnSegAddCell.classList.remove("btn-toggle-active");
  resetSegZoom();

  if (data.image) {
    segState.segCurrentImageDataUrl = `data:image/png;base64,${data.image}`;
    segState.segImgW = data.width;
    segState.segImgH = data.height;
    segSourceBody.innerHTML = `<img src="${segState.segCurrentImageDataUrl}" alt="sumber" />`;
    renderSegmentationOverlay();
    btnRunSegmentation.disabled = false;
    btnSegAddCell.disabled = false;
    switchSegImageTab("result");
  } else {
    segState.segCurrentImageDataUrl = null;
    const missingMsg =
      '<span class="placeholder-text">Gambar sumber asli tidak ditemukan di lokasi semula<br />Daftar sel tetap bisa dilihat/dikoreksi di sebelah kanan</span>';
    segSourceBody.innerHTML = missingMsg;
    segResultBody.innerHTML = missingMsg;
    btnRunSegmentation.disabled = true;
    btnSegAddCell.disabled = true; // butuh gambar buat tahu posisi klik -> koordinat piksel
    switchSegImageTab("source");
    if (data.message) showToast(data.message);
  }

  renderDetectionsList();
  updateClassSummaryFromDetections();
  btnSaveSegmentation.disabled = segState.segDetections.length === 0;
}

// Muat balik hasil segmentasi yang sudah pernah disimpan lewat dialog pilih
// file JSON manual -- biar bisa dilihat & dikoreksi lagi tanpa perlu
// jalankan ulang dari nol.
export async function doLoadSegmentationResult() {
  btnLoadSegmentation.disabled = true;
  btnLoadSegmentation.textContent = "Memuat...";
  const res = await fetch("/api/segmentation/load", { method: "POST" });
  const data = await res.json();
  btnLoadSegmentation.disabled = false;
  btnLoadSegmentation.textContent = "Muat Hasil Tersimpan";

  if (!data.ok) {
    if (data.message) showToast(data.message);
    return;
  }
  applyLoadedSegmentationResult(data);
}

// Sama seperti di atas, tapi path file JSON-nya sudah diketahui (diklik dari
// daftar "Hasil di Folder Ini") -- TANPA buka dialog file lagi. Ini yang
// bikin review banyak hasil sekaligus (mis. satu pasien ~20 capture, hasil
// dari Proses Batch) jadi cuma klik-klik di dalam aplikasi, bukan
// buka-tutup dialog OS satu-satu per gambar.
export async function doLoadSegmentationResultByPath(detailPath) {
  const res = await fetch("/api/segmentation/load-path", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: detailPath }),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.message || "Gagal memuat hasil.");
    return;
  }
  applyLoadedSegmentationResult(data);
}

export async function doRunSegmentation() {
  if (!segState.segSelectedPath) return;

  // Peringatan kalau gambar ini sudah pernah diproses sebelumnya (individual
  // atau lewat batch) -- biar user sadar hasil lama bakal "tergantikan" di
  // tampilan (lihat dedup di list-results/patient-summary), meski riwayatnya
  // tetap tersimpan penuh di segmentation_log.csv.
  try {
    const checkRes = await fetch(
      "/api/segmentation/check-existing?path=" + encodeURIComponent(segState.segSelectedPath)
    );
    const checkData = await checkRes.json();
    if (checkData.exists) {
      const lanjut = await showConfirmModal(
        `Gambar ini sudah pernah diproses sebelumnya (${checkData.totalCells} sel, ` +
        `${checkData.timestamp}).\n\nJalankan ulang? Hasil baru akan menggantikan ` +
        `tampilan hasil lama (riwayat lama tetap tersimpan di segmentation_log.csv).`
      );
      if (!lanjut) return;
    }
  } catch (e) {
    // Kalau pengecekan gagal (mis. jaringan), lanjut proses seperti biasa --
    // ini cuma peringatan tambahan, bukan syarat wajib.
  }

  btnRunSegmentation.disabled = true;
  btnRunSegmentation.textContent = "Memproses...";
  segResultBody.innerHTML =
    '<span class="placeholder-text">Memproses segmentasi (dummy)...<br />Model beneran belum terpasang</span>';

  const res = await fetch("/api/segmentation/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: segState.segSelectedPath }),
  });
  const data = await res.json();
  btnRunSegmentation.disabled = false;
  btnRunSegmentation.textContent = "Jalankan Segmentasi";

  if (!data.ok) {
    showToast(data.message || "Gagal memproses.");
    resetSegmentationResults();
    return;
  }

  segState.segImgW = data.imageWidth;
  segState.segImgH = data.imageHeight;
  segState.segDetections = data.detections.map((d) => ({
    ...d,
    correctedClassIndex: null,
    correctedClassLabel: null,
  }));
  segState.segActiveCellId = null;
  segState.segAddMode = false;
  segState.segSelectedCellIds = new Set();
  segSelectAllCells.checked = false;
  btnSegAddCell.classList.remove("btn-toggle-active");
  btnSegAddCell.disabled = false;
  resetSegZoom();
  renderSegmentationOverlay();
  renderDetectionsList();
  updateClassSummaryFromDetections();
  btnSaveSegmentation.disabled = false;
  switchSegImageTab("result");
  if (data.mock) showToast(data.message);
}

export async function doSaveSegmentation() {
  if (!segState.segSelectedPath || segState.segDetections.length === 0) return;
  btnSaveSegmentation.disabled = true;
  btnSaveSegmentation.textContent = "Menyimpan...";

  const res = await fetch("/api/segmentation/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: segState.segSelectedPath,
      patientId: segPatientNameInput.value.trim(),
      detections: segState.segDetections,
    }),
  });
  const data = await res.json();
  btnSaveSegmentation.disabled = false;
  btnSaveSegmentation.textContent = "Simpan Hasil";

  if (!data.ok) {
    showToast(data.message || "Gagal menyimpan hasil.");
    return;
  }
  showToast(
    `Tersimpan (${data.totalCells} sel) -- lihat segmentation_log.csv di folder gambar sumber.`
  );
}
