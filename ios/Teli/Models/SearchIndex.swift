import Foundation

/// Finds titles by name, director or network, genre, theme, year or acronym ("lotr", "gotg"),
/// scored the same way as the web app.
final class SearchIndex {
    static let shared = SearchIndex()

    private struct Entry {
        let i: Int
        let title: String
        let compact: String
        let words: [String]
        let acronym: String
        let extra: String
    }

    private var entries: [Entry] = []

    static func normalize(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .init(identifier: "en"))
            .lowercased()
            .replacingOccurrences(of: "&", with: " and ")
            .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    /// Indexes any titles not indexed yet (built on the first search, extended as titles are added).
    private func catchUp() {
        let titles = Catalog.shared.titles
        guard entries.count < titles.count else { return }
        for i in entries.count..<titles.count {
            let t = titles[i]
            let title = Self.normalize(t.title)
            let words = title.split(separator: " ").map(String.init)
            entries.append(Entry(
                i: i,
                title: title,
                compact: title.replacingOccurrences(of: " ", with: ""),
                words: words,
                acronym: String(words.compactMap(\.first)),
                extra: Self.normalize(([t.creator] + t.genres + t.tags.map { $0.replacingOccurrences(of: "-", with: " ") }).joined(separator: " "))
            ))
        }
    }

    private func score(_ e: Entry, _ q: String, _ tokens: [String], year: Int) -> Int {
        if e.title == q { return 100 }
        if e.title.hasPrefix(q) { return 80 }
        if e.words.contains(where: { $0.hasPrefix(q) }) { return 65 }
        if e.title.contains(q) { return 50 }
        let qc = q.replacingOccurrences(of: " ", with: "")
        if qc.count > 2 && e.compact.contains(qc) { return 45 }
        if tokens.count == 1 && q.count > 2 && e.acronym.contains(q) { return 40 }
        // Every word must match somewhere: title words, year, director or network, genres or themes.
        var s = 0
        for tok in tokens {
            if e.words.contains(where: { $0.hasPrefix(tok) }) { s += 6 }
            else if String(year) == tok { s += 5 }
            else if e.extra.contains(tok) { s += 3 }
            else { return 0 }
        }
        return 10 + s
    }

    /// Titles matching `query`, optionally one type and only titles in any of `genres`.
    func search(_ query: String, type: MediaType? = nil, genres: Set<String> = [], limit: Int = 80) -> [Title] {
        catchUp()
        let titles = Catalog.shared.titles
        let q = Self.normalize(query)
        let pool = entries.filter { e in
            let t = titles[e.i]
            return (type == nil || t.type == type) && (genres.isEmpty || t.genres.contains { genres.contains($0) })
        }
        if q.isEmpty { return pool.prefix(limit).map { titles[$0.i] } }
        let tokens = q.split(separator: " ").map(String.init)
        return pool
            .compactMap { e -> (Entry, Int)? in
                let s = score(e, q, tokens, year: titles[e.i].year)
                return s > 0 ? (e, s) : nil
            }
            .sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0.i < $1.0.i }
            .prefix(limit)
            .map { titles[$0.0.i] }
    }
}
