import { useCallback, useMemo, useRef, useState } from 'react';
import { DetailSheet } from './components/DetailSheet';
import { ListIcon, SearchIcon, SparklesIcon } from './components/Icons';
import { RateFlow } from './components/RateFlow';
import { Sheet } from './components/Sheet';
import { NavCtx, type Nav } from './nav';
import { ForYou } from './screens/ForYou';
import { MyList } from './screens/MyList';
import { Search } from './screens/Search';

type Tab = 'foryou' | 'search' | 'list';

const TABS: { id: Tab; label: string; Icon: typeof SearchIcon }[] = [
  { id: 'foryou', label: 'For You', Icon: SparklesIcon },
  { id: 'search', label: 'Search', Icon: SearchIcon },
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
        <MyList active={tab === 'list'} onSearch={goSearch} />

        <nav className="tabbar">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-current={tab === id}>
              <Icon size={25} />
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
    </NavCtx.Provider>
  );
}
