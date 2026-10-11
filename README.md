# Teli

Beli-style ranking for movies and TV. You don't type in a rating; you rank by comparison:

1. Pick something you've watched.
2. Say whether you **liked it**, thought it was **fine**, or **didn't like it**.
3. Answer "which do you prefer?" a few times. Teli binary-searches your existing list, so it takes about log₂(n) taps.

The score comes from where the title lands. Each reaction has its own band (liked 6.8–10, fine 3.4–6.7, didn't like 0–3.3), and your ranking inside that band sets the exact number. Movies and shows are ranked separately.

## Features

- **For You**: content-based recommendations from everything you've ranked, with a match % and a "because you liked X" reason for each pick.
- **Search**: finds titles by name, director or network, genre, tag, year or acronym (`lotr`, `gotg`). You can also browse by genre.
- **My List**: your ranked list with scores, plus a watchlist. Export, import and reset live here.
- iOS-style UI: large titles, blurred bars, bottom sheets you can drag to dismiss, segmented controls. Supports dark mode and safe areas.
- Fully offline. There are no external APIs, and your data is kept in `localStorage`.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static build in dist/ (relative paths, so it works from file://)
```

## Catalog

The library comes from [`data/catalog.txt`](data/catalog.txt), one title per line:

```
Title|Year|M or T|Genre,Genre|tag,tag|Director or Network
```

After you edit it, run `npm run catalog` to regenerate `src/data/catalog.json`. The script validates genres and rejects duplicate titles. The current catalog has about 930 titles and takes up about 155 KB.

## How recommendations work

`src/lib/recommend.ts` turns each title into a weighted feature vector built from its genres, tags, director or network, type and decade. Similarity between titles is cosine similarity. A candidate's score is the sum of its similarity to every title you've rated, with each term weighted by your score for that title. Titles you didn't like push similar titles down.

## Going native later

Everything runs in the frontend and the build uses relative asset paths, so you can drop `dist/` into Electron, or into Capacitor for iOS and Android, without changes. `localStorage` persists in both.
