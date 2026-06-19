import CoreImage
import Foundation
import MLKitTextRecognition
import MLKitVision
import UIKit
import os.log

private let cardScanLog = OSLog(subsystem: "com.afriex.rn-card-scan", category: "ocr")

private func footprintMB() -> Double {
  var info = task_vm_info_data_t()
  var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
  let kerr = withUnsafeMutablePointer(to: &info) {
    $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
      task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
    }
  }
  guard kerr == KERN_SUCCESS else { return -1 }
  return Double(info.phys_footprint) / 1024.0 / 1024.0
}

final class CardScanMlKitService {
  struct OcrImageResult {
    let lines: [String]
    /// Text lines from the original (unprocessed) image, sorted top→bottom.
    /// yNorm is normalised to [0, 1] in UIKit-points space (0 = top of image).
    let positionedLines: [(text: String, yNorm: Double)]
    let sharpnessScore: Double
    let exposureScore: Double
    let glareScore: Double
    let recaptureScore: Double
  }

  private struct OcrVariant {
    let image: UIImage
    let weight: Double
  }

  /// Mutable reference bag so we can populate it inside the recursive closure chain.
  private final class PositionBuffer {
    var lines: [(text: String, yNorm: Double)] = []
  }

  private let textRecognizer: TextRecognizer
  private let ciContext = CIContext(options: nil)

  init() {
    let options = TextRecognizerOptions()
    textRecognizer = TextRecognizer.textRecognizer(options: options)
  }

  func recognizeTextFromImage(
    uri: String,
    completion: @escaping (Result<OcrImageResult, Error>) -> Void
  ) {
    os_log("recognizeTextFromImage begin mem=%.1fMB uri=%{public}@", log: cardScanLog, type: .info, footprintMB(), uri)
    do {
      let imageURL = try resolveImageURL(from: uri)
      // Downscale immediately after decode. The capture is ~10MP (~40MB
      // decoded); the crop, CIFilter variants, and MLKit each allocate copies,
      // and several frames in a burst stacked past iOS's memory limit
      // ("Unable to load image for OCR" / jetsam). Capping the longest side
      // keeps the PAN legible while cutting per-frame memory ~5x, which is what
      // makes a multi-frame burst (needed for reliable PAN fusion) viable.
      guard let data = try? Data(contentsOf: imageURL),
            let rawImage = UIImage(data: data),
            let oriented = normalizeOrientation(rawImage),
            let image = downscaleForOcr(oriented, maxLongestSide: 2000),
            let cgImage = image.cgImage else {
        throw NSError(
          domain: "CardScanMlKitService",
          code: 2001,
          userInfo: [NSLocalizedDescriptionKey: "Unable to load image for OCR from URI: \(uri)"]
        )
      }
      os_log("recognizeTextFromImage loaded image %.0fx%.0f mem=%.1fMB", log: cardScanLog, type: .info, image.size.width, image.size.height, footprintMB())

      // Pre-crop to the central card-frame region that matches the on-screen
      // green dashed bounding box (~90% width × 50% height, centered). This
      // removes background clutter (hand, keyboard, screen text behind the
      // card) before MLKit sees the image so the PAN/expiry don't get drowned
      // out by background OCR hits. Fallback to the full image if cropping
      // fails for any reason.
      let croppedForOcr = crop(image: image, relativeRect: CGRect(x: 0.05, y: 0.25, width: 0.90, height: 0.50)) ?? image
      os_log("recognizeTextFromImage cropped to %.0fx%.0f mem=%.1fMB", log: cardScanLog, type: .info, croppedForOcr.size.width, croppedForOcr.size.height, footprintMB())

      let variants = buildOcrVariants(from: croppedForOcr)
      os_log("recognizeTextFromImage built %d variants mem=%.1fMB", log: cardScanLog, type: .info, variants.count, footprintMB())
      let metrics = computeImageMetrics(cgImage: cgImage)
      let positionBuffer = PositionBuffer()
      let imageHeight = Double(image.size.height)

      processVariants(variants, index: 0, lineScores: [:], positionBuffer: positionBuffer, imageHeight: imageHeight, firstError: nil) { result in
        os_log("recognizeTextFromImage done mem=%.1fMB", log: cardScanLog, type: .info, footprintMB())
        switch result {
        case .success(let lines):
          completion(
            .success(
              OcrImageResult(
                lines: lines,
                positionedLines: positionBuffer.lines,
                sharpnessScore: metrics.sharpnessScore,
                exposureScore: metrics.exposureScore,
                glareScore: metrics.glareScore,
                recaptureScore: metrics.recaptureScore
              )
            )
          )
        case .failure(let error):
          completion(.failure(error))
        }
      }
    } catch {
      os_log("recognizeTextFromImage error: %{public}@", log: cardScanLog, type: .error, "\(error)")
      completion(.failure(error))
    }
  }

  private func processVariants(
    _ variants: [OcrVariant],
    index: Int,
    lineScores: [String: Double],
    positionBuffer: PositionBuffer,
    imageHeight: Double,
    firstError: Error?,
    completion: @escaping (Result<[String], Error>) -> Void
  ) {
    if index >= variants.count {
      let lines = lineScores
        .sorted { lhs, rhs in
          if lhs.value == rhs.value {
            return lhs.key.count > rhs.key.count
          }
          return lhs.value > rhs.value
        }
        .prefix(64)
        .map(\.key)

      if !lines.isEmpty {
        completion(.success(lines))
        return
      }

      completion(
        .failure(
          firstError ??
            NSError(
              domain: "CardScanMlKitService",
              code: 2002,
              userInfo: [NSLocalizedDescriptionKey: "ML Kit did not detect any usable text."]
            )
        )
      )
      return
    }

    let variant = variants[index]
    let visionImage = VisionImage(image: variant.image)
    visionImage.orientation = .up
    os_log("variant %d/%d %.0fx%.0f weight=%.2f", log: cardScanLog, type: .info, index + 1, variants.count, variant.image.size.width, variant.image.size.height, variant.weight)

    textRecognizer.process(visionImage) { [weak self] result, error in
      let blockCount = result?.blocks.count ?? 0
      let resultText = result?.text ?? ""
      os_log("variant %d MLKit returned %d blocks, %d chars (err=%{public}@)", log: cardScanLog, type: .info, index + 1, blockCount, resultText.count, error.map { "\($0)" } ?? "nil")
      guard let self else {
        completion(
          .failure(
            NSError(
              domain: "CardScanMlKitService",
              code: 2003,
              userInfo: [NSLocalizedDescriptionKey: "OCR service unavailable."]
            )
          )
        )
        return
      }

      var nextScores = lineScores
      var nextError = firstError

      if let result {
        self.mergeRecognition(result, into: &nextScores, weight: variant.weight)

        // Collect Y-positions only from the original (full) image — variant 0.
        // Other variants are cropped/contrasted and their coordinates would be misleading.
        if index == 0 && imageHeight > 0 {
          for block in result.blocks {
            for line in block.lines {
              let text = line.text.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
              guard !text.isEmpty else { continue }
              let yNorm = min(1.0, max(0.0, Double(line.frame.midY) / imageHeight))
              positionBuffer.lines.append((text: text, yNorm: yNorm))
            }
          }
          positionBuffer.lines.sort { $0.yNorm < $1.yNorm }
        }
      }

      if let error, nextError == nil {
        nextError = error
      }

      self.processVariants(
        variants,
        index: index + 1,
        lineScores: nextScores,
        positionBuffer: positionBuffer,
        imageHeight: imageHeight,
        firstError: nextError,
        completion: completion
      )
    }
  }

  private func mergeRecognition(_ result: Text, into scores: inout [String: Double], weight: Double) {
    addCandidate(result.text, into: &scores, weight: weight * 0.65)

    for block in result.blocks {
      addCandidate(block.text, into: &scores, weight: weight * 0.78)

      for line in block.lines {
        addCandidate(line.text, into: &scores, weight: weight)

        let elementTexts = line.elements.map(\.text)
        if !elementTexts.isEmpty {
          addCandidate(elementTexts.joined(separator: " "), into: &scores, weight: weight * 0.96)
          addCandidate(elementTexts.joined(), into: &scores, weight: weight * 1.08)
        }

        for element in line.elements {
          addCandidate(element.text, into: &scores, weight: weight * 0.72)
        }
      }
    }
  }

  private func addCandidate(_ rawValue: String, into scores: inout [String: Double], weight: Double) {
    let normalized = rawValue
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .uppercased()

    guard !normalized.isEmpty else { return }

    let score = weight * candidatePriority(for: normalized)
    scores[normalized, default: 0] += score
  }

  private func candidatePriority(for text: String) -> Double {
    let charCount = max(1, text.count)
    let digitLikeCount = text.filter { "0123456789OQDILZSBG/ -".contains($0) }.count
    let digitLikeRatio = Double(digitLikeCount) / Double(charCount)
    let hasPanRun = text.range(of: "[0-9OQDILZSBG\\s-]{12,}", options: .regularExpression) != nil
    let hasExpiry = text.range(of: "(0[1-9]|1[0-2])\\s*/?\\s*(\\d{2}|\\d{4})", options: .regularExpression) != nil

    var score = 0.58 + (digitLikeRatio * 0.58)

    if hasPanRun {
      score += 0.38
    }

    if hasExpiry {
      score += 0.22
    }

    if text.count >= 13 && text.count <= 24 {
      score += 0.08
    }

    return score
  }

  private func buildOcrVariants(from image: UIImage) -> [OcrVariant] {
    // Single-variant fast path: just OCR the normalized full image. The
    // multi-variant crop heuristics assume the card fills the frame in a
    // specific landscape orientation that doesn't match how vision-camera
    // captures in portrait, and 8 variants × 3 burst frames was pushing the
    // total OCR time past 45s.
    return [OcrVariant(image: image, weight: 1.0)]
  }

  private func makeHighContrastVariant(
    from image: UIImage,
    contrast: Double,
    brightness: Double,
    sharpness: Double
  ) -> UIImage? {
    guard let ciImage = CIImage(image: image) else {
      return nil
    }

    let contrasted = ciImage
      .applyingFilter(
        "CIColorControls",
        parameters: [
          kCIInputSaturationKey: 0.0,
          kCIInputContrastKey: contrast,
          kCIInputBrightnessKey: brightness
        ]
      )
      .applyingFilter("CISharpenLuminance", parameters: ["inputSharpness": sharpness])
      .applyingFilter("CIUnsharpMask", parameters: [kCIInputRadiusKey: 1.6, kCIInputIntensityKey: 0.9])

    guard let cgImage = ciContext.createCGImage(contrasted, from: contrasted.extent) else {
      return nil
    }

    return UIImage(cgImage: cgImage, scale: image.scale, orientation: .up)
  }

  private func makeShadowReliefVariant(from image: UIImage) -> UIImage? {
    guard let ciImage = CIImage(image: image) else {
      return nil
    }

    let shadowRelief = ciImage
      .applyingFilter(
        "CIColorControls",
        parameters: [
          kCIInputSaturationKey: 0.0,
          kCIInputContrastKey: 1.85,
          kCIInputBrightnessKey: -0.05
        ]
      )
      .applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: -0.25])
      .applyingFilter("CISharpenLuminance", parameters: ["inputSharpness": 1.05])
      .applyingFilter("CIUnsharpMask", parameters: [kCIInputRadiusKey: 2.0, kCIInputIntensityKey: 1.1])

    guard let cgImage = ciContext.createCGImage(shadowRelief, from: shadowRelief.extent) else {
      return nil
    }

    return UIImage(cgImage: cgImage, scale: image.scale, orientation: .up)
  }

  private func crop(image: UIImage, relativeRect: CGRect) -> UIImage? {
    guard let cgImage = image.cgImage else {
      return nil
    }

    let absoluteRect = CGRect(
      x: relativeRect.origin.x * CGFloat(cgImage.width),
      y: relativeRect.origin.y * CGFloat(cgImage.height),
      width: relativeRect.size.width * CGFloat(cgImage.width),
      height: relativeRect.size.height * CGFloat(cgImage.height)
    ).integral

    let boundedRect = absoluteRect.intersection(CGRect(x: 0, y: 0, width: cgImage.width, height: cgImage.height))
    guard !boundedRect.isEmpty,
          let cropped = cgImage.cropping(to: boundedRect) else {
      return nil
    }

    return UIImage(cgImage: cropped, scale: image.scale, orientation: .up)
  }

  private func normalizeOrientation(_ image: UIImage) -> UIImage? {
    if image.imageOrientation == .up {
      return image
    }

    let renderer = UIGraphicsImageRenderer(size: image.size)
    return renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: image.size))
    }
  }

  /// Resize so the longest side is at most `maxLongestSide`, preserving aspect
  /// ratio. Returns the image unchanged when it is already within bounds.
  /// Renders at scale 1 (no Retina multiplier) so the pixel dimensions — and
  /// therefore the decoded byte size — actually shrink.
  private func downscaleForOcr(_ image: UIImage, maxLongestSide: CGFloat) -> UIImage? {
    let longest = max(image.size.width, image.size.height)
    guard longest > maxLongestSide else {
      return image
    }

    let scale = maxLongestSide / longest
    let newSize = CGSize(
      width: (image.size.width * scale).rounded(),
      height: (image.size.height * scale).rounded()
    )

    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = true
    let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
    return renderer.image { _ in
      image.draw(in: CGRect(origin: .zero, size: newSize))
    }
  }

  private func resolveImageURL(from uri: String) throws -> URL {
    if let url = URL(string: uri), url.isFileURL {
      return url
    }

    if uri.hasPrefix("/") {
      return URL(fileURLWithPath: uri)
    }

    throw NSError(
      domain: "CardScanMlKitService",
      code: 2000,
      userInfo: [NSLocalizedDescriptionKey: "Unsupported image URI: \(uri)"]
    )
  }

  private func computeImageMetrics(cgImage: CGImage) -> (
    sharpnessScore: Double,
    exposureScore: Double,
    glareScore: Double,
    recaptureScore: Double
  ) {
    guard let provider = cgImage.dataProvider,
          let data = provider.data,
          let buffer = CFDataGetBytePtr(data) else {
      return (0.4, 0.4, 0.5, 0.5)
    }

    let bytesPerPixel = max(1, cgImage.bitsPerPixel / 8)
    let bytesPerRow = cgImage.bytesPerRow
    let width = cgImage.width
    let height = cgImage.height

    let stepX = max(1, width / 220)
    let stepY = max(1, height / 160)

    var luminanceValues: [Double] = []
    luminanceValues.reserveCapacity((width / stepX) * (height / stepY))

    func luminanceAt(x: Int, y: Int) -> Double {
      let offset = y * bytesPerRow + x * bytesPerPixel
      guard offset + 2 < CFDataGetLength(data) else { return 0 }
      let r = Double(buffer[offset])
      let g = Double(buffer[offset + 1])
      let b = Double(buffer[offset + 2])
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    var glareCount = 0
    var alternatingDeltaSum = 0.0
    var alternatingPairs = 0

    for y in stride(from: 0, to: height, by: stepY) {
      for x in stride(from: 0, to: width, by: stepX) {
        let lum = luminanceAt(x: x, y: y)
        luminanceValues.append(lum)
        if lum > 240 {
          glareCount += 1
        }

        let x2 = min(width - 1, x + stepX)
        let y2 = min(height - 1, y + stepY)
        let neighbor = luminanceAt(x: x2, y: y)
        let diagonal = luminanceAt(x: x2, y: y2)
        alternatingDeltaSum += abs(lum - neighbor) + abs(lum - diagonal)
        alternatingPairs += 2
      }
    }

    guard !luminanceValues.isEmpty else {
      return (0.4, 0.4, 0.5, 0.5)
    }

    let n = Double(luminanceValues.count)
    let mean = luminanceValues.reduce(0, +) / n
    let variance = luminanceValues.reduce(0) { sum, value in
      let d = value - mean
      return sum + d * d
    } / n
    let stdDev = sqrt(max(0, variance))

    var gradientTotal = 0.0
    var gradientCount = 0
    for y in stride(from: stepY, to: height, by: stepY) {
      for x in stride(from: stepX, to: width, by: stepX) {
        let c = luminanceAt(x: x, y: y)
        let l = luminanceAt(x: x - stepX, y: y)
        let u = luminanceAt(x: x, y: y - stepY)
        gradientTotal += abs(c - l) + abs(c - u)
        gradientCount += 2
      }
    }

    let avgGradient = gradientCount > 0 ? gradientTotal / Double(gradientCount) : 0
    let sharpnessScore = clamp(avgGradient / 38.0)

    let exposureScore = clamp(1.0 - abs(mean - 145.0) / 145.0)

    let glareRatio = Double(glareCount) / n
    let glareScore = clamp(1.0 - glareRatio * 2.4)

    let alternatingEnergy = alternatingPairs > 0 ? alternatingDeltaSum / Double(alternatingPairs) : 0
    let recaptureScore = clamp((alternatingEnergy / 65.0) * 0.55 + (1.0 - stdDev / 90.0) * 0.45)

    return (sharpnessScore, exposureScore, glareScore, recaptureScore)
  }

  private func clamp(_ value: Double) -> Double {
    min(1.0, max(0.0, value))
  }
}
