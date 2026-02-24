'use client';

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';

const BACKGROUNDS = [
  { key: 'plasma', label: 'Plasma' },
  { key: 'waves', label: 'Waves' },
] as const;

type BackgroundKey = (typeof BACKGROUNDS)[number]['key'];

const componentMap: Record<BackgroundKey, React.LazyExoticComponent<React.ComponentType>> = {
  plasma: lazy(() => import('./backgrounds/PlasmaBackground')),
  waves: lazy(() => import('./backgrounds/WavesBackground')),
};

const STORAGE_KEY = 'background-choice';

export default function BackgroundSwitcher() {
  const [selected, setSelected] = useState<BackgroundKey>('plasma');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as BackgroundKey | null;
      if (stored && componentMap[stored]) {
        setSelected(stored);
      }
    } catch {}
  }, []);

  const handleSelect = useCallback((key: BackgroundKey) => {
    setSelected(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {}
    setOpen(false);
  }, []);

  const BackgroundComponent = componentMap[selected];

  return (
    <>
      <Suspense fallback={null}>
        <BackgroundComponent />
      </Suspense>

      <div className="fixed bottom-4 right-4" style={{ zIndex: 50 }}>
        <button
          onClick={() => setOpen(prev => !prev)}
          className="w-10 h-10 rounded-full glass-elevated flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
          style={{ border: '1px solid rgba(255,255,255,0.15)' }}
          aria-label="Switch background"
          title="Switch background"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r="2.5" />
            <circle cx="19" cy="13.5" r="2.5" />
            <circle cx="5" cy="10.5" r="2.5" />
            <circle cx="7.5" cy="18" r="2.5" />
            <circle cx="15" cy="19" r="2.5" />
          </svg>
        </button>

        {open && (
          <div
            className="absolute bottom-12 right-0 w-48 rounded-lg glass-elevated overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <div className="py-1">
              {BACKGROUNDS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleSelect(key)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                    selected === key
                      ? 'text-[#0084FF] bg-white/5'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="inline-block w-4 mr-2 text-center">
                    {selected === key ? '●' : '○'}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
