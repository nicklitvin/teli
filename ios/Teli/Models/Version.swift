import Foundation

/// What changed in each release, newest first. Shown in Settings; the first entry is the current version.
enum Version {
    struct Note: Identifiable {
        let version: String
        let date: String
        let items: [String]
        var id: String { version }
    }

    static let notes: [Note] = [
        Note(version: "1.7.0", date: "2026-11-17", items: [
            "Galaxy: one neighbourhood per genre, so no more \"Comedy\" next to \"Comedy & Western\" or \"Crime\" next to \"Crime shows\"",
            "Galaxy: show what you’ve seen, what you haven’t, or both",
            "Galaxy: highlight several genres, decades, themes and creators at once",
            "Galaxy: taps only pick titles and neighbourhoods whose names are showing",
            "Galaxy: bubbles are gone; every title is a dot",
        ]),
        Note(version: "1.6.0", date: "2026-11-17", items: [
            "The iPhone app: everything from the web app, natively",
            "Galaxy: neighbourhoods with the same name are one place now, with easier-to-read names",
            "Galaxy: hide all names, or show neighbourhoods as bubbles so only what you watched stands out",
            "Settings has your rating keywords: rename, remove or add up to 16",
            "Reset everything asks first",
            "Search has a back-to-top button once you scroll down",
            "Watch together is marked as under construction",
        ]),
        Note(version: "1.5.1", date: "2026-11-15", items: [
            "Posters load reliably: right-sized thumbnails, and a failed one tries again",
            "Real posters for about 7,700 shows, from TVmaze",
        ]),
        Note(version: "1.5.0", date: "2026-11-10", items: [
            "Galaxy is a map of the whole library, with your ratings as constellations",
            "About 30,500 titles, including 22,000 films",
            "Watchlist stats: how much you save and go on to watch",
        ]),
        Note(version: "1.4.0", date: "2026-11-01", items: ["Add a title Teli doesn’t have from search"]),
        Note(version: "1.3.0", date: "2026-10-28", items: ["Roughly twice as many shows", "Logbook sort, and stats as charts"]),
        Note(version: "1.2.0", date: "2026-10-26", items: ["Rate with good, ok or bad, plus keywords and would watch again"]),
        Note(version: "1.1.0", date: "2026-10-12", items: ["Crews, logbook tabs and filters, fresh feeds on every visit"]),
        Note(version: "1.0.0", date: "2026-10-11", items: ["Teli: log movies and shows, get recommendations, and find something to watch together"]),
    ]

    static var current: String { notes[0].version }

    static func date(_ s: String, style: Date.FormatStyle = .dateTime.month(.wide).day().year()) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.date(from: s).map { $0.formatted(style) } ?? s
    }
}
