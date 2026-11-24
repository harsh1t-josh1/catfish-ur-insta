"""
AI Pose Engine: Landmark detection, angle calculation, and real-time pose comparison.
Uses MediaPipe Pose with 33 full-body 3D landmarks.
"""

import math
from typing import Dict, List, Optional, Tuple, Any
import cv2
import mediapipe as mp
import numpy as np

mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils


class PoseEngine:
    def __init__(self, static_image_mode: bool = True, model_complexity: int = 1, min_detection_confidence: float = 0.5):
        self.pose = mp_pose.Pose(
            static_image_mode=static_image_mode,
            model_complexity=model_complexity,
            enable_segmentation=True,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=0.5
        )

    @staticmethod
    def calculate_angle_2d(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> float:
        """Calculate angle ABC in degrees (vertex at B)."""
        ba = (a[0] - b[0], a[1] - b[1])
        bc = (c[0] - b[0], c[1] - b[1])
        dot = ba[0] * bc[0] + ba[1] * bc[1]
        mag_ba = math.sqrt(ba[0]**2 + ba[1]**2)
        mag_bc = math.sqrt(bc[0]**2 + bc[1]**2)
        if mag_ba * mag_bc == 0:
            return 0.0
        cos_angle = max(-1.0, min(1.0, dot / (mag_ba * mag_bc)))
        return math.degrees(math.acos(cos_angle))

    def detect_landmarks(self, image_bgr: np.ndarray) -> Optional[Dict[str, Any]]:
        """
        Process a BGR image and return normalized landmarks and segmentation mask.
        """
        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        h, w, _ = image_bgr.shape
        results = self.pose.process(image_rgb)

        if not results.pose_landmarks:
            return None

        raw_landmarks = []
        for lm in results.pose_landmarks.landmark:
            raw_landmarks.append({
                "x": float(lm.x),
                "y": float(lm.y),
                "z": float(lm.z),
                "visibility": float(lm.visibility)
            })

        # Calculate bounding box of detected person
        xs = [lm["x"] * w for lm in raw_landmarks if lm["visibility"] > 0.3]
        ys = [lm["y"] * h for lm in raw_landmarks if lm["visibility"] > 0.3]
        if xs and ys:
            bbox = {
                "x_min": max(0, int(min(xs) - 20)),
                "y_min": max(0, int(min(ys) - 20)),
                "x_max": min(w, int(max(xs) + 20)),
                "y_max": min(h, int(max(ys) + 20))
            }
        else:
            bbox = {"x_min": 0, "y_min": 0, "x_max": w, "y_max": h}

        # Calculate key anatomical angles
        angles = self.extract_joint_angles(raw_landmarks)
        head_orientation = self.estimate_head_orientation(raw_landmarks)

        return {
            "landmarks": raw_landmarks,
            "bbox": bbox,
            "angles": angles,
            "head_orientation": head_orientation,
            "image_dims": {"width": w, "height": h}
        }

    def extract_joint_angles(self, lms: List[Dict[str, float]]) -> Dict[str, float]:
        """Extract angles between key joints."""
        # MediaPipe indices:
        # 11: left_shoulder, 12: right_shoulder
        # 13: left_elbow, 14: right_elbow
        # 15: left_wrist, 16: right_wrist
        # 23: left_hip, 24: right_hip
        # 25: left_knee, 26: right_knee
        # 27: left_ankle, 28: right_ankle
        def pt(idx: int) -> Tuple[float, float]:
            return (lms[idx]["x"], lms[idx]["y"])

        angles = {}
        # Elbow angles (shoulder - elbow - wrist)
        angles["left_elbow"] = round(self.calculate_angle_2d(pt(11), pt(13), pt(15)), 1)
        angles["right_elbow"] = round(self.calculate_angle_2d(pt(12), pt(14), pt(16)), 1)

        # Shoulder angles (hip - shoulder - elbow)
        angles["left_shoulder"] = round(self.calculate_angle_2d(pt(23), pt(11), pt(13)), 1)
        angles["right_shoulder"] = round(self.calculate_angle_2d(pt(24), pt(12), pt(14)), 1)

        # Hip angles (shoulder - hip - knee)
        angles["left_hip"] = round(self.calculate_angle_2d(pt(11), pt(23), pt(25)), 1)
        angles["right_hip"] = round(self.calculate_angle_2d(pt(12), pt(24), pt(26)), 1)

        # Knee angles (hip - knee - ankle)
        angles["left_knee"] = round(self.calculate_angle_2d(pt(23), pt(25), pt(27)), 1)
        angles["right_knee"] = round(self.calculate_angle_2d(pt(24), pt(26), pt(28)), 1)

        # Torso tilt (shoulder slope)
        dx_sh = lms[12]["x"] - lms[11]["x"]
        dy_sh = lms[12]["y"] - lms[11]["y"]
        shoulder_tilt = math.degrees(math.atan2(dy_sh, dx_sh)) if dx_sh != 0 else 0.0
        angles["shoulder_tilt"] = round(shoulder_tilt, 1)

        # Head tilt (ear slope: 7=left_ear, 8=right_ear)
        dx_ear = lms[8]["x"] - lms[7]["x"]
        dy_ear = lms[8]["y"] - lms[7]["y"]
        head_tilt = math.degrees(math.atan2(dy_ear, dx_ear)) if dx_ear != 0 else 0.0
        angles["head_tilt"] = round(head_tilt, 1)

        return angles

    def estimate_head_orientation(self, lms: List[Dict[str, float]]) -> Dict[str, Any]:
        """Estimate head pitch, yaw, and roll from face landmarks."""
        # 0: nose, 7: left_ear, 8: right_ear, 2: left_eye, 5: right_eye
        nose = lms[0]
        left_ear = lms[7]
        right_ear = lms[8]
        left_eye = lms[2]
        right_eye = lms[5]

        # Yaw: distance of nose to left ear vs right ear
        dist_left = abs(nose["x"] - left_ear["x"])
        dist_right = abs(nose["x"] - right_ear["x"])
        total_dist = dist_left + dist_right
        yaw = 0.0
        if total_dist > 0.001:
            ratio = dist_left / total_dist
            # 0.5 is facing front, <0.5 turned left, >0.5 turned right
            yaw = round((ratio - 0.5) * 180, 1)

        # Roll: angle between eyes
        dx = right_eye["x"] - left_eye["x"]
        dy = right_eye["y"] - left_eye["y"]
        roll = round(math.degrees(math.atan2(dy, dx)), 1)

        # Pitch: nose Y relative to eye level
        eye_y = (left_eye["y"] + right_eye["y"]) / 2.0
        pitch = round((nose["y"] - eye_y) * 100, 1)

        direction = "front"
        if yaw > 20:
            direction = "turned right"
        elif yaw < -20:
            direction = "turned left"

        return {
            "yaw": yaw,
            "roll": roll,
            "pitch": pitch,
            "direction": direction
        }

    def compare_poses(
        self,
        ref_landmarks: List[Dict[str, float]],
        ref_angles: Dict[str, float],
        user_landmarks: List[Dict[str, float]],
        user_angles: Dict[str, float],
        mirror_mode: bool = False
    ) -> Dict[str, Any]:
        """
        Compare user pose with reference pose.
        Produces:
        - Overall similarity percentage (0-100%)
        - Granular limb alignment statuses
        - Human-readable directional feedback cues
        """
        cues: List[str] = []
        part_status = {
            "head": "aligned",
            "left_arm": "aligned",
            "right_arm": "aligned",
            "torso": "aligned",
            "legs": "aligned"
        }

        # If mirror mode is active (e.g. user taking a mirror selfie), flip reference left/right
        effective_ref_angles = ref_angles.copy()
        if mirror_mode:
            effective_ref_angles["left_elbow"] = ref_angles.get("right_elbow", 0)
            effective_ref_angles["right_elbow"] = ref_angles.get("left_elbow", 0)
            effective_ref_angles["left_shoulder"] = ref_angles.get("right_shoulder", 0)
            effective_ref_angles["right_shoulder"] = ref_angles.get("left_shoulder", 0)
            effective_ref_angles["left_knee"] = ref_angles.get("right_knee", 0)
            effective_ref_angles["right_knee"] = ref_angles.get("left_knee", 0)
            effective_ref_angles["head_tilt"] = -ref_angles.get("head_tilt", 0)

        # 1. Compare Head Tilt
        head_tilt_diff = user_angles.get("head_tilt", 0) - effective_ref_angles.get("head_tilt", 0)
        if abs(head_tilt_diff) > 12.0:
            part_status["head"] = "adjust"
            if head_tilt_diff > 0:
                cues.append("Tilt your head slightly to the left")
            else:
                cues.append("Tilt your head slightly to the right")

        # 2. Compare Left Arm
        l_elbow_diff = user_angles.get("left_elbow", 0) - effective_ref_angles.get("left_elbow", 0)
        l_sh_diff = user_angles.get("left_shoulder", 0) - effective_ref_angles.get("left_shoulder", 0)
        if abs(l_elbow_diff) > 22.0 or abs(l_sh_diff) > 22.0:
            part_status["left_arm"] = "adjust"
            if l_sh_diff < -20:
                cues.append("Raise your left arm higher")
            elif l_sh_diff > 20:
                cues.append("Lower your left arm")
            elif l_elbow_diff < -20:
                cues.append("Bend your left elbow more")
            elif l_elbow_diff > 20:
                cues.append("Straighten your left arm slightly")

        # 3. Compare Right Arm
        r_elbow_diff = user_angles.get("right_elbow", 0) - effective_ref_angles.get("right_elbow", 0)
        r_sh_diff = user_angles.get("right_shoulder", 0) - effective_ref_angles.get("right_shoulder", 0)
        if abs(r_elbow_diff) > 22.0 or abs(r_sh_diff) > 22.0:
            part_status["right_arm"] = "adjust"
            if r_sh_diff < -20:
                cues.append("Raise your right arm higher")
            elif r_sh_diff > 20:
                cues.append("Lower your right arm")
            elif r_elbow_diff < -20:
                cues.append("Bend your right elbow more")
            elif r_elbow_diff > 20:
                cues.append("Straighten your right arm slightly")

        # 4. Compare Torso / Shoulder Level
        sh_tilt_diff = user_angles.get("shoulder_tilt", 0) - effective_ref_angles.get("shoulder_tilt", 0)
        if abs(sh_tilt_diff) > 10.0:
            part_status["torso"] = "adjust"
            if sh_tilt_diff > 0:
                cues.append("Lower your right shoulder slightly")
            else:
                cues.append("Lower your left shoulder slightly")

        # 5. Distance check (torso scale in frame)
        # Using distance between left shoulder (11) and left hip (23)
        ref_torso_h = abs(ref_landmarks[23]["y"] - ref_landmarks[11]["y"])
        user_torso_h = abs(user_landmarks[23]["y"] - user_landmarks[11]["y"])
        if ref_torso_h > 0.05 and user_torso_h > 0.05:
            ratio = user_torso_h / ref_torso_h
            if ratio < 0.75:
                cues.append("Step a little closer to the camera")
            elif ratio > 1.35:
                cues.append("Step back from the camera")

        # 6. Compare Legs
        l_knee_diff = abs(user_angles.get("left_knee", 0) - effective_ref_angles.get("left_knee", 0))
        r_knee_diff = abs(user_angles.get("right_knee", 0) - effective_ref_angles.get("right_knee", 0))
        if l_knee_diff > 25.0 or r_knee_diff > 25.0:
            part_status["legs"] = "adjust"
            cues.append("Adjust your leg stance or bend")

        # Calculate mathematical similarity score using bone vector cosine similarities
        # Connections: (11,12) shoulders, (11,13) left upper arm, (13,15) left forearm,
        # (12,14) right upper arm, (14,16) right forearm, (11,23) left torso, (12,24) right torso,
        # (23,24) hips, (23,25) left thigh, (25,27) left calf, (24,26) right thigh, (26,28) right calf
        bone_connections = [
            (11, 12, 1.0), # shoulders
            (11, 13, 1.2), # left upper arm
            (13, 15, 1.2), # left forearm
            (12, 14, 1.2), # right upper arm
            (14, 16, 1.2), # right forearm
            (11, 23, 1.0), # left torso
            (12, 24, 1.0), # right torso
            (23, 24, 1.0), # hips
            (23, 25, 1.0), # left thigh
            (25, 27, 1.0), # left calf
            (24, 26, 1.0), # right thigh
            (26, 28, 1.0), # right calf
        ]

        bone_similarities = []
        weights = []

        for idx_a, idx_b, weight in bone_connections:
            # Reference bone vector
            ref_dx = ref_landmarks[idx_b]["x"] - ref_landmarks[idx_a]["x"]
            ref_dy = ref_landmarks[idx_b]["y"] - ref_landmarks[idx_a]["y"]
            ref_len = math.sqrt(ref_dx**2 + ref_dy**2) + 1e-6

            # User bone vector
            usr_dx = user_landmarks[idx_b]["x"] - user_landmarks[idx_a]["x"]
            usr_dy = user_landmarks[idx_b]["y"] - user_landmarks[idx_a]["y"]
            usr_len = math.sqrt(usr_dx**2 + usr_dy**2) + 1e-6

            # Cosine similarity between bone orientations (-1 to 1)
            dot = (ref_dx * usr_dx + ref_dy * usr_dy) / (ref_len * usr_len)
            cos_sim = max(-1.0, min(1.0, dot))
            # Map [-1, 1] to [0, 1]
            bone_score = (cos_sim + 1.0) / 2.0
            bone_similarities.append(bone_score * weight)
            weights.append(weight)

        weighted_sim = sum(bone_similarities) / sum(weights)
        # Apply gentle non-linear curve so good poses read 80-95%
        sim_percentage = (weighted_sim ** 1.3) * 100.0
        similarity_score = round(max(0.0, min(100.0, sim_percentage)), 1)

        is_aligned = similarity_score >= 82.0 and len([c for c in cues if "Straighten" in c or "Raise" in c or "Tilt" in c]) == 0

        if len(cues) == 0:
            cues.append("Great alignment! Hold the pose and capture!")

        return {
            "similarity_score": similarity_score,
            "is_aligned": is_aligned,
            "cues": cues[:3],  # top 3 most important directional cues
            "part_status": part_status
        }
