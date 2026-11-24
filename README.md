# AI Pose Reference & Photo Recreation Studio

A professional mobile application and computer vision backend engineered to help anyone take attractive, natural photographs by recreating poses from reference images.

Whether you find an aesthetic mirror selfie on Pinterest, a portrait on Instagram, or a dynamic pose in a social screenshot, **Pose Studio** allows you to accurately reproduce the pose in your own space or place yourself directly into the original scene.

---

## Architecture Overview

```
pose-recreation-app/
├── backend/                  # Python 3.11 Computer Vision Backend
│   ├── .venv/                # Dedicated isolated virtual environment
│   ├── models/               # Cached pretrained weights (u2net_human_seg)
│   ├── pose_engine.py        # 33-Keypoint MediaPipe pose estimation & guidance
│   ├── matting_engine.py     # Clean human segmentation & alpha extraction
│   ├── composite_engine.py   # CIELAB Reinhard lighting transfer & shadow synthesis
│   ├── main.py               # FastAPI REST endpoints
│   ├── test_backend.py       # Unit verification test suite
│   ├── test_full_workflow.py # Full E2E workflow integration test suite
│   └── requirements.txt      # Dependency specification
│
├── mobile/                   # Premium Expo React Native Mobile Client
│   ├── android/              # Native Android Gradle build files
│   ├── src/
│   │   ├── theme.ts          # Studio design system (Obsidian & Gold palette)
│   │   ├── api.ts            # Typed client for backend communication
│   │   └── screens/
│   │       ├── HomeScreen.tsx           # 3 Feature Cards
│   │       ├── PoseReferenceScreen.tsx  # Feature 1: Ghost overlay & live guidance
│   │       └── PhotoRecreationScreen.tsx# Feature 2: High-fidelity photo recreation
│   ├── App.tsx               # Main mobile entrypoint
│   └── package.json          # Mobile dependencies
│
├── start_backend.bat         # 1-Click backend launcher
└── start_mobile.bat          # 1-Click mobile launcher
```

---

## Features

### 1. Homepage (Three Feature Cards)
- **Option 1: Pose Reference Mode** (`Functional`)
- **Option 2: Photo Recreation Mode** (`Functional`)
- **Option 3: Coming Soon: AI Relighting & Style Studio** (`Disabled initially`)
- Live connection indicator with an IP Configuration dialog for emulator (`10.0.2.2`), USB ADB reverse (`localhost`), and physical WiFi devices (`192.168.x.x`).

### 2. Feature One — Pose Reference Mode
- **Universal Image Upload**: Supports Pinterest photos, screenshots, camera roll, WEBP, PNG, JPG.
- **Multi-Person Selection**: Detects if multiple people are in the reference photograph and allows the user to tap and choose the target subject.
- **Clean Transparent Matting**: Isolates the subject, preserving clothing, hair, and gestures while completely removing the original background.
- **Live Ghost Overlay**: Displays the semi-transparent reference subject over the live camera preview.
- **Interactive Controls**:
  - Opacity adjustment (0% to 100%)
  - Scale / Zoom (0.5x to 2.0x)
  - 4-way pan position shift
  - Mirror Selfie Mode toggle (horizontal flip for mirror captures)
  - Front / rear camera switching and flash controls
- **Real-Time AI Pose Alignment HUD**:
  - Live similarity match score (0% - 100%) computed via bone vector cosine orientations.
  - Actionable directional guidance ("Tilt head slightly to the left", "Raise your left elbow", "Step back").
  - Visual limb indicators (Head, Left Arm, Right Arm, Torso, Legs).
- **Capture & Review**:
  - Side-by-side or ghost overlay comparison.
  - Direct save to phone gallery and native share sheet.

### 3. Feature Two — Photo Recreation Mode
- **Original Background Preservation**: Keeps the complete original reference background without replacing it with synthetic AI artifacts.
- **Live Alignment Preview**: Semi-transparent reference scene overlay to assist in positioning.
- **Hair-Preserving Subject Matting**: Extracts the user from the newly captured photo using high-precision alpha matting.
- **Color & Lighting Harmonization**:
  - Applies Reinhard color transfer in CIELAB color space.
  - Harmonizes luminance ($L^*$) and chromatic channels ($a^*$, $b^*$) with the ambient lighting, color temperature, and contrast of the reference scene.
- **Ground Contact Shadow Synthesis**: Generates soft ambient occlusion contact shadows under feet/contact points for realistic grounding.
- **Interactive Fine-Tuning Studio**:
  - Split comparison slider (Original Reference vs Recreated).
  - Real-time adjustment of lighting match strength, subject scale, and positional offsets.
  - Instant re-composite with one tap.
  - High-resolution export, gallery save, and share.

---

## Setup & Running Instructions

### Prerequisites
- Node.js (v18+)
- Python 3.11
- Android Studio / Android SDK (for physical device or emulator)

### Step 1: Start the AI Backend
```bash
cd pose-recreation-app
start_backend.bat
```
*Or manually via PowerShell:*
```powershell
cd pose-recreation-app/backend
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
The backend initializes the MediaPipe Pose model, U2Net human segmentation model, and Reinhard compositing engine, listening on port `8000`.

### Step 2: Run the Mobile App

#### Option A: Running on Physical Android Phone via Expo Go
1. Connect your Android phone to the same Wi-Fi network as your PC.
2. In `pose-recreation-app`:
   ```bash
   start_mobile.bat
   ```
3. Open **Expo Go** on your Android phone and scan the displayed QR code.
4. On the app homepage, tap the status pill or settings gear in the top right and enter your PC's local IP (e.g. `http://192.168.1.50:8000`).

#### Option B: Running via USB ADB (Direct Cable Connection)
1. Enable USB Debugging on your Android phone.
2. Forward the backend port over USB:
   ```bash
   adb reverse tcp:8000 tcp:8000
   ```
3. Run the app:
   ```bash
   cd pose-recreation-app/mobile
   npx expo run:android
   ```

#### Option C: Building an Installable APK (Local Gradle)
```bash
cd pose-recreation-app/mobile/android
gradlew.bat assembleRelease
```
The standalone APK will be generated at:
`pose-recreation-app/mobile/android/app/build/outputs/apk/release/app-release.apk`.

---

## AI Models & Specifications

| Model | Purpose | Source / Version | License |
|---|---|---|---|
| **MediaPipe Pose** | 33 3D full-body landmarks, joint angles & head orientation | Google MediaPipe 0.10.14 | Apache 2.0 |
| **U2Net Human Seg** | Deep portrait matting, hair & clothing alpha segmentation | U2Net ONNX (cached in `models/`) | Apache 2.0 |
| **Reinhard Color Transfer** | CIELAB ambient color & lighting harmonization | OpenCV / NumPy implementation | Open Source |

---

## Verification & Test Results

All unit and integration tests passed cleanly:
- `test_backend.py`: Verified PoseEngine, MattingEngine, CompositeEngine, and angle calculations.
- `test_full_workflow.py`:
  - **Feature 1 Test**: Extracted reference ghost overlay PNG (170 KB), calculated 10 joint angles, detected left arm deviation, provided actionable cue `['Straighten your left arm slightly']`, verified 100% score on aligned pose.
  - **Feature 2 Test**: Clean user matting, perspective placement, contact shadow generation, verified pixel-accurate background preservation (`diff=0` on non-subject background pixels).
- **TypeScript & Metro Bundler**: 0 TypeScript errors (`tsc --noEmit`), successfully exported Hermes-optimized Android bundle (`dist/_expo/static/js/android/`).
