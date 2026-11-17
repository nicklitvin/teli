import Foundation
import SwiftUI

/// The library: every title from the bundled catalog.json (popularity order), their posters from
/// images.json, merged-duplicate ids from aliases.json, and titles you added by hand on the end.
final class Catalog {
    static let shared = Catalog()

    private(set) var titles: [Title] = []
    private(set) var index: [String: Int] = [:]
    /// How many titles ship in the catalog; hand-added ones go after these.
    private(set) var shippedCount = 0
    private var aliases: [String: String] = [:]
    /// Hand-added titles that a catalog update now has, pointing at the real entry.
    private var customAlias: [String: String] = [:]
    private var shippedByName: [String: [Int]] = [:]
    private(set) var genres: [String] = []

    private init() {
        titles = Self.load("catalog", as: [Title].self) ?? []
        shippedCount = titles.count
        if let url = Bundle.main.url(forResource: "images", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let raw = try? JSONSerialization.jsonObject(with: data) as? [String: [Any]] {
            for i in titles.indices {
                guard let v = raw[titles[i].id], v.count == 3, let path = v[0] as? String else { continue }
                let w = (v[1] as? NSNumber)?.doubleValue ?? 0
                let h = (v[2] as? NSNumber)?.doubleValue ?? 0
                titles[i].image = ImageRef(path: path, width: w, height: h)
            }
        }
        aliases = Self.load("aliases", as: [String: String].self) ?? [:]
        for (i, t) in titles.enumerated() {
            index[t.id] = i
            shippedByName["\(t.type.rawValue):\(Self.plain(t.title))", default: []].append(i)
        }
        var counts: [String: Int] = [:]
        for t in titles { for g in t.genres { counts[g, default: 0] += 1 } }
        genres = counts.sorted { $0.value > $1.value }.map(\.key)
    }

    private static func load<T: Decodable>(_ name: String, as type: T.Type) -> T? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    subscript(id: String) -> Title? { index[id].map { titles[$0] } }
    func order(of id: String) -> Int? { index[id] }

    /// Ids of duplicates that were merged away (or hand-added titles the catalog now has) point at the entry that was kept.
    func resolve(_ id: String) -> String { aliases[id] ?? customAlias[id] ?? id }

    static func plain(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .init(identifier: "en"))
            .lowercased()
            .replacingOccurrences(of: "&", with: " and ")
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    /// The catalog's own entry for this title, if it has one (same type and name, year within a year or two).
    func findShipped(type: MediaType, title: String, year: Int) -> Title? {
        let slack = type == .tv ? 2 : 1
        return shippedByName["\(type.rawValue):\(Self.plain(title))"]?
            .map { titles[$0] }
            .first { abs($0.year - year) <= slack }
    }

    static func customId(type: MediaType, title: String, year: Int) -> String {
        var slug = String(plain(title).replacingOccurrences(of: " ", with: "-").prefix(100))
        while slug.hasSuffix("-") { slug.removeLast() }
        return "u-\(type == .movie ? "m" : "t")-\(slug.isEmpty ? "untitled" : slug)-\(year)"
    }

    /// Adds hand-made titles for this session and returns the ones still hand-made; any the catalog now has point at the real entry.
    @discardableResult
    func addCustom(_ list: [Title]) -> [Title] {
        var kept: [Title] = []
        for t in list {
            if let real = findShipped(type: t.type, title: t.title, year: t.year) {
                customAlias[t.id] = real.id
                continue
            }
            if index[t.id] == nil {
                index[t.id] = titles.count
                titles.append(t)
            }
            if !kept.contains(where: { $0.id == t.id }), let i = index[t.id] { kept.append(titles[i]) }
        }
        return kept
    }

    // MARK: Posters

    /// Wikimedia only serves these thumbnail widths to other apps (others are refused), and rate-limits full-size originals.
    private static let steps = [120, 250, 330, 500]

    /// The URL to load a title's image at about `px` pixels wide.
    static func imageURL(_ ref: ImageRef, px: Int) -> URL? {
        if ref.isTVmaze {
            let size = px > 330 ? "original_untouched" : "medium_portrait"
            return URL(string: "https://static.tvmaze.com/uploads/images/\(size)/\(ref.path.dropFirst(4))")
        }
        let parts = ref.path.split(separator: "/", maxSplits: 3).map(String.init)
        guard parts.count == 4 else { return nil }
        let (project, a, b, name) = (parts[0], parts[1], parts[2], parts[3])
        let want = min(Double(px), ref.width * 0.9)
        let step = steps.first { Double($0) >= want } ?? steps.last!
        let ext = name.split(separator: ".").last.map { $0.lowercased() } ?? ""
        let file: String = switch ext {
        case "svg": "\(step)px-\(name).png"
        case "webm", "ogv": "\(step)px--\(name).jpg"
        case "tif", "tiff": "lossy-page1-\(step)px-\(name).jpg"
        default: "\(step)px-\(name)"
        }
        return URL(string: "https://thumb.wikimedia.org/wikipedia/\(project)/thumb/\(a)/\(b)/\(name)/\(file)")
    }

    // MARK: Genres

    static let genreHex: [String: UInt32] = [
        "Action": 0xF24822, "Adventure": 0xFF8C1A, "Animation": 0xFFC700, "Comedy": 0xFF7262,
        "Crime": 0x5551FF, "Documentary": 0x8C8C8C, "Drama": 0x0D99FF, "Family": 0x0ACF83,
        "Fantasy": 0xA259FF, "History": 0xB07B4F, "Horror": 0x9B2148, "Music": 0xFF4FB8,
        "Musical": 0xD96BE0, "Mystery": 0x1ABCFE, "Reality": 0xFFA629, "Romance": 0xFF5C8A,
        "Sci-Fi": 0x00B8A9, "Sports": 0x14AE5C, "Thriller": 0x4B3FB8, "War": 0x7A8A3A, "Western": 0xC9772F,
    ]
    static func color(forGenre g: String) -> Color { Color(hex: genreHex[g] ?? 0x8E8E93) }

    /// Recognizable titles to rate first.
    static let starterNames = [
        "The Dark Knight", "Breaking Bad", "Inception", "The Office", "Interstellar", "Stranger Things",
        "Pulp Fiction", "Friends", "Parasite", "Game of Thrones", "Spirited Away", "The Godfather",
        "Toy Story", "Succession", "Barbie", "Oppenheimer", "The Bear", "Forrest Gump", "Severance",
        "Titanic", "The Matrix", "Ted Lasso", "Avengers: Endgame", "The Social Network", "Fleabag",
        "La La Land", "Get Out", "The Last of Us", "Squid Game", "Dune", "Parks and Recreation",
    ]
    lazy var starters: [Title] = Self.starterNames.compactMap { n in titles.first { $0.title == n } }

    /// The themes and creators that come up often enough to highlight on the map.
    lazy var themes: [String] = {
        var counts: [String: Int] = [:]
        for t in titles { for x in t.tags { counts[x, default: 0] += 1 } }
        return counts.filter { $0.value >= 40 }.sorted { $0.value > $1.value }.map(\.key)
    }()
    lazy var decades: [String] = {
        var counts: [String: Int] = [:]
        for t in titles { counts[t.decade, default: 0] += 1 }
        return counts.filter { $0.value >= 15 }.map(\.key).sorted()
    }()
    lazy var creators: [String] = {
        var counts: [String: Int] = [:]
        for t in titles where !t.creator.isEmpty { counts[t.creator, default: 0] += 1 }
        return counts.filter { $0.value >= 12 }.sorted { $0.value > $1.value }.map(\.key)
    }()
}
