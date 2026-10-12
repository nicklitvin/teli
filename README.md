# Teli

Beli-style ranking for movies and TV. You don't type in a rating; you rank by comparison:

1. Pick something you've watched.
2. Say whether you **liked it**, thought it was **fine**, or **didn't like it**.
3. Answer "which do you prefer?" a few times. Teli binary-searches your existing list, so it takes about log₂(n) taps.

The score comes from where the title lands. Each reaction has its own band (liked 6.8–10, fine 3.4–6.7, didn't like 0–3.3), and your ranking inside that band sets the exact number. Movies and shows are ranked separately.

## Features

- **For You**: a full-screen feed of recommendations, one per screen, edge to edge. Each card shows the poster, a match %, a "because you liked X" reason, and buttons to rate it, save it or hide it. The **Discover** tag in the top corner switches the feed to well-known titles from genres and themes you haven't ranked anything in yet, rotating between them so it isn't one genre in a row.
- **Search**: finds titles by name, director or network, genre, tag, year or acronym (`lotr`, `gotg`). You can also browse by genre. Each result has separate **Save** (watchlist) and **Rate** buttons.
- **Galaxy** (taste map): switch between **genres, themes, decades and creators** (directors and networks). Everything you've explored is a planet in orbit, sized by how much you've ranked, surfaced with the poster of a favourite and labelled with your average score; the selected one gets a ring. Groups you haven't touched are dim planets in the "uncharted" drawer next to the count. Tap any of them for your top titles and picks to explore further, or titles to start with.
- **Crew**: load other people's backup files to get picks that nobody in the group has ranked, filtered by type and by genre (a single scrolling row of the genres in your picks).
- **Profile**: your logbook. Movies and shows are each ranked by your score (top 5, then Show all), followed by your watchlist. A quiet link at the bottom brings back titles you marked "Not interested". The gear holds export, import and reset.
- Space-exploration look: a starfield with nebula glows, glass panels, a violet-to-teal accent, Space Grotesk headings over Inter text. Every list of titles is a big image card with the name and your score over the bottom. Respects safe areas and reduced motion.
- No API calls at runtime, and your data is kept in `localStorage`. Poster images load from Wikimedia; when they can't load (for example offline), you see generated art instead.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static build in dist/ (relative paths, so it works from file://)
```

## Catalog

The library has about 13,400 titles (9,000 movies, 4,400 shows) from two sources:

- [`data/catalog.txt`](data/catalog.txt): about 930 hand-written titles, one per line.
- `data/wikidata.json`: films and series pulled from Wikidata by `npm run wikidata`. A title is included when it has an English Wikipedia article and articles in many other languages (20+ for films, 10+ for series), which works well as a popularity filter. Wikidata's fine-grained genres ("heist film", "space opera") are mapped onto Teli's 21 genres and kept as themes, along with the title's main subjects and franchise.

Lines in `catalog.txt` look like this:

```
Title|Year|M or T|Genre,Genre|tag,tag|Director or Network
```

Run `npm run catalog` to merge both into `src/data/catalog.json` (about 2.2 MB). It validates genres, rejects duplicates, and skips Wikidata titles that are already in `catalog.txt`. Wikidata titles that share a Wikipedia image with an earlier title (Se7en / Seven) are merged into it, and `src/data/aliases.json` maps the dropped ids so saved rankings follow.

Then run `npm run images` to find images for any new titles. It looks up each title's Wikipedia article, checks the article's short description to confirm it's the right film or series and year, and stores the article's lead image URL (usually the poster or title card) in `src/data/images.json`. Titles from Wikidata already know their article, so they skip the guessing. This step needs network access, but the app itself makes no API calls. Use `npm run images -- --all` to look up every title again.

## Watching together

Everyone exports a backup from their Profile tab (the gear) and sends the file to one person, who adds the files on the Crew tab. Titles that anyone has ranked or marked "Not interested" are left out. Each remaining title is scored with the normal recommender for each person. A title's group score is half the average of those scores and half the lowest one, so a pick that only one person loves won't win. Titles on someone's watchlist get a boost.

## How recommendations work

`src/lib/recommend.ts` turns each title into a weighted feature vector built from its genres, tags, director or network, type and decade. Similarity between titles is cosine similarity. A candidate's score is the sum of its similarity to every title you've rated, with each term weighted by your score for that title. Titles you didn't like push similar titles down.

## Going native later

Everything runs in the frontend and the build uses relative asset paths, so you can drop `dist/` into Electron, or into Capacitor for iOS and Android, without changes. `localStorage` persists in both.
