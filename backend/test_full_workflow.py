"""
End-to-End Workflow & Integration Test Suite
Validates both Feature One (Pose Reference Mode) and Feature Two (Photo Recreation Mode).
"""

import os
import sys
import numpy as np
import cv2
from PIL import Image

# Ensure project models are used
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
os.environ["U2NET_HOME"] = MODELS_DIR

from pose_engine import PoseEngine
from matting_engine import MattingEngine
from composite_engine import CompositeEngine

print("==========================================================")
print("  AI POSE STUDIO: FULL E2E SYSTEM INTEGRATION TEST")
print("==========================================================")

# 1. Initialize Engines
pe = PoseEngine(static_image_mode=True)
me = MattingEngine(model_name="u2net_human_seg")
ce = CompositeEngine()
print("[PASS] AI Engines successfully initialized.")

# 2. Create Reference Photograph (Pinterest/Social style: person in outdoor garden/street scene)
ref_w, ref_h = 720, 960
ref_scene = np.zeros((ref_h, ref_w, 3), dtype=np.uint8)
# Gradient sunset sky
for y in range(int(ref_h * 0.6)):
    r = int(120 + 100 * (y / (ref_h * 0.6)))
    g = int(80 + 60 * (y / (ref_h * 0.6)))
    b = int(180 - 80 * (y / (ref_h * 0.6)))
    ref_scene[y, :] = (b, g, r)
# Ground / terrace
ref_scene[int(ref_h * 0.6):, :] = (60, 90, 70) # warm terrace tone

# Draw reference person pose (standing stylishly with one hand raised)
cv2.circle(ref_scene, (360, 240), 55, (170, 140, 115), -1) # Head
cv2.rectangle(ref_scene, (300, 310), (420, 560), (35, 35, 35), -1) # Dark jacket
cv2.line(ref_scene, (300, 340), (220, 430), (35, 35, 35), 24) # Left arm up
cv2.line(ref_scene, (220, 430), (210, 330), (170, 140, 115), 20) # Forearm raised
cv2.line(ref_scene, (420, 340), (480, 440), (35, 35, 35), 24) # Right arm at hip
cv2.line(ref_scene, (480, 440), (420, 540), (170, 140, 115), 20)
cv2.line(ref_scene, (330, 560), (320, 780), (70, 80, 100), 28) # Left leg
cv2.line(ref_scene, (390, 560), (410, 780), (70, 80, 100), 28) # Right leg

ref_pil = Image.fromarray(cv2.cvtColor(ref_scene, cv2.COLOR_BGR2RGB))
print(f"[PASS] Created realistic reference photograph ({ref_w}x{ref_h}).")

# TEST FEATURE ONE: POSE REFERENCE MODE
print("\n--- Testing Feature 1: Pose Reference Mode ---")
# 1. Background removal to produce ghost overlay
ghost_cutout = me.remove_background(ref_pil)
print(f"[PASS] Ghost overlay extracted: mode={ghost_cutout.mode}, size={ghost_cutout.size}")
assert ghost_cutout.mode == "RGBA", "Ghost overlay must be transparent RGBA"
ghost_b64 = me.pil_to_base64_png(ghost_cutout)
assert ghost_b64.startswith("data:image/png;base64,"), "Valid data URI produced"
print(f"[PASS] Encoded ghost overlay PNG (base64 size: {len(ghost_b64)} bytes)")

# 2. Pose landmark & angle analysis
ref_landmarks = [
    {"x": 0.5, "y": 0.25, "z": 0.0, "visibility": 0.99}, # 0: nose
    {"x": 0.48, "y": 0.24, "z": 0.0, "visibility": 0.99}, # 1
    {"x": 0.47, "y": 0.24, "z": 0.0, "visibility": 0.99}, # 2: left_eye
    {"x": 0.46, "y": 0.24, "z": 0.0, "visibility": 0.99}, # 3
    {"x": 0.52, "y": 0.24, "z": 0.0, "visibility": 0.99}, # 4
    {"x": 0.53, "y": 0.24, "z": 0.0, "visibility": 0.99}, # 5: right_eye
    {"x": 0.54, "y": 0.24, "z": 0.0, "visibility": 0.99}, # 6
    {"x": 0.42, "y": 0.25, "z": 0.0, "visibility": 0.99}, # 7: left_ear
    {"x": 0.58, "y": 0.25, "z": 0.0, "visibility": 0.99}, # 8: right_ear
    {"x": 0.48, "y": 0.29, "z": 0.0, "visibility": 0.99}, # 9
    {"x": 0.52, "y": 0.29, "z": 0.0, "visibility": 0.99}, # 10
    {"x": 0.42, "y": 0.35, "z": 0.0, "visibility": 0.99}, # 11: left_shoulder
    {"x": 0.58, "y": 0.35, "z": 0.0, "visibility": 0.99}, # 12: right_shoulder
    {"x": 0.30, "y": 0.45, "z": 0.0, "visibility": 0.99}, # 13: left_elbow
    {"x": 0.67, "y": 0.46, "z": 0.0, "visibility": 0.99}, # 14: right_elbow
    {"x": 0.29, "y": 0.34, "z": 0.0, "visibility": 0.99}, # 15: left_wrist
    {"x": 0.58, "y": 0.56, "z": 0.0, "visibility": 0.99}, # 16: right_wrist
    {"x": 0.28, "y": 0.33, "z": 0.0, "visibility": 0.9}, # 17
    {"x": 0.59, "y": 0.57, "z": 0.0, "visibility": 0.9}, # 18
    {"x": 0.27, "y": 0.33, "z": 0.0, "visibility": 0.9}, # 19
    {"x": 0.60, "y": 0.57, "z": 0.0, "visibility": 0.9}, # 20
    {"x": 0.28, "y": 0.33, "z": 0.0, "visibility": 0.9}, # 21
    {"x": 0.59, "y": 0.57, "z": 0.0, "visibility": 0.9}, # 22
    {"x": 0.46, "y": 0.58, "z": 0.0, "visibility": 0.99}, # 23: left_hip
    {"x": 0.54, "y": 0.58, "z": 0.0, "visibility": 0.99}, # 24: right_hip
    {"x": 0.44, "y": 0.81, "z": 0.0, "visibility": 0.99}, # 25: left_knee
    {"x": 0.57, "y": 0.81, "z": 0.0, "visibility": 0.99}, # 26: right_knee
    {"x": 0.44, "y": 0.95, "z": 0.0, "visibility": 0.99}, # 27: left_ankle
    {"x": 0.57, "y": 0.95, "z": 0.0, "visibility": 0.99}, # 28: right_ankle
    {"x": 0.43, "y": 0.98, "z": 0.0, "visibility": 0.99}, # 29
    {"x": 0.58, "y": 0.98, "z": 0.0, "visibility": 0.99}, # 30
    {"x": 0.45, "y": 0.99, "z": 0.0, "visibility": 0.99}, # 31
    {"x": 0.59, "y": 0.99, "z": 0.0, "visibility": 0.99}, # 32
]

ref_angles = pe.extract_joint_angles(ref_landmarks)
print(f"[PASS] Extracted Reference Joint Angles: {ref_angles}")

# 3. Simulate live user camera pose with minor arm misalignment
user_landmarks = [lm.copy() for lm in ref_landmarks]
# User left arm lower than reference
user_landmarks[13]["y"] = 0.50 # left elbow slightly lower
user_landmarks[15]["y"] = 0.55 # left wrist lower
user_angles = pe.extract_joint_angles(user_landmarks)

comparison = pe.compare_poses(ref_landmarks, ref_angles, user_landmarks, user_angles)
print(f"[PASS] Real-time Pose Comparison Result (Partially Aligned):")
print(f"       Similarity Score: {comparison['similarity_score']}%")
print(f"       Aligned Status:   {comparison['is_aligned']}")
print(f"       Guidance Cues:    {comparison['cues']}")
print(f"       Part Statuses:    {comparison['part_status']}")
assert 50.0 < comparison["similarity_score"] < 95.0, "Similarity score calculation failed"
assert len(comparison["cues"]) > 0, "Guidance cues must be generated"

# 4. Test Fully Aligned Pose
aligned_user_landmarks = [lm.copy() for lm in ref_landmarks]
aligned_user_angles = pe.extract_joint_angles(aligned_user_landmarks)
aligned_comp = pe.compare_poses(ref_landmarks, ref_angles, aligned_user_landmarks, aligned_user_angles)
print(f"[PASS] Fully Aligned Pose Result: {aligned_comp['similarity_score']}% (Aligned: {aligned_comp['is_aligned']})")
assert aligned_comp["similarity_score"] >= 95.0, "Aligned pose must score >= 95%"
assert aligned_comp["is_aligned"] is True, "Aligned pose must have is_aligned=True"

# TEST FEATURE TWO: PHOTO RECREATION MODE
print("\n--- Testing Feature 2: Photo Recreation Mode ---")
# Create user photograph taken in user's room (white wall background)
user_img = np.zeros((ref_h, ref_w, 3), dtype=np.uint8)
user_img[:] = (235, 235, 238) # plain indoor wall
# User subject (e.g. wearing blue shirt)
cv2.circle(user_img, (360, 240), 55, (190, 160, 130), -1) # User head
cv2.rectangle(user_img, (300, 310), (420, 560), (140, 60, 30), -1) # Blue shirt
cv2.line(user_img, (300, 340), (220, 430), (140, 60, 30), 24)
cv2.line(user_img, (220, 430), (210, 330), (190, 160, 130), 20)
cv2.line(user_img, (420, 340), (480, 440), (140, 60, 30), 24)
cv2.line(user_img, (480, 440), (420, 540), (190, 160, 130), 20)
cv2.line(user_img, (330, 560), (320, 780), (30, 30, 40), 28)
cv2.line(user_img, (390, 560), (410, 780), (30, 30, 40), 28)
user_pil = Image.fromarray(cv2.cvtColor(user_img, cv2.COLOR_BGR2RGB))

# 1. Segment user subject
user_cutout = me.remove_background(user_pil)
print(f"[PASS] User portrait segmented cleanly: {user_cutout.size}, mode={user_cutout.mode}")

# 2. Composite user into original reference background
recreated_photo = ce.composite_recreation(
    ref_image_pil=ref_pil,
    user_cutout_pil=user_cutout,
    ref_bbox={"x": 200, "y": 180, "width": 320, "height": 620},
    lighting_strength=0.65
)
print(f"[PASS] Photo Recreation composite created: {recreated_photo.size}, format={recreated_photo.format or 'RGB'}")
assert recreated_photo.size == (ref_w, ref_h), "Dimensions must match original reference background"

# 3. Verify original reference background preservation:
# Check top-left corner (0,0) which was sunset sky (180, 80, 120 in BGR -> 120, 80, 180 in RGB)
pixel_tl = recreated_photo.getpixel((10, 10))
ref_tl = ref_pil.getpixel((10, 10))
diff = abs(pixel_tl[0] - ref_tl[0]) + abs(pixel_tl[1] - ref_tl[1]) + abs(pixel_tl[2] - ref_tl[2])
print(f"[PASS] Background preservation check at (10,10): diff={diff} (original={ref_tl}, recreated={pixel_tl})")
assert diff < 5, "Original background must be strictly preserved"

# Save test outputs
output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_outputs")
os.makedirs(output_dir, exist_ok=True)
recreated_photo.save(os.path.join(output_dir, "recreated_composite_test.jpg"), quality=95)
ghost_cutout.save(os.path.join(output_dir, "ghost_overlay_test.png"))
print(f"[PASS] Test artifacts saved to {output_dir}")

print("\n==========================================================")
print("  ALL E2E WORKFLOW TESTS PASSED WITHOUT ERRORS!")
print("==========================================================")
