import { useState } from 'react';
import type { MediaType } from '../types';
import { GENRES, GENRE_COLORS, MAX_YEAR, findShipped } from '../lib/catalog';
import { useStore } from '../lib/store';
import { XIcon } from './Icons';
import { Segmented } from './ui';

const TYPES: { value: MediaType; label: string }[] = [
  { value: 'movie', label: 'Movie' },
  { value: 'tv', label: 'Show' },
];

/**
 * Adds a movie or show the catalog doesn't have: name, type, year, up to three genres and an
 * optional director or network. If the catalog turns out to have it, offers that one instead.
 */
export function AddTitle({ initial, type: initialType, onDone, onClose }: {
  initial: string;
  type?: MediaType;
  onDone: (id: string, added: boolean) => void;
  onClose: () => void;
}) {
  const { addTitle } = useStore();
  const [title, setTitle] = useState(initial.trim());
  const [type, setType] = useState<MediaType>(initialType ?? 'movie');
  const [year, setYear] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [creator, setCreator] = useState('');

  const y = Number(year);
  const yearOk = /^\d{4}$/.test(year) && y >= 1870 && y <= MAX_YEAR;
  const existing = title.trim() && yearOk ? findShipped(type, title, y) : undefined;
  const ready = !!title.trim() && yearOk && genres.length > 0;
  const toggle = (g: string) =>
    setGenres((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : gs.length < 3 ? [...gs, g] : gs));

  const submit = () => {
    if (existing) return onDone(existing.id, false);
    if (!ready) return;
    onDone(addTitle({ title: title.trim(), type, year: y, genres, creator: creator.trim() }), true);
  };

  return (
    <form className="rate add-title" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="sheet-toolbar">
        <h2 className="add-head">Add a title</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
      </div>
      <div className="rate-body add-body">
        <p className="add-note">Not in Teli yet? Add it here. It's saved on this device, and if a Teli update adds it later, your rating moves over on its own.</p>
        <Segmented<MediaType> value={type} options={TYPES} onChange={setType} />
        <label className="add-field">
          <span>Name</span>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
            placeholder={type === 'movie' ? 'Movie title' : 'Show title'} autoCapitalize="words" enterKeyHint="next" />
        </label>
        <div className="add-pair">
          <label className="add-field">
            <span>Year</span>
            <input className="field" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric" placeholder={String(MAX_YEAR - 1)} aria-invalid={year.length === 4 && !yearOk} />
          </label>
          <label className="add-field">
            <span>{type === 'movie' ? 'Director' : 'Network'} <small>optional</small></span>
            <input className="field" value={creator} onChange={(e) => setCreator(e.target.value)} maxLength={80}
              placeholder={type === 'movie' ? 'Who directed it' : 'Where it airs'} autoCapitalize="words" />
          </label>
        </div>
        <div className="add-field" role="group" aria-label="Genres">
          <span>Genres <small>{genres.length ? `${genres.length} of 3` : 'pick up to 3'}</small></span>
          <div className="genre-wrap">
            {GENRES.map((g) => (
              <button type="button" key={g} className={`chip toggle ${genres.includes(g) ? 'on' : ''}`} style={{ ['--c' as string]: GENRE_COLORS[g] }}
                onClick={() => toggle(g)} aria-pressed={genres.includes(g)} disabled={!genres.includes(g) && genres.length >= 3}>{g}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="rate-foot">
        {existing ? (
          <button type="submit" className="primary-btn">Teli has {existing.title} ({existing.year}): open it</button>
        ) : (
          <button type="submit" className="primary-btn" disabled={!ready}>Add {type === 'movie' ? 'movie' : 'show'}</button>
        )}
      </div>
    </form>
  );
}
