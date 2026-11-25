import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

// Determine initial backend URL automatically based on Expo Metro host IP
const getDefaultBackendUrl = (): string => {
  try {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
      (Constants as any)?.manifest?.debuggerHost;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        return `http://${ip}:8000`;
      }
    }
  } catch {
    // fallback
  }
  return 'http://10.244.68.241:8000';
};

let BACKEND_URL = getDefaultBackendUrl();

export const setBackendUrl = (url: string) => {
  BACKEND_URL = url.trim().replace(/\/+$/, '');
};

export const getBackendUrl = () => BACKEND_URL;

export interface DetectedPerson {
  id: number;
  bbox: { x: number; y: number; width: number; height: number };
  normalized_bbox: { x: number; y: number; width: number; height: number };
}

export interface AnalyzeReferenceResponse {
  status: string;
  width: number;
  height: number;
  multiple_persons: boolean;
  persons: DetectedPerson[];
  ghost_overlay: string; // base64 PNG data URI
  original_image: string; // base64 JPEG data URI
  landmarks: Array<{ x: number; y: number; z: number; visibility: number }>;
  bbox: { x_min: number; y_min: number; x_max: number; y_max: number };
  angles: Record<string, number>;
  head_orientation: {
    yaw: number;
    roll: number;
    pitch: number;
    direction: string;
  };
}

export interface ComparePoseResponse {
  similarity_score: number;
  is_aligned: boolean;
  cues: string[];
  part_status: {
    head: string;
    left_arm: string;
    right_arm: string;
    torso: string;
    legs: string;
  };
  user_landmarks?: Array<{ x: number; y: number; z: number; visibility: number }>;
}

export interface RecreatePhotoResponse {
  status: string;
  recreated_image: string;
  user_cutout: string;
  width: number;
  height: number;
}

export const checkHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BACKEND_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
};

export const analyzeReferencePhoto = async (
  imageUri: string,
  preloadedBase64?: string
): Promise<AnalyzeReferenceResponse> => {
  let base64 = preloadedBase64;
  if (!base64) {
    base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const formData = new FormData();
  formData.append('image_base64', base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`);

  const res = await fetch(`${BACKEND_URL}/api/analyze-reference`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to analyze reference photograph' }));
    throw new Error(err.detail || 'Analysis error');
  }

  return res.json();
};

export const compareLivePose = async (
  refLandmarks: any[],
  refAngles: Record<string, number>,
  userImageUri?: string,
  mirrorMode: boolean = false
): Promise<ComparePoseResponse> => {
  let userB64: string | undefined = undefined;
  if (userImageUri) {
    const base64 = await FileSystem.readAsStringAsync(userImageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    userB64 = `data:image/jpeg;base64,${base64}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/compare-pose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref_landmarks: refLandmarks,
      ref_angles: refAngles,
      user_image_base64: userB64,
      mirror_mode: mirrorMode,
    }),
  });

  if (!res.ok) {
    throw new Error('Pose comparison failed');
  }

  return res.json();
};

export const recreatePhoto = async (
  refImageBase64: string,
  userImageUri: string,
  options: {
    refBbox?: any;
    xOffsetPct?: number;
    yOffsetPct?: number;
    scaleMult?: number;
    lightingStrength?: number;
    userBase64?: string;
  } = {}
): Promise<RecreatePhotoResponse> => {
  let userBase64Raw = options.userBase64;
  if (!userBase64Raw) {
    userBase64Raw = await FileSystem.readAsStringAsync(userImageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const userImagePayload = userBase64Raw.startsWith('data:')
    ? userBase64Raw
    : `data:image/jpeg;base64,${userBase64Raw}`;

  const res = await fetch(`${BACKEND_URL}/api/recreate-photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref_image_base64: refImageBase64,
      user_image_base64: userImagePayload,
      ref_bbox: options.refBbox,
      x_offset_pct: options.xOffsetPct || 0.0,
      y_offset_pct: options.yOffsetPct || 0.0,
      scale_mult: options.scaleMult || 1.0,
      lighting_strength: options.lightingStrength ?? 0.65,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Recreation failed' }));
    throw new Error(err.detail || 'Recreation failed');
  }

  return res.json();
};

export const exportComposite = async (
  recreatedImageBase64: string,
  refImageBase64?: string,
  layout: 'single' | 'side_by_side' = 'single'
): Promise<string> => {
  const res = await fetch(`${BACKEND_URL}/api/export-composite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recreated_image_base64: recreatedImageBase64,
      ref_image_base64: refImageBase64,
      layout,
    }),
  });

  if (!res.ok) {
    throw new Error('Export failed');
  }

  const data = await res.json();
  return data.export_image;
};
