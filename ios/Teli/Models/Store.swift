import Foundation
import Observation

/// Your data and everything that changes it. Saved as JSON in Application Support after every change.
@Observable
final class Store {
    private(set) var data: AppData {
        didSet {
            guard data != oldValue else { return }
            ratingsCache = nil
            if data.reviews != oldValue.reviews || data.dismissed != oldValue.dismissed { recsCache = nil }
            save()
        }
    }

    @ObservationIgnored private var ratingsCache: [String: Rating]?
    @ObservationIgnored private var recsCache: [Rec]?
    @ObservationIgnored private let catalog = Catalog.shared

    init() {
        data = AppData()
        data = Self.sanitize(Self.loadFile())
    }

    // MARK: Reading

    var ratings: [String: Rating] {
        if let r = ratingsCache { return r }
        var m: [String: Rating] = [:]
        for (id, r) in data.reviews {
            if let t = catalog[id] { m[id] = Rating(id: id, type: t.type, review: r) }
        }
        ratingsCache = m
        return m
    }

    /// Your recommendations, best first (computed once per change to your ratings or hidden titles).
    var recommendations: [Rec] {
        if let r = recsCache { return r }
        let r = Recommender.shared.recommend(ratings: ratings, dismissed: Set(data.dismissed))
        recsCache = r
        return r
    }

    func isSaved(_ id: String) -> Bool { data.watchlist.contains(id) }
    func isDismissed(_ id: String) -> Bool { data.dismissed.contains(id) }
    var ratedCount: Int { data.reviews.count }

    /// Titles carried over from the old rankings that still need a look.
    var pendingIds: [String] { data.reviews.filter { $0.value.pending == true }.map(\.key) }

    // MARK: Changing

    /// Save your rating for `id`, keeping when you first logged it. Rating something off your watchlist counts as watching it from there.
    func rate(_ id: String, verdict: Verdict, note: String, again: Bool) {
        guard catalog[id] != nil else { return }
        var d = data
        let prev = d.reviews[id]
        let fromList = prev?.fromList ?? (d.watchlist.contains(id) ? d.saved[id] ?? 0 : nil)
        d.reviews[id] = Review(verdict: verdict, note: ReviewNote.clean(note), again: again, at: prev?.at ?? Date().ms, pending: nil, fromList: fromList)
        d.watchlist.removeAll { $0 == id }
        d.dismissed.removeAll { $0 == id }
        d.saved[id] = nil
        keepCustom(&d, id)
        data = d
    }

    func unrate(_ id: String) {
        data.reviews[id] = nil
    }

    func toggleWatchlist(_ id: String) {
        var d = data
        if d.watchlist.contains(id) {
            d.watchlist.removeAll { $0 == id }
            d.saved[id] = nil
        } else {
            d.watchlist.insert(id, at: 0)
            d.saved[id] = Date().ms
            keepCustom(&d, id)
        }
        d.dismissed.removeAll { $0 == id }
        data = d
    }

    func toggleDismissed(_ id: String) {
        var d = data
        if d.dismissed.contains(id) {
            d.dismissed.removeAll { $0 == id }
        } else {
            d.dismissed.append(id)
            d.watchlist.removeAll { $0 == id }
            d.saved[id] = nil
        }
        data = d
    }

    /// Adds a title the catalog doesn't have and returns its id (or the existing one's).
    func addTitle(type: MediaType, title: String, year: Int, genres: [String], creator: String) -> String {
        if let real = catalog.findShipped(type: type, title: title, year: year) { return real.id }
        let t = Title(id: Catalog.customId(type: type, title: title, year: year), title: title.trimmingCharacters(in: .whitespaces),
                      year: year, type: type, genres: Array(genres.prefix(3)), tags: [], creator: creator.trimmingCharacters(in: .whitespaces))
        guard let added = catalog.addCustom([t]).first else { return t.id }
        var d = data
        keepCustom(&d, added.id)
        data = d
        return added.id
    }

    func replace(with d: AppData) { data = Self.sanitize(d) }
    func reset() { data = AppData() }

    /// Keeps a hand-added title with your data once you rate or save it.
    private func keepCustom(_ d: inout AppData, _ id: String) {
        guard id.hasPrefix("u-"), !d.custom.contains(where: { $0.id == id }), let t = catalog[id] else { return }
        d.custom.append(t)
    }

    // MARK: Backups

    /// Your data as a backup file the web app can import too.
    func exportFile() throws -> URL {
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        let day = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate])
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("teli-backup-\(day).json")
        try enc.encode(data).write(to: url, options: .atomic)
        return url
    }

    /// Reads a backup file (from either app); throws if it isn't one or holds nothing we recognize.
    static func parseBackup(_ raw: Data) throws -> AppData {
        struct NotABackup: Error {}
        guard let any = try? JSONSerialization.jsonObject(with: raw) as? [String: Any], any["reviews"] != nil else { throw NotABackup() }
        let d = sanitize(try JSONDecoder().decode(LooseData.self, from: raw).data)
        if d.reviews.isEmpty && d.watchlist.isEmpty { throw NotABackup() }
        return d
    }

    // MARK: Storage

    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("teli-data.json")
    }

    private static func loadFile() -> AppData {
        guard let raw = try? Data(contentsOf: fileURL), let d = try? JSONDecoder().decode(LooseData.self, from: raw) else { return AppData() }
        return d.data
    }

    private func save() {
        let snapshot = data
        DispatchQueue.global(qos: .utility).async {
            try? JSONEncoder().encode(snapshot).write(to: Self.fileURL, options: .atomic)
        }
    }

    /// Accepts anything a backup might hold and returns valid data: unknown ids dropped, merged
    /// duplicates followed, notes tidied, hand-added titles joined to the catalog first.
    static func sanitize(_ x: AppData) -> AppData {
        let catalog = Catalog.shared
        var d = AppData()
        d.custom = catalog.addCustom(x.custom)
        for (raw, r) in x.reviews {
            let id = catalog.resolve(raw)
            guard catalog[id] != nil, d.reviews[id] == nil else { continue }
            var r = r
            r.note = ReviewNote.clean(r.note)
            d.reviews[id] = r
        }
        var seen = Set<String>()
        d.watchlist = x.watchlist.map(catalog.resolve).filter { catalog[$0] != nil && d.reviews[$0] == nil && seen.insert($0).inserted }
        for (raw, at) in x.saved {
            let id = catalog.resolve(raw)
            if d.watchlist.contains(id) { d.saved[id] = at }
        }
        seen = []
        d.dismissed = x.dismissed.map(catalog.resolve).filter { catalog[$0] != nil && seen.insert($0).inserted }
        return d
    }
}

/// Decodes a backup leniently: missing fields default, a bad review or title is skipped rather than failing the whole file.
private struct LooseData: Decodable {
    var data = AppData()

    private struct Lossy<T: Decodable>: Decodable {
        let value: T?
        init(from decoder: Decoder) throws { value = try? T(from: decoder) }
    }

    private enum Keys: String, CodingKey { case reviews, watchlist, dismissed, custom, saved, tags }
    private struct OldTag: Decodable { let id: String; let label: String }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        // Keyword names from before notes, to turn old keywords into notes.
        let labels = Dictionary(((try? c.decode([Lossy<OldTag>].self, forKey: .tags)) ?? []).compactMap(\.value).map { ($0.id, $0.label) },
                                uniquingKeysWith: { a, _ in a })
        if let reviews = try? c.decode([String: Lossy<LooseReview>].self, forKey: .reviews) {
            for (id, r) in reviews {
                guard let loose = r.value, var review = loose.review else { continue }
                if review.note == nil { review.note = ReviewNote.from(tags: loose.oldTags, labels: labels) }
                data.reviews[id] = review
            }
        }
        data.watchlist = (try? c.decode([String].self, forKey: .watchlist)) ?? []
        data.dismissed = (try? c.decode([String].self, forKey: .dismissed)) ?? []
        data.custom = ((try? c.decode([Lossy<Title>].self, forKey: .custom)) ?? []).compactMap(\.value).filter {
            $0.id.range(of: "^u-[mt]-[a-z0-9-]{1,140}$", options: .regularExpression) != nil
        }
        data.saved = (try? c.decode([String: Double].self, forKey: .saved)) ?? [:]
    }
}

/// A review from any version of the web app ("ok" was once "mid"; notes were once keywords).
private struct LooseReview: Decodable {
    var review: Review?
    var oldTags: [String] = []
    private enum Keys: String, CodingKey { case verdict, note, tags, again, at, pending, fromList }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        oldTags = (try? c.decode([String].self, forKey: .tags)) ?? []
        let raw = (try? c.decode(String.self, forKey: .verdict)) ?? ""
        guard let verdict = Verdict(rawValue: raw == "mid" ? "ok" : raw) else {
            review = nil
            return
        }
        review = Review(
            verdict: verdict,
            note: ReviewNote.clean(try? c.decode(String.self, forKey: .note)),
            again: (try? c.decode(Bool.self, forKey: .again)) ?? false,
            at: (try? c.decode(Double.self, forKey: .at)) ?? 0,
            pending: (try? c.decode(Bool.self, forKey: .pending)) == true ? true : nil,
            fromList: try? c.decode(Double.self, forKey: .fromList)
        )
    }
}
