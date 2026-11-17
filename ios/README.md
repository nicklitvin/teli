# Teli for iPhone

A native SwiftUI version of Teli (iOS 17+, Swift 5.9+, no third-party packages). It reads the same
library files as the web app (`../src/data/catalog.json`, `images.json`, `aliases.json`,
`map.json`), and backups move between the two: export from one, import in the other.

## Build it

**With XcodeGen (quickest):**

```sh
brew install xcodegen
cd ios
xcodegen          # writes Teli.xcodeproj from project.yml
open Teli.xcodeproj
```

Pick your team under Signing & Capabilities, choose a simulator or your phone, and run.

**By hand:** in Xcode, File › New › Project › iOS App (SwiftUI, Swift), name it Teli, set the
deployment target to iOS 17, delete the template's `ContentView.swift` and `TeliApp.swift`, then
drag the `Teli/` folder in here into the project. Drag the four JSON files from `../src/data` in too
(tick "Copy items if needed" only if you don't want them to follow web updates), and make sure they're
in the target's Copy Bundle Resources.

## What's in it

| | |
|---|---|
| `TeliApp.swift` | App entry, tab bar, the router for the rate and detail sheets, toasts |
| `Models/Models.swift` | Title, Review, Rating, Tag (keywords), AppData (the backup format), Rec |
| `Models/Catalog.swift` | Loads the library, posters and merged ids; poster URLs (Wikimedia thumbnail widths, TVmaze) |
| `Models/Store.swift` | Your data, saved as JSON in Application Support; rate, watchlist, hide, keywords, import/export |
| `Models/Recommender.swift` | The same recommender as the web app: feature vectors, inverted index, shuffle and Discover |
| `Models/SearchIndex.swift` | Name, director, genre, theme, year and acronym search |
| `Models/SkyData.swift` | The Galaxy map: positions, neighbourhoods and their patches |
| `Models/Version.swift` | Version number and patch notes (keep in step with `src/lib/version.ts`) |
| `Views/ForYouView.swift` | Full-screen paging feed with Discover and pull to refresh |
| `Views/SearchView.swift` | Search, filters, browse by genre, back to top, add a missing title |
| `Views/GalaxyView.swift` | The map in a Canvas: pan and pinch, dots or bubbles, names on or off, highlight, Uncharted |
| `Views/ProfileView.swift` | Logbook, filters, watchlist, stats (Swift Charts), hidden titles |
| `Views/SettingsView.swift` | Name, rating keywords editor, export / import / reset (each confirmed), version and notes |
| `Views/RateView.swift`, `DetailView.swift`, `CrewView.swift`, `Components.swift` | Rating sheet, title page, crew (under construction), shared pieces |

## Not in the app yet

- Crews: syncing through Supabase is web-only for now, so the Crew tab says it's under construction.
- When the library changes, rebuild the web data first (`npm run catalog`, `npm run images`,
  `npm run map`); the app picks up the new files on its next build.
