# Teli

A Beli-style logbook for movies and TV. Rating something you've watched takes one page:

1. Say whether it was **good**, **ok** or **bad**.
2. Optionally tap any one-word tags for what stood out (silly, sad, cozy, tense, creepy…).
3. Tick **would watch again** if you would, then **Finish**.

Ratings from the old ranking system (liked / fine / didn't like, ranked by comparison) carry over as good / ok / bad, marked as needing a review. On the first visit after the change, Teli explains the new system and offers to walk through them one by one (each can be skipped); a banner in the logbook picks the review back up later. Old backup files import the same way.

## Features

- **For You**: a full-screen feed of recommendations, one per screen, edge to edge. Each card shows the poster, a "because you liked X" reason, and buttons to rate it, save it or hide it. The **Discover** tag in the top corner switches the feed to well-known titles from genres and themes you haven't rated anything in yet, rotating between them so it isn't one genre in a row. Both feeds are dealt fresh on every visit, every switch and every pull to refresh. Each card is drawn at random with better matches likelier, titles you've scrolled past lately are pushed back, and repeats of the same director or genre are spread out. Pull down past the first card to deal a fresh feed.
- **Search**: finds titles by name, director or network, genre, tag, year or acronym (`lotr`, `gotg`). The search box sits at the top, like the logbook's tools, with a filter button beside it for type (movies or shows) and genres. Pick several genres to see titles in any of them; the panel stays open while you pick, and **Clear all** resets it. You can also browse by genre. Each result has separate **Save** (watchlist) and **Rate** buttons. If something isn't in the library, **Add "…"** (under the results, or on the no-results screen) lets you add it with a name, type, year, up to three genres and an optional director or network; if Teli already has that title, it offers that one instead.
- **Galaxy**: the whole library on one map, in the spirit of [Mikey Guinness's movie map](https://mikeyguinness.com/projects/movie-map/). Every title is a dot, placed so similar ones sit together and coloured by its neighbourhood (named after what its titles share, like "Crime · Heist"). Your rated titles are bright stars (green, amber or pink for good, ok, bad) joined into constellations with nearby ones, and your watchlist shows as rings. Drag to pan, pinch or scroll to zoom: neighbourhood names show from far out, titles as you zoom in. Tap a dot for a card with the poster, its neighbourhood, and Save / Rate (or your verdict). **Uncharted** flies you to a neighbourhood you've barely rated that holds a lot of your recommendations (a different one each tap) with picks to try. The filter button can highlight a genre, theme, decade or creator (everything else fades, and the view flies there), and can narrow which of your ratings show: good, ok or bad, would watch again, or your tags. The circular-arrow button zooms back out.
- **Crew**: start or join a crew with a 6-character code (or an invite link), right under the "Watch together" explainer (the code moves to the top once you're in), and everyone's ratings sync through Supabase. You get a list of picks that nobody in the group has rated, filtered by type, genre, and whether anyone has seen it (the filter button). "New to everyone" is the default; "Seen by some" brings in titles part of the group has rated, using their verdicts, so you can rewatch a favourite with someone who hasn't seen it; "Rewatch favorites" lists titles at least one of you would watch again, even if everyone has seen them.
- **Profile**: your logbook (titled with your name once you set one), with Movies and Shows tabs listing good, then ok, then bad (ones you'd watch again first), and a bookmark button beside the filters that switches either tab to the movies or shows you saved, newest first. The filter button narrows it by verdict, would watch again, your tags (any of them) and genre, and sorts it by when you rated (newest or oldest; with neither picked it's best first, and with no genre picked it's every genre); a search button finds a title. The chart button beside the bookmark swaps the list for charts of the tab: how many you've rated, in the last 30 days and the share you'd rewatch, a ring of your good / ok / bad split, a bar per day for the last 30 days, your top genres and tags as bars, and your watchlist: how much you've saved, how much of it you've watched since (rating something from your watchlist counts), what's still waiting, the average days from saving to watching, and the last 30 days of both. Tapping the bookmark while the charts are open closes them and shows your watchlist. The gear holds your name (what your crew sees), export, import and reset, plus a "Not interested" page listing hidden titles on their own.
- Space-exploration look: a starfield with nebula glows, glass panels, a violet-to-teal accent, Space Grotesk headings over Inter text. Every list of titles is a big image card with the name and your verdict over the bottom. Respects safe areas and reduced motion.
- The catalog and recommendations run entirely in the browser, and your data is kept in `localStorage`. The only server is the optional Supabase project for crews. Poster images load from Wikimedia; when they can't load (for example offline), you see generated art instead.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static build in dist/ (relative paths, so it works from file://)
```

## Catalog

The library has about 17,500 titles (9,000 movies, 8,400 shows) from two sources:

- [`data/catalog.txt`](data/catalog.txt): about 930 hand-written titles, one per line.
- `data/wikidata.json`: films and series pulled from Wikidata by `npm run wikidata`. A title is included when it has an English Wikipedia article and articles in many other languages (20+ for films, 10+ for series), which works well as a popularity filter. Plenty of popular shows (reality, British panel shows, new streaming series) are only written up in a few languages, so a series with 3–9 still gets in when its English article averages 120+ views a day over the last 60 days. Series include TV and web series, miniseries, animated and anime series, and TV programs (most reality and game shows); an anime with no English article of its own comes in under its manga's or light novel's article. `npm run wikidata -- --only tv` refreshes just the shows. Titles already in the file keep their ids and are never dropped, so saved ratings stay attached. Wikidata's fine-grained genres ("heist film", "space opera") are mapped onto Teli's 21 genres and kept as themes, along with the title's main subjects and franchise.

Lines in `catalog.txt` look like this:

```
Title|Year|M or T|Genre,Genre|tag,tag|Director or Network
```

Run `npm run catalog` to merge both into `src/data/catalog.json` (about 2.8 MB). It validates genres, rejects duplicates, and skips Wikidata titles that are already in `catalog.txt`. Wikidata titles that share a Wikipedia image with an earlier title (Se7en / Seven) are merged into it, and `src/data/aliases.json` maps the dropped ids so saved ratings follow. Different titles that would get the same id (Big Brother, American and British, both 2000) are told apart by their article name (`t-big-brother-2000-british`); the one already in the catalog keeps the plain id.

Titles added by hand are saved with your data (`custom` in localStorage, backups and crew sync, so crewmates see them too) under a `u-` id, and join the catalog when the app loads. When a catalog update ships the same title (same type and name, year within one year for movies or two for shows), the hand-added copy is dropped and its rating, watchlist spot and "not interested" mark move to the real entry automatically.

Then run `npm run images` to find images for any new titles. It looks up each title's Wikipedia article, checks the article's short description to confirm it's the right film or series and year, and stores the article's lead image URL (usually the poster or title card) in `src/data/images.json`. Titles from Wikidata already know their article, so they skip the guessing. This step needs network access, but the app itself makes no API calls. Use `npm run images -- --all` to look up every title again.

Finally run `npm run map` to lay the catalog out for the Galaxy tab (about 30 seconds). It turns each title into a vector of its genres, themes, director or network, decade and type, flattens those to 2D with UMAP (via `umap-js`), turns the map so its long side runs top to bottom, nudges apart titles that land on top of each other, and splits it into neighbourhoods with k-means, each named after its most distinctive genre and theme. `src/data/map.json` (about 0.1 MB per 17,000 titles) lines up with the catalog by position, so rebuild it after every `npm run catalog`; if the counts disagree the Galaxy asks for a rebuild instead of showing a wrong map.

## Watching together

With Supabase configured, one person taps **Start a crew** and shares the code or invite link; everyone else joins with it. Each device signs in anonymously and uploads its backup to its own row about 1.5 seconds after any change. While the Crew tab is open (and the page is visible), it checks every 15 seconds for changes. That check only asks for who's in the crew and when each row last changed, so it stays small. The full backups are downloaded only when something changed, and then the picks are recalculated. The last copy is cached, so the tab fills in instantly offline or after a reload. Row-level security lets members read only crews they're in and write only their own row.

Titles that anyone has marked "Not interested" are left out, and so are ones anyone has rated, unless you choose otherwise in the filter. Each remaining title is scored with the normal recommender for each person who hasn't seen it; for someone who has, their verdict counts, and whether they'd watch it again counts as much as whether it was good. A title's group score is half the average of those scores and half the lowest one, so a pick that only one person loves won't win. Titles on someone's watchlist get a boost.

### Setting up Supabase

1. Create a project, open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
2. Under Authentication → Sign In / Providers, turn on **Allow anonymous sign-ins**. Consider turning on CAPTCHA too, since anyone can create an anonymous account.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon or publishable key) in `.env.local` for local dev and in Vercel's environment variables, then redeploy. See `.env.example`.

Until those variables are set, the Crew tab still shows everything, but starting or joining a crew says crews aren't connected yet.

## How recommendations work

`src/lib/recommend.ts` turns each title into a weighted feature vector built from its genres, tags, director or network, type and decade. Similarity between titles is cosine similarity. A candidate's score is the sum of its similarity to every title you've rated, with each term weighted by your verdict: good pulls similar titles up (more if you'd watch it again), ok barely moves them, and bad pushes them down.

## Going native later

Everything runs in the frontend and the build uses relative asset paths, so you can drop `dist/` into Electron, or into Capacitor for iOS and Android, without changes. `localStorage` persists in both.
