import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitize, type Data } from './store';

/*
 * Crews in the cloud (Supabase). Each device signs in anonymously and keeps one row per crew:
 * its name and its whole backup. Your row is re-uploaded a moment after anything changes; the
 * Crew tab polls for everyone else's while it's open and recalculates when someone's row moves.
 * Schema and policies: supabase/schema.sql.
 */

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudEnabled = !!(SB_URL && SB_KEY);

const TABLE = 'crew_members';
const POLL_MS = 15_000;
const PUSH_DELAY_MS = 1_500;
const KEY = 'teli:crew:v1';
// No 0/O or 1/I, so a code read out loud or off a screen can't be mistyped.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

export interface CloudMember {
  id: string;
  name: string;
  data: Data;
  /** Server time of their last upload. */
  updatedAt: string;
}

/** A problem worth showing as-is (bad code, no such crew), as opposed to a network or server error. */
export class CrewError extends Error {}

let ready: Promise<{ sb: SupabaseClient; uid: string }> | null = null;

/** The client, loaded only when a crew is used, signed in anonymously so this device has a member id. */
function connect() {
  ready ??= (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(SB_URL!, SB_KEY!);
    const { data } = await sb.auth.getSession();
    let uid = data.session?.user.id;
    if (!uid) {
      const res = await sb.auth.signInAnonymously();
      if (res.error || !res.data.user) throw res.error ?? new Error('Sign-in failed');
      uid = res.data.user.id;
    }
    return { sb, uid };
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
export const validCode = (s: string) => s.length === CODE_LEN && [...s].every((c) => ALPHABET.includes(c));

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function crewSize(code: string): Promise<number> {
  const { sb } = await connect();
  const { data, error } = await sb.rpc('crew_size', { code });
  if (error) throw error;
  return data as number;
}

async function push(code: string, name: string, data: Data) {
  const { sb, uid } = await connect();
  const { error } = await sb.from(TABLE).upsert({ crew_code: code, member_id: uid, name: name.trim().slice(0, 40), data }, { onConflict: 'crew_code,member_id' });
  if (error) throw error;
}

async function remove(code: string) {
  const { sb, uid } = await connect();
  const { error } = await sb.from(TABLE).delete().eq('crew_code', code).eq('member_id', uid);
  if (error) throw error;
}

/** Who's in the crew and when each last changed: cheap enough to ask every few seconds. */
async function stamps(code: string): Promise<string> {
  const { sb, uid } = await connect();
  const { data, error } = await sb.from(TABLE).select('member_id, name, updated_at').eq('crew_code', code).neq('member_id', uid).order('member_id');
  if (error) throw error;
  return data.map((r) => `${r.member_id}|${r.name}|${r.updated_at}`).join(',');
}

async function everyone(code: string): Promise<CloudMember[]> {
  const { sb, uid } = await connect();
  const { data, error } = await sb.from(TABLE).select('member_id, name, data, updated_at').eq('crew_code', code).neq('member_id', uid).order('updated_at');
  if (error) throw error;
  // Other people's rows are untrusted input: run them through the same checks as an imported file.
  return data.map((r) => ({ id: r.member_id, name: String(r.name ?? '').slice(0, 40), data: sanitize(r.data), updatedAt: r.updated_at }));
}

interface Saved {
  code: string | null;
  name: string;
  members: CloudMember[];
  /** What we last uploaded, so a reload doesn't re-send an unchanged backup. */
  sent: string;
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      return {
        code: typeof raw.code === 'string' && validCode(raw.code) ? raw.code : null,
        name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : '',
        members: Array.isArray(raw.members)
          ? raw.members.filter((m: Partial<CloudMember>) => m && typeof m.id === 'string')
            .map((m: CloudMember) => ({ id: m.id, name: String(m.name ?? ''), data: sanitize(m.data), updatedAt: String(m.updatedAt ?? '') }))
          : [],
        sent: typeof raw.sent === 'string' ? raw.sent : '',
      };
    }
  } catch {
    /* storage unavailable or corrupt — not in a crew */
  }
  return { code: null, name: '', members: [], sent: '' };
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline';

/**
 * Your cloud crew: the code you're in, everyone else's latest backup, and actions to start, join
 * and leave. Uploads `data` whenever it changes; polls only while `active` and the page is visible.
 */
export function useCloudCrew(data: Data, active: boolean) {
  const [saved, setSaved] = useState<Saved>(load);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const sig = useRef<string | null>(null);
  const { code, name } = saved;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {
      /* quota / private mode — the crew just won't survive a reload */
    }
  }, [saved]);

  const refresh = useCallback(async (c: string) => {
    setStatus('syncing');
    try {
      const s = await stamps(c);
      if (s !== sig.current) {
        const members = await everyone(c);
        sig.current = s;
        setSaved((v) => (v.code === c ? { ...v, members } : v));
      }
      setStatus('ok');
      setCheckedAt(Date.now());
    } catch {
      setStatus('offline');
    }
  }, []);

  // Upload a moment after your ratings or name change, and on load if they changed while offline.
  // A failed upload tries again a little later. (`body` stands in for `name` and `data`.)
  const body = JSON.stringify({ name: name.trim(), data });
  useEffect(() => {
    if (!cloudEnabled || !code || body === saved.sent) return;
    let again: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(async () => {
      try {
        await push(code, name, data);
        setSaved((v) => ({ ...v, sent: body }));
      } catch {
        setStatus('offline');
        again = setTimeout(() => setRetry((n) => n + 1), POLL_MS);
      }
    }, PUSH_DELAY_MS);
    return () => {
      clearTimeout(t);
      clearTimeout(again);
    };
  }, [code, body, saved.sent, retry]);

  // Poll while the Crew tab is on screen.
  useEffect(() => {
    if (!cloudEnabled || !code || !active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = () => {
      clearTimeout(timer);
      if (document.visibilityState !== 'visible') return;
      void refresh(code).finally(() => {
        if (!stopped) timer = setTimeout(tick, POLL_MS);
      });
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [code, active, refresh]);

  const enter = async (c: string) => {
    await push(c, name, data);
    sig.current = null;
    setSaved((v) => ({ ...v, code: c, members: [], sent: JSON.stringify({ name: name.trim(), data }) }));
  };

  return {
    code,
    name,
    members: code ? saved.members : [],
    status,
    checkedAt,
    setName: (n: string) => setSaved((v) => ({ ...v, name: n.slice(0, 40) })),
    async start() {
      let c = newCode();
      while (await crewSize(c)) c = newCode();
      await enter(c);
    },
    /** Throws a readable message when the code doesn't match a crew. */
    async join(raw: string) {
      const c = cleanCode(raw);
      if (!validCode(c)) throw new CrewError('Crew codes are 6 letters and numbers.');
      if (!(await crewSize(c))) throw new CrewError(`No crew with code ${c}. Check it and try again.`);
      await enter(c);
    },
    async leave() {
      if (!code) return;
      await remove(code);
      sig.current = null;
      setSaved((v) => ({ ...v, code: null, members: [], sent: '' }));
      setStatus('idle');
    },
  };
}

/** A link that opens Teli on the Crew tab with this code filled in. */
export const inviteLink = (code: string) => `${location.origin}${location.pathname}?crew=${code}`;

/** The code from an invite link, if the page was opened with one. Removes it from the address bar. */
export function takeInvite(): string | null {
  const params = new URLSearchParams(location.search);
  const c = cleanCode(params.get('crew') ?? '');
  if (!params.has('crew')) return null;
  params.delete('crew');
  const rest = params.toString();
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
  return validCode(c) ? c : null;
}
