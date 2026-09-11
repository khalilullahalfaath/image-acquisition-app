import {
  segTabSource, segTabResult, segSourceBody, segResultBody,
  segTabDetections, segTabFolderResults, segDetectionsHelp, segDetectionsBody,
  segResultsListHelp, segResultsFilter, segResultsListBody, segBulkActionsBar,
  segClassTabTable, segClassTabChart, classSummaryBody, classChartBody,
} from "../dom.js";
import { segState } from "./state.js";

// Tab kecil khusus area gambar (Gambar Sumber <-> Hasil Segmentasi) --
// cuma satu yang ditampilkan dalam satu waktu, jadi nggak perlu dua panel
// besar berdampingan, dan sisa ruang bisa dipakai buat Daftar Sel Terdeteksi.
export function switchSegImageTab(tab) {
  const isSource = tab === "source";
  segTabSource.classList.toggle("seg-image-tab-active", isSource);
  segTabResult.classList.toggle("seg-image-tab-active", !isSource);
  segSourceBody.classList.toggle("view-hidden", !isSource);
  segResultBody.classList.toggle("view-hidden", isSource);
}

// Tab kecil di panel Ringkasan klasifikasi (Tabel <-> Grafik) -- tabel tetap
// jadi tampilan utama/default (persis kayak sebelumnya), grafik batang cuma
// visualisasi tambahan yang lebih gampang dibaca sekilas.
export function switchSegClassTab(tab) {
  const isTable = tab === "table";
  segClassTabTable.classList.toggle("seg-image-tab-active", isTable);
  segClassTabChart.classList.toggle("seg-image-tab-active", !isTable);
  classSummaryBody.classList.toggle("view-hidden", !isTable);
  classChartBody.classList.toggle("view-hidden", isTable);
}

// Tab kecil di panel kanan (Sel Terdeteksi <-> Hasil Folder) -- digabung di
// satu panel yang sama biar "Hasil di Folder Ini" nggak perlu scroll jauh
// buat dicapai, konsisten sama pola tab gambar di atas.
export function switchSegListTab(tab) {
  const isDetections = tab === "detections";
  segTabDetections.classList.toggle("seg-image-tab-active", isDetections);
  segTabFolderResults.classList.toggle("seg-image-tab-active", !isDetections);
  segDetectionsHelp.classList.toggle("view-hidden", !isDetections);
  segDetectionsBody.classList.toggle("view-hidden", !isDetections);
  segResultsListHelp.classList.toggle("view-hidden", isDetections);
  segResultsFilter.classList.toggle("view-hidden", isDetections);
  segResultsListBody.classList.toggle("view-hidden", isDetections);
  segBulkActionsBar.classList.toggle("view-hidden", !isDetections || segState.segDetections.length === 0);
}
