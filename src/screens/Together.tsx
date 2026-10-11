import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { MediaType } from '../types';
import { GENRES, GENRE_COLORS } from '../lib/catalog';
import { groupPicks, loadGroup, nameFromFile, saveGroup, toMember, type GroupState } from '../lib/group';
import { parseBackup, rankedCount, useStore } from '../lib/store';
import { UploadIcon, UserIcon, UsersIcon, XIcon } from '../components/Icons';
import { Empty, Screen, SectionHeader, Segmented, TitleRow } from '../components/ui';

type Filter = 'all' | MediaType;

export function Together({ active }: { active: boolean }) {
  const { data } = useStore();
  const [group, setGroup] = useState<GroupState>(loadGroup);
  const [filter, setFilter] = useState<Filter>('all');
  const [genres, setGenres] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [limit, setLimit] = useState(25);

  useEffect(() => saveGroup(group), [group]);

  const members = useMemo(() => [
    ...(group.includeMe ? [toMember('You', data)] : []),
    ...group.people.map((p, i) => toMember(p.name.trim() || `Friend ${i + 1}`, p.data)),
  ], [group, data]);
  const picks = useMemo(() => (members.length ? groupPicks(members) : []), [members]);
  const shown = picks.filter((p) =>
    (filter === 'all' || p.title.type === filter) &&
    (!genres.size || p.title.genres.some((g) => genres.has(g))));

  const addFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    const bad: string[] = [];
    const added: GroupState['people'] = [];
    for (const f of files) {
      try {
        added.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: nameFromFile(f.name), data: parseBackup(await f.text()) });
      } catch {
        bad.push(f.name);
      }
    }
    setErrors(bad);
    if (added.length) setGroup((g) => ({ ...g, people: [...g.people, ...added] }));
  };

  const rename = (id: string, name: string) =>
    setGroup((g) => ({ ...g, people: g.people.map((p) => (p.id === id ? { ...p, name } : p)) }));
  const remove = (id: string) => setGroup((g) => ({ ...g, people: g.people.filter((p) => p.id !== id) }));
  const toggleGenre = (g: string) => setGenres((s) => {
    const n = new Set(s);
    if (n.has(g)) n.delete(g);
    else n.add(g);
    return n;
  });

  const enough = members.length >= 2;

  return (
    <Screen title="Together" active={active}>
      <p className="map-summary">
        Add other people's Teli backups to find things <b>none of you</b> have watched yet, picked to suit everyone.
      </p>

      <div className="list people">
        <div className="person">
          <span className="avatar sm"><UserIcon size={14} /></span>
          <span className="person-name">You</span>
          <span className="person-sub">{rankedCount(data)} ranked</span>
          <label className="switch">
            <input type="checkbox" checked={group.includeMe}
              onChange={(e) => setGroup((g) => ({ ...g, includeMe: e.target.checked }))} />
            <span aria-hidden="true" />
            <span className="visually-hidden">Include you</span>
          </label>
        </div>
        {group.people.map((p, i) => (
          <div className="person" key={p.id}>
            <span className="avatar sm" style={{ ['--c' as string]: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
              {(p.name.trim() || `F${i + 1}`).charAt(0).toUpperCase()}
            </span>
            <input className="person-input" value={p.name} placeholder={`Friend ${i + 1}`} maxLength={40}
              onChange={(e) => rename(p.id, e.target.value)} aria-label="Name" />
            <span className="person-sub">{rankedCount(p.data)} ranked</span>
            <button className="icon-btn ghost" onClick={() => remove(p.id)} aria-label={`Remove ${p.name || `Friend ${i + 1}`}`}>
              <XIcon size={14} />
            </button>
          </div>
        ))}
        <label className="person add">
          <UploadIcon size={17} />
          <span>Add people from backup files</span>
          <input type="file" multiple className="visually-hidden" onChange={addFiles} />
        </label>
      </div>
      <p className="hint">Each person exports a backup from their profile (top-right avatar) and sends you the file. You can pick several at once.</p>
      {errors.length > 0 && (
        <p className="note error" role="status">Skipped {errors.join(', ')}: not a Teli backup.</p>
      )}

      {enough ? (
        <>
          <div className="filter-bar stacked spaced">
            <Segmented<Filter> value={filter} onChange={setFilter}
              options={[{ value: 'all', label: 'All' }, { value: 'movie', label: 'Movies' }, { value: 'tv', label: 'Shows' }]} />
          </div>
          <div className="genre-toggles" role="group" aria-label="Genres">
            <button className={`chip toggle ${genres.size ? '' : 'on'}`} style={{ ['--c' as string]: 'var(--text)' }}
              onClick={() => setGenres(new Set())} aria-pressed={!genres.size}>Any genre</button>
            {GENRES.map((g) => (
              <button key={g} className={`chip toggle ${genres.has(g) ? 'on' : ''}`} style={{ ['--c' as string]: GENRE_COLORS[g] }}
                onClick={() => toggleGenre(g)} aria-pressed={genres.has(g)}>{g}</button>
            ))}
          </div>

          <SectionHeader title={`Picks for ${members.length} people`}
            subtitle={`${shown.length} titles none of you have ranked`} />
          {shown.length ? (
            <>
              <div className="list">
                {shown.slice(0, limit).map((p) => (
                  <TitleRow key={p.title.id} t={p.title}
                    accessory={<span className="match-pill">{p.match}%</span>}
                    detail={p.wanted.length
                      ? `Watchlisted by ${p.wanted.map((n) => (n === 'You' ? 'you' : n)).join(', ')}`
                      : p.per.map((x) => `${x.name} ${x.match ?? '–'}`).join(' · ')} />
                ))}
              </div>
              {shown.length > limit && (
                <button className="secondary-btn more" onClick={() => setLimit((n) => n + 25)}>Show more</button>
              )}
            </>
          ) : (
            <Empty icon={<UsersIcon size={30} />} title="Nothing matches"
              body="Try turning on more genres, or switch between movies and shows." />
          )}
        </>
      ) : (
        <Empty icon={<UsersIcon size={30} />} title="Add someone to watch with"
          body={group.includeMe ? 'Load at least one other backup to see group picks.' : 'Load at least two backups, or include yourself.'} />
      )}
    </Screen>
  );
}

const AVATAR_COLORS = ['#F24822', '#0ACF83', '#FFA629', '#1ABCFE', '#FF7262', '#5551FF', '#FF4FB8'];
