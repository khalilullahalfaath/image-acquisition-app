const cameraDot = document.getElementById("cameraDot");
const cameraLabel = document.getElementById("cameraLabel");
const cameraSelect = document.getElementById("cameraSelect");
const resolutionSelect = document.getElementById("resolutionSelect");
const btnConnectCamera = document.getElementById("btnConnectCamera");

const btnCapture = document.getElementById("btnCapture");
const btnFolder = document.getElementById("btnFolder");
const btnSave = document.getElementById("btnSave");
const btnSummary = document.getElementById("btnSummary");
const btnCloseSummary = document.getElementById("btnCloseSummary");
const folderPathEl = document.getElementById("folderPath");
const summaryPanel = document.getElementById("summaryPanel");
const summaryBody = document.getElementById("summaryBody");

const streamBody = document.getElementById("streamBody");
const captureBody = document.getElementById("captureBody");
const captureBadge = document.getElementById("captureBadge");
const focusBadge = document.getElementById("focusBadge");
const blankBadge = document.getElementById("blankBadge");
const captureFilename = document.getElementById("captureFilename");
const captureCount = document.getElementById("captureCount");
const patientNameInput = document.getElementById("patientName");
const toast = document.getElementById("toast");
const galleryStrip = document.getElementById("galleryStrip");

let selectedFolder = null;
let hasCapturedImage = false;
let lastSavedId = null; // ID pasien terakhir yang berhasil disimpan di sesi ini
let lastCapturedImage = null; // base64 PNG hasil capture terakhir (buat thumbnail galeri)
let currentCaptureSaved = false; // true kalau capture yang aktif sekarang sudah pernah di-save
let currentCaptureSavedAs = null; // nama file terakhir dari capture yang aktif sekarang

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("toast-hidden");
  setTimeout(() => toast.classList.add("toast-hidden"), 3000);
}

async function loadCameras() {
  const res = await fetch("/api/cameras");
  const cameras = await res.json();
  cameraSelect.innerHTML = "";
  if (cameras.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "Tidak ada kamera terdeteksi";
    cameraSelect.appendChild(opt);
    return;
  }
  cameras.forEach((cam) => {
    const opt = document.createElement("option");
    opt.value = cam.index;
    opt.textContent = cam.name;
    cameraSelect.appendChild(opt);
  });
}

async function connectCamera() {
  const index = parseInt(cameraSelect.value || "0", 10);

  let width = null;
  let height = null;
  if (resolutionSelect.value) {
    const [w, h] = resolutionSelect.value.split("x").map(Number);
    width = w;
    height = h;
  }

  btnConnectCamera.disabled = true;
  btnConnectCamera.textContent = "Menghubungkan...";
  const res = await fetch("/api/camera/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ index, width, height }),
  });
  const data = await res.json();
  btnConnectCamera.disabled = false;
  btnConnectCamera.textContent = "Hubungkan";

  if (data.connected) {
    const selectedName = cameraSelect.options[cameraSelect.selectedIndex]
      ? cameraSelect.options[cameraSelect.selectedIndex].text
      : "index " + data.index;
    const resText = data.width && data.height ? ` (${data.width}x${data.height})` : "";
    cameraDot.className = "dot dot-on";
    cameraLabel.textContent = "Aktif: " + selectedName + resText;
    streamBody.innerHTML = '<img src="/stream" alt="stream" />';
    btnCapture.disabled = false;
  } else {
    cameraDot.className = "dot dot-off";
    cameraLabel.textContent = "Gagal menghubungkan kamera";
    showToast("Tidak bisa membuka kamera index " + index);
  }
}

async function doCapture() {
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
  hasCapturedImage = true;
  lastCapturedImage = data.image;
  currentCaptureSaved = false;
  currentCaptureSavedAs = null;

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

async function doSelectFolder() {
  btnFolder.disabled = true;
  btnFolder.textContent = "Memilih...";
  const res = await fetch("/api/select-folder", { method: "POST" });
  btnFolder.disabled = false;
  btnFolder.textContent = "Lokasi Simpan";
  const data = await res.json();
  if (!data.ok) return;
  selectedFolder = data.path;
  folderPathEl.textContent = "Lokasi: " + selectedFolder;
  btnSummary.disabled = false;
  updateSaveButtonState();
  loadFolderSummary();
}

function addToGallery(filename, thumbnailBase64) {
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

let summaryDismissed = false; // true kalau user sengaja nutup panel ringkasan

async function loadFolderSummary(options = {}) {
  const forceShow = options.forceShow !== false; // default true
  if (!selectedFolder) return;
  const res = await fetch("/api/folder-summary?folder=" + encodeURIComponent(selectedFolder));
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
  if (forceShow) summaryDismissed = false;
  if (!summaryDismissed) summaryPanel.classList.remove("summary-hidden");
}

function updateSaveButtonState() {
  btnSave.disabled = !(hasCapturedImage && selectedFolder && patientNameInput.value.trim());
}

async function doSave() {
  const currentId = patientNameInput.value.trim();

  // Kalau ID pasien beda dari yang terakhir disimpan di sesi ini, konfirmasi
  // dulu -- biar nggak salah nyimpen ke pasien yang salah tanpa sadar.
  if (lastSavedId && currentId !== lastSavedId) {
    const lanjut = confirm(
      `ID pasien berubah dari "${lastSavedId}" ke "${currentId}".\n\n` +
      `Lanjutkan simpan untuk "${currentId}"?`
    );
    if (!lanjut) return;
  }

  // Kalau capture yang sama (belum capture ulang) sudah pernah disimpan,
  // konfirmasi dulu -- biar nggak numpuk file duplikat isinya tanpa sadar.
  if (currentCaptureSaved) {
    const lanjut = confirm(
      `Gambar ini sudah disimpan sebelumnya sebagai "${currentCaptureSavedAs}".\n\n` +
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
      folder: selectedFolder,
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
  lastSavedId = currentId;
  currentCaptureSaved = true;
  currentCaptureSavedAs = data.filename;
  if (lastCapturedImage) addToGallery(data.filename, lastCapturedImage);
  loadFolderSummary({ forceShow: false });
}

btnConnectCamera.addEventListener("click", connectCamera);
btnCapture.addEventListener("click", doCapture);
btnFolder.addEventListener("click", doSelectFolder);
btnSave.addEventListener("click", doSave);
btnSummary.addEventListener("click", loadFolderSummary);
btnCloseSummary.addEventListener("click", () => {
  summaryPanel.classList.add("summary-hidden");
  summaryDismissed = true;
});
patientNameInput.addEventListener("input", updateSaveButtonState);

loadCameras();
