import { captureView, patientNameInput, btnCapture, btnSave } from "./dom.js";
import { doCapture, doSave } from "./capture.js";

// -----------------------------------------------------------------------
// Shortcut keyboard buat tab Capture: Spasi = Capture, Enter = Save
// -----------------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (captureView.classList.contains("view-hidden")) return;
  const active = document.activeElement;
  const tag = active ? active.tagName : "";
  const isPatientNameField = active === patientNameInput;

  if (e.key === " " || e.code === "Space") {
    // Jangan sikat spasi kalau lagi ngetik (mis. inisial pasien 2 kata)
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    e.preventDefault();
    if (!btnCapture.disabled) doCapture();
    return;
  }
  if (e.key === "Enter") {
    // Enter aman dipakai walau fokus di field inisial pasien (input teks
    // biasa tanpa <form>, jadi Enter nggak ada default action)
    if ((tag === "SELECT" || tag === "TEXTAREA") && !isPatientNameField) return;
    e.preventDefault();
    if (!btnSave.disabled) doSave();
  }
});
