import {
  btnSegPatientSummary, segPatientSummaryBody, btnSegExportReport,
  segResultsFilter, segResultsListBody, btnSegListResults, btnSegBatchRun,
  segPatientNameInput,
} from "../dom.js";
import { segState } from "./state.js";
import { switchSegListTab } from "./tabs.js";
import { doLoadSegmentationResultByPath } from "./core.js";
import { showChoiceModal, showToast } from "../modal.js";

export async function doLoadSegPatientSummary() {
  if (!segState.segActiveFolder) {
    showToast("Pilih/muat gambar dulu (atau jalankan Proses Batch) supaya tahu folder yang mau diringkas.");
    return;
  }
  const folder = segState.segActiveFolder;
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
export async function doExportSegReport() {
  if (!segState.segActiveFolder) {
    showToast("Pilih/muat gambar dulu (atau jalankan Proses Batch) supaya tahu folder yang mau diekspor.");
    return;
  }
  btnSegExportReport.disabled = true;
  btnSegExportReport.textContent = "Mengekspor...";
  const res = await fetch("/api/segmentation/export-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder: segState.segActiveFolder,
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
export function renderSegResultsList(results) {
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
      // Hasil yang jumlah sel per kelasnya PERSIS SAMA dengan hasil
      // sebelumnya (lihat check duplikat di trySaveSegmentation) ditandai di
      // sini, biar kelihatan sekilas mana yang kemungkinan nggak perlu.
      const dupTag = r.isDuplicate
        ? ` <span class="seg-duplicate-tag" title="${r.duplicateOfFile ? "Sama dengan: " + r.duplicateOfFile : ""}">duplikat</span>`
        : "";
      return `
        <div class="summary-row seg-result-list-row" data-path="${r.detailPath}">
          <div class="seg-result-list-main">
            <span class="seg-result-list-title">${filename}${patientTag}${dupTag}</span>
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

// Filter murni di sisi client (dari segState.segResultsListCache) -- nggak perlu
// fetch ulang server tiap ngetik, cocok berat filter nama file/ID pasien
// buat folder isi ~20 gambar seperti kasus nyata.
export function applySegResultsFilter() {
  const q = segResultsFilter.value.trim().toLowerCase();
  if (!q) {
    renderSegResultsList(segState.segResultsListCache);
    return;
  }
  const filtered = segState.segResultsListCache.filter((r) => {
    const filename = (r.sourceImage ? r.sourceImage.split(/[\\/]/).pop() : r.detailFile) || "";
    const patientId = r.patientId || "";
    return filename.toLowerCase().includes(q) || patientId.toLowerCase().includes(q);
  });
  renderSegResultsList(filtered);
}

export async function loadSegResultsListForFolder(folder) {
  const res = await fetch("/api/segmentation/list-results?folder=" + encodeURIComponent(folder));
  const data = await res.json();
  if (!data.ok) {
    segState.segResultsListCache = [];
    segResultsListBody.innerHTML = `<div class="summary-row">${data.message || "Gagal memuat daftar."}</div>`;
    return;
  }
  segState.segResultsListCache = data.results;
  applySegResultsFilter();
}

// Tombol "Muat Daftar" -- pakai folder dari gambar yang lagi aktif/dipilih.
// Kalau belum ada gambar dipilih sama sekali (mis. baru buka app dan mau
// langsung lihat hasil batch dari sesi sebelumnya), jalankan Proses Batch
// dulu atau pilih satu gambar dulu supaya foldernya diketahui.
export async function doLoadSegResultsListButton() {
  switchSegListTab("folder");
  if (!segState.segActiveFolder) {
    showToast("Pilih/muat gambar dulu (atau jalankan Proses Batch) supaya tahu folder yang mau dibuka.");
    return;
  }
  btnSegListResults.disabled = true;
  await loadSegResultsListForFolder(segState.segActiveFolder);
  btnSegListResults.disabled = false;
}

export async function doSegBatchRun() {
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
  segState.segActiveFolder = selectData.folder;
  await loadSegResultsListForFolder(selectData.folder);
  const skippedText = runData.totalSkipped ? `, ${runData.totalSkipped} dilewati (sudah ada)` : "";
  showToast(
    `${runData.totalImagesOk}/${runData.totalImages} gambar selesai diproses${skippedText} -- klik salah satu ` +
    `baris di bawah untuk mulai review/koreksi.`
  );
}
