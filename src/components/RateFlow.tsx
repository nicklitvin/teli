import { useEffect, useState } from 'react';
import type { Sentiment } from '../types';
import { BY_ID, metaLine } from '../lib/catalog';
import { SENTIMENT_LABEL, maxComparisons } from '../lib/ranking';
import { useStore } from '../lib/store';
import { CheckIcon, MehIcon, ThumbIcon, UndoIcon, XIcon } from './Icons';
import { Poster, ScoreBadge } from './Poster';

interface Range {
  lo: number;
  hi: number;
}

/**
 * Beli-style rating: pick a reaction, then answer "which did you prefer?" against
 * titles already in that bucket. Binary search finds the slot in ~log2(n) taps,
 * and the slot determines the score.
 */
export function RateFlow({ id, onClose }: { id: string; onClose: () => void }) {
  const t = BY_ID.get(id)!;
  const { data, ratings, place } = useStore();
  const [step, setStep] = useState<'react' | 'compare' | 'done'>('react');
  const [sentiment, setSentiment] = useState<Sentiment>('liked');
  const [bucket, setBucket] = useState<string[]>([]);
  const [range, setRange] = useState<Range>({ lo: 0, hi: 0 });
  const [history, setHistory] = useState<Range[]>([]);
  const previous = ratings.get(id);

  const mid = (range.lo + range.hi) >> 1;
  const other = BY_ID.get(bucket[mid] ?? '');

  const finish = (s: Sentiment, index: number) => {
    place(id, s, index);
    setStep('done');
  };

  const react = (s: Sentiment) => {
    const b = data.ranks[t.type][s].filter((x) => x !== id);
    setSentiment(s);
    setBucket(b);
    if (!b.length) return finish(s, 0);
    setRange({ lo: 0, hi: b.length });
    setHistory([]);
    setStep('compare');
  };

  const choose = (preferNew: boolean) => {
    const next = preferNew ? { lo: range.lo, hi: mid } : { lo: mid + 1, hi: range.hi };
    if (next.lo >= next.hi) return finish(sentiment, next.lo);
    setHistory((h) => [...h, range]);
    setRange(next);
  };

  const undo = () => {
    if (!history.length) return setStep('react');
    setRange(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  useEffect(() => {
    if (step !== 'compare') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') choose(true);
      else if (e.key === 'ArrowRight') choose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const result = ratings.get(id);
  const noun = t.type === 'movie' ? 'movies' : 'shows';

  return (
    <div className="rate">
      <div className="sheet-toolbar">
        {step === 'compare' ? (
          <button className="toolbar-btn" onClick={undo}><UndoIcon size={18} /> Back</button>
        ) : <span />}
        <button className="icon-btn" onClick={onClose} aria-label="Close"><XIcon size={18} /></button>
      </div>

      {step === 'react' && (
        <div className="rate-step fade-in">
          <Poster t={t} size="md" className="rate-poster" />
          <h2 className="rate-title">{t.title}</h2>
          <p className="rate-sub">{metaLine(t)}</p>
          <h3 className="rate-q">How was it?</h3>
          <div className="react-row">
            {(['liked', 'fine', 'disliked'] as Sentiment[]).map((s) => (
              <button key={s} className={`react react-${s} ${previous?.sentiment === s ? 'prev' : ''}`} onClick={() => react(s)}>
                <span className="react-circle">
                  {s === 'liked' ? <ThumbIcon size={30} /> : s === 'fine' ? <MehIcon size={30} /> : <ThumbIcon size={30} down />}
                </span>
                <span className="react-label">{SENTIMENT_LABEL[s]}</span>
              </button>
            ))}
          </div>
          {previous && <p className="rate-note">Currently {previous.score.toFixed(1)} · re-ranking will replace it</p>}
        </div>
      )}

      {step === 'compare' && other && (
        <div className="rate-step" key={`${range.lo}-${range.hi}`}>
          <h3 className="rate-q">Which do you prefer?</h3>
          <p className="rate-sub">
            Comparison {history.length + 1} of up to {maxComparisons(bucket.length)}
          </p>
          <div className="versus">
            <button className="vs-card fade-in" onClick={() => choose(true)}>
              <Poster t={t} size="lg" />
              <span className="vs-title">{t.title}</span>
              <span className="vs-sub">{t.year}</span>
            </button>
            <span className="vs-or">or</span>
            <button className="vs-card fade-in" onClick={() => choose(false)}>
              <Poster t={other} size="lg" rating={ratings.get(other.id)} />
              <span className="vs-title">{other.title}</span>
              <span className="vs-sub">{other.year}</span>
            </button>
          </div>
          <button className="pill-btn" onClick={() => finish(sentiment, mid + 1)}>Too tough — call it a tie</button>
        </div>
      )}

      {step === 'done' && result && (
        <div className="rate-step done fade-in">
          <div className="done-check"><CheckIcon size={22} /></div>
          <ScoreBadge rating={result} size="xl" className="pop-in" />
          <h2 className="rate-title">{t.title}</h2>
          <p className="rate-sub">#{result.rank} of {result.total} {noun} you've ranked</p>
          <button className="primary-btn wide" onClick={onClose}>Done</button>
        </div>
      )}
    </div>
  );
}
