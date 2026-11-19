import SwiftUI

/// A title's page: poster, details, your take (or rate / save / hide), its genres and themes,
/// titles like it, and more from the same director or network.
struct DetailView: View {
    let id: String
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    /// Rating from here opens on top of this sheet (a second sheet from the root can't show over it).
    @State private var rating = false

    var body: some View {
        if let t = Catalog.shared[id] {
            let review = store.data.reviews[id]
            let similar = Recommender.shared.similar(to: id)
            let sameCreator: [Title] = t.creator.isEmpty ? [] : Array(Catalog.shared.titles.filter { $0.creator == t.creator && $0.id != id && $0.type == t.type }.prefix(15))
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .bottom, spacing: 16) {
                        PosterView(title: t, px: 330)
                            .frame(width: 116, height: 174)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .shadow(color: .black.opacity(0.5), radius: 14, y: 6)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(t.title).font(.system(size: 25, weight: .bold))
                            Text("\(String(t.year)) · \(t.type.label)")
                            if !t.creator.isEmpty {
                                Text(t.type == .movie ? "Directed by \(t.creator)" : t.creator).foregroundStyle(Theme.text2)
                            }
                            if t.isCustom { Text("Added by hand").foregroundStyle(Theme.text2) }
                        }
                        .font(.system(size: 14))
                    }
                    .padding(.top, 8)

                    if let review {
                        HStack(spacing: 12) {
                            VerdictBadge(review: review, large: true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(review.pending == true ? "Needs a quick review" : "Your take").font(.system(size: 15, weight: .semibold))
                                Text(review.pending == true ? "Carried over from your old rankings"
                                     : review.again ? "Would watch again" : Self.verdictWord[review.verdict] ?? "")
                                    .font(.system(size: 13)).foregroundStyle(Theme.text2)
                                if review.pending != true, let note = review.note {
                                    Text("“\(note)”").font(.system(size: 14).italic()).padding(.top, 2)
                                }
                            }
                            Spacer()
                            Button(review.pending == true ? "Review" : "Edit") { rating = true }.font(.system(size: 15, weight: .semibold))
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 16).fill(Theme.surface))
                        Button(role: .destructive) { store.unrate(id) } label: {
                            Label("Remove rating", systemImage: "trash").frame(maxWidth: .infinity).frame(height: 44)
                        }
                        .buttonStyle(.bordered)
                    } else {
                        HStack(spacing: 10) {
                            Button { rating = true } label: {
                                Label("Rate it", systemImage: "star.fill").font(.system(size: 15, weight: .bold))
                                    .frame(maxWidth: .infinity).frame(height: 48)
                                    .background(Capsule().fill(Theme.glow)).foregroundStyle(Theme.onGlow)
                            }
                            Button { store.toggleWatchlist(id) } label: {
                                Label(store.isSaved(id) ? "Saved" : "Watchlist", systemImage: store.isSaved(id) ? "bookmark.fill" : "bookmark")
                                    .font(.system(size: 15, weight: .semibold))
                                    .frame(maxWidth: .infinity).frame(height: 48)
                                    .background(Capsule().fill(Color.white.opacity(store.isSaved(id) ? 0.16 : 0.08)))
                            }
                        }
                        .buttonStyle(.plain)
                        Button {
                            let hiding = !store.isDismissed(id)
                            store.toggleDismissed(id)
                            if hiding {
                                router.notify("Hid \(t.title)")
                                dismiss()
                            }
                        } label: {
                            Label(store.isDismissed(id) ? "Show in recommendations again" : "Not interested", systemImage: "eye.slash")
                                .font(.system(size: 14)).foregroundStyle(Theme.text2)
                        }
                        .frame(maxWidth: .infinity)
                    }

                    FlowLayout(spacing: 6) {
                        ForEach(t.genres, id: \.self) { g in
                            Text(g).font(.system(size: 13, weight: .semibold))
                                .padding(.horizontal, 11).padding(.vertical, 6)
                                .background(Capsule().fill(Catalog.color(forGenre: g).opacity(0.25)))
                        }
                        ForEach(t.tags, id: \.self) { x in
                            Text(x.replacingOccurrences(of: "-", with: " ")).font(.system(size: 13))
                                .padding(.horizontal, 11).padding(.vertical, 6)
                                .background(Capsule().fill(Color.white.opacity(0.06)))
                        }
                    }

                    if !similar.isEmpty { shelf("More like this", similar) }
                    if !sameCreator.isEmpty { shelf(t.type == .movie ? "More from \(t.creator)" : "More on \(t.creator)", sameCreator) }

                    if let ref = t.image {
                        Group {
                            if ref.isTVmaze {
                                Link("Poster from TVmaze", destination: URL(string: "https://www.tvmaze.com/")!)
                            } else if let name = ref.path.split(separator: "/").last {
                                Link("Poster from Wikimedia", destination: URL(string: "https://\(ref.path.hasPrefix("en/") ? "en.wikipedia" : "commons.wikimedia").org/wiki/File:\(name)")!)
                            }
                        }
                        .font(.system(size: 12)).foregroundStyle(Theme.text3)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                    }
                }
                .padding(20)
            }
            .background(Theme.bg.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { router.detail = nil } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
                }
            }
            .navigationDestination(for: Router.Item.self) { item in DetailView(id: item.id) }
            .sheet(isPresented: $rating) {
                RateView(id: id).presentationDragIndicator(.visible).presentationBackground(Theme.bg)
            }
        }
    }

    private static let verdictWord: [Verdict: String] = [.good: "You liked it", .ok: "It was ok", .bad: "Not for you", .dnf: "You didn’t finish it"]

    private func shelf(_ title: String, _ items: [Title]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.system(size: 18, weight: .bold))
            ScrollView(.horizontal) {
                LazyHStack(spacing: 12) {
                    ForEach(items) { s in
                        NavigationLink(value: Router.Item(id: s.id)) {
                            VStack(alignment: .leading, spacing: 6) {
                                PosterView(title: s, px: 250)
                                    .frame(width: 108, height: 162)
                                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                Text(s.title).font(.system(size: 12.5, weight: .semibold)).lineLimit(1).frame(width: 108, alignment: .leading)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }
}

extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
