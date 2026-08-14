import AppKit
import CoreImage

let args = Array(CommandLine.arguments.dropFirst())
guard args.count == 4,
      let angle = Float(args[2]),
      let saturation = Float(args[3]) else {
  fatalError("Usage: decliner-coffrets-packs.swift <source> <destination> <angle-degres> <saturation>")
}

let source = URL(fileURLWithPath: args[0])
let destination = URL(fileURLWithPath: args[1])
guard let image = CIImage(contentsOf: source),
      let hue = CIFilter(name: "CIHueAdjust"),
      let controls = CIFilter(name: "CIColorControls") else {
  fatalError("Image source ou filtre indisponible")
}

hue.setValue(image, forKey: kCIInputImageKey)
hue.setValue(angle * .pi / 180, forKey: kCIInputAngleKey)
controls.setValue(hue.outputImage, forKey: kCIInputImageKey)
controls.setValue(saturation, forKey: kCIInputSaturationKey)

let context = CIContext(options: nil)
guard let output = controls.outputImage,
      let cgImage = context.createCGImage(output, from: output.extent) else {
  fatalError("Rendu impossible")
}
let bitmap = NSBitmapImageRep(cgImage: cgImage)
guard let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.96]) else {
  fatalError("Export JPEG impossible")
}
try data.write(to: destination)
