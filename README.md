# Teli

Beli-style ranking for movies and TV. You don't type in a rating; you rank by comparison:

1. Pick something you've watched.
2. Say whether you **liked it**, thought it was **fine**, or **didn't like it**.
3. Answer "which do you prefer?" a few times. Teli binary-searches your existing list, so it takes about log₂(n) taps.

The score comes from where the title lands. Each reaction has its own band (liked 6.8–10, fine 3.4–6.7, didn't like 0–3.3), and your ranking inside that band sets the exact number. Movies and shows are ranked separately.

## Features

- **For You**: swipe through your top 8 picks, then a single list of recommendations you can narrow to movies or shows. Each has a match % and a "because you liked X" reason.
- **Search**: finds titles by name, director or network, genre, tag, year or acronym (`lotr`, `gotg`). You can also browse by genre. Each result has separate **Save** (watchlist) and **Rate** buttons.
- **Taste Map**: switch between **genres, themes, decades and creators** (directors and networks). Everything you've explored is a bubble on a dark screening-room canvas, sized by how much you've ranked, filled with the poster of a favourite and labelled with your average score. Groups you haven't touched sit in a "Not explored yet" area below. Tap any of them for your top titles and picks to go deeper, or titles to start with.
- **Together**: load other people's backup files to get picks that nobody in the group has ranked, filtered by type and by genre (a single scrolling row of the genres in your picks).
- **My List**: your ranked list with scores, plus a watchlist.
- **Profile** (the avatar, top right): stats, titles you marked "Not interested" (with a Show again button), plus export, import and reset.
- Figma-inspired UI: Inter, flat surfaces with 1px borders, blue selection, and a dotted canvas. Supports dark mode and safe areas.
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

Run `npm run catalog` to merge both into `src/data/catalog.json` (about 2.2 MB). It validates genres, rejects duplicates, and skips Wikidata titles that are already in `catalog.txt`.

Then run `npm run images` to find images for any new titles. It looks up each title's Wikipedia article, checks the article's short description to confirm it's the right film or series and year, and stores the article's lead image URL (usually the poster or title card) in `src/data/images.json`. Titles from Wikidata already know their article, so they skip the guessing. This step needs network access, but the app itself makes no API calls. Use `npm run images -- --all` to look up every title again.

## Watching together

Everyone exports a backup from their profile and sends the file to one person, who adds the files on the Together tab. Titles that anyone has ranked or marked "Not interested" are left out. Each remaining title is scored with the normal recommender for each person. A title's group score is half the average of those scores and half the lowest one, so a pick that only one person loves won't win. Titles on someone's watchlist get a boost.

## How recommendations work

`src/lib/recommend.ts` turns each title into a weighted feature vector built from its genres, tags, director or network, type and decade. Similarity between titles is cosine similarity. A candidate's score is the sum of its similarity to every title you've rated, with each term weighted by your score for that title. Titles you didn't like push similar titles down.

## Going native later

Everything runs in the frontend and the build uses relative asset paths, so you can drop `dist/` into Electron, or into Capacitor for iOS and Android, without changes. `localStorage` persists in both.
