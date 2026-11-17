import SwiftUI

/// Search by name, director or network, genre, theme, year or acronym, with type and genre
/// filters; browse by genre when empty. Far enough down the results, a button takes you back up.
struct SearchView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @State private var query = ""
    @State private var type: MediaType?
    @State private var genres: Set<String> = []
    @State private var showFilters = false
    @State private var adding = false
    /// Well down the results: offer a way back to the top.
    @State private var deep = false
    @FocusState private var focused: Bool

    private var browsing: Bool { query.trimmingCharacters(in: .whitespaces).isEmpty && type == nil && genres.isEmpty }
    private var results: [Title] {
        browsing ? [] : SearchIndex.shared.search(query, type: type, genres: genres)
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 14) {
                        searchBar.id("top")
                        if showFilters { filters }
                        if browsing {
                            browse
                        } else {
                            list
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.immediately)
                .overlay(alignment: .bottomTrailing) {
                    if deep {
                        Button {
                            withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo("top", anchor: .top) }
                        } label: {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 18, weight: .bold))
                                .frame(width: 48, height: 48)
                                .background(Circle().fill(.ultraThinMaterial))
                                .overlay(Circle().strokeBorder(Theme.border))
                                .shadow(color: .black.opacity(0.4), radius: 10, y: 4)
                        }
                        .buttonStyle(.plain)
                        .padding(16)
                        .transition(.scale.combined(with: .opacity))
                        .accessibilityLabel("Back to top")
                    }
                }
                .animation(.spring(duration: 0.25), value: deep)
            }
            .background(Theme.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $adding) {
                AddTitleView(initial: query, type: type) { id, added in
                    adding = false
                    if added { router.notify("Added to Teli") }
                    router.open(id)
                }
                .presentationBackground(Theme.bg)
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Theme.text2)
                TextField("Titles, directors, genres…", text: $query)
                    .focused($focused)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.text3) }
                        .accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 46)
            .background(Capsule().fill(Color.white.opacity(0.07)))
            .overlay(Capsule().strokeBorder(Theme.border))
            Button { withAnimation { showFilters.toggle() } } label: {
                Image(systemName: "line.3.horizontal.decrease")
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(showFilters || type != nil || !genres.isEmpty ? Theme.accent.opacity(0.3) : Color.white.opacity(0.07)))
                    .overlay(Circle().strokeBorder(Theme.border))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Filters")
        }
        .padding(.top, 8)
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("Type", selection: $type) {
                Text("All").tag(MediaType?.none)
                Text("Movies").tag(MediaType?.some(.movie))
                Text("Shows").tag(MediaType?.some(.tv))
            }
            .pickerStyle(.segmented)
            FlowLayout {
                ForEach(Catalog.shared.genres, id: \.self) { g in
                    Chip(label: g, on: genres.contains(g), tint: Catalog.color(forGenre: g)) {
                        if genres.contains(g) { genres.remove(g) } else { genres.insert(g) }
                    }
                }
            }
            if type != nil || !genres.isEmpty {
                Button("Clear all") { type = nil; genres = [] }.font(.system(size: 14, weight: .semibold))
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 18).fill(Theme.surface))
    }

    private var browse: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Visit a genre").font(.system(size: 20, weight: .bold))
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(Catalog.shared.genres, id: \.self) { g in
                    Button { genres = [g] } label: {
                        HStack {
                            Circle().fill(Catalog.color(forGenre: g)).frame(width: 14, height: 14)
                            Text(g).font(.system(size: 15, weight: .semibold))
                            Spacer()
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Catalog.color(forGenre: g).opacity(0.14)))
                        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Catalog.color(forGenre: g).opacity(0.4)))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private var list: some View {
        let found = results
        if found.isEmpty {
            EmptyState(icon: "magnifyingglass", title: "No results",
                       message: query.isEmpty ? "Nothing matches these filters." : "Nothing matches “\(query)”. Try a title, director, or genre.")
        }
        LazyVStack(spacing: 12) {
            ForEach(Array(found.enumerated()), id: \.element.id) { i, t in
                TitleCard(title: t, review: store.data.reviews[t.id]) {
                    if store.ratings[t.id] == nil { SaveRateButtons(id: t.id) }
                }
                .onTapGesture { router.open(t.id) }
                .onAppear {
                    if i >= 6 { deep = true } else if i <= 1 { deep = false }
                }
            }
        }
        if !query.trimmingCharacters(in: .whitespaces).isEmpty {
            Button { adding = true } label: {
                Label("Can’t find it? Add “\(query.trimmingCharacters(in: .whitespaces))”", systemImage: "plus")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.border, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
            }
            .buttonStyle(.plain)
        }
    }
}

/// Add a title Teli doesn't have: name, type, year, up to three genres, and a director or network.
/// If Teli already has it, offers that one instead.
struct AddTitleView: View {
    let initial: String
    let type: MediaType?
    let onDone: (_ id: String, _ added: Bool) -> Void
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var kind: MediaType = .movie
    @State private var year = Calendar.current.component(.year, from: Date())
    @State private var genres: [String] = []
    @State private var creator = ""

    private var existing: Title? {
        Catalog.shared.findShipped(type: kind, title: name, year: year)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $name)
                    Picker("Type", selection: $kind) {
                        Text("Movie").tag(MediaType.movie)
                        Text("Show").tag(MediaType.tv)
                    }
                    .pickerStyle(.segmented)
                    Stepper("Year: \(String(year))", value: $year, in: 1870...(Calendar.current.component(.year, from: Date()) + 1))
                    TextField(kind == .movie ? "Director (optional)" : "Network (optional)", text: $creator)
                }
                Section("Genres · up to 3") {
                    FlowLayout {
                        ForEach(Catalog.shared.genres, id: \.self) { g in
                            Chip(label: g, on: genres.contains(g), tint: Catalog.color(forGenre: g)) {
                                if let i = genres.firstIndex(of: g) { genres.remove(at: i) } else if genres.count < 3 { genres.append(g) }
                            }
                        }
                    }
                    .padding(.vertical, 6)
                }
                if let t = existing {
                    Section {
                        Button("Teli has \(t.title) (\(String(t.year))): open it") { onDone(t.id, false) }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .navigationTitle("Add a title")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let id = store.addTitle(type: kind, title: name, year: year, genres: genres, creator: creator)
                        onDone(id, id.hasPrefix("u-"))
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || genres.isEmpty)
                }
            }
            .onAppear {
                name = initial.trimmingCharacters(in: .whitespaces)
                if let type { kind = type }
            }
        }
    }
}
