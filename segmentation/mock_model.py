"""
Generator deteksi instance segmentation DUMMY -- titik satu-satunya yang
perlu diganti begitu model asli (Mask R-CNN/Detectron2, dilatih dari RBC
Chula dataset) siap dipasang. Kontrak return-nya (list of dict dengan key
classIndex/classLabel/confidence/bbox/mask) dipertahankan supaya nanti
tinggal ganti ISI fungsi ini, tanpa perlu ubah kode di routes.py atau di
frontend.
"""

import math
import random

from .constants import RBC_CLASS_LABELS


def generate_mock_instance_segmentation(frame):
    """PLACEHOLDER -- BUKAN model beneran.

    Menghasilkan deteksi instance segmentation dummy (blob mirip lingkaran +
    kelas acak) supaya seluruh alur UI (overlay per kelas, daftar per-sel,
    koreksi manual, simpan hasil) bisa dibangun & dites end-to-end lebih
    dulu.
    """
    h, w = frame.shape[:2]
    n_cells = random.randint(12, 24)
    detections = []

    # Bobot supaya "Normal cell" (index 0) lebih sering muncul, kira-kira
    # mirip proporsi asli di citra apusan darah (mayoritas sel normal).
    weights = [40] + [5] * (len(RBC_CLASS_LABELS) - 1)

    min_r = max(6, int(min(w, h) * 0.02))
    max_r = max(min_r + 4, int(min(w, h) * 0.045))

    for i in range(n_cells):
        cx = random.randint(max_r, max(max_r + 1, w - max_r))
        cy = random.randint(max_r, max(max_r + 1, h - max_r))
        r = random.randint(min_r, max_r)
        class_index = random.choices(range(len(RBC_CLASS_LABELS)), weights=weights, k=1)[0]
        confidence = round(random.uniform(0.55, 0.98), 3)

        # Bentuk mask sebagai polygon (bukan lingkaran sempurna, dikasih
        # noise dikit di radius) -- ini format yang sama dipakai instance
        # segmentation beneran (polygon per instance, gaya COCO).
        n_points = 16
        points = []
        for p in range(n_points):
            angle = 2 * math.pi * p / n_points
            rr = r * random.uniform(0.85, 1.1)
            points.append([
                round(cx + rr * math.cos(angle), 1),
                round(cy + rr * math.sin(angle), 1),
            ])

        bbox_x = max(0, cx - r)
        bbox_y = max(0, cy - r)
        detections.append({
            "id": i,
            "classIndex": class_index,
            "classLabel": RBC_CLASS_LABELS[class_index],
            "confidence": confidence,
            "bbox": [bbox_x, bbox_y, min(2 * r, w - bbox_x), min(2 * r, h - bbox_y)],
            "mask": points,
        })
    return detections
