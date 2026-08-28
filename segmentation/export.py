"""
Endpoint export laporan ringkasan hasil segmentasi satu folder ke file
Excel (openpyxl) -- 2 sheet: ringkasan per pasien, dan detail per gambar.
"""

import os
from datetime import datetime

from flask import jsonify, request

from utils import safe_slug

from . import segmentation_bp
from .constants import RBC_CLASS_LABELS
from .storage import _latest_segmentation_rows


@segmentation_bp.route("/api/segmentation/export-report", methods=["POST"])
def api_segmentation_export_report():
    """Export laporan ringkasan hasil segmentasi satu folder ke file Excel
    (2 sheet: ringkasan per pasien, dan detail per gambar) -- dedup terbaru
    per gambar, konsisten sama yang ditampilkan di aplikasi (Ringkasan per
    Pasien / Hasil di Folder Ini). Kalau patientId diisi, cuma pasien itu
    yang diekspor; kalau kosong, semua pasien di folder itu."""
    data = request.json or {}
    folder = (data.get("folder") or "").strip()
    patient_id_filter = (data.get("patientId") or "").strip()
    if not folder or not os.path.isdir(folder):
        return jsonify({"ok": False, "message": "Folder tidak valid."}), 400

    rows = _latest_segmentation_rows(folder)
    if patient_id_filter:
        rows = [r for r in rows if (r.get("patient_id") or "") == patient_id_filter]
    if not rows:
        return jsonify({"ok": False, "message": "Tidak ada hasil yang cocok untuk diekspor."}), 400

    try:
        import openpyxl
        from openpyxl.styles import Font
    except ImportError:
        return jsonify({
            "ok": False,
            "message": "Library openpyxl belum terinstall di server (pip install openpyxl).",
        }), 500

    wb = openpyxl.Workbook()

    ws1 = wb.active
    ws1.title = "Ringkasan Pasien"
    ws1.append(["ID Pasien", "Jumlah Gambar", "Total Sel"] + RBC_CLASS_LABELS)
    for cell in ws1[1]:
        cell.font = Font(bold=True)

    patients = {}
    for row in rows:
        pid = row.get("patient_id") or "?"
        if pid not in patients:
            patients[pid] = {"images": 0, "totalCells": 0, "counts": {l: 0 for l in RBC_CLASS_LABELS}}
        patients[pid]["images"] += 1
        try:
            patients[pid]["totalCells"] += int(row.get("total_cells") or 0)
        except ValueError:
            pass
        for label in RBC_CLASS_LABELS:
            try:
                patients[pid]["counts"][label] += int(row.get(label) or 0)
            except (ValueError, TypeError):
                pass
    for pid, agg in sorted(patients.items()):
        ws1.append([pid, agg["images"], agg["totalCells"]] + [agg["counts"][l] for l in RBC_CLASS_LABELS])

    ws2 = wb.create_sheet("Detail per Gambar")
    ws2.append(["Timestamp", "ID Pasien", "Gambar", "Total Sel"] + RBC_CLASS_LABELS)
    for cell in ws2[1]:
        cell.font = Font(bold=True)
    for row in sorted(rows, key=lambda r: r.get("timestamp") or ""):
        ws2.append(
            [row.get("timestamp"), row.get("patient_id"), row.get("source_image"), row.get("total_cells")]
            + [row.get(l) for l in RBC_CLASS_LABELS]
        )

    for ws in (ws1, ws2):
        for col_cells in ws.columns:
            length = max((len(str(c.value)) if c.value is not None else 0) for c in col_cells)
            ws.column_dimensions[col_cells[0].column_letter].width = min(30, max(10, length + 2))

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_patient = safe_slug(patient_id_filter) if patient_id_filter else "semua-pasien"
    filename = f"laporan_segmentasi_{safe_patient}_{timestamp}.xlsx"
    export_path = os.path.join(folder, filename)
    try:
        wb.save(export_path)
    except OSError as e:
        return jsonify({"ok": False, "message": f"Gagal menyimpan file laporan: {e}"}), 500

    return jsonify({"ok": True, "path": export_path, "filename": filename})
