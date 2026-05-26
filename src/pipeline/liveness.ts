import type { LivenessCheckResult, LivenessInput } from '../types';

type LivenessStrictness = 'standard' | 'high';

export function runLivenessChecks(
  input: LivenessInput,
  options?: { strictness?: LivenessStrictness; challengeTriggered?: boolean }
): LivenessCheckResult[] {
  const strictness = options?.strictness ?? 'standard';
  // "high" uses what used to be standard; "standard" is tuned for real-world lighting
  // where 3/5 burst frames capturing the PAN should be sufficient.
  const glareMin = strictness === 'high' ? 0.65 : 0.5;
  const parallaxMin = strictness === 'high' ? 0.65 : 0.45;
  const screenMax = strictness === 'high' ? 0.4 : 0.6;

  const glarePassed = input.glareScore >= glareMin;
  const edgePassed = input.edgeParallaxScore >= parallaxMin;
  const screenPassed = input.screenRecaptureScore <= screenMax;

  const checks: LivenessCheckResult[] = [
    {
      name: 'glare_consistency',
      passed: glarePassed,
      confidence: clamp(input.glareScore),
      reason: glarePassed ? undefined : 'GLARE_PATTERN_INCONSISTENT',
    },
    {
      name: 'edge_parallax',
      passed: edgePassed,
      confidence: clamp(input.edgeParallaxScore),
      reason: edgePassed ? undefined : 'EDGE_PARALLAX_WEAK',
    },
    {
      name: 'screen_recapture',
      passed: screenPassed,
      confidence: 1 - clamp(input.screenRecaptureScore),
      reason: screenPassed ? undefined : 'SCREEN_RECAPTURE_SUSPECTED',
    },
  ];

  if (options?.challengeTriggered || input.challengeTriggered) {
    checks.push({
      name: 'active_challenge',
      passed: Boolean(input.challengePassed),
      confidence: input.challengePassed ? 0.9 : 0.25,
      reason: input.challengePassed ? undefined : 'ACTIVE_CHALLENGE_FAILED',
    });
  }

  return checks;
}

export function livenessConfidence(checks: LivenessCheckResult[]): number {
  if (checks.length === 0) {
    return 0;
  }

  const total = checks.reduce((sum, check) => sum + check.confidence, 0);
  return clamp(total / checks.length);
}

export function livenessPassed(checks: LivenessCheckResult[]): boolean {
  return checks.every((check) => check.passed);
}

function clamp(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
