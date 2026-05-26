import { NativeCardScanModule } from '../native/CardScanTurboModule';
import { inferCardBrand, luhnCheck } from '../utils/pan';

const CHAR_CONFUSION_MAP: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  B: '8',
  G: '6',
};

export interface PositionedLine {
  text: string;
  /** Normalised vertical position in the original image: 0 = top, 1 = bottom. */
  yNorm: number;
}

export interface ParsedCandidates {
  panCandidate?: string;
  expiryCandidate?: string;
  nameCandidate?: string;
  cvvCandidate?: string;
  panConfidence: number;
  expiryConfidence: number;
  diagnostics: {
    frameCount: number;
    textDensityScore: number;
    panSupportScore: number;
    expirySupportScore: number;
    ambiguityScore: number;
    recaptureSuspicion: number;
    panCandidatesByFrame: string[][];
  };
}

export interface RecognizedFrame {
  lines: string[];
  /** Lines with vertical position, from the original (unprocessed) image only. */
  positionedLines?: PositionedLine[];
  diagnostics?: {
    sharpnessScore: number;
    exposureScore: number;
    glareScore: number;
    recaptureScore: number;
  };
}

export async function recognizeCardText(uri: string): Promise<string[]> {
  const frame = await recognizeCardFrame(uri);
  return frame.lines;
}

export async function recognizeCardFrame(uri: string): Promise<RecognizedFrame> {
  const recognizeCardTextFromImage = NativeCardScanModule?.recognizeCardTextFromImage;

  if (typeof recognizeCardTextFromImage !== 'function') {
    throw new Error('Native ML Kit OCR unavailable. Build the host app with the rn-card-scan native module.');
  }

  const native = await recognizeCardTextFromImage(uri);
  return {
    lines: native.lines ?? [],
    positionedLines: (native.positionedLines ?? []).map((pl) => ({
      text: pl.text,
      yNorm: clamp(pl.yNorm),
    })),
    diagnostics: {
      sharpnessScore: clamp(native.sharpnessScore ?? 0),
      exposureScore: clamp(native.exposureScore ?? 0),
      glareScore: clamp(native.glareScore ?? 0),
      recaptureScore: clamp(native.recaptureScore ?? 0),
    },
  };
}

export function extractCardCandidates(lines: string[]): ParsedCandidates {
  return fuseCardCandidates([lines]);
}

export function fuseCardCandidates(
  linesByFrame: string[][],
  positionedLinesByFrame?: PositionedLine[][]
): ParsedCandidates {
  const frameCount = Math.max(1, linesByFrame.length);
  const panCandidatesByFrame = linesByFrame.map((lines) => extractPanCandidates(lines));

  const panScores = new Map<string, number>();
  for (const pans of panCandidatesByFrame) {
    const unique = [...new Set(pans)];
    for (const pan of unique) {
      const score = scorePan(pan);
      panScores.set(pan, (panScores.get(pan) ?? 0) + score);
    }
  }

  const bestPan = [...panScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const panSupport = bestPan
    ? panCandidatesByFrame.filter((framePans) => framePans.includes(bestPan)).length / frameCount
    : 0;

  const expiryCandidates = linesByFrame.flatMap((lines) => extractExpiryCandidates(lines));
  const bestExpiry = pickMostFrequent(expiryCandidates);
  const expirySupport = bestExpiry
    ? expiryCandidates.filter((value) => value === bestExpiry).length / frameCount
    : 0;

  // Prefer position-aware name extraction when available; fall back to plain lines.
  const nameCandidates = positionedLinesByFrame
    ? positionedLinesByFrame.flatMap((pLines) => extractNameCandidatesPositioned(pLines))
    : linesByFrame.flatMap((lines) => extractNameCandidates(lines));
  const bestName = pickBestName(nameCandidates);

  const cvvCandidates = linesByFrame.flatMap((lines) => extractCvvCandidates(lines));
  // Drop CVV candidates derived from the last PAN digit group.
  // Covers: exact suffix ("836"), zero-padded suffix ("0836"), and prefix of the
  // last 4 digits ("083" from "0836") which OCR sometimes reads off the PAN.
  const panLast4 = bestPan ? bestPan.slice(-4) : '';
  const filteredCvvCandidates = bestPan
    ? cvvCandidates.filter(
        (cvv) =>
          !bestPan.endsWith(cvv) &&
          !bestPan.endsWith(`0${cvv}`) &&
          !panLast4.startsWith(cvv),
      )
    : cvvCandidates;
  const bestCvv = pickMostFrequent(filteredCvvCandidates);

  const avgLineCount =
    linesByFrame.reduce((sum, frameLines) => sum + frameLines.filter(Boolean).length, 0) / frameCount;
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
      panCandidatesByFrame,
    },
  };
}

function extractPanCandidates(lines: string[]): string[] {
  const joined = lines.join(' ');
  const weightedCandidates = new Map<string, number>();

  for (const match of joined.match(/[0-9OQDILZSBG\s-]{13,32}/gi) ?? []) {
    addWeightedPanCandidates(weightedCandidates, match, 0.15);
  }

  for (const line of lines) {
    addWeightedPanCandidates(weightedCandidates, line, 0.9);

    for (const token of line.split(/\s+/)) {
      if (token.length >= 10) {
        addWeightedPanCandidates(weightedCandidates, token, 0.3);
      }
    }
  }

  return [...weightedCandidates.entries()]
    .filter(([pan]) => pan.length === 15 || pan.length === 16)
    .sort((a, b) => scorePanCandidate(b[0], b[1]) - scorePanCandidate(a[0], a[1]))
    .map(([pan]) => pan);
}

function extractExpiryCandidates(lines: string[]): string[] {
  // Pre-normalize separator confusions before normalizeDigitLikeString maps l/L → 1,
  // which would corrupt a slash that OCR misread as the letter l.
  const preprocessed = lines.map((line) =>
    line.replace(/[|\\]/g, '/').replace(/l(?=\d)/g, '/')
  );
  const joined = preprocessed.map((line) => normalizeDigitLikeString(line)).join(' ');
  // Broader separator handles /, -, ., or nothing (OCR drops the separator).
  const matches = joined.match(/(0[1-9]|1[0-2])[\s\/\-\.]{0,2}(\d{2}|\d{4})/g) ?? [];

  return matches.map((raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 4) return undefined;
    const month = digits.slice(0, 2);
    const yearRaw = digits.slice(2, 6);
    const year = yearRaw.length === 4 ? yearRaw.slice(-2) : yearRaw;
    return `${month}/${year}`;
  }).filter((v): v is string => v !== undefined);
}

function extractNameCandidates(lines: string[]): string[] {
  return lines.map((line) => normalizeNameCandidate(line)).filter(Boolean) as string[];
}

interface PositionedNameCandidate {
  text: string;
  yNorm: number;
}

/**
 * Position-aware variant: only considers lines in the lower 60% of the card image
 * and returns each candidate with its vertical position so we can prefer bottom lines.
 * Bank names / type labels appear in the upper portion; cardholder names are always
 * at the very bottom of the card.
 */
function extractNameCandidatesPositioned(
  positionedLines: PositionedLine[]
): PositionedNameCandidate[] {
  return positionedLines
    .filter((pl) => pl.yNorm >= 0.4)
    .flatMap((pl) => {
      const text = normalizeNameCandidate(pl.text);
      return text ? [{ text, yNorm: pl.yNorm }] : [];
    });
}

/**
 * Prefer the name that:
 *  (a) appears at the bottom of the card (highest yNorm) — cardholder name is
 *      always the lowest text line; "VALID FROM / UNTIL END" labels sit above it
 *  (b) appears frequently across frames
 *  (c) looks like a real name: two words of 2–14 characters each
 */
function pickBestName(candidates: PositionedNameCandidate[] | string[]): string | undefined {
  if (candidates.length === 0) return undefined;

  // Normalise: plain strings get a mid-card yNorm of 0.5
  const normalised: PositionedNameCandidate[] = candidates.map((c) =>
    typeof c === 'string' ? { text: c, yNorm: 0.5 } : c
  );

  const counts = new Map<string, number>();
  const maxYNorm = new Map<string, number>();
  for (const { text, yNorm } of normalised) {
    counts.set(text, (counts.get(text) ?? 0) + 1);
    if ((maxYNorm.get(text) ?? 0) < yNorm) maxYNorm.set(text, yNorm);
  }

  const nameScore = (text: string): number => {
    const words = text.split(' ');
    const [a, b] = words;
    const lengthOk = Boolean(a && b && a.length >= 2 && a.length <= 14 && b.length >= 2 && b.length <= 14);
    // yNorm weight: bottom of card (0.9) scores 1.0, middle (0.5) scores 0.5
    const yWeight = (maxYNorm.get(text) ?? 0.5) * 1.0;
    return (counts.get(text) ?? 0) * 0.4 + yWeight + (lengthOk ? 0.3 : 0);
  };

  const ranked = [...counts.keys()].sort((a, b) => nameScore(b) - nameScore(a));
  const best = ranked[0];
  // Require a minimum score — if nothing clears it, leave name empty rather than guessing.
  // Score of 1.4 means: appeared in ≥2 frames at mid-card, OR once near the card bottom.
  if (!best || nameScore(best) < 1.4) return undefined;
  return best;
}

function extractCvvCandidates(lines: string[]): string[] {
  const candidates = new Set<string>();

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

    const exactDigits = line.replace(/\s+/g, '');
    if (/^\d{3}$/.test(exactDigits)) {
      candidates.add(exactDigits);
    }
  }

  return [...candidates];
}

function normalizeDigitLikeString(value: string): string {
  return value
    .toUpperCase()
    .split('')
    .map((char) => CHAR_CONFUSION_MAP[char] ?? char)
    .join('');
}

function scorePan(pan: string): number {
  let score = 1;

  if (luhnCheck(pan)) {
    score += 2.6;
  }

  const brand = inferCardBrand(pan);
  if (brand !== 'other') {
    score += 0.6;
  } else {
    // No major payment network (Visa=4, MC=2/5, Amex=3, Discover=6) starts with
    // 1, 7, 8, or 9. A number starting with these is almost certainly a spurious
    // sliding-window match (e.g. a year like "1894" concatenated with PAN digits).
    const first = pan[0];
    if (first === '1' || first === '7' || first === '8' || first === '9') {
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

function scorePanCandidate(pan: string, sourceWeight: number): number {
  let score = scorePan(pan) + sourceWeight;

  if (/^(\d)\1+$/.test(pan)) {
    score -= 3;
  }

  if (/0123|1234|2345|3456|4567|5678|6789/.test(pan)) {
    score -= 0.8;
  }

  return score;
}

function addWeightedPanCandidates(candidates: Map<string, number>, pattern: string, sourceWeight: number): void {
  const normalized = normalizeDigitLikeString(pattern);
  const compact = normalized.replace(/\D/g, '');

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

function addPanCandidate(candidates: Map<string, number>, pan: string, sourceWeight: number): void {
  const existingWeight = candidates.get(pan) ?? Number.NEGATIVE_INFINITY;
  if (sourceWeight > existingWeight) {
    candidates.set(pan, sourceWeight);
  }
}

function normalizeNameCandidate(rawLine: string): string | undefined {
  const line = rawLine.trim().toUpperCase();
  if (!line || /\d/.test(line) || line.length > 40) {
    return undefined;
  }

  const words = line.match(/[A-Z]{2,}/g) ?? [];
  if (words.length < 2) {
    return undefined;
  }

  const joined = words.join(' ');
  if (isNonNameLabel(joined)) {
    return undefined;
  }

  const candidate = `${words[0]} ${words[1]}`;
  return isNonNameLabel(candidate) ? undefined : candidate;
}

// Any word in this set disqualifies a line from being a cardholder name.
// Checking every word (not just the first) catches "ACCESS BANK", "ZENITH INTERNATIONAL", etc.
const NON_NAME_WORDS = new Set([
  'VALID', 'THRU', 'GOOD', 'MONTH', 'YEAR', 'CARD', 'HOLDER',
  'BANK', 'DEBIT', 'CREDIT', 'PREPAID', 'PLATINUM', 'GOLD', 'WORLD',
  'ELECTRON', 'BUSINESS', 'SIGNATURE', 'VISA', 'MASTERCARD',
  'AMERICAN', 'EXPRESS', 'DISCOVER', 'AMEX', 'CVV', 'CVC',
  'SECURITY', 'AUTHORIZED', 'SAVINGS', 'UNION', 'FINANCE',
  'FINANCIAL', 'INTERNATIONAL', 'LIMITED', 'LTD', 'PLC', 'CORP',
  'TRUST', 'MEMBER', 'SINCE', 'ACCOUNT', 'NUMBER', 'EXPIRES',
  'EXPIRY', 'ISSUED', 'ISSUER', 'NETWORK', 'SERVICES', 'GROUP',
  // Date/validity labels that appear near the expiry on many cards
  'UNTIL', 'FROM', 'END', 'DATE', 'THROUGH', 'START', 'BEGINNING',
]);

function isNonNameWord(word: string): boolean {
  if (NON_NAME_WORDS.has(word)) return true;
  // OCR mangling often inserts/appends a letter to a blocked word (e.g. UNTIL→UNTILI,
  // END→LEND). Block when the word contains a blocked token (≥4 chars) as a substring.
  for (const blocked of NON_NAME_WORDS) {
    if (blocked.length >= 4 && word.length >= 4 && word.includes(blocked)) return true;
    if (blocked.length >= 4 && word.length >= 3 && blocked.includes(word)) return true;
  }
  // Real name words always have at least one vowel. Vowel-free words ≥3 chars
  // are abbreviations or OCR garbage (VLD, PRDM, etc.).
  if (word.length >= 3 && !/[AEIOU]/.test(word)) return true;
  return false;
}

function isNonNameLabel(value: string): boolean {
  return value.toUpperCase().split(/\s+/).some((word) => isNonNameWord(word));
}

function computeAmbiguity(linesByFrame: string[][]): number {
  const joined = linesByFrame.flat().join('').toUpperCase();
  if (!joined.length) {
    return 1;
  }

  const confusing = joined.match(/[OQDILZSBG]/g)?.length ?? 0;
  return confusing / joined.length;
}

function pickMostFrequent(values: string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
