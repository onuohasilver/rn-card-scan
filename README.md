# @onuohasilver/rn-card-scan

React Native SDK for card scanning with on-device OCR and liveness checks.

## Features

- On-device OCR parsing for PAN/expiry/name
- Baseline liveness checks (glare, edge-parallax, screen recapture)
- Confidence scoring and decisioning (`success`, `manual_required`, `failed`)
- Typed API for session lifecycle and host-app risk controls

## Install

```bash
yarn add git+ssh://git@github.com/onuohasilver/rn-card-scan.git
```

## Usage

```ts
import {
  CardScannerView,
  startCardScan,
  stopCardScan,
  getSdkHealth,
  validateCardFields,
  processScanInput,
} from '@onuohasilver/rn-card-scan';

const sessionId = await startCardScan({
  requireLiveness: true,
  timeoutMs: 10000,
  onResult: (result) => console.log(result.status),
});

// CardScannerView is fullscreen by default.
// For constrained surfaces (demo/sandbox), pass uiMode: 'embedded'.
// <CardScannerView options={{ uiMode: 'embedded' }} />

const result = await processScanInput({
  ocr: {
    panCandidate: '4111 1111 1111 1111',
    expiryCandidate: '12/29',
    nameCandidate: 'JANE DOE',
    panConfidence: 0.97,
    expiryConfidence: 0.9,
  },
  liveness: {
    glareScore: 0.9,
    edgeParallaxScore: 0.85,
    screenRecaptureScore: 0.15,
  },
});

await stopCardScan(sessionId);
const health = await getSdkHealth();
const validation = validateCardFields(result.fields);
```

## iOS

- Minimum iOS 15
- Podspec: `rn-card-scan.podspec`
- OCR backend: Google ML Kit Text Recognition (`GoogleMLKit/TextRecognition`) only
- Embossed-number capture uses extra contrast, sharpen, and center-band OCR passes before parsing

## Android

- Minimum API 26
- Gradle module under `android/`

## Security Defaults

- No frame persistence
- PAN redaction expected in logs
- Structured result output only
