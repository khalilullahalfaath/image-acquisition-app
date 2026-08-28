import { segmentationView } from "../dom.js";
import { segState } from "./state.js";
import {
  deleteDetection, setActiveCell, renderSegmentationOverlay,
  renderDetectionsList, updateClassSummaryFromDetections, toggleSegAddMode,
} from "./detections.js";

// -----------------------------------------------------------------------
// Shortcut keyboard buat koreksi cepat sel yang lagi aktif/dipilih
// -----------------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (segmentationView.classList.contains("view-hidden")) return;
  const tag = document.activeElement ? document.activeElement.tagName : "";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

  if (e.key === "Escape" && segState.segAddMode) {
    toggleSegAddMode();
    return;
  }
  if (segState.segActiveCellId === null) return;
  const det = segState.segDetections.find((d) => d.id === segState.segActiveCellId);
  if (!det) return;

  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteDetection(segState.segActiveCellId);
    return;
  }
  if (e.key >= "0" && e.key <= "9") {
    const idx = parseInt(e.key, 10);
    if (idx < segState.segClassLabels.length) {
      det.correctedClassIndex = idx;
      det.correctedClassLabel = segState.segClassLabels[idx].label;
      renderSegmentationOverlay();
      renderDetectionsList();
      updateClassSummaryFromDetections();
    }
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const ids = segState.segDetections.map((d) => d.id);
    const curIdx = ids.indexOf(segState.segActiveCellId);
    if (curIdx === -1) return;
    const nextIdx = Math.max(0, Math.min(ids.length - 1, curIdx + (e.key === "ArrowDown" ? 1 : -1)));
    setActiveCell(ids[nextIdx]);
  }
});
