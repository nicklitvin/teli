/** What changed in each release, newest first. Shown in Settings; the first entry is the current version. */
export const NOTES: { version: string; date: string; items: string[] }[] = [
  {
    version: '1.9.0',
    date: '2026-11-19',
    items: [
      'Rate something as didn\'t finish, alongside good, ok and bad',
      'Galaxy: highlighting genres, decades, themes or creators changes the map only, with no list card',
      'Galaxy: filter sections fold open and closed, and the panel says how many titles are shown',
      'Profile: a count of what you\'ve watched, like the watchlist\'s count of what\'s to watch',
      'Profile: filters and search step aside while stats are open (stats always cover everything) and come back after',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-11-18',
    items: [
      'Ratings get a short note (up to 100 characters) instead of keywords; keywords you\'d picked carry over as the note',
      'For You is more varied: liking a few of a franchise no longer fills the feed with it',
      'Mark something not interested and titles like it stay out of the next page of picks',
      'Galaxy: names hold still while you move the map and fade in once it settles',
      'Galaxy: posters beside names, an option in the filters',
      'Galaxy: titles sit in a neighbourhood of their own genre (IT is in Horror now)',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-11-17',
    items: [
      'Galaxy: one neighbourhood per genre, so no more "Comedy" next to "Comedy & Western" or "Crime" next to "Crime shows"',
      'Galaxy: show what you\'ve seen, what you haven\'t, or both',
      'Galaxy: highlight several genres, decades, themes and creators at once',
      'Galaxy: taps only pick titles and neighbourhoods whose names are showing',
      'Galaxy: bubbles are gone; every title is a dot',
      'More room in the filter panels',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-11-17',
    items: [
      'Galaxy: neighbourhoods with the same name are one place now (no more "Drama" and "Drama (1990s)"), with easier-to-read names',
      'Galaxy: hide all names, or show neighbourhoods as bubbles so only what you watched stands out',
      'Settings is its own page, with your rating keywords: rename, remove or add up to 16',
      'Reset everything asks first in a dialog',
      'Search has a back-to-top button once you scroll down',
      'Watch together is marked as under construction',
      'Version number and these notes',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-11-15',
    items: [
      'Posters load reliably: right-sized thumbnails, and a failed one tries again',
      'Real posters for about 7,700 shows, from TVmaze',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-11-10',
    items: [
      'Galaxy is a map of the whole library, with your ratings as constellations',
      'About 30,500 titles, including 22,000 films',
      'Watchlist stats: how much you save and go on to watch',
      'Recommendations are much faster',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-11-01',
    items: ['Add a title Teli doesn’t have from search; it merges into the real entry once an update ships it'],
  },
  {
    version: '1.3.0',
    date: '2026-10-28',
    items: [
      'Roughly twice as many shows: animated, anime, reality and more',
      'Logbook sort, and stats as charts',
      'Mid is now called Ok',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-26',
    items: ['Rate with good, ok or bad, plus keywords and would watch again', 'Pull to refresh For You', 'Your name on your logbook'],
  },
  {
    version: '1.1.0',
    date: '2026-10-12',
    items: ['Crews: start or join with a code, and everyone’s ratings stay in sync', 'Logbook tabs, filters and search', 'Fresh feeds on every visit'],
  },
  {
    version: '1.0.0',
    date: '2026-10-11',
    items: ['Teli: log movies and shows, get recommendations, and find something to watch together'],
  },
];

export const VERSION = NOTES[0].version;
