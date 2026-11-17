import SwiftUI

/// Watching together is still being built: crews sync through Supabase on the web app, and that
/// isn't wired up here yet. Meanwhile this shows what's coming, and the picks a crew of one would get.
struct CrewView: View {
    @Environment(Store.self) private var store
    @Environment(Router.self) private var router

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    HStack(spacing: 8) {
                        Rectangle()
                            .fill(LinearGradient(stops: [.init(color: Theme.wip, location: 0), .init(color: Theme.wip, location: 0.5),
                                                         .init(color: Color(hex: 0x2A2110), location: 0.5), .init(color: Color(hex: 0x2A2110), location: 1)],
                                                 startPoint: .topLeading, endPoint: UnitPoint(x: 0.2, y: 0.2)))
                            .frame(width: 18, height: 10)
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                        Text("Watch together is under construction").font(.system(size: 12.5, weight: .bold))
                    }
                    .foregroundStyle(Color(hex: 0xFFD27A))
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Capsule().fill(Theme.wip.opacity(0.12)))
                    .overlay(Capsule().strokeBorder(Theme.wip.opacity(0.4)))
                    .padding(.top, 40)

                    Image(systemName: "person.2").font(.system(size: 30)).foregroundStyle(Theme.accentText).padding(.top, 20)
                    Text("Watch together").font(.system(size: 22, weight: .bold))
                    Text("Start a crew and share the code. Everyone’s ratings stay in sync, and picks update as they rate. Coming to the app soon; it works on the web today.")
                        .font(.system(size: 14)).foregroundStyle(Theme.text2).multilineTextAlignment(.center).frame(maxWidth: 320)

                    let rewatch = store.ratings.values.filter { $0.review.again }.compactMap { Catalog.shared[$0.id] }.prefix(12)
                    if !rewatch.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Your rewatch favourites, for movie night").font(.system(size: 16, weight: .bold))
                            ScrollView(.horizontal) {
                                LazyHStack(spacing: 10) {
                                    ForEach(Array(rewatch)) { t in
                                        Button { router.open(t.id) } label: {
                                            PosterView(title: t, px: 250).frame(width: 96, height: 144).clipShape(RoundedRectangle(cornerRadius: 10))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                            .scrollIndicators(.hidden)
                        }
                        .padding(.top, 24)
                    }
                }
                .padding(.horizontal, 20)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.bg.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}
