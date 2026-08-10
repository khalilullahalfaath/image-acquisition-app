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
