# Teli

A Beli-style logbook for movies and TV. Rating something you've watched takes one page:

1. Say whether it was **good**, **ok** or **bad**.
2. Optionally tap any one-word tags for what stood out (silly, sad, cozy, tense, creepy…).
3. Tick **would watch again** if you would, then **Finish**.

Ratings from the old ranking system (liked / fine / didn't like, ranked by comparison) carry over as good / ok / bad, marked as needing a review. On the first visit after the change, Teli explains the new system and offers to walk through them one by one (each can be skipped); a banner in the logbook picks the review back up later. Old backup files import the same way.

## Features

- **For You**: a full-screen feed of recommendations, one per screen, edge to edge. Each card shows the poster, a "because you liked X" reason, and buttons to rate it, save it or hide it. The **Discover** tag in the top corner switches the feed to well-known titles from genres and themes you haven't rated anything in yet, rotating between them so it isn't one genre in a row. Both feeds are dealt fresh on every visit, every switch and every pull to refresh. Each card is drawn at random with better matches likelier, titles you've scrolled past lately are pushed back, and repeats of the same director or genre are spread out. Pull down past the first card to deal a fresh feed.
- **Search**: finds titles by name, director or network, genre, tag, year or acronym (`lotr`, `gotg`). The search box sits at the top, like the logbook's tools, with a filter button beside it for type (movies or shows) and genres. Pick several genres to see titles in any of them; the panel stays open while you pick, and **Clear all** resets it. You can also browse by genre. Each result has separate **Save** (watchlist) and **Rate** buttons.
- **Galaxy** (taste map): switch between **genres, themes, decades and creators** (directors and networks). Everything you've explored is a planet in orbit, sized by how much you've rated, surfaced with the poster of a favourite and marked with a bar showing your good / ok / bad split; the selected one gets a ring. The filter button narrows the map to part of your list: good, ok or bad, ones you'd watch again, or any of your tags. Groups you haven't touched are dim planets in the "uncharted" drawer next to the count. A **Look** switcher under the map (for trying out designs, and remembered on this device) redraws it as **Planets**, a **Solar system** (you're the sun, your most rated groups orbit closest), **Constellations** (each title you rated is a star, brighter for good ones, twinkling if you'd watch it again) or a **Nebula** (blended clouds with your top posters). Tap any of them for your top titles and picks to explore further, or titles to start with.
- **Crew**: start or join a crew with a 6-character code (or an invite link), right under the "Watch together" explainer (the code moves to the top once you're in), and everyone's ratings sync through Supabase. You get a list of picks that nobody in the group has rated, filtered by type, genre, and whether anyone has seen it (the filter button). "New to everyone" is the default; "Seen by some" brings in titles part of the group has rated, using their verdicts, so you can rewatch a favourite with someone who hasn't seen it; "Rewatch favorites" lists titles at least one of you would watch again, even if everyone has seen them.
- **Profile**: your logbook (titled with your name once you set one), with Movies and Shows tabs listing good, then ok, then bad (ones you'd watch again first), and a bookmark button beside the filters that switches either tab to the movies or shows you saved, newest first. The filter button narrows it by verdict, would watch again, your tags (any of them) and genre, and sorts it best first or by when you rated (newest or oldest); a search button finds a title. The chart button beside the bookmark shows stats for the tab: how many you've rated, how many in the last 30 days and would rewatch, your good / ok / bad split, and your top genres and tags. The gear holds your name (what your crew sees), export, import and reset, plus a "Not interested" page listing hidden titles on their own.
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

Then run `npm run images` to find images for any new titles. It looks up each title's Wikipedia article, checks the article's short description to confirm it's the right film or series and year, and stores the article's lead image URL (usually the poster or title card) in `src/data/images.json`. Titles from Wikidata already know their article, so they skip the guessing. This step needs network access, but the app itself makes no API calls. Use `npm run images -- --all` to look up every title again.

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
