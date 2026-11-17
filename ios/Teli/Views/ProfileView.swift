import SwiftUI
import Charts

/// Your logbook: movies or shows, good first (or by when you rated them), with filters, search
/// and stats; the bookmark swaps in your watchlist. The gear swaps the page for Settings.
struct ProfileView: View {
    enum Sort: String, CaseIterable, Identifiable {
        case verdict = "Best first", new = "Newest rated", old = "Oldest rated"
        var id: String { rawValue }
    }

    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @AppStorage("teli.name") private var name = ""
    @State private var settings = false
    @State private var tab: MediaType = .movie
    @State private var watching = false
    @State private var stats = false
    @State private var sort: Sort = .verdict
    @State private var verdicts: Set<Verdict> = []
    @State private var again = false
    @State private var keywords: Set<String> = []
    @State private var genre: String?
    @State private var query = ""

    private var rated: [Rating] { store.ratings.values.filter { $0.type == tab } }

    private var list: [Title] {
        if watching { return store.data.watchlist.compactMap { Catalog.shared[$0] }.filter { $0.type == tab } }
        let tier = { (r: Rating) in (Verdict.allCases.firstIndex(of: r.verdict) ?? 0) * 2 + (r.review.again ? 0 : 1) }
        let sorted = rated.sorted { a, b in
            switch sort {
            case .verdict: tier(a) != tier(b) ? tier(a) < tier(b) : a.review.at > b.review.at
            case .new: a.review.at > b.review.at
            case .old: a.review.at < b.review.at
            }
        }
        return sorted.compactMap { Catalog.shared[$0.id] }
    }

    private var narrowing: Bool { !verdicts.isEmpty || again || !keywords.isEmpty || genre != nil || !query.isEmpty }

    private var shown: [Title] {
        let q = SearchIndex.normalize(query)
        return list.filter { t in
            if let genre, !t.genres.contains(genre) { return false }
            if !q.isEmpty && !SearchIndex.normalize("\(t.title) \(t.creator) \(t.year)").contains(q) { return false }
            guard !watching, let r = store.data.reviews[t.id] else { return true }
            if !verdicts.isEmpty && !verdicts.contains(r.verdict) { return false }
            if again && !r.again { return false }
            if !keywords.isEmpty && !r.tags.contains(where: keywords.contains) { return false }
            return true
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    header
                    if settings {
                        SettingsView()
                    } else {
                        tools
                        if stats {
                            StatsView(rated: rated, saved: store.data.watchlist.filter { Catalog.shared[$0]?.type == tab }.map { store.data.saved[$0] ?? 0 }, noun: tab.noun)
                        } else {
                            logbook
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Theme.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: HiddenTitles.self) { _ in HiddenTitlesView() }
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            Image(systemName: settings ? "gearshape.fill" : "person.fill")
                .font(.system(size: 24))
                .frame(width: 56, height: 56)
                .background(Circle().fill(settings ? AnyShapeStyle(Theme.accent.opacity(0.2)) : AnyShapeStyle(Theme.glow)))
                .foregroundStyle(settings ? Theme.accentText : Theme.onGlow)
            VStack(alignment: .leading, spacing: 2) {
                Text(settings ? "Settings" : name.isEmpty ? "Your logbook" : "\(name)’s notebook").font(.system(size: 22, weight: .bold))
                Text(settings ? "Teli \(Version.current)" : "Saved on this device").font(.system(size: 13)).foregroundStyle(Theme.text2)
            }
            Spacer()
            // On, the gear becomes a lit close button so it's obvious Settings is open.
            Button { withAnimation(.snappy) { settings.toggle() } } label: {
                Image(systemName: settings ? "xmark" : "gearshape")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(settings ? AnyShapeStyle(Theme.glow) : AnyShapeStyle(Color.white.opacity(0.07))))
                    .foregroundStyle(settings ? Theme.onGlow : .white)
                    .shadow(color: settings ? Theme.accent.opacity(0.6) : .clear, radius: 12)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(settings ? "Close settings" : "Settings")
            .accessibilityAddTraits(settings ? .isSelected : [])
        }
        .padding(.top, 8)
    }

    private var tools: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Picker("Type", selection: $tab) {
                    Text("Movies").tag(MediaType.movie)
                    Text("Shows").tag(MediaType.tv)
                }
                .pickerStyle(.segmented)
                toolButton("chart.bar", on: stats, label: "Stats") { stats.toggle(); if stats { watching = false } }
                toolButton(watching ? "bookmark.fill" : "bookmark", on: watching, label: "Watchlist") {
                    // Opening the watchlist just closes the stats; it doesn't hide their button.
                    watching.toggle(); stats = false; genre = nil
                }
                Menu {
                    if !watching {
                        Picker("Sort", selection: $sort) { ForEach(Sort.allCases) { Text($0.rawValue).tag($0) } }
                        Section("Rating") {
                            ForEach(Verdict.allCases) { v in
                                Toggle(v.label, isOn: Binding(get: { verdicts.contains(v) }, set: { if $0 { verdicts.insert(v) } else { verdicts.remove(v) } }))
                            }
                            Toggle("Would watch again", isOn: $again)
                        }
                        let used = Set(rated.flatMap(\.review.tags))
                        if !used.isEmpty {
                            Section("Keywords") {
                                ForEach(used.sorted(), id: \.self) { k in
                                    Toggle(store.tagLabel(k), isOn: Binding(get: { keywords.contains(k) }, set: { if $0 { keywords.insert(k) } else { keywords.remove(k) } }))
                                }
                            }
                        }
                    }
                    Picker("Genre", selection: $genre) {
                        Text("Any genre").tag(String?.none)
                        ForEach(Catalog.shared.genres.filter { g in list.contains { $0.genres.contains(g) } }, id: \.self) { Text($0).tag(String?.some($0)) }
                    }
                    if narrowing { Button("Clear all", role: .destructive) { verdicts = []; again = false; keywords = []; genre = nil; query = "" } }
                } label: {
                    Image(systemName: "line.3.horizontal.decrease")
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(narrowing || sort != .verdict ? Theme.accent.opacity(0.3) : Color.white.opacity(0.07)))
                }
                .accessibilityLabel("Filters")
            }
            if !stats {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.text3)
                    TextField("Search your \(watching ? "saved " : "")\(tab.noun)", text: $query).autocorrectionDisabled()
                }
                .padding(.horizontal, 14).frame(height: 40)
                .background(Capsule().fill(Color.white.opacity(0.06)))
            }
        }
    }

    private func toolButton(_ icon: String, on: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .frame(width: 36, height: 36)
                .background(Circle().fill(on ? Theme.accent.opacity(0.3) : Color.white.opacity(0.07)))
                .overlay(Circle().strokeBorder(on ? Theme.accent : Theme.border))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    @ViewBuilder private var logbook: some View {
        if !store.pendingIds.isEmpty && !watching {
            Button { if let id = store.pendingIds.first { router.rate(id) } } label: {
                HStack {
                    Image(systemName: "arrow.clockwise")
                    VStack(alignment: .leading) {
                        Text("\(store.pendingIds.count) to review").font(.system(size: 15, weight: .semibold))
                        Text("Carried over from the old rankings. Give each a quick good, ok or bad.").font(.system(size: 12.5)).foregroundStyle(Theme.text2)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                }
                .padding(14)
                .background(RoundedRectangle(cornerRadius: 16).fill(Theme.accent.opacity(0.15)))
            }
            .buttonStyle(.plain)
        }
        let items = shown
        if list.isEmpty {
            EmptyState(icon: watching ? "bookmark" : "book",
                       title: watching ? "No \(tab.noun) saved" : "No \(tab.noun) yet",
                       message: watching ? "Tap Save on any of the \(tab.noun) you want to watch and they’ll wait here." : "Rate a few \(tab.noun) and they’ll be logged here.")
        } else if items.isEmpty {
            EmptyState(icon: "magnifyingglass", title: "Nothing matches", message: "None of your \(watching ? "saved" : "rated") \(tab.noun) match that filter.")
        } else {
            if narrowing || watching {
                Text(narrowing ? "\(items.count) of \(list.count) \(tab.noun)" : "\(list.count) to watch")
                    .font(.system(size: 13)).foregroundStyle(Theme.text2).frame(maxWidth: .infinity, alignment: .leading)
            }
            LazyVStack(spacing: 12) {
                ForEach(items) { t in
                    let r = store.data.reviews[t.id]
                    TitleCard(title: t, detail: r.map { detail(t, $0) }, review: r) {
                        if watching {
                            Button { store.toggleWatchlist(t.id); router.notify("Removed \(t.title) from your watchlist") } label: {
                                Image(systemName: "bookmark.slash").frame(width: 38, height: 38).background(Circle().fill(.ultraThinMaterial))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove from watchlist")
                        }
                    }
                    .onTapGesture { router.open(t.id) }
                }
            }
        }
    }

    private func detail(_ t: Title, _ r: Review) -> String {
        if r.pending == true { return "Needs a quick review" }
        let tags = r.tags.map(store.tagLabel)
        if sort != .verdict { return (["Rated \(r.date.formatted(.dateTime.month(.abbreviated).day()))"] + tags).joined(separator: " · ") }
        return tags.isEmpty ? t.metaLine : ([String(t.year)] + tags).joined(separator: " · ")
    }
}

/// Charts for a tab: counts, the good / ok / bad split, the last 30 days, top genres and keywords, and the watchlist.
struct StatsView: View {
    let rated: [Rating]
    /// When each title still on your watchlist was saved (0 if from before that was kept).
    let saved: [Double]
    let noun: String
    @Environment(Store.self) private var store

    var body: some View {
        let done = rated.filter { $0.review.pending != true }
        if done.isEmpty && saved.isEmpty {
            EmptyState(icon: "chart.bar", title: "No stats yet", message: "Rate a few \(noun) to see your stats.")
        } else {
            VStack(spacing: 14) {
                let month = Date().addingTimeInterval(-30 * 86400)
                HStack(spacing: 10) {
                    tile("\(done.count)", "rated")
                    tile("\(done.filter { $0.review.date > month }.count)", "last 30 days")
                    tile(done.isEmpty ? "–" : "\(Int((Double(done.filter(\.review.again).count) / Double(done.count) * 100).rounded()))%", "would rewatch")
                }
                if !done.isEmpty {
                    card("Verdicts") {
                        Chart(Verdict.allCases) { v in
                            SectorMark(angle: .value("Count", done.filter { $0.verdict == v }.count), innerRadius: .ratio(0.62), angularInset: 2)
                                .foregroundStyle(Theme.verdict(v))
                                .annotation(position: .overlay) {
                                    let n = done.filter { $0.verdict == v }.count
                                    if n > 0 { Text("\(n)").font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.onGlow) }
                                }
                        }
                        .frame(height: 170)
                    }
                    card("Last 30 days") {
                        let cal = Calendar.current
                        let days = (0..<30).map { cal.startOfDay(for: Date().addingTimeInterval(-Double(29 - $0) * 86400)) }
                        Chart {
                            ForEach(days, id: \.self) { d in
                                ForEach(Verdict.allCases) { v in
                                    BarMark(x: .value("Day", d, unit: .day),
                                            y: .value("Rated", done.filter { cal.isDate($0.review.date, inSameDayAs: d) && $0.verdict == v }.count))
                                        .foregroundStyle(Theme.verdict(v))
                                }
                            }
                        }
                        .chartYAxis(.hidden)
                        .frame(height: 120)
                    }
                    bars("Genres", counts(done.flatMap { Catalog.shared[$0.id]?.genres ?? [] }))
                    let tags = counts(done.flatMap(\.review.tags))
                    if !tags.isEmpty { bars("Keywords", tags.map { (store.tagLabel($0.0), $0.1) }) }
                }
                watchlist(done: rated)
            }
        }
    }

    private func counts(_ keys: [String]) -> [(String, Int)] {
        Array(Dictionary(keys.map { ($0, 1) }, uniquingKeysWith: +).sorted { $0.value > $1.value }.prefix(6).map { ($0.key, $0.value) })
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 24, weight: .bold))
            Text(label).font(.system(size: 12)).foregroundStyle(Theme.text2)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 16).fill(Theme.surface))
    }

    private func card<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.text2)
            content()
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(Theme.surface))
    }

    private struct Row: Identifiable {
        let id: String
        let n: Int
    }

    private func bars(_ title: String, _ rows: [(String, Int)]) -> some View {
        card(title) {
            Chart(rows.map { Row(id: $0.0, n: $0.1) }) { row in
                BarMark(x: .value("Count", row.n), y: .value(title, row.id))
                    .foregroundStyle(Theme.accent.gradient)
                    .annotation(position: .trailing) { Text("\(row.n)").font(.system(size: 11)).foregroundStyle(Theme.text2) }
            }
            .chartXAxis(.hidden)
            .frame(height: CGFloat(rows.count) * 30)
        }
    }

    /// How much you save and go on to watch: rating something from your watchlist counts as watching it.
    private func watchlist(done: [Rating]) -> some View {
        let watched = done.filter { $0.review.fromList != nil }
        let total = watched.count + saved.count
        let month = Date().ms - 30 * 86400 * 1000
        let gaps = watched.compactMap { r -> Double? in
            guard let from = r.review.fromList, from > 0 else { return nil }
            return max(0, (r.review.at - from) / 86400000)
        }
        return card("Watchlist") {
            if total == 0 {
                Text("Save something to watch and see how much of it you get to.").font(.system(size: 13)).foregroundStyle(Theme.text2)
            } else {
                let share = Double(watched.count) / Double(total)
                VStack(alignment: .leading, spacing: 10) {
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color.white.opacity(0.08))
                            Capsule().fill(Theme.glow).frame(width: max(8, g.size.width * share))
                        }
                    }
                    .frame(height: 12)
                    Text("\(Int((share * 100).rounded()))% of what you saved, watched").font(.system(size: 13, weight: .semibold))
                    HStack {
                        mini("\(total)", "saved")
                        mini("\(watched.count)", "watched")
                        mini("\(saved.count)", "waiting")
                        mini(gaps.isEmpty ? "–" : "\(Int((gaps.reduce(0, +) / Double(gaps.count)).rounded()))d", "to watch")
                    }
                    Text("Last 30 days: +\(saved.filter { $0 > month }.count + watched.filter { ($0.review.fromList ?? 0) > month }.count) saved · \(watched.filter { $0.review.at > month }.count) watched")
                        .font(.system(size: 12)).foregroundStyle(Theme.text3)
                }
            }
        }
    }

    private func mini(_ v: String, _ l: String) -> some View {
        VStack(spacing: 1) {
            Text(v).font(.system(size: 16, weight: .bold))
            Text(l).font(.system(size: 11)).foregroundStyle(Theme.text2)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Route to the list of titles you marked not interested.
struct HiddenTitles: Hashable {}

struct HiddenTitlesView: View {
    @Environment(Store.self) private var store

    var body: some View {
        List {
            if store.data.dismissed.isEmpty {
                Text("Nothing hidden. Titles you mark Not interested show up here.").foregroundStyle(Theme.text2)
            }
            ForEach(store.data.dismissed, id: \.self) { id in
                if let t = Catalog.shared[id] {
                    HStack {
                        PosterView(title: t, px: 120, showTitle: false).frame(width: 40, height: 60).clipShape(RoundedRectangle(cornerRadius: 6))
                        VStack(alignment: .leading) {
                            Text(t.title).font(.system(size: 15, weight: .semibold))
                            Text(t.metaLine).font(.system(size: 12)).foregroundStyle(Theme.text2)
                        }
                        Spacer()
                        Button("Show again") { store.toggleDismissed(id) }.font(.system(size: 13, weight: .semibold))
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.bg)
        .navigationTitle("Not interested")
    }
}
