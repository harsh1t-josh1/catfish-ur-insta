"""
Composite Engine: High-fidelity photo recreation compositing.
Preserves original reference background, aligns extracted user,
applies CIELAB color/lighting harmonization, edge feathering, and contact shadows.
"""

from typing import Dict, Optional, Tuple, Any
import cv2
import numpy as np
from PIL import Image, ImageFilter


class CompositeEngine:
    def __init__(self):
        pass

    @staticmethod
    def reinhard_color_transfer(
        source_bgr: np.ndarray,
        target_bgr: np.ndarray,
        mask: np.ndarray,
        strength: float = 0.65
    ) -> np.ndarray:
        """
        Transfers color/lighting characteristics from target (reference background)
        to source (user subject) using Reinhard color transfer in LAB space.
        Strength controls blend between original user color and harmonized color (0.0 - 1.0).
        """
        # Convert to float32 LAB
        src_lab = cv2.cvtColor(source_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        tgt_lab = cv2.cvtColor(target_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)

        # Compute stats for source (only within subject mask)
        mask_bool = mask > 20
        if not np.any(mask_bool):
            return source_bgr

        src_l = src_lab[:, :, 0][mask_bool]
        src_a = src_lab[:, :, 1][mask_bool]
        src_b = src_lab[:, :, 2][mask_bool]

        tgt_l = tgt_lab[:, :, 0]
        tgt_a = tgt_lab[:, :, 1]
        tgt_b = tgt_lab[:, :, 2]

        l_mean_src, l_std_src = np.mean(src_l), np.std(src_l) + 1e-5
        a_mean_src, a_std_src = np.mean(src_a), np.std(src_a) + 1e-5
        b_mean_src, b_std_src = np.mean(src_b), np.std(src_b) + 1e-5

        l_mean_tgt, l_std_tgt = np.mean(tgt_l), np.std(tgt_l) + 1e-5
        a_mean_tgt, a_std_tgt = np.mean(tgt_a), np.std(tgt_a) + 1e-5
        b_mean_tgt, b_std_tgt = np.mean(tgt_b), np.std(tgt_b) + 1e-5

        # Normalize source and scale by target stats
        res_l = ((src_lab[:, :, 0] - l_mean_src) / l_std_src) * l_std_tgt + l_mean_tgt
        res_a = ((src_lab[:, :, 1] - a_mean_src) / a_std_src) * a_std_tgt + a_mean_tgt
        res_b = ((src_lab[:, :, 2] - b_mean_src) / b_std_src) * b_std_tgt + b_mean_tgt

        # Clip LAB ranges
        res_l = np.clip(res_l, 0, 255)
        res_a = np.clip(res_a, 0, 255)
        res_b = np.clip(res_b, 0, 255)

        harmonized_lab = cv2.merge([res_l, res_a, res_b]).astype(np.uint8)
        harmonized_bgr = cv2.cvtColor(harmonized_lab, cv2.COLOR_LAB2BGR)

        # Blend with original source based on strength
        blended = cv2.addWeighted(harmonized_bgr, strength, source_bgr, 1.0 - strength, 0)
        return blended

    @staticmethod
    def add_contact_shadow(
        canvas_bgr: np.ndarray,
        user_bbox: Tuple[int, int, int, int],
        shadow_intensity: float = 0.35
    ) -> np.ndarray:
        """
        Draws a realistic soft contact shadow under the subject's feet / bottom contact point.
        user_bbox = (x_min, y_min, x_max, y_max)
        """
        x_min, y_min, x_max, y_max = user_bbox
        w = x_max - x_min
        h = y_max - y_min
        center_x = int(x_min + w / 2)
        bottom_y = int(y_max - 5)

        shadow_w = int(w * 0.75)
        shadow_h = max(8, int(h * 0.04))

        overlay = canvas_bgr.copy()
        # Draw dark ellipse
        cv2.ellipse(
            overlay,
            (center_x, bottom_y),
            (shadow_w // 2, shadow_h),
            0, 0, 360,
            (20, 20, 20),
            -1
        )
        # Blur shadow ellipse heavily
        ksize = max(15, (shadow_h * 2) | 1)
        blurred_overlay = cv2.GaussianBlur(overlay, (ksize, ksize), 0)

        # Alpha blend shadow onto canvas
        result = cv2.addWeighted(blurred_overlay, shadow_intensity, canvas_bgr, 1.0 - shadow_intensity, 0)
        return result

    def composite_recreation(
        self,
        ref_image_pil: Image.Image,
        user_cutout_pil: Image.Image,
        ref_bbox: Optional[Dict[str, int]] = None,
        x_offset_pct: float = 0.0,
        y_offset_pct: float = 0.0,
        scale_mult: float = 1.0,
        lighting_strength: float = 0.65
    ) -> Image.Image:
        """
        Composites extracted user onto the original reference background:
        - ref_image_pil: original complete reference photo (preserves background)
        - user_cutout_pil: user photo with transparent background (RGBA)
        - ref_bbox: optional bounding box of target person in reference
        - offsets and scale: fine-tuning parameters
        """
        ref_w, ref_h = ref_image_pil.size
        ref_bgr = cv2.cvtColor(np.array(ref_image_pil.convert("RGB")), cv2.COLOR_RGB2BGR)

        # Convert user cutout to numpy RGBA
        user_rgba = np.array(user_cutout_pil.convert("RGBA"))
        user_bgr = cv2.cvtColor(user_rgba[:, :, :3], cv2.COLOR_RGB2BGR)
        user_alpha = user_rgba[:, :, 3]

        # Find tight bounding box of user cutout
        coords = cv2.findNonZero(user_alpha)
        if coords is not None:
            ux, uy, uw, uh = cv2.boundingRect(coords)
            user_bgr = user_bgr[uy:uy+uh, ux:ux+uw]
            user_alpha = user_alpha[uy:uy+uh, ux:ux+uw]
        else:
            uw, uh = user_cutout_pil.size

        # Determine target bounding box in reference background
        if ref_bbox:
            target_w = ref_bbox.get("width", int(ref_w * 0.5))
            target_h = ref_bbox.get("height", int(ref_h * 0.75))
            target_cx = ref_bbox.get("x", int(ref_w * 0.5)) + target_w // 2
            target_cy = ref_bbox.get("y", int(ref_h * 0.5)) + target_h // 2
        else:
            target_w = int(ref_w * 0.55)
            target_h = int(ref_h * 0.8)
            target_cx = int(ref_w * 0.5)
            target_cy = int(ref_h * 0.5)

        # Apply scale multiplier
        desired_h = int(target_h * scale_mult)
        aspect_ratio = uw / max(1, uh)
        desired_w = int(desired_h * aspect_ratio)

        # Resize user subject
        resized_user_bgr = cv2.resize(user_bgr, (desired_w, desired_h), interpolation=cv2.INTER_LANCZOS4)
        resized_alpha = cv2.resize(user_alpha, (desired_w, desired_h), interpolation=cv2.INTER_LANCZOS4)

        # Apply soft edge feathering to alpha mask (removes hard cutout artifacts)
        blurred_alpha = cv2.GaussianBlur(resized_alpha, (5, 5), 0)
        norm_alpha = (blurred_alpha.astype(np.float32) / 255.0)[:, :, np.newaxis]

        # Calculate final placement position with user offsets
        shift_x = int(ref_w * (x_offset_pct / 100.0))
        shift_y = int(ref_h * (y_offset_pct / 100.0))
        top_left_x = target_cx - (desired_w // 2) + shift_x
        top_left_y = target_cy - (desired_h // 2) + shift_y

        # Handle clipping at canvas edges
        src_x1 = max(0, -top_left_x)
        src_y1 = max(0, -top_left_y)
        dst_x1 = max(0, top_left_x)
        dst_y1 = max(0, top_left_y)

        src_x2 = desired_w - max(0, (top_left_x + desired_w) - ref_w)
        src_y2 = desired_h - max(0, (top_left_y + desired_h) - ref_h)
        dst_x2 = min(ref_w, top_left_x + desired_w)
        dst_y2 = min(ref_h, top_left_y + desired_h)

        if dst_x2 <= dst_x1 or dst_y2 <= dst_y1:
            # Fallback: return reference image if placement out of bounds
            return ref_image_pil

        crop_user_bgr = resized_user_bgr[src_y1:src_y2, src_x1:src_x2]
        crop_alpha = norm_alpha[src_y1:src_y2, src_x1:src_x2]
        ref_roi = ref_bgr[dst_y1:dst_y2, dst_x1:dst_x2]

        # Color and Lighting Harmonization
        if lighting_strength > 0.05:
            harmonized_user = self.reinhard_color_transfer(
                crop_user_bgr,
                ref_bgr,
                resized_alpha[src_y1:src_y2, src_x1:src_x2],
                strength=lighting_strength
            )
        else:
            harmonized_user = crop_user_bgr

        # Add contact shadow onto reference background before placing subject
        canvas_with_shadow = self.add_contact_shadow(
            ref_bgr,
            (dst_x1, dst_y1, dst_x2, dst_y2),
            shadow_intensity=0.3
        )

        # Alpha composite subject onto reference background
        roi = canvas_with_shadow[dst_y1:dst_y2, dst_x1:dst_x2]
        composited_roi = (harmonized_user.astype(np.float32) * crop_alpha +
                          roi.astype(np.float32) * (1.0 - crop_alpha)).astype(np.uint8)

        canvas_with_shadow[dst_y1:dst_y2, dst_x1:dst_x2] = composited_roi

        # Convert back to RGB PIL
        result_rgb = cv2.cvtColor(canvas_with_shadow, cv2.COLOR_BGR2RGB)
        return Image.fromarray(result_rgb)
