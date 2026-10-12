import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailSheet } from './components/DetailSheet';
import { PlanetIcon, RocketIcon, SearchIcon, UserIcon, UsersIcon } from './components/Icons';
import { RateFlow } from './components/RateFlow';
import { Sheet } from './components/Sheet';
import { cloudEnabled, takeInvite } from './lib/cloud';
import { NavCtx, type Nav } from './nav';
import { ForYou } from './screens/ForYou';
import { Profile } from './screens/Profile';
import { Search } from './screens/Search';
import { TasteMap } from './screens/TasteMap';
import { Together } from './screens/Together';

type Tab = 'foryou' | 'search' | 'map' | 'together' | 'profile';

const TABS: { id: Tab; label: string; Icon: typeof SearchIcon }[] = [
  { id: 'foryou', label: 'For You', Icon: RocketIcon },
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'map', label: 'Galaxy', Icon: PlanetIcon },
  { id: 'together', label: 'Crew', Icon: UsersIcon },
  { id: 'profile', label: 'Profile', Icon: UserIcon },
];

// Opened from a crew invite link: start on the Crew tab with the code filled in.
const INVITE = cloudEnabled ? takeInvite() : null;

export default function App() {
  const [tab, setTab] = useState<Tab>(INVITE ? 'together' : 'foryou');
  const [searchFocus, setSearchFocus] = useState(0);

  // Detail sheets form a stack so "More like this" can drill in and back out.
  const [stack, setStack] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailOpenRef = useRef(false);

  const [rate, setRate] = useState<{ id: string; key: number } | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void; key: number } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const nav = useMemo<Nav>(() => ({
    openDetail(id) {
      setStack((s) => (detailOpenRef.current ? [...s, id] : [id]));
      detailOpenRef.current = true;
      setDetailOpen(true);
    },
    openRate(id) {
      setRate({ id, key: Date.now() });
      setRateOpen(true);
    },
    notify(text, undo) {
      setToast({ text, undo, key: Date.now() });
    },
  }), []);

  const closeDetail = useCallback(() => {
    detailOpenRef.current = false;
    setDetailOpen(false);
  }, []);
  const closeRate = useCallback(() => setRateOpen(false), []);

  const goSearch = () => {
    setTab('search');
    setSearchFocus((n) => n + 1);
  };

  const current = stack[stack.length - 1];

  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <ForYou active={tab === 'foryou'} onSearch={goSearch} />
        <Search active={tab === 'search'} focusKey={searchFocus} />
        <TasteMap active={tab === 'map'} />
        <Together active={tab === 'together'} invite={INVITE} />
        <Profile active={tab === 'profile'} onSearch={goSearch} />

        <nav className="tabbar">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-current={tab === id}>
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      <Sheet open={detailOpen} onClose={closeDetail} z={40} label="Title details">
        {current && (
          <DetailSheet id={current} canGoBack={stack.length > 1}
            onBack={() => setStack((s) => s.slice(0, -1))} onClose={closeDetail} />
        )}
      </Sheet>
      <Sheet open={rateOpen} onClose={closeRate} z={60} label="Rate title">
        {rate && <RateFlow key={rate.key} id={rate.id} onClose={closeRate} />}
      </Sheet>
      {toast && (
        <div className="toast" key={toast.key} role="status">
          <span>{toast.text}</span>
          {toast.undo && <button onClick={() => { toast.undo!(); setToast(null); }}>Undo</button>}
        </div>
      )}
    </NavCtx.Provider>
  );
}
