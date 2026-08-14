import AppKit

struct Label {
  let title: String
  let subtitle: String
  let horizontalOffset: CGFloat
}

func render(input: String, label: Label) throws {
  let sourceURL = URL(fileURLWithPath: input)
  guard let image = NSImage(contentsOf: sourceURL) else {
    throw NSError(domain: "CoverLabels", code: 1)
  }
  let canvas = NSImage(size: NSSize(width: 1672, height: 941))
  canvas.lockFocus()
  image.draw(in: CGRect(x: 0, y: 0, width: 1672, height: 941))

  let titleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Verdana-Bold", size: 42)!,
    .foregroundColor: NSColor(calibratedRed: 0.85, green: 0.73, blue: 0.42, alpha: 1),
    .strokeColor: NSColor.black.withAlphaComponent(0.6),
    .strokeWidth: -1.5
  ]
  let subtitleAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Verdana-Bold", size: 25)!,
    .foregroundColor: NSColor(calibratedRed: 0.96, green: 0.89, blue: 0.69, alpha: 1),
    .strokeColor: NSColor.black.withAlphaComponent(0.6),
    .strokeWidth: -1.2
  ]

  let title = NSAttributedString(string: label.title, attributes: titleAttributes)
  let subtitle = NSAttributedString(string: label.subtitle, attributes: subtitleAttributes)
  let anchorX = 836 + label.horizontalOffset
  title.draw(at: CGPoint(x: anchorX - title.size().width / 2, y: 475))
  subtitle.draw(at: CGPoint(x: anchorX - subtitle.size().width / 2, y: 405))
  canvas.unlockFocus()
  guard let tiff = canvas.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.96]) else {
    throw NSError(domain: "CoverLabels", code: 2)
  }
  try data.write(to: sourceURL)
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard arguments.count == 4 else {
  fatalError("Usage: ajouter-texte-couvertures-packs.swift <image> <titre> <sous-titre> <decalage-x>")
}
try render(input: arguments[0], label: Label(title: arguments[1], subtitle: arguments[2], horizontalOffset: CGFloat(Double(arguments[3])!)))
