package com.company.rncardscan

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Android port of the iOS `CardScanMlKitService`. Loads a captured JPEG,
 * normalises orientation, crops to the central card-frame band that matches
 * the on-screen guides, and runs Google MLKit's Latin text recogniser. Mirrors
 * the iOS contract so the shared JS pipeline (chunk assembly, expiry guard,
 * verification matching) doesn't need to care which platform produced the
 * lines.
 */
class CardScanMlKitService {

  data class PositionedLine(val text: String, val yNorm: Double)

  data class OcrImageResult(
    val lines: List<String>,
    val positionedLines: List<PositionedLine>,
    val sharpnessScore: Double,
    val exposureScore: Double,
    val glareScore: Double,
    val recaptureScore: Double,
  )

  private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  /**
   * Run OCR on the image at [uri] (vision-camera returns a `file://` URI).
   * Invokes [onSuccess] with the extracted lines + diagnostics, or [onError]
   * with a descriptive error. Always called on the main looper so the
   * TurboModule promise resolution stays on the bridge thread.
   */
  fun recognizeTextFromImage(
    uri: String,
    onSuccess: (OcrImageResult) -> Unit,
    onError: (Throwable) -> Unit,
  ) {
    try {
      val file = resolveFile(uri)
      val raw = decodeBitmap(file)
        ?: throw IllegalStateException("Unable to decode image at $uri")
      val oriented = applyExifOrientation(raw, file)
      val cropped = centerCropForCardFrame(oriented)

      val metrics = computeImageMetrics(cropped)
      val image = InputImage.fromBitmap(cropped, 0)
      val imageHeight = cropped.height.toDouble().coerceAtLeast(1.0)
      val positionBuffer = mutableListOf<PositionedLine>()

      textRecognizer.process(image)
        .addOnSuccessListener { result ->
          try {
            val lineScores = mutableMapOf<String, Double>()
            mergeRecognition(result, lineScores, weight = 1.0, imageHeight = imageHeight, positionBuffer = positionBuffer)

            val lines = lineScores.entries
              .sortedWith(
                compareByDescending<Map.Entry<String, Double>> { it.value }
                  .thenByDescending { it.key.length }
              )
              .take(64)
              .map { it.key }

            onSuccess(
              OcrImageResult(
                lines = lines,
                positionedLines = positionBuffer.toList(),
                sharpnessScore = metrics.sharpnessScore,
                exposureScore = metrics.exposureScore,
                glareScore = metrics.glareScore,
                recaptureScore = metrics.recaptureScore,
              )
            )
          } catch (t: Throwable) {
            onError(t)
          }
        }
        .addOnFailureListener { e -> onError(e) }
    } catch (t: Throwable) {
      onError(t)
    }
  }

  // ── URI / Bitmap loading ────────────────────────────────────────────────

  private fun resolveFile(uri: String): File {
    val parsed = Uri.parse(uri)
    val path = parsed.path ?: uri
    val file = File(path)
    if (!file.exists() && uri.startsWith("file://")) {
      // Fall back to the raw path after stripping the scheme.
      return File(uri.removePrefix("file://"))
    }
    return file
  }

  private fun decodeBitmap(file: File): Bitmap? {
    val opts = BitmapFactory.Options().apply {
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    return BitmapFactory.decodeFile(file.absolutePath, opts)
  }

  private fun applyExifOrientation(bitmap: Bitmap, file: File): Bitmap {
    val orientation = try {
      ExifInterface(file.absolutePath).getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL,
      )
    } catch (_: Throwable) {
      ExifInterface.ORIENTATION_NORMAL
    }

    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.postRotate(90f); matrix.preScale(-1f, 1f) }
      ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.postRotate(270f); matrix.preScale(-1f, 1f) }
      else -> return bitmap
    }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }

  /**
   * Mirror of the iOS `crop(image:relativeRect:)` call inside
   * `recognizeTextFromImage`. Carves out the central card-frame band
   * (~90% width × 50% height, centred) so MLKit only sees the card and not
   * the background clutter behind it.
   */
  private fun centerCropForCardFrame(bitmap: Bitmap): Bitmap {
    val w = bitmap.width
    val h = bitmap.height
    val rectX = (w * 0.05).toInt()
    val rectY = (h * 0.25).toInt()
    val rectW = (w * 0.90).toInt().coerceAtMost(w - rectX)
    val rectH = (h * 0.50).toInt().coerceAtMost(h - rectY)
    if (rectW <= 0 || rectH <= 0) return bitmap
    return Bitmap.createBitmap(bitmap, rectX, rectY, rectW, rectH)
  }

  // ── MLKit result aggregation ────────────────────────────────────────────

  private fun mergeRecognition(
    result: Text,
    scores: MutableMap<String, Double>,
    weight: Double,
    imageHeight: Double,
    positionBuffer: MutableList<PositionedLine>,
  ) {
    addCandidate(result.text, scores, weight * 0.65)

    for (block in result.textBlocks) {
      addCandidate(block.text, scores, weight * 0.78)

      for (line in block.lines) {
        addCandidate(line.text, scores, weight)

        line.boundingBox?.let { box ->
          val yCenter = (box.top + box.bottom) / 2.0
          val yNorm = (yCenter / imageHeight).coerceIn(0.0, 1.0)
          positionBuffer.add(PositionedLine(line.text, yNorm))
        }

        val elementTexts = line.elements.map { it.text }
        if (elementTexts.isNotEmpty()) {
          addCandidate(elementTexts.joinToString(" "), scores, weight * 0.96)
          addCandidate(elementTexts.joinToString(""), scores, weight * 1.08)
        }

        for (element in line.elements) {
          addCandidate(element.text, scores, weight * 0.72)
        }
      }
    }
  }

  private fun addCandidate(
    rawValue: String,
    scores: MutableMap<String, Double>,
    weight: Double,
  ) {
    val normalized = rawValue.trim().uppercase()
    if (normalized.isEmpty()) return
    val score = weight * candidatePriority(normalized)
    scores[normalized] = (scores[normalized] ?: 0.0) + score
  }

  private val panRunRegex = Regex("[0-9OQDILZSBG\\s-]{12,}")
  private val expiryRegex = Regex("(0[1-9]|1[0-2])\\s*/?\\s*(\\d{2}|\\d{4})")
  private val digitLikeChars = "0123456789OQDILZSBG/ -".toSet()

  private fun candidatePriority(text: String): Double {
    val charCount = max(1, text.length)
    val digitLikeCount = text.count { digitLikeChars.contains(it) }
    val digitLikeRatio = digitLikeCount.toDouble() / charCount.toDouble()
    val hasPanRun = panRunRegex.containsMatchIn(text)
    val hasExpiry = expiryRegex.containsMatchIn(text)

    var score = 0.58 + (digitLikeRatio * 0.58)
    if (hasPanRun) score += 0.38
    if (hasExpiry) score += 0.22
    if (text.length in 13..24) score += 0.08
    return score
  }

  // ── Image metrics ───────────────────────────────────────────────────────

  private data class ImageMetrics(
    val sharpnessScore: Double,
    val exposureScore: Double,
    val glareScore: Double,
    val recaptureScore: Double,
  )

  /**
   * Cheap proxies for the iOS metrics. We sample a small grid of pixels to
   * keep this fast on large captures; the values are normalised to [0, 1]
   * so the JS pipeline's liveness scoring stays platform-agnostic.
   *  - sharpness: variance of luminance differences between neighbouring
   *    samples (high variance = sharp; flat blur = low variance).
   *  - exposure: how close the average luminance sits to the middle of
   *    the dynamic range.
   *  - glare: fraction of samples saturated near white.
   *  - recapture: hard to detect without FFT; we keep a conservative
   *    default that lets the front-of-card path through.
   */
  private fun computeImageMetrics(bitmap: Bitmap): ImageMetrics {
    val w = bitmap.width
    val h = bitmap.height
    if (w < 4 || h < 4) {
      return ImageMetrics(0.5, 0.5, 0.0, 0.2)
    }

    val stride = max(1, min(w, h) / 32)
    var sumLum = 0.0
    var sumLumSquared = 0.0
    var lastLum = -1.0
    var diffSum = 0.0
    var diffCount = 0
    var brightCount = 0
    var sampled = 0

    var y = 0
    while (y < h) {
      var x = 0
      while (x < w) {
        val pixel = bitmap.getPixel(x, y)
        val lum =
          0.299 * Color.red(pixel) +
            0.587 * Color.green(pixel) +
            0.114 * Color.blue(pixel)
        sumLum += lum
        sumLumSquared += lum * lum
        if (lum >= 240.0) brightCount += 1
        if (lastLum >= 0.0) {
          diffSum += abs(lum - lastLum)
          diffCount += 1
        }
        lastLum = lum
        sampled += 1
        x += stride
      }
      y += stride
    }

    if (sampled == 0) {
      return ImageMetrics(0.5, 0.5, 0.0, 0.2)
    }

    val meanLum = sumLum / sampled
    val variance = (sumLumSquared / sampled) - (meanLum * meanLum)
    val sharpness = clamp(sqrt(max(variance, 0.0)) / 64.0)
    val meanDiff = if (diffCount > 0) diffSum / diffCount else 0.0
    val sharpnessCombined = clamp((sharpness * 0.6) + (meanDiff / 48.0 * 0.4))
    val exposure = clamp(1.0 - (abs(meanLum - 128.0) / 128.0))
    val glare = clamp(brightCount.toDouble() / sampled.toDouble())
    val recapture = 0.15

    return ImageMetrics(
      sharpnessScore = sharpnessCombined,
      exposureScore = exposure,
      glareScore = glare,
      recaptureScore = recapture,
    )
  }

  private fun clamp(value: Double): Double = min(1.0, max(0.0, value))
}
