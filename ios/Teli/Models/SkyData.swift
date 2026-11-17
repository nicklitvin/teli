import Foundation
import SwiftUI

/// The Galaxy map, built offline by scripts/build-map.mjs: every shipped title's spot (0–1 on both
/// axes, lined up with the catalog by position) and its neighbourhood. A neighbourhood is every
/// patch the build gave the same name; its label sits on the biggest one.
final class SkyData {
    static let shared = SkyData()

    struct Patch { let x: Double; let y: Double; let r: Double; let n: Int }

    struct Hood: Identifiable {
        let id: Int
        let label: String
        let color: Color
        let n: Int
        let parts: [Patch]
        var x: Double { parts[0].x }
        var y: Double { parts[0].y }
    }

    private(set) var xs: [Double] = []
    private(set) var ys: [Double] = []
    private(set) var hoodOf: [Int] = []
    private(set) var hoods: [Hood] = []
    /// The part of the map holding nearly everything, for fitting it to the screen.
    private(set) var extent = CGRect(x: 0, y: 0, width: 1, height: 1)
    var count: Int { xs.count }
    var isReady: Bool { !xs.isEmpty }

    private init() {
        guard let url = Bundle.main.url(forResource: "map", withExtension: "json"),
              let raw = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
              let n = json["n"] as? Int, n == Catalog.shared.shippedCount,
              let points = json["points"] as? String,
              let bin = Data(base64Encoded: points),
              let clusters = json["clusters"] as? [[String: Any]] else { return }
        let scale = 65535.0
        hoods = clusters.enumerated().map { id, c in
            let parts = ((c["parts"] as? [[NSNumber]]) ?? []).map {
                Patch(x: $0[0].doubleValue / scale, y: $0[1].doubleValue / scale, r: $0[2].doubleValue / scale, n: $0[3].intValue)
            }
            return Hood(id: id, label: c["label"] as? String ?? "", color: Catalog.color(forGenre: c["genre"] as? String ?? ""),
                        n: (c["n"] as? NSNumber)?.intValue ?? 0, parts: parts.isEmpty ? [Patch(x: 0.5, y: 0.5, r: 0.01, n: 0)] : parts)
        }
        let bytes = [UInt8](bin)
        xs.reserveCapacity(n)
        for i in 0..<n {
            let o = i * 5
            guard o + 4 < bytes.count else { break }
            xs.append(Double(UInt16(bytes[o]) | UInt16(bytes[o + 1]) << 8) / scale)
            ys.append(Double(UInt16(bytes[o + 2]) | UInt16(bytes[o + 3]) << 8) / scale)
            hoodOf.append(Int(bytes[o + 4]))
        }
        let sx = xs.sorted(), sy = ys.sorted()
        let lo = Int(Double(sx.count) * 0.01), hi = Int(Double(sx.count) * 0.99)
        extent = CGRect(x: sx[lo], y: sy[lo], width: sx[hi] - sx[lo], height: sy[hi] - sy[lo])
    }

    /// Spot for any catalog position; hand-added titles sit by the best-known title sharing their main genre.
    func point(_ i: Int) -> CGPoint? {
        if i < xs.count { return CGPoint(x: xs[i], y: ys[i]) }
        let titles = Catalog.shared.titles
        guard i < titles.count, let g = titles[i].genres.first,
              let j = titles.prefix(xs.count).firstIndex(where: { $0.genres.first == g && $0.type == titles[i].type }) else { return nil }
        return CGPoint(x: xs[j] + 0.003, y: ys[j] + 0.003)
    }

    func hood(at i: Int) -> Hood? { i < hoodOf.count && hoodOf[i] < hoods.count ? hoods[hoodOf[i]] : nil }
}
