// -----------------------------------------------------------------------
// Ringkasan per pasien (agregasi segmentation_log.csv di folder gambar
// aktif) & proses batch satu folder sekaligus
// -----------------------------------------------------------------------
export function segFolderOf(path) {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.substring(0, idx) : path;
}

export function currentClassIndex(d) {
  return d.correctedClassIndex !== null && d.correctedClassIndex !== undefined
    ? d.correctedClassIndex
    : d.classIndex;
}

// Centroid kasar (rata-rata titik mask) -- cukup akurat buat penempatan
// label nomor di tengah sel bulat/cembung seperti RBC, nggak perlu hitung
// centroid area yang lebih presisi.
export function polygonCentroid(mask) {
  const n = mask.length;
  let sumX = 0;
  let sumY = 0;
  mask.forEach(([x, y]) => {
    sumX += x;
    sumY += y;
  });
  return [sumX / n, sumY / n];
}

// File hasil Capture disimpan dengan pola "inisial-pasien_timestamp_iterasi.ext"
// (lihat doSave() di capture.js -- backend format-nya "{slug}_{timestamp}_{iterasi}").
// Kalau nama file yang dipilih persis cocok pola ini, tebak inisial
// pasiennya dari situ -- biar field ID Pasien nggak kosong/ke-lewat pas
// user pilih gambar langsung dari dialog file (bukan lewat "Kirim ke
// Segmentasi" dari tab Capture), yang tadinya bikin field itu kosong dan
// akhirnya tersimpan sebagai "?" di segmentation_log.csv.
export function guessPatientIdFromFilename(pathOrFilename) {
  const base = (pathOrFilename || "").split(/[\\/]/).pop() || "";
  const withoutExt = base.replace(/\.[^.]+$/, "");
  const m = withoutExt.match(/^([a-z0-9-]+)_(\d{8}-\d{6})_(\d+)$/i);
  return m ? m[1] : "";
}
