import CoreImage
import Foundation
import UIKit
import Vision

final class CardScanVisionService {
  struct OcrImageResult {
    let lines: [String]
    let sharpnessScore: Double
    let exposureScore: Double
    let glareScore: Double
    let recaptureScore: Double
  }

  func recognizeTextFromImage(uri: String) throws -> OcrImageResult {
    let imageURL = try resolveImageURL(from: uri)
    guard let data = try? Data(contentsOf: imageURL),
          let image = UIImage(data: data),
          let cgImage = image.cgImage else {
      throw NSError(
        domain: "CardScanVisionService",
        code: 1001,
        userInfo: [NSLocalizedDescriptionKey: "Unable to load image for OCR from URI: \(uri)"]
      )
    }

    let variants = buildImageVariants(cgImage: cgImage)
    var lineScores: [String: Double] = [:]

    for (variant, weight) in variants {
      let recognized = recognizeLines(cgImage: variant)
      for line in recognized {
        let normalized = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { continue }
        lineScores[normalized, default: 0] += weight
      }
    }

    let lines = lineScores
      .sorted { lhs, rhs in
        if lhs.value == rhs.value {
          return lhs.key.count > rhs.key.count
        }
        return lhs.value > rhs.value
      }
      .prefix(48)
      .map(\.key)

    let metrics = computeImageMetrics(cgImage: cgImage)

    return OcrImageResult(
      lines: lines,
      sharpnessScore: metrics.sharpnessScore,
      exposureScore: metrics.exposureScore,
      glareScore: metrics.glareScore,
      recaptureScore: metrics.recaptureScore
    )
  }

  private func resolveImageURL(from uri: String) throws -> URL {
    if let url = URL(string: uri), url.isFileURL {
      return url
    }

    if uri.hasPrefix("/") {
      return URL(fileURLWithPath: uri)
    }

    throw NSError(
      domain: "CardScanVisionService",
      code: 1000,
      userInfo: [NSLocalizedDescriptionKey: "Unsupported image URI: \(uri)"]
    )
  }

  private func buildImageVariants(cgImage: CGImage) -> [(CGImage, Double)] {
    var variants: [(CGImage, Double)] = [(cgImage, 1.0)]

    let ciImage = CIImage(cgImage: cgImage)

    if let highContrast = applyColorControls(
      image: ciImage,
      brightness: 0.02,
      contrast: 1.25,
      saturation: 0.0
    ) {
      variants.append((highContrast, 0.85))
    }

    if let embossedBoost = applyColorControls(
      image: ciImage,
      brightness: 0.08,
      contrast: 1.45,
      saturation: 0.0
    ) {
      variants.append((embossedBoost, 0.8))
    }

    return variants
  }

  private func applyColorControls(
    image: CIImage,
    brightness: Double,
    contrast: Double,
    saturation: Double
  ) -> CGImage? {
    let context = CIContext(options: nil)
    let params: [String: Any] = [
      kCIInputImageKey: image,
      kCIInputBrightnessKey: brightness,
      kCIInputContrastKey: contrast,
      kCIInputSaturationKey: saturation
    ]

    guard let filtered = CIFilter(name: "CIColorControls", parameters: params)?.outputImage else {
      return nil
    }

    return context.createCGImage(filtered, from: filtered.extent)
  }

  private func recognizeLines(cgImage: CGImage) -> [String] {
    var output: [String] = []

    let requests: [VNRecognizeTextRequest] = {
      let accurate = VNRecognizeTextRequest()
      accurate.recognitionLevel = .accurate
      accurate.usesLanguageCorrection = false

      let fast = VNRecognizeTextRequest()
      fast.recognitionLevel = .fast
      fast.usesLanguageCorrection = false

      return [accurate, fast]
    }()

    for request in requests {
      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
        let observations = request.results as? [VNRecognizedTextObservation] ?? []

        for observation in observations {
          if let best = observation.topCandidates(1).first {
            output.append(best.string.uppercased())
          }
        }
      } catch {
        continue
      }
    }

    return output
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
    return min(1.0, max(0.0, value))
  }
}
