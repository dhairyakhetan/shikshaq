import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { loadDataset } from './data';
import { Menu } from './pages/Menu';
import { Play } from './pages/Play';
import type { Dataset } from './types';

const DataContext = createContext<Dataset | null>(null);
export const useDataset = () => useContext(DataContext)!;

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDataset().then(setData, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <header>
        <Link to="/" className="brand">शिक्षक <span>Shikshaq</span></Link>
      </header>
      <main>
        {error ? (
          <p className="notice bad">{error}</p>
        ) : !data ? (
          <p className="hint">Loading questions…</p>
        ) : (
          <DataContext.Provider value={data}>
            <Routes>
              <Route path="/" element={<Menu />} />
              <Route path="/play/:game" element={<Play />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </DataContext.Provider>
        )}
      </main>
    </div>
  );
}
