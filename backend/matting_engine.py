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
        Uses U2Net Human Seg deep learning neural network.
        Fast inference (~400ms) with clean alpha antialiasing.
        """
        result = rembg.remove(
            image_pil,
            session=self.session,
            alpha_matting=False
        )
        return result

    def detect_multiple_persons(
        self,
        image_bgr: np.ndarray,
        alpha_mask: Optional[np.ndarray] = None
    ) -> List[Dict[str, Any]]:
        """
        Detects multiple distinct persons in an image using connected segmentation analysis.
        Robust, fast, and does not depend on legacy cv2 HOGDescriptor.
        """
        h, w = image_bgr.shape[:2]
        if alpha_mask is None:
            # Generate alpha mask from RGB image if not provided
            rgb_pil = Image.fromarray(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
            cutout = self.remove_background(rgb_pil)
            alpha_mask = np.array(cutout)[:, :, 3]

        # Find connected components in the alpha mask
        _, binary = cv2.threshold(alpha_mask, 50, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        min_area = (w * h) * 0.04  # At least 4% of image area to be considered a person
        detected_persons = []
        person_id = 1

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area >= min_area:
                x, y, bw, bh = cv2.boundingRect(cnt)
                # Expand box slightly for context
                pad_x = int(bw * 0.08)
                pad_y = int(bh * 0.08)
                x_min = max(0, x - pad_x)
                y_min = max(0, y - pad_y)
                x_max = min(w, x + bw + pad_x)
                y_max = min(h, y + bh + pad_y)

                detected_persons.append({
                    "id": person_id,
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
                person_id += 1

        # Sort left-to-right
        detected_persons.sort(key=lambda p: p["bbox"]["x"])
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
