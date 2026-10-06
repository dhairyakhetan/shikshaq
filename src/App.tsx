import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { loadDataset } from './data';
import { Home } from './pages/Home';
import { Play } from './pages/Play';
import type { Dataset } from './types';

const DataContext = createContext<{ data: Dataset; reload: () => Promise<void> } | null>(null);
export const useDataset = () => useContext(DataContext)!.data;
/** Re-read the questions, e.g. after the user pasted new ones. */
export const useReload = () => useContext(DataContext)!.reload;

export function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => loadDataset().then(setData, (e: Error) => setError(e.message)), []);
  useEffect(() => { void reload(); }, [reload]);

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
          <DataContext.Provider value={{ data, reload }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/play/:game" element={<Play />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </DataContext.Provider>
        )}
      </main>
    </div>
  );
}
