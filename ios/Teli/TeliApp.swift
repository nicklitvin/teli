import SwiftUI
import Observation

@main
struct TeliApp: App {
    @State private var store = Store()
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(router)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
    }
}

/// App-wide navigation: which tab is showing, and the title being rated or looked at.
@Observable
final class Router {
    enum Tab: Hashable { case forYou, search, galaxy, crew, profile }

    struct Item: Identifiable, Hashable { let id: String }

    var tab: Tab = .forYou
    /// The title whose rating sheet is open.
    var rating: Item?
    /// The title whose detail sheet is open.
    var detail: Item?
    /// A short message at the bottom of the screen ("Rated Dune good").
    var toast: String?

    func rate(_ id: String) { rating = Item(id: id) }
    func open(_ id: String) { detail = Item(id: id) }

    func notify(_ message: String) {
        toast = message
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.4))
            if toast == message { toast = nil }
        }
    }
}

struct RootView: View {
    @Environment(Router.self) private var router
    @Environment(Store.self) private var store

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.tab) {
            ForYouView()
                .tabItem { Label("For You", systemImage: "sparkles") }
                .tag(Router.Tab.forYou)
            SearchView()
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
                .tag(Router.Tab.search)
            GalaxyView()
                .tabItem { Label("Galaxy", systemImage: "globe.americas") }
                .tag(Router.Tab.galaxy)
            CrewView()
                .tabItem { Label("Crew", systemImage: "person.2") }
                .tag(Router.Tab.crew)
            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                .tag(Router.Tab.profile)
        }
        .background(Theme.bg.ignoresSafeArea())
        .sheet(item: $router.rating) { item in
            RateView(id: item.id)
                .presentationDetents([.large])
                .presentationBackground(Theme.bg)
        }
        .sheet(item: $router.detail) { item in
            NavigationStack { DetailView(id: item.id) }
                .presentationBackground(Theme.bg)
        }
        .overlay(alignment: .bottom) {
            if let toast = router.toast {
                Text(toast)
                    .font(.system(size: 14, weight: .semibold))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Capsule().fill(.ultraThinMaterial))
                    .padding(.bottom, 64)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.3), value: router.toast)
    }
}
