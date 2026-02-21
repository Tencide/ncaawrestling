'use client';

import { useState } from 'react';
import { useGame } from '@/ui/context/GameContext';
import type { HousingTier, CarTier, MealPlanTier, RecoveryTier } from '@/engine/unified/types';
import { saveGame } from '@/db/persistence';
import { UnifiedEngine } from '@/engine/unified/UnifiedEngine';
import { useEffect } from 'react';

export function UnifiedGameLayout() {
  const { state, engine, applyChoice, applyRelationshipAction, advanceWeek, runOffseasonEvent, getCollegeOffers, getCanAdvanceWeek, acceptOffer, negotiateOffer, canEnterTransferPortal, enterTransferPortal, getTransferOffers, negotiateTransferOffer, acceptTransfer, withdrawFromTransferPortal, purchaseLifestyle, upgradeLifestyleWeekly, goToCreate } = useGame();
  const [view, setView] = useState<'play' | 'rankings' | 'trophies' | 'schedule' | 'settings' | 'relationships' | 'team' | 'college' | 'lifestyle'>('play');
  const [negotiationFeedback, setNegotiationFeedback] = useState<{ schoolId: string; kind: 'tuition' | 'nil'; success: boolean } | null>(null);
  const [viewingWeightClass, setViewingWeightClass] = useState<number | null>(null);
  const [tipsOpen, setTipsOpen] = useState(false);

  useEffect(() => {
    if (state) saveGame(state);
  }, [state]);

  useEffect(() => {
    setViewingWeightClass(null);
  }, [state?.seed, state?.weightClass]);

  useEffect(() => {
    if (state?.pendingCollegeChoice) setView('college');
  }, [state?.pendingCollegeChoice]);

  if (!state || !engine) return null;

  const isInCollege = !['HS_JV', 'HS_VARSITY', 'HS_ELITE'].includes(state.league);
  const isHS = !isInCollege;
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
        {typeof state.eligibilityYearsRemaining === 'number' && (
          <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">Eligibility: {state.eligibilityYearsRemaining} year{state.eligibilityYearsRemaining !== 1 ? 's' : ''} left</div>
        )}
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
        {/* Tab bar: never shrink, always visible; scroll horizontally on small screens */}
        <div className="flex-shrink-0 w-full overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-slate-400 dark:scrollbar-thumb-zinc-600 touch-pan-x -mx-1 px-1">
          <div className="flex gap-2 flex-nowrap min-w-min">
            <button type="button" onClick={() => setView('play')} className={tabClass('play')}>Play</button>
            <button type="button" onClick={() => setView('rankings')} className={tabClass('rankings')}>Rankings</button>
            {(isHS || isInCollege) && (
              <button type="button" onClick={() => setView('college')} className={tabClass('college')}>
                College {state.pendingCollegeChoice ? ' (pick now)' : ''}
              </button>
            )}
            <button type="button" onClick={() => setView('relationships')} className={tabClass('relationships')}>Relationships</button>
            <button type="button" onClick={() => setView('trophies')} className={tabClass('trophies')}>Trophies</button>
            <button type="button" onClick={() => setView('schedule')} className={tabClass('schedule')}>Schedule</button>
            <button type="button" onClick={() => setView('lifestyle')} className={tabClass('lifestyle')}>Lifestyle</button>
            {isInCollege && <button type="button" onClick={() => setView('team')} className={tabClass('team')}>Team</button>}
            <button type="button" onClick={() => setView('settings')} className={tabClass('settings')}>Settings</button>
          </div>
        </div>

        {/* College choice: show on every tab when you've graduated so you can always pick */}
        {state.pendingCollegeChoice && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 dark:border-amber-400 p-4">
            <h3 className="text-amber-800 dark:text-amber-200 font-bold text-lg mb-1">Choose your college</h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mb-4">You&apos;ve graduated. Everyone gets offers (D1 to JUCO depending on how you did). Pick a school and click <strong>Accept</strong> to commit — that&apos;s how you advance. You can negotiate for more scholarship or NIL first.</p>
            <div className="space-y-3">
              {getCollegeOffers().length === 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">Pick a college to advance. You can&apos;t go to the next week until you commit to a school. If no offers appear, refresh the page.</p>
              ) : (
                getCollegeOffers().map((offer) => (
                  <div key={offer.id} className="rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 p-3">
                    <div className="font-medium text-slate-900 dark:text-white">{offer.schoolName}</div>
                    <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1">
                      {offer.division} · Tuition {offer.tuitionCoveredPct}% · NIL ${offer.nilAnnual}/yr · Housing ${offer.housingStipend} · Meals {offer.mealPlanPct}%
                      {offer.guaranteedStarter && ' · Guaranteed starter'}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => acceptOffer(offer.schoolId)}
                        className="rounded-lg bg-green-600 dark:bg-green-500 text-white px-3 py-2 text-sm font-medium hover:bg-green-500 dark:hover:bg-green-400 touch-manipulation"
                      >
                        Accept — go here
                      </button>
                      <button
                        type="button"
                        onClick={() => { const r = negotiateOffer(offer.schoolId, { moreTuition: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'tuition', success: r.success }); }}
                        className={`rounded-lg px-3 py-2 text-sm touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500'}`}
                      >
                        {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'Increased!' : 'No change') : 'Ask for more scholarship'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { const r = negotiateOffer(offer.schoolId, { moreNIL: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'nil', success: r.success }); }}
                        className={`rounded-lg px-3 py-2 text-sm touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500'}`}
                      >
                        {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'Increased!' : 'No change') : 'Ask for more NIL'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === 'play' && (
          <>
            {(() => {
              const next = engine.getNextEvent();
              return next ? (
                <div className="rounded-lg bg-slate-200/80 dark:bg-zinc-800/60 border border-slate-300 dark:border-zinc-600 px-4 py-2">
                  <p className="text-sm text-slate-600 dark:text-zinc-400">
                    <span className="font-medium text-slate-700 dark:text-zinc-300">Up next:</span> Week {next.week} · {next.label}
                  </p>
                </div>
              ) : null;
            })()}
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
                {state.lastWeekEconomy && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
                    Finances: +${state.lastWeekEconomy.income.total} income, −${state.lastWeekEconomy.expenses.total} expenses
                    {state.lastWeekEconomy.expenses.lifestyle != null && state.lastWeekEconomy.expenses.lifestyle > 0 ? ` ($${state.lastWeekEconomy.expenses.lifestyle} lifestyle)` : ''}
                    → Balance ${state.lastWeekEconomy.balance}
                  </p>
                )}
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

            {(offseasonEvents.length > 0 || (state.week === 27 || state.week === 28 || state.week === 36 || state.week === 37) || (isInCollege && (state.week === 18 || state.week === 22))) && (
              <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
                <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">{isInCollege ? 'College offseason' : 'Offseason events'}</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mb-2">{isInCollege ? 'US Open (week 18) qualifies you for World Championship (week 22). Each once per year.' : 'Fargo, Super 32, WNO — high school only. Each tournament once per year.'}</p>
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
                {state.week === 37 && !isInCollege && !offseasonEvents.some((e) => e.key === 'wno') && (
                  <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">Who&apos;s Number One: Not invited (need Recruiting 68+).</p>
                )}
                {isInCollege && state.week === 22 && !state.qualifiedForWorldChampionshipThisYear && !offseasonEvents.some((e) => e.key === 'world_championship') && (
                  <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">World Championship: Qualify by placing 1st or 2nd at US Open (week 18).</p>
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
              disabled={!getCanAdvanceWeek()}
              className="w-full sm:w-auto rounded-lg bg-blue-600 dark:bg-blue-500 py-4 sm:py-3 px-6 min-h-[52px] font-semibold text-white hover:bg-blue-500 dark:hover:bg-blue-400 active:bg-blue-700 dark:active:bg-blue-600 disabled:opacity-50 disabled:pointer-events-none touch-manipulation"
            >
              {getCanAdvanceWeek() ? 'Next week →' : state.transferPortalActive ? 'Resolve transfer in College tab to advance' : 'Pick a college above to advance'}
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

        {view === 'college' && (
          <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
            <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-lg mb-4">College</h3>
            {isInCollege ? (
              <>
                {state.transferPortalActive ? (
                  <div className="space-y-4">
                    <h4 className="text-amber-700 dark:text-amber-300 font-semibold">Transfer portal</h4>
                    <p className="text-sm text-slate-600 dark:text-zinc-400">You&apos;re in the portal. Pick a school to transfer to or withdraw to stay.</p>
                    {getTransferOffers().length === 0 ? (
                      <p className="text-sm text-amber-600 dark:text-amber-400">No offers yet. Withdraw to stay at {state.collegeName}.</p>
                    ) : (
                      <ul className="space-y-3">
                        {getTransferOffers().map((offer) => (
                          <li key={offer.id} className="rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <span className="text-sm font-medium text-slate-900 dark:text-white">{offer.schoolName}</span>
                              <span className="text-xs text-slate-500 dark:text-zinc-400">{offer.division}</span>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-zinc-400 mb-2">
                              Tuition {offer.tuitionCoveredPct}% · NIL ${offer.nilAnnual}/yr · Housing ${offer.housingStipend} · Meals {offer.mealPlanPct}%
                              {offer.guaranteedStarter && ' · Guaranteed starter'}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => acceptTransfer(offer.schoolId)} className="rounded-lg bg-green-600 dark:bg-green-500 text-white px-3 py-1.5 text-sm font-medium min-h-[44px] touch-manipulation">Accept — transfer here</button>
                              <button
                                type="button"
                                onClick={() => { const r = negotiateTransferOffer(offer.schoolId, { moreTuition: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'tuition', success: r.success }); }}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium min-h-[44px] touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500'}`}
                              >
                                {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'Increased!' : 'No change') : 'Negotiate: more scholarship'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { const r = negotiateTransferOffer(offer.schoolId, { moreNIL: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'nil', success: r.success }); }}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium min-h-[44px] touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500'}`}
                              >
                                {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'Increased!' : 'No change') : 'Negotiate: more NIL'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" onClick={() => withdrawFromTransferPortal()} className="rounded-lg bg-slate-400 dark:bg-zinc-600 text-white px-3 py-2 text-sm font-medium min-h-[44px] touch-manipulation">Withdraw from portal</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-slate-700 dark:text-zinc-300">You&apos;re at <strong>{state.collegeName ?? 'your school'}</strong> ({state.league}).</p>
                      {typeof state.eligibilityYearsRemaining === 'number' && (
                        <p className="text-sm text-slate-500 dark:text-zinc-500 mt-2">Eligibility: <strong>{state.eligibilityYearsRemaining}</strong> year{state.eligibilityYearsRemaining !== 1 ? 's' : ''} remaining</p>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-600">
                      <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">Transfer portal</h4>
                      <p className="text-sm text-slate-600 dark:text-zinc-400 mb-2">Enter the transfer portal to explore offers from other schools. You must pick a new school or withdraw before advancing.</p>
                      <button type="button" onClick={() => enterTransferPortal()} disabled={!canEnterTransferPortal()} className="rounded-lg bg-amber-500 dark:bg-amber-600 text-amber-950 dark:text-white px-3 py-2 text-sm font-medium min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed">Enter transfer portal</button>
                      {!canEnterTransferPortal() && (state.eligibilityYearsRemaining ?? 0) <= 0 && <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">No eligibility left — transfer not available.</p>}
                    </div>
                  </>
                )}
              </>
            ) : state.pendingCollegeChoice ? (
              <>
                <p className="text-slate-700 dark:text-zinc-300 mb-4">You&apos;ve graduated. Everyone gets offers from D1 down to JUCO based on your recruiting. Pick a school and click <strong>Accept</strong> to commit — that&apos;s how you advance. You can negotiate scholarship or NIL first.</p>
                {getCollegeOffers().length === 0 ? (
                  <p className="text-amber-700 dark:text-amber-300">Pick a college to advance. You can&apos;t go to the next week until you commit. If no offers appear, refresh the page.</p>
                ) : (
                  <div className="space-y-4">
                    {getCollegeOffers().map((offer) => (
                      <div key={offer.id} className="rounded-lg bg-white dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-600 p-4">
                        <div className="font-semibold text-lg text-slate-900 dark:text-white mb-1">{offer.schoolName}</div>
                        <div className="text-sm text-slate-500 dark:text-zinc-500 mb-3">
                          {offer.division} · Tuition covered {offer.tuitionCoveredPct}% · NIL ${offer.nilAnnual}/yr · Housing ${offer.housingStipend} · Meals {offer.mealPlanPct}%
                          {offer.guaranteedStarter && ' · Guaranteed starter'}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => { acceptOffer(offer.schoolId); setNegotiationFeedback(null); }}
                            className="rounded-lg bg-green-600 dark:bg-green-500 text-white px-4 py-2.5 text-sm font-semibold hover:bg-green-500 dark:hover:bg-green-400 touch-manipulation"
                          >
                            Accept — commit here
                          </button>
                          <button
                            type="button"
                            onClick={() => { const r = negotiateOffer(offer.schoolId, { moreTuition: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'tuition', success: r.success }); }}
                            className={`rounded-lg px-4 py-2.5 text-sm font-medium touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-amber-500 dark:bg-amber-600 text-white hover:bg-amber-600 dark:hover:bg-amber-500'}`}
                          >
                            {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'Increased!' : 'No change') : 'Negotiate: more scholarship'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { const r = negotiateOffer(offer.schoolId, { moreNIL: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'nil', success: r.success }); }}
                            className={`rounded-lg px-4 py-2.5 text-sm font-medium touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-amber-500 dark:bg-amber-600 text-white hover:bg-amber-600 dark:hover:bg-amber-500'}`}
                          >
                            {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'Increased!' : 'No change') : 'Negotiate: more NIL'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="text-slate-600 dark:text-zinc-400">
                  You&apos;re in high school. When you graduate (age 18), you&apos;ll get college offers and pick your school here. You can negotiate scholarship and NIL before committing.
                </p>
                <p className="text-sm text-slate-500 dark:text-zinc-500 mt-2">Recruiting score: <strong>{state.recruitingScore}</strong> — improve with grades, wins, and placements.</p>
              </div>
            )}
          </div>
        )}

        {state.transferPortalActive && !state.pendingCollegeChoice && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 dark:border-amber-400 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">You&apos;re in the transfer portal. Go to the <button type="button" onClick={() => setView('college')} className="underline font-semibold">College</button> tab to pick a new school or withdraw — you can&apos;t advance until you do.</p>
          </div>
        )}

        {view === 'rankings' && (() => {
          const weightClasses = UnifiedEngine.getWeightClasses(state.league);
          const rawViewing = viewingWeightClass ?? state.weightClass;
          const currentViewing = weightClasses.includes(rawViewing) ? rawViewing : (state.weightClass ?? weightClasses[0]);
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
              <p className="text-xs text-slate-500 dark:text-zinc-500 mb-2">Rankings by season record (W–L), then rating. Your weight: {state.weightClass} lbs.</p>
              {(!data || !Array.isArray(data)) ? (
                <p className="text-slate-500 dark:text-zinc-500">No rankings for this weight.</p>
              ) : (
                <>
                  {isYourWeight && (
                    <p className="text-sm text-zinc-400 mb-2">Your rank: #{data.playerRank ?? '—'} (rating {data.playerRating ?? state.overallRating}, record {state.stats.seasonWins}-{state.stats.seasonLosses})</p>
                  )}
                  <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[200px]">
                    <thead>
                      <tr className="text-slate-500 dark:text-zinc-500">
                        <th className="text-left">#</th>
                        <th className="text-left">Name</th>
                        <th className="text-left">Record</th>
                        <th className="text-left">Overall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 10).map((row, i) => {
                        const r = row as { rank: number; name: string; overall: number; record?: string };
                        const isYou = r.name === state.name;
                        const playerRank = data.playerRank ?? 0;
                        const playerRating = data.playerRating ?? state.overallRating ?? 0;
                        const goodEnough = isYou && (playerRank <= 5 || playerRating >= 70);
                        const rowClass = isYou ? (goodEnough ? 'text-green-600 dark:text-green-400 font-medium' : 'text-blue-600 dark:text-blue-400 font-medium') : '';
                        return (
                          <tr key={i} className={rowClass}>
                            <td>{r.rank}</td>
                            <td>{r.name}</td>
                            <td>{r.record ?? '—'}</td>
                            <td>{r.overall}</td>
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
            <p className="text-slate-600 dark:text-zinc-400 text-sm mb-2">You are on week <span className="text-blue-600 dark:text-blue-400 font-semibold">{state.week}</span> of 52 · {isInCollege ? 'College season' : engine.getHSPhaseForWeek(state.week ?? 1)}</p>
            <div className="overflow-x-auto -mx-1 pb-2 touch-pan-x">
            <div className="grid grid-cols-7 gap-1.5 max-w-4xl mb-2 min-w-[280px]">
              {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
                const isCurrent = w === (state.week ?? 1);
                const phase = isInCollege ? (w <= 7 ? 'Season' : w === 8 ? 'Conference' : w === 12 ? 'NCAA' : '') : engine.getHSPhaseForWeek(w);
                const entry = isInCollege ? engine.getCollegeScheduleEntry(w) : engine.getHSScheduleEntry(w);
                const displayLabel = engine.getScheduleDisplayLabel(w);
                const title = entry?.type === 'dual' ? `Week ${w}: Dual vs ${(entry as { opponentName?: string }).opponentName}` : entry?.type === 'tournament' ? `Week ${w}: ${(entry as { tournamentName?: string }).tournamentName ?? 'Tournament'}` : entry?.type === 'rival' ? `Week ${w}: Rival` : displayLabel ? `Week ${w}: ${displayLabel}` : `Week ${w}: ${phase}`;
                return (
                  <div
                    key={w}
                    className={`
                      min-w-[2.5rem] w-10 sm:min-w-[3.5rem] sm:w-14 rounded flex flex-col items-center justify-center py-1 px-0.5 text-xs font-medium border shrink-0
                      ${isCurrent
                        ? 'bg-blue-600 dark:bg-blue-500 border-blue-500 dark:border-blue-400 text-white ring-2 ring-blue-400 dark:ring-blue-300'
                        : 'bg-slate-300 dark:bg-zinc-700/80 border-slate-400 dark:border-zinc-600 text-slate-600 dark:text-zinc-400'}
                    `}
                    title={title}
                  >
                    <span className="font-semibold">{w}</span>
                    {displayLabel ? <span className="text-[9px] sm:text-[10px] opacity-90 leading-tight text-center truncate w-full mt-0.5" title={displayLabel}>{displayLabel}</span> : null}
                  </div>
                );
              })}
            </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-500">
              {isInCollege ? 'Duals and tournaments show opponent/tournament name. Weeks 1–7 regular, 8 Conference, 12 NCAA.' : 'Duals and tournaments show opponent or event name. Weeks 9–20 Offseason, 21–30 Summer (Fargo 27–28), 31–38 Preseason, 39–49 Regular, 50 Districts, 51 State, 52 Wrap.'}
            </p>
          </div>
        )}

        {view === 'lifestyle' && (
          <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4 max-w-lg">
            <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-lg mb-1">Lifestyle</h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mb-4">Spend money on housing, a car, meal plans, and recovery gear. Better lifestyle costs more each week but improves performance, recovery, and stress.</p>
            <div className="flex flex-wrap gap-4 mb-4 p-3 rounded-lg bg-slate-200/80 dark:bg-zinc-700/80">
              <span className="font-medium text-slate-800 dark:text-zinc-200">Cash: <span className="text-green-600 dark:text-green-400">${state.money}</span></span>
              <span className="text-slate-600 dark:text-zinc-400">Weekly lifestyle cost: <span className="font-medium">${engine.getLifestyleWeeklyCost()}</span></span>
            </div>
            <div className="space-y-4">
              {engine.getLifestyleOptions().map((opt) => {
                const catLabel = opt.category === 'housing' ? 'Housing' : opt.category === 'car' ? 'Car' : opt.category === 'mealPlan' ? 'Meal plan' : 'Recovery equipment';
                return (
                  <div key={opt.category} className="rounded-lg border border-slate-200 dark:border-zinc-600 p-3 bg-white dark:bg-zinc-800/50">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <h4 className="text-sm font-medium text-slate-700 dark:text-zinc-300">{catLabel}</h4>
                      <span className="text-sm text-slate-600 dark:text-zinc-400">Current: <strong>{opt.current}</strong>{opt.currentWeekly != null && opt.currentWeekly > 0 ? ` · $${opt.currentWeekly}/wk` : ''}</span>
                    </div>
                    {opt.nextUpgrade ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-slate-600 dark:text-zinc-400">Upgrade to <strong>{opt.nextUpgrade.label}</strong></span>
                        {opt.nextUpgrade.oneTimeCost != null && opt.nextUpgrade.oneTimeCost > 0 && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">${opt.nextUpgrade.oneTimeCost} one-time</span>
                        )}
                        {opt.nextUpgrade.weeklyCost != null && opt.nextUpgrade.weeklyCost > 0 && (
                          <span className="text-xs text-slate-500 dark:text-zinc-500">${opt.nextUpgrade.weeklyCost}/wk</span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const tier = opt.nextUpgrade!.tier;
                            if (opt.category === 'car' || opt.category === 'recoveryEquipment') {
                              const r = purchaseLifestyle(opt.category, tier as CarTier | RecoveryTier);
                              if (!r.success) alert(r.message);
                            } else {
                              const r = upgradeLifestyleWeekly(opt.category, tier as HousingTier | MealPlanTier);
                              if (!r.success) alert(r.message);
                            }
                          }}
                          className="rounded-lg bg-blue-600 dark:bg-blue-500 text-white px-3 py-1.5 text-sm font-medium min-h-[44px] touch-manipulation disabled:opacity-50"
                          disabled={(opt.nextUpgrade.oneTimeCost != null && (state.money ?? 0) < opt.nextUpgrade.oneTimeCost) || (opt.nextUpgrade.weeklyCost != null && (state.money ?? 0) < (opt.nextUpgrade.weeklyCost ?? 0))}
                        >
                          {opt.category === 'car' || opt.category === 'recoveryEquipment' ? 'Buy' : 'Upgrade'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-zinc-500">Max tier.</p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-500 mt-4">Housing and meal plan charge weekly. Car and recovery equipment are one-time purchases. Last week&apos;s expenses (including lifestyle) appear in the week summary after you advance.</p>
          </div>
        )}

        {view === 'team' && isInCollege && (
          <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4">
            <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-lg mb-2">{state.collegeName ?? 'Team'} · Lineup</h3>
            {!(state.collegeRoster ?? []).length ? (
              <p className="text-slate-600 dark:text-zinc-400 text-sm">Roster will appear after you advance a week.</p>
            ) : (
              <>
                <p className="text-slate-600 dark:text-zinc-400 text-sm mb-4">Your weight: {state.weightClass} lbs. {engine.isCollegeStarter() ? 'You are the starter at your weight for duals.' : "You're the backup — you don't start in duals until you're the best at your weight."}</p>
                <div className="space-y-4">
                  {Array.from(new Set((state.collegeRoster ?? []).map((r) => r.weightClass))).sort((a, b) => a - b).map((wc) => {
                const atWeight = (state.collegeRoster ?? []).filter((r) => r.weightClass === wc).sort((a, b) => b.overallRating - a.overallRating);
                const isMyWeight = wc === state.weightClass;
                return (
                  <div key={wc} className={`rounded-lg border p-3 ${isMyWeight ? 'border-blue-500 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-950/30' : 'border-slate-200 dark:border-zinc-600'}`}>
                    <h4 className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-2">{wc} lbs</h4>
                    <ul className="space-y-1">
                      {atWeight.map((r, i) => (
                        <li key={r.id} className={`flex justify-between text-sm ${r.isPlayer ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-600 dark:text-zinc-400'}`}>
                          <span>{r.name}{r.isPlayer ? ' (you)' : ''}</span>
                          <span>{r.overallRating} {i === 0 ? '· Starter' : '· Backup'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
                </div>
              </>
            )}
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
              <button type="button" onClick={() => setTipsOpen(!tipsOpen)} className="flex items-center justify-between w-full text-left">
                <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300">How to play / Tips &amp; tricks</h4>
                <span className="text-slate-500 dark:text-zinc-400">{tipsOpen ? '▼' : '▶'}</span>
              </button>
              {tipsOpen && (
                <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-zinc-400">
                  <p className="font-medium text-slate-700 dark:text-zinc-300">Basics</p>
                  <ul className="list-disc list-inside space-y-1 pl-1">
                    <li>Spend <strong>hours</strong> each week on Train, Study, Compete, Rest, or Relationships. Hours reset every week.</li>
                    <li>Keep <strong>grades</strong> up for college options; <strong>conditioning</strong> affects match performance and decays if you don&apos;t train.</li>
                    <li>Rest and Rehab don&apos;t reduce conditioning; only skipping training does.</li>
                  </ul>
                  <p className="font-medium text-slate-700 dark:text-zinc-300 mt-3">High school</p>
                  <ul className="list-disc list-inside space-y-1 pl-1">
                    <li>Win matches and place at state to boost your <strong>recruiting score</strong>. Better score = better college offers at graduation.</li>
                    <li>Fargo, Super 32, and Who&apos;s Number One are offseason events — do them to improve recruiting.</li>
                    <li>At age 18 you graduate and get college offers. You must pick a school to advance; negotiate for more scholarship or NIL first if you want.</li>
                  </ul>
                  <p className="font-medium text-slate-700 dark:text-zinc-300 mt-3">College</p>
                  <ul className="list-disc list-inside space-y-1 pl-1">
                    <li>College uses <strong>NCAA weight classes</strong> (125–285). Your weight and rankings switch to college weights when you commit.</li>
                    <li><strong>US Open</strong> (week 18) is the college offseason event; place 1st or 2nd to qualify for <strong>World Championship</strong> (week 22).</li>
                    <li>Eligibility runs out after 4 years (or when you run out of years). Use the <strong>transfer portal</strong> on the College tab to change schools if you have eligibility left.</li>
                    <li>In the portal you get offers from other schools; negotiate for more scholarship or NIL, then accept one to transfer or withdraw to stay.</li>
                  </ul>
                </div>
              )}
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
