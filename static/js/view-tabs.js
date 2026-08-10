import { tabCapture, tabSegmentation, captureView, segmentationView, cameraGroup } from "./dom.js";

// -----------------------------------------------------------------------
// Tab Segmentasi & Klasifikasi Morfologi Sel (scaffold UI -- model deep
// learning-nya belum diintegrasikan, lihat api_segmentation_run di app.py)
// -----------------------------------------------------------------------
export function switchTab(tab) {
  const isCapture = tab === "capture";
  tabCapture.classList.toggle("tab-active", isCapture);
  tabSegmentation.classList.toggle("tab-active", !isCapture);
  captureView.classList.toggle("view-hidden", !isCapture);
  segmentationView.classList.toggle("view-hidden", isCapture);
  // Kontrol kamera di TopBar cuma relevan buat tab Capture (Segmentasi
  // kerja dari gambar yang sudah ada, bukan stream langsung).
  cameraGroup.classList.toggle("view-hidden", !isCapture);
}
