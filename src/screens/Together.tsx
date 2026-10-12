import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { MediaType } from '../types';
import { GENRES, metaLine } from '../lib/catalog';
import { groupPicks, loadGroup, nameFromFile, saveGroup, toMember, type GroupState } from '../lib/group';
import { parseBackup, rankedCount, useStore } from '../lib/store';
import { UploadIcon, UserIcon, UsersIcon, XIcon } from '../components/Icons';
import { Cards, Empty, ListTools, Screen, TitleRow } from '../components/ui';

type Filter = 'all' | MediaType;

export function Together({ active }: { active: boolean }) {
  const { data } = useStore();
  const [group, setGroup] = useState<GroupState>(loadGroup);
  const [filter, setFilter] = useState<Filter>('all');
  const [genre, setGenre] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [limit, setLimit] = useState(25);

  useEffect(() => saveGroup(group), [group]);

  const members = useMemo(() => [
    ...(group.includeMe ? [toMember('You', data)] : []),
    ...group.people.map((p, i) => toMember(p.name.trim() || `Friend ${i + 1}`, p.data)),
  ], [group, data]);
  const picks = useMemo(() => (members.length ? groupPicks(members) : []), [members]);
  const ofType = useMemo(() => picks.filter((p) => filter === 'all' || p.title.type === filter), [picks, filter]);
  const shown = ofType.filter((p) => !genre || p.title.genres.includes(genre));
  // Only offer genres that actually show up in the group's picks, most common first.
  const genreOptions = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of ofType.slice(0, 150)) for (const g of p.title.genres) n.set(g, (n.get(g) ?? 0) + 1);
    return GENRES.filter((g) => n.has(g) || g === genre).sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0));
  }, [ofType, genre]);

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
  const enough = members.length >= 2;

  return (
    <Screen title="Crew" active={active}>
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
          <span>Add a friend's backup</span>
          <input type="file" multiple className="visually-hidden" onChange={addFiles} />
        </label>
      </div>
      {errors.length > 0 && (
        <p className="note error" role="status">Skipped {errors.join(', ')}: not a Teli backup.</p>
      )}

      {enough ? (
        <>
          <ListTools<Filter> tab={filter} onTab={(f) => { setFilter(f); setLimit(25); }}
            tabs={[{ value: 'all', label: 'All' }, { value: 'movie', label: 'Movies' }, { value: 'tv', label: 'Shows' }]}
            genre={genre} genres={genreOptions} onGenre={(g) => { setGenre(g); setLimit(25); }} />
          {shown.length ? (
            <>
              <Cards>
                {shown.slice(0, limit).map((p) => (
                  <TitleRow key={p.title.id} t={p.title} accessory={<span className="match-pill">{p.match}%</span>}
                    detail={p.wanted.length ? `On ${p.wanted.map((n) => (n === 'You' ? 'your' : `${n}'s`)).join(' & ')} watchlist` : metaLine(p.title)} />
                ))}
              </Cards>
              {shown.length > limit && (
                <button className="secondary-btn more" onClick={() => setLimit((n) => n + 25)}>Show more</button>
              )}
            </>
          ) : (
            <Empty icon={<UsersIcon size={30} />} title="Nothing matches" body="Try another genre." />
          )}
        </>
      ) : (
        <Empty icon={<UsersIcon size={30} />} title="Watch together"
          body="Add a friend's backup to see picks none of you have seen. They export it from Profile → ⚙." />
      )}
    </Screen>
  );
}

const AVATAR_COLORS = ['#F24822', '#0ACF83', '#FFA629', '#1ABCFE', '#FF7262', '#5551FF', '#FF4FB8'];
