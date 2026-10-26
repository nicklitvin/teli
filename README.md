# Teli

Beli-style ranking for movies and TV. You don't type in a rating; you rank by comparison:

1. Pick something you've watched.
2. Say whether you **liked it**, thought it was **fine**, or **didn't like it**.
3. Answer "which do you prefer?" a few times. Teli binary-searches your existing list, so it takes about log₂(n) taps.

The score comes from where the title lands. Each reaction has its own band (liked 6.8–10, fine 3.4–6.7, didn't like 0–3.3), and your ranking inside that band sets the exact number. Movies and shows are ranked separately.

## Features

- **For You**: a full-screen feed of recommendations, one per screen, edge to edge. Each card shows the poster, a match %, a "because you liked X" reason, and buttons to rate it, save it or hide it. The **Discover** tag in the top corner switches the feed to well-known titles from genres and themes you haven't ranked anything in yet, rotating between them so it isn't one genre in a row. Both feeds are reshuffled on every visit and every switch: strong matches still lead, with some randomness and fewer repeats of the same director or genre.
- **Search**: finds titles by name, director or network, genre, tag, year or acronym (`lotr`, `gotg`). The search box sits at the bottom, above the tabs, with a filter button beside it for type (movies or shows) and genre. You can also browse by genre. Each result has separate **Save** (watchlist) and **Rate** buttons.
- **Galaxy** (taste map): switch between **genres, themes, decades and creators** (directors and networks). Everything you've explored is a planet in orbit, sized by how much you've ranked, surfaced with the poster of a favourite and labelled with your average score; the selected one gets a ring. Groups you haven't touched are dim planets in the "uncharted" drawer next to the count. Tap any of them for your top titles and picks to explore further, or titles to start with.
- **Crew**: start or join a crew with a 6-character code (or an invite link) and everyone's ratings sync through Supabase. You get picks that nobody in the group has ranked, filtered by type, genre, and whether anyone has seen it (the filter button). "New to everyone" is the default; "Seen by some" brings in titles part of the group has ranked, using their real scores, so you can rewatch a favourite with someone who hasn't seen it.
- **Profile**: your logbook, with Movies and Shows tabs, each ranked by your score, and a bookmark button beside the filters that switches either tab to the movies or shows you saved, newest first. A filter button narrows it to a genre and a search button finds a title, while the numbers stay your overall rank. The gear holds export, import and reset, plus a "Not interested" page listing hidden titles on their own.
- Space-exploration look: a starfield with nebula glows, glass panels, a violet-to-teal accent, Space Grotesk headings over Inter text. Every list of titles is a big image card with the name and your score over the bottom. Respects safe areas and reduced motion.
- The catalog and recommendations run entirely in the browser, and your data is kept in `localStorage`. The only server is the optional Supabase project for crews. Poster images load from Wikimedia; when they can't load (for example offline), you see generated art instead.

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

With Supabase configured, one person taps **Start a crew** and shares the code or invite link; everyone else joins with it. Each device signs in anonymously and uploads its backup to its own row about 1.5 seconds after any change. While the Crew tab is open (and the page is visible), it checks every 15 seconds for changes. That check only asks for who's in the crew and when each row last changed, so it stays small. The full backups are downloaded only when something changed, and then the picks are recalculated. The last copy is cached, so the tab fills in instantly offline or after a reload. Row-level security lets members read only crews they're in and write only their own row.

Titles that anyone has ranked or marked "Not interested" are left out. Each remaining title is scored with the normal recommender for each person. A title's group score is half the average of those scores and half the lowest one, so a pick that only one person loves won't win. Titles on someone's watchlist get a boost.

### Setting up Supabase

1. Create a project, open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
2. Under Authentication → Sign In / Providers, turn on **Allow anonymous sign-ins**. Consider turning on CAPTCHA too, since anyone can create an anonymous account.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon or publishable key) in `.env.local` for local dev and in Vercel's environment variables, then redeploy. See `.env.example`.

Until those variables are set, the Crew tab still shows everything, but starting or joining a crew says crews aren't connected yet.

## How recommendations work

`src/lib/recommend.ts` turns each title into a weighted feature vector built from its genres, tags, director or network, type and decade. Similarity between titles is cosine similarity. A candidate's score is the sum of its similarity to every title you've rated, with each term weighted by your score for that title. Titles you didn't like push similar titles down.

## Going native later

Everything runs in the frontend and the build uses relative asset paths, so you can drop `dist/` into Electron, or into Capacitor for iOS and Android, without changes. `localStorage` persists in both.
