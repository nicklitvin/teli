import SwiftUI

/// The galaxy: every title on one map, similar ones together, your ratings lit up as
/// constellations. Drag to pan, pinch to zoom, tap a dot (or, in bubbles, a neighbourhood).
/// Filters set the look (dots or bubbles, names on or off) and highlight a genre, theme, decade or
/// creator. Uncharted flies you to a neighbourhood you've barely rated that holds a lot of your picks.
struct GalaxyView: View {
    enum Look: String, CaseIterable { case dots, bubbles }
    enum Dimension: String, CaseIterable, Identifiable {
        case genres = "Genres", themes = "Themes", decades = "Decades", creators = "Creators"
        var id: String { rawValue }
    }
    enum Focus: Equatable { case title(Int), hood(Int) }

    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @AppStorage("teli.sky.look") private var look: Look = .dots
    @AppStorage("teli.sky.names") private var names = true
    @State private var dim: Dimension = .genres
    @State private var key: String?
    @State private var focus: Focus?
    @State private var showFilters = false
    @State private var cam = Camera()
    @State private var flight: Flight?
    @State private var lastHood: Int?
    @State private var dragLast: CGSize = .zero
    @State private var pinchLast: CGFloat = 1

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
                    topBar(size: geo.size)
                    VStack { Spacer(); card }
                }
                .onAppear { if cam.s == 0 { fitAll(geo.size) } }
            }
            .background(RadialGradient(colors: [Color(hex: 0x0B0D24), Color(hex: 0x04050E)], center: .center, startRadius: 0, endRadius: 600).ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showFilters) {
                filters.presentationDetents([.medium, .large]).presentationBackground(.ultraThinMaterial)
            }
        }
    }

    // MARK: Data for drawing

    private var ratedIdx: [(i: Int, v: Verdict)] {
        let all: [(i: Int, v: Verdict)] = store.ratings.values.compactMap { r in catalog.order(of: r.id).map { (i: $0, v: r.verdict) } }
        return all.filter { $0.i < sky.count }
    }
    private var watchIdx: [Int] { store.data.watchlist.compactMap { catalog.order(of: $0) }.filter { $0 < sky.count } }

    private func keys(_ t: Title) -> [String] {
        switch dim {
        case .genres: t.genres
        case .themes: t.tags
        case .decades: [t.decade]
        case .creators: t.creator.isEmpty ? [] : [t.creator]
        }
    }
    private var universe: [String] {
        switch dim {
        case .genres: catalog.genres
        case .themes: catalog.themes
        case .decades: catalog.decades
        case .creators: catalog.creators
        }
    }
    private var highlight: Set<Int>? {
        guard let key else { return nil }
        return Set((0..<sky.count).filter { keys(catalog.titles[$0]).contains(key) })
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
        let rated = ratedIdx
        let watch = watchIdx
        let lit = highlight
        let links = Self.constellations(rated.map(\.i), sky: sky)
        let byHood = Self.byHood(sky)
        let bubbles = look == .bubbles
        let focusHood = focusedHood
        let selected = selectedTitle
        let bottom: CGFloat = focus == nil && key == nil ? 0 : 230

        return TimelineView(.animation(paused: flight == nil)) { tl in
            let c = currentCam(tl.date)
            Canvas { ctx, sz in
                Self.draw(ctx: &ctx, size: sz, cam: c, sky: sky, byHood: byHood, rated: rated, watch: watch, links: links,
                          highlight: lit, bubbles: bubbles, names: names, focusHood: focusHood, selected: selected, bottom: bottom)
            }
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in
                    flight = nil
                    let d = CGSize(width: v.translation.width - dragLast.width, height: v.translation.height - dragLast.height)
                    dragLast = v.translation
                    cam.x = clamp01(cam.x - d.width / cam.s)
                    cam.y = clamp01(cam.y - d.height / cam.s)
                }
                .onEnded { _ in dragLast = .zero }
                .simultaneously(with: MagnifyGesture()
                    .onChanged { v in
                        flight = nil
                        let f = v.magnification / pinchLast
                        pinchLast = v.magnification
                        let anchor = CGPoint(x: v.startAnchor.x * size.width, y: v.startAnchor.y * size.height)
                        zoom(at: anchor, by: f, size: size)
                    }
                    .onEnded { _ in pinchLast = 1 })
        )
        .simultaneousGesture(SpatialTapGesture().onEnded { v in tap(v.location, size: size, rated: rated, watch: watch, lit: lit) })
        .accessibilityLabel("Map of every title, with your ratings as constellations")
    }

    private func clamp01(_ v: Double) -> Double { min(1, max(0, v)) }

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
        }
    }

    private func tap(_ p: CGPoint, size: CGSize, rated: [(i: Int, v: Verdict)], watch: [Int], lit: Set<Int>?) {
        let wx = cam.x + (p.x - size.width / 2) / cam.s
        let wy = cam.y + (p.y - size.height / 2) / cam.s
        let w = CGPoint(x: wx, y: wy)
        let reach = 18 / cam.s
        if let i = sky.nearest(to: w, within: 10 / cam.s, among: rated.map(\.i)) { return focus = .title(i) }
        if look == .bubbles {
            let pool = watch + (lit.map { Array($0) } ?? [])
            if let i = sky.nearest(to: w, within: reach, among: pool) { return focus = .title(i) }
            if let h = sky.hood(under: w) { return focus = .hood(h.id) }
            return focus = nil
        }
        if let i = sky.nearest(to: w, within: reach, among: lit.map { Array($0) }) { return focus = .title(i) }
        if case .hood = focus { return }
        focus = nil
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
                     watch: [Int], links: [(Int, Int)], highlight: Set<Int>?, bubbles: Bool, names: Bool, focusHood: Int?, selected: Int?, bottom: CGFloat) {
        guard c.s > 0 else { return }
        func sx(_ x: Double) -> CGFloat { (x - c.x) * c.s + size.width / 2 }
        func sy(_ y: Double) -> CGFloat { (y - c.y) * c.s + size.height / 2 }
        let zoom = c.s / max(c.fit, 1e-9)
        let grow = min(2.2, pow(zoom, 0.35))
        let n = Double(Catalog.shared.titles.count)
        let onScreen = { (x: CGFloat, y: CGFloat, m: CGFloat) in x > -m && y > -m && x < size.width + m && y < size.height + m }

        if bubbles {
            for h in sky.hoods {
                let on = focusHood == h.id
                for p in h.parts {
                    let r = max(6, p.r * c.s)
                    let rect = CGRect(x: sx(p.x) - r, y: sy(p.y) - r, width: r * 2, height: r * 2)
                    guard rect.intersects(CGRect(origin: .zero, size: size)) else { continue }
                    ctx.fill(Path(ellipseIn: rect), with: .color(h.color.opacity(on ? 0.23 : highlight != nil ? 0.06 : 0.11)))
                    ctx.stroke(Path(ellipseIn: rect), with: .color(h.color.opacity(on ? 0.82 : highlight != nil ? 0.25 : 0.44)), lineWidth: on ? 2 : 1.2)
                }
            }
            if let lit = highlight {
                for (hid, ids) in byHood.enumerated() {
                    var path = Path()
                    for i in ids where lit.contains(i) {
                        let x = sx(sky.xs[i]), y = sy(sky.ys[i])
                        if onScreen(x, y, 4) { path.addEllipse(in: CGRect(x: x - grow, y: y - grow, width: grow * 2, height: grow * 2)) }
                    }
                    ctx.fill(path, with: .color(sky.hoods[hid].color.opacity(0.9)))
                }
            }
        } else {
            // Nebulae: a soft glow of each neighbourhood's colour, so the sky reads as regions.
            for h in sky.hoods {
                for p in h.parts {
                    let r = sqrt(Double(p.n)) * 0.0042 * c.s
                    let center = CGPoint(x: sx(p.x), y: sy(p.y))
                    ctx.fill(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                             with: .radialGradient(Gradient(colors: [h.color.opacity(0.15), h.color.opacity(0)]), center: center, startRadius: 0, endRadius: r))
                }
            }
            // Dots: well-known titles a little bigger, everything a bit bigger as you zoom in.
            for (hid, ids) in byHood.enumerated() {
                var dim = Path()
                var bright = Path()
                for i in ids {
                    let x = sx(sky.xs[i]), y = sy(sky.ys[i])
                    guard onScreen(x, y, 4) else { continue }
                    let pop = 1 - Double(i) / n
                    let lit = highlight?.contains(i) ?? true
                    let r = (0.45 + 1.3 * pop * pop * pop) * grow * (highlight != nil && lit ? 1.25 : 1)
                    let rect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
                    if !lit {
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

        // Constellations, watchlist rings, then your stars.
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
            ctx.stroke(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(Color(hex: 0xA79BFF).opacity(0.85)), lineWidth: 1.3)
        }
        for (i, v) in rated {
            let x = sx(sky.xs[i]), y = sy(sky.ys[i])
            guard onScreen(x, y, 12) else { continue }
            let big = v == .good ? 1.25 : v == .ok ? 1 : 0.8
            let halo = (5 + grow) * big, core = (1.8 + grow * 0.45) * big
            let color = Theme.verdict(v)
            ctx.fill(Path(ellipseIn: CGRect(x: x - halo, y: y - halo, width: halo * 2, height: halo * 2)), with: .color(color.opacity(0.25)))
            ctx.fill(Path(ellipseIn: CGRect(x: x - core, y: y - core, width: core * 2, height: core * 2)), with: .color(color))
            if v == .good {
                let w = 1.1 * big
                ctx.fill(Path(ellipseIn: CGRect(x: x - w, y: y - w, width: w * 2, height: w * 2)), with: .color(.white))
            }
        }
        if let s = selected, s < sky.count {
            let x = sx(sky.xs[s]), y = sy(sky.ys[s]), r = 9 + grow
            ctx.stroke(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(.white), lineWidth: 2)
        }
        guard names else { return }

        // Labels, skipping any that would overlap one already placed, each on a dark pill so it reads over bright patches.
        var boxes: [CGRect] = []
        func fits(_ r: CGRect) -> Bool {
            guard r.minX > 4, r.minY > 64, r.maxX < size.width - 4, r.maxY < size.height - 4 - bottom,
                  !boxes.contains(where: { $0.intersects(r) }) else { return false }
            boxes.append(r)
            return true
        }
        let hoodAlpha = bubbles ? 1 : max(0, min(1, (5 - zoom) / 2.5))
        if hoodAlpha > 0 {
            for h in sky.hoods.sorted(by: { $0.n > $1.n }) {
                let text = ctx.resolve(Text(h.label).font(.system(size: 12, weight: .semibold)).foregroundColor(.white))
                let ts = text.measure(in: CGSize(width: 400, height: 40))
                let w = ts.width + 30
                let rect = CGRect(x: sx(h.x) - w / 2, y: sy(h.y) - 12, width: w, height: 24)
                guard fits(rect) else { continue }
                ctx.opacity = hoodAlpha * (highlight != nil ? 0.6 : 1)
                ctx.fill(Path(roundedRect: rect, cornerRadius: 12), with: .color(Color(hex: 0x050610).opacity(focusHood == h.id ? 0.95 : 0.78)))
                if focusHood == h.id { ctx.stroke(Path(roundedRect: rect, cornerRadius: 12), with: .color(h.color), lineWidth: 1.5) }
                ctx.fill(Path(ellipseIn: CGRect(x: rect.minX + 8.5, y: rect.midY - 3.5, width: 7, height: 7)), with: .color(h.color))
                ctx.draw(text, at: CGPoint(x: rect.minX + 21, y: rect.midY), anchor: .leading)
                ctx.opacity = 1
            }
        }
        if zoom > 3 || (bubbles && !rated.isEmpty) {
            let titleAlpha = bubbles ? 1 : min(1, (zoom - 3) / 2)
            let mine = Set(rated.map(\.i))
            var picks = rated.map(\.i)
            if !bubbles {
                // Visible dots, best known first (catalog order is popularity order).
                let x0 = c.x - size.width / 2 / c.s, x1 = c.x + size.width / 2 / c.s
                let y0 = c.y - size.height / 2 / c.s, y1 = c.y + size.height / 2 / c.s
                var i = 0
                while i < sky.count && picks.count < 600 {
                    if sky.xs[i] >= x0 && sky.xs[i] <= x1 && sky.ys[i] >= y0 && sky.ys[i] <= y1 && (highlight?.contains(i) ?? true) && !mine.contains(i) {
                        picks.append(i)
                    }
                    i += 1
                }
            }
            var placed = 0
            for i in picks where i != selected {
                if placed >= 45 { break }
                let name = Catalog.shared.titles[i].title
                let label = name.count > 26 ? String(name.prefix(25)) + "…" : name
                let text = ctx.resolve(Text(label).font(.system(size: 12, weight: mine.contains(i) ? .semibold : .medium))
                    .foregroundColor(mine.contains(i) ? .white : Color(hex: 0xD6D4F2)))
                let ts = text.measure(in: CGSize(width: 400, height: 40))
                let x = sx(sky.xs[i]) + 8, y = sy(sky.ys[i])
                let rect = CGRect(x: x - 3, y: y - 9, width: ts.width + 6, height: 18)
                guard fits(rect) else { continue }
                ctx.opacity = titleAlpha * (mine.contains(i) ? 1 : 0.85)
                ctx.fill(Path(roundedRect: rect, cornerRadius: 5), with: .color(Color(hex: 0x04050E).opacity(0.7)))
                ctx.draw(text, at: CGPoint(x: x, y: y), anchor: .leading)
                ctx.opacity = 1
                placed += 1
            }
        }
        if let s = selected, s < sky.count {
            let text = ctx.resolve(Text(Catalog.shared.titles[s].title).font(.system(size: 13.5, weight: .semibold)).foregroundColor(.white))
            let ts = text.measure(in: CGSize(width: 400, height: 40))
            let rect = CGRect(x: sx(sky.xs[s]) - ts.width / 2 - 9, y: sy(sky.ys[s]) - 34, width: ts.width + 18, height: 24)
            ctx.fill(Path(roundedRect: rect, cornerRadius: 12), with: .color(Color(hex: 0x050610).opacity(0.88)))
            ctx.draw(text, at: CGPoint(x: rect.midX, y: rect.midY), anchor: .center)
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

    private func openHood(_ hood: SkyData.Hood, size: CGSize) {
        focus = .hood(hood.id)
        let p = hood.parts[0]
        let span = look == .bubbles ? max(0.06, p.r * 3) : min(0.12, max(0.03, p.r * 2.2))
        fly(to: CGPoint(x: p.x, y: p.y), span: span, size: size, bottom: 230)
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
                    .background(Circle().fill(key != nil ? AnyShapeStyle(Theme.accent.opacity(0.4)) : AnyShapeStyle(.ultraThinMaterial)))
            }
            .accessibilityLabel("Filters")
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
        .padding(.top, 6)
    }

    private var filters: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Look", selection: $look) {
                        Text("Dots").tag(Look.dots)
                        Text("Bubbles").tag(Look.bubbles)
                    }
                    .pickerStyle(.segmented)
                    Toggle("Names", isOn: $names)
                } header: { Text("Look") } footer: {
                    Text(look == .bubbles ? "Each neighbourhood is a bubble; only your titles show." : "Every title is a dot, coloured by neighbourhood.")
                }
                Section("Highlight") {
                    Picker("By", selection: $dim) {
                        ForEach(Dimension.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: dim) { key = nil }
                    ScrollView {
                        FlowLayout {
                            ForEach(universe, id: \.self) { k in
                                Chip(label: k, on: key == k, tint: dim == .genres ? Catalog.color(forGenre: k) : Theme.accent) {
                                    key = key == k ? nil : k
                                    focus = nil
                                }
                            }
                        }
                        .padding(.vertical, 6)
                    }
                    .frame(maxHeight: 260)
                }
            }
            .scrollContentBackground(.hidden)
            .navigationTitle("Map filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if key != nil { ToolbarItem(placement: .cancellationAction) { Button("Clear") { key = nil } } }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { showFilters = false } }
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
            if let key {
                groupCard(label: key, color: dim == .genres ? Catalog.color(forGenre: key) : Theme.accent, total: highlight?.count ?? 0) { t, _ in keys(t).contains(key) }
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
                    Text(label).font(.system(size: 16, weight: .bold))
                    Text("\(total.formatted()) titles · \(mine.isEmpty ? "uncharted for you" : "you’ve rated \(mine.count)")")
                        .font(.system(size: 12.5)).foregroundStyle(Theme.text2)
                }
                Spacer()
                Button { focus = nil; key = nil } label: { Image(systemName: "xmark").foregroundStyle(Theme.text2) }.accessibilityLabel("Close")
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
