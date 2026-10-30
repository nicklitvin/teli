import { useEffect, useMemo, useState } from 'react';
import type { MediaType } from '../types';
import { GENRES, metaLine } from '../lib/catalog';
import { CrewError, cleanCode, inviteLink, useCloudCrew, validCode } from '../lib/cloud';
import { groupPicks, loadGroup, saveGroup, toMember, type GroupPick, type GroupState, type SeenMode } from '../lib/group';
import { ratedCount, useStore } from '../lib/store';
import { useNav } from '../nav';
import { ShareIcon, UserIcon, UsersIcon, XIcon } from '../components/Icons';
import { Cards, Empty, ListTools, Screen, TitleRow } from '../components/ui';

type Filter = 'all' | MediaType;

const SEEN: { value: SeenMode; label: string }[] = [
  { value: 'none', label: 'New to everyone' },
  { value: 'some', label: 'Seen by some' },
  { value: 'either', label: 'Seen or not' },
  { value: 'rewatch', label: 'Rewatch favorites' },
];

/** One line under a pick: who has seen it (with their verdict, and whether they'd watch it again), who wants to, or the usual details. */
function pickDetail(p: GroupPick) {
  if (p.seenBy.length) return `Seen by ${p.seenBy.map((s) => `${s.name === 'You' ? 'you' : s.name} (${s.verdict}${s.again ? ', would rewatch' : ''})`).join(', ')}`;
  if (p.wanted.length) return `On ${p.wanted.map((n) => (n === 'You' ? 'your' : `${n}'s`)).join(' & ')} watchlist`;
  return metaLine(p.title);
}

/** "just now", "5m ago", "3h ago", "2d ago". */
function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!(s >= 60)) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const friendName = (name: string, i: number) => name.trim() || `Friend ${i + 1}`;

export function Together({ active, invite }: { active: boolean; invite: string | null }) {
  const { data } = useStore();
  const cloud = useCloudCrew(data, active);
  const [group, setGroup] = useState<GroupState>(loadGroup);
  const [filter, setFilter] = useState<Filter>('all');
  const [genre, setGenre] = useState<string | null>(null);
  const [seen, setSeen] = useState<SeenMode>('none');
  const [limit, setLimit] = useState(25);

  useEffect(() => saveGroup(group), [group]);

  // You, then your crew (re-fetched whenever someone's ratings change), then any backup files added before crews synced.
  const members = useMemo(() => [
    ...(group.includeMe ? [toMember('You', data)] : []),
    ...cloud.members.map((m, i) => toMember(friendName(m.name, i), m.data)),
    ...group.people.map((p, i) => toMember(friendName(p.name, cloud.members.length + i), p.data)),
  ], [group, data, cloud.members]);
  const picks = useMemo(() => (members.length ? groupPicks(members, seen) : []), [members, seen]);
  const ofType = useMemo(() => picks.filter((p) => filter === 'all' || p.title.type === filter), [picks, filter]);
  const shown = ofType.filter((p) => !genre || p.title.genres.includes(genre));
  // Only offer genres that actually show up in the group's picks, most common first.
  const genreOptions = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of ofType.slice(0, 150)) for (const g of p.title.genres) n.set(g, (n.get(g) ?? 0) + 1);
    return GENRES.filter((g) => n.has(g) || g === genre).sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0));
  }, [ofType, genre]);

  const rename = (id: string, name: string) =>
    setGroup((g) => ({ ...g, people: g.people.map((p) => (p.id === id ? { ...p, name } : p)) }));
  const remove = (id: string) => setGroup((g) => ({ ...g, people: g.people.filter((p) => p.id !== id) }));
  const enough = members.length >= 2;

  return (
    // With nothing but the explainer on the page, it sits in the middle of the screen.
    <Screen title="Crew" active={active} className={!cloud.code && !enough && !group.people.length ? 'crew-alone' : ''}>
      {/* In a crew: its code up top. Not in one: join or start sits under the explainer below. */}
      {(cloud.code || enough) && <CrewBox cloud={cloud} invite={invite} />}
      {/* Who's in: shown once you've started or joined a crew. */}
      {(cloud.code || group.people.length > 0) && <div className="list people">
        <div className="person">
          <span className="avatar sm"><UserIcon size={14} /></span>
          <span className="person-name">{cloud.name.trim() || 'You'}</span>
          <span className="person-sub">{ratedCount(data)} rated</span>
          <label className="switch">
            <input type="checkbox" checked={group.includeMe}
              onChange={(e) => setGroup((g) => ({ ...g, includeMe: e.target.checked }))} />
            <span aria-hidden="true" />
            <span className="visually-hidden">Include you</span>
          </label>
        </div>
        {cloud.members.map((m, i) => (
          <div className="person" key={m.id}>
            <span className="avatar sm" style={{ ['--c' as string]: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
              {friendName(m.name, i).charAt(0).toUpperCase()}
            </span>
            <span className="person-name">{friendName(m.name, i)}</span>
            <span className="person-sub">{ratedCount(m.data)} rated · {ago(m.updatedAt)}</span>
          </div>
        ))}
        {group.people.map((p, j) => {
          const i = cloud.members.length + j;
          return (
            <div className="person" key={p.id}>
              <span className="avatar sm" style={{ ['--c' as string]: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                {friendName(p.name, i).charAt(0).toUpperCase()}
              </span>
              <input className="person-input" value={p.name} placeholder={`Friend ${i + 1}`} maxLength={40}
                onChange={(e) => rename(p.id, e.target.value)} aria-label="Name" />
              <span className="person-sub">{ratedCount(p.data)} rated</span>
              <button className="icon-btn ghost" onClick={() => remove(p.id)} aria-label={`Remove ${friendName(p.name, i)}`}>
                <XIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>}

      {enough ? (
        <>
          <ListTools<Filter> tab={filter} onTab={(f) => { setFilter(f); setLimit(25); }}
            tabs={[{ value: 'all', label: 'All' }, { value: 'movie', label: 'Movies' }, { value: 'tv', label: 'Shows' }]}
            genre={genre} genres={genreOptions} onGenre={(g) => { setGenre(g); setLimit(25); }}
            option={{ label: 'Seen', value: seen, initial: 'none', choices: SEEN, onChange: (v) => { setSeen(v as SeenMode); setLimit(25); } }} />
          {shown.length ? (
            <>
              <Cards>
                {shown.slice(0, limit).map((p) => (
                  <TitleRow key={p.title.id} t={p.title} detail={pickDetail(p)} />
                ))}
              </Cards>
              {shown.length > limit && (
                <button className="secondary-btn more" onClick={() => setLimit((n) => n + 25)}>Show more</button>
              )}
            </>
          ) : (
            <Empty icon={<UsersIcon size={30} />} title="Nothing matches" body="Try another genre or Seen setting." />
          )}
        </>
      ) : cloud.code ? (
        <Empty icon={<UsersIcon size={30} />} title="Waiting for your crew"
          body={`Share code ${cloud.code}. Picks for all of you show up as soon as someone joins.`} />
      ) : (
        <Empty icon={<UsersIcon size={30} />} title="Watch together"
          body="Start a crew and share the code. Everyone’s ratings stay in sync, and picks update as they rate."
          action={<CrewBox cloud={cloud} invite={invite} />} />
      )}
    </Screen>
  );
}

/** Before you're in a crew: join with a code or start one, under the explainer. Once you're in one: its code, an invite button and whether it's in sync. */
function CrewBox({ cloud, invite }: { cloud: ReturnType<typeof useCloudCrew>; invite: string | null }) {
  const nav = useNav();
  const [code, setCode] = useState(invite ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      if (e instanceof CrewError) setError(e.message);
      else {
        console.error(e);
        setError('Couldn’t reach the crew server. Try again in a moment.');
      }
    } finally {
      setBusy(false);
      setLeaving(false);
    }
  };

  const share = async () => {
    const url = inviteLink(cloud.code!);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my Teli crew', text: `Join my Teli crew with code ${cloud.code}`, url });
      } catch {
        /* closed the share sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      nav.notify('Invite link copied');
    } catch {
      nav.notify(`Your crew code is ${cloud.code}`);
    }
  };

  if (cloud.code) {
    const sync = cloud.status === 'offline' ? 'Can’t reach the server · showing the last update'
      : cloud.checkedAt ? 'Up to date' : 'Syncing…';
    return (
      <div className="crew-box">
        <div className="crew-row">
          <div className="crew-id">
            <span className="crew-label">Crew code</span>
            <span className="crew-code">{cloud.code}</span>
          </div>
          <button className="secondary-btn small" onClick={share}><ShareIcon size={14} /> Invite</button>
          <button className={`secondary-btn small ${leaving ? 'danger' : ''}`} disabled={busy}
            onClick={() => (leaving ? run(cloud.leave) : setLeaving(true))}>
            {leaving ? 'Leave?' : 'Leave'}
          </button>
        </div>
        <p className={`crew-sync ${cloud.status}`}>{sync}</p>
        {!cloud.name.trim() && <p className="crew-hint">Add your name in Profile → ⚙ so your crew knows it’s you.</p>}
        {error && <p className="note error" role="status">{error}</p>}
      </div>
    );
  }

  const clean = cleanCode(code);
  return (
    <div className="crew-box crew-start">
      {error && <p className="note error" role="status">{error}</p>}
      <form className="crew-row" onSubmit={(e) => { e.preventDefault(); if (validCode(clean)) void run(() => cloud.join(clean)); }}>
        <input className="crew-input" value={clean} onChange={(e) => setCode(e.target.value)} placeholder="Have a code?"
          aria-label="Crew code" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="go" />
        <button className="secondary-btn" type="submit" disabled={busy || !validCode(clean)}>Join</button>
      </form>
      <button className="primary-btn" disabled={busy} onClick={() => run(cloud.start)}>Start a crew</button>
    </div>
  );
}

const AVATAR_COLORS = ['#F24822', '#0ACF83', '#FFA629', '#1ABCFE', '#FF7262', '#5551FF', '#FF4FB8'];
