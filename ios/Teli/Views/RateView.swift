import SwiftUI

/// Rating takes one page: good, ok or bad; an optional short note; would you watch it again.
struct RateView: View {
    let id: String
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router
    @Environment(\.dismiss) private var dismiss
    @State private var verdict: Verdict?
    @State private var note = ""
    @FocusState private var writing: Bool
    @State private var again = false

    var body: some View {
        if let t = Catalog.shared[id] {
            let prev = store.data.reviews[id]
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        HStack(alignment: .top, spacing: 14) {
                            PosterView(title: t, px: 250)
                                .frame(width: 86, height: 129)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(t.title).font(.system(size: 22, weight: .bold))
                                Text(t.metaLine).font(.system(size: 14)).foregroundStyle(Theme.text2)
                                if prev?.pending == true {
                                    Text("Carried over as \(prev!.verdict.label.lowercased()) from your old rankings. Check it still fits.")
                                        .font(.system(size: 13)).foregroundStyle(Theme.accentText)
                                }
                            }
                        }

                        Text("How was it?").font(.system(size: 17, weight: .bold))
                        HStack(spacing: 12) {
                            ForEach(Verdict.allCases) { v in
                                Button { verdict = v } label: {
                                    VStack(spacing: 8) {
                                        Image(systemName: v == .good ? "hand.thumbsup.fill" : v == .ok ? "face.smiling" : "hand.thumbsdown.fill")
                                            .font(.system(size: 24))
                                            .frame(width: 64, height: 64)
                                            .background(Circle().fill(verdict == v ? Theme.verdict(v) : Color.white.opacity(0.07)))
                                            .foregroundStyle(verdict == v ? Theme.onGlow : Theme.verdict(v))
                                        Text(v.label).font(.system(size: 14, weight: .semibold))
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(verdict == v ? .isSelected : [])
                            }
                        }

                        HStack(alignment: .firstTextBaseline) {
                            Text("A note").font(.system(size: 17, weight: .bold))
                            Text("Optional").font(.system(size: 13)).foregroundStyle(Theme.text3)
                        }
                        ZStack(alignment: .bottomTrailing) {
                            TextField("What stuck with you?", text: $note, axis: .vertical)
                                .lineLimit(2...4)
                                .focused($writing)
                                .submitLabel(.done)
                                .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 24)
                                .background(RoundedRectangle(cornerRadius: 14).fill(Theme.surface))
                                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(writing ? Theme.accent : Theme.border))
                                .onChange(of: note) {
                                    // One line, at most the limit: Return finishes instead of starting a new line.
                                    if note.contains("\n") { note = note.replacingOccurrences(of: "\n", with: " "); writing = false }
                                    if note.count > ReviewNote.maxLength { note = String(note.prefix(ReviewNote.maxLength)) }
                                }
                            Text("\(note.count)/\(ReviewNote.maxLength)")
                                .font(.system(size: 11.5).monospacedDigit())
                                .foregroundStyle(note.count >= ReviewNote.maxLength ? Theme.verdict(.ok) : Theme.text3)
                                .padding(.trailing, 12).padding(.bottom, 6)
                        }

                        Toggle(isOn: $again) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Would watch again").font(.system(size: 16, weight: .semibold))
                                Text("Rewatches show up as picks in your crew").font(.system(size: 13)).foregroundStyle(Theme.text2)
                            }
                        }
                        .toggleStyle(.switch)
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.surface))
                    }
                    .padding(20)
                }
                .safeAreaInset(edge: .bottom) {
                    Button {
                        guard let verdict else { return }
                        store.rate(id, verdict: verdict, note: note, again: again)
                        router.notify("Rated \(t.title) \(verdict.label.lowercased())")
                        dismiss()
                    } label: {
                        Text("Finish").font(.system(size: 16, weight: .bold))
                            .frame(maxWidth: .infinity).frame(height: 52)
                            .background(Capsule().fill(verdict == nil ? AnyShapeStyle(Color.white.opacity(0.1)) : AnyShapeStyle(Theme.glow)))
                            .foregroundStyle(verdict == nil ? Theme.text3 : Theme.onGlow)
                    }
                    .buttonStyle(.plain)
                    .disabled(verdict == nil)
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .background(Theme.bg)
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
            }
            .onAppear {
                verdict = prev?.verdict
                note = prev?.note ?? ""
                again = prev?.again ?? false
            }
        }
    }
}
