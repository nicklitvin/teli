import Foundation

/// Content-based recommendations, the same as the web app's: each title is a weighted feature
/// vector (genres, themes, director or network, type, decade), similarity is cosine, and a
/// candidate's score comes from its similarity to what you've rated, weighted by your verdict.
/// Agreeing ratings add up with diminishing returns (the closest in full, the next half, the next
/// a quarter), so liking five Marvel films doesn't make every Marvel film outscore everything else.
final class Recommender {
    static let shared = Recommender()
    private let catalog = Catalog.shared

    private enum W {
        static let genre = 1.0, tag = 1.6, creator = 2.2, type = 0.6, decade = 0.4
    }

    /// Each title's features as (feature number, weight), and its vector length.
    private var vectors: [[(Int, Double)]] = []
    private var norms: [Double] = []
    private var featureIds: [String: Int] = [:]
    /// Every feature lists the titles that have it, so one rated title is scored against all titles in a few passes.
    private var posts: [[(Int, Double)]] = []

    private init() {}

    /// The catalog spells some themes more than one way ("mcu" and "Marvel Cinematic Universe", "Paris" and "paris").
    private static let tagAlias = ["marvel cinematic universe": "mcu", "dc extended universe": "dc"]
    static func tagKey(_ tag: String) -> String {
        let k = tag.lowercased().replacingOccurrences(of: "-", with: " ")
        return tagAlias[k] ?? k
    }
    /// How many titles have each theme: a rare one (a franchise, a character) ties titles together.
    private lazy var tagCounts: [String: Int] = {
        var m: [String: Int] = [:]
        for t in catalog.titles { for k in Set(t.tags.map(Self.tagKey)) { m[k, default: 0] += 1 } }
        return m
    }()

    private func features(_ t: Title) -> [(String, Double)] {
        var f: [(String, Double)] = t.genres.map { ("g:\($0)", W.genre) }
        f += t.tags.map { ("t:\(Self.tagKey($0))", W.tag) }
        if !t.creator.isEmpty { f.append(("c:\(t.creator)", W.creator)) }
        f.append(("type:\(t.type.rawValue)", W.type))
        f.append(("d:\(t.year / 10)", W.decade))
        // A title can list the same genre or theme twice; keep one.
        var seen = Set<String>()
        return f.filter { seen.insert($0.0).inserted }
    }

    /// Indexes any titles not indexed yet (hand-added ones join on the end).
    private func catchUp() {
        let titles = catalog.titles
        guard vectors.count < titles.count else { return }
        for i in vectors.count..<titles.count {
            var v: [(Int, Double)] = []
            var sq = 0.0
            for (k, w) in features(titles[i]) {
                let f: Int
                if let known = featureIds[k] { f = known } else {
                    f = posts.count
                    featureIds[k] = f
                    posts.append([])
                }
                posts[f].append((i, w))
                v.append((f, w))
                sq += w * w
            }
            vectors.append(v)
            norms.append(sq.squareRoot())
        }
    }

    /// Cosine similarity of two titles, by catalog position.
    func similarity(_ a: Int, _ b: Int) -> Double {
        catchUp()
        guard a < vectors.count, b < vectors.count, norms[a] > 0, norms[b] > 0 else { return 0 }
        var dot = 0.0
        for (f, x) in vectors[a] { for (g, y) in vectors[b] where g == f { dot += x * y } }
        return dot / (norms[a] * norms[b])
    }

    /// Close enough that hiding one should keep the other away for a while: alike overall, or sharing a rare theme.
    func related(_ a: Int, _ b: Int) -> Bool {
        if similarity(a, b) >= 0.35 { return true }
        let ta = catalog.titles[a], tb = catalog.titles[b]
        let ka = Set(ta.tags.map(Self.tagKey))
        return tb.tags.contains { x in
            let k = Self.tagKey(x)
            return ka.contains(k) && (tagCounts[k] ?? 0) <= 60
        }
    }

    /// Similarity of one title to every title (only those sharing a feature are non-zero).
    private func dots(from i: Int, into dot: inout [Double], touched: inout [Int]) {
        for (f, x) in vectors[i] {
            for (j, y) in posts[f] {
                if dot[j] == 0 { touched.append(j) }
                dot[j] += x * y
            }
        }
    }

    func recommend(ratings: [String: Rating], dismissed: Set<String>) -> [Rec] {
        catchUp()
        let rated: [(i: Int, w: Double, good: Bool)] = ratings.values.compactMap { r in
            guard let i = catalog.order(of: r.id) else { return nil }
            return (i, r.verdict.pull(again: r.review.again), r.verdict == .good)
        }
        guard !rated.isEmpty else { return [] }
        let n = catalog.titles.count
        let scale = Double(rated.count).squareRoot()
        var total = [Double](repeating: 0, count: n)
        // Each title's three biggest pulls from titles you liked, biggest first.
        var top = [Double](repeating: 0, count: n * 3)
        var best = [Double](repeating: 0, count: n)
        var because = [Int](repeating: -1, count: n)
        var dot = [Double](repeating: 0, count: n)
        var touched: [Int] = []
        touched.reserveCapacity(n)

        for r in rated {
            dots(from: r.i, into: &dot, touched: &touched)
            for j in touched {
                let s = dot[j] / (norms[j] * norms[r.i])
                dot[j] = 0
                guard s >= 0.15 else { continue }
                let c = s * s * r.w
                if c > 0 {
                    var x = c
                    for k in (j * 3)..<(j * 3 + 3) where x > top[k] { swap(&x, &top[k]) }
                } else {
                    total[j] += c
                }
                if r.good && c > best[j] {
                    best[j] = c
                    because[j] = r.i
                }
            }
            touched.removeAll(keepingCapacity: true)
        }

        for j in 0..<n { total[j] += top[j * 3] + 0.5 * top[j * 3 + 1] + 0.25 * top[j * 3 + 2] }
        var out: [Rec] = []
        for j in 0..<n where total[j] > 0 {
            let t = catalog.titles[j]
            if ratings[t.id] != nil || dismissed.contains(t.id) { continue }
            let prior = 0.04 * (1 - Double(j) / Double(n))
            out.append(Rec(title: t, score: total[j] / scale + prior, because: because[j] >= 0 ? catalog.titles[because[j]] : nil))
        }
        return out.sorted { $0.score > $1.score }
    }

    /// The titles most like `id`.
    func similar(to id: String, limit: Int = 15, minSim: Double = 0.2) -> [Title] {
        catchUp()
        guard let i = catalog.order(of: id) else { return [] }
        var dot = [Double](repeating: 0, count: catalog.titles.count)
        var touched: [Int] = []
        dots(from: i, into: &dot, touched: &touched)
        return touched.filter { $0 != i }
            .map { ($0, dot[$0] / (norms[$0] * norms[i])) }
            .filter { $0.1 >= minSim }
            .sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0 < $1.0 }
            .prefix(limit)
            .map { catalog.titles[$0.0] }
    }

    // MARK: Feeds

    /// A number in [0, 1) fixed for a seed and title, so a feed keeps its order when one title drops out.
    private static func jitter(_ seed: UInt32, _ id: String) -> Double {
        var h: UInt32 = 2166136261 ^ seed
        for u in id.utf16 { h = (h ^ UInt32(u)) &* 16777619 }
        h = (h ^ (h >> 16)) &* 0x85ebca6b
        h = (h ^ (h >> 13)) &* 0xc2b2ae35
        return Double(h ^ (h >> 16)) / 4294967296
    }

    /// Gumbel noise: added to log-weights, always taking the highest draws at random in proportion to weight.
    private static func gumbel(_ seed: UInt32, _ id: String) -> Double {
        -log(-log(min(1 - 1e-12, max(1e-12, jitter(seed, id)))))
    }

    /// Titles from your last few feeds are five times less likely to come up again soon.
    private static let seenPenalty = log(0.2)

    /// Two titles this alike (same franchise, same director and kind of film) count as more of the same.
    private static let alike = 0.45
    /// Each title already in the feed that's alike makes the next one this much less likely.
    private static let repeatPenalty = log(0.35)
    /// The first page of a feed: titles like ones you just hid stay out of it.
    static let firstPage = 8

    /// Your picks in a new order for each seed: strong matches lead most feeds without always being
    /// the same ones. To keep it varied, a title alike to ones already in the feed (or picked because
    /// of the same favourite, by the same creator, or sharing a main genre with the last few) is
    /// pushed back. Titles related to any in `avoid` (ones you hid, most recent first) stay out of
    /// the next page and sit lower after it. `start` is the feed so far, kept as it is.
    func shuffle(_ recs: [Rec], seed: UInt32, seen: Set<String> = [], avoid: [String] = [], start: [Rec] = []) -> [Rec] {
        catchUp()
        let mix = 300
        let maxScore = recs.first?.score ?? 1
        let kept = Set(start.map(\.title.id))
        let avoided = avoid.prefix(30).compactMap { catalog.order(of: $0) }
        struct Card { let r: Rec; let i: Int; let k: Double; var alike: Double; let shunned: Bool }
        var left: [Card] = recs.prefix(mix).filter { !kept.contains($0.title.id) }.compactMap { r in
            guard let i = catalog.order(of: r.title.id) else { return nil }
            let k = 2 * log(max(1e-6, r.score / maxScore)) + Self.gumbel(seed, r.title.id) + (seen.contains(r.title.id) ? Self.seenPenalty : 0)
            return Card(r: r, i: i, k: k, alike: 0, shunned: avoided.contains { related($0, i) })
        }
        var because: [String: Double] = [:]
        var creators: [String: Double] = [:]
        var out: [Rec] = []
        func add(_ r: Rec) {
            if let b = r.because { because[b.id, default: 0] += 1 }
            if !r.title.creator.isEmpty { creators[r.title.creator, default: 0] += 1 }
            // Variety matters most near the top; further down, skip the cost of comparing.
            if out.count < 60, let i = catalog.order(of: r.title.id) {
                for j in left.indices where similarity(i, left[j].i) >= Self.alike { left[j].alike += 1 }
            }
            out.append(r)
        }
        for r in start { add(r) }
        while !left.isEmpty {
            let recent = out.suffix(3).compactMap { $0.title.genres.first }
            // The next page's worth of cards leaves out titles like ones you hid.
            let early = out.count < start.count + Self.firstPage && left.contains { !$0.shunned }
            var best = -1
            var bestScore = -Double.infinity
            for (i, x) in left.enumerated() {
                if early && x.shunned { continue }
                var s = x.k + Self.repeatPenalty * min(4, x.alike)
                s += log(0.6) * ((because[x.r.because?.id ?? ""] ?? 0) + (creators[x.r.title.creator] ?? 0))
                if let g = x.r.title.genres.first, recent.contains(g) { s += log(0.75) }
                if x.shunned { s += log(0.25) }
                if s > bestScore { bestScore = s; best = i }
            }
            add(left.remove(at: best).r)
        }
        return out + recs.dropFirst(mix).filter { !kept.contains($0.title.id) }
    }

    /// Discover: well-known titles from genres and themes you haven't rated anything in, with your
    /// taste breaking ties, rotating between frontiers.
    func discover(ratings: [String: Rating], dismissed: Set<String>, recs: [Rec], seed: UInt32, seen: Set<String> = []) -> [Rec] {
        guard !ratings.isEmpty else { return [] }
        let themes = Set(catalog.themes)
        var seenGenres: [String: Double] = [:]
        var seenThemes = Set<String>()
        for r in ratings.values {
            guard let t = catalog[r.id] else { continue }
            for g in t.genres { seenGenres[g, default: 0] += 1 }
            for x in t.tags { seenThemes.insert(x) }
        }
        var fit: [String: Double] = [:]
        for r in recs { fit[r.title.id] = r.score }
        let maxFit = recs.first?.score ?? 1
        let home = max(3, Double(ratings.count) / 4)
        let n = Double(catalog.titles.count)

        var pool: [Rec] = []
        for (i, t) in catalog.titles.enumerated() {
            if ratings[t.id] != nil || dismissed.contains(t.id) || t.genres.isEmpty { continue }
            let newGenres = t.genres.filter { seenGenres[$0] == nil }
            let newThemes = t.tags.filter { themes.contains($0) && !seenThemes.contains($0) }
            if newGenres.isEmpty && newThemes.isEmpty { continue }
            let familiar = t.genres.reduce(0.0) { $0 + min(1, (seenGenres[$1] ?? 0) / home) } / Double(t.genres.count)
            let novelty = Double(newGenres.count) + 0.6 * Double(newThemes.count) + 0.5 * (1 - familiar)
            let known = 1 - Double(i) / n
            let f = max(0, (fit[t.id] ?? 0) / maxFit)
            let score = novelty * (0.15 + known * known) * (0.6 + 0.8 * f) * (t.image != nil ? 1 : 0.5)
            pool.append(Rec(title: t, score: score, because: nil, frontier: Array((newGenres + newThemes).prefix(3)), close: f >= 0.35))
        }
        pool.sort { $0.score > $1.score }

        let maxScore = pool.first?.score ?? 1
        var left = pool.prefix(600).map { r in
            (r: r, k: 1.5 * log(max(1e-6, r.score / maxScore)) + Self.gumbel(seed, r.title.id) + (seen.contains(r.title.id) ? Self.seenPenalty : 0))
        }
        var used: [String: Double] = [:]
        var out: [Rec] = []
        while !left.isEmpty && out.count < 200 {
            var best = 0
            var bestScore = -Double.infinity
            for (i, x) in left.enumerated() {
                let s = x.k + log(0.55) * (used[x.r.frontier.first ?? ""] ?? 0)
                if s > bestScore { bestScore = s; best = i }
            }
            let r = left.remove(at: best).r
            used[r.frontier.first ?? "", default: 0] += 1
            out.append(r)
        }
        return out
    }
}
