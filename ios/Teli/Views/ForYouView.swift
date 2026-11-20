import SwiftUI

/// A full-screen feed of recommendations, one per page. Discover switches to well-known titles
/// from genres and themes you haven't rated yet. Pull down on the first card for a fresh deal.
/// Hiding a card re-deals the ones ahead without anything related to it for the next page.
struct ForYouView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var discovering = false
    @State private var seed = UInt32.random(in: 0...UInt32.max)
    @State private var feed: [Rec] = []
    @State private var dealtFor = -1
    /// The card on screen.
    @State private var current: String?

    /// Titles you've scrolled past lately, so the next feed leads with something else.
    @AppStorage("teli.seen") private var seenRaw = ""
    private var seen: Set<String> { Set(seenRaw.split(separator: "|").map(String.init)) }
    private func markSeen(_ id: String) {
        var a = seenRaw.split(separator: "|").map(String.init).filter { $0 != id }
        a.append(id)
        seenRaw = a.suffix(60).joined(separator: "|")
    }

    private func deal() {
        let recs = store.recommendations
        feed = discovering
            ? Recommender.shared.discover(ratings: store.ratings, dismissed: Set(store.data.dismissed), recs: recs, seed: seed, seen: seen)
            : Recommender.shared.shuffle(recs, seed: seed, seen: seen, avoid: Array(store.data.dismissed.reversed()))
        dealtFor = store.ratedCount
    }

    /// After you hide a card: keep the ones you've scrolled through and re-deal what's ahead.
    private func redealAhead() {
        guard !discovering, let at = current.flatMap({ id in feed.firstIndex { $0.id == id } }) else { return deal() }
        let start = feed.prefix(at + 1).filter { store.ratings[$0.id] == nil && !store.isDismissed($0.id) }
        feed = Recommender.shared.shuffle(store.recommendations, seed: seed, seen: seen,
                                          avoid: Array(store.data.dismissed.reversed()), start: Array(start))
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.ratings.isEmpty {
                    starters
                } else {
                    reel
                }
            }
            .background(Theme.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    // MARK: Feed

    private var visible: [Rec] {
        // Rated, saved-and-rated or hidden titles drop out of the feed right away.
        feed.filter { store.ratings[$0.id] == nil && !store.isDismissed($0.id) }
    }

    /// Every card is exactly as tall as the scroll view, which runs edge to edge (under the status
    /// bar and tab bar) with no insets: if a page and a card differ by even the tab bar's height,
    /// paging drifts a little further off with every swipe.
    private var reel: some View {
        GeometryReader { geo in
            let inset = geo.safeAreaInsets
            let page = CGSize(width: geo.size.width + inset.leading + inset.trailing,
                              height: geo.size.height + inset.top + inset.bottom)
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(visible.prefix(60)) { rec in
                        ReelCard(rec: rec, discovering: discovering, bottomInset: inset.bottom)
                            .frame(width: page.width, height: page.height)
                            .clipped()
                            .onAppear { markSeen(rec.id) }
                    }
                    if visible.isEmpty && dealtFor >= 0 {
                        EmptyState(icon: discovering ? "map" : "sparkles",
                                   title: discovering ? "Every frontier charted" : "Nothing left to pick",
                                   message: discovering ? "Rate more titles to open new ones." : "Rate a few more titles for fresh picks.")
                            .frame(width: page.width, height: page.height)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollPosition(id: $current)
            .scrollTargetBehavior(.paging)
            .scrollIndicators(.hidden)
            .ignoresSafeArea()
        }
        .refreshable {
            seed = UInt32.random(in: 0...UInt32.max)
            deal()
            router.notify(discovering ? "New frontiers charted" : "Fresh picks")
        }
        .overlay(alignment: .topTrailing) {
            Button {
                discovering.toggle()
                seed = UInt32.random(in: 0...UInt32.max)
                deal()
            } label: {
                Label("Discover", systemImage: discovering ? "location.north.circle.fill" : "location.north.circle")
                    .font(.system(size: 13, weight: .bold))
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Capsule().fill(discovering ? AnyShapeStyle(Theme.glow) : AnyShapeStyle(.ultraThinMaterial)))
                    .foregroundStyle(discovering ? Theme.onGlow : .white)
            }
            .buttonStyle(.plain)
            .padding(.trailing, 16)
            .accessibilityAddTraits(discovering ? .isSelected : [])
        }
        .onAppear { if dealtFor < 0 { deal() } }
        .onChange(of: store.data.dismissed) { old, new in
            if feed.isEmpty { deal() } else if new.count > old.count { redealAhead() }
        }
    }

    // MARK: First run

    private var starters: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Rate a few to start").font(.system(size: 28, weight: .bold))
                Text("Tap anything you’ve watched. A handful is enough for picks.")
                    .foregroundStyle(Theme.text2)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 14) {
                    ForEach(Catalog.shared.starters) { t in
                        Button { router.rate(t.id) } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                PosterView(title: t, px: 250)
                                    .aspectRatio(2 / 3, contentMode: .fit)
                                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                Text(t.title).font(.system(size: 12.5, weight: .semibold)).lineLimit(1)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                Button { router.tab = .search } label: {
                    Label("Search for something else", systemImage: "magnifyingglass")
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .background(Capsule().fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
            }
            .padding(20)
        }
    }
}

/// One full-screen pick: the poster edge to edge, why it's here, and rate / save / hide.
private struct ReelCard: View {
    let rec: Rec
    let discovering: Bool
    /// The tab bar and home indicator: the card runs under them, its buttons stay above.
    var bottomInset: CGFloat = 0
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router

    var body: some View {
        let t = rec.title
        ZStack(alignment: .bottomLeading) {
            PosterView(title: t, px: 500, showTitle: false)
                .ignoresSafeArea()
            LinearGradient(colors: [.black.opacity(0.35), .clear, .clear, .black.opacity(0.92)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            VStack(alignment: .leading, spacing: 10) {
                if discovering && !rec.frontier.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(rec.frontier, id: \.self) { f in
                            Text(f).font(.system(size: 12, weight: .bold))
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(Capsule().fill(Theme.accent2.opacity(0.25)))
                        }
                    }
                }
                Text(t.title).font(.system(size: 32, weight: .bold)).lineLimit(3).minimumScaleFactor(0.7)
                Text(t.metaLine).font(.system(size: 15)).foregroundStyle(.white.opacity(0.8))
                if discovering {
                    Text("New territory for you\(rec.close ? ", but close to things you love" : "")")
                        .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.accent2)
                } else if let b = rec.because {
                    Text("Because you liked \(b.title)").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.accentText)
                }
                HStack(spacing: 10) {
                    Button { router.rate(t.id) } label: {
                        Label("Rate it", systemImage: "star.fill")
                            .font(.system(size: 15, weight: .bold))
                            .frame(maxWidth: .infinity).frame(height: 48)
                            .background(Capsule().fill(Theme.glow))
                            .foregroundStyle(Theme.onGlow)
                    }
                    Button { store.toggleWatchlist(t.id) } label: {
                        Image(systemName: store.isSaved(t.id) ? "bookmark.fill" : "bookmark")
                            .frame(width: 48, height: 48)
                            .background(Circle().fill(.ultraThinMaterial))
                    }
                    .accessibilityLabel(store.isSaved(t.id) ? "Remove from watchlist" : "Save to watchlist")
                    Button {
                        store.toggleDismissed(t.id)
                        router.notify("Hid \(t.title)")
                    } label: {
                        Image(systemName: "eye.slash")
                            .frame(width: 48, height: 48)
                            .background(Circle().fill(.ultraThinMaterial))
                    }
                    .accessibilityLabel("Not interested")
                }
                .buttonStyle(.plain)
                .padding(.top, 6)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 20)
            .padding(.bottom, 28 + bottomInset)
        }
        .contentShape(Rectangle())
        .onTapGesture { router.open(t.id) }
    }
}
