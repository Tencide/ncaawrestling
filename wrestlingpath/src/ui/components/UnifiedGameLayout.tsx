'use client';

import { useState } from 'react';
import { useGame } from '@/ui/context/GameContext';
import { saveGame } from '@/db/persistence';
import { UnifiedEngine } from '@/engine/unified/UnifiedEngine';
import { useEffect } from 'react';

export function UnifiedGameLayout() {
  const { state, engine, applyChoice, applyRelationshipAction, advanceWeek, runOffseasonEvent, goToCreate } = useGame();
  const [view, setView] = useState<'play' | 'rankings' | 'trophies' | 'schedule' | 'settings' | 'relationships'>('play');
  const [viewingWeightClass, setViewingWeightClass] = useState<number | null>(null);

  useEffect(() => {
    if (state) saveGame(state);
  }, [state]);

  useEffect(() => {
    setViewingWeightClass(null);
  }, [state?.seed, state?.weightClass]);

  if (!state || !engine) return null;

  const choices = engine.getChoices();
  const offseasonEvents = engine.getOffseasonEvents();
  const hoursLeft = state.hoursLeftThisWeek ?? 40;

  const tabClass = (v: typeof view) =>
    `min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-lg text-sm font-medium touch-manipulation ${view === v ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-slate-300 dark:bg-zinc-700 text-slate-700 dark:text-zinc-400 active:bg-slate-400 dark:active:bg-zinc-600'}`;

  return (
    <div className="flex flex-col md:flex-row h-screen max-h-[100dvh] bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-200 overflow-hidden">
      {/* Left panel — desktop only */}
      <aside className="hidden md:flex w-52 shrink-0 border-r border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/80 p-4 flex-col gap-3 overflow-y-auto">
        <div>
          <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{state.name}</div>
          <div className="text-xs text-slate-500 dark:text-zinc-500">Age {state.age} · Week {state.week ?? 1} Year {state.year}</div>
          <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">{state.overallRating}</div>
          <div className="text-xs text-slate-600 dark:text-zinc-400">{state.league.replace(/_/g, ' ')} · {state.weightClass} lbs</div>
        </div>
        <div className="text-xs">
          <div className="text-slate-500 dark:text-zinc-500 mb-1">Attributes</div>
          <div>Tech {state.technique} · IQ {state.matIQ} · Cond {state.conditioning}</div>
          <div>Str {state.strength} · Spd {state.speed} · Flex {state.flexibility}</div>
        </div>
        <div className="text-xs">
          <div className="text-slate-500 dark:text-zinc-500 mb-1">Meters</div>
          <div>Energy {state.energy} · Health {state.health} · Stress {state.stress}</div>
          <div>Happiness {state.happiness} · Grades {state.grades}</div>
        </div>
        <div className="text-xs">
          <div className="text-slate-500 dark:text-zinc-500 mb-1">Record</div>
          <div>Season: {state.stats.seasonWins}-{state.stats.seasonLosses}</div>
          <div>Career: {state.stats.matchesWon}-{state.stats.matchesLost}</div>
        </div>
        <div className="text-xs">
          <div className="text-slate-500 dark:text-zinc-500 mb-1">Money</div>
          <div className="text-green-600 dark:text-green-400">${state.money}</div>
          <div className="text-slate-500 dark:text-zinc-500">Recruiting: {state.recruitingScore}</div>
        </div>
      </aside>

      {/* Mobile top bar: name, rating, hours, energy, $, New game */}
      <header className="md:hidden shrink-0 border-b border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-900/95 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-blue-600 dark:text-blue-400 font-semibold truncate">{state.name}</span>
          <span className="text-slate-900 dark:text-white font-bold">{state.overallRating}</span>
          <span className="text-slate-500 dark:text-zinc-500 text-xs">{state.weightClass} lbs</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-zinc-400">
          <span><span className="text-blue-600 dark:text-blue-400">H</span> {hoursLeft}</span>
          <span><span className="text-blue-600 dark:text-blue-400">E</span> {state.energy}</span>
          <span className="text-green-600 dark:text-green-400">${state.money}</span>
        </div>
        <button type="button" onClick={goToCreate} className="rounded-lg bg-slate-300 dark:bg-zinc-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-zinc-300 active:bg-slate-400 dark:active:bg-zinc-600 touch-manipulation min-h-[40px]">
          New game
        </button>
      </header>

      {/* Center */}
      <main className="flex-1 min-h-0 min-w-0 p-4 md:p-6 flex flex-col gap-4 overflow-y-auto overflow-x-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 scrollbar-thin scrollbar-thumb-slate-400 dark:scrollbar-thumb-zinc-600 touch-pan-x">
          <button type="button" onClick={() => setView('play')} className={tabClass('play')}>Play</button>
          <button type="button" onClick={() => setView('rankings')} className={tabClass('rankings')}>Rankings</button>
          <button type="button" onClick={() => setView('relationships')} className={tabClass('relationships')}>Relationships</button>
          <button type="button" onClick={() => setView('trophies')} className={tabClass('trophies')}>Trophies</button>
          <button type="button" onClick={() => setView('schedule')} className={tabClass('schedule')}>Schedule</button>
          <button type="button" onClick={() => setView('settings')} className={tabClass('settings')}>Settings</button>
        </div>

        {view === 'play' && (
          <>
            <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
              <p className="text-slate-700 dark:text-zinc-300 whitespace-pre-wrap">{state.story}</p>
            </div>

            {state.lastWeekSummary && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-600/60 dark:border-blue-500/60 p-4">
                <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">Week {state.lastWeekSummary.week} summary · {state.lastWeekSummary.phase}</h3>
                {state.lastWeekSummary.eventType && (
                  <p className="text-xs text-zinc-400 mb-2">{state.lastWeekSummary.eventType === 'dual' ? 'Dual meet' : state.lastWeekSummary.eventType === 'tournament' ? 'Tournament' : state.lastWeekSummary.eventType}</p>
                )}
                {state.lastWeekSummary.matches && state.lastWeekSummary.matches.length > 0 && (
                  <ul className="text-sm text-slate-600 dark:text-zinc-300 space-y-1 mb-2">
                    {state.lastWeekSummary.matches.map((m, i) => (
                      <li key={i}>
                        {m.won ? 'W' : 'L'} vs {m.opponentName} ({m.opponentOverall})
                        {m.stateRank != null && ` #${m.stateRank} state`}
                        {m.nationalRank != null && ` #${m.nationalRank} nat'l`}
                        {m.method && ` — ${m.method}`}
                      </li>
                    ))}
                  </ul>
                )}
                {state.lastWeekSummary.placement != null && (
                  <p className="text-sm text-blue-700 dark:text-blue-200">Placed {state.lastWeekSummary.placement === 1 ? '1st' : state.lastWeekSummary.placement === 2 ? '2nd' : state.lastWeekSummary.placement === 3 ? '3rd' : '4th'}</p>
                )}
                {state.lastWeekSummary.recordChange && (
                  <p className="text-sm text-zinc-400">Record this week: +{state.lastWeekSummary.recordChange.wins} W, {state.lastWeekSummary.recordChange.losses} L</p>
                )}
                {state.lastWeekSummary.recruitingChange != null && state.lastWeekSummary.recruitingChange !== 0 && (
                  <p className="text-sm text-zinc-400">Recruiting {state.lastWeekSummary.recruitingChange > 0 ? '+' : ''}{state.lastWeekSummary.recruitingChange}</p>
                )}
                <ul className="text-sm text-zinc-400 mt-2 space-y-0.5">
                  {state.lastWeekSummary.message.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            {(() => {
              const mods = engine.getWeekModifiers();
              return (
                <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
                  <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">Weekly modifiers</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div><span className="text-slate-500 dark:text-zinc-500">Training:</span> <span className="text-slate-800 dark:text-zinc-200">{(mods.trainingMult * 100).toFixed(0)}%</span></div>
                    <div><span className="text-slate-500 dark:text-zinc-500">Performance:</span> <span className="text-slate-800 dark:text-zinc-200">{(mods.performanceMult * 100).toFixed(0)}%</span></div>
                    <div><span className="text-slate-500 dark:text-zinc-500">Injury risk:</span> <span className="text-slate-800 dark:text-zinc-200">{(mods.injuryRiskMult * 100).toFixed(0)}%</span></div>
                    <div><span className="text-slate-500 dark:text-zinc-500">Weight cut:</span> <span className="text-slate-800 dark:text-zinc-200">{(mods.weightCutSeverityMult * 100).toFixed(0)}%</span></div>
                  </div>
                  {mods.reasons.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">Active: {mods.reasons.join(', ')}</p>
                  )}
                </div>
              );
            })()}

            {(offseasonEvents.length > 0 || (state.week === 27 || state.week === 28 || state.week === 36 || state.week === 37)) && (
              <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
                <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">Offseason events</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mb-2">Each tournament can only be entered once per year. Events are simulated match-by-match.</p>
                <div className="flex flex-wrap gap-2">
                  {offseasonEvents.map((ev) => (
                    <button
                      key={ev.key}
                      type="button"
                      onClick={() => {
                        const result = runOffseasonEvent(ev.key);
                        if (result.success && result.matches?.length) {
                          setView('play');
                        }
                      }}
                      disabled={!ev.canAfford}
                      className="rounded-lg bg-slate-300 dark:bg-zinc-700 px-3 py-2.5 min-h-[44px] text-sm hover:bg-slate-400 dark:hover:bg-zinc-600 active:bg-slate-500 dark:active:bg-zinc-500 disabled:opacity-50 touch-manipulation"
                    >
                      {ev.name} (${ev.cost}) {!ev.canAfford && '(can\'t afford)'}
                    </button>
                  ))}
                </div>
                {state.week === 37 && !offseasonEvents.some((e) => e.key === 'wno') && (
                  <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">Who&apos;s Number One: Not invited (need Recruiting 68+).</p>
                )}
              </div>
            )}

            <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
              <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">Choose action this week</h3>
              {hoursLeft <= 0 ? (
                <p className="text-slate-600 dark:text-zinc-400 text-sm">No hours left this week. Advance to next week to get more time.</p>
              ) : (
                <div className="space-y-4">
                  {['training', 'relationship', 'life'].map((tab) => {
                    const tabChoices = choices.filter((c) => (c as { tab?: string }).tab === tab);
                    if (tabChoices.length === 0) return null;
                    const tabLabel = tab === 'training' ? 'Training' : tab === 'relationship' ? 'Relationship' : 'Life';
                    return (
                      <div key={tab}>
                        <h4 className="text-xs font-medium text-slate-500 dark:text-zinc-500 mb-2">{tabLabel}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {tabChoices.map((c) => {
                            const preview = engine.getChoicePreview(c.key);
                            const hours = preview?.hours ?? 0;
                            const money = preview?.money ?? 0;
                            const modD = preview?.modifierDeltas;
                            const modLines: string[] = [];
                            if (modD?.trainingMult) modLines.push(`Training ${modD.trainingMult > 0 ? '+' : ''}${(modD.trainingMult * 100).toFixed(0)}%`);
                            if (modD?.performanceMult) modLines.push(`Perf ${modD.performanceMult > 0 ? '+' : ''}${(modD.performanceMult * 100).toFixed(0)}%`);
                            if (modD?.injuryRiskMult) modLines.push(`Injury ${modD.injuryRiskMult > 0 ? '+' : ''}${(modD.injuryRiskMult * 100).toFixed(0)}%`);
                            return (
                              <button
                                key={c.key}
                                type="button"
                                onClick={() => applyChoice(c.key)}
                                className="rounded-lg bg-slate-300 dark:bg-zinc-700 px-3 py-3 min-h-[48px] text-sm text-left hover:bg-blue-600 dark:hover:bg-blue-500 active:bg-blue-700 dark:active:bg-blue-600 transition-colors flex flex-col gap-0.5 touch-manipulation"
                              >
                                <span>{c.label}</span>
                                <span className="text-xs text-slate-500 dark:text-zinc-500">
                                  {hours}h{money > 0 ? ` · $${money}` : ''}
                                  {preview?.energy !== undefined && preview.energy !== 0 && ` · Energy ${preview.energy > 0 ? '+' : ''}${preview.energy}`}
                                  {modLines.length > 0 && ` · ${modLines.join(', ')}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => advanceWeek()}
              className="w-full sm:w-auto rounded-lg bg-blue-600 dark:bg-blue-500 py-4 sm:py-3 px-6 min-h-[52px] font-semibold text-white hover:bg-blue-500 dark:hover:bg-blue-400 active:bg-blue-700 dark:active:bg-blue-600 touch-manipulation"
            >
              Next week →
            </button>
          </>
        )}

        {view === 'relationships' && (
          <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
            <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-lg mb-4">Relationships</h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mb-4">Spend time or take actions with family, coach, friends, and partner. Each action uses hours this week.</p>
            <div className="space-y-4">
              {engine.getRelationships().map((rel) => {
                const actions = engine.getRelationshipActions(rel.id);
                const kindLabel = rel.label ?? rel.kind;
                return (
                  <div key={rel.id} className="rounded-lg bg-slate-200/80 dark:bg-zinc-900/80 border border-slate-300 dark:border-zinc-600 p-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">{rel.name}</span>
                        <span className="text-slate-500 dark:text-zinc-500 text-sm ml-2">({kindLabel})</span>
                      </div>
                      <div className="text-blue-600 dark:text-blue-400 text-sm">Level {rel.level}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {actions.map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => applyRelationshipAction(rel.id, a.key)}
                          className="rounded-lg bg-slate-300 dark:bg-zinc-700 px-3 py-2.5 min-h-[44px] text-sm hover:bg-blue-600 dark:hover:bg-blue-500 active:bg-blue-700 dark:active:bg-blue-600 transition-colors touch-manipulation"
                        >
                          {a.label}
                          {a.hours > 0 && <span className="text-slate-500 dark:text-zinc-500 ml-1">{a.hours}h</span>}
                          {a.money != null && a.money > 0 && <span className="text-green-600 dark:text-green-400 ml-1">${a.money}</span>}
                        </button>
                      ))}
                      {actions.length === 0 && (
                        <span className="text-slate-500 dark:text-zinc-500 text-sm">No hours left for actions this week.</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {engine.getRelationships().length === 0 && (
                <p className="text-slate-500 dark:text-zinc-500">No relationships yet. They may appear as you play.</p>
              )}
            </div>
          </div>
        )}

        {view === 'rankings' && (() => {
          const weightClasses = UnifiedEngine.getWeightClasses();
          const currentViewing = viewingWeightClass ?? state.weightClass;
          const idx = weightClasses.indexOf(currentViewing);
          const prevWeight = idx > 0 ? weightClasses[idx - 1] : null;
          const nextWeight = idx >= 0 && idx < weightClasses.length - 1 ? weightClasses[idx + 1] : null;
          const board = engine.getRankingsBoard();
          const data = board[currentViewing] as Array<{ rank: number; name: string; overall: number }> & { playerRank?: number; playerRating?: number };
          const isYourWeight = currentViewing === state.weightClass;
          return (
            <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
              <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">Rankings</h3>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-sm text-slate-600 dark:text-zinc-400">Weight class:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => prevWeight != null && setViewingWeightClass(prevWeight)}
                    disabled={prevWeight == null}
                    className="rounded-lg bg-slate-300 dark:bg-zinc-700 min-h-[44px] min-w-[44px] px-3 py-2 text-sm disabled:opacity-40 hover:bg-slate-400 dark:hover:bg-zinc-600 active:bg-slate-500 dark:active:bg-zinc-500 touch-manipulation"
                  >
                    ←
                  </button>
                  <span className="min-w-[4rem] text-center font-medium text-slate-900 dark:text-white">
                    {currentViewing} lbs {isYourWeight && '(you)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => nextWeight != null && setViewingWeightClass(nextWeight)}
                    disabled={nextWeight == null}
                    className="rounded-lg bg-slate-300 dark:bg-zinc-700 min-h-[44px] min-w-[44px] px-3 py-2 text-sm disabled:opacity-40 hover:bg-slate-400 dark:hover:bg-zinc-600 active:bg-slate-500 dark:active:bg-zinc-500 touch-manipulation"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingWeightClass(state.weightClass)}
                  className="rounded-lg bg-slate-300 dark:bg-zinc-700 min-h-[44px] px-3 py-2 text-xs text-slate-600 dark:text-zinc-400 hover:bg-slate-400 dark:hover:bg-zinc-600 active:bg-slate-500 dark:active:bg-zinc-500 touch-manipulation"
                >
                  My weight ({state.weightClass})
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mb-2">Viewing all weight classes. Your weight: {state.weightClass} lbs.</p>
              {(!data || !Array.isArray(data)) ? (
                <p className="text-slate-500 dark:text-zinc-500">No rankings for this weight.</p>
              ) : (
                <>
                  {isYourWeight && (
                    <p className="text-sm text-zinc-400 mb-2">Your rank: #{data.playerRank ?? '—'} (rating {data.playerRating ?? state.overallRating})</p>
                  )}
                  <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[200px]">
                    <thead>
                      <tr className="text-slate-500 dark:text-zinc-500">
                        <th className="text-left">#</th>
                        <th className="text-left">Name</th>
                        <th className="text-left">Overall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 10).map((row, i) => {
                        const isYou = row.name === state.name;
                        const playerRank = data.playerRank ?? 0;
                        const playerRating = data.playerRating ?? state.overallRating ?? 0;
                        const goodEnough = isYou && (playerRank <= 5 || playerRating >= 70);
                        const rowClass = isYou ? (goodEnough ? 'text-green-600 dark:text-green-400 font-medium' : 'text-blue-600 dark:text-blue-400 font-medium') : '';
                        return (
                          <tr key={i} className={rowClass}>
                            <td>{row.rank}</td>
                            <td>{row.name}</td>
                            <td>{row.overall}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {view === 'trophies' && (
          <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4 space-y-6">
            <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-lg">Trophy case</h3>

            <section>
              <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">State</h4>
              <div className="text-slate-600 dark:text-zinc-400 text-sm">
                <p>State titles: <span className="text-blue-600 dark:text-blue-400 font-semibold">{state.stats.stateTitles ?? 0}</span></p>
                <p>State appearances: {state.stats.stateAppearances ?? 0}</p>
                {(state.stats.statePlacements?.length ?? 0) > 0 && (
                  <p className="mt-1">Placements: {state.stats.statePlacements.join(', ')}</p>
                )}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">Fargo</h4>
              <div className="text-slate-600 dark:text-zinc-400 text-sm">
                <p>Fargo titles: <span className="text-blue-600 dark:text-blue-400 font-semibold">{(state.stats.fargoPlacements ?? []).filter((p) => p === 1).length}</span></p>
                {(state.stats.fargoPlacements?.length ?? 0) > 0 && (
                  <p>Placements: {(state.stats.fargoPlacements ?? []).join(', ')}</p>
                )}
                {(state.stats.fargoPlacements?.length ?? 0) === 0 && <p>No Fargo results yet.</p>}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">NCAA</h4>
              <div className="text-slate-600 dark:text-zinc-400 text-sm">
                <p>NCAA titles: <span className="text-blue-600 dark:text-blue-400 font-semibold">{state.stats.ncaaTitles ?? 0}</span></p>
                <p>All-American finishes: <span className="text-blue-600 dark:text-blue-400 font-semibold">{state.stats.ncaaAllAmerican ?? 0}</span></p>
                <p>NCAA appearances: {state.stats.ncaaAppearances ?? 0}</p>
                {(state.stats.ncaaPlacements?.length ?? 0) > 0 && (
                  <p className="mt-1">Placements: {state.stats.ncaaPlacements.join(', ')}</p>
                )}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">Super 32</h4>
              <div className="text-slate-600 dark:text-zinc-400 text-sm">
                {(state.stats.super32Placements?.length ?? 0) > 0 ? (
                  <p>Placements: {(state.stats.super32Placements ?? []).join(', ')}</p>
                ) : (
                  <p>No Super 32 results yet.</p>
                )}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">Who&apos;s Number One</h4>
              <div className="text-slate-600 dark:text-zinc-400 text-sm">
                <p>WNO wins: <span className="text-blue-600 dark:text-blue-400 font-semibold">{state.stats.wnoWins ?? 0}</span></p>
                <p>Appearances: {state.stats.wnoAppearances ?? 0}</p>
              </div>
            </section>

            {state.accolades && state.accolades.length > 0 && (
              <section>
                <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">Accolades</h4>
                <ul className="text-slate-600 dark:text-zinc-400 text-sm list-disc list-inside space-y-0.5">
                  {state.accolades.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {view === 'schedule' && (
          <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
            <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-lg mb-2">Schedule · Year {state.year}</h3>
            <p className="text-slate-600 dark:text-zinc-400 text-sm mb-2">You are on week <span className="text-blue-600 dark:text-blue-400 font-semibold">{state.week}</span> of 52 · {engine.getHSPhaseForWeek(state.week ?? 1)}</p>
            <div className="overflow-x-auto -mx-1 pb-2 touch-pan-x">
            <div className="grid grid-cols-7 gap-1.5 max-w-2xl mb-2 min-w-[280px]">
              {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                const isCurrent = w === (state.week ?? 1);
                const phase = engine.getHSPhaseForWeek(w);
                const entry = engine.getHSScheduleEntry(w);
                const eventLabel = entry?.type === 'dual' ? 'D' : entry?.type === 'tournament' ? 'T' : entry?.type === 'rival' ? 'R' : '';
                const title = eventLabel ? `Week ${w}: ${phase} · ${entry?.type}` : `Week ${w}: ${phase}`;
                return (
                  <div
                    key={w}
                    className={`
                      w-9 h-9 sm:w-10 sm:h-10 rounded flex flex-col items-center justify-center text-xs font-medium border shrink-0
                      ${isCurrent
                        ? 'bg-blue-600 dark:bg-blue-500 border-blue-500 dark:border-blue-400 text-white ring-2 ring-blue-400 dark:ring-blue-300'
                        : 'bg-slate-300 dark:bg-zinc-700/80 border-slate-400 dark:border-zinc-600 text-slate-600 dark:text-zinc-400'}
                    `}
                    title={title}
                  >
                    <span>{w}</span>
                    {eventLabel ? <span className="text-[10px] opacity-80">{eventLabel}</span> : null}
                  </div>
                );
              })}
            </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-500">D = Dual, T = Tournament, R = Rival. Highlighted = current week. Weeks 9–20 Offseason, 21–30 Summer (Fargo 27–28), 31–38 Preseason (Super 32 W36, WNO W37), 39–49 Regular, 50 District, 51 State, 52 Wrap.</p>
          </div>
        )}

        {view === 'settings' && (
          <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4 max-w-md space-y-6">
            <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-lg">Settings</h3>

            <section>
              <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">Game</h4>
              <div className="space-y-2 text-sm text-slate-600 dark:text-zinc-400">
                <p>Save data is stored in this browser. Use &quot;New game&quot; to start over.</p>
              </div>
            </section>

            <section>
              <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">About</h4>
              <p className="text-sm text-slate-600 dark:text-zinc-400">
                Wrestling Career Sim — week-by-week choices, high school to college, state and NCAA, Fargo, rankings, recruiting.
              </p>
            </section>
          </div>
        )}
      </main>

      {/* Desktop top-right bar (mobile uses header) */}
      <div className="hidden md:flex absolute top-4 right-4 items-center gap-3">
        <span className="text-xs text-zinc-400">
          <span className="text-blue-600 dark:text-blue-400 font-medium">Hours:</span> {state.hoursLeftThisWeek ?? 40}
        </span>
        <span className="text-xs text-slate-600 dark:text-zinc-400">
          <span className="text-blue-600 dark:text-blue-400 font-medium">Energy:</span> {state.energy}
        </span>
        <span className="text-xs text-slate-600 dark:text-zinc-400">
          <span className="text-blue-600 dark:text-blue-400 font-medium">$</span>{state.money}
        </span>
        <button type="button" onClick={goToCreate} className="rounded bg-slate-300 dark:bg-zinc-700 px-3 py-1.5 text-xs text-slate-700 dark:text-zinc-300 hover:bg-slate-400 dark:hover:bg-zinc-600">
          New game
        </button>
      </div>
    </div>
  );
}
