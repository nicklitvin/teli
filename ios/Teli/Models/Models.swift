import Foundation

enum MediaType: String, Codable, CaseIterable, Identifiable {
    case movie, tv
    var id: String { rawValue }
    var label: String { self == .movie ? "Movie" : "TV Show" }
    var plural: String { self == .movie ? "Movies" : "Shows" }
    var noun: String { self == .movie ? "movies" : "shows" }
}

enum Verdict: String, Codable, CaseIterable, Identifiable {
    case good, ok, bad
    var id: String { rawValue }
    var label: String {
        switch self {
        case .good: "Good"
        case .ok: "Ok"
        case .bad: "Bad"
        }
    }
    /** How strongly a rating pulls similar titles up (positive) or pushes them down (negative). */
    func pull(again: Bool) -> Double {
        let base: Double = switch self {
        case .good: 0.75
        case .ok: -0.1
        case .bad: -0.9
        }
        return base + (again ? 0.25 : 0)
    }
}

/// A poster: a short path ("en/8/81/File.jpg" on Wikimedia, "tvm/1/4600.jpg" on TVmaze) and the original size.
struct ImageRef: Hashable {
    let path: String
    let width: Double
    let height: Double
    var aspect: Double { height > 0 ? width / height : 0.67 }
    var isTVmaze: Bool { path.hasPrefix("tvm/") }
}

struct Title: Identifiable, Hashable, Codable {
    let id: String
    let title: String
    let year: Int
    let type: MediaType
    let genres: [String]
    let tags: [String]
    /// Director for movies, network for shows.
    let creator: String
    var image: ImageRef?

    enum CodingKeys: String, CodingKey { case id, title, year, type, genres, tags, creator }

    init(id: String, title: String, year: Int, type: MediaType, genres: [String], tags: [String], creator: String, image: ImageRef? = nil) {
        self.id = id
        self.title = title
        self.year = year
        self.type = type
        self.genres = genres
        self.tags = tags
        self.creator = creator
        self.image = image
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        year = try c.decode(Int.self, forKey: .year)
        type = try c.decode(MediaType.self, forKey: .type)
        genres = (try? c.decode([String].self, forKey: .genres)) ?? []
        tags = (try? c.decode([String].self, forKey: .tags)) ?? []
        creator = (try? c.decode(String.self, forKey: .creator)) ?? ""
        image = nil
    }

    var metaLine: String {
        [String(year), type.label, genres.prefix(2).joined(separator: ", ")].filter { !$0.isEmpty }.joined(separator: " · ")
    }
    var decade: String { "\(year / 10 * 10)s" }
    var isCustom: Bool { id.hasPrefix("u-") }
}

/// What you thought of a title. Field names match the web app's backups.
struct Review: Codable, Equatable {
    var verdict: Verdict
    var tags: [String]
    var again: Bool
    /// When you first logged it, in milliseconds since 1970.
    var at: Double
    /// Carried over from the old ranking system and not reviewed yet.
    var pending: Bool?
    /// It was on your watchlist when you rated it: when you'd saved it (0 if that wasn't kept).
    var fromList: Double?

    var date: Date { Date(timeIntervalSince1970: at / 1000) }
}

struct Rating: Identifiable, Equatable {
    let id: String
    let type: MediaType
    let review: Review
    var verdict: Verdict { review.verdict }
}

/// A rating keyword. Ratings store the id, so renaming one keeps it on them.
struct Tag: Codable, Hashable, Identifiable {
    var id: String
    var label: String

    static let defaults: [Tag] = ["silly", "sad", "quirky", "slog", "cozy", "tense", "funny", "beautiful", "hype", "hopeful", "creepy"]
        .map { Tag(id: $0, label: $0.prefix(1).uppercased() + $0.dropFirst()) }
    static let maxCount = 16
    static let maxLength = 16
    /// Tags from the first tag list that have a close match in the current one.
    static let old: [String: String] = [
        "gripping": "tense", "comfort": "cozy", "scary": "creepy", "slow": "slog", "long": "slog", "visuals": "beautiful", "moving": "sad",
    ]

    /// The id for a new keyword: its label, lowercase and hyphenated.
    static func makeId(_ label: String) -> String {
        let folded = label.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .init(identifier: "en")).lowercased()
        let hyphenated = folded.replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
        let trimmed = hyphenated.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return String(trimmed.prefix(32))
    }

    static func isValidId(_ s: String) -> Bool {
        s.range(of: "^[a-z0-9][a-z0-9-]{0,31}$", options: .regularExpression) != nil
    }

    /// A keyword's name: from your list, else the defaults, else made from its id (one you've since removed).
    static func label(for id: String, in tags: [Tag]) -> String {
        if let t = tags.first(where: { $0.id == id }) { return t.label }
        if let t = defaults.first(where: { $0.id == id }) { return t.label }
        let words = id.replacingOccurrences(of: "-", with: " ")
        return words.prefix(1).uppercased() + words.dropFirst()
    }

    /// A valid keyword list: trimmed, unique, at most `maxCount`.
    static func clean(_ list: [Tag]) -> [Tag] {
        var out: [Tag] = []
        for t in list {
            let label = String(t.label.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLength))
            guard !label.isEmpty, isValidId(t.id),
                  !out.contains(where: { $0.id == t.id || $0.label.lowercased() == label.lowercased() }) else { continue }
            out.append(Tag(id: t.id, label: label))
            if out.count == maxCount { break }
        }
        return out
    }
}

/// Everything you've saved. The same shape as the web app's backup file, so backups move between them.
struct AppData: Codable, Equatable {
    var reviews: [String: Review] = [:]
    var watchlist: [String] = []
    var dismissed: [String] = []
    /// Titles you added by hand because the catalog didn't have them.
    var custom: [Title] = []
    /// When each title on your watchlist was saved (ms since 1970).
    var saved: [String: Double] = [:]
    /// Your rating keywords, once you've changed them (until then, the defaults).
    var tags: [Tag]?
}

/// One recommendation.
struct Rec: Identifiable, Hashable {
    let title: Title
    var score: Double
    /// The title you rated good that contributed most to this pick.
    var because: Title?
    /// Discover mode: the genres and themes in it you haven't rated anything from yet.
    var frontier: [String] = []
    /// Discover mode: close to things you liked, even though it's new ground.
    var close = false
    var id: String { title.id }
}

extension Date {
    var ms: Double { timeIntervalSince1970 * 1000 }
}
