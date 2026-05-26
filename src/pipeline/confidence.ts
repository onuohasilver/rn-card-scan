import type { ScanDecisionInput, CardScanResult } from '../types';
import { livenessConfidence, livenessPassed } from './liveness';

const SUCCESS_THRESHOLD_STANDARD = 0.8;
const SUCCESS_THRESHOLD_HIGH = 0.86;
const MANUAL_THRESHOLD = 0.55;
const HARD_LIVENESS_FAIL_THRESHOLD_STANDARD = 0.45;
const HARD_LIVENESS_FAIL_THRESHOLD_HIGH = 0.52;
const EXPOSED_PAN_THRESHOLD = 0.8;

export function buildScanResult(input: ScanDecisionInput): CardScanResult {
  const panRead = clamp(input.panConfidence);
  const expiryRead = clamp(input.expiryConfidence);
  const liveConfidence = livenessConfidence(input.livenessChecks);
  const livePassed = livenessPassed(input.livenessChecks);

  const overall = input.requireLiveness
    ? weighted([panRead, expiryRead, liveConfidence], [0.45, 0.2, 0.35])
    : weighted([panRead, expiryRead], [0.7, 0.3]);

  const reasons = [...input.validation.reasons];
  const riskFlags: string[] = [];
  const strictness = input.livenessStrictness;
  const successThreshold = strictness === 'high' ? SUCCESS_THRESHOLD_HIGH : SUCCESS_THRESHOLD_STANDARD;
  const hardLivenessFailThreshold =
    strictness === 'high' ? HARD_LIVENESS_FAIL_THRESHOLD_HIGH : HARD_LIVENESS_FAIL_THRESHOLD_STANDARD;

  if (!livePassed && input.requireLiveness) {
    reasons.push('LIVENESS_FAILED');
    riskFlags.push('MANUAL_REVIEW_LIVENESS');
  }

  if (panRead < 0.8) {
    reasons.push('PAN_LOW_CONFIDENCE');
  }

  if (expiryRead < 0.7) {
    reasons.push('EXPIRY_LOW_CONFIDENCE');
  }

  let status: CardScanResult['status'];

  if (input.validation.valid && livePassed && overall >= successThreshold) {
    status = 'success';
  } else if (input.requireLiveness && !livePassed && liveConfidence < hardLivenessFailThreshold) {
    status = 'failed';
  } else if (overall >= MANUAL_THRESHOLD) {
    status = 'manual_required';
    riskFlags.push('MANUAL_ENTRY_REQUIRED');
  } else {
    status = 'failed';
  }

  if (status !== 'success' && !riskFlags.includes('RISK_ELEVATED')) {
    riskFlags.push('RISK_ELEVATED');
  }

  const shouldExposePan =
    Boolean(input.parsed.pan) &&
    input.validation.valid &&
    (status === 'success' || panRead >= EXPOSED_PAN_THRESHOLD);
  const exposedPan = shouldExposePan ? input.parsed.pan : undefined;
  const exposedBrand = shouldExposePan ? input.validation.brand : undefined;

  if (input.parsed.pan && !shouldExposePan) {
    reasons.push(input.validation.valid ? 'PAN_SUPPRESSED_LOW_CONFIDENCE' : 'PAN_SUPPRESSED_INVALID');
  }

  return {
    status,
    fields: {
      pan: exposedPan,
      expiryMonth: input.parsed.expiryMonth,
      expiryYear: input.parsed.expiryYear,
      cardholderName: input.parsed.cardholderName,
      cvv: input.parsed.cvv,
      brand: exposedBrand,
    },
    confidence: {
      panRead,
      expiryRead,
      liveness: liveConfidence,
      overall,
    },
    liveness: {
      passed: livePassed,
      checks: input.livenessChecks,
    },
    captureDiagnostics: {
      frameCountUsed: Math.max(1, input.captureDiagnostics?.frameCountUsed ?? 1),
      sharpnessScore: clamp(input.captureDiagnostics?.sharpnessScore ?? panRead),
      exposureScore: clamp(input.captureDiagnostics?.exposureScore ?? expiryRead),
      glareScore: clamp(input.captureDiagnostics?.glareScore ?? 0),
      parallaxScore: clamp(input.captureDiagnostics?.parallaxScore ?? 0),
      recaptureScore: clamp(input.captureDiagnostics?.recaptureScore ?? 1 - liveConfidence),
      challengeTriggered: Boolean(input.captureDiagnostics?.challengeTriggered),
      failureReasons: dedupe(input.captureDiagnostics?.failureReasons ?? []),
    },
    riskFlags,
    reasons: dedupe(reasons),
    timingsMs: input.timingsMs,
  };
}

function weighted(values: number[], weights: number[]): number {
  const numerator = values.reduce((sum, v, idx) => sum + v * (weights[idx] ?? 0), 0);
  const denominator = weights.reduce((sum, w) => sum + w, 0);
  return denominator === 0 ? 0 : clamp(numerator / denominator);
}

function clamp(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
