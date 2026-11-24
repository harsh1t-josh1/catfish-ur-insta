"""
Matting Engine: High-quality person segmentation, background removal, and multi-person isolation.
"""

import os
import sys

# Ensure rembg uses the project-isolated models directory
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
os.environ["U2NET_HOME"] = MODELS_DIR

import io
import base64
from typing import Dict, List, Optional, Tuple, Any
import cv2
import numpy as np
from PIL import Image
import rembg


class MattingEngine:
    def __init__(self, model_name: str = "u2net_human_seg"):
        self.session = rembg.new_session(model_name)

    def remove_background(self, image_pil: Image.Image) -> Image.Image:
        """
        Removes background from image, preserving hair and fine edges.
        Returns RGBA PIL Image.
        """
        result = rembg.remove(
            image_pil,
            session=self.session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10
        )
        return result

    def detect_multiple_persons(self, image_bgr: np.ndarray) -> List[Dict[str, Any]]:
        """
        Detects multiple persons in an image and returns their bounding boxes and crops.
        """
        h, w, _ = image_bgr.shape
        # Use HOG descriptor with default people detector
        hog = cv2.HOGDescriptor()
        hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

        boxes, weights = hog.detectMultiScale(
            image_bgr,
            winStride=(8, 8),
            padding=(16, 16),
            scale=1.05
        )

        detected_persons = []
        if len(boxes) > 1:
            for idx, (x, y, bw, bh) in enumerate(boxes):
                # Expand box slightly for context
                pad_x = int(bw * 0.1)
                pad_y = int(bh * 0.1)
                x_min = max(0, x - pad_x)
                y_min = max(0, y - pad_y)
                x_max = min(w, x + bw + pad_x)
                y_max = min(h, y + bh + pad_y)

                detected_persons.append({
                    "id": idx + 1,
                    "bbox": {
                        "x": int(x_min),
                        "y": int(y_min),
                        "width": int(x_max - x_min),
                        "height": int(y_max - y_min)
                    },
                    "normalized_bbox": {
                        "x": round(x_min / w, 3),
                        "y": round(y_min / h, 3),
                        "width": round((x_max - x_min) / w, 3),
                        "height": round((y_max - y_min) / h, 3)
                    }
                })

        return detected_persons

    @staticmethod
    def pil_to_base64_png(image_pil: Image.Image) -> str:
        """Convert PIL Image to base64 data URI string."""
        buffer = io.BytesIO()
        image_pil.save(buffer, format="PNG")
        b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{b64_str}"

    @staticmethod
    def pil_to_base64_jpeg(image_pil: Image.Image, quality: int = 90) -> str:
        """Convert PIL Image to base64 JPEG data URI string."""
        buffer = io.BytesIO()
        rgb_img = image_pil.convert("RGB")
        rgb_img.save(buffer, format="JPEG", quality=quality)
        b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{b64_str}"
