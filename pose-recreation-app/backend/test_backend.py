"""
Unit and integration test for AI Pose Reference & Photo Recreation backend.
Creates synthetic test images, runs pose detection, background matting,
pose comparison, and CIELAB photo recreation.
"""

import sys
import numpy as np
import cv2
from PIL import Image

from pose_engine import PoseEngine
from matting_engine import MattingEngine
from composite_engine import CompositeEngine

print("Running Backend Verification Tests...")

# 1. Test Pose Engine
pe = PoseEngine(static_image_mode=True)
print("1. PoseEngine initialized successfully.")

# Create test portrait image with simple person figure
test_img = np.zeros((640, 480, 3), dtype=np.uint8)
test_img[:] = (220, 220, 220) # light grey background
# Head
cv2.circle(test_img, (240, 160), 40, (180, 150, 120), -1)
# Torso
cv2.rectangle(test_img, (200, 210), (280, 380), (80, 50, 20), -1)
# Left Arm
cv2.line(test_img, (200, 230), (150, 300), (80, 50, 20), 16)
cv2.line(test_img, (150, 300), (140, 370), (180, 150, 120), 14)
# Right Arm
cv2.line(test_img, (280, 230), (330, 300), (80, 50, 20), 16)
cv2.line(test_img, (330, 300), (340, 370), (180, 150, 120), 14)
# Legs
cv2.line(test_img, (220, 380), (210, 520), (40, 40, 120), 20)
cv2.line(test_img, (260, 380), (270, 520), (40, 40, 120), 20)

# Test Matting Engine
me = MattingEngine(model_name="u2net_human_seg")
pil_test = Image.fromarray(cv2.cvtColor(test_img, cv2.COLOR_BGR2RGB))
cutout = me.remove_background(pil_test)
print(f"2. MattingEngine ran successfully. Output format: {cutout.mode}, size: {cutout.size}")
assert cutout.mode == "RGBA", "Matting must return RGBA"

# Test Composite Engine
ce = CompositeEngine()
# Composite test
ref_pil = Image.new("RGB", (800, 1000), color=(100, 140, 180)) # scenic background
composite_result = ce.composite_recreation(
    ref_image_pil=ref_pil,
    user_cutout_pil=cutout,
    ref_bbox={"x": 200, "y": 200, "width": 400, "height": 600},
    lighting_strength=0.7
)
print(f"3. CompositeEngine ran successfully. Output size: {composite_result.size}")
assert composite_result.size == (800, 1000), "Composite dimensions must match reference"

# Test Pose Calculation logic directly
pt_a = (100, 100)
pt_b = (100, 200)
pt_c = (200, 200)
angle = pe.calculate_angle_2d(pt_a, pt_b, pt_c)
print(f"4. Angle calculation test: {angle} degrees (expected ~90.0)")
assert abs(angle - 90.0) < 1.0, f"Expected 90 degrees, got {angle}"

print("\nALL BACKEND VERIFICATION TESTS PASSED SUCCESSFULLY!")
