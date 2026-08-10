import {
  captureBody, captureBadge, captureFilename, focusBadge, blankBadge,
  btnFolder, folderPathEl, btnSummary, summaryBody, summaryPanel, galleryStrip,
  btnSave, patientNameInput, cameraSelect, resolutionSelect, captureCount,
  btnSendToSegmentation, segPatientNameInput, segImagePathEl, segSourceBody,
  btnRunSegmentation,
} from "./dom.js";
import { captureState } from "./state.js";
import { showConfirmModal, showToast } from "./modal.js";
import { switchTab } from "./view-tabs.js";
import { segState } from "./segmentation/state.js";
import { segFolderOf } from "./segmentation/utils.js";
import { resetSegmentationResults } from "./segmentation/core.js";

export async function doCapture() {
  const res = await fetch("/api/capture", { method: "POST" });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.message || "Gagal capture.");
    return;
  }
  captureBody.innerHTML = `<img src="data:image/png;base64,${data.image}" alt="hasil capture" />`;
  captureBadge.textContent = "Belum Tersimpan";
  captureBadge.className = "badge badge-unsaved";
  captureFilename.textContent = "";
  captureState.hasCapturedImage = true;
  captureState.lastCapturedImage = data.image;
  captureState.currentCaptureSaved = false;
  captureState.currentCaptureSavedAs = null;

  focusBadge.textContent =
    data.focusLabel === "Baik"
      ? `Fokus: Baik (${data.focusScore})`
      : `Fokus: Buram (${data.focusScore})`;
  focusBadge.className =
    "badge " + (data.focusLabel === "Baik" ? "badge-focus-good" : "badge-focus-bad");

  if (data.blankWarning) {
    blankBadge.textContent = "Kosong/Seragam";
    blankBadge.className = "badge badge-blank-warning";
  } else {
    blankBadge.textContent = "";
    blankBadge.className = "badge badge-hidden";
  }

  updateSaveButtonState();
}

export async function doSelectFolder() {
  btnFolder.disabled = true;
  btnFolder.textContent = "Memilih...";
  const res = await fetch("/api/select-folder", { method: "POST" });
  btnFolder.disabled = false;
  btnFolder.textContent = "Lokasi Simpan";
  const data = await res.json();
  if (!data.ok) return;
  captureState.selectedFolder = data.path;
  folderPathEl.textContent = "Lokasi: " + captureState.selectedFolder;
  btnSummary.disabled = false;
  updateSaveButtonState();
  loadFolderSummary();
}

export function addToGallery(filename, thumbnailBase64) {
  const empty = galleryStrip.querySelector(".gallery-empty");
  if (empty) empty.remove();

  const item = document.createElement("div");
  item.className = "gallery-item";
  item.innerHTML = `
    <img src="data:image/png;base64,${thumbnailBase64}" alt="${filename}" />
    <div class="gallery-label" title="${filename}">${filename}</div>
  `;
  galleryStrip.appendChild(item);
  galleryStrip.scrollLeft = galleryStrip.scrollWidth;
}

export async function loadFolderSummary(options = {}) {
  const forceShow = options.forceShow !== false; // default true
  if (!captureState.selectedFolder) return;
  const res = await fetch("/api/folder-summary?folder=" + encodeURIComponent(captureState.selectedFolder));
  const data = await res.json();
  if (!data.ok) {
    summaryBody.innerHTML = `<div class="summary-row">${data.message || "Gagal memuat ringkasan."}</div>`;
  } else if (data.summary.length === 0) {
    summaryBody.innerHTML = `<div class="summary-row">Belum ada gambar tersimpan di folder ini.</div>`;
  } else {
    const rows = data.summary
      .map((s) => `<div class="summary-row"><span>${s.id}</span><span>${s.count} gambar</span></div>`)
      .join("");
    summaryBody.innerHTML =
      rows +
      `<div class="summary-total">Total: ${data.totalPatients} pasien, ${data.totalFiles} gambar</div>`;
  }
  if (forceShow) captureState.summaryDismissed = false;
  if (!captureState.summaryDismissed) summaryPanel.classList.remove("summary-hidden");
}

export function updateSaveButtonState() {
  btnSave.disabled = !(captureState.hasCapturedImage && captureState.selectedFolder && patientNameInput.value.trim());
}

export async function doSave() {
  const currentId = patientNameInput.value.trim();

  // Kalau ID pasien beda dari yang terakhir disimpan di sesi ini, konfirmasi
  // dulu -- biar nggak salah nyimpen ke pasien yang salah tanpa sadar.
  if (captureState.lastSavedId && currentId !== captureState.lastSavedId) {
    const lanjut = await showConfirmModal(
      `ID pasien berubah dari "${captureState.lastSavedId}" ke "${currentId}".\n\n` +
      `Lanjutkan simpan untuk "${currentId}"?`
    );
    if (!lanjut) return;
  }

  // Kalau capture yang sama (belum capture ulang) sudah pernah disimpan,
  // konfirmasi dulu -- biar nggak numpuk file duplikat isinya tanpa sadar.
  if (captureState.currentCaptureSaved) {
    const lanjut = await showConfirmModal(
      `Gambar ini sudah disimpan sebelumnya sebagai "${captureState.currentCaptureSavedAs}".\n\n` +
      `Simpan lagi sebagai file baru (isi gambarnya tetap sama)?`
    );
    if (!lanjut) return;
  }

  const cameraName = cameraSelect.options[cameraSelect.selectedIndex]
    ? cameraSelect.options[cameraSelect.selectedIndex].text
    : "";

  // Kalau kamera tidak bisa diatur resolusinya langsung (mis. MiiCam),
  // width/height ini dipakai backend buat resize software sebelum disimpan.
  let width = null;
  let height = null;
  if (resolutionSelect.value) {
    const [w, h] = resolutionSelect.value.split("x").map(Number);
    width = w;
    height = h;
  }

  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patientName: currentId,
      folder: captureState.selectedFolder,
      cameraName,
      width,
      height,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    showToast(data.message || "Gagal menyimpan.");
    return;
  }
  captureBadge.textContent = "Tersimpan";
  captureBadge.className = "badge badge-saved";
  captureFilename.textContent = data.filename;
  captureCount.textContent = data.count;
  const savedRes = data.width && data.height ? `, ${data.width}x${data.height}` : "";
  showToast("Tersimpan: " + data.filename + " (iterasi " + data.count + savedRes + ")");
  captureState.lastSavedId = currentId;
  captureState.currentCaptureSaved = true;
  captureState.currentCaptureSavedAs = data.filename;
  captureState.lastSavedFullPath = data.path;
  btnSendToSegmentation.disabled = false;
  if (captureState.lastCapturedImage) addToGallery(data.filename, captureState.lastCapturedImage);
  loadFolderSummary({ forceShow: false });
}

// Dipanggil dari tombol "Kirim ke Segmentasi" di tab Capture -- pakai
// gambar & path yang baru saja disimpan (captureState.lastSavedFullPath/captureState.lastCapturedImage
// dari doSave()), jadi user nggak perlu buka file dialog manual lagi.
export function sendCaptureToSegmentation() {
  if (!captureState.lastSavedFullPath) return;
  segState.segSelectedPath = captureState.lastSavedFullPath;
  segState.segActiveFolder = segFolderOf(captureState.lastSavedFullPath);
  segState.segCurrentImageDataUrl = captureState.lastCapturedImage ? `data:image/png;base64,${captureState.lastCapturedImage}` : null;
  segImagePathEl.textContent = "Gambar: " + segState.segSelectedPath;
  segPatientNameInput.value = patientNameInput.value.trim();
  segSourceBody.innerHTML = segState.segCurrentImageDataUrl
    ? `<img src="${segState.segCurrentImageDataUrl}" alt="sumber" />`
    : '<span class="placeholder-text">Gambar tersimpan. Klik "Jalankan Segmentasi".</span>';
  btnRunSegmentation.disabled = false;
  resetSegmentationResults();
  switchTab("segmentation");
  showToast("Gambar dikirim ke tab Segmentasi.");
}
