import { segModelStatusText, segModelPathInput, btnSegSaveModelConfig } from "../dom.js";
import { showToast } from "../modal.js";

// -----------------------------------------------------------------------
// Status & konfigurasi model segmentasi (placeholder -- lihat catatan di
// app.py, belum ada inference model beneran yang terpasang)
// -----------------------------------------------------------------------
export async function loadSegModelStatus() {
  try {
    const res = await fetch("/api/segmentation/model-status");
    const data = await res.json();
    segModelStatusText.textContent = data.message || "Status model tidak diketahui.";
    segModelPathInput.value = data.modelPath || "";
  } catch (e) {
    segModelStatusText.textContent = "Gagal memuat status model.";
  }
}

export async function doSaveSegModelConfig() {
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
