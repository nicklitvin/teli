import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailSheet } from './components/DetailSheet';
import { ListIcon, MapIcon, SearchIcon, SparklesIcon, UsersIcon } from './components/Icons';
import { ProfileSheet } from './components/ProfileSheet';
import { RateFlow } from './components/RateFlow';
import { Sheet } from './components/Sheet';
import { NavCtx, type Nav } from './nav';
import { ForYou } from './screens/ForYou';
import { MyList } from './screens/MyList';
import { Search } from './screens/Search';
import { TasteMap } from './screens/TasteMap';
import { Together } from './screens/Together';

type Tab = 'foryou' | 'search' | 'map' | 'together' | 'list';

const TABS: { id: Tab; label: string; Icon: typeof SearchIcon }[] = [
  { id: 'foryou', label: 'For You', Icon: SparklesIcon },
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'map', label: 'Taste Map', Icon: MapIcon },
  { id: 'together', label: 'Together', Icon: UsersIcon },
  { id: 'list', label: 'My List', Icon: ListIcon },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('foryou');
  const [searchFocus, setSearchFocus] = useState(0);

  // Detail sheets form a stack so "More like this" can drill in and back out.
  const [stack, setStack] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailOpenRef = useRef(false);

  const [rate, setRate] = useState<{ id: string; key: number } | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
    openProfile() {
      setProfileOpen(true);
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
  const closeProfile = useCallback(() => setProfileOpen(false), []);

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
        <Together active={tab === 'together'} />
        <MyList active={tab === 'list'} onSearch={goSearch} />

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
      <Sheet open={profileOpen} onClose={closeProfile} z={50} label="Profile and settings">
        <ProfileSheet onClose={closeProfile} />
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
