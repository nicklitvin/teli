import SwiftUI
import UniformTypeIdentifiers

/// Settings, in place of the logbook: your name, your rating keywords, backups (import and reset
/// ask first), hidden titles, and the version with what's new.
struct SettingsView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @AppStorage("teli.name") private var name = ""
    @State private var importing = false
    @State private var pendingImport: (data: AppData, name: String)?
    @State private var confirmReset = false
    @State private var note: String?
    @State private var exportURL: URL?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            label("You")
            group {
                HStack {
                    Image(systemName: "person").foregroundStyle(Theme.accentText).frame(width: 24)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Your name").font(.system(size: 15, weight: .semibold))
                        Text("Shown to your crew").font(.system(size: 12)).foregroundStyle(Theme.text2)
                    }
                    TextField("Add a name", text: $name)
                        .multilineTextAlignment(.trailing)
                        .textContentType(.nickname)
                        .onChange(of: name) { if name.count > 40 { name = String(name.prefix(40)) } }
                }
                .padding(14)
            }

            label("Rating keywords")
            KeywordsEditor()

            label("Your data")
            group {
                VStack(spacing: 0) {
                    if let exportURL {
                        ShareLink(item: exportURL) { row("square.and.arrow.up", "Export backup", "Download your ratings and watchlist, or send it to your crew") }
                    } else {
                        Button { prepareExport() } label: { row("square.and.arrow.up", "Export backup", "Download your ratings and watchlist, or send it to your crew") }
                    }
                    Divider().overlay(Theme.border)
                    Button { importing = true } label: { row("square.and.arrow.down", "Import backup", "Replace everything here with a backup file") }
                    Divider().overlay(Theme.border)
                    NavigationLink(value: HiddenTitles()) {
                        row("eye.slash", "Not interested", store.data.dismissed.isEmpty ? "Nothing hidden" : "\(store.data.dismissed.count) hidden", chevron: true)
                    }
                    Divider().overlay(Theme.border)
                    Button { confirmReset = true } label: { row("trash", "Reset everything", "Erase all ratings, watchlist, hidden titles and keywords", danger: true) }
                }
                .buttonStyle(.plain)
            }
            if let note {
                Label(note, systemImage: "checkmark").font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.verdict(.good)).padding(.horizontal, 4)
            }

            label("About")
            group {
                VStack(alignment: .leading, spacing: 0) {
                    row("sparkles", "Teli \(Version.current)", "Updated \(Version.date(Version.notes[0].date))")
                    ForEach(Array(Version.notes.enumerated()), id: \.element.id) { i, n in
                        Divider().overlay(Theme.border)
                        PatchNote(note: n, latest: i == 0)
                    }
                }
            }
        }
        .onAppear { prepareExport() }
        .onChange(of: store.data) { prepareExport() }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json, .data]) { result in
            guard case .success(let url) = result else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let parsed = try Store.parseBackup(Data(contentsOf: url))
                pendingImport = (parsed, url.lastPathComponent)
                note = nil
            } catch {
                note = "“\(url.lastPathComponent)” isn’t a Teli backup. Use a file saved with Export backup."
            }
        }
        .alert("Import this backup?", isPresented: Binding(get: { pendingImport != nil }, set: { if !$0 { pendingImport = nil } })) {
            Button("Cancel", role: .cancel) { pendingImport = nil }
            Button("Import") {
                if let p = pendingImport {
                    store.replace(with: p.data)
                    note = "Imported \(p.data.reviews.count) ratings and \(p.data.watchlist.count) watchlist titles."
                }
                pendingImport = nil
            }
        } message: {
            if let p = pendingImport {
                Text("Your \(store.ratedCount) ratings here will be replaced with \(p.data.reviews.count) ratings and \(p.data.watchlist.count) watchlist titles from \(p.name).")
            }
        }
        .alert("Reset everything?", isPresented: $confirmReset) {
            Button("Cancel", role: .cancel) {}
            Button("Erase all", role: .destructive) {
                store.reset()
                note = "Everything was erased."
            }
        } message: {
            Text("This erases \(resetSummary) from this device. It can’t be undone. Export a backup first if you might want them back.")
        }
    }

    private var resetSummary: String {
        var parts: [String] = []
        if store.ratedCount > 0 { parts.append("\(store.ratedCount) rating\(store.ratedCount == 1 ? "" : "s")") }
        if !store.data.watchlist.isEmpty { parts.append("\(store.data.watchlist.count) watchlist title\(store.data.watchlist.count == 1 ? "" : "s")") }
        if !store.data.dismissed.isEmpty { parts.append("\(store.data.dismissed.count) hidden title\(store.data.dismissed.count == 1 ? "" : "s")") }
        parts.append("your keywords")
        return parts.count == 1 ? parts[0] : parts.dropLast().joined(separator: ", ") + " and " + parts.last!
    }

    private func prepareExport() { exportURL = try? store.exportFile() }

    private func label(_ s: String) -> some View {
        Text(s.uppercased()).font(.system(size: 11.5, weight: .bold)).tracking(0.7).foregroundStyle(Theme.text2)
            .padding(.top, 18).padding(.horizontal, 4)
    }

    private func group<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        content()
            .background(RoundedRectangle(cornerRadius: 16).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.border))
    }

    private func row(_ icon: String, _ title: String, _ sub: String, danger: Bool = false, chevron: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundStyle(danger ? Theme.verdict(.bad) : Theme.accentText).frame(width: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(danger ? Theme.verdict(.bad) : .white)
                Text(sub).font(.system(size: 12)).foregroundStyle(Theme.text2).multilineTextAlignment(.leading)
            }
            Spacer()
            if chevron { Image(systemName: "chevron.right").foregroundStyle(Theme.text3) }
        }
        .padding(14)
        .contentShape(Rectangle())
    }
}

private struct PatchNote: View {
    let note: Version.Note
    let latest: Bool
    @State private var open = false

    var body: some View {
        DisclosureGroup(isExpanded: $open) {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(note.items, id: \.self) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").foregroundStyle(Theme.text3)
                        Text(item).font(.system(size: 13)).foregroundStyle(Theme.text2)
                    }
                }
            }
            .padding(.top, 6)
        } label: {
            HStack {
                Text(latest ? "What’s new" : note.version).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white)
                Spacer()
                Text(latest ? note.version : Version.date(note.date, style: .dateTime.month(.abbreviated).day()))
                    .font(.system(size: 12)).foregroundStyle(Theme.text3)
            }
        }
        .padding(14)
        .onAppear { open = latest }
    }
}

/// Your rating keywords: rename in place, remove, or add your own, up to `Tag.maxCount`. Ratings keep
/// a keyword you remove (it just stops being offered), and renaming one renames it everywhere.
struct KeywordsEditor: View {
    @Environment(Store.self) private var store
    @State private var draft = ""
    @State private var error: String?

    private var full: Bool { store.tags.count >= Tag.maxCount }

    /// What's wrong with this label, if anything (`me` is the keyword being renamed).
    private func problem(_ label: String, me: String? = nil) -> String? {
        if label.isEmpty { return "Type a keyword first." }
        if Tag.makeId(label).isEmpty { return "Use at least one letter or number." }
        if let twin = store.tags.first(where: { $0.id != me && ($0.label.lowercased() == label.lowercased() || $0.id == Tag.makeId(label)) }) {
            return "You already have “\(twin.label)”."
        }
        return nil
    }

    var body: some View {
        let uses = Dictionary(store.data.reviews.values.flatMap(\.tags).map { ($0, 1) }, uniquingKeysWith: +)
        VStack(alignment: .leading, spacing: 8) {
            Text("The words you can pick when you rate something. Up to \(Tag.maxCount), \(Tag.maxLength) letters each.")
                .font(.system(size: 12.5)).foregroundStyle(Theme.text2).padding(.horizontal, 4)
            VStack(spacing: 0) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 0), GridItem(.flexible(), spacing: 0)], spacing: 0) {
                    ForEach(store.tags) { tag in
                        KeywordCell(tag: tag, uses: uses[tag.id] ?? 0) { label in
                            if let p = problem(label, me: tag.id) { error = p; return false }
                            error = nil
                            store.setTags(store.tags.map { $0.id == tag.id ? Tag(id: tag.id, label: label) : $0 })
                            return true
                        } remove: {
                            error = nil
                            store.setTags(store.tags.filter { $0.id != tag.id })
                        }
                    }
                }
                if store.tags.isEmpty {
                    Text("No keywords: rating skips “What stood out?”.").font(.system(size: 13)).foregroundStyle(Theme.text2).padding(14)
                }
                Divider().overlay(Theme.border)
                HStack {
                    TextField(full ? "\(Tag.maxCount) of \(Tag.maxCount): remove one to add more" : "Add a keyword", text: $draft)
                        .disabled(full)
                        .submitLabel(.done)
                        .onSubmit(add)
                        .onChange(of: draft) {
                            error = nil
                            if draft.count > Tag.maxLength { draft = String(draft.prefix(Tag.maxLength)) }
                        }
                    Button(action: add) { Image(systemName: "plus").frame(width: 32, height: 32).background(Circle().fill(Color.white.opacity(0.08))) }
                        .buttonStyle(.plain)
                        .disabled(full || draft.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityLabel("Add keyword")
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
            }
            .background(RoundedRectangle(cornerRadius: 16).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.border))
            HStack {
                Text(error ?? "\(store.tags.count) of \(Tag.maxCount)")
                    .font(.system(size: 12.5, weight: error == nil ? .regular : .medium))
                    .foregroundStyle(error == nil ? Theme.text3 : Theme.verdict(.bad))
                Spacer()
                if store.tags != Tag.defaults {
                    Button { error = nil; store.setTags(nil) } label: { Label("Restore defaults", systemImage: "arrow.counterclockwise") }
                        .font(.system(size: 13, weight: .semibold))
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private func add() {
        let label = draft.trimmingCharacters(in: .whitespaces)
        if full { error = "That’s the most you can have (\(Tag.maxCount)). Remove one to add another."; return }
        if let p = problem(label) { error = p; return }
        error = nil
        store.setTags(store.tags + [Tag(id: Tag.makeId(label), label: label)])
        draft = ""
    }
}

/// One keyword: tap to rename (Return or leaving the field saves; a bad name goes back), × to remove.
private struct KeywordCell: View {
    let tag: Tag
    let uses: Int
    let rename: (String) -> Bool
    let remove: () -> Void
    @State private var text = ""
    @FocusState private var editing: Bool

    var body: some View {
        HStack(spacing: 4) {
            TextField("Keyword", text: $text)
                .font(.system(size: 16, weight: .semibold))
                .focused($editing)
                .submitLabel(.done)
                .onSubmit(commit)
                .onChange(of: editing) { if !editing { commit() } }
                .onChange(of: text) { if text.count > Tag.maxLength { text = String(text.prefix(Tag.maxLength)) } }
            if uses > 0 { Text("\(uses)×").font(.system(size: 12)).foregroundStyle(Theme.text3).accessibilityLabel("used \(uses) times") }
            Button(action: remove) { Image(systemName: "xmark").font(.system(size: 13)).foregroundStyle(Theme.text3).frame(width: 30, height: 30) }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove \(tag.label)")
        }
        .padding(.leading, 14).padding(.trailing, 4).frame(height: 46)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 1) }
        .onAppear { text = tag.label }
        .onChange(of: tag.label) { text = tag.label }
    }

    private func commit() {
        let label = text.trimmingCharacters(in: .whitespaces)
        if label == tag.label { return }
        if !rename(label) { text = tag.label }
    }
}
