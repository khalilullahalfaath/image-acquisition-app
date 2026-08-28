/*
 * State mutable untuk tab Capture & kontrol kamera. Diexport sebagai objek
 * (bukan `let` individual) supaya modul lain bisa MENGUBAH nilainya lewat
 * assignment property (captureState.x = ...) -- import binding ES module
 * untuk `let`/`const` di re-export bersifat read-only dari sisi importer,
 * jadi objek adalah cara yang benar untuk state yang dipakai lintas file.
 */

export const cameraState = {
  isCameraConnected: false, // dipakai checkCameraStatus() buat deteksi kamera dicabut fisik
};

export const captureState = {
  selectedFolder: null,
  hasCapturedImage: false,
  lastSavedId: null, // ID pasien terakhir yang berhasil disimpan di sesi ini
  lastCapturedImage: null, // base64 PNG hasil capture terakhir (buat thumbnail galeri)
  lastSavedFullPath: null, // path lengkap hasil Save terakhir (buat "Kirim ke Segmentasi")
  currentCaptureSaved: false, // true kalau capture yang aktif sekarang sudah pernah di-save
  currentCaptureSavedAs: null, // nama file terakhir dari capture yang aktif sekarang
  summaryDismissed: false, // true kalau user sengaja nutup panel ringkasan
};
