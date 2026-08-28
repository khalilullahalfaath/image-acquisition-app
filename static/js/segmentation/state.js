/*
 * State mutable untuk tab Segmentasi -- objek tunggal (bukan `let` individual)
 * supaya semua modul segmentation/* bisa baca & tulis field yang sama.
 */

export const segState = {
  segSelectedPath: null, // path gambar sumber yang dipilih di tab Segmentasi
  segCurrentImageDataUrl: null, // data URL gambar sumber yang lagi ditampilkan (buat overlay hasil)
  segDetections: [], // hasil (+ kemungkinan koreksi manual) dari run terakhir
  segClassLabels: [], // cache [{index, label, color}, ...] dari /api/segmentation/classes
  segImgW: 0,
  segImgH: 0,
  segActiveFolder: null, // folder "aktif" buat Ringkasan per Pasien & Muat Daftar -- dari gambar terakhir dipilih/dimuat ATAU folder Proses Batch terakhir
  segActiveCellId: null, // id sel yang lagi dipilih (row diklik / navigasi panah)
  segAddMode: false, // true kalau lagi mode "Tambah Sel Manual"
  segSelectedCellIds: new Set(), // dipakai buat koreksi kelas massal (bulk)
  segResultsListCache: [], // cache hasil terakhir dari list-results, buat filter tanpa fetch ulang

  // Zoom & pan gambar (Gambar Sumber / Hasil Segmentasi) -- diterapkan lewat
  // CSS transform di elemen gambar, jadi koordinat mask (pixel asli gambar)
  // nggak perlu diubah sama sekali; konversi klik->pixel pas nambah sel manual
  // tetap akurat karena pakai SVG getScreenCTM() yang otomatis memperhitungkan
  // transform ini.
  segZoom: 1,
  segPanX: 0,
  segPanY: 0,
  segPanActiveEl: null,
  segDragStartX: 0,
  segDragStartY: 0,
  segMouseDownX: 0,
  segMouseDownY: 0,
  segMouseMoved: false,
};

export const SEG_LOW_CONFIDENCE_THRESHOLD = 0.7;
