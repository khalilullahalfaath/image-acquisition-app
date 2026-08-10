const tabCapture = document.getElementById("tabCapture");
const tabSegmentation = document.getElementById("tabSegmentation");
const captureView = document.getElementById("captureView");
const segmentationView = document.getElementById("segmentationView");
const cameraGroup = document.getElementById("cameraGroup");

const segTabSource = document.getElementById("segTabSource");
const segTabResult = document.getElementById("segTabResult");
const segTabDetections = document.getElementById("segTabDetections");
const segTabFolderResults = document.getElementById("segTabFolderResults");
const segDetectionsHelp = document.getElementById("segDetectionsHelp");
const segResultsListHelp = document.getElementById("segResultsListHelp");
const btnSegSelectImage = document.getElementById("btnSegSelectImage");
const btnLoadSegmentation = document.getElementById("btnLoadSegmentation");
const btnRunSegmentation = document.getElementById("btnRunSegmentation");
const btnSaveSegmentation = document.getElementById("btnSaveSegmentation");
const btnSendToSegmentation = document.getElementById("btnSendToSegmentation");
const segPatientNameInput = document.getElementById("segPatientName");
const segImagePathEl = document.getElementById("segImagePath");
const segSourceBody = document.getElementById("segSourceBody");
const segResultBody = document.getElementById("segResultBody");
const segDetectionsBody = document.getElementById("segDetectionsBody");
const classSummaryBody = document.getElementById("classSummaryBody");
const btnSegAddCell = document.getElementById("btnSegAddCell");
const btnSegZoomIn = document.getElementById("btnSegZoomIn");
const btnSegZoomOut = document.getElementById("btnSegZoomOut");
const btnSegZoomReset = document.getElementById("btnSegZoomReset");
const segZoomLabel = document.getElementById("segZoomLabel");
const btnSegPatientSummary = document.getElementById("btnSegPatientSummary");
const segPatientSummaryBody = document.getElementById("segPatientSummaryBody");
const btnSegBatchRun = document.getElementById("btnSegBatchRun");
const btnSegListResults = document.getElementById("btnSegListResults");
const segResultsListBody = document.getElementById("segResultsListBody");
const segResultsFilter = document.getElementById("segResultsFilter");
const btnSegExportReport = document.getElementById("btnSegExportReport");
const segBulkActionsBar = document.getElementById("segBulkActionsBar");
const segSelectAllCells = document.getElementById("segSelectAllCells");
const segBulkClassSelect = document.getElementById("segBulkClassSelect");
const btnSegBulkApply = document.getElementById("btnSegBulkApply");
const segModelStatusText = document.getElementById("segModelStatusText");
const segModelPathInput = document.getElementById("segModelPathInput");
const btnSegSaveModelConfig = document.getElementById("btnSegSaveModelConfig");

const cameraDot = document.getElementById("cameraDot");
const cameraLabel = document.getElementById("cameraLabel");
const cameraSelect = document.getElementById("cameraSelect");
const resolutionSelect = document.getElementById("resolutionSelect");
const btnConnectCamera = document.getElementById("btnConnectCamera");
const btnRefreshCameras = document.getElementById("btnRefreshCameras");
// null kalau OS server bukan Windows -- tombol ini disembunyikan server-side
// (lihat templates/index.html) karena dialog driver cuma didukung DirectShow.
const btnCameraSettings = document.getElementById("btnCameraSettings");

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

const confirmModal = document.getElementById("confirmModal");
const confirmModalMessage = document.getElementById("confirmModalMessage");
const confirmModalActions = document.getElementById("confirmModalActions");

let segSelectedPath = null; // path gambar sumber yang dipilih di tab Segmentasi
let segCurrentImageDataUrl = null; // data URL gambar sumber yang lagi ditampilkan (buat overlay hasil)
let segDetections = []; // hasil (+ kemungkinan koreksi manual) dari run terakhir
let segClassLabels = []; // cache [{index, label, color}, ...] dari /api/segmentation/classes
let segImgW = 0;
let segImgH = 0;
let segActiveFolder = null; // folder "aktif" buat Ringkasan per Pasien & Muat Daftar -- dari gambar terakhir dipilih/dimuat ATAU folder Proses Batch terakhir
let segActiveCellId = null; // id sel yang lagi dipilih (row diklik / navigasi panah)
let segAddMode = false; // true kalau lagi mode "Tambah Sel Manual"
let segHighlightedClassIndex = null; // kelas yang lagi di-highlight (klik baris/bar di ringkasan kelas)
let segSelectedCellIds = new Set(); // dipakai buat koreksi kelas massal (bulk)
let segResultsListCache = []; // cache hasil terakhir dari list-results, buat filter tanpa fetch ulang

// Zoom & pan gambar (Gambar Sumber / Hasil Segmentasi) -- diterapkan lewat
// CSS transform di elemen gambar, jadi koordinat mask (pixel asli gambar)
// nggak perlu diubah sama sekali; konversi klik->pixel pas nambah sel manual
// tetap akurat karena pakai SVG getScreenCTM() yang otomatis memperhitungkan
// transform ini.
let segZoom = 1;
let segPanX = 0;
let segPanY = 0;
let segPanActiveEl = null;
let segDragStartX = 0;
let segDragStartY = 0;
let segMouseDownX = 0;
let segMouseDownY = 0;
let segMouseMoved = false;

const SEG_LOW_CONFIDENCE_THRESHOLD = 0.7;

let selectedFolder = null;
let hasCapturedImage = false;
let lastSavedId = null; // ID pasien terakhir yang berhasil disimpan di sesi ini
let lastCapturedImage = null; // base64 PNG hasil capture terakhir (buat thumbnail galeri)
let lastSavedFullPath = null; // path lengkap hasil Save terakhir (buat "Kirim ke Segmentasi")
let currentCaptureSaved = false; // true kalau capture yang aktif sekarang sudah pernah di-save
let currentCaptureSavedAs = null; // nama file terakhir dari capture yang aktif sekarang
let isCameraConnected = false; // dipakai checkCameraStatus() buat deteksi kamera dicabut fisik

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("toast-hidden");
  setTimeout(() => toast.classList.add("toast-hidden"), 3000);
}

// Pengganti window.confirm()/window.prompt() bawaan browser -- tampilannya
// konsisten dengan desain aplikasi (bukan popup native OS/browser), dan tetap
// modal (nge-block interaksi lain sampai user pilih salah satu tombol).
// `choices` adalah array [{label, value, primary}], resolve dengan `value`
// dari tombol yang diklik. Dipakai buat kasus lebih dari sekadar
// Batal/Lanjutkan, mis. 3 pilihan di konfirmasi Proses Batch.
function showChoiceModal(message, choices) {
  return new Promise((resolve) => {
    confirmModalMessage.textContent = message;
    confirmModalActions.innerHTML = "";

    function cleanup(value) {
      confirmModal.classList.add("modal-hidden");
      confirmModalActions.innerHTML = "";
      resolve(value);
    }

    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = choice.label;
      btn.className = "btn " + (choice.primary ? "btn-primary" : "btn-outline");
      btn.addEventListener("click", () => cleanup(choice.value));
      confirmModalActions.appendChild(btn);
    });

    confirmModal.classList.remove("modal-hidden");
  });
}

// Pengganti window.confirm() sederhana (2 pilihan: Batal/Lanjutkan) -- dibuat
// di atas showChoiceModal supaya semua pemanggil lama (doSave, dst) nggak
// perlu diubah.
function showConfirmModal(message) {
  return showChoiceModal(message, [
    { label: "Batal", value: false },
    { label: "Lanjutkan", value: true, primary: true },
  ]);
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

// Dipakai bareng oleh connectCamera() (setelah klik Hubungkan) dan
// restoreCameraStatusIfConnected() (setelah reload halaman, kalau backend
// ternyata masih terhubung dari sebelumnya) -- biar UI "Aktif"-nya konsisten
// dari dua jalur berbeda ini.
function applyConnectedUI(selectedName, width, height) {
  const resText = width && height ? ` (${width}x${height})` : "";
  cameraDot.className = "dot dot-on";
  cameraLabel.textContent = "Aktif: " + selectedName + resText;
  streamBody.innerHTML = '<img src="/stream" alt="stream" />';
  btnCapture.disabled = false;
  if (btnCameraSettings) btnCameraSettings.disabled = false;
  isCameraConnected = true;
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
    applyConnectedUI(selectedName, data.width, data.height);
  } else {
    cameraDot.className = "dot dot-off";
    cameraLabel.textContent = "Gagal menghubungkan kamera";
    if (btnCameraSettings) btnCameraSettings.disabled = true;
    isCameraConnected = false;
    showToast(data.message || "Tidak bisa membuka kamera index " + index);
  }
}

function handleCameraDisconnected() {
  isCameraConnected = false;
  cameraDot.className = "dot dot-off";
  cameraLabel.textContent = "Kamera terputus (dicabut?)";
  streamBody.innerHTML =
    '<span class="placeholder-text">Kamera tidak terhubung<br />Hubungkan kamera USB mikroskop untuk memulai</span>';
  btnCapture.disabled = true;
  if (btnCameraSettings) btnCameraSettings.disabled = true;
  showToast("Koneksi ke kamera terputus. Cek kabel USB, lalu klik Hubungkan lagi.");
}

async function checkCameraStatus() {
  if (!isCameraConnected) return; // nggak perlu polling kalau memang belum/nggak lagi connect
  try {
    const res = await fetch("/api/camera/status");
    const data = await res.json();
    if (!data.connected) handleCameraDisconnected();
  } catch (e) {
    // Abaikan error jaringan sesaat, biar nggak salah nganggep disconnect
    // gara-gara satu request gagal doang.
  }
}

// Dipanggil sekali di awal (setelah loadCameras() ngisi dropdown) -- kalau
// server ternyata masih ada koneksi kamera aktif dari sebelum halaman
// di-reload (mis. Flask debug-reload, atau user cuma reload tab tanpa
// server-nya direstart), UI ikut disinkronkan tanpa user harus klik
// Hubungkan lagi secara manual.
async function restoreCameraStatusIfConnected() {
  try {
    const res = await fetch("/api/camera/status");
    const data = await res.json();
    if (!data.connected || data.index === null || data.index === undefined) return;

    cameraSelect.value = String(data.index);
    const selectedName = cameraSelect.options[cameraSelect.selectedIndex]
      ? cameraSelect.options[cameraSelect.selectedIndex].text
      : "index " + data.index;
    applyConnectedUI(selectedName, data.width, data.height);
  } catch (e) {
    // Server belum siap/nggak bisa dihubungi sesaat -- biarkan UI default
    // (belum connect), user masih bisa klik Hubungkan manual seperti biasa.
  }
}

async function openCameraSettings() {
  btnCameraSettings.disabled = true;
  btnCameraSettings.textContent = "Menunggu dialog ditutup...";
  const res = await fetch("/api/camera/settings", { method: "POST" });
  const data = await res.json();
  btnCameraSettings.disabled = false;
  btnCameraSettings.textContent = "Pengaturan Driver";

  if (!data.ok) {
    showToast(data.message || "Gagal membuka dialog pengaturan kamera.");
    return;
  }
  const selectedName = cameraSelect.options[cameraSelect.selectedIndex]
    ? cameraSelect.options[cameraSelect.selectedIndex].text
    : "";
  const resText = data.width && data.height ? ` (${data.width}x${data.height})` : "";
  cameraLabel.textContent = "Aktif: " + selectedName + resText;
  showToast("Resolusi kamera saat ini: " + data.width + "x" + data.height);
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
    const lanjut = await showConfirmModal(
      `ID pasien berubah dari "${lastSavedId}" ke "${currentId}".\n\n` +
      `Lanjutkan simpan untuk "${currentId}"?`
    );
    if (!lanjut) return;
  }

  // Kalau capture yang sama (belum capture ulang) sudah pernah disimpan,
  // konfirmasi dulu -- biar nggak numpuk file duplikat isinya tanpa sadar.
  if (currentCaptureSaved) {
    const lanjut = await showConfirmModal(
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
  lastSavedFullPath = data.path;
  btnSendToSegmentation.disabled = false;
  if (lastCapturedImage) addToGallery(data.filename, lastCapturedImage);
  loadFolderSummary({ forceShow: false });
}

// -----------------------------------------------------------------------
// Tab Segmentasi & Klasifikasi Morfologi Sel (scaffold UI -- model deep
// learning-nya belum diintegrasikan, lihat api_segmentation_run di app.py)
// -----------------------------------------------------------------------
function switchTab(tab) {
  const isCapture = tab === "capture";
  tabCapture.classList.toggle("tab-active", isCapture);
  tabSegmentation.classList.toggle("tab-active", !isCapture);
  captureView.classList.toggle("view-hidden", !isCapture);
  segmentationView.classList.toggle("view-hidden", isCapture);
  // Kontrol kamera di TopBar cuma relevan buat tab Capture (Segmentasi
  // kerja dari gambar yang sudah ada, bukan stream langsung).
  cameraGroup.classList.toggle("view-hidden", !isCapture);
}

async function loadClassLegend() {
  const res = await fetch("/api/segmentation/classes");
  segClassLabels = await res.json();
  renderClassSummary(null);
  segBulkClassSelect.innerHTML = segClassLabels
    .map((c) => `<option value="${c.index}">${c.label}</option>`)
    .join("");
}

// counts === null -> tampilan awal (belum ada hasil, semua "-")
function renderClassSummary(counts) {
  if (!counts) segHighlightedClassIndex = null; // reset kalau panel di-clear (belum ada hasil)
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  classSummaryBody.innerHTML = segClassLabels
    .map((c) => {
      const count = counts ? counts[c.label] ?? 0 : null;
      const pct = counts && total > 0 ? (count / total) * 100 : 0;
      const pctText = counts ? pct.toFixed(1) + "%" : "";
      // Baris & bar cuma bisa diklik kalau sudah ada hasil (counts != null) --
      // klik toggle highlight kelas itu di overlay gambar (lihat toggleClassHighlight).
      const clickable = counts ? " seg-class-clickable" : "";
      const active = counts && segHighlightedClassIndex === c.index ? " seg-class-row-active" : "";
      return `
        <div class="summary-row seg-class-summary-row${clickable}${active}" data-class-index="${c.index}">
          <span><span class="seg-color-dot" style="background:${c.color}"></span>${c.label}</span>
          <span class="seg-class-summary-stats">
            <span>${count === null ? "&ndash;" : count}</span>
            ${counts ? `<span class="seg-class-pct">(${pctText})</span>` : ""}
          </span>
        </div>
        <div class="seg-class-bar-track${clickable}${active}" data-class-index="${c.index}"><div class="seg-class-bar-fill" style="width:${pct}%;background:${c.color}"></div></div>
      `;
    })
    .join("");

  if (counts) {
    classSummaryBody.querySelectorAll(".seg-class-clickable").forEach((el) => {
      el.addEventListener("click", () => toggleClassHighlight(parseInt(el.dataset.classIndex, 10)));
    });
  }
}

// Klik baris/bar kelas di ringkasan -> highlight (dim yang lain) sel kelas
// itu di overlay Hasil Segmentasi. Klik lagi kelas yang sama -> matikan lagi.
function toggleClassHighlight(classIndex) {
  segHighlightedClassIndex = segHighlightedClassIndex === classIndex ? null : classIndex;
  classSummaryBody.querySelectorAll("[data-class-index]").forEach((el) => {
    el.classList.toggle("seg-class-row-active", parseInt(el.dataset.classIndex, 10) === segHighlightedClassIndex);
  });
  applySegClassHighlightToOverlay();
}

function applySegClassHighlightToOverlay() {
  const svg = segResultBody.querySelector("svg");
  if (!svg) return;
  svg.querySelectorAll("polygon[data-cell-id]").forEach((p) => {
    const det = segDetections.find((d) => d.id === parseInt(p.dataset.cellId, 10));
    const idx = det ? currentClassIndex(det) : null;
    p.classList.toggle("seg-polygon-dimmed", segHighlightedClassIndex !== null && idx !== segHighlightedClassIndex);
  });
  svg.querySelectorAll("text.seg-cell-number-label").forEach((t) => {
    const det = segDetections.find((d) => d.id === parseInt(t.dataset.cellId, 10));
    const idx = det ? currentClassIndex(det) : null;
    t.classList.toggle("seg-label-dimmed", segHighlightedClassIndex !== null && idx !== segHighlightedClassIndex);
  });
}

function updateClassSummaryFromDetections() {
  const counts = {};
  segClassLabels.forEach((c) => (counts[c.label] = 0));
  segDetections.forEach((d) => {
    const label = d.correctedClassLabel || d.classLabel;
    if (label in counts) counts[label] += 1;
  });
  renderClassSummary(counts);
}

// Tab kecil khusus area gambar (Gambar Sumber <-> Hasil Segmentasi) --
// cuma satu yang ditampilkan dalam satu waktu, jadi nggak perlu dua panel
// besar berdampingan, dan sisa ruang bisa dipakai buat Daftar Sel Terdeteksi.
function switchSegImageTab(tab) {
  const isSource = tab === "source";
  segTabSource.classList.toggle("seg-image-tab-active", isSource);
  segTabResult.classList.toggle("seg-image-tab-active", !isSource);
  segSourceBody.classList.toggle("view-hidden", !isSource);
  segResultBody.classList.toggle("view-hidden", isSource);
}

// Tab kecil di panel kanan (Sel Terdeteksi <-> Hasil Folder) -- digabung di
// satu panel yang sama biar "Hasil di Folder Ini" nggak perlu scroll jauh
// buat dicapai, konsisten sama pola tab gambar di atas.
function switchSegListTab(tab) {
  const isDetections = tab === "detections";
  segTabDetections.classList.toggle("seg-image-tab-active", isDetections);
  segTabFolderResults.classList.toggle("seg-image-tab-active", !isDetections);
  segDetectionsHelp.classList.toggle("view-hidden", !isDetections);
  segDetectionsBody.classList.toggle("view-hidden", !isDetections);
  segResultsListHelp.classList.toggle("view-hidden", isDetections);
  segResultsFilter.classList.toggle("view-hidden", isDetections);
  segResultsListBody.classList.toggle("view-hidden", isDetections);
  segBulkActionsBar.classList.toggle("view-hidden", !isDetections || segDetections.length === 0);
}

// -----------------------------------------------------------------------
// Zoom & pan gambar
// -----------------------------------------------------------------------
function applySegZoomTransform() {
  const transform = `translate(${segPanX}px, ${segPanY}px) scale(${segZoom})`;
  const srcImg = segSourceBody.querySelector("img");
  if (srcImg) srcImg.style.transform = transform;
  const wrap = segResultBody.querySelector(".seg-overlay-wrap");
  if (wrap) wrap.style.transform = transform;
  const cursor = segZoom > 1 ? "grab" : "default";
  segSourceBody.style.cursor = cursor;
  segResultBody.style.cursor = segAddMode ? "crosshair" : cursor;
  // Mode tambah sel: polygon sel yang sudah ada juga harus tetap kelihatan
  // "crosshair" (bukan "pointer") biar nggak membingungkan -- klik tetap
  // nambah sel baru di posisi manapun, bukan pilih sel yang sudah ada.
  if (wrap) wrap.classList.toggle("seg-add-mode-active", segAddMode);
  segZoomLabel.textContent = Math.round(segZoom * 100) + "%";
}

function resetSegZoom() {
  segZoom = 1;
  segPanX = 0;
  segPanY = 0;
  applySegZoomTransform();
}

function setSegZoom(newZoom) {
  segZoom = Math.min(4, Math.max(1, newZoom));
  if (segZoom === 1) {
    segPanX = 0;
    segPanY = 0;
  }
  applySegZoomTransform();
}

function handleSegWheelZoom(e) {
  e.preventDefault();
  setSegZoom(segZoom + (e.deltaY < 0 ? 0.15 : -0.15));
}

// Satu set handler mousedown/move/up dipakai bareng buat panel Gambar
// Sumber & Hasil Segmentasi -- kalau nggak zoom, mousedown+mouseup tanpa
// gerak berarti "klik" (dipakai buat nambah sel manual di segResultBody,
// lihat addManualCellAtEvent). Kalau lagi zoom (segZoom>1) & mouse gerak,
// itu dianggap pan/geser, bukan klik.
function segMouseDown(e) {
  if (e.button !== 0) return;
  segPanActiveEl = e.currentTarget;
  segMouseMoved = false;
  segMouseDownX = e.clientX;
  segMouseDownY = e.clientY;
  segDragStartX = e.clientX - segPanX;
  segDragStartY = e.clientY - segPanY;
}

function segMouseMove(e) {
  if (!segPanActiveEl) return;
  const dx = e.clientX - segMouseDownX;
  const dy = e.clientY - segMouseDownY;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) segMouseMoved = true;
  if (segMouseMoved && segZoom > 1) {
    segPanX = e.clientX - segDragStartX;
    segPanY = e.clientY - segDragStartY;
    applySegZoomTransform();
  }
}

function segMouseUp(e) {
  if (!segPanActiveEl) return;
  const wasResultClick = !segMouseMoved && segPanActiveEl === segResultBody;
  const clickedInAddMode = wasResultClick && segAddMode;
  const clickedForSelect = wasResultClick && !segAddMode;
  segPanActiveEl = null;
  if (clickedInAddMode) addManualCellAtEvent(e);
  else if (clickedForSelect) trySelectCellAtEvent(e);
}

// Klik langsung di sel (polygon) pada gambar Hasil Segmentasi -- highlight
// baris yang sesuai di panel Sel Terdeteksi (scroll ke situ + tandai aktif)
// supaya user bisa langsung ganti kelasnya lewat dropdown di baris itu atau
// shortcut angka 0-9, tanpa perlu cari baris satu-satu.
function trySelectCellAtEvent(e) {
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
function toggleSegAddMode() {
  segAddMode = !segAddMode;
  btnSegAddCell.classList.toggle("btn-toggle-active", segAddMode);
  applySegZoomTransform(); // ikut update cursor jadi crosshair/default
  if (segAddMode) {
    switchSegImageTab("result");
    showToast('Mode tambah sel aktif -- klik posisi sel di gambar. Klik tombol "Tambah Sel Manual" lagi buat matikan.');
  }
}

function addManualCellAtEvent(e) {
  const svg = segResultBody.querySelector("svg");
  if (!svg || !segImgW || !segImgH) return;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
  const cx = Math.round(svgPt.x);
  const cy = Math.round(svgPt.y);
  if (cx < 0 || cy < 0 || cx > segImgW || cy > segImgH) return; // klik di luar area gambar

  const r = Math.max(6, Math.round(Math.min(segImgW, segImgH) * 0.03));
  const nPoints = 16;
  const mask = [];
  for (let p = 0; p < nPoints; p++) {
    const angle = (2 * Math.PI * p) / nPoints;
    mask.push([Math.round(cx + r * Math.cos(angle)), Math.round(cy + r * Math.sin(angle))]);
  }
  const nextId = segDetections.reduce((max, d) => Math.max(max, d.id), -1) + 1;
  segDetections.push({
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

function deleteDetection(cellId) {
  segDetections = segDetections.filter((d) => d.id !== cellId);
  if (segActiveCellId === cellId) segActiveCellId = null;
  segSelectedCellIds.delete(cellId);
  renderSegmentationOverlay();
  renderDetectionsList();
  updateClassSummaryFromDetections();
  btnSaveSegmentation.disabled = segDetections.length === 0;
}

// Sinkronkan highlight baris di Daftar Sel <-> polygon di overlay gambar,
// dipakai baik dari klik mouse maupun navigasi panah keyboard.
function setActiveCell(cellId) {
  segActiveCellId = cellId;
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

function resetSegmentationResults() {
  segDetections = [];
  segHighlightedClassIndex = null;
  segActiveCellId = null;
  segAddMode = false;
  segSelectedCellIds = new Set();
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

async function doSelectSegmentationImage() {
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
  segSelectedPath = data.path;
  segActiveFolder = segFolderOf(data.path);
  segCurrentImageDataUrl = `data:image/png;base64,${data.image}`;
  segImagePathEl.textContent = "Gambar: " + data.path;
  segSourceBody.innerHTML = `<img src="${segCurrentImageDataUrl}" alt="${data.filename}" />`;
  btnRunSegmentation.disabled = false;
  resetSegmentationResults();
}

// Logic bersama buat menerapkan hasil segmentasi yang dimuat balik ke UI --
// dipakai baik lewat dialog file (doLoadSegmentationResult) maupun klik
// langsung di daftar "Hasil di Folder Ini" (doLoadSegmentationResultByPath),
// jadi kontraknya konsisten dari dua jalur itu.
function applyLoadedSegmentationResult(data) {
  segSelectedPath = data.path;
  if (data.path) segActiveFolder = segFolderOf(data.path);
  segPatientNameInput.value = data.patientId || "";
  segImagePathEl.textContent = data.path
    ? "Gambar: " + data.path + (data.detailFile ? ` (dimuat dari ${data.detailFile})` : "")
    : `Dimuat dari ${data.detailFile} (path gambar sumber tidak tercatat)`;

  segDetections = (data.detections || []).map((d) => ({
    ...d,
    correctedClassIndex: d.correctedClassIndex ?? null,
    correctedClassLabel: d.correctedClassLabel ?? null,
  }));
  segActiveCellId = null;
  segAddMode = false;
  segHighlightedClassIndex = null;
  segSelectedCellIds = new Set();
  segSelectAllCells.checked = false;
  btnSegAddCell.classList.remove("btn-toggle-active");
  resetSegZoom();

  if (data.image) {
    segCurrentImageDataUrl = `data:image/png;base64,${data.image}`;
    segImgW = data.width;
    segImgH = data.height;
    segSourceBody.innerHTML = `<img src="${segCurrentImageDataUrl}" alt="sumber" />`;
    renderSegmentationOverlay();
    btnRunSegmentation.disabled = false;
    btnSegAddCell.disabled = false;
    switchSegImageTab("result");
  } else {
    segCurrentImageDataUrl = null;
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
  btnSaveSegmentation.disabled = segDetections.length === 0;
}

// Muat balik hasil segmentasi yang sudah pernah disimpan lewat dialog pilih
// file JSON manual -- biar bisa dilihat & dikoreksi lagi tanpa perlu
// jalankan ulang dari nol.
async function doLoadSegmentationResult() {
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
async function doLoadSegmentationResultByPath(detailPath) {
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

// Dipanggil dari tombol "Kirim ke Segmentasi" di tab Capture -- pakai
// gambar & path yang baru saja disimpan (lastSavedFullPath/lastCapturedImage
// dari doSave()), jadi user nggak perlu buka file dialog manual lagi.
function sendCaptureToSegmentation() {
  if (!lastSavedFullPath) return;
  segSelectedPath = lastSavedFullPath;
  segActiveFolder = segFolderOf(lastSavedFullPath);
  segCurrentImageDataUrl = lastCapturedImage ? `data:image/png;base64,${lastCapturedImage}` : null;
  segImagePathEl.textContent = "Gambar: " + segSelectedPath;
  segPatientNameInput.value = patientNameInput.value.trim();
  segSourceBody.innerHTML = segCurrentImageDataUrl
    ? `<img src="${segCurrentImageDataUrl}" alt="sumber" />`
    : '<span class="placeholder-text">Gambar tersimpan. Klik "Jalankan Segmentasi".</span>';
  btnRunSegmentation.disabled = false;
  resetSegmentationResults();
  switchTab("segmentation");
  showToast("Gambar dikirim ke tab Segmentasi.");
}

function currentClassIndex(d) {
  return d.correctedClassIndex !== null && d.correctedClassIndex !== undefined
    ? d.correctedClassIndex
    : d.classIndex;
}

// Centroid kasar (rata-rata titik mask) -- cukup akurat buat penempatan
// label nomor di tengah sel bulat/cembung seperti RBC, nggak perlu hitung
// centroid area yang lebih presisi.
function polygonCentroid(mask) {
  const n = mask.length;
  let sumX = 0;
  let sumY = 0;
  mask.forEach(([x, y]) => {
    sumX += x;
    sumY += y;
  });
  return [sumX / n, sumY / n];
}

function renderSegmentationOverlay() {
  const colorFor = (idx) => (segClassLabels[idx] ? segClassLabels[idx].color : "#64748b");
  // Ukuran font label nomor diskalakan relatif ke dimensi gambar (bukan
  // ukuran layar) karena SVG viewBox pakai satuan pixel gambar asli --
  // biar tetap terbaca proporsional baik di gambar kecil maupun besar.
  const numberFontSize = Math.max(14, Math.round(Math.min(segImgW, segImgH) * 0.018));
  let polygons = "";
  let labels = "";
  segDetections.forEach((d, i) => {
    const idx = currentClassIndex(d);
    const pts = d.mask.map((p) => p.join(",")).join(" ");
    // Confidence rendah -> garis putus-putus, biar langsung kelihatan mana
    // yang perlu diprioritaskan dicek manual.
    const dashed = !d.manual && d.confidence < SEG_LOW_CONFIDENCE_THRESHOLD ? ' stroke-dasharray="4,3"' : "";
    const activeClass = d.id === segActiveCellId ? ' class="seg-polygon-active"' : "";
    polygons += `<polygon data-cell-id="${d.id}" points="${pts}" fill="${colorFor(idx)}33" stroke="${colorFor(idx)}" stroke-width="2"${dashed}${activeClass} />`;
    // Nomor label ini match sama "Sel #${i+1}" di daftar (renderDetectionsList)
    // supaya user gampang korelasikan mask di gambar dengan baris di daftar.
    const [cx, cy] = polygonCentroid(d.mask);
    labels += `<text class="seg-cell-number-label" data-cell-id="${d.id}" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="${numberFontSize}">${i + 1}</text>`;
  });
  segResultBody.innerHTML = `
    <div class="seg-overlay-wrap">
      <div class="seg-total-badge">${segDetections.length} sel terdeteksi</div>
      <img src="${segCurrentImageDataUrl}" alt="hasil segmentasi" />
      <svg viewBox="0 0 ${segImgW} ${segImgH}" preserveAspectRatio="xMidYMid meet">${polygons}${labels}</svg>
    </div>
  `;
  applySegZoomTransform();
  applySegClassHighlightToOverlay();
}

function renderDetectionsList() {
  const detectionsTabActive = segTabDetections.classList.contains("seg-image-tab-active");
  segBulkActionsBar.classList.toggle("view-hidden", segDetections.length === 0 || !detectionsTabActive);
  if (segDetections.length === 0) {
    segDetectionsBody.innerHTML = '<div class="summary-row">Tidak ada sel terdeteksi.</div>';
    return;
  }
  segDetectionsBody.innerHTML = segDetections
    .map((d, i) => {
      const selectedIdx = currentClassIndex(d);
      const options = segClassLabels
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
        (d.id === segActiveCellId ? " seg-row-active" : "");
      const checked = segSelectedCellIds.has(d.id) ? " checked" : "";
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
      const det = segDetections.find((d) => d.id === cellId);
      if (!det) return;
      det.correctedClassIndex = newIndex;
      det.correctedClassLabel = segClassLabels[newIndex].label;
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
      if (e.target.checked) segSelectedCellIds.add(cellId);
      else segSelectedCellIds.delete(cellId);
      segSelectAllCells.checked = segSelectedCellIds.size === segDetections.length;
    });
  });

  segDetectionsBody.querySelectorAll(".seg-detection-row").forEach((row) => {
    row.addEventListener("click", () => setActiveCell(parseInt(row.dataset.cellId, 10)));
  });
}

async function doRunSegmentation() {
  if (!segSelectedPath) return;

  // Peringatan kalau gambar ini sudah pernah diproses sebelumnya (individual
  // atau lewat batch) -- biar user sadar hasil lama bakal "tergantikan" di
  // tampilan (lihat dedup di list-results/patient-summary), meski riwayatnya
  // tetap tersimpan penuh di segmentation_log.csv.
  try {
    const checkRes = await fetch(
      "/api/segmentation/check-existing?path=" + encodeURIComponent(segSelectedPath)
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
    body: JSON.stringify({ path: segSelectedPath }),
  });
  const data = await res.json();
  btnRunSegmentation.disabled = false;
  btnRunSegmentation.textContent = "Jalankan Segmentasi";

  if (!data.ok) {
    showToast(data.message || "Gagal memproses.");
    resetSegmentationResults();
    return;
  }

  segImgW = data.imageWidth;
  segImgH = data.imageHeight;
  segDetections = data.detections.map((d) => ({
    ...d,
    correctedClassIndex: null,
    correctedClassLabel: null,
  }));
  segActiveCellId = null;
  segAddMode = false;
  segHighlightedClassIndex = null;
  segSelectedCellIds = new Set();
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

async function doSaveSegmentation() {
  if (!segSelectedPath || segDetections.length === 0) return;
  btnSaveSegmentation.disabled = true;
  btnSaveSegmentation.textContent = "Menyimpan...";

  const res = await fetch("/api/segmentation/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: segSelectedPath,
      patientId: segPatientNameInput.value.trim(),
      detections: segDetections,
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

// -----------------------------------------------------------------------
// Ringkasan per pasien (agregasi segmentation_log.csv di folder gambar
// aktif) & proses batch satu folder sekaligus
// -----------------------------------------------------------------------
function segFolderOf(path) {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.substring(0, idx) : path;
}

async function doLoadSegPatientSummary() {
  if (!segActiveFolder) {
    showToast("Pilih/muat gambar dulu (atau jalankan Proses Batch) supaya tahu folder yang mau diringkas.");
    return;
  }
  const folder = segActiveFolder;
  btnSegPatientSummary.disabled = true;
  btnSegPatientSummary.textContent = "Memuat...";
  const res = await fetch("/api/segmentation/patient-summary?folder=" + encodeURIComponent(folder));
  const data = await res.json();
  btnSegPatientSummary.disabled = false;
  btnSegPatientSummary.textContent = "Muat Ringkasan";

  if (!data.ok) {
    segPatientSummaryBody.innerHTML = `<div class="summary-row">${data.message || "Gagal memuat."}</div>`;
    return;
  }
  if (data.patients.length === 0) {
    segPatientSummaryBody.innerHTML = '<div class="summary-row">Belum ada hasil tersimpan di folder ini.</div>';
    return;
  }
  segPatientSummaryBody.innerHTML = data.patients
    .map(
      (p) =>
        `<div class="summary-row"><span>${p.patientId}</span><span>${p.totalImages} gambar, ${p.totalCells} sel</span></div>`
    )
    .join("");
}

// Export ringkasan folder aktif ke file Excel (server yang nulis file-nya
// langsung ke folder gambar sumber, sama seperti segmentation_log.csv) --
// kalau ID pasien diisi di field atas, cuma pasien itu yang diekspor.
async function doExportSegReport() {
  if (!segActiveFolder) {
    showToast("Pilih/muat gambar dulu (atau jalankan Proses Batch) supaya tahu folder yang mau diekspor.");
    return;
  }
  btnSegExportReport.disabled = true;
  btnSegExportReport.textContent = "Mengekspor...";
  const res = await fetch("/api/segmentation/export-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder: segActiveFolder,
      patientId: segPatientNameInput.value.trim(),
    }),
  });
  const data = await res.json();
  btnSegExportReport.disabled = false;
  btnSegExportReport.textContent = "Export Laporan (Excel)";

  if (!data.ok) {
    showToast(data.message || "Gagal mengekspor laporan.");
    return;
  }
  showToast("Laporan tersimpan: " + data.filename);
}

// Render daftar hasil yang bisa diklik -- setiap baris, kalau diklik,
// langsung buka hasil itu buat direview/dikoreksi (doLoadSegmentationResultByPath),
// TANPA dialog file. Dipakai baik dipanggil manual (tombol "Muat Daftar")
// maupun otomatis begitu Proses Batch selesai.
function renderSegResultsList(results) {
  if (results.length === 0) {
    const msg = segResultsFilter.value.trim()
      ? "Tidak ada hasil yang cocok dengan filter."
      : "Belum ada hasil tersimpan di folder ini.";
    segResultsListBody.innerHTML = `<div class="summary-row">${msg}</div>`;
    return;
  }
  segResultsListBody.innerHTML = results
    .map((r) => {
      const filename = r.sourceImage ? r.sourceImage.split(/[\\/]/).pop() : r.detailFile;
      const patientTag = r.patientId && r.patientId !== "?" ? ` (${r.patientId})` : "";
      // Baris kedua nunjukin nama file JSON detail aslinya (persis kayak di
      // File Explorer/folder gambar) -- biar jelas file mana persisnya yang
      // dipakai buat gambar ini, nggak cuma nama gambar sumbernya.
      const fileSubtitle =
        r.detailFile && r.detailFile !== filename
          ? `<span class="seg-result-list-file" title="${r.detailFile}">${r.detailFile}</span>`
          : "";
      return `
        <div class="summary-row seg-result-list-row" data-path="${r.detailPath}">
          <div class="seg-result-list-main">
            <span class="seg-result-list-title">${filename}${patientTag}</span>
            ${fileSubtitle}
          </div>
          <span>${r.totalCells} sel</span>
        </div>
      `;
    })
    .join("");
  segResultsListBody.querySelectorAll(".seg-result-list-row").forEach((row) => {
    row.addEventListener("click", () => doLoadSegmentationResultByPath(row.dataset.path));
  });
}

// Filter murni di sisi client (dari segResultsListCache) -- nggak perlu
// fetch ulang server tiap ngetik, cocok berat filter nama file/ID pasien
// buat folder isi ~20 gambar seperti kasus nyata.
function applySegResultsFilter() {
  const q = segResultsFilter.value.trim().toLowerCase();
  if (!q) {
    renderSegResultsList(segResultsListCache);
    return;
  }
  const filtered = segResultsListCache.filter((r) => {
    const filename = (r.sourceImage ? r.sourceImage.split(/[\\/]/).pop() : r.detailFile) || "";
    const patientId = r.patientId || "";
    return filename.toLowerCase().includes(q) || patientId.toLowerCase().includes(q);
  });
  renderSegResultsList(filtered);
}

async function loadSegResultsListForFolder(folder) {
  const res = await fetch("/api/segmentation/list-results?folder=" + encodeURIComponent(folder));
  const data = await res.json();
  if (!data.ok) {
    segResultsListCache = [];
    segResultsListBody.innerHTML = `<div class="summary-row">${data.message || "Gagal memuat daftar."}</div>`;
    return;
  }
  segResultsListCache = data.results;
  applySegResultsFilter();
}

// Tombol "Muat Daftar" -- pakai folder dari gambar yang lagi aktif/dipilih.
// Kalau belum ada gambar dipilih sama sekali (mis. baru buka app dan mau
// langsung lihat hasil batch dari sesi sebelumnya), jalankan Proses Batch
// dulu atau pilih satu gambar dulu supaya foldernya diketahui.
async function doLoadSegResultsListButton() {
  switchSegListTab("folder");
  if (!segActiveFolder) {
    showToast("Pilih/muat gambar dulu (atau jalankan Proses Batch) supaya tahu folder yang mau dibuka.");
    return;
  }
  btnSegListResults.disabled = true;
  await loadSegResultsListForFolder(segActiveFolder);
  btnSegListResults.disabled = false;
}

async function doSegBatchRun() {
  btnSegBatchRun.disabled = true;
  btnSegBatchRun.textContent = "Memilih folder...";
  const selectRes = await fetch("/api/segmentation/batch-select", { method: "POST" });
  const selectData = await selectRes.json();
  btnSegBatchRun.disabled = false;
  btnSegBatchRun.textContent = "Pilih Folder & Proses Batch";

  if (!selectData.ok) return;
  if (selectData.files.length === 0) {
    showToast("Tidak ada file gambar di folder itu.");
    return;
  }

  const choice = await showChoiceModal(
    `Ditemukan ${selectData.files.length} gambar di folder ini.\n\n` +
    `Proses semua sekaligus? Hasilnya masih DUMMY/placeholder dan langsung ` +
    `tersimpan (JSON detail + segmentation_log.csv). Setelah selesai, semua ` +
    `hasilnya bisa dibuka satu-satu langsung dari daftar "Hasil di Folder ` +
    `Ini" (tanpa dialog file lagi) buat direview/dikoreksi.\n\n` +
    `Gambar yang sudah pernah diproses sebelumnya bisa dilewati (skip) supaya ` +
    `tidak menumpuk hasil baru yang random di atas hasil yang sudah dikoreksi.`,
    [
      { label: "Batal", value: null },
      { label: "Lewati yang Sudah Ada", value: "skip" },
      { label: "Proses Semua", value: "all", primary: true },
    ]
  );
  if (!choice) return;

  btnSegBatchRun.disabled = true;
  btnSegBatchRun.textContent = "Memproses...";
  switchSegListTab("folder");
  segResultsListBody.innerHTML = `<div class="summary-row">Memproses ${selectData.files.length} gambar, mohon tunggu...</div>`;

  const runRes = await fetch("/api/segmentation/batch-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder: selectData.folder,
      patientId: segPatientNameInput.value.trim(),
      skipExisting: choice === "skip",
    }),
  });
  const runData = await runRes.json();
  btnSegBatchRun.disabled = false;
  btnSegBatchRun.textContent = "Pilih Folder & Proses Batch";

  if (!runData.ok) {
    segResultsListBody.innerHTML = `<div class="summary-row">${runData.message || "Gagal memproses batch."}</div>`;
    return;
  }

  // Set folder aktif ke folder batch ini, biar tombol "Muat Daftar" &
  // Ringkasan per Pasien juga langsung nunjuk ke folder yang barusan
  // diproses (bukan cuma daftar hasil di bawah ini doang).
  segActiveFolder = selectData.folder;
  await loadSegResultsListForFolder(selectData.folder);
  const skippedText = runData.totalSkipped ? `, ${runData.totalSkipped} dilewati (sudah ada)` : "";
  showToast(
    `${runData.totalImagesOk}/${runData.totalImages} gambar selesai diproses${skippedText} -- klik salah satu ` +
    `baris di bawah untuk mulai review/koreksi.`
  );
}

// -----------------------------------------------------------------------
// Koreksi massal (bulk) -- terapkan satu kelas ke banyak sel sekaligus,
// cocok buat kasus banyak sel yang salah diklasifikasi ke kelas yang sama
// (mis. banyak "Uncategorised" yang sebenarnya "Normal cell").
// -----------------------------------------------------------------------
function toggleSegSelectAll() {
  if (segSelectAllCells.checked) {
    segDetections.forEach((d) => segSelectedCellIds.add(d.id));
  } else {
    segSelectedCellIds.clear();
  }
  renderDetectionsList();
}

function doSegBulkApply() {
  if (segSelectedCellIds.size === 0) {
    showToast("Pilih minimal satu sel dulu (centang di samping tiap sel).");
    return;
  }
  const newIndex = parseInt(segBulkClassSelect.value, 10);
  const newLabel = segClassLabels[newIndex].label;
  segDetections.forEach((d) => {
    if (!segSelectedCellIds.has(d.id)) return;
    d.correctedClassIndex = newIndex;
    d.correctedClassLabel = newLabel;
  });
  const count = segSelectedCellIds.size;
  renderSegmentationOverlay();
  renderDetectionsList();
  updateClassSummaryFromDetections();
  btnSaveSegmentation.disabled = segDetections.length === 0;
  showToast(`${count} sel diubah ke kelas "${newLabel}". Jangan lupa klik "Simpan Hasil".`);
}

// -----------------------------------------------------------------------
// Status & konfigurasi model segmentasi (placeholder -- lihat catatan di
// app.py, belum ada inference model beneran yang terpasang)
// -----------------------------------------------------------------------
async function loadSegModelStatus() {
  try {
    const res = await fetch("/api/segmentation/model-status");
    const data = await res.json();
    segModelStatusText.textContent = data.message || "Status model tidak diketahui.";
    segModelPathInput.value = data.modelPath || "";
  } catch (e) {
    segModelStatusText.textContent = "Gagal memuat status model.";
  }
}

async function doSaveSegModelConfig() {
  btnSegSaveModelConfig.disabled = true;
  btnSegSaveModelConfig.textContent = "Menyimpan...";
  const res = await fetch("/api/segmentation/model-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelPath: segModelPathInput.value.trim() }),
  });
  const data = await res.json();
  btnSegSaveModelConfig.disabled = false;
  btnSegSaveModelConfig.textContent = "Simpan";
  if (!data.ok) {
    showToast(data.message || "Gagal menyimpan konfigurasi model.");
    return;
  }
  showToast("Konfigurasi model tersimpan.");
  loadSegModelStatus();
}

// -----------------------------------------------------------------------
// Shortcut keyboard buat koreksi cepat sel yang lagi aktif/dipilih
// -----------------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (segmentationView.classList.contains("view-hidden")) return;
  const tag = document.activeElement ? document.activeElement.tagName : "";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

  if (e.key === "Escape" && segAddMode) {
    toggleSegAddMode();
    return;
  }
  if (segActiveCellId === null) return;
  const det = segDetections.find((d) => d.id === segActiveCellId);
  if (!det) return;

  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteDetection(segActiveCellId);
    return;
  }
  if (e.key >= "0" && e.key <= "9") {
    const idx = parseInt(e.key, 10);
    if (idx < segClassLabels.length) {
      det.correctedClassIndex = idx;
      det.correctedClassLabel = segClassLabels[idx].label;
      renderSegmentationOverlay();
      renderDetectionsList();
      updateClassSummaryFromDetections();
    }
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const ids = segDetections.map((d) => d.id);
    const curIdx = ids.indexOf(segActiveCellId);
    if (curIdx === -1) return;
    const nextIdx = Math.max(0, Math.min(ids.length - 1, curIdx + (e.key === "ArrowDown" ? 1 : -1)));
    setActiveCell(ids[nextIdx]);
  }
});

tabCapture.addEventListener("click", () => switchTab("capture"));
tabSegmentation.addEventListener("click", () => switchTab("segmentation"));
btnSegSelectImage.addEventListener("click", doSelectSegmentationImage);
btnLoadSegmentation.addEventListener("click", doLoadSegmentationResult);
btnRunSegmentation.addEventListener("click", doRunSegmentation);
btnSaveSegmentation.addEventListener("click", doSaveSegmentation);
btnSendToSegmentation.addEventListener("click", sendCaptureToSegmentation);
segTabSource.addEventListener("click", () => switchSegImageTab("source"));
segTabResult.addEventListener("click", () => switchSegImageTab("result"));
segTabDetections.addEventListener("click", () => switchSegListTab("detections"));
segTabFolderResults.addEventListener("click", doLoadSegResultsListButton);

btnSegAddCell.addEventListener("click", toggleSegAddMode);
btnSegZoomIn.addEventListener("click", () => setSegZoom(segZoom + 0.25));
btnSegZoomOut.addEventListener("click", () => setSegZoom(segZoom - 0.25));
btnSegZoomReset.addEventListener("click", resetSegZoom);
segSourceBody.addEventListener("wheel", handleSegWheelZoom, { passive: false });
segResultBody.addEventListener("wheel", handleSegWheelZoom, { passive: false });
segSourceBody.addEventListener("mousedown", segMouseDown);
segResultBody.addEventListener("mousedown", segMouseDown);
window.addEventListener("mousemove", segMouseMove);
window.addEventListener("mouseup", segMouseUp);

btnSegPatientSummary.addEventListener("click", doLoadSegPatientSummary);
btnSegBatchRun.addEventListener("click", doSegBatchRun);
btnSegListResults.addEventListener("click", doLoadSegResultsListButton);
btnSegExportReport.addEventListener("click", doExportSegReport);
segResultsFilter.addEventListener("input", applySegResultsFilter);
segSelectAllCells.addEventListener("change", toggleSegSelectAll);
btnSegBulkApply.addEventListener("click", doSegBulkApply);
btnSegSaveModelConfig.addEventListener("click", doSaveSegModelConfig);

btnConnectCamera.addEventListener("click", connectCamera);
if (btnCameraSettings) btnCameraSettings.addEventListener("click", openCameraSettings);
btnRefreshCameras.addEventListener("click", loadCameras);
btnCapture.addEventListener("click", doCapture);
btnFolder.addEventListener("click", doSelectFolder);
btnSave.addEventListener("click", doSave);
btnSummary.addEventListener("click", loadFolderSummary);
btnCloseSummary.addEventListener("click", () => {
  summaryPanel.classList.add("summary-hidden");
  summaryDismissed = true;
});
patientNameInput.addEventListener("input", updateSaveButtonState);

// Peringatan kalau tab ditutup/direload padahal ada hasil capture yang
// belum disimpan -- ini SATU-SATUNYA dialog yang tetap pakai bawaan
// browser (bukan modal custom kayak yang lain), karena beforeunload memang
// tidak bisa dikustomisasi tampilannya di semua browser modern (dibatasi
// spec, buat cegah abuse popup pas nutup tab).
window.addEventListener("beforeunload", (e) => {
  if (hasCapturedImage && !currentCaptureSaved) {
    e.preventDefault();
    e.returnValue = "";
  }
});

loadCameras().then(restoreCameraStatusIfConnected);
loadClassLegend();
loadSegModelStatus();
setInterval(checkCameraStatus, 2000);
