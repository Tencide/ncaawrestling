'use client';

import { useState, useEffect } from 'react';
import { useGame } from '@/ui/context/GameContext';
import { UnifiedEngine } from '@/engine/unified/UnifiedEngine';
import { loadGame, hasSave } from '@/db/persistence';
import type { LeagueKey, CustomStartOptions } from '@/engine/unified/types';

const LEAGUES: { value: LeagueKey; label: string }[] = [
  { value: 'HS_JV', label: 'HS JV' },
  { value: 'HS_VARSITY', label: 'HS Varsity' },
  { value: 'HS_ELITE', label: 'HS Elite' },
  { value: 'JUCO', label: 'JUCO' },
  { value: 'NAIA', label: 'NAIA' },
  { value: 'D3', label: 'D3' },
  { value: 'D2', label: 'D2' },
  { value: 'D1', label: 'D1' },
];

export function CreateScreen() {
  const { startNewGame, loadGame: loadIntoEngine } = useGame();
  const [name, setName] = useState('');
  const [weightClass, setWeightClass] = useState(145);
  const [seed, setSeed] = useState('');
  const [canLoad, setCanLoad] = useState(false);
  const [customStart, setCustomStart] = useState(false);
  const [customAge, setCustomAge] = useState(14);
  const [customYear, setCustomYear] = useState(1);
  const [customWeek, setCustomWeek] = useState(1);
  const [customLeague, setCustomLeague] = useState<LeagueKey>('HS_JV');
  const [customTechnique, setCustomTechnique] = useState(45);
  const [customMatIQ, setCustomMatIQ] = useState(42);
  const [customConditioning, setCustomConditioning] = useState(48);
  const [customStrength, setCustomStrength] = useState(40);
  const [customSpeed, setCustomSpeed] = useState(42);
  const [customFlexibility, setCustomFlexibility] = useState(45);
  const [customEnergy, setCustomEnergy] = useState(100);
  const [customHealth, setCustomHealth] = useState(100);
  const [customHappiness, setCustomHappiness] = useState(75);
  const [customGrades, setCustomGrades] = useState(75);
  const [customSocial, setCustomSocial] = useState(50);
  const [customMoney, setCustomMoney] = useState(200);
  const [customRecruiting, setCustomRecruiting] = useState(50);

  useEffect(() => {
    setSeed((s) => s || Math.random().toString(36).slice(2, 10));
    setCanLoad(hasSave());
  }, []);

  const handleMaxAllStats = () => {
    setCustomTechnique(99);
    setCustomMatIQ(99);
    setCustomConditioning(99);
    setCustomStrength(99);
    setCustomSpeed(99);
    setCustomFlexibility(99);
    setCustomEnergy(100);
    setCustomHealth(100);
    setCustomHappiness(100);
    setCustomGrades(100);
    setCustomSocial(100);
    setCustomMoney(99999);
    setCustomRecruiting(100);
  };

  const handleStart = () => {
    const options: { name: string; weightClass: number; customStart?: CustomStartOptions } = {
      name: name.trim() || 'Wrestler',
      weightClass,
    };
    if (customStart) {
      options.customStart = {
        age: customAge,
        year: customYear,
        week: customWeek,
        league: customLeague,
        technique: customTechnique,
        matIQ: customMatIQ,
        conditioning: customConditioning,
        strength: customStrength,
        speed: customSpeed,
        flexibility: customFlexibility,
        energy: customEnergy,
        health: customHealth,
        happiness: customHappiness,
        grades: customGrades,
        social: customSocial,
        money: customMoney,
        recruitingScore: customRecruiting,
      };
    }
    startNewGame(seed || 'default', options);
  };

  const weights = UnifiedEngine.getWeightClasses();

  return (
    <div className="max-w-md mx-auto p-4 sm:p-8 rounded-xl bg-slate-100 dark:bg-zinc-800/90 border border-slate-200 dark:border-zinc-700 shadow-xl min-h-0">
      <h1 className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 mb-2">Wrestling Career Sim</h1>
      <p className="text-slate-600 dark:text-zinc-400 text-sm mb-6">One game: high school → college. Week-by-week choices, state/NCAA, Fargo, rankings, recruiting.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-600 px-3 py-3 min-h-[48px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 touch-manipulation"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-500 mb-1">Weight class (lbs)</label>
          <select
            value={weightClass}
            onChange={(e) => setWeightClass(Number(e.target.value))}
            className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-600 px-3 py-3 min-h-[48px] text-slate-900 dark:text-white touch-manipulation"
          >
            {weights.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-zinc-500 mb-1">Seed (for save/load)</label>
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-600 px-3 py-3 min-h-[48px] text-slate-900 dark:text-white font-mono text-sm touch-manipulation"
          />
        </div>
        <div className="pt-2 border-t border-slate-300 dark:border-zinc-600">
          <label className="flex items-center gap-3 cursor-pointer min-h-[44px] py-2">
            <input
              type="checkbox"
              checked={customStart}
              onChange={(e) => setCustomStart(e.target.checked)}
              className="rounded border-slate-400 dark:border-zinc-500 bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-500 w-5 h-5 shrink-0 touch-manipulation"
            />
            <span className="text-sm text-slate-700 dark:text-zinc-300">Custom start</span>
          </label>
          {customStart && (
            <div className="mt-3 grid grid-cols-2 gap-3 pl-6">
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-500 mb-0.5">Age</label>
                <input
                  type="number"
                  min={14}
                  max={24}
                  value={customAge}
                  onChange={(e) => setCustomAge(Number(e.target.value) || 14)}
                  className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-600 px-2 py-2 min-h-[44px] text-slate-900 dark:text-white text-sm touch-manipulation"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-0.5">Year</label>
                <input
                  type="number"
                  min={1}
                  value={customYear}
                  onChange={(e) => setCustomYear(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-600 px-2 py-2 min-h-[44px] text-slate-900 dark:text-white text-sm touch-manipulation"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-500 mb-0.5">Week (1–52)</label>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={customWeek}
                  onChange={(e) => setCustomWeek(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                  className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-600 px-2 py-2 min-h-[44px] text-slate-900 dark:text-white text-sm touch-manipulation"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-500 mb-0.5">League</label>
                <select
                  value={customLeague}
                  onChange={(e) => setCustomLeague(e.target.value as LeagueKey)}
                  className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-600 px-2 py-2 min-h-[44px] text-slate-900 dark:text-white text-sm touch-manipulation"
                >
                  {LEAGUES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {customStart && (
            <div className="mt-3 pl-6 border-t border-slate-300 dark:border-zinc-600 pt-3">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400/90">Edit stats (custom start only)</span>
                <button
                  type="button"
                  onClick={handleMaxAllStats}
                  className="rounded-lg bg-blue-600 dark:bg-blue-500/80 px-3 py-2 min-h-[44px] text-xs font-medium text-white hover:bg-blue-500 dark:hover:bg-blue-400 active:bg-blue-700 dark:active:bg-blue-600 touch-manipulation"
                >
                  Max all stats
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: 'Technique', val: customTechnique, set: setCustomTechnique, min: 0, max: 99 },
                  { label: 'Mat IQ', val: customMatIQ, set: setCustomMatIQ, min: 0, max: 99 },
                  { label: 'Conditioning', val: customConditioning, set: setCustomConditioning, min: 0, max: 99 },
                  { label: 'Strength', val: customStrength, set: setCustomStrength, min: 0, max: 99 },
                  { label: 'Speed', val: customSpeed, set: setCustomSpeed, min: 0, max: 99 },
                  { label: 'Flexibility', val: customFlexibility, set: setCustomFlexibility, min: 0, max: 99 },
                  { label: 'Energy', val: customEnergy, set: setCustomEnergy, min: 0, max: 100 },
                  { label: 'Health', val: customHealth, set: setCustomHealth, min: 0, max: 100 },
                  { label: 'Happiness', val: customHappiness, set: setCustomHappiness, min: 0, max: 100 },
                  { label: 'Grades', val: customGrades, set: setCustomGrades, min: 0, max: 100 },
                  { label: 'Social', val: customSocial, set: setCustomSocial, min: 0, max: 100 },
                  { label: 'Money', val: customMoney, set: setCustomMoney, min: 0, max: 99999 },
                  { label: 'Recruiting', val: customRecruiting, set: setCustomRecruiting, min: 0, max: 100 },
                ].map(({ label, val, set, min, max }) => (
                  <div key={label}>
                    <label className="block text-xs text-slate-500 dark:text-zinc-500 mb-0.5">{label}</label>
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={val}
                      onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isNaN(n)) set(Math.max(min, Math.min(max, n)));
                  }}
                      className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-600 px-2 py-2 min-h-[44px] text-slate-900 dark:text-white text-sm touch-manipulation"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleStart}
          className="flex-1 rounded-lg bg-blue-600 dark:bg-blue-500 py-4 sm:py-3 min-h-[52px] font-semibold text-white hover:bg-blue-500 dark:hover:bg-blue-400 active:bg-blue-700 dark:active:bg-blue-600 touch-manipulation"
        >
          Start career
        </button>
        {canLoad && (
          <button
            type="button"
            onClick={() => {
              const saved = loadGame();
              if (saved) loadIntoEngine(saved as import('@/engine/unified/types').UnifiedState);
            }}
            className="rounded-lg bg-slate-500 dark:bg-zinc-600 py-4 sm:py-3 min-h-[52px] px-4 font-medium text-white hover:bg-slate-600 dark:hover:bg-zinc-500 active:bg-slate-700 dark:active:bg-zinc-700 touch-manipulation"
          >
            Load game
          </button>
        )}
      </div>
    </div>
  );
}
