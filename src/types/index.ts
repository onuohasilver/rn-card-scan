export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';

export type ScanStatus = 'success' | 'manual_required' | 'failed';

export type CardScanErrorCode =
  | 'CAMERA_PERMISSION'
  | 'TIMEOUT'
  | 'LOW_LIGHT'
  | 'NO_CARD'
  | 'LIVENESS_FAILED'
  | 'INTERNAL';

export type LivenessCheckName =
  | 'glare_consistency'
  | 'edge_parallax'
  | 'screen_recapture'
  | 'active_challenge';

export interface LivenessCheckResult {
  name: LivenessCheckName;
  passed: boolean;
  confidence: number;
  reason?: string;
}

export interface CardFields {
  pan?: string;
  expiryMonth?: number;
  expiryYear?: number;
  cardholderName?: string;
  cvv?: string;
  brand?: CardBrand;
}

export interface CardScanConfidence {
  panRead: number;
  expiryRead: number;
  liveness: number;
  overall: number;
}

export interface CardScanTimings {
  total: number;
  detection: number;
  ocr: number;
  liveness: number;
}

export interface CardScanResult {
  status: ScanStatus;
  fields: CardFields;
  confidence: CardScanConfidence;
  liveness: {
    passed: boolean;
    checks: LivenessCheckResult[];
  };
  captureDiagnostics: {
    frameCountUsed: number;
    sharpnessScore: number;
    exposureScore: number;
    glareScore: number;
    parallaxScore: number;
    recaptureScore: number;
    challengeTriggered: boolean;
    failureReasons: string[];
  };
  riskFlags: string[];
  reasons: string[];
  timingsMs: CardScanTimings;
}

export interface CardScanError {
  code: CardScanErrorCode;
  message: string;
  retryable: boolean;
}

export interface CardScanOptions {
  requireLiveness?: boolean;
  timeoutMs?: number;
  allowedCardBrands?: CardBrand[];
  captureMode?: 'auto' | 'manual';
  burstCount?: number;
  enableActiveChallengeOnSuspicion?: boolean;
  livenessStrictness?: 'standard' | 'high';
  /** Automatically scan the back of the card for the CVV after the front scan succeeds. Default: true. */
  captureBackForCvv?: boolean;
  /** How long (ms) to wait after showing the "flip your card" prompt before auto-capturing the back. Default: 2500. Ignored when `waitForBackTrigger` is supplied. */
  flipPauseMs?: number;
  /**
   * Optional async hook that gates the back-of-card capture. When provided,
   * the SDK awaits this Promise instead of running `flipPauseMs` on a timer
   * — letting the host implement a "tap to capture the back" UX. Resolve
   * when the user is ready; reject to skip the back capture entirely.
   */
  waitForBackTrigger?: () => Promise<void>;
  debugDiagnostics?: boolean;
  collectName?: boolean;
  collectExpiry?: boolean;
  enableTorchToggle?: boolean;
  uiMode?: 'fullscreen' | 'embedded';
  showTorchControl?: boolean;
  showCancelControl?: boolean;
  showHintText?: boolean;
  debugMode?: boolean;
  onProgress?: (stage: string, metrics?: Record<string, number | string | boolean>) => void;
  onAutoCapture?: (frameMeta: Record<string, number | string | boolean>) => void;
  onResult?: (result: CardScanResult) => void;
  onError?: (error: CardScanError) => void;
}

export interface NormalizedCardScanOptions {
  requireLiveness: boolean;
  timeoutMs: number;
  allowedCardBrands: CardBrand[];
  captureMode: 'auto' | 'manual';
  burstCount: number;
  enableActiveChallengeOnSuspicion: boolean;
  livenessStrictness: 'standard' | 'high';
  captureBackForCvv: boolean;
  flipPauseMs: number;
  debugDiagnostics: boolean;
  collectName: boolean;
  collectExpiry: boolean;
  enableTorchToggle: boolean;
  uiMode: 'fullscreen' | 'embedded';
  showTorchControl: boolean;
  showCancelControl: boolean;
  showHintText: boolean;
  debugMode: boolean;
  onProgress?: CardScanOptions['onProgress'];
  onAutoCapture?: CardScanOptions['onAutoCapture'];
  onResult?: CardScanOptions['onResult'];
  onError?: CardScanOptions['onError'];
}

export interface ParsedCardFields {
  pan?: string;
  expiryMonth?: number;
  expiryYear?: number;
  cardholderName?: string;
  cvv?: string;
  brand: CardBrand;
}

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
  brand: CardBrand;
}

export interface OcrPayload {
  panCandidate?: string;
  expiryCandidate?: string;
  nameCandidate?: string;
  cvvCandidate?: string;
  panConfidence?: number;
  expiryConfidence?: number;
}

export interface LivenessInput {
  glareScore: number;
  edgeParallaxScore: number;
  screenRecaptureScore: number;
  challengeTriggered?: boolean;
  challengePassed?: boolean;
}

export interface ScanInput {
  ocr: OcrPayload;
  liveness: LivenessInput;
  captureDiagnostics?: Partial<CardScanResult['captureDiagnostics']>;
  timingsMs?: Partial<CardScanTimings>;
}

export interface ScanDecisionInput {
  validation: ValidationResult;
  parsed: ParsedCardFields;
  panConfidence: number;
  expiryConfidence: number;
  livenessChecks: LivenessCheckResult[];
  timingsMs: CardScanTimings;
  requireLiveness: boolean;
  captureDiagnostics?: Partial<CardScanResult['captureDiagnostics']>;
  livenessStrictness: 'standard' | 'high';
}

export interface CardScanHealth {
  sdk: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  turboModuleAvailable: boolean;
  ocrEngine: string;
}
