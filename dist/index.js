"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CardScannerView: () => CardScannerView,
  captureCard: () => captureCard,
  getSdkHealth: () => getSdkHealth,
  processScanInput: () => processScanInput,
  startCardScan: () => startCardScan,
  stopCardScan: () => stopCardScan,
  validateCardFields: () => validateCardFields2
});
module.exports = __toCommonJS(index_exports);

// src/components/CardScannerView.tsx
var import_react = __toESM(require("react"));
var import_react_native2 = require("react-native");

// src/pipeline/options.ts
var ALL_BRANDS = ["visa", "mastercard", "amex", "discover", "other"];
function normalizeOptions(options = {}) {
  return {
    requireLiveness: options.requireLiveness ?? true,
    timeoutMs: options.timeoutMs ?? 1e4,
    allowedCardBrands: options.allowedCardBrands ?? [...ALL_BRANDS],
    captureMode: options.captureMode ?? "auto",
    burstCount: Math.max(1, Math.min(8, options.burstCount ?? 5)),
    enableActiveChallengeOnSuspicion: options.enableActiveChallengeOnSuspicion ?? true,
    livenessStrictness: options.livenessStrictness ?? "standard",
    captureBackForCvv: options.captureBackForCvv ?? true,
    flipPauseMs: Math.max(500, options.flipPauseMs ?? 2500),
    debugDiagnostics: options.debugDiagnostics ?? false,
    collectName: options.collectName ?? true,
    collectExpiry: options.collectExpiry ?? true,
    enableTorchToggle: options.enableTorchToggle ?? true,
    uiMode: options.uiMode ?? "fullscreen",
    showTorchControl: options.showTorchControl ?? true,
    showCancelControl: options.showCancelControl ?? true,
    showHintText: options.showHintText ?? true,
    debugMode: options.debugMode ?? false,
    onProgress: options.onProgress,
    onAutoCapture: options.onAutoCapture,
    onResult: options.onResult,
    onError: options.onError
  };
}

// src/capture/runtime.ts
var adapter = null;
function registerCaptureAdapter(nextAdapter) {
  adapter = nextAdapter;
}
function getCaptureAdapter() {
  return adapter;
}

// src/native/CardScanTurboModule.ts
var import_react_native = require("react-native");
var MODULE_NAME = "RNCardScanTurboModule";
var NativeCardScanModule = import_react_native.NativeModules[MODULE_NAME] ?? null;
function inferPlatform() {
  if (import_react_native.Platform.OS === "ios" || import_react_native.Platform.OS === "android" || import_react_native.Platform.OS === "web") {
    return import_react_native.Platform.OS;
  }
  return "unknown";
}

// src/utils/pan.ts
function sanitizePan(raw) {
  if (!raw) {
    return "";
  }
  const digits = raw.replace(/\D/g, "");
  return /^\d{15,16}$/.test(digits) ? digits : "";
}
function luhnCheck(pan) {
  if (!/^\d{12,19}$/.test(pan)) {
    return false;
  }
  let sum = 0;
  let shouldDouble = false;
  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let digit = Number.parseInt(pan.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}
function inferCardBrand(pan) {
  if (/^4\d{12}(\d{3})?(\d{3})?$/.test(pan)) {
    return "visa";
  }
  if (/^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7([01]\d{12}|20\d{12})))$/.test(pan)) {
    return "mastercard";
  }
  if (/^3[47]\d{13}$/.test(pan)) {
    return "amex";
  }
  if (/^(6011\d{12}|65\d{14}|64[4-9]\d{13})$/.test(pan)) {
    return "discover";
  }
  return "other";
}

// src/capture/ocr.ts
var CHAR_CONFUSION_MAP = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  B: "8",
  G: "6"
};
async function recognizeCardFrame(uri) {
  const recognizeCardTextFromImage = NativeCardScanModule?.recognizeCardTextFromImage;
  if (typeof recognizeCardTextFromImage !== "function") {
    throw new Error("Native ML Kit OCR unavailable. Build the host app with the rn-card-scan native module.");
  }
  const native = await recognizeCardTextFromImage(uri);
  return {
    lines: native.lines ?? [],
    positionedLines: (native.positionedLines ?? []).map((pl) => ({
      text: pl.text,
      yNorm: clamp(pl.yNorm)
    })),
    diagnostics: {
      sharpnessScore: clamp(native.sharpnessScore ?? 0),
      exposureScore: clamp(native.exposureScore ?? 0),
      glareScore: clamp(native.glareScore ?? 0),
      recaptureScore: clamp(native.recaptureScore ?? 0)
    }
  };
}
function extractCardCandidates(lines) {
  return fuseCardCandidates([lines]);
}
function fuseCardCandidates(linesByFrame, positionedLinesByFrame) {
  const frameCount = Math.max(1, linesByFrame.length);
  const panCandidatesByFrame = linesByFrame.map((lines) => extractPanCandidates(lines));
  const panScores = /* @__PURE__ */ new Map();
  for (const pans of panCandidatesByFrame) {
    const unique = [...new Set(pans)];
    for (const pan of unique) {
      const score = scorePan(pan);
      panScores.set(pan, (panScores.get(pan) ?? 0) + score);
    }
  }
  const bestPan = [...panScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const panSupport = bestPan ? panCandidatesByFrame.filter((framePans) => framePans.includes(bestPan)).length / frameCount : 0;
  const rawExpiryCandidates = linesByFrame.flatMap((lines) => extractExpiryCandidates(lines));
  const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
  const expiryCandidates = rawExpiryCandidates.filter((expiry) => {
    const compact = expiry.replace(/\D/g, "");
    if (bestPan && bestPan.includes(compact)) {
      return false;
    }
    const [mm, yy] = expiry.split("/");
    if (!mm || !yy || yy.length !== 2) {
      return false;
    }
    const year = 2e3 + Number.parseInt(yy, 10);
    if (year < currentYear - 2 || year > currentYear + 25) {
      return false;
    }
    return true;
  });
  const bestExpiry = pickMostFrequent(expiryCandidates);
  const expirySupport = bestExpiry ? expiryCandidates.filter((value) => value === bestExpiry).length / frameCount : 0;
  const nameCandidates = positionedLinesByFrame ? positionedLinesByFrame.flatMap((pLines) => extractNameCandidatesPositioned(pLines)) : linesByFrame.flatMap((lines) => extractNameCandidates(lines));
  const bestName = pickBestName(nameCandidates);
  const cvvCandidates = linesByFrame.flatMap((lines) => extractCvvCandidates(lines));
  const panLast4 = bestPan ? bestPan.slice(-4) : "";
  const filteredCvvCandidates = bestPan ? cvvCandidates.filter(
    (cvv) => !bestPan.endsWith(cvv) && !bestPan.endsWith(`0${cvv}`) && !panLast4.startsWith(cvv)
  ) : cvvCandidates;
  const bestCvv = pickMostFrequent(filteredCvvCandidates);
  const avgLineCount = linesByFrame.reduce((sum, frameLines) => sum + frameLines.filter(Boolean).length, 0) / frameCount;
  const textDensityScore = clamp((avgLineCount - 1) / 8);
  const ambiguityScore = clamp(computeAmbiguity(linesByFrame));
  const recaptureSuspicion = clamp(
    1 - (0.45 * panSupport + 0.25 * textDensityScore + 0.3 * (1 - ambiguityScore))
  );
  return {
    panCandidate: bestPan,
    expiryCandidate: bestExpiry,
    nameCandidate: bestName,
    cvvCandidate: bestCvv,
    panConfidence: clamp(bestPan ? 0.35 + panSupport * 0.45 + (luhnCheck(bestPan) ? 0.15 : 0) : 0.05),
    expiryConfidence: clamp(bestExpiry ? 0.28 + expirySupport * 0.55 + textDensityScore * 0.12 : 0.05),
    diagnostics: {
      frameCount,
      textDensityScore,
      panSupportScore: panSupport,
      expirySupportScore: expirySupport,
      ambiguityScore,
      recaptureSuspicion,
      panCandidatesByFrame
    }
  };
}
function extractPanCandidates(lines) {
  const weightedCandidates = /* @__PURE__ */ new Map();
  for (const line of lines) {
    addWeightedPanCandidates(weightedCandidates, line, 1);
    for (const token of line.split(/\s+/)) {
      if (token.length >= 10) {
        addWeightedPanCandidates(weightedCandidates, token, 0.7);
      }
    }
  }
  for (let i = 0; i < lines.length - 1; i += 1) {
    addWeightedPanCandidates(weightedCandidates, `${lines[i]} ${lines[i + 1]}`, 0.55);
  }
  for (const assembled of assemblePanFromChunks(lines)) {
    addWeightedPanCandidates(weightedCandidates, assembled, 0.8);
  }
  return [...weightedCandidates.entries()].filter(([pan]) => pan.length === 15 || pan.length === 16).filter(([pan]) => luhnCheck(pan) || inferCardBrand(pan) !== "other").sort((a, b) => scorePanCandidate(b[0], b[1]) - scorePanCandidate(a[0], a[1])).map(([pan]) => pan);
}
function assemblePanFromChunks(lines) {
  const rawChunks = [];
  const perLineChunks = [];
  let nextSource = 0;
  for (const line of lines) {
    const normalized = normalizeDigitLikeString(line);
    const lineChunks = [];
    for (const match of normalized.matchAll(/\d{3,4}/g)) {
      const text = match[0];
      const source = nextSource++;
      if (text.length === 4) {
        const chunk = { value: text, sourceIndex: source, sourceWidth: 4 };
        rawChunks.push(chunk);
        lineChunks.push(chunk);
      } else if (text.length === 3) {
        lineChunks.push({ value: text, sourceIndex: source, sourceWidth: 3 });
        for (let d = 0; d < 10; d += 1) {
          rawChunks.push({ value: `${d}${text}`, sourceIndex: source, sourceWidth: 3 });
        }
      }
    }
    if (lineChunks.length > 0) {
      perLineChunks.push(lineChunks);
    }
  }
  if (rawChunks.length < 4) {
    return [];
  }
  const results = /* @__PURE__ */ new Set();
  for (const ordered of perLineChunks) {
    if (ordered.length < 2) continue;
    const anchorVariants = [];
    const usedSources = new Set(ordered.map((c) => c.sourceIndex));
    const buildVariants = (idx, accum) => {
      if (idx === ordered.length) {
        anchorVariants.push({ digits: accum, usedSources });
        return;
      }
      const c = ordered[idx];
      if (c.value.length === 4) {
        buildVariants(idx + 1, accum + c.value);
      } else {
        for (let d = 0; d < 10; d += 1) {
          buildVariants(idx + 1, accum + `${d}${c.value}`);
        }
      }
    };
    buildVariants(0, "");
    const remainderChunks = rawChunks.filter(
      (c) => !usedSources.has(c.sourceIndex) && c.sourceWidth === 4
    );
    for (const anchor of anchorVariants) {
      const anchorLen = anchor.digits.length;
      if (anchorLen === 16) {
        tryAcceptPan(results, anchor.digits);
        continue;
      }
      if (anchorLen === 12) {
        for (const tail of remainderChunks) {
          tryAcceptPan(results, anchor.digits + tail.value);
        }
        continue;
      }
      if (anchorLen === 11) {
        for (const tail of remainderChunks) {
          tryAcceptWithSingleInsertion(results, anchor.digits + tail.value);
        }
        continue;
      }
      if (anchorLen === 8) {
        for (const a of remainderChunks) {
          for (const b of remainderChunks) {
            if (a.sourceIndex === b.sourceIndex) continue;
            tryAcceptPan(results, anchor.digits + a.value + b.value);
          }
        }
        continue;
      }
    }
  }
  if (results.size === 0) {
    if (rawChunks.length > 60) {
      return [];
    }
    const n = rawChunks.length;
    for (let i = 0; i < n; i += 1) {
      if (!isPanFirstGroup(rawChunks[i].value)) continue;
      for (let j = 0; j < n; j += 1) {
        if (rawChunks[j].sourceIndex === rawChunks[i].sourceIndex) continue;
        for (let k = 0; k < n; k += 1) {
          if (rawChunks[k].sourceIndex === rawChunks[i].sourceIndex || rawChunks[k].sourceIndex === rawChunks[j].sourceIndex) continue;
          for (let l = 0; l < n; l += 1) {
            if (rawChunks[l].sourceIndex === rawChunks[i].sourceIndex || rawChunks[l].sourceIndex === rawChunks[j].sourceIndex || rawChunks[l].sourceIndex === rawChunks[k].sourceIndex) continue;
            tryAcceptPan(
              results,
              rawChunks[i].value + rawChunks[j].value + rawChunks[k].value + rawChunks[l].value
            );
          }
        }
      }
    }
  }
  return [...results];
}
function tryAcceptPan(results, pan) {
  if (pan.length !== 16) return;
  if (!luhnCheck(pan)) return;
  if (inferCardBrand(pan) === "other") return;
  results.add(pan);
}
function tryAcceptWithSingleInsertion(results, partial) {
  if (partial.length !== 15) return;
  for (let pos = 0; pos <= 15; pos += 1) {
    for (let d = 0; d < 10; d += 1) {
      tryAcceptPan(results, partial.slice(0, pos) + d + partial.slice(pos));
    }
  }
}
function isPanFirstGroup(token) {
  if (token.length !== 4) return false;
  const first = token[0];
  const second = token[1];
  if (first === "4") return true;
  if (first === "5" && "12345".includes(second)) return true;
  if (first === "2" && "234567".includes(second)) return true;
  if (first === "3" && (second === "4" || second === "7")) return true;
  if (first === "6" && (second === "0" || second === "4" || second === "5")) return true;
  return false;
}
function extractExpiryCandidates(lines) {
  const preprocessed = lines.map(
    (line) => line.replace(/[|\\]/g, "/").replace(/l(?=\d)/g, "/")
  );
  const joined = preprocessed.map((line) => normalizeDigitLikeString(line)).join(" ");
  const matches = joined.match(/(0[1-9]|1[0-2])[\s\/\-\.]{0,2}(\d{2}|\d{4})/g) ?? [];
  return matches.map((raw) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 4) return void 0;
    const month = digits.slice(0, 2);
    const yearRaw = digits.slice(2, 6);
    const year = yearRaw.length === 4 ? yearRaw.slice(-2) : yearRaw;
    return `${month}/${year}`;
  }).filter((v) => v !== void 0);
}
function extractNameCandidates(lines) {
  return lines.map((line) => normalizeNameCandidate(line)).filter(Boolean);
}
function extractNameCandidatesPositioned(positionedLines) {
  return positionedLines.filter((pl) => pl.yNorm >= 0.4).flatMap((pl) => {
    const text = normalizeNameCandidate(pl.text);
    return text ? [{ text, yNorm: pl.yNorm }] : [];
  });
}
function pickBestName(candidates) {
  if (candidates.length === 0) return void 0;
  const normalised = candidates.map(
    (c) => typeof c === "string" ? { text: c, yNorm: 0.5 } : c
  );
  const counts = /* @__PURE__ */ new Map();
  const maxYNorm = /* @__PURE__ */ new Map();
  for (const { text, yNorm } of normalised) {
    counts.set(text, (counts.get(text) ?? 0) + 1);
    if ((maxYNorm.get(text) ?? 0) < yNorm) maxYNorm.set(text, yNorm);
  }
  const nameScore = (text) => {
    const words = text.split(" ");
    const [a, b] = words;
    const lengthOk = Boolean(a && b && a.length >= 2 && a.length <= 14 && b.length >= 2 && b.length <= 14);
    const yWeight = (maxYNorm.get(text) ?? 0.5) * 1;
    return (counts.get(text) ?? 0) * 0.4 + yWeight + (lengthOk ? 0.3 : 0);
  };
  const ranked = [...counts.keys()].sort((a, b) => nameScore(b) - nameScore(a));
  const best = ranked[0];
  if (!best || nameScore(best) < 1.4) return void 0;
  return best;
}
function extractCvvCandidates(lines) {
  const candidates = /* @__PURE__ */ new Set();
  for (const rawLine of lines) {
    const line = rawLine.toUpperCase().trim();
    if (!line) {
      continue;
    }
    for (const match of line.matchAll(/\b(?:CVV|CVC|CID|CVN|SEC(?:URITY)?(?:\s+CODE)?)\D{0,6}(\d{3,4})\b/g)) {
      const cvv = match[1];
      if (cvv?.length === 3) {
        candidates.add(cvv);
      }
    }
    const exactDigits = line.replace(/\s+/g, "");
    if (/^\d{3}$/.test(exactDigits)) {
      candidates.add(exactDigits);
    }
  }
  return [...candidates];
}
function normalizeDigitLikeString(value) {
  return value.toUpperCase().split("").map((char) => CHAR_CONFUSION_MAP[char] ?? char).join("");
}
function scorePan(pan) {
  let score = 1;
  if (luhnCheck(pan)) {
    score += 2.6;
  }
  const brand = inferCardBrand(pan);
  if (brand !== "other") {
    score += 0.6;
  } else {
    const first = pan[0];
    if (first === "1" || first === "7" || first === "8" || first === "9") {
      score -= 2.5;
    }
  }
  if (pan.length === 16) {
    score += 0.55;
  } else if (pan.length === 15) {
    score += 0.4;
  }
  return score;
}
function scorePanCandidate(pan, sourceWeight) {
  let score = scorePan(pan) + sourceWeight;
  if (/^(\d)\1+$/.test(pan)) {
    score -= 3;
  }
  if (/0123|1234|2345|3456|4567|5678|6789/.test(pan)) {
    score -= 0.8;
  }
  return score;
}
function addWeightedPanCandidates(candidates, pattern, sourceWeight) {
  const normalized = normalizeDigitLikeString(pattern);
  const compact = normalized.replace(/\D/g, "");
  if (compact.length === 16 || compact.length === 15) {
    addPanCandidate(candidates, compact, sourceWeight);
  }
  if (compact.length > 16) {
    for (let i = 0; i <= compact.length - 16; i += 1) {
      addPanCandidate(candidates, compact.slice(i, i + 16), sourceWeight - 0.35);
    }
    for (let i = 0; i <= compact.length - 15; i += 1) {
      addPanCandidate(candidates, compact.slice(i, i + 15), sourceWeight - 0.35);
    }
  }
}
function addPanCandidate(candidates, pan, sourceWeight) {
  const existingWeight = candidates.get(pan) ?? Number.NEGATIVE_INFINITY;
  if (sourceWeight > existingWeight) {
    candidates.set(pan, sourceWeight);
  }
}
function normalizeNameCandidate(rawLine) {
  const line = rawLine.trim().toUpperCase();
  if (!line || /\d/.test(line) || line.length > 40) {
    return void 0;
  }
  const words = line.match(/[A-Z]{2,}/g) ?? [];
  if (words.length < 2) {
    return void 0;
  }
  const joined = words.join(" ");
  if (isNonNameLabel(joined)) {
    return void 0;
  }
  const candidate = `${words[0]} ${words[1]}`;
  return isNonNameLabel(candidate) ? void 0 : candidate;
}
var NON_NAME_WORDS = /* @__PURE__ */ new Set([
  "VALID",
  "THRU",
  "GOOD",
  "MONTH",
  "YEAR",
  "CARD",
  "HOLDER",
  "BANK",
  "DEBIT",
  "CREDIT",
  "PREPAID",
  "PLATINUM",
  "GOLD",
  "WORLD",
  "ELECTRON",
  "BUSINESS",
  "SIGNATURE",
  "VISA",
  "MASTERCARD",
  "AMERICAN",
  "EXPRESS",
  "DISCOVER",
  "AMEX",
  "CVV",
  "CVC",
  "SECURITY",
  "AUTHORIZED",
  "SAVINGS",
  "UNION",
  "FINANCE",
  "FINANCIAL",
  "INTERNATIONAL",
  "LIMITED",
  "LTD",
  "PLC",
  "CORP",
  "TRUST",
  "MEMBER",
  "SINCE",
  "ACCOUNT",
  "NUMBER",
  "EXPIRES",
  "EXPIRY",
  "ISSUED",
  "ISSUER",
  "NETWORK",
  "SERVICES",
  "GROUP",
  // Date/validity labels that appear near the expiry on many cards
  "UNTIL",
  "FROM",
  "END",
  "DATE",
  "THROUGH",
  "START",
  "BEGINNING"
]);
function isNonNameWord(word) {
  if (NON_NAME_WORDS.has(word)) return true;
  for (const blocked of NON_NAME_WORDS) {
    if (blocked.length >= 4 && word.length >= 4 && word.includes(blocked)) return true;
    if (blocked.length >= 4 && word.length >= 3 && blocked.includes(word)) return true;
  }
  if (word.length >= 3 && !/[AEIOU]/.test(word)) return true;
  return false;
}
function isNonNameLabel(value) {
  return value.toUpperCase().split(/\s+/).some((word) => isNonNameWord(word));
}
function computeAmbiguity(linesByFrame) {
  const joined = linesByFrame.flat().join("").toUpperCase();
  if (!joined.length) {
    return 1;
  }
  const confusing = joined.match(/[OQDILZSBG]/g)?.length ?? 0;
  return confusing / joined.length;
}
function pickMostFrequent(values) {
  if (values.length === 0) {
    return void 0;
  }
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

// src/components/CardScannerView.tsx
var FOCUS_SETTLE_MS = 900;
function resolveCameraModule() {
  try {
    return require("react-native-vision-camera");
  } catch {
    return {};
  }
}
function CardScannerView({
  options,
  fullscreen,
  onCameraReady,
  onCardDetected,
  onStart,
  onStop,
  onCancel
}) {
  const cameraRef = (0, import_react.useRef)(null);
  const cameraReadyRef = (0, import_react.useRef)(false);
  const cameraReadyAtRef = (0, import_react.useRef)(null);
  const focusReadyRef = (0, import_react.useRef)(false);
  const focusTimerRef = (0, import_react.useRef)(null);
  const cameraModule = resolveCameraModule();
  const Camera = cameraModule.Camera;
  const useCameraDevice = cameraModule.useCameraDevice ?? ((_position) => null);
  const useCameraPermission = cameraModule.useCameraPermission ?? (() => ({
    hasPermission: false,
    requestPermission: async () => false
  }));
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const [torchEnabled, setTorchEnabled] = (0, import_react.useState)(false);
  const [cameraReady, setCameraReady] = (0, import_react.useState)(false);
  const [focusReady, setFocusReady] = (0, import_react.useState)(false);
  const [frameState, setFrameState] = (0, import_react.useState)("searching");
  const onCardDetectedRef = (0, import_react.useRef)(onCardDetected);
  onCardDetectedRef.current = onCardDetected;
  const detectionFiredRef = (0, import_react.useRef)(false);
  const consecutiveHitsRef = (0, import_react.useRef)(0);
  const isCapturingRef = (0, import_react.useRef)(false);
  const normalized = (0, import_react.useMemo)(() => {
    const base = normalizeOptions(options);
    if (typeof fullscreen === "boolean") {
      return {
        ...base,
        uiMode: fullscreen ? "fullscreen" : "embedded"
      };
    }
    return base;
  }, [options, fullscreen]);
  const photoToFrame = (photo) => ({
    uri: photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`
  });
  (0, import_react.useEffect)(() => {
    cameraReadyRef.current = false;
    cameraReadyAtRef.current = null;
    focusReadyRef.current = false;
    setCameraReady(false);
    setFocusReady(false);
    registerCaptureAdapter({
      capturePhoto: async () => {
        if (!cameraRef.current) {
          throw new Error("Camera ref unavailable.");
        }
        isCapturingRef.current = true;
        try {
          await waitForCameraStability(cameraReadyRef, cameraReadyAtRef, focusReadyRef);
          const photo = await cameraRef.current.takePhoto({
            flash: "off",
            qualityPrioritization: "balanced"
          });
          return photoToFrame(photo);
        } finally {
          isCapturingRef.current = false;
        }
      },
      captureBurst: async (count) => {
        const frames = [];
        const burstCount = Math.max(1, Math.min(8, count));
        isCapturingRef.current = true;
        try {
          await waitForCameraStability(cameraReadyRef, cameraReadyAtRef, focusReadyRef);
          for (let i = 0; i < burstCount; i += 1) {
            if (!cameraRef.current) {
              break;
            }
            const photo = await cameraRef.current.takePhoto({
              flash: "off",
              qualityPrioritization: "balanced"
            });
            frames.push(photoToFrame(photo));
            await sleep(450);
          }
        } finally {
          isCapturingRef.current = false;
        }
        return frames;
      }
    });
    onStart?.();
    return () => {
      registerCaptureAdapter(null);
      onStop?.();
    };
  }, [onStart, onStop]);
  (0, import_react.useEffect)(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (!hasPermission) {
      cameraReadyRef.current = false;
      cameraReadyAtRef.current = null;
      focusReadyRef.current = false;
      setCameraReady(false);
      setFocusReady(false);
      setFrameState("needs_help");
      return;
    }
    if (!cameraReady || !focusReady) {
      setFrameState("searching");
      return;
    }
    setFrameState("searching");
    const timer = setTimeout(() => setFrameState("ready"), 450);
    return () => clearTimeout(timer);
  }, [cameraReady, focusReady, hasPermission]);
  (0, import_react.useEffect)(() => {
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
  (0, import_react.useEffect)(() => {
    if (!focusReady || !onCardDetectedRef.current) return;
    detectionFiredRef.current = false;
    consecutiveHitsRef.current = 0;
    let cancelled = false;
    const runLoop = async () => {
      while (!cancelled && !detectionFiredRef.current) {
        await sleep(750);
        if (cancelled || detectionFiredRef.current || !cameraRef.current) continue;
        if (isCapturingRef.current) {
          consecutiveHitsRef.current = 0;
          continue;
        }
        try {
          const photo = await cameraRef.current.takePhoto({
            flash: "off",
            enableShutterSound: false,
            qualityPrioritization: "speed"
          });
          if (cancelled || detectionFiredRef.current || isCapturingRef.current) break;
          const frame = await recognizeCardFrame(photoToFrame(photo).uri);
          const parsed = extractCardCandidates(frame.lines);
          if (parsed.panCandidate) {
            consecutiveHitsRef.current += 1;
            if (consecutiveHitsRef.current >= 3 && !isCapturingRef.current) {
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
    return () => {
      cancelled = true;
    };
  }, [focusReady]);
  const TextComponent = import_react_native2.Text;
  const ViewComponent = import_react_native2.View;
  const SafeAreaComponent = import_react_native2.SafeAreaView;
  if (!Camera) {
    return import_react.default.createElement(TextComponent, { style: styles.error }, "`react-native-vision-camera` is not installed in host app.");
  }
  if (!device) {
    return import_react.default.createElement(
      ViewComponent,
      { style: [styles.permissionWrap, normalized.uiMode === "fullscreen" ? styles.fullscreenRoot : styles.embeddedRoot] },
      import_react.default.createElement(
        TextComponent,
        { style: styles.permissionText },
        "No back camera available on this device."
      )
    );
  }
  if (!hasPermission) {
    return import_react.default.createElement(
      ViewComponent,
      { style: [styles.permissionWrap, normalized.uiMode === "fullscreen" ? styles.fullscreenRoot : styles.embeddedRoot] },
      import_react.default.createElement(
        TextComponent,
        { style: styles.permissionText },
        "Camera permission required for card capture."
      ),
      import_react.default.createElement(
        TextComponent,
        {
          style: styles.permissionAction,
          onPress: () => {
            void requestPermission();
          }
        },
        "Grant Camera Access"
      )
    );
  }
  const hintText = frameState === "ready" ? onCardDetectedRef.current ? "Scanning for card\u2026 Hold steady." : "Card detected. Hold steady and tap Capture Card." : cameraReady ? "Align your physical card inside the frame." : "Starting camera\u2026";
  const frameStyle = frameState === "ready" ? styles.frameReady : frameState === "needs_help" ? styles.frameWarn : styles.frameNeutral;
  return import_react.default.createElement(
    ViewComponent,
    { style: normalized.uiMode === "fullscreen" ? styles.fullscreenRoot : styles.embeddedRoot },
    import_react.default.createElement(Camera, {
      ref: cameraRef,
      style: styles.camera,
      device,
      isActive: true,
      photo: true,
      torch: torchEnabled ? "on" : "off",
      photoQualityBalance: import_react_native2.Platform.OS === "ios" ? "quality" : void 0,
      onInitialized: () => {
        cameraReadyRef.current = true;
        cameraReadyAtRef.current = Date.now();
        setCameraReady(true);
      },
      onError: () => {
        cameraReadyRef.current = false;
        cameraReadyAtRef.current = null;
        focusReadyRef.current = false;
        setCameraReady(false);
        setFocusReady(false);
        setFrameState("needs_help");
      }
    }),
    import_react.default.createElement(
      SafeAreaComponent,
      { style: styles.overlayLayer, pointerEvents: "box-none" },
      import_react.default.createElement(
        ViewComponent,
        { style: styles.topRow, pointerEvents: "box-none" },
        normalized.showCancelControl ? import_react.default.createElement(
          TextComponent,
          {
            style: styles.controlButton,
            onPress: () => {
              registerCaptureAdapter(null);
              onCancel?.();
            }
          },
          "Cancel"
        ) : import_react.default.createElement(ViewComponent, { style: styles.controlSpacer }),
        normalized.showTorchControl && normalized.enableTorchToggle ? import_react.default.createElement(
          TextComponent,
          {
            style: styles.controlButton,
            onPress: () => setTorchEnabled((prev) => !prev)
          },
          torchEnabled ? "Torch On" : "Torch Off"
        ) : import_react.default.createElement(ViewComponent, { style: styles.controlSpacer })
      ),
      import_react.default.createElement(
        ViewComponent,
        { style: styles.centerZone, pointerEvents: "none" },
        import_react.default.createElement(ViewComponent, { style: [styles.frameBase, frameStyle] })
      ),
      normalized.showHintText ? import_react.default.createElement(
        ViewComponent,
        { style: styles.bottomZone, pointerEvents: "none" },
        import_react.default.createElement(TextComponent, { style: styles.hint }, hintText)
      ) : null
    )
  );
}
var styles = import_react_native2.StyleSheet.create({
  fullscreenRoot: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#000000",
    overflow: "hidden"
  },
  embeddedRoot: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    overflow: "hidden",
    height: 280,
    backgroundColor: "#000000"
  },
  camera: {
    ...import_react_native2.StyleSheet.absoluteFillObject
  },
  overlayLayer: {
    ...import_react_native2.StyleSheet.absoluteFillObject
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 10
  },
  controlButton: {
    color: "#f8fafc",
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: "700"
  },
  controlSpacer: {
    width: 84,
    height: 30
  },
  centerZone: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  frameBase: {
    width: "88%",
    maxWidth: 680,
    aspectRatio: 1.58,
    borderWidth: 2,
    borderRadius: 16,
    borderStyle: "dashed"
  },
  frameNeutral: {
    borderColor: "#94a3b8"
  },
  frameReady: {
    borderColor: "#22c55e"
  },
  frameWarn: {
    borderColor: "#f59e0b"
  },
  bottomZone: {
    paddingBottom: 22,
    paddingHorizontal: 16
  },
  hint: {
    color: "#f8fafc",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    textShadowColor: "rgba(2, 6, 23, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  permissionWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    minHeight: 180,
    backgroundColor: "#0f172a",
    padding: 16,
    justifyContent: "center",
    gap: 10
  },
  permissionText: {
    color: "#cbd5e1",
    textAlign: "center"
  },
  permissionAction: {
    color: "#22c55e",
    textAlign: "center",
    fontWeight: "700"
  },
  error: {
    color: "#ef4444",
    fontSize: 12
  }
});
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
async function waitForCameraStability(cameraReadyRef, cameraReadyAtRef, focusReadyRef) {
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

// src/pipeline/liveness.ts
function runLivenessChecks(input, options) {
  const strictness = options?.strictness ?? "standard";
  const glareMin = strictness === "high" ? 0.65 : 0.5;
  const parallaxMin = strictness === "high" ? 0.65 : 0.45;
  const screenMax = strictness === "high" ? 0.4 : 0.6;
  const glarePassed = input.glareScore >= glareMin;
  const edgePassed = input.edgeParallaxScore >= parallaxMin;
  const screenPassed = input.screenRecaptureScore <= screenMax;
  const checks = [
    {
      name: "glare_consistency",
      passed: glarePassed,
      confidence: clamp2(input.glareScore),
      reason: glarePassed ? void 0 : "GLARE_PATTERN_INCONSISTENT"
    },
    {
      name: "edge_parallax",
      passed: edgePassed,
      confidence: clamp2(input.edgeParallaxScore),
      reason: edgePassed ? void 0 : "EDGE_PARALLAX_WEAK"
    },
    {
      name: "screen_recapture",
      passed: screenPassed,
      confidence: 1 - clamp2(input.screenRecaptureScore),
      reason: screenPassed ? void 0 : "SCREEN_RECAPTURE_SUSPECTED"
    }
  ];
  if (options?.challengeTriggered || input.challengeTriggered) {
    checks.push({
      name: "active_challenge",
      passed: Boolean(input.challengePassed),
      confidence: input.challengePassed ? 0.9 : 0.25,
      reason: input.challengePassed ? void 0 : "ACTIVE_CHALLENGE_FAILED"
    });
  }
  return checks;
}
function livenessConfidence(checks) {
  if (checks.length === 0) {
    return 0;
  }
  const total = checks.reduce((sum, check) => sum + check.confidence, 0);
  return clamp2(total / checks.length);
}
function livenessPassed(checks) {
  return checks.every((check) => check.passed);
}
function clamp2(value) {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

// src/pipeline/confidence.ts
var SUCCESS_THRESHOLD_STANDARD = 0.8;
var SUCCESS_THRESHOLD_HIGH = 0.86;
var MANUAL_THRESHOLD = 0.55;
var HARD_LIVENESS_FAIL_THRESHOLD_STANDARD = 0.45;
var HARD_LIVENESS_FAIL_THRESHOLD_HIGH = 0.52;
var EXPOSED_PAN_THRESHOLD = 0.8;
function buildScanResult(input) {
  const panRead = clamp3(input.panConfidence);
  const expiryRead = clamp3(input.expiryConfidence);
  const liveConfidence = livenessConfidence(input.livenessChecks);
  const livePassed = livenessPassed(input.livenessChecks);
  const overall = input.requireLiveness ? weighted([panRead, expiryRead, liveConfidence], [0.45, 0.2, 0.35]) : weighted([panRead, expiryRead], [0.7, 0.3]);
  const reasons = [...input.validation.reasons];
  const riskFlags = [];
  const strictness = input.livenessStrictness;
  const successThreshold = strictness === "high" ? SUCCESS_THRESHOLD_HIGH : SUCCESS_THRESHOLD_STANDARD;
  const hardLivenessFailThreshold = strictness === "high" ? HARD_LIVENESS_FAIL_THRESHOLD_HIGH : HARD_LIVENESS_FAIL_THRESHOLD_STANDARD;
  if (!livePassed && input.requireLiveness) {
    reasons.push("LIVENESS_FAILED");
    riskFlags.push("MANUAL_REVIEW_LIVENESS");
  }
  if (panRead < 0.8) {
    reasons.push("PAN_LOW_CONFIDENCE");
  }
  if (expiryRead < 0.7) {
    reasons.push("EXPIRY_LOW_CONFIDENCE");
  }
  let status;
  if (input.validation.valid && livePassed && overall >= successThreshold) {
    status = "success";
  } else if (input.requireLiveness && !livePassed && liveConfidence < hardLivenessFailThreshold) {
    status = "failed";
  } else if (overall >= MANUAL_THRESHOLD) {
    status = "manual_required";
    riskFlags.push("MANUAL_ENTRY_REQUIRED");
  } else {
    status = "failed";
  }
  if (status !== "success" && !riskFlags.includes("RISK_ELEVATED")) {
    riskFlags.push("RISK_ELEVATED");
  }
  const shouldExposePan = Boolean(input.parsed.pan) && input.validation.valid && (status === "success" || panRead >= EXPOSED_PAN_THRESHOLD);
  const exposedPan = shouldExposePan ? input.parsed.pan : void 0;
  const exposedBrand = shouldExposePan ? input.validation.brand : void 0;
  if (input.parsed.pan && !shouldExposePan) {
    reasons.push(input.validation.valid ? "PAN_SUPPRESSED_LOW_CONFIDENCE" : "PAN_SUPPRESSED_INVALID");
  }
  return {
    status,
    fields: {
      pan: exposedPan,
      expiryMonth: input.parsed.expiryMonth,
      expiryYear: input.parsed.expiryYear,
      cardholderName: input.parsed.cardholderName,
      cvv: input.parsed.cvv,
      brand: exposedBrand
    },
    confidence: {
      panRead,
      expiryRead,
      liveness: liveConfidence,
      overall
    },
    liveness: {
      passed: livePassed,
      checks: input.livenessChecks
    },
    captureDiagnostics: {
      frameCountUsed: Math.max(1, input.captureDiagnostics?.frameCountUsed ?? 1),
      sharpnessScore: clamp3(input.captureDiagnostics?.sharpnessScore ?? panRead),
      exposureScore: clamp3(input.captureDiagnostics?.exposureScore ?? expiryRead),
      glareScore: clamp3(input.captureDiagnostics?.glareScore ?? 0),
      parallaxScore: clamp3(input.captureDiagnostics?.parallaxScore ?? 0),
      recaptureScore: clamp3(input.captureDiagnostics?.recaptureScore ?? 1 - liveConfidence),
      challengeTriggered: Boolean(input.captureDiagnostics?.challengeTriggered),
      failureReasons: dedupe(input.captureDiagnostics?.failureReasons ?? [])
    },
    riskFlags,
    reasons: dedupe(reasons),
    timingsMs: input.timingsMs
  };
}
function weighted(values, weights) {
  const numerator = values.reduce((sum, v, idx) => sum + v * (weights[idx] ?? 0), 0);
  const denominator = weights.reduce((sum, w) => sum + w, 0);
  return denominator === 0 ? 0 : clamp3(numerator / denominator);
}
function clamp3(value) {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
function dedupe(values) {
  return [...new Set(values)];
}

// src/utils/expiry.ts
function parseExpiry(raw) {
  if (!raw) {
    return {};
  }
  const cleaned = raw.replace(/\s/g, "");
  const match = cleaned.match(/^(\d{2})\/(\d{2}|\d{4})$/);
  if (!match) {
    return {};
  }
  const month = Number.parseInt(match[1], 10);
  const yearRaw = Number.parseInt(match[2], 10);
  const year = match[2].length === 2 ? 2e3 + yearRaw : yearRaw;
  if (month < 1 || month > 12) {
    return {};
  }
  return { month, year };
}
function isExpiryPlausible(month, year, now = /* @__PURE__ */ new Date()) {
  if (!month || !year) {
    return false;
  }
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  if (year < currentYear || year > currentYear + 20) {
    return false;
  }
  if (year === currentYear && month < currentMonth) {
    return false;
  }
  return true;
}

// src/pipeline/parser.ts
function parseOcrPayload(payload) {
  const pan = sanitizePan(payload.panCandidate);
  const expiry = parseExpiry(payload.expiryCandidate);
  const cvv = sanitizeCvv(payload.cvvCandidate);
  return {
    pan: pan || void 0,
    expiryMonth: expiry.month,
    expiryYear: expiry.year,
    cardholderName: normalizeCardholderName(payload.nameCandidate),
    cvv,
    brand: inferCardBrand(pan)
  };
}
function sanitizeCvv(raw) {
  const digits = raw?.replace(/\D/g, "") ?? "";
  return /^\d{3}$/.test(digits) ? digits : void 0;
}
function normalizeCardholderName(raw) {
  const words = raw?.trim().toUpperCase().match(/[A-Z]{2,}/g)?.slice(0, 2);
  if (!words || words.length < 2) {
    return void 0;
  }
  return `${words[0]} ${words[1]}`;
}

// src/pipeline/validation.ts
function validateCardFields(fields, allowedBrands) {
  const reasons = [];
  const pan = fields.pan ?? "";
  const brand = fields.brand ?? inferCardBrand(pan);
  if (!pan) {
    reasons.push("PAN_MISSING");
  } else if (!luhnCheck(pan)) {
    reasons.push("PAN_LUHN_FAILED");
  }
  if (allowedBrands && allowedBrands.length > 0 && !allowedBrands.includes(brand)) {
    reasons.push("BRAND_NOT_ALLOWED");
  }
  if (fields.expiryMonth && fields.expiryYear && !isExpiryPlausible(fields.expiryMonth, fields.expiryYear)) {
    reasons.push("EXPIRY_IMPLAUSIBLE");
  }
  return {
    valid: reasons.length === 0,
    reasons,
    brand
  };
}

// src/pipeline/scan.ts
async function runScanPipeline(input, options) {
  const normalized = normalizeOptions(options);
  const start = Date.now();
  normalized.onProgress?.("detection", { timeoutMs: normalized.timeoutMs });
  const parsed = parseOcrPayload(input.ocr);
  const validation = validateCardFields(parsed, normalized.allowedCardBrands);
  normalized.onProgress?.("ocr", {
    panDetected: Boolean(parsed.pan),
    expiryDetected: Boolean(parsed.expiryMonth && parsed.expiryYear)
  });
  const checks = runLivenessChecks(input.liveness, {
    strictness: normalized.livenessStrictness,
    challengeTriggered: input.captureDiagnostics?.challengeTriggered
  });
  const timings = mergeTimings(input.timingsMs, start);
  const result = buildScanResult({
    validation,
    parsed,
    panConfidence: input.ocr.panConfidence ?? 0,
    expiryConfidence: input.ocr.expiryConfidence ?? 0,
    livenessChecks: checks,
    timingsMs: timings,
    requireLiveness: normalized.requireLiveness,
    captureDiagnostics: input.captureDiagnostics,
    livenessStrictness: normalized.livenessStrictness
  });
  normalized.onResult?.(result);
  return result;
}
function mergeTimings(input, start) {
  const now = Date.now();
  const total = input?.total ?? Math.max(0, now - start);
  return {
    total,
    detection: input?.detection ?? Math.round(total * 0.3),
    ocr: input?.ocr ?? Math.round(total * 0.4),
    liveness: input?.liveness ?? Math.round(total * 0.3)
  };
}

// src/capture/jsCapture.ts
async function captureCardWithJsRuntime(options = {}) {
  const adapter2 = getCaptureAdapter();
  if (!adapter2) {
    throw new Error("No active CardScannerView camera adapter found. Render CardScannerView before captureCard().");
  }
  const started = Date.now();
  options.onProgress?.("capture_started");
  const burstCount = Math.max(1, Math.min(8, options.burstCount ?? 5));
  console.log("[card-scan] captureCard begin", { burstCount, captureMode: options.captureMode ?? "auto" });
  const photos = options.captureMode === "manual" || !adapter2.captureBurst ? [await adapter2.capturePhoto()] : await adapter2.captureBurst(burstCount);
  console.log("[card-scan] captureCard photos taken", { count: photos.length, elapsedMs: Date.now() - started });
  if (photos.length === 0) {
    throw new Error("No frames captured. Hold card inside frame and try again.");
  }
  const linesByFrame = [];
  const positionedLinesByFrame = [];
  let nativeSharpnessTotal = 0;
  let nativeExposureTotal = 0;
  let nativeGlareTotal = 0;
  let nativeRecaptureTotal = 0;
  let nativeDiagCount = 0;
  for (const [index, photo] of photos.entries()) {
    options.onAutoCapture?.({ uri: photo.uri, index });
    const frameStart = Date.now();
    console.log("[card-scan] OCR frame begin", { index, uri: photo.uri });
    const frame = await recognizeCardFrame(photo.uri);
    console.log("[card-scan] OCR frame done", { index, ms: Date.now() - frameStart, lineCount: frame.lines.length });
    console.log("[card-scan] OCR frame lines", { index, lines: frame.lines });
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
    hasPositions ? positionedLinesByFrame : void 0
  );
  console.log("[card-scan] fused candidates", {
    pan: parsed.panCandidate,
    expiry: parsed.expiryCandidate,
    name: parsed.nameCandidate,
    panConfidence: parsed.panConfidence,
    expiryConfidence: parsed.expiryConfidence
  });
  const frontBrand = parsed.panCandidate ? inferCardBrand(parsed.panCandidate) : "other";
  const shouldScanBack = (options.captureBackForCvv ?? true) && Boolean(parsed.panCandidate) && frontBrand !== "amex";
  let backCvvCandidate;
  if (shouldScanBack) {
    const flipPauseMs = options.flipPauseMs ?? 2500;
    options.onProgress?.("flip_card", { pauseMs: flipPauseMs });
    await new Promise((resolve) => {
      setTimeout(resolve, flipPauseMs);
    });
    try {
      const waitForBackTrigger = options.waitForBackTrigger ?? (() => new Promise((resolve) => {
        setTimeout(resolve, flipPauseMs);
      }));
      await waitForBackTrigger();
      options.onProgress?.("capture_back");
      const backPhoto = await adapter2.capturePhoto();
      options.onAutoCapture?.({ uri: backPhoto.uri, index: 0, side: "back" });
      try {
        const frame = await recognizeCardFrame(backPhoto.uri);
        const backParsed = fuseCardCandidates([frame.lines]);
        backCvvCandidate = backParsed.cvvCandidate;
      } catch (frameError) {
        console.log("[card-scan] back OCR failed (CVV stays empty)", {
          error: String(frameError)
        });
      }
    } catch (backError) {
      console.log("[card-scan] back capture failed (CVV stays empty)", {
        error: String(backError)
      });
    }
    options.onProgress?.("back_complete", { cvvFound: Boolean(backCvvCandidate) });
  }
  const strictness = options.livenessStrictness ?? "standard";
  const suspicious = parsed.diagnostics.recaptureSuspicion > (strictness === "high" ? 0.44 : 0.58) || parsed.diagnostics.panSupportScore < (strictness === "high" ? 0.4 : 0.3);
  const challengeTriggered = Boolean(options.enableActiveChallengeOnSuspicion ?? true) && suspicious;
  const challengePassed = !challengeTriggered || parsed.diagnostics.panSupportScore >= 0.5;
  const modelGlareScore = clamp4(1 - parsed.diagnostics.ambiguityScore * 1.8);
  const parallaxScore = clamp4(parsed.diagnostics.panSupportScore * 0.82 + (1 - parsed.diagnostics.recaptureSuspicion) * 0.18);
  const modelRecaptureScore = clamp4(
    parsed.diagnostics.recaptureSuspicion * 0.75 + (1 - parsed.diagnostics.textDensityScore) * 0.25
  );
  const nativeSharpness = nativeDiagCount > 0 ? nativeSharpnessTotal / nativeDiagCount : void 0;
  const nativeExposure = nativeDiagCount > 0 ? nativeExposureTotal / nativeDiagCount : void 0;
  const nativeGlare = nativeDiagCount > 0 ? nativeGlareTotal / nativeDiagCount : void 0;
  const nativeRecapture = nativeDiagCount > 0 ? nativeRecaptureTotal / nativeDiagCount : void 0;
  const glareScore = nativeGlare !== void 0 ? clamp4(0.7 * nativeGlare + 0.3 * modelGlareScore) : modelGlareScore;
  const screenRecaptureScore = nativeRecapture !== void 0 ? clamp4(0.65 * nativeRecapture + 0.35 * modelRecaptureScore) : modelRecaptureScore;
  const result = await runScanPipeline(
    {
      ocr: {
        panCandidate: parsed.panCandidate,
        expiryCandidate: parsed.expiryCandidate,
        nameCandidate: parsed.nameCandidate,
        // Never fall back to a front-scan CVV when we already ran the back scan —
        // front-scan CVV candidates are usually PAN digit fragments.
        cvvCandidate: shouldScanBack ? backCvvCandidate : backCvvCandidate ?? parsed.cvvCandidate,
        panConfidence: parsed.panConfidence,
        expiryConfidence: parsed.expiryConfidence
      },
      liveness: {
        glareScore,
        edgeParallaxScore: parallaxScore,
        screenRecaptureScore,
        challengeTriggered,
        challengePassed
      },
      captureDiagnostics: {
        frameCountUsed: photos.length,
        sharpnessScore: nativeSharpness !== void 0 ? nativeSharpness : clamp4(parsed.panConfidence * 0.75 + parsed.diagnostics.textDensityScore * 0.25),
        exposureScore: nativeExposure !== void 0 ? nativeExposure : clamp4(parsed.expiryConfidence * 0.6 + parsed.diagnostics.textDensityScore * 0.4),
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
          screenRecaptureScore
        })
      },
      timingsMs: {
        total: Date.now() - started
      }
    },
    options
  );
  return result;
}
function buildFailureReasons(input) {
  const reasons = [];
  if (!input.panCandidate) {
    reasons.push("PAN_MISSING");
  }
  if (!input.expiryCandidate) {
    reasons.push("EXPIRY_MISSING");
  }
  if (!input.cvvCandidate) {
    reasons.push("CVV_MISSING");
  }
  if (input.suspicious) {
    reasons.push("PASSIVE_LIVENESS_SUSPICIOUS");
  }
  if (input.screenRecaptureScore > 0.5) {
    reasons.push("SCREEN_RECAPTURE_SUSPECTED");
  }
  if (input.challengeTriggered && !input.challengePassed) {
    reasons.push("ACTIVE_CHALLENGE_FAILED");
  }
  return [...new Set(reasons)];
}
function clamp4(value) {
  return Math.min(1, Math.max(0, value));
}

// src/index.ts
var VERSION = "0.1.0";
var sessions = /* @__PURE__ */ new Set();
async function startCardScan(options = {}) {
  const normalized = normalizeOptions(options);
  const sessionId = createSessionId();
  sessions.add(sessionId);
  normalized.onProgress?.("session_started", { sessionId, requireLiveness: normalized.requireLiveness });
  if (NativeCardScanModule) {
    await NativeCardScanModule.startCardScan(sessionId, normalized);
  }
  return sessionId;
}
async function stopCardScan(sessionId) {
  if (!sessions.has(sessionId)) {
    return;
  }
  sessions.delete(sessionId);
  if (NativeCardScanModule) {
    await NativeCardScanModule.stopCardScan(sessionId);
  }
}
async function processScanInput(input, options = {}) {
  return runScanPipeline(input, options);
}
async function captureCard(options = {}) {
  const normalized = normalizeOptions(options);
  const sessionId = await startCardScan(normalized);
  try {
    const result = await captureCardWithJsRuntime(normalized);
    normalized.onResult?.(result);
    return result;
  } catch (error) {
    normalized.onError?.({
      code: "INTERNAL",
      message: String(error),
      retryable: true
    });
    throw error;
  } finally {
    await stopCardScan(sessionId);
  }
}
async function getSdkHealth() {
  const platform = inferPlatform();
  if (NativeCardScanModule) {
    const health = await NativeCardScanModule.getSdkHealth();
    return {
      sdk: VERSION,
      platform,
      turboModuleAvailable: health.turboModuleAvailable,
      ocrEngine: health.ocrEngine
    };
  }
  return {
    sdk: VERSION,
    platform,
    turboModuleAvailable: false,
    ocrEngine: platform === "ios" ? "vision_stub" : platform === "android" ? "mlkit_stub" : "none"
  };
}
function validateCardFields2(fields, allowedBrands) {
  return validateCardFields(fields, allowedBrands);
}
function createSessionId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `scan_${Date.now()}_${rand}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CardScannerView,
  captureCard,
  getSdkHealth,
  processScanInput,
  startCardScan,
  stopCardScan,
  validateCardFields
});
