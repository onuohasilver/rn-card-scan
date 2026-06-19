import type { CardScanOptions, CardScanResult } from '../types';
import { runScanPipeline } from '../pipeline/scan';
import { inferCardBrand } from '../utils/pan';
import { getCaptureAdapter } from './runtime';
import { fuseCardCandidates, recognizeCardFrame, type PositionedLine } from './ocr';

export async function captureCardWithJsRuntime(options: CardScanOptions = {}): Promise<CardScanResult> {
  const adapter = getCaptureAdapter();
  if (!adapter) {
    throw new Error('No active CardScannerView camera adapter found. Render CardScannerView before captureCard().');
  }

  const started = Date.now();
  options.onProgress?.('capture_started');

  const burstCount = Math.max(1, Math.min(8, options.burstCount ?? 5));
  const photos =
    options.captureMode === 'manual' || !adapter.captureBurst
      ? [await adapter.capturePhoto()]
      : await adapter.captureBurst(burstCount);

  if (photos.length === 0) {
    throw new Error('No frames captured. Hold card inside frame and try again.');
  }

  const linesByFrame: string[][] = [];
  const positionedLinesByFrame: PositionedLine[][] = [];
  let nativeSharpnessTotal = 0;
  let nativeExposureTotal = 0;
  let nativeGlareTotal = 0;
  let nativeRecaptureTotal = 0;
  let nativeDiagCount = 0;
  for (const [index, photo] of photos.entries()) {
    options.onAutoCapture?.({ uri: photo.uri, index });
    const frame = await recognizeCardFrame(photo.uri);
    linesByFrame.push(frame.lines);
    if (frame.positionedLines) {
      positionedLinesByFrame.push(frame.positionedLines);
    }
    if (frame.diagnostics) {
      nativeSharpnessTotal += frame.diagnostics.sharpnessScore;
      nativeExposureTotal += frame.diagnostics.exposureScore;
      nativeGlareTotal += frame.diagnostics.glareScore;
      nativeRecaptureTotal += frame.diagnostics.recaptureScore;
      nativeDiagCount += 1;
    }
  }

  const hasPositions = positionedLinesByFrame.length === linesByFrame.length;
  const parsed = fuseCardCandidates(
    linesByFrame,
    hasPositions ? positionedLinesByFrame : undefined
  );

  // ── Back-of-card CVV capture ──────────────────────────────────────────────
  // Amex prints the CID on the front; all other networks (Visa, Mastercard,
  // Discover) print the CVV on the back. Skip the flip for Amex.
  const frontBrand = parsed.panCandidate ? inferCardBrand(parsed.panCandidate) : 'other';
  const shouldScanBack =
    (options.captureBackForCvv ?? true) &&
    Boolean(parsed.panCandidate) &&
    frontBrand !== 'amex';

  let backCvvCandidate: string | undefined;

  if (shouldScanBack) {
    const flipPauseMs = options.flipPauseMs ?? 2500;
    options.onProgress?.('flip_card', { pauseMs: flipPauseMs });
    await new Promise<void>((resolve) => { setTimeout(resolve, flipPauseMs); });

    // Back-of-card is entirely optional and best-effort. The CVV is a nice-
    // to-have for autofill; ownership verification only needs PAN + expiry +
    // name from the front. Wrap the whole block in try/catch so any failure
    // (camera unavailable, MLKit empty, photo file unreadable, native error)
    // falls through to a front-only result instead of aborting the scan.
    try {
      // Hand control of the flip-pause to the host. Default is the old 2.5s
      // sleep; the host can supply a Promise that resolves on a user tap so
      // there is no on-screen timer.
      const waitForBackTrigger =
        options.waitForBackTrigger ??
        (() => new Promise<void>((resolve) => {
          setTimeout(resolve, flipPauseMs);
        }));
      await waitForBackTrigger();

      options.onProgress?.('capture_back');
      // Single back frame is plenty for a CVV (3-4 digits) and keeps memory
      // pressure low. Multi-frame back burst was over-eager.
      const backPhoto = await adapter.capturePhoto();
      options.onAutoCapture?.({ uri: backPhoto.uri, index: 0, side: 'back' });

      try {
        const frame = await recognizeCardFrame(backPhoto.uri);
        const backParsed = fuseCardCandidates([frame.lines]);
        backCvvCandidate = backParsed.cvvCandidate;
      } catch {
        // Back OCR is best-effort; CVV stays empty on failure.
      }
    } catch {
      // Back capture is best-effort; CVV stays empty on failure.
    }
    options.onProgress?.('back_complete', { cvvFound: Boolean(backCvvCandidate) });
  }
  // ─────────────────────────────────────────────────────────────────────────

  const strictness = options.livenessStrictness ?? 'standard';
  const suspicious =
    parsed.diagnostics.recaptureSuspicion > (strictness === 'high' ? 0.44 : 0.58) ||
    parsed.diagnostics.panSupportScore < (strictness === 'high' ? 0.4 : 0.3);
  const challengeTriggered = Boolean(options.enableActiveChallengeOnSuspicion ?? true) && suspicious;
  const challengePassed = !challengeTriggered || parsed.diagnostics.panSupportScore >= 0.5;
  const modelGlareScore = clamp(1 - parsed.diagnostics.ambiguityScore * 1.8);
  const parallaxScore = clamp(parsed.diagnostics.panSupportScore * 0.82 + (1 - parsed.diagnostics.recaptureSuspicion) * 0.18);
  const modelRecaptureScore = clamp(
    parsed.diagnostics.recaptureSuspicion * 0.75 + (1 - parsed.diagnostics.textDensityScore) * 0.25
  );
  const nativeSharpness = nativeDiagCount > 0 ? nativeSharpnessTotal / nativeDiagCount : undefined;
  const nativeExposure = nativeDiagCount > 0 ? nativeExposureTotal / nativeDiagCount : undefined;
  const nativeGlare = nativeDiagCount > 0 ? nativeGlareTotal / nativeDiagCount : undefined;
  const nativeRecapture = nativeDiagCount > 0 ? nativeRecaptureTotal / nativeDiagCount : undefined;
  const glareScore = nativeGlare !== undefined ? clamp(0.7 * nativeGlare + 0.3 * modelGlareScore) : modelGlareScore;
  const screenRecaptureScore =
    nativeRecapture !== undefined ? clamp(0.65 * nativeRecapture + 0.35 * modelRecaptureScore) : modelRecaptureScore;

  const result = await runScanPipeline(
    {
      ocr: {
        panCandidate: parsed.panCandidate,
        expiryCandidate: parsed.expiryCandidate,
        nameCandidate: parsed.nameCandidate,
        // Never fall back to a front-scan CVV when we already ran the back scan —
        // front-scan CVV candidates are usually PAN digit fragments.
        cvvCandidate: shouldScanBack ? backCvvCandidate : (backCvvCandidate ?? parsed.cvvCandidate),
        panConfidence: parsed.panConfidence,
        expiryConfidence: parsed.expiryConfidence,
      },
      liveness: {
        glareScore,
        edgeParallaxScore: parallaxScore,
        screenRecaptureScore,
        challengeTriggered,
        challengePassed,
      },
      captureDiagnostics: {
        frameCountUsed: photos.length,
        sharpnessScore:
          nativeSharpness !== undefined
            ? nativeSharpness
            : clamp(parsed.panConfidence * 0.75 + parsed.diagnostics.textDensityScore * 0.25),
        exposureScore:
          nativeExposure !== undefined
            ? nativeExposure
            : clamp(parsed.expiryConfidence * 0.6 + parsed.diagnostics.textDensityScore * 0.4),
        glareScore,
        parallaxScore,
        recaptureScore: screenRecaptureScore,
        challengeTriggered,
        failureReasons: buildFailureReasons({
          panCandidate: parsed.panCandidate,
          expiryCandidate: parsed.expiryCandidate,
          cvvCandidate: parsed.cvvCandidate,
          challengeTriggered,
          challengePassed,
          suspicious,
          screenRecaptureScore,
        }),
      },
      timingsMs: {
        total: Date.now() - started,
      },
    },
    options
  );

  return result;
}

function buildFailureReasons(input: {
  panCandidate?: string;
  expiryCandidate?: string;
  cvvCandidate?: string;
  challengeTriggered: boolean;
  challengePassed: boolean;
  suspicious: boolean;
  screenRecaptureScore: number;
}): string[] {
  const reasons: string[] = [];

  if (!input.panCandidate) {
    reasons.push('PAN_MISSING');
  }
  if (!input.expiryCandidate) {
    reasons.push('EXPIRY_MISSING');
  }
  if (!input.cvvCandidate) {
    reasons.push('CVV_MISSING');
  }
  if (input.suspicious) {
    reasons.push('PASSIVE_LIVENESS_SUSPICIOUS');
  }
  if (input.screenRecaptureScore > 0.5) {
    reasons.push('SCREEN_RECAPTURE_SUSPECTED');
  }
  if (input.challengeTriggered && !input.challengePassed) {
    reasons.push('ACTIVE_CHALLENGE_FAILED');
  }

  return [...new Set(reasons)];
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
