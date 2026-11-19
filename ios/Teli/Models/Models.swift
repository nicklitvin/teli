import Foundation

enum MediaType: String, Codable, CaseIterable, Identifiable {
    case movie, tv
    var id: String { rawValue }
    var label: String { self == .movie ? "Movie" : "TV Show" }
    var plural: String { self == .movie ? "Movies" : "Shows" }
    var noun: String { self == .movie ? "movies" : "shows" }
}

/// Good, ok or bad, or `dnf`: you didn't finish it.
enum Verdict: String, Codable, CaseIterable, Identifiable {
    case good, ok, bad, dnf
    var id: String { rawValue }
    var label: String {
        switch self {
        case .good: "Good"
        case .ok: "Ok"
        case .bad: "Bad"
        case .dnf: "Didn’t finish"
        }
    }
    /// How strongly a rating pulls similar titles up (positive) or pushes them down (negative).
    /// Giving up on something counts against titles like it, but less than bad.
    func pull(again: Bool) -> Double {
        let base: Double = switch self {
        case .good: 0.75
        case .ok: -0.1
        case .bad: -0.9
        case .dnf: -0.5
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
    /// A short note about it, up to `ReviewNote.maxLength` characters.
    var note: String?
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

/// A rating's note: a line, not a review.
enum ReviewNote {
    static let maxLength = 100

    /// One line, trimmed, at most `maxLength` characters; nil when empty.
    static func clean(_ s: String?) -> String? {
        guard let s else { return nil }
        let line = s.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return line.isEmpty ? nil : String(line.prefix(maxLength))
    }

    /// Ratings from before notes had keywords ("cozy", "tense", or ones renamed in `labels`); they
    /// carry over as the note, "Cozy, tense".
    static func from(tags: [String], labels: [String: String]) -> String? {
        var words: [String] = []
        for id in tags where !id.isEmpty {
            let w = labels[id] ?? id.replacingOccurrences(of: "-", with: " ")
            let word = words.isEmpty ? w.prefix(1).uppercased() + w.dropFirst() : w.lowercased()
            if !words.contains(word) { words.append(word) }
        }
        return clean(words.joined(separator: ", "))
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
