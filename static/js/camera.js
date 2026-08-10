import {
  cameraDot, cameraLabel, cameraSelect, resolutionSelect,
  btnConnectCamera, btnRefreshCameras, btnCameraSettings,
  streamBody, btnCapture,
} from "./dom.js";
import { cameraState } from "./state.js";
import { showToast } from "./modal.js";

export async function loadCameras() {
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
export function applyConnectedUI(selectedName, width, height) {
  const resText = width && height ? ` (${width}x${height})` : "";
  cameraDot.className = "dot dot-on";
  cameraLabel.textContent = "Aktif: " + selectedName + resText;
  streamBody.innerHTML = '<img src="/stream" alt="stream" />';
  btnCapture.disabled = false;
  if (btnCameraSettings) btnCameraSettings.disabled = false;
  cameraState.isCameraConnected = true;
}

export async function connectCamera() {
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
    cameraState.isCameraConnected = false;
    showToast(data.message || "Tidak bisa membuka kamera index " + index);
  }
}

export function handleCameraDisconnected() {
  cameraState.isCameraConnected = false;
  cameraDot.className = "dot dot-off";
  cameraLabel.textContent = "Kamera terputus (dicabut?)";
  streamBody.innerHTML =
    '<span class="placeholder-text">Kamera tidak terhubung<br />Hubungkan kamera USB mikroskop untuk memulai</span>';
  btnCapture.disabled = true;
  if (btnCameraSettings) btnCameraSettings.disabled = true;
  showToast("Koneksi ke kamera terputus. Cek kabel USB, lalu klik Hubungkan lagi.");
}

export async function checkCameraStatus() {
  if (!cameraState.isCameraConnected) return; // nggak perlu polling kalau memang belum/nggak lagi connect
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
export async function restoreCameraStatusIfConnected() {
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

export async function openCameraSettings() {
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
