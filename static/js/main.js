/*
 * Entry point -- wiring semua event listener & pemanggilan inisialisasi.
 * Modul ini nge-import semua fungsi/DOM dari modul lain lalu menyambungkannya;
 * hampir tidak ada logic baru di sini, cuma "kabel" penghubung.
 */
import {
  tabCapture, tabSegmentation,
  btnSegSelectImage, btnLoadSegmentation, btnRunSegmentation, btnSaveSegmentation,
  btnSendToSegmentation, segTabSource, segTabResult, segTabDetections, segTabFolderResults,
  segClassTabTable, segClassTabChart,
  btnSegAddCell, btnSegZoomIn, btnSegZoomOut, btnSegZoomReset, segSourceBody, segResultBody,
  btnSegPatientSummary, btnSegBatchRun, btnSegListResults, btnSegExportReport,
  segResultsFilter, segSelectAllCells, btnSegBulkApply, btnSegSaveModelConfig,
  btnConnectCamera, btnCameraSettings, btnRefreshCameras, btnCapture, btnFolder, btnSave,
  btnSummary, btnCloseSummary, summaryPanel, patientNameInput,
} from "./dom.js";
import { captureState } from "./state.js";
import { segState } from "./segmentation/state.js";
import { switchTab } from "./view-tabs.js";
import { connectCamera, openCameraSettings, loadCameras, restoreCameraStatusIfConnected, checkCameraStatus } from "./camera.js";
import {
  doCapture, doSelectFolder, doSave, loadFolderSummary, updateSaveButtonState,
  sendCaptureToSegmentation,
} from "./capture.js";
import { switchSegImageTab, switchSegListTab, switchSegClassTab } from "./segmentation/tabs.js";
import {
  toggleSegAddMode, setSegZoom, resetSegZoom, handleSegWheelZoom, segMouseDown, segMouseMove,
  segMouseUp, loadClassLegend, toggleSegSelectAll, doSegBulkApply,
} from "./segmentation/detections.js";
import {
  doSelectSegmentationImage, doLoadSegmentationResult, doRunSegmentation, doSaveSegmentation,
} from "./segmentation/core.js";
import {
  doLoadSegPatientSummary, doSegBatchRun, doLoadSegResultsListButton, doExportSegReport,
  applySegResultsFilter,
} from "./segmentation/results-list.js";
import { loadSegModelStatus, doSaveSegModelConfig } from "./segmentation/model-config.js";
import "./segmentation/keyboard.js"; // cuma efek samping: pasang window keydown listener (tab Segmentasi)
import "./keyboard.js"; // cuma efek samping: pasang window keydown listener (tab Capture)

tabCapture.addEventListener("click", () => switchTab("capture"));
tabSegmentation.addEventListener("click", () => switchTab("segmentation"));
btnSegSelectImage.addEventListener("click", doSelectSegmentationImage);
btnLoadSegmentation.addEventListener("click", doLoadSegmentationResult);
btnRunSegmentation.addEventListener("click", doRunSegmentation);
btnSaveSegmentation.addEventListener("click", doSaveSegmentation);
btnSendToSegmentation.addEventListener("click", sendCaptureToSegmentation);
segTabSource.addEventListener("click", () => switchSegImageTab("source"));
segTabResult.addEventListener("click", () => switchSegImageTab("result"));
segClassTabTable.addEventListener("click", () => switchSegClassTab("table"));
segClassTabChart.addEventListener("click", () => switchSegClassTab("chart"));
segTabDetections.addEventListener("click", () => switchSegListTab("detections"));
segTabFolderResults.addEventListener("click", doLoadSegResultsListButton);

btnSegAddCell.addEventListener("click", toggleSegAddMode);
btnSegZoomIn.addEventListener("click", () => setSegZoom(segState.segZoom + 0.25));
btnSegZoomOut.addEventListener("click", () => setSegZoom(segState.segZoom - 0.25));
btnSegZoomReset.addEventListener("click", resetSegZoom);
segSourceBody.addEventListener("wheel", handleSegWheelZoom, { passive: false });
segResultBody.addEventListener("wheel", handleSegWheelZoom, { passive: false });
segSourceBody.addEventListener("mousedown", segMouseDown);
segResultBody.addEventListener("mousedown", segMouseDown);
window.addEventListener("mousemove", segMouseMove);
window.addEventListener("mouseup", segMouseUp);

btnSegPatientSummary.addEventListener("click", doLoadSegPatientSummary);
btnSegBatchRun.addEventListener("click", doSegBatchRun);
btnSegListResults.addEventListener("click", doLoadSegResultsListButton);
btnSegExportReport.addEventListener("click", doExportSegReport);
segResultsFilter.addEventListener("input", applySegResultsFilter);
segSelectAllCells.addEventListener("change", toggleSegSelectAll);
btnSegBulkApply.addEventListener("click", doSegBulkApply);
btnSegSaveModelConfig.addEventListener("click", doSaveSegModelConfig);

btnConnectCamera.addEventListener("click", connectCamera);
if (btnCameraSettings) btnCameraSettings.addEventListener("click", openCameraSettings);
btnRefreshCameras.addEventListener("click", loadCameras);
btnCapture.addEventListener("click", doCapture);
btnFolder.addEventListener("click", doSelectFolder);
btnSave.addEventListener("click", doSave);
btnSummary.addEventListener("click", loadFolderSummary);
btnCloseSummary.addEventListener("click", () => {
  summaryPanel.classList.add("summary-hidden");
  captureState.summaryDismissed = true;
});
patientNameInput.addEventListener("input", updateSaveButtonState);

// Peringatan kalau tab ditutup/direload padahal ada hasil capture yang
// belum disimpan -- ini SATU-SATUNYA dialog yang tetap pakai bawaan
// browser (bukan modal custom kayak yang lain), karena beforeunload memang
// tidak bisa dikustomisasi tampilannya di semua browser modern (dibatasi
// spec, buat cegah abuse popup pas nutup tab).
window.addEventListener("beforeunload", (e) => {
  if (captureState.hasCapturedImage && !captureState.currentCaptureSaved) {
    e.preventDefault();
    e.returnValue = "";
  }
});

loadCameras().then(restoreCameraStatusIfConnected);
loadClassLegend();
loadSegModelStatus();
setInterval(checkCameraStatus, 2000);
