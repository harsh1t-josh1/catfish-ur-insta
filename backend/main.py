"""
FastAPI Server: AI Pose Reference & Photo Recreation Backend.
Provides endpoints for reference analysis, live pose comparison, background removal,
and high-fidelity photo recreation compositing.
"""

import os
import sys

# Ensure rembg uses the project-isolated models directory
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
os.environ["U2NET_HOME"] = MODELS_DIR

import io
import base64
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cv2
import numpy as np
from PIL import Image

from pose_engine import PoseEngine
from matting_engine import MattingEngine
from composite_engine import CompositeEngine

app = FastAPI(
    title="AI Pose Reference & Photo Recreation API",
    description="Professional backend for pose detection, guidance, and high-fidelity photo recreation.",
    version="1.0.0"
)

# Enable CORS for local development and mobile network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AI Engines
pose_engine = PoseEngine(static_image_mode=True)
live_pose_engine = PoseEngine(static_image_mode=False, model_complexity=0)
matting_engine = MattingEngine(model_name="u2net_human_seg")
composite_engine = CompositeEngine()


def decode_image_bytes(data: bytes) -> Image.Image:
    """Safely decodes image bytes to PIL Image."""
    try:
        image = Image.open(io.BytesIO(data))
        # Handle orientation from EXIF if present
        try:
            from PIL import ImageOps
            image = ImageOps.exif_transpose(image)
        except Exception:
            pass
        return image
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")


def base64_to_pil(b64_str: str) -> Image.Image:
    """Decodes base64 string (with or without data URI header) to PIL Image."""
    try:
        if "," in b64_str:
            b64_str = b64_str.split(",", 1)[1]
        raw_bytes = base64.b64decode(b64_str)
        return decode_image_bytes(raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {str(e)}")


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "AI Pose Reference & Photo Recreation",
        "engines": {
            "pose": "MediaPipe Pose 33-Keypoints",
            "segmentation": "U2Net Human Seg",
            "compositing": "CIELAB Reinhard Harmonization + Contact Shadow"
        }
    }


@app.post("/api/analyze-reference")
async def analyze_reference(
    image: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None)
):
    """
    Analyzes an uploaded reference image:
    1. Checks for multiple persons and detects individual bboxes.
    2. Performs MediaPipe pose estimation (landmarks, joint angles, head orientation).
    3. Removes background to create a clean, transparent ghost overlay.
    """
    if image is not None:
        contents = await image.read()
        pil_img = decode_image_bytes(contents)
    elif image_base64:
        pil_img = base64_to_pil(image_base64)
    else:
        raise HTTPException(status_code=400, detail="No image provided")

    # Resize if extremely large to prevent OOM while keeping high quality
    max_dim = 1200
    if max(pil_img.size) > max_dim:
        pil_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

    np_bgr = cv2.cvtColor(np.array(pil_img.convert("RGB")), cv2.COLOR_RGB2BGR)

    # 1. Transparent background removal for ghost overlay (fast U2Net without Laplacian overhead)
    cutout_rgba = matting_engine.remove_background(pil_img)
    alpha_mask = np.array(cutout_rgba)[:, :, 3]

    # 2. Multi-person detection from human segmentation mask
    detected_persons = matting_engine.detect_multiple_persons(np_bgr, alpha_mask=alpha_mask)

    # 3. Pose detection
    pose_results = pose_engine.detect_landmarks(np_bgr)
    if not pose_results:
        # Fallback with less strict detector if initial detection misses
        raise HTTPException(
            status_code=422,
            detail="No person pose detected in the reference photograph. Please upload a clear photo containing a person."
        )

    ghost_overlay_b64 = matting_engine.pil_to_base64_png(cutout_rgba)
    original_b64 = matting_engine.pil_to_base64_jpeg(pil_img, quality=85)

    return {
        "status": "success",
        "width": pil_img.width,
        "height": pil_img.height,
        "multiple_persons": len(detected_persons) > 1,
        "persons": detected_persons,
        "ghost_overlay": ghost_overlay_b64,
        "original_image": original_b64,
        "landmarks": pose_results["landmarks"],
        "bbox": pose_results["bbox"],
        "angles": pose_results["angles"],
        "head_orientation": pose_results["head_orientation"]
    }


class ComparePoseRequest(BaseModel):
    ref_landmarks: List[Dict[str, float]]
    ref_angles: Dict[str, float]
    user_image_base64: Optional[str] = None
    user_landmarks: Optional[List[Dict[str, float]]] = None
    user_angles: Optional[Dict[str, float]] = None
    mirror_mode: bool = False


@app.post("/api/compare-pose")
async def compare_pose(req: ComparePoseRequest):
    """
    Compares live user camera pose with reference pose.
    Calculates similarity percentage and returns real-time directional feedback.
    """
    user_lms = req.user_landmarks
    user_ang = req.user_angles

    if not user_lms and req.user_image_base64:
        user_pil = base64_to_pil(req.user_image_base64)
        np_bgr = cv2.cvtColor(np.array(user_pil.convert("RGB")), cv2.COLOR_RGB2BGR)
        pose_res = live_pose_engine.detect_landmarks(np_bgr)
        if pose_res:
            user_lms = pose_res["landmarks"]
            user_ang = pose_res["angles"]
        else:
            return {
                "similarity_score": 0.0,
                "is_aligned": False,
                "cues": ["Step into frame so your body is visible"],
                "part_status": {
                    "head": "not_detected",
                    "left_arm": "not_detected",
                    "right_arm": "not_detected",
                    "torso": "not_detected",
                    "legs": "not_detected"
                },
                "user_landmarks": None
            }

    if not user_lms or not user_ang:
        raise HTTPException(status_code=400, detail="Missing user pose landmarks or image")

    comparison = pose_engine.compare_poses(
        ref_landmarks=req.ref_landmarks,
        ref_angles=req.ref_angles,
        user_landmarks=user_lms,
        user_angles=user_ang,
        mirror_mode=req.mirror_mode
    )
    comparison["user_landmarks"] = user_lms
    return comparison


class RecreatePhotoRequest(BaseModel):
    ref_image_base64: str
    user_image_base64: str
    ref_bbox: Optional[Dict[str, int]] = None
    x_offset_pct: float = 0.0
    y_offset_pct: float = 0.0
    scale_mult: float = 1.0
    lighting_strength: float = 0.65


@app.post("/api/recreate-photo")
async def recreate_photo(req: RecreatePhotoRequest):
    """
    Photo Recreation Mode:
    1. Preserves original reference photograph background.
    2. Removes background from user captured photo (clean hair and edges).
    3. Color-harmonizes user to match ambient lighting and temperature of reference scene.
    4. Computes scale, position, and soft contact shadow.
    5. Produces the final recreated photograph.
    """
    ref_pil = base64_to_pil(req.ref_image_base64)
    user_pil = base64_to_pil(req.user_image_base64)

    # Scale high-res mobile captures for fast, responsive processing
    max_dim = 1400
    if max(ref_pil.size) > max_dim:
        ref_pil.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    if max(user_pil.size) > max_dim:
        user_pil.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

    # Extract user subject
    user_cutout = matting_engine.remove_background(user_pil)

    # Perform advanced compositing
    recreated_pil = composite_engine.composite_recreation(
        ref_image_pil=ref_pil,
        user_cutout_pil=user_cutout,
        ref_bbox=req.ref_bbox,
        x_offset_pct=req.x_offset_pct,
        y_offset_pct=req.y_offset_pct,
        scale_mult=req.scale_mult,
        lighting_strength=req.lighting_strength
    )

    result_b64 = matting_engine.pil_to_base64_jpeg(recreated_pil, quality=92)
    user_cutout_b64 = matting_engine.pil_to_base64_png(user_cutout)

    return {
        "status": "success",
        "recreated_image": result_b64,
        "user_cutout": user_cutout_b64,
        "width": recreated_pil.width,
        "height": recreated_pil.height
    }


class ExportCompositeRequest(BaseModel):
    recreated_image_base64: str
    ref_image_base64: Optional[str] = None
    layout: str = "single"  # "single" or "side_by_side"


@app.post("/api/export-composite")
async def export_composite(req: ExportCompositeRequest):
    """Exports final composite, optionally formatted side-by-side with reference."""
    rec_pil = base64_to_pil(req.recreated_image_base64)

    if req.layout == "side_by_side" and req.ref_image_base64:
        ref_pil = base64_to_pil(req.ref_image_base64)
        target_h = max(rec_pil.height, ref_pil.height)
        # Resize both to same height
        ref_resized = ref_pil.resize((int(ref_pil.width * (target_h / ref_pil.height)), target_h), Image.Resampling.LANCZOS)
        rec_resized = rec_pil.resize((int(rec_pil.width * (target_h / rec_pil.height)), target_h), Image.Resampling.LANCZOS)

        total_w = ref_resized.width + rec_resized.width + 20
        canvas = Image.new("RGB", (total_w, target_h), color=(18, 18, 18))
        canvas.paste(ref_resized, (0, 0))
        canvas.paste(rec_resized, (ref_resized.width + 20, 0))
        export_b64 = matting_engine.pil_to_base64_jpeg(canvas, quality=95)
    else:
        export_b64 = matting_engine.pil_to_base64_jpeg(rec_pil, quality=95)

    return {
        "status": "success",
        "export_image": export_b64
    }
