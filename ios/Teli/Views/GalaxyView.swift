import SwiftUI
import UIKit

/// Small posters for names on the map, loaded as they're first needed. `version` changes as each
/// arrives, so the map (which reads it) draws again.
@Observable
final class Thumbs {
    static let shared = Thumbs()
    private(set) var version = 0
    @ObservationIgnored private var images: [String: UIImage] = [:]
    @ObservationIgnored private var asked = Set<String>()

    func image(for t: Title) -> UIImage? {
        if let img = images[t.id] { return img }
        guard let ref = t.image, !asked.contains(t.id), let url = Catalog.imageURL(ref, px: 120) else { return nil }
        asked.insert(t.id)
        Task {
            guard let loaded = try? await URLSession.shared.data(from: url), let img = UIImage(data: loaded.0) else { return }
            await MainActor.run {
                self.images[t.id] = img
                self.version += 1
            }
        }
        return nil
    }
}

/// The galaxy: every title on one map, similar ones together, your ratings lit up as
/// constellations. Drag to pan, pinch to zoom. Only things with a name showing can be tapped: a
/// title's name (or its dot) opens it, a neighbourhood's name opens its card. Names hold their place
/// while the map moves and new ones fade in once it settles. Filters show what you've seen,
/// haven't, or both, turn names off or put posters beside them, and highlight any mix of genres, decades, themes
/// and creators. Uncharted flies you to a neighbourhood you've barely rated that holds a lot of your picks.
struct GalaxyView: View {
    enum Show: String, CaseIterable, Identifiable {
        case all = "Both", seen = "Seen", unseen = "Not seen"
        var id: String { rawValue }
    }
    enum Dimension: String, CaseIterable, Identifiable {
        case genres = "Genres", decades = "Decades", themes = "Themes", creators = "Creators"
        var id: String { rawValue }
    }
    enum Focus: Equatable { case title(Int), hood(Int) }

    /// What the last frame drew a name for, in screen points: all a tap can land on. A class, so the
    /// Canvas can fill it in as it draws without making the view draw again.
    final class Targets {
        var titles: [(i: Int, dot: CGPoint, box: CGRect)] = []
        var hoods: [(id: Int, box: CGRect)] = []
        /// Names showing on the last frame and when each appeared: they keep their place as the map
        /// moves (instead of reshuffling every frame), and new ones fade in.
        var shownTitles: [Int: Date] = [:]
        var shownHoods: [Int: Date] = [:]
    }

    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @AppStorage("teli.sky.names") private var names = true
    @AppStorage("teli.sky.posters") private var posters = false
    /// Dragging or pinching: only names already showing are drawn until the map settles.
    @State private var moving = false
    /// Just settled: keep drawing a moment so new names fade in.
    @State private var settledAt: Date?
    @State private var picks: [Dimension: Set<String>] = [:]
    @State private var lit: Set<Int>?
    @State private var show: Show = .all
    @State private var focus: Focus?
    @State private var showFilters = false
    @State private var cam = Camera()
    @State private var flight: Flight?
    @State private var lastHood: Int?
    @State private var dragLast: CGSize = .zero
    @State private var pinchLast: CGFloat = 1
    @State private var mapSize: CGSize = .zero
    @State private var targets = Targets()

    private let sky = SkyData.shared
    private let catalog = Catalog.shared

    struct Camera: Equatable { var x = 0.5, y = 0.5, s = 0.0, fit = 0.0 }
    struct Flight: Equatable { var from: Camera; var to: Camera; var start: Date }

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                ZStack(alignment: .top) {
                    if sky.isReady {
                        map(size: geo.size)
                    } else {
                        Text("The map needs rebuilding: run npm run map.").foregroundStyle(Theme.text2)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        topBar(size: geo.size)
                        if anyFilter { activeChips }
                    }
                    VStack { Spacer(); card }
                }
                .onAppear {
                    mapSize = geo.size
                    if cam.s == 0 { fitAll(geo.size) }
                    settle()
                }
                .onChange(of: geo.size) { mapSize = geo.size }
            }
            .background(RadialGradient(colors: [Color(hex: 0x0B0D24), Color(hex: 0x04050E)], center: .center, startRadius: 0, endRadius: 600).ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showFilters) {
                filters.presentationDetents([.medium, .large]).presentationBackground(.ultraThinMaterial)
            }
            .onChange(of: picks) { lit = Self.highlight(picks, sky: sky, catalog: catalog) }
        }
    }

    // MARK: Data for drawing

    private var ratedIdx: [(i: Int, v: Verdict)] {
        let all: [(i: Int, v: Verdict)] = store.ratings.values.compactMap { r in catalog.order(of: r.id).map { (i: $0, v: r.verdict) } }
        return all.filter { $0.i < sky.count }
    }
    private var watchIdx: [Int] { store.data.watchlist.compactMap { catalog.order(of: $0) }.filter { $0 < sky.count } }
    private var seenSet: Set<Int> { Set(ratedIdx.map(\.i)) }

    static func keys(_ dim: Dimension, _ t: Title) -> [String] {
        switch dim {
        case .genres: t.genres
        case .themes: t.tags
        case .decades: [t.decade]
        case .creators: t.creator.isEmpty ? [] : [t.creator]
        }
    }
    private func universe(_ dim: Dimension) -> [String] {
        switch dim {
        case .genres: catalog.genres
        case .themes: catalog.themes
        case .decades: catalog.decades
        case .creators: catalog.creators
        }
    }

    /// Titles matching the picks: any of a section's picks, and every section that has one.
    static func highlight(_ picks: [Dimension: Set<String>], sky: SkyData, catalog: Catalog) -> Set<Int>? {
        let active = picks.filter { !$0.value.isEmpty }
        guard !active.isEmpty else { return nil }
        return Set((0..<sky.count).filter { i in
            let t = catalog.titles[i]
            return active.allSatisfy { entry in keys(entry.key, t).contains { entry.value.contains($0) } }
        })
    }

    private var pickCount: Int { picks.values.reduce(0) { $0 + $1.count } }
    private var anyFilter: Bool { pickCount > 0 || show != .all }
    /// "Comedy / Romance · 1990s", or when that's too long for the card, "Comedy + 2 more".
    private var pickName: String {
        let parts = Dimension.allCases.compactMap { d -> String? in
            let ks = (picks[d] ?? []).sorted()
            return ks.isEmpty ? nil : ks.joined(separator: " / ")
        }
        let full = parts.joined(separator: " · ")
        guard full.count > 22, pickCount > 1 else { return full }
        let first = Dimension.allCases.lazy.compactMap { (self.picks[$0] ?? []).sorted().first }.first ?? full
        return "\(first) + \(pickCount - 1) more"
    }

    // MARK: Map

    private func currentCam(_ now: Date) -> Camera {
        guard let f = flight else { return cam }
        let k = min(1, now.timeIntervalSince(f.start) / 0.7)
        let e = k < 0.5 ? 4 * k * k * k : 1 - pow(-2 * k + 2, 3) / 2
        var c = f.to
        c.x = f.from.x + (f.to.x - f.from.x) * e
        c.y = f.from.y + (f.to.y - f.from.y) * e
        c.s = exp(log(f.from.s) + (log(f.to.s) - log(f.from.s)) * e)
        return c
    }

    private func map(size: CGSize) -> some View {
        let all = ratedIdx
        let rated = show == .unseen ? [] : all
        let watch = show == .seen ? [] : watchIdx
        let seen = Set(all.map(\.i))
        let lit = self.lit
        let links = Self.constellations(rated.map(\.i), sky: sky)
        let byHood = Self.byHood(sky)
        let show = self.show
        let focusHood = focusedHood
        let selected = selectedTitle
        let bottom: CGFloat = focus == nil && lit == nil ? 0 : 230
        let targets = self.targets
        let still = !moving && flight == nil
        let posters = names && self.posters
        _ = Thumbs.shared.version  // draw again as posters arrive

        return TimelineView(.animation(paused: flight == nil && settledAt == nil)) { tl in
            let c = currentCam(tl.date)
            Canvas { ctx, sz in
                Self.draw(ctx: &ctx, size: sz, cam: c, sky: sky, byHood: byHood, rated: rated, watch: watch, links: links, seen: seen,
                          highlight: lit, show: show, names: names, posters: posters, focusHood: focusHood, selected: selected,
                          bottom: bottom, targets: targets, now: tl.date, still: still)
            }
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in
                    flight = nil
                    if !moving { moving = true }
                    let d = CGSize(width: v.translation.width - dragLast.width, height: v.translation.height - dragLast.height)
                    dragLast = v.translation
                    cam.x = clamp01(cam.x - d.width / cam.s)
                    cam.y = clamp01(cam.y - d.height / cam.s)
                }
                .onEnded { _ in dragLast = .zero; settle() }
                .simultaneously(with: MagnifyGesture()
                    .onChanged { v in
                        flight = nil
                        if !moving { moving = true }
                        let f = v.magnification / pinchLast
                        pinchLast = v.magnification
                        let anchor = CGPoint(x: v.startAnchor.x * size.width, y: v.startAnchor.y * size.height)
                        zoom(at: anchor, by: f, size: size)
                    }
                    .onEnded { _ in pinchLast = 1; settle() })
        )
        .simultaneousGesture(SpatialTapGesture().onEnded { v in tap(v.location) })
        .accessibilityLabel("Map of every title, with your ratings as constellations")
    }

    private func clamp01(_ v: Double) -> Double { min(1, max(0, v)) }

    /// The map has stopped: new names may appear, and keep drawing long enough for them to fade in.
    private func settle() {
        moving = false
        let at = Date()
        settledAt = at
        Task {
            try? await Task.sleep(for: .milliseconds(400))
            if settledAt == at { settledAt = nil }
        }
    }

    private var focusedHood: Int? {
        if case .hood(let h) = focus { return h }
        return nil
    }
    private var selectedTitle: Int? {
        if case .title(let i) = focus { return i }
        return nil
    }

    private func zoom(at p: CGPoint, by f: Double, size: CGSize) {
        let wx = cam.x + (p.x - size.width / 2) / cam.s
        let wy = cam.y + (p.y - size.height / 2) / cam.s
        cam.s = min(cam.fit * 140, max(cam.fit * 0.8, cam.s * f))
        cam.x = clamp01(wx - (p.x - size.width / 2) / cam.s)
        cam.y = clamp01(wy - (p.y - size.height / 2) / cam.s)
    }

    private func fitAll(_ size: CGSize) {
        let e = sky.extent
        let fit = min(size.width / (e.width * 1.08), size.height / (e.height * 1.08))
        cam = Camera(x: e.midX, y: e.midY, s: fit, fit: fit)
    }

    /// Flies the view to a spot, zoomed so `span` of the map fills most of it.
    private func fly(to p: CGPoint, span: Double, size: CGSize, bottom: CGFloat) {
        var to = cam
        let room = size.height - bottom
        to.s = min(cam.fit * 40, max(cam.fit * 1.5, min(size.width / span, room / span) * 0.7))
        to.x = p.x
        to.y = p.y + bottom / 2 / to.s
        flight = Flight(from: cam, to: to, start: Date())
        cam = to
        Task {
            try? await Task.sleep(for: .milliseconds(720))
            flight = nil
            settle()
        }
    }

    /// The middle and size of a set of titles (ignoring the farthest tenth), for flying to them.
    private func frameOf(_ ids: [Int]) -> (center: CGPoint, span: Double)? {
        guard !ids.isEmpty else { return nil }
        let xs = ids.map { sky.xs[$0] }.sorted()
        let ys = ids.map { sky.ys[$0] }.sorted()
        let lo = Int(Double(ids.count) * 0.05)
        let hi = max(lo, Int((Double(ids.count) * 0.95).rounded(.up)) - 1)
        return (CGPoint(x: xs[ids.count / 2], y: ys[ids.count / 2]), max(xs[hi] - xs[lo], ys[hi] - ys[lo], 0.004))
    }

    /// A tap only lands on something with a name showing: the title whose dot is within reach (the
    /// nearest, if several) or whose name it's on, else the neighbourhood whose name it's on.
    private func tap(_ p: CGPoint) {
        func on(_ r: CGRect) -> Bool { !r.isEmpty && r.insetBy(dx: -6, dy: -6).contains(p) }
        var pick: Int?
        var best = Double.infinity
        for t in targets.titles {
            let d = Double(hypot(t.dot.x - p.x, t.dot.y - p.y))
            let score = d <= 18 ? d : on(t.box) ? 19 : .infinity
            if score < best { best = score; pick = t.i }
        }
        if let pick { return focus = .title(pick) }
        if let h = targets.hoods.first(where: { on($0.box) }) { return focus = .hood(h.id) }
        if case .hood = focus { return }
        focus = nil
    }

    /// Adds or removes a pick, and flies to wherever the highlighted titles now are.
    private func togglePick(_ d: Dimension, _ k: String) {
        var next = picks
        var set = next[d] ?? []
        if set.contains(k) { set.remove(k) } else { set.insert(k) }
        next[d] = set
        picks = next
        focus = nil
        guard mapSize != .zero, let ids = Self.highlight(next, sky: sky, catalog: catalog) else { return }
        let seen = seenSet
        let shown = ids.filter { show == .all || seen.contains($0) == (show == .seen) }
        if let f = frameOf(Array(shown)) { fly(to: f.center, span: f.span, size: mapSize, bottom: 230) }
    }

    private func clearFilters() {
        picks = [:]
        show = .all
    }

    // MARK: Drawing

    private static var hoodCache: [[Int]]?
    static func byHood(_ sky: SkyData) -> [[Int]] {
        if let c = hoodCache { return c }
        var m = Array(repeating: [Int](), count: sky.hoods.count)
        for i in 0..<sky.count where sky.hoodOf[i] < m.count { m[sky.hoodOf[i]].append(i) }
        hoodCache = m
        return m
    }

    /// Your ratings joined into constellations: a minimum spanning tree, keeping only short links.
    static func constellations(_ ids: [Int], sky: SkyData) -> [(Int, Int)] {
        let n = ids.count
        guard n > 1 else { return [] }
        var inTree = [Bool](repeating: false, count: n)
        var best = [Double](repeating: .infinity, count: n)
        var from = [Int](repeating: -1, count: n)
        var edges: [(Int, Int)] = []
        best[0] = 0
        for _ in 0..<n {
            var u = -1
            for i in 0..<n where !inTree[i] && (u < 0 || best[i] < best[u]) { u = i }
            inTree[u] = true
            if from[u] >= 0 && best[u] <= 0.045 { edges.append((ids[from[u]], ids[u])) }
            for i in 0..<n where !inTree[i] {
                let d = hypot(sky.xs[ids[i]] - sky.xs[ids[u]], sky.ys[ids[i]] - sky.ys[ids[u]])
                if d < best[i] { best[i] = d; from[i] = u }
            }
        }
        return edges
    }

    static func draw(ctx: inout GraphicsContext, size: CGSize, cam c: Camera, sky: SkyData, byHood: [[Int]], rated: [(i: Int, v: Verdict)],
                     watch: [Int], links: [(Int, Int)], seen: Set<Int>, highlight: Set<Int>?, show: Show, names: Bool, posters: Bool,
                     focusHood: Int?, selected: Int?, bottom: CGFloat, targets: Targets, now: Date, still: Bool) {
        targets.titles = []
        targets.hoods = []
        let was = (titles: targets.shownTitles, hoods: targets.shownHoods)
        var nowTitles: [Int: Date] = [:]
        var nowHoods: [Int: Date] = [:]
        defer {
            targets.shownTitles = nowTitles
            targets.shownHoods = nowHoods
        }
        /// How far a name has faded in; nil when it's new and the map is still moving.
        func appear(_ memo: [Int: Date], _ id: Int) -> Double? {
            guard let since = memo[id] ?? (still ? now : nil) else { return nil }
            return min(1, now.timeIntervalSince(since) / 0.26)
        }
        guard c.s > 0 else { return }
        func sx(_ x: Double) -> CGFloat { (x - c.x) * c.s + size.width / 2 }
        func sy(_ y: Double) -> CGFloat { (y - c.y) * c.s + size.height / 2 }
        let zoom = c.s / max(c.fit, 1e-9)
        let grow = min(2.2, pow(zoom, 0.35))
        let n = Double(Catalog.shared.titles.count)
        let onScreen = { (x: CGFloat, y: CGFloat, m: CGFloat) in x > -m && y > -m && x < size.width + m && y < size.height + m }
        let faded = { (i: Int) in highlight.map { !$0.contains(i) } ?? false }

        // Nebulae: a soft glow of each neighbourhood's colour, so the sky reads as regions.
        for h in sky.hoods {
            for p in h.parts {
                let r = sqrt(Double(p.n)) * 0.0042 * c.s
                let center = CGPoint(x: sx(p.x), y: sy(p.y))
                ctx.fill(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                         with: .radialGradient(Gradient(colors: [h.color.opacity(0.15), h.color.opacity(0)]), center: center, startRadius: 0, endRadius: r))
            }
        }
        // Dots: well-known titles a little bigger, everything a bit bigger as you zoom in. Showing only
        // what you've seen leaves them out (your stars are drawn below); only what you haven't skips yours.
        if show != .seen {
            for (hid, ids) in byHood.enumerated() {
                var dim = Path()
                var bright = Path()
                for i in ids {
                    if show == .unseen && seen.contains(i) { continue }
                    let x = sx(sky.xs[i]), y = sy(sky.ys[i])
                    guard onScreen(x, y, 4) else { continue }
                    let pop = 1 - Double(i) / n
                    let isLit = highlight?.contains(i) ?? true
                    let r = (0.45 + 1.3 * pop * pop * pop) * grow * (highlight != nil && isLit ? 1.25 : 1)
                    let rect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
                    if !isLit {
                        dim.addRect(rect)
                    } else if r < 1.1 {
                        bright.addRect(rect)
                    } else {
                        bright.addEllipse(in: rect)
                    }
                }
                let color = sky.hoods[hid].color
                if highlight != nil { ctx.fill(dim, with: .color(color.opacity(0.08))) }
                ctx.fill(bright, with: .color(color.opacity(highlight != nil ? 0.95 : 0.55)))
            }
        }

        // Constellations, watchlist rings, then your stars; ones outside the highlight fade back.
        var lines = Path()
        for (a, b) in links {
            lines.move(to: CGPoint(x: sx(sky.xs[a]), y: sy(sky.ys[a])))
            lines.addLine(to: CGPoint(x: sx(sky.xs[b]), y: sy(sky.ys[b])))
        }
        ctx.stroke(lines, with: .color(Color(red: 0.86, green: 0.88, blue: 1).opacity(0.32)), lineWidth: 1)
        for i in watch {
            let x = sx(sky.xs[i]), y = sy(sky.ys[i])
            guard onScreen(x, y, 10) else { continue }
            let r = 3.6 + grow * 0.6
            ctx.stroke(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                       with: .color(Color(hex: 0xA79BFF).opacity(faded(i) ? 0.22 : 0.85)), lineWidth: 1.3)
        }
        for (i, v) in rated {
            let x = sx(sky.xs[i]), y = sy(sky.ys[i])
            guard onScreen(x, y, 12) else { continue }
            let big = v == .good ? 1.25 : v == .ok ? 1 : 0.8
            let halo = (5 + grow) * big, core = (1.8 + grow * 0.45) * big
            let color = Theme.verdict(v)
            ctx.opacity = faded(i) ? 0.22 : 1
            ctx.fill(Path(ellipseIn: CGRect(x: x - halo, y: y - halo, width: halo * 2, height: halo * 2)), with: .color(color.opacity(0.25)))
            ctx.fill(Path(ellipseIn: CGRect(x: x - core, y: y - core, width: core * 2, height: core * 2)), with: .color(color))
            if v == .good {
                let w = 1.1 * big
                ctx.fill(Path(ellipseIn: CGRect(x: x - w, y: y - w, width: w * 2, height: w * 2)), with: .color(.white))
            }
        }
        ctx.opacity = 1
        if let s = selected, s < sky.count {
            let x = sx(sky.xs[s]), y = sy(sky.ys[s]), r = 9 + grow
            ctx.stroke(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(.white), lineWidth: 2)
        }
        guard names else {
            // No names to tap, so your own stars and watchlist rings are the targets.
            targets.titles = (rated.map(\.i) + watch).map { (i: $0, dot: CGPoint(x: sx(sky.xs[$0]), y: sy(sky.ys[$0])), box: CGRect.zero) }
            return
        }

        // Labels, skipping any that would overlap one already placed, each on a dark pill so it reads over bright patches.
        var boxes: [CGRect] = []
        func fits(_ r: CGRect) -> Bool {
            guard r.minX > 4, r.minY > 64, r.maxX < size.width - 4, r.maxY < size.height - 4 - bottom,
                  !boxes.contains(where: { $0.intersects(r) }) else { return false }
            boxes.append(r)
            return true
        }
        // The tapped title's name goes first, so nothing covers it; it's drawn last, on top.
        var selectedLabel: (text: GraphicsContext.ResolvedText, rect: CGRect)?
        if let s = selected, s < sky.count {
            let text = ctx.resolve(Text(Catalog.shared.titles[s].title).font(.system(size: 13.5, weight: .semibold)).foregroundColor(.white))
            let ts = text.measure(in: CGSize(width: 400, height: 40))
            let dot = CGPoint(x: sx(sky.xs[s]), y: sy(sky.ys[s]))
            let rect = CGRect(x: dot.x - ts.width / 2 - 9, y: dot.y - 34, width: ts.width + 18, height: 24)
            boxes.append(rect)
            targets.titles.append((i: s, dot: dot, box: rect))
            selectedLabel = (text, rect)
        }
        let hoodAlpha = max(0, min(1, (5 - zoom) / 2.5))
        if hoodAlpha > 0 {
            // Names already showing keep their spot; then the biggest neighbourhoods.
            let order = sky.hoods.sorted { a, b in
                let (sa, sb) = (was.hoods[a.id] != nil, was.hoods[b.id] != nil)
                return sa != sb ? sa : a.n > b.n
            }
            for h in order {
                if !still && was.hoods[h.id] == nil { continue }
                let text = ctx.resolve(Text(h.label).font(.system(size: 12, weight: .semibold)).foregroundColor(.white))
                let ts = text.measure(in: CGSize(width: 400, height: 40))
                let w = ts.width + 30
                let rect = CGRect(x: sx(h.x) - w / 2, y: sy(h.y) - 12, width: w, height: 24)
                guard fits(rect), let k = appear(was.hoods, h.id) else { continue }
                nowHoods[h.id] = was.hoods[h.id] ?? now
                if hoodAlpha * k > 0.4 { targets.hoods.append((id: h.id, box: rect)) }
                ctx.opacity = hoodAlpha * k * (highlight != nil ? 0.6 : 1)
                ctx.fill(Path(roundedRect: rect, cornerRadius: 12), with: .color(Color(hex: 0x050610).opacity(focusHood == h.id ? 0.95 : 0.78)))
                if focusHood == h.id { ctx.stroke(Path(roundedRect: rect, cornerRadius: 12), with: .color(h.color), lineWidth: 1.5) }
                ctx.fill(Path(ellipseIn: CGRect(x: rect.minX + 8.5, y: rect.midY - 3.5, width: 7, height: 7)), with: .color(h.color))
                ctx.draw(text, at: CGPoint(x: rect.minX + 21, y: rect.midY), anchor: .leading)
                ctx.opacity = 1
            }
        }
        // Zoomed in: titles, your stars first (highlighted ones before the rest), then the best known.
        // Showing only what you've seen, your stars are named at any zoom.
        let onlyMine = show == .seen
        if zoom > 3 || (onlyMine && !rated.isEmpty) {
            let titleAlpha = onlyMine ? 1 : min(1, (zoom - 3) / 2)
            let mine = Set(rated.map(\.i))
            // Your highlighted stars, your other stars, names already showing, then the best known.
            var picks = rated.map(\.i).filter { !faded($0) } + rated.map(\.i).filter(faded)
            var queued = Set(picks)
            for i in was.titles.keys.sorted() where i < sky.count && !queued.contains(i) && !faded(i)
                && !(show == .unseen && seen.contains(i)) && !(show == .seen && !seen.contains(i)) {
                picks.append(i)
                queued.insert(i)
            }
            if !onlyMine {
                // Visible dots, best known first (catalog order is popularity order).
                let x0 = c.x - size.width / 2 / c.s, x1 = c.x + size.width / 2 / c.s
                let y0 = c.y - size.height / 2 / c.s, y1 = c.y + size.height / 2 / c.s
                var i = 0
                while i < sky.count && picks.count < 600 {
                    if sky.xs[i] >= x0 && sky.xs[i] <= x1 && sky.ys[i] >= y0 && sky.ys[i] <= y1 && !faded(i) && !queued.contains(i)
                        && !(show == .unseen && seen.contains(i)) {
                        picks.append(i)
                    }
                    i += 1
                }
            }
            // With posters, each name has a small poster between it and its dot, so fewer fit.
            let thumb = CGSize(width: 22, height: 33)
            let pw: CGFloat = posters ? thumb.width + 6 : 0
            let ph: CGFloat = posters ? thumb.height : 18
            var placed = 0
            for i in picks where i != selected {
                if placed >= (posters ? 18 : 30) { break }
                if !still && was.titles[i] == nil { continue }
                let t = Catalog.shared.titles[i]
                let label = t.title.count > 26 ? String(t.title.prefix(25)) + "…" : t.title
                let text = ctx.resolve(Text(label).font(.system(size: 12, weight: mine.contains(i) ? .semibold : .medium))
                    .foregroundColor(mine.contains(i) ? .white : Color(hex: 0xD6D4F2)))
                let ts = text.measure(in: CGSize(width: 400, height: 40))
                let x = sx(sky.xs[i]) + 8, y = sy(sky.ys[i])
                let rect = CGRect(x: x - 3, y: y - ph / 2, width: pw + ts.width + 6, height: ph)
                guard fits(rect), let k = appear(was.titles, i) else { continue }
                nowTitles[i] = was.titles[i] ?? now
                if titleAlpha * k > 0.4 { targets.titles.append((i: i, dot: CGPoint(x: x - 8, y: y), box: rect)) }
                ctx.opacity = titleAlpha * k * (mine.contains(i) ? 1 : 0.85) * (faded(i) ? 0.5 : 1)
                if posters {
                    let slot = CGRect(x: x, y: y - thumb.height / 2, width: thumb.width, height: thumb.height)
                    let shape = Path(roundedRect: slot, cornerRadius: 4)
                    ctx.fill(shape, with: .color((sky.hood(at: i)?.color ?? .gray).opacity(0.33)))
                    if let img = Thumbs.shared.image(for: t), img.size.width > 0, img.size.height > 0 {
                        // Cover the slot: scale the poster to fill it, cropped from the middle.
                        let scale = max(slot.width / img.size.width, slot.height / img.size.height)
                        let drawn = CGSize(width: img.size.width * scale, height: img.size.height * scale)
                        var inner = ctx
                        inner.clip(to: shape)
                        inner.draw(Image(uiImage: img), in: CGRect(x: slot.midX - drawn.width / 2, y: slot.midY - drawn.height / 2,
                                                                  width: drawn.width, height: drawn.height))
                    }
                    ctx.stroke(shape, with: .color(.white.opacity(mine.contains(i) ? 0.85 : 0.22)), lineWidth: 1)
                    ctx.draw(text, at: CGPoint(x: x + pw, y: y), anchor: .leading)
                } else {
                    ctx.fill(Path(roundedRect: rect, cornerRadius: 5), with: .color(Color(hex: 0x04050E).opacity(0.7)))
                    ctx.draw(text, at: CGPoint(x: x, y: y), anchor: .leading)
                }
                ctx.opacity = 1
                placed += 1
            }
        }
        if let label = selectedLabel {
            ctx.fill(Path(roundedRect: label.rect, cornerRadius: 12), with: .color(Color(hex: 0x050610).opacity(0.88)))
            ctx.draw(label.text, at: CGPoint(x: label.rect.midX, y: label.rect.midY), anchor: .center)
        }
    }

    // MARK: Uncharted

    /// A neighbourhood you've barely rated in, weighted by how many of your recommendations live there.
    private func uncharted(size: CGSize) {
        var ratedIn: [Int: Double] = [:]
        for i in ratedIdx.map(\.i) { ratedIn[sky.hoodOf[i], default: 0] += 1 }
        var pull: [Int: Double] = [:]
        for (rank, r) in store.recommendations.prefix(400).enumerated() {
            if let i = catalog.order(of: r.id), i < sky.count { pull[sky.hoodOf[i], default: 0] += 1 / (1 + Double(rank) / 40) }
        }
        let scored = sky.hoods.filter { $0.id != lastHood }
            .map { h in (h, (store.ratings.isEmpty ? sqrt(Double(h.n)) : pull[h.id] ?? 0.05) / (1 + (ratedIn[h.id] ?? 0) * 1.5)) }
            .sorted { $0.1 > $1.1 }
            .prefix(6)
        var r = Double.random(in: 0..<max(1e-9, scored.reduce(0) { $0 + $1.1 }))
        guard let hood = (scored.first { r -= $0.1; return r <= 0 } ?? scored.first)?.0 else { return }
        lastHood = hood.id
        openHood(hood, size: size)
    }

    /// Opens a neighbourhood's card and flies to its biggest patch, close enough in to read titles.
    private func openHood(_ hood: SkyData.Hood, size: CGSize) {
        focus = .hood(hood.id)
        let p = hood.parts[0]
        fly(to: CGPoint(x: p.x, y: p.y), span: min(0.12, max(0.03, p.r * 2.2)), size: size, bottom: 230)
    }

    // MARK: Chrome

    private func topBar(size: CGSize) -> some View {
        HStack(spacing: 10) {
            Button { uncharted(size: size) } label: {
                Label("Uncharted", systemImage: "globe.europe.africa.fill")
                    .font(.system(size: 15, weight: .bold))
                    .padding(.horizontal, 16).frame(height: 42)
                    .background(Capsule().fill(.ultraThinMaterial))
                    .overlay(Capsule().strokeBorder(Theme.accent.opacity(0.5)))
            }
            Spacer()
            Button { fitAll(size); focus = nil } label: {
                Image(systemName: "arrow.clockwise").frame(width: 42, height: 42).background(Circle().fill(.ultraThinMaterial))
            }
            .accessibilityLabel("Show the whole map")
            Button { showFilters = true } label: {
                Image(systemName: "line.3.horizontal.decrease").frame(width: 42, height: 42)
                    .background(Circle().fill(anyFilter ? AnyShapeStyle(Theme.accent.opacity(0.4)) : AnyShapeStyle(.ultraThinMaterial)))
            }
            .accessibilityLabel("Filters")
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.top, 6)
    }

    /// The filters in use, as chips you can tap to remove.
    private var activeChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 6) {
                if show != .all {
                    Chip(label: "\(show == .seen ? "Seen only" : "Not seen only")  ✕", on: true, tint: Theme.accent) { show = .all; focus = nil }
                }
                ForEach(Dimension.allCases) { d in
                    ForEach((picks[d] ?? []).sorted(), id: \.self) { k in
                        Chip(label: "\(k)  ✕", on: true, tint: d == .genres ? Catalog.color(forGenre: k) : Theme.accent) { togglePick(d, k) }
                            .accessibilityLabel("Stop highlighting \(k)")
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollIndicators(.hidden)
    }

    private var showHint: String {
        let base: String = switch show {
        case .all: "Every title, with yours lit up."
        case .seen: "Only titles you’ve rated."
        case .unseen: "Only titles you haven’t rated yet."
        }
        let off = names ? (posters ? " Posters beside names, so fewer fit." : "") : " Names are off: tap your own stars."
        let across = picks.values.filter { !$0.isEmpty }.count > 1 ? " Highlighting titles that match every section you picked from." : ""
        return base + off + across
    }

    private var filters: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Show", selection: $show) {
                        ForEach(Show.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: show) { focus = nil }
                    Toggle("Names", isOn: $names)
                    Toggle("Posters beside names", isOn: $posters).disabled(!names)
                } header: { Text("Show") } footer: { Text(showHint) }
                ForEach(Dimension.allCases) { d in
                    Section {
                        if universe(d).count > 24 {
                            ScrollView { chips(d).padding(.vertical, 8) }.frame(maxHeight: 150)
                        } else {
                            chips(d).padding(.vertical, 8)
                        }
                    } header: {
                        Text((picks[d]?.count ?? 0) > 1 ? "\(d.rawValue) · any of these" : d.rawValue)
                            .padding(.bottom, 4)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .navigationTitle("Map filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if anyFilter { ToolbarItem(placement: .cancellationAction) { Button("Clear all") { clearFilters() } } }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { showFilters = false } }
            }
        }
    }

    private func chips(_ d: Dimension) -> some View {
        FlowLayout {
            ForEach(universe(d), id: \.self) { k in
                Chip(label: k, on: picks[d]?.contains(k) ?? false, tint: d == .genres ? Catalog.color(forGenre: k) : Theme.accent) {
                    togglePick(d, k)
                }
            }
        }
    }

    @ViewBuilder private var card: some View {
        switch focus {
        case .title(let i):
            let t = catalog.titles[i]
            HStack(spacing: 12) {
                PosterView(title: t, px: 120, showTitle: false)
                    .frame(width: 48, height: 72).clipShape(RoundedRectangle(cornerRadius: 7))
                VStack(alignment: .leading, spacing: 3) {
                    Text(t.title).font(.system(size: 16, weight: .bold)).lineLimit(1)
                    Text(t.metaLine).font(.system(size: 12.5)).foregroundStyle(Theme.text2).lineLimit(1)
                    if let h = sky.hood(at: i) {
                        Label { Text(h.label) } icon: { Circle().fill(h.color).frame(width: 7, height: 7) }
                            .font(.system(size: 12)).foregroundStyle(Theme.text2)
                    }
                }
                Spacer(minLength: 6)
                if let r = store.data.reviews[t.id] { VerdictBadge(review: r) } else { SaveRateButtons(id: t.id) }
                Button { focus = nil } label: { Image(systemName: "xmark").foregroundStyle(Theme.text2) }.accessibilityLabel("Close")
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 18).fill(.ultraThinMaterial))
            .padding(.horizontal, 12).padding(.bottom, 10)
            .onTapGesture { router.open(t.id) }
        case .hood(let id):
            groupCard(label: sky.hoods[id].label, color: sky.hoods[id].color, total: sky.hoods[id].n) { _, i in sky.hoodOf[i] == id }
        case nil:
            if let lit {
                let genres = picks[.genres] ?? []
                groupCard(label: pickName, color: genres.count == 1 && pickCount == 1 ? Catalog.color(forGenre: genres.first!) : Theme.accent,
                          total: lit.count) { _, i in lit.contains(i) }
            }
        }
    }

    /// A neighbourhood or highlighted group: how much of it you've rated, and titles to try there.
    private func groupCard(label: String, color: Color, total: Int, inGroup: @escaping (Title, Int) -> Bool) -> some View {
        let mine = store.ratings.values.filter { r in catalog.order(of: r.id).map { inGroup(catalog.titles[$0], $0) } ?? false }
        var picks = store.recommendations.filter { r in catalog.order(of: r.id).map { inGroup(r.title, $0) } ?? false }.prefix(10).map(\.title)
        if picks.count < 12 {
            for (i, t) in catalog.titles.prefix(sky.count).enumerated() where picks.count < 12 {
                if store.ratings[t.id] == nil && !store.isDismissed(t.id) && !picks.contains(t) && inGroup(t, i) { picks.append(t) }
            }
        }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Circle().fill(color).frame(width: 26, height: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.system(size: 16, weight: .bold)).lineLimit(1)
                    Text("\(total.formatted()) titles · \(mine.isEmpty ? "uncharted for you" : "you’ve rated \(mine.count)")")
                        .font(.system(size: 12.5)).foregroundStyle(Theme.text2)
                }
                Spacer()
                Button {
                    if focus == nil { self.picks = [:] } else { focus = nil }
                } label: { Image(systemName: "xmark").foregroundStyle(Theme.text2) }.accessibilityLabel("Close")
            }
            ScrollView(.horizontal) {
                LazyHStack(spacing: 10) {
                    ForEach(picks) { t in
                        Button { router.open(t.id) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                PosterView(title: t, px: 250).frame(width: 74, height: 111).clipShape(RoundedRectangle(cornerRadius: 8))
                                Text(t.title).font(.system(size: 11.5, weight: .medium)).lineLimit(2).frame(width: 74, alignment: .leading)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(.ultraThinMaterial))
        .padding(.horizontal, 12).padding(.bottom, 10)
    }
}
