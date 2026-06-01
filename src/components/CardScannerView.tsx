import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { normalizeOptions } from '../pipeline/options';
import type { CardScanOptions } from '../types';
import { registerCaptureAdapter } from '../capture/runtime';
import { recognizeCardFrame, extractCardCandidates } from '../capture/ocr';

export interface CardScannerViewProps {
  options?: CardScanOptions;
  fullscreen?: boolean;
  onCameraReady?: () => void;
  onCardDetected?: () => void;
  onStart?: () => void;
  onStop?: () => void;
  onCancel?: () => void;
}

type CameraRefLike = {
  takePictureAsync: (options?: Record<string, unknown>) => Promise<{ uri: string }>;
};

type PermissionState = {
  granted?: boolean;
};

type FrameState = 'searching' | 'ready' | 'needs_help';
const FOCUS_SETTLE_MS = 900;

function resolveCameraModule(): {
  CameraView?: React.ComponentType<Record<string, unknown> & { ref?: React.Ref<CameraRefLike> }>;
  useCameraPermissions?: () => [PermissionState | null, () => Promise<unknown>];
} {
  // expo-camera is an OPTIONAL peer dependency. Hosts that ship a different
  // camera stack (e.g. react-native-vision-camera) will not have it installed;
  // returning an empty module lets the SDK load without crashing the bundler.
  // The CardScannerView component then renders a placeholder until the host
  // wires in its own camera adapter.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo' + '-camera');
  } catch {
    return {};
  }
}

export function CardScannerView({
  options,
  fullscreen,
  onCameraReady,
  onCardDetected,
  onStart,
  onStop,
  onCancel,
}: CardScannerViewProps): React.ReactElement {
  const cameraRef = useRef<CameraRefLike | null>(null);
  const cameraReadyRef = useRef(false);
  const cameraReadyAtRef = useRef<number | null>(null);
  const focusReadyRef = useRef(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraModule = resolveCameraModule();
  const CameraView = cameraModule.CameraView;
  const useCameraPermissions =
    cameraModule.useCameraPermissions ??
    (() => [{ granted: false } as PermissionState, async () => Promise.resolve()]);

  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [focusReady, setFocusReady] = useState(false);
  const [frameState, setFrameState] = useState<FrameState>('searching');

  const onCardDetectedRef = useRef(onCardDetected);
  onCardDetectedRef.current = onCardDetected;
  const detectionFiredRef = useRef(false);
  const consecutiveHitsRef = useRef(0);
  const isCapturingRef = useRef(false);

  const normalized = useMemo(() => {
    const base = normalizeOptions(options);
    if (typeof fullscreen === 'boolean') {
      return {
        ...base,
        uiMode: fullscreen ? 'fullscreen' : 'embedded' as 'fullscreen' | 'embedded',
      };
    }

    return base;
  }, [options, fullscreen]);

  useEffect(() => {
    cameraReadyRef.current = false;
    cameraReadyAtRef.current = null;
    focusReadyRef.current = false;
    setCameraReady(false);
    setFocusReady(false);

    registerCaptureAdapter({
      capturePhoto: async () => {
        if (!cameraRef.current) {
          throw new Error('Camera ref unavailable.');
        }
        isCapturingRef.current = true;
        try {
          await waitForCameraStability(cameraReadyRef, cameraReadyAtRef, focusReadyRef);
          return await cameraRef.current.takePictureAsync({
            quality: 1,
            skipProcessing: false,
            shutterSound: false,
          });
        } finally {
          isCapturingRef.current = false;
        }
      },
      captureBurst: async (count: number) => {
        const frames: Array<{ uri: string }> = [];
        const burstCount = Math.max(1, Math.min(8, count));
        isCapturingRef.current = true;
        try {
          await waitForCameraStability(cameraReadyRef, cameraReadyAtRef, focusReadyRef);
          for (let i = 0; i < burstCount; i += 1) {
            if (!cameraRef.current) {
              break;
            }

            const frame = await cameraRef.current.takePictureAsync({
              quality: 1,
              skipProcessing: false,
              shutterSound: false,
            });
            frames.push(frame);
            await sleep(220);
          }
        } finally {
          isCapturingRef.current = false;
        }

        return frames;
      },
    });

    onStart?.();

    return () => {
      registerCaptureAdapter(null);
      onStop?.();
    };
  }, [onStart, onStop]);

  useEffect(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    if (!permission?.granted) {
      cameraReadyRef.current = false;
      cameraReadyAtRef.current = null;
      focusReadyRef.current = false;
      setCameraReady(false);
      setFocusReady(false);
      setFrameState('needs_help');
      return;
    }

    if (!cameraReady || !focusReady) {
      setFrameState('searching');
      return;
    }

    setFrameState('searching');
    const timer = setTimeout(() => setFrameState('ready'), 450);
    return () => clearTimeout(timer);
  }, [cameraReady, focusReady, permission?.granted]);

  useEffect(() => {
    if (!cameraReady) {
      focusReadyRef.current = false;
      setFocusReady(false);
      return;
    }

    focusReadyRef.current = false;
    setFocusReady(false);

    focusTimerRef.current = setTimeout(() => {
      focusReadyRef.current = true;
      setFocusReady(true);
      onCameraReady?.();
    }, FOCUS_SETTLE_MS);

    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [cameraReady, torchEnabled, onCameraReady]);

  // Auto-detection loop: polls camera at low quality, fires onCardDetected when
  // a PAN is found in two consecutive frames.
  useEffect(() => {
    if (!focusReady || !onCardDetectedRef.current) return;

    detectionFiredRef.current = false;
    consecutiveHitsRef.current = 0;
    let cancelled = false;

    const runLoop = async () => {
      while (!cancelled && !detectionFiredRef.current) {
        await sleep(750);
        if (cancelled || detectionFiredRef.current || !cameraRef.current) continue;
        // Skip this tick if a full burst capture is already running
        if (isCapturingRef.current) {
          consecutiveHitsRef.current = 0;
          continue;
        }

        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.25,
            skipProcessing: true,
            shutterSound: false,
          });
          if (cancelled || detectionFiredRef.current || isCapturingRef.current) break;

          const frame = await recognizeCardFrame(photo.uri);
          const parsed = extractCardCandidates(frame.lines);

          if (parsed.panCandidate) {
            consecutiveHitsRef.current += 1;
            if (consecutiveHitsRef.current >= 3 && !isCapturingRef.current) {
              // Brief pause so the card is steady before burst capture starts
              await sleep(600);
              if (!cancelled && !isCapturingRef.current) {
                detectionFiredRef.current = true;
                onCardDetectedRef.current?.();
              }
              break;
            }
          } else {
            consecutiveHitsRef.current = 0;
          }
        } catch {
          consecutiveHitsRef.current = 0;
        }
      }
    };

    void runLoop();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReady]);

  const TextComponent = Text as unknown as React.ComponentType<Record<string, unknown>>;
  const ViewComponent = View as unknown as React.ComponentType<Record<string, unknown>>;
  const SafeAreaComponent = SafeAreaView as unknown as React.ComponentType<Record<string, unknown>>;

  if (!CameraView) {
    return React.createElement(TextComponent, { style: styles.error }, '`expo-camera` is not installed in host app.');
  }

  if (!permission?.granted) {
    return React.createElement(
      ViewComponent,
      { style: [styles.permissionWrap, normalized.uiMode === 'fullscreen' ? styles.fullscreenRoot : styles.embeddedRoot] },
      React.createElement(
        TextComponent,
        { style: styles.permissionText },
        'Camera permission required for card capture.'
      ),
      React.createElement(
        TextComponent,
        {
          style: styles.permissionAction,
          onPress: () => {
            void requestPermission();
          },
        },
        'Grant Camera Access'
      )
    );
  }

  const hintText =
    frameState === 'ready'
      ? onCardDetectedRef.current
        ? 'Scanning for card… Hold steady.'
        : 'Card detected. Hold steady and tap Capture Card.'
      : cameraReady
        ? 'Align your physical card inside the frame.'
        : 'Starting camera…';

  const frameStyle =
    frameState === 'ready' ? styles.frameReady : frameState === 'needs_help' ? styles.frameWarn : styles.frameNeutral;

  return React.createElement(
    ViewComponent,
    { style: normalized.uiMode === 'fullscreen' ? styles.fullscreenRoot : styles.embeddedRoot },
    React.createElement(CameraView, {
      ref: cameraRef,
      style: styles.camera,
      facing: 'back',
      mode: 'picture',
      autofocus: 'on',
      animateShutter: false,
      enableTorch: torchEnabled,
      responsiveOrientationWhenOrientationLocked: true,
      pictureSize: Platform.OS === 'ios' ? 'High' : undefined,
      onCameraReady: () => {
        cameraReadyRef.current = true;
        cameraReadyAtRef.current = Date.now();
        setCameraReady(true);
      },
      onMountError: () => {
        cameraReadyRef.current = false;
        cameraReadyAtRef.current = null;
        focusReadyRef.current = false;
        setCameraReady(false);
        setFocusReady(false);
        setFrameState('needs_help');
      },
    }),
    React.createElement(
      SafeAreaComponent,
      { style: styles.overlayLayer, pointerEvents: 'box-none' },
      React.createElement(
        ViewComponent,
        { style: styles.topRow, pointerEvents: 'box-none' },
        normalized.showCancelControl
          ? React.createElement(
              TextComponent,
              {
                style: styles.controlButton,
                onPress: () => {
                  registerCaptureAdapter(null);
                  onCancel?.();
                },
              },
              'Cancel'
            )
          : React.createElement(ViewComponent, { style: styles.controlSpacer }),
        normalized.showTorchControl && normalized.enableTorchToggle
          ? React.createElement(
              TextComponent,
              {
                style: styles.controlButton,
                onPress: () => setTorchEnabled((prev) => !prev),
              },
              torchEnabled ? 'Torch On' : 'Torch Off'
            )
          : React.createElement(ViewComponent, { style: styles.controlSpacer })
      ),
      React.createElement(
        ViewComponent,
        { style: styles.centerZone, pointerEvents: 'none' },
        React.createElement(ViewComponent, { style: [styles.frameBase, frameStyle] })
      ),
      normalized.showHintText
        ? React.createElement(
            ViewComponent,
            { style: styles.bottomZone, pointerEvents: 'none' },
            React.createElement(TextComponent, { style: styles.hint }, hintText)
          )
        : null
    )
  );
}

const styles = StyleSheet.create({
  fullscreenRoot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  embeddedRoot: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
    height: 280,
    backgroundColor: '#000000',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  controlButton: {
    color: '#f8fafc',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '700',
  },
  controlSpacer: {
    width: 84,
    height: 30,
  },
  centerZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameBase: {
    width: '88%',
    maxWidth: 680,
    aspectRatio: 1.58,
    borderWidth: 2,
    borderRadius: 16,
    borderStyle: 'dashed',
  },
  frameNeutral: {
    borderColor: '#94a3b8',
  },
  frameReady: {
    borderColor: '#22c55e',
  },
  frameWarn: {
    borderColor: '#f59e0b',
  },
  bottomZone: {
    paddingBottom: 22,
    paddingHorizontal: 16,
  },
  hint: {
    color: '#f8fafc',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    textShadowColor: 'rgba(2, 6, 23, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  permissionWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    minHeight: 180,
    backgroundColor: '#0f172a',
    padding: 16,
    justifyContent: 'center',
    gap: 10,
  },
  permissionText: {
    color: '#cbd5e1',
    textAlign: 'center',
  },
  permissionAction: {
    color: '#22c55e',
    textAlign: 'center',
    fontWeight: '700',
  },
  error: {
    color: '#ef4444',
    fontSize: 12,
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForCameraStability(
  cameraReadyRef: React.MutableRefObject<boolean>,
  cameraReadyAtRef: React.MutableRefObject<number | null>,
  focusReadyRef: React.MutableRefObject<boolean>
): Promise<void> {
  const deadline = Date.now() + 2500;

  while (!cameraReadyRef.current && Date.now() < deadline) {
    await sleep(80);
  }

  while (!focusReadyRef.current && Date.now() < deadline) {
    await sleep(80);
  }

  const readyAt = cameraReadyAtRef.current;
  if (readyAt === null) {
    await sleep(FOCUS_SETTLE_MS);
    return;
  }

  const elapsed = Date.now() - readyAt;
  if (elapsed < FOCUS_SETTLE_MS) {
    await sleep(FOCUS_SETTLE_MS - elapsed);
  }
}
