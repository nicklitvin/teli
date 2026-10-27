import { useState, type ReactNode } from 'react';
import type { Verdict } from '../types';
import { BY_ID, metaLine } from '../lib/catalog';
import { TAGS, VERDICTS, VERDICT_LABEL } from '../lib/rating';
import { pendingIds, useStore } from '../lib/store';
import { useNav } from '../nav';
import { CheckIcon, MehIcon, RefreshIcon, StarIcon, ThumbIcon, XIcon } from './Icons';
import { Poster } from './Poster';

const VERDICT_ICON: Record<Verdict, ReactNode> = {
  good: <ThumbIcon size={24} />,
  mid: <MehIcon size={24} />,
  bad: <ThumbIcon size={24} down />,
};

/**
 * Rating on one page: good, mid or bad, optional tags for what stood out, and whether you'd watch
 * it again, then Finish. Given several `ids` it walks through them in turn (reviewing titles carried
 * over from the old rankings), and `intro` first explains why.
 */
export function RateFlow({ ids, intro = false, onClose }: { ids: string[]; intro?: boolean; onClose: () => void }) {
  const { data } = useStore();
  const nav = useNav();
  const [started, setStarted] = useState(!intro);
  const [i, setI] = useState(0);
  const queue = intro || ids.length > 1;

  const next = (justRated?: string) => {
    if (i + 1 < ids.length) return setI(i + 1);
    onClose();
    const left = pendingIds(data).filter((x) => x !== justRated).length;
    nav.notify(left ? `${left} left to review · pick up any time in your logbook` : 'All caught up');
  };

  if (!started) {
    return (
      <div className="rate">
        <div className="sheet-toolbar">
          <span />
          <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <div className="rate-step rate-intro fade-in">
          <span className="intro-icon"><StarIcon size={30} /></span>
          <h2 className="rate-title">Rating got simpler</h2>
          <p>No more ranking titles against each other. Now you say whether it was good, mid or bad, add a few tags if you like, and tick whether you’d watch it again.</p>
          <p>Take a quick pass over your {ids.length === 1 ? 'title' : `${ids.length} titles`} to bring {ids.length === 1 ? 'it' : 'them'} over. Until then they keep the verdict they had.</p>
        </div>
        <div className="rate-foot">
          <button className="secondary-btn" onClick={onClose}>Later</button>
          <button className="primary-btn" onClick={() => setStarted(true)}>Start review</button>
        </div>
      </div>
    );
  }

  const id = ids[i];
  if (!BY_ID.has(id)) return null;
  return (
    <RatePage key={id} id={id} onClose={onClose}
      progress={queue ? { at: i + 1, of: ids.length } : undefined}
      onSkip={queue ? () => next() : undefined}
      onDone={(title, verdict) => {
        if (queue) return next(id);
        onClose();
        nav.notify(`Logged ${title} as ${VERDICT_LABEL[verdict].toLowerCase()}`);
      }} />
  );
}

function RatePage({ id, progress, onDone, onSkip, onClose }: {
  id: string;
  progress?: { at: number; of: number };
  onDone: (title: string, verdict: Verdict) => void;
  onSkip?: () => void;
  onClose: () => void;
}) {
  const t = BY_ID.get(id)!;
  const { data, rate } = useStore();
  const prev = data.reviews[id];
  const [verdict, setVerdict] = useState<Verdict | null>(prev?.verdict ?? null);
  const [tags, setTags] = useState<string[]>(prev?.tags ?? []);
  const [again, setAgain] = useState(prev?.again ?? false);
  const last = !progress || progress.at === progress.of;

  const toggleTag = (tag: string) => setTags((ts) => (ts.includes(tag) ? ts.filter((x) => x !== tag) : [...ts, tag]));
  const finish = () => {
    if (!verdict) return;
    rate(id, { verdict, tags: TAGS.map((x) => x.id).filter((x) => tags.includes(x)), again });
    onDone(t.title, verdict);
  };

  return (
    <div className="rate">
      <div className="sheet-toolbar">
        {progress ? <span className="rate-progress">Review {progress.at} of {progress.of}</span> : <span />}
        <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
      </div>

      <div className="rate-body fade-in">
        <div className="rate-head">
          <Poster t={t} size="md" className="rate-poster" />
          <div>
            <h2 className="rate-title">{t.title}</h2>
            <p className="rate-sub">{metaLine(t)}</p>
            {prev?.pending && <p className="rate-note">Carried over as {VERDICT_LABEL[prev.verdict].toLowerCase()} from your old rankings. Check it still fits.</p>}
          </div>
        </div>

        <h3 className="rate-q">How was it?</h3>
        <div className="react-row" role="radiogroup" aria-label="Verdict">
          {VERDICTS.map((v) => (
            <button key={v} className={`react react-${v} ${verdict === v ? 'on' : ''}`} onClick={() => setVerdict(v)}
              role="radio" aria-checked={verdict === v}>
              <span className="react-circle">{VERDICT_ICON[v]}</span>
              <span className="react-label">{VERDICT_LABEL[v]}</span>
            </button>
          ))}
        </div>

        <h3 className="rate-q">What stood out? <span>Optional</span></h3>
        <div className="genre-wrap rate-tags" role="group" aria-label="Tags">
          {TAGS.map((x) => (
            <button key={x.id} className={`chip toggle tag ${tags.includes(x.id) ? 'on' : ''}`} onClick={() => toggleTag(x.id)}
              aria-pressed={tags.includes(x.id)}>{x.label}</button>
          ))}
        </div>

        <label className={`again-row ${again ? 'on' : ''}`}>
          <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
          <span className="again-box" aria-hidden="true"><CheckIcon size={16} strokeWidth={3} /></span>
          <span className="again-text"><strong>Would watch again</strong><small>Rewatches show up as picks in your crew</small></span>
          <RefreshIcon size={18} className="again-icon" />
        </label>
      </div>

      <div className="rate-foot">
        {onSkip && <button className="secondary-btn" onClick={onSkip}>Skip</button>}
        <button className="primary-btn" disabled={!verdict} onClick={finish}>{last ? 'Finish' : 'Next'}</button>
      </div>
    </div>
  );
}
