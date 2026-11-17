import type { Verdict } from '../types';
import { VERDICTS, VERDICT_LABEL, type ReviewFilter } from '../lib/rating';
import { useStore } from '../lib/store';
import { XIcon } from './Icons';

const COLOR: Record<Verdict, string> = { good: 'var(--liked)', ok: 'var(--fine)', bad: 'var(--disliked)' };

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/** Filter groups for your ratings: verdicts, would watch again, and the tags you've used (`tags`). */
export function ReviewFilterGroups({ value, onChange, tags }: { value: ReviewFilter; onChange: (f: ReviewFilter) => void; tags: string[] }) {
  const { tags: keywords, tagLabel } = useStore();
  // Tags you've used, in your keyword order, then any you've since removed from the list.
  const ids = new Set([...tags, ...value.tags]);
  const used = [...keywords.filter((k) => ids.has(k.id)), ...[...ids].filter((id) => !keywords.some((k) => k.id === id)).map((id) => ({ id, label: tagLabel(id) }))];
  return (
    <>
      <div className="filter-group" role="group" aria-label="Rating">
        <p className="filter-label">Rating{value.verdicts.length > 1 ? ' · any of these' : ''}</p>
        <div className="genre-wrap">
          {VERDICTS.map((v) => (
            <button key={v} className={`chip toggle ${value.verdicts.includes(v) ? 'on' : ''}`} style={{ ['--c' as string]: COLOR[v] }}
              onClick={() => onChange({ ...value, verdicts: toggle(value.verdicts, v) })} aria-pressed={value.verdicts.includes(v)}>
              {VERDICT_LABEL[v]}
            </button>
          ))}
          <button className={`chip toggle ${value.again ? 'on' : ''}`} style={{ ['--c' as string]: 'var(--accent-2)' }}
            onClick={() => onChange({ ...value, again: !value.again })} aria-pressed={value.again}>
            Would watch again
          </button>
        </div>
      </div>
      {used.length > 0 && (
        <div className="filter-group" role="group" aria-label="Tags">
          <p className="filter-label">Tags{value.tags.length > 1 ? ' · any of these' : ''}</p>
          <div className="genre-wrap">
            {used.map((t) => (
              <button key={t.id} className={`chip toggle any ${value.tags.includes(t.id) ? 'on' : ''}`}
                onClick={() => onChange({ ...value, tags: toggle(value.tags, t.id) })} aria-pressed={value.tags.includes(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** The active rating filters as removable chips. */
export function ReviewFilterChips({ value, onChange }: { value: ReviewFilter; onChange: (f: ReviewFilter) => void }) {
  const { tagLabel } = useStore();
  return (
    <>
      {value.verdicts.map((v) => (
        <button key={v} className="chip removable" style={{ ['--c' as string]: COLOR[v] }} aria-label={`Remove ${VERDICT_LABEL[v]} filter`}
          onClick={() => onChange({ ...value, verdicts: value.verdicts.filter((x) => x !== v) })}>
          {VERDICT_LABEL[v]} <XIcon size={12} strokeWidth={3} />
        </button>
      ))}
      {value.again && (
        <button className="chip removable" style={{ ['--c' as string]: 'var(--accent-2)' }} aria-label="Remove would watch again filter"
          onClick={() => onChange({ ...value, again: false })}>
          Would watch again <XIcon size={12} strokeWidth={3} />
        </button>
      )}
      {value.tags.map((t) => (
        <button key={t} className="chip removable" aria-label={`Remove ${tagLabel(t)} filter`}
          onClick={() => onChange({ ...value, tags: value.tags.filter((x) => x !== t) })}>
          {tagLabel(t)} <XIcon size={12} strokeWidth={3} />
        </button>
      ))}
    </>
  );
}
