import SwiftUI

// MARK: Theme

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: opacity)
    }
}

/// The space look from the web app: deep navy, violet-to-teal accent.
enum Theme {
    static let bg = Color(hex: 0x0B0D1F)
    static let bg2 = Color(hex: 0x161936)
    static let surface = Color(hex: 0x13163A, opacity: 0.85)
    static let border = Color(hex: 0x96A0FF, opacity: 0.14)
    static let text2 = Color(hex: 0x9EA3D6)
    static let text3 = Color(hex: 0x626796)
    static let accent = Color(hex: 0x8B7BFF)
    static let accent2 = Color(hex: 0x3EE6D4)
    static let accentText = Color(hex: 0xBDB4FF)
    static let glow = LinearGradient(colors: [Color(hex: 0xA08FFF), accent, accent2], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let onGlow = Color(hex: 0x07091A)
    static let wip = Color(hex: 0xF8B940)

    static func verdict(_ v: Verdict) -> Color {
        switch v {
        case .good: Color(hex: 0x2FD393)
        case .ok: Color(hex: 0xF8B940)
        case .bad: Color(hex: 0xFB6B8A)
        }
    }
}

// MARK: Posters

/// A poster: the image when it loads, over generated art (a gradient and the title) that doubles as placeholder and fallback.
struct PosterView: View {
    let title: Title
    var px = 330
    var showTitle = true

    var body: some View {
        ZStack {
            PosterArt(title: title, showTitle: showTitle)
            if let ref = title.image, let url = Catalog.imageURL(ref, px: px) {
                RetryingImage(url: url, wide: ref.aspect > 0.85)
            }
        }
        .clipped()
    }
}

/// Loads an image, retrying twice (further apart each time) since a failure is usually the host asking for a pause.
private struct RetryingImage: View {
    let url: URL
    let wide: Bool
    @State private var attempt = 0

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
            switch phase {
            case .success(let image):
                if wide {
                    // Title cards and logos are landscape: whole, over a blurred copy, instead of cropped.
                    ZStack {
                        image.resizable().scaledToFill().blur(radius: 14).brightness(-0.25)
                        image.resizable().scaledToFit()
                    }
                } else {
                    image.resizable().scaledToFill()
                }
            case .failure:
                Color.clear.task(id: attempt) {
                    guard attempt < 2 else { return }
                    try? await Task.sleep(for: .seconds(2 * pow(3, Double(attempt))))
                    attempt += 1
                }
            default:
                Color.clear
            }
        }
        .id(attempt)
    }
}

/// Generated key art: a gradient fixed for the title, with its name in a type style that suits its genre.
struct PosterArt: View {
    let title: Title
    var showTitle = true

    private var hash: UInt32 {
        var h: UInt32 = 2166136261
        for u in title.id.utf16 { h = (h ^ UInt32(u)) &* 16777619 }
        return h
    }

    var body: some View {
        let h = hash
        let hue = Double(h % 360) / 360
        let hue2 = Double((h % 360 + 25 + (h >> 9) % 80) % 360) / 360
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [Color(hue: hue, saturation: 0.65, brightness: 0.62), Color(hue: hue2, saturation: 0.75, brightness: 0.22)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            if showTitle {
                Text(title.title)
                    .font(.system(size: 15, weight: .bold, design: ["Drama", "Romance", "History", "War", "Western"].contains(title.genres.first ?? "") ? .serif : .rounded))
                    .foregroundStyle(.white.opacity(0.92))
                    .minimumScaleFactor(0.6)
                    .lineLimit(4)
                    .padding(10)
            }
        }
    }
}

// MARK: Bits

struct VerdictBadge: View {
    let review: Review
    var large = false

    var body: some View {
        Text(review.verdict.label)
            .font(.system(size: large ? 15 : 12.5, weight: .bold))
            .padding(.horizontal, large ? 14 : 10)
            .padding(.vertical, large ? 7 : 4)
            .foregroundStyle(review.pending == true ? Theme.verdict(review.verdict) : Theme.onGlow)
            .background {
                if review.pending == true {
                    Capsule().strokeBorder(Theme.verdict(review.verdict), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                } else {
                    Capsule().fill(Theme.verdict(review.verdict))
                }
            }
            .accessibilityLabel("\(review.verdict.label)\(review.again ? ", would watch again" : "")")
    }
}

/// A toggle chip, optionally tinted (genres use their colour).
struct Chip: View {
    let label: String
    var on = false
    var tint: Color = Theme.accent
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13.5, weight: .semibold))
                .padding(.horizontal, 13)
                .padding(.vertical, 8)
                .foregroundStyle(on ? .white : Color.white.opacity(0.85))
                .background(Capsule().fill(on ? tint.opacity(0.35) : Color.white.opacity(0.06)))
                .overlay(Capsule().strokeBorder(on ? tint : Theme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Lays children out left to right, wrapping onto new lines.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width {
                y += line + spacing
                x = 0
                line = 0
            }
            x += size.width + spacing
            line = max(line, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                y += line + spacing
                x = bounds.minX
                line = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            line = max(line, size.height)
        }
    }
}

/// A big image card for lists: poster across the card, title and details over the bottom.
struct TitleCard<Actions: View>: View {
    let title: Title
    var detail: String?
    var review: Review?
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            PosterView(title: title, px: 500, showTitle: false)
                .frame(height: 220)
                .frame(maxWidth: .infinity)
            LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .center, endPoint: .bottom)
            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title.title).font(.system(size: 20, weight: .bold)).foregroundStyle(.white).lineLimit(2)
                    Text(detail ?? title.metaLine).font(.system(size: 13)).foregroundStyle(.white.opacity(0.8)).lineLimit(1)
                }
                Spacer(minLength: 8)
                if let review { VerdictBadge(review: review, large: true) }
                actions()
            }
            .padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Theme.border))
        .contentShape(Rectangle())
    }
}

extension TitleCard where Actions == EmptyView {
    init(title: Title, detail: String? = nil, review: Review? = nil) {
        self.init(title: title, detail: detail, review: review, actions: { EmptyView() })
    }
}

/// Save and Rate, for titles you haven't rated.
struct SaveRateButtons: View {
    let id: String
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router

    var body: some View {
        let saved = store.isSaved(id)
        HStack(spacing: 8) {
            Button { store.toggleWatchlist(id) } label: {
                Image(systemName: saved ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(saved ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(.ultraThinMaterial)))
                    .foregroundStyle(saved ? Theme.onGlow : .white)
            }
            .accessibilityLabel(saved ? "Remove from watchlist" : "Save to watchlist")
            Button { router.rate(id) } label: {
                Text("Rate").font(.system(size: 14, weight: .bold))
                    .padding(.horizontal, 16).frame(height: 38)
                    .background(Capsule().fill(Theme.glow))
                    .foregroundStyle(Theme.onGlow)
            }
        }
        .buttonStyle(.plain)
    }
}

struct EmptyState: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 30)).foregroundStyle(Theme.accentText)
            Text(title).font(.system(size: 19, weight: .bold))
            Text(message).font(.system(size: 14)).foregroundStyle(Theme.text2).multilineTextAlignment(.center).frame(maxWidth: 300)
        }
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity)
    }
}
