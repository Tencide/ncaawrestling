'use client';

import { useState, useRef, useEffect } from 'react';
import { useGame } from '@/ui/context/GameContext';
import type { HousingTier, CarTier, MealPlanTier, RecoveryTier, BracketParticipant } from '@/engine/unified/types';
import { saveGame } from '@/db/persistence';
import { UnifiedEngine } from '@/engine/unified/UnifiedEngine';
import type { ExchangeLogEntry } from '@/engine/MatchMinigame';
import { DECISION_TIMER_SECONDS } from '@/engine/MatchMinigame';

export function UnifiedGameLayout() {
  const { state, engine, applyChoice, applyRelationshipAction, advanceWeek, advanceWeeks, autoTrainOnAdvance, setAutoTrainOnAdvance, runOffseasonEvent, getCollegeOffers, getSchools, requestCollegeOffer, getCanAdvanceWeek, acceptOffer, negotiateOffer, canEnterTransferPortal, enterTransferPortal, getTransferOffers, requestTransferOffer, negotiateTransferOffer, acceptTransfer, withdrawFromTransferPortal, purchaseLifestyle, upgradeLifestyleWeekly, purchaseCustomItem, getPendingLifePopups, resolveLifePopup, getLifeLog, playCompetitionAction, getPendingTournamentPlay, startTournamentPlay, simulateTournamentBracket, simulatePendingCompetitionMatch, choosePostCollegeOption, setWeightClass, goToCreate } = useGame();
  const [view, setView] = useState<'play' | 'rankings' | 'trophies' | 'schedule' | 'settings' | 'relationships' | 'team' | 'college' | 'lifestyle' | 'life'>('play');
  const [playActionTab, setPlayActionTab] = useState<'training' | 'school' | 'relationship'>('training');
  const [navExpanded, setNavExpanded] = useState(false);
  const [leftBarOpen, setLeftBarOpen] = useState(false);
  const [negotiationFeedback, setNegotiationFeedback] = useState<{ schoolId: string; kind: 'tuition' | 'nil'; success: boolean; message?: string } | null>(null);
  const [requestOfferMessage, setRequestOfferMessage] = useState<string | null>(null);
  const [requestTransferMessage, setRequestTransferMessage] = useState<string | null>(null);
  const [viewingWeightClass, setViewingWeightClass] = useState<number | null>(null);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [lastOffseasonBracket, setLastOffseasonBracket] = useState<{ name: string; participants: BracketParticipant[] } | null>(null);
  const prevWeekRef = useRef<number | undefined>(undefined);
  const [tournamentRevealCount, setTournamentRevealCount] = useState<number>(0);
  const pendingComp = state?.pendingCompetition ?? null;
  const [exchangeTimerLeft, setExchangeTimerLeft] = useState<number>(pendingComp?.current?.timerSeconds ?? DECISION_TIMER_SECONDS);
  const [autoFiredKey, setAutoFiredKey] = useState<string | null>(null);
  const fmtNIL = (n: number) => n >= 1000 ? (n >= 1_000_000 ? `${Math.round(n / 1_000_000)}M` : `${Math.round(n / 1000)}K`) : n.toLocaleString();
  const fmtOfferType = (t?: string) => { switch (t) { case 'full': return 'Full scholarship'; case 'partial': return 'Partial'; case 'preferred_walkon': return 'Preferred walk-on'; case 'walkon': return 'Walk-on'; default: return 'Full'; } };

  /** One-line summary of an exchange for the match log. */
  function formatExchangeLogEntry(e: ExchangeLogEntry): string {
    const p = `P${e.period} ${e.position}`;
    if (e.timedOut) {
      const them = e.pointsAgainst > 0 ? ` Opponent scores ${e.pointsAgainst}.` : '';
      return `${p}: You hesitated (timer).${them}`;
    }
    if (e.success) {
      const you = e.pointsFor > 0 ? ` You score ${e.pointsFor}.` : '';
      return `${p}: ${e.actionLabel} — success.${you}`;
    }
    const them = e.pointsAgainst > 0 ? ` Opponent scores ${e.pointsAgainst}.` : ' They defend.';
    return `${p}: ${e.actionLabel} — no.${them}`;
  }

  useEffect(() => {
    if (state) saveGame(state);
  }, [state]);

  // Reset exchange timer whenever a new exchange prompt is shown
  useEffect(() => {
    if (!pendingComp?.current) return;
    const key = `${pendingComp.current.id}_${pendingComp.current.matchState.period}_${pendingComp.current.prompt.prompt}`;
    setExchangeTimerLeft(pendingComp.current.timerSeconds ?? DECISION_TIMER_SECONDS);
    setAutoFiredKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingComp?.current?.id, pendingComp?.current?.matchState?.period, pendingComp?.current?.prompt?.prompt]);

  // Countdown + auto-hesitate on timeout
  useEffect(() => {
    if (!pendingComp?.current) return;
    const key = `${pendingComp.current.id}_${pendingComp.current.matchState.period}_${pendingComp.current.prompt.prompt}`;
    if (exchangeTimerLeft <= 0) {
      if (autoFiredKey === key) return;
      setAutoFiredKey(key);
      playCompetitionAction('hesitate', { timedOut: true });
      return;
    }
    const t = window.setTimeout(() => setExchangeTimerLeft((x) => x - 1), 1000);
    return () => window.clearTimeout(t);
  }, [pendingComp?.current, exchangeTimerLeft, autoFiredKey, playCompetitionAction]);

  useEffect(() => {
    if (state?.week != null && prevWeekRef.current !== state.week) {
      prevWeekRef.current = state.week;
      setLastOffseasonBracket(null);
      setTournamentRevealCount(0);
    }
  }, [state?.week]);

  useEffect(() => {
    // Reset tournament mini-game reveal when a new week summary arrives
    if (!state?.lastWeekSummary || state.lastWeekSummary.eventType !== 'tournament') {
      setTournamentRevealCount(0);
      return;
    }
    // Start at 0 revealed matches whenever the tournament summary changes
    setTournamentRevealCount(0);
  }, [state?.lastWeekSummary?.week, state?.lastWeekSummary?.year, state?.lastWeekSummary?.eventType]);

  useEffect(() => {
    setViewingWeightClass(null);
  }, [state?.seed, state?.weightClass]);

  useEffect(() => {
    if (state?.pendingCollegeChoice) setView('college');
  }, [state?.pendingCollegeChoice]);
  useEffect(() => {
    if (state?.pendingCollegeGraduation || state?.careerEnded) setView('play');
  }, [state?.pendingCollegeGraduation, state?.careerEnded]);

  if (!state || !engine) return null;

  function LeftBarContent({ gameState }: { gameState: NonNullable<typeof state> }) {
    return (
      <>
        <div>
          <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{gameState.name}</div>
          <div className="text-xs text-slate-500 dark:text-zinc-500">Age {gameState.age} · Week {gameState.week ?? 1} Year {gameState.year}</div>
          <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">{gameState.overallRating}</div>
          <div className="text-xs text-slate-600 dark:text-zinc-400">{gameState.league.replace(/_/g, ' ')} · {gameState.weightClass} lbs</div>
          {typeof gameState.eligibilityYearsRemaining === 'number' && (
            <div className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">Eligibility: {gameState.eligibilityYearsRemaining} year{gameState.eligibilityYearsRemaining !== 1 ? 's' : ''} left</div>
          )}
        </div>
        <div className="text-xs">
          <div className="text-slate-500 dark:text-zinc-500 mb-1">Attributes</div>
          <div>Tech {gameState.technique} · IQ {gameState.matIQ} · Cond {gameState.conditioning}</div>
          <div>Str {gameState.strength} · Spd {gameState.speed} · Flex {gameState.flexibility}</div>
        </div>
        <div className="text-xs">
          <div className="text-slate-500 dark:text-zinc-500 mb-1">Meters</div>
          <div>Energy {gameState.energy} · Health {gameState.health} · Stress {gameState.stress}</div>
          <div>Happiness {gameState.happiness} · Grades {gameState.grades}</div>
        </div>
        <div className="text-xs">
          <div className="text-slate-500 dark:text-zinc-500 mb-1">Record</div>
          <div>Season: {gameState.stats.seasonWins}-{gameState.stats.seasonLosses}</div>
          <div>Career: {gameState.stats.matchesWon}-{gameState.stats.matchesLost}</div>
        </div>
        <div className="text-xs">
          <div className="text-slate-500 dark:text-zinc-500 mb-1">Money</div>
          <div className="text-green-600 dark:text-green-400">${gameState.money}</div>
          <div className="text-slate-500 dark:text-zinc-500">Recruiting: {gameState.recruitingScore}</div>
        </div>
      </>
    );
  }

  const isInCollege = !['HS_JV', 'HS_VARSITY', 'HS_ELITE'].includes(state.league);
  const isHS = !isInCollege;
  const choices = engine.getChoices();
  const offseasonEvents = engine.getOffseasonEvents();
  const hoursLeft = state.hoursLeftThisWeek ?? 40;

  const tabClass = (v: typeof view) =>
    `min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium touch-manipulation ${view === v ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-slate-300 dark:bg-zinc-700 text-slate-700 dark:text-zinc-400 active:bg-slate-400 dark:active:bg-zinc-600'}`;
  const viewLabels: Record<typeof view, string> = { play: 'Play', rankings: 'Rankings', trophies: 'Trophies', schedule: 'Schedule', settings: 'Settings', relationships: 'Relationships', team: 'Team', college: 'College', lifestyle: 'Lifestyle', life: 'Life' };
  const pendingPopups = getPendingLifePopups();
  const currentPopup = pendingPopups[0];
  const lifeLog = getLifeLog();

  return (
    <div className="flex flex-col md:flex-row h-screen max-h-[100dvh] bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-200 overflow-hidden">
      {/* BitLife-style life popup modal */}
      {currentPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-labelledby="life-popup-title">
          <div className="rounded-xl bg-slate-100 dark:bg-zinc-800 border-2 border-slate-300 dark:border-zinc-600 shadow-2xl max-w-md w-full p-5 flex flex-col gap-4">
            <h2 id="life-popup-title" className="text-sm font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
              {currentPopup.category.replace(/_/g, ' · ')}
            </h2>
            <p className="text-slate-800 dark:text-zinc-200 text-base leading-relaxed">{currentPopup.text}</p>
            <div className="flex flex-col gap-2">
              {currentPopup.choices.map((choice, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => resolveLifePopup(currentPopup.id, i)}
                  className="rounded-lg bg-slate-300 dark:bg-zinc-600 hover:bg-blue-500 dark:hover:bg-blue-600 text-slate-900 dark:text-zinc-100 px-4 py-3 text-left text-sm font-medium transition-colors touch-manipulation"
                >
                  {choice.label}
                </button>
              ))}
            </div>
            {pendingPopups.length > 1 && (
              <p className="text-xs text-slate-500 dark:text-zinc-400">{pendingPopups.length - 1} more this week</p>
            )}
          </div>
        </div>
      )}

      {/* Interactive competition modal (3 exchanges per match) */}
      {pendingComp?.current && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true" aria-labelledby="match-popup-title">
          <div className="rounded-xl bg-white dark:bg-zinc-900 border-2 border-slate-300 dark:border-zinc-700 shadow-2xl max-w-xl w-full p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="match-popup-title" className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
                  {pendingComp.phaseLabel}
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {pendingComp.current.roundLabel} · vs <span className="font-medium text-slate-700 dark:text-zinc-200">{pendingComp.current.opponent.name}</span> ({Math.round(pendingComp.current.opponent.overallRating)})
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-zinc-400">Decision timer</div>
                <div className={`text-lg font-bold ${exchangeTimerLeft <= 2 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {Math.max(0, exchangeTimerLeft)}s
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-zinc-200">
                  Period {pendingComp.current.matchState.period} · {pendingComp.current.matchState.position}
                </span>
                <span className="text-slate-600 dark:text-zinc-300">
                  Score: <span className="font-semibold">{pendingComp.current.matchState.myScore}</span>-<span className="font-semibold">{pendingComp.current.matchState.oppScore}</span>
                </span>
                <span className="text-slate-600 dark:text-zinc-300">
                  Energy: <span className="font-semibold">{Math.round(pendingComp.current.matchState.my.energy)}</span>
                </span>
              </div>
              <p className="text-sm text-slate-700 dark:text-zinc-200 mt-2">{pendingComp.current.prompt.prompt}</p>
            </div>

            {pendingComp.current.matchState.logs.length > 0 && (
              <div className="rounded-lg bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-zinc-400 mb-1.5">Match log</p>
                <ul className="text-xs text-slate-700 dark:text-zinc-300 space-y-1 max-h-28 overflow-y-auto">
                  {pendingComp.current.matchState.logs.map((entry, i) => (
                    <li key={i} className="leading-tight">
                      <span>{formatExchangeLogEntry(entry)}</span>
                      {entry.notes && entry.notes.length > 0 && (
                        <span className="block text-slate-500 dark:text-zinc-500 mt-0.5 pl-2 border-l-2 border-slate-300 dark:border-zinc-600">
                          {entry.notes.join(' ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pendingComp.current.prompt.options.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => playCompetitionAction(opt.key)}
                  className="rounded-lg bg-slate-200 dark:bg-zinc-700 hover:bg-blue-600 dark:hover:bg-blue-500 text-slate-900 dark:text-zinc-100 px-4 py-3 text-left text-sm font-medium transition-colors touch-manipulation"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{opt.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-zinc-300">{opt.risk}</span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-zinc-300 mt-1">{opt.description}</div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => simulatePendingCompetitionMatch()}
                className="rounded-lg bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500 text-slate-800 dark:text-zinc-200 px-4 py-2 text-sm font-medium touch-manipulation"
              >
                Simulate match
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              If the timer hits 0, you automatically <strong>Hesitate</strong> (momentum loss + higher chance they score).
            </p>
          </div>
        </div>
      )}

      {/* Left panel — desktop: always visible; mobile: expandable drawer */}
      <aside className="hidden md:flex w-52 shrink-0 border-r border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900/80 p-4 flex-col gap-3 overflow-y-auto">
        <LeftBarContent gameState={state} />
      </aside>

      {/* Mobile: left bar as slide-out drawer */}
      {leftBarOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" aria-hidden onClick={() => setLeftBarOpen(false)} />
          <aside className="fixed top-0 left-0 z-50 w-[min(18rem,85vw)] h-full border-r border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 shadow-xl md:hidden flex flex-col overflow-hidden">
            <div className="shrink-0 p-3 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">Stats &amp; info</span>
              <button type="button" onClick={() => setLeftBarOpen(false)} className="rounded-lg p-2 text-slate-500 dark:text-zinc-400 active:bg-slate-200 dark:active:bg-zinc-700 touch-manipulation" aria-label="Close">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <LeftBarContent gameState={state} />
            </div>
          </aside>
        </>
      )}

      {/* Mobile top bar: row 1 = menu + name/rating; row 2 = Hours, Energy, $ (no New game — in Settings) */}
      <header className="md:hidden shrink-0 border-b border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-900/95 px-3 py-2 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={() => setLeftBarOpen(true)} className="rounded-lg p-2 min-h-[40px] min-w-[40px] flex items-center justify-center bg-slate-300 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 active:bg-slate-400 dark:active:bg-zinc-600 touch-manipulation shrink-0" aria-label="Open stats">
            <span className="text-base font-bold leading-none">≡</span>
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
            <span className="text-blue-600 dark:text-blue-400 font-semibold truncate">{state.name}</span>
            <span className="text-slate-900 dark:text-white font-bold shrink-0">{state.overallRating}</span>
            <span className="text-slate-500 dark:text-zinc-500 text-xs shrink-0">{state.weightClass} lbs</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-700 dark:text-zinc-300 shrink-0">
          <span><span className="text-blue-600 dark:text-blue-400 font-medium">Hours:</span> {hoursLeft}</span>
          <span><span className="text-blue-600 dark:text-blue-400 font-medium">Energy:</span> {state.energy}</span>
          <span className="text-green-600 dark:text-green-400 font-medium">${state.money}</span>
        </div>
      </header>

      {/* Center */}
      <main className="flex-1 min-h-0 min-w-0 p-4 md:p-6 flex flex-col gap-4 overflow-y-auto overflow-x-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Nav: expandable on mobile, compact horizontal on desktop */}
        <div className="flex-shrink-0 w-full">
          {/* Mobile: menu toggle + current view; expandable list */}
          <div className="md:hidden">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNavExpanded((e) => !e)}
                className="rounded-lg bg-slate-300 dark:bg-zinc-700 min-h-[36px] px-3 py-2 text-xs font-medium touch-manipulation flex items-center gap-1.5"
                aria-expanded={navExpanded}
              >
                <span className="inline-block w-4 h-0.5 bg-current rounded" style={{ boxShadow: '0 -5px 0 currentColor, 0 5px 0 currentColor' }} />
                {viewLabels[view]}
              </button>
              {navExpanded && (
                <button type="button" onClick={() => setNavExpanded(false)} className="text-xs text-slate-500 dark:text-zinc-400">Close</button>
              )}
            </div>
            {navExpanded && (
              <div className="mt-2 p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 flex flex-wrap gap-1.5 max-h-[50vh] overflow-y-auto">
                {(['play', 'rankings', 'college', 'relationships', 'trophies', 'schedule', 'lifestyle', 'life', 'team', 'settings'] as const).filter((v) => (v !== 'college' || isHS || isInCollege) && (v !== 'team' || isInCollege)).map((v) => (
                  <button key={v} type="button" onClick={() => { setView(v); setNavExpanded(false); }} className={tabClass(v)}>
                    {v === 'college' && state.pendingCollegeChoice ? 'College (pick)' : viewLabels[v]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Desktop: horizontal scroll, smaller buttons */}
          <div className="hidden md:block overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-slate-400 dark:scrollbar-thumb-zinc-600 touch-pan-x -mx-1 px-1">
            <div className="flex gap-1.5 flex-nowrap min-w-min py-0.5">
              <button type="button" onClick={() => setView('play')} className={tabClass('play')}>Play</button>
              <button type="button" onClick={() => setView('rankings')} className={tabClass('rankings')}>Rankings</button>
              {(isHS || isInCollege) && (
                <button type="button" onClick={() => setView('college')} className={tabClass('college')}>College{state.pendingCollegeChoice ? ' *' : ''}</button>
              )}
              <button type="button" onClick={() => setView('relationships')} className={tabClass('relationships')}>Relationships</button>
              <button type="button" onClick={() => setView('trophies')} className={tabClass('trophies')}>Trophies</button>
              <button type="button" onClick={() => setView('schedule')} className={tabClass('schedule')}>Schedule</button>
              <button type="button" onClick={() => setView('lifestyle')} className={tabClass('lifestyle')}>Lifestyle</button>
              <button type="button" onClick={() => setView('life')} className={tabClass('life')}>Life</button>
              {isInCollege && <button type="button" onClick={() => setView('team')} className={tabClass('team')}>Team</button>}
              <button type="button" onClick={() => setView('settings')} className={tabClass('settings')}>Settings</button>
            </div>
          </div>
        </div>

        {/* College choice: show on every tab when you've graduated so you can always pick */}
        {state.pendingCollegeChoice && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 dark:border-amber-400 p-4">
            <h3 className="text-amber-800 dark:text-amber-200 font-bold text-lg mb-1">Choose your college</h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mb-4">You&apos;ve graduated. You have offers from some schools; you can also <strong>request interest</strong> from any school below. Pick a school and click <strong>Accept</strong> to commit — negotiate for more scholarship or NIL first if you want.</p>
            {requestOfferMessage && <p className="text-sm mb-2 text-slate-600 dark:text-zinc-400">{requestOfferMessage}</p>}
            <div className="space-y-3">
              {getCollegeOffers().length === 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">No offers yet. Request interest from schools below, or refresh the page to regenerate initial offers.</p>
              ) : (
                getCollegeOffers().map((offer) => (
                  <div key={offer.id} className="rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 p-3">
                    <div className="font-medium text-slate-900 dark:text-white">{offer.schoolName}</div>
                    <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1">
                      {offer.division} · {fmtOfferType(offer.offerType)} · Tuition {offer.tuitionCoveredPct}% · NIL ${fmtNIL(offer.nilAnnual)}/yr · Housing ${offer.housingStipend} · Meals {offer.mealPlanPct}%
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
                        onClick={() => { const r = negotiateOffer(offer.schoolId, { moreTuition: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'tuition', success: r.success, message: r.message }); }}
                        className={`rounded-lg px-3 py-2 text-sm touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500'}`}
                      >
                        {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'Increased!' : (negotiationFeedback.message ?? 'No change')) : 'Ask for more scholarship'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { const r = negotiateOffer(offer.schoolId, { moreNIL: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'nil', success: r.success, message: r.message }); }}
                        className={`rounded-lg px-3 py-2 text-sm touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500'}`}
                      >
                        {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'Increased!' : (negotiationFeedback.message ?? 'No change')) : 'Ask for more NIL'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-amber-300 dark:border-amber-600">
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Request interest from a school</h4>
              <p className="text-xs text-slate-600 dark:text-zinc-400 mb-2">Schools you already have an offer from are not listed. Click Request to ask for an offer.</p>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {['D1', 'D2', 'D3', 'NAIA', 'JUCO'].map((div) => {
                  const schools = getSchools().filter((sc) => sc.division === div);
                  const offeredIds = new Set(getCollegeOffers().map((o) => o.schoolId));
                  const canRequest = schools.filter((sc) => !offeredIds.has(sc.id));
                  if (canRequest.length === 0) return null;
                  return (
                    <div key={div} className="flex flex-wrap gap-1.5 items-center">
                      <span className="text-xs font-medium text-slate-500 dark:text-zinc-500 w-10">{div}</span>
                      {canRequest.map((sc) => (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() => { const r = requestCollegeOffer(sc.id); setRequestOfferMessage(r.message); }}
                          className="rounded-lg bg-slate-200 dark:bg-zinc-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-600 touch-manipulation"
                        >
                          {sc.name}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* College graduation: choose Olympics, Restart, or Retire (only for college grads, not HS) */}
        {state.pendingCollegeGraduation && isInCollege && (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500 dark:border-emerald-400 p-4">
            <h3 className="text-emerald-800 dark:text-emerald-200 font-bold text-lg mb-1">You&apos;ve graduated college!</h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mb-4">Choose your path:</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => choosePostCollegeOption('olympics')}
                className="rounded-lg bg-amber-500 dark:bg-amber-600 text-amber-950 dark:text-white px-4 py-3 font-semibold hover:bg-amber-600 dark:hover:bg-amber-500 touch-manipulation"
              >
                Wrestle the Olympics
              </button>
              <button
                type="button"
                onClick={() => { choosePostCollegeOption('restart'); goToCreate(); }}
                className="rounded-lg bg-blue-600 dark:bg-blue-500 text-white px-4 py-3 font-semibold hover:bg-blue-500 dark:hover:bg-blue-400 touch-manipulation"
              >
                Start a new career
              </button>
              <button
                type="button"
                onClick={() => choosePostCollegeOption('retire')}
                className="rounded-lg bg-slate-500 dark:bg-zinc-600 text-white px-4 py-3 font-semibold hover:bg-slate-600 dark:hover:bg-zinc-500 touch-manipulation"
              >
                Retire
              </button>
            </div>
          </div>
        )}

        {state.careerEnded && (
          <div className="rounded-lg bg-slate-100 dark:bg-zinc-800 border-2 border-slate-400 dark:border-zinc-600 p-4">
            <h3 className="text-slate-800 dark:text-zinc-200 font-bold text-lg mb-2">
              {state.careerEndChoice === 'olympics' ? 'Olympics bound' : 'Career over'}
            </h3>
            <p className="text-slate-700 dark:text-zinc-300 whitespace-pre-wrap mb-4">{state.story}</p>
            <button type="button" onClick={goToCreate} className="rounded-lg bg-blue-600 dark:bg-blue-500 text-white px-4 py-2.5 font-semibold hover:bg-blue-500 dark:hover:bg-blue-400 touch-manipulation">
              Start new career
            </button>
          </div>
        )}

{view === 'play' && (
            <>
            {(() => {
              const pendingTournament = getPendingTournamentPlay();
              if (pendingTournament) {
                const label = pendingTournament.phaseLabel ?? (pendingTournament.offseasonEventKey ? pendingTournament.offseasonEventKey.replace(/_/g, ' ') : 'Tournament');
                return (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 dark:border-amber-500 p-4 mb-4">
                    <h3 className="text-amber-800 dark:text-amber-200 font-semibold text-lg mb-2">Go to tournament</h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">{label} — play the bracket or simulate all matches.</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startTournamentPlay()}
                        className="rounded-lg bg-blue-600 dark:bg-blue-500 text-white px-4 py-2.5 font-semibold hover:bg-blue-500 dark:hover:bg-blue-400 touch-manipulation"
                      >
                        Play bracket
                      </button>
                      <button
                        type="button"
                        onClick={() => simulateTournamentBracket()}
                        className="rounded-lg bg-slate-300 dark:bg-zinc-600 text-slate-800 dark:text-zinc-200 px-4 py-2.5 font-semibold hover:bg-slate-400 dark:hover:bg-zinc-500 touch-manipulation"
                      >
                        Simulate bracket
                      </button>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
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
            {!engine.getCanWrestle() && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-400 dark:border-amber-500 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Academic ineligibility</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Grades are below {UnifiedEngine.getMinGradesToWrestle()}. Study to raise your grades — you can&apos;t compete until then.</p>
              </div>
            )}

            {state.lastWeekSummary && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-600/60 dark:border-blue-500/60 p-4">
                <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">Week {state.lastWeekSummary.week} summary · {state.lastWeekSummary.phase}</h3>
                {state.lastWeekSummary.eventType && (
                  <p className="text-xs text-zinc-400 mb-2">{state.lastWeekSummary.eventType === 'dual' ? 'Dual meet' : state.lastWeekSummary.eventType === 'tournament' ? 'Tournament' : state.lastWeekSummary.eventType}</p>
                )}
                {(state.lastWeekSummary.eventType === 'tournament' ||
                  state.lastWeekSummary.eventType === 'district' ||
                  state.lastWeekSummary.eventType === 'state') &&
                  state.lastWeekSummary.bracketParticipants &&
                  state.lastWeekSummary.bracketParticipants.length >= 8 && (
                  <div className="mb-3 p-2 rounded bg-slate-200/80 dark:bg-zinc-700/80">
                    {(() => {
                      const seeds = [...state.lastWeekSummary.bracketParticipants].sort((a, b) => a.seed - b.seed);
                      const is16 = seeds.length >= 16;
                      const label = is16 ? 'Bracket (16-man)' : 'Bracket (8-man)';
                      if (is16 && seeds.length >= 16) {
                        const r16 = [
                          [seeds[0], seeds[15]],
                          [seeds[7], seeds[8]],
                          [seeds[3], seeds[12]],
                          [seeds[4], seeds[11]],
                          [seeds[1], seeds[14]],
                          [seeds[6], seeds[9]],
                          [seeds[2], seeds[13]],
                          [seeds[5], seeds[10]],
                        ];
                        return (
                          <>
                            <p className="text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1.5">{label}</p>
                            <ul className="text-xs sm:text-sm text-slate-700 dark:text-zinc-200 space-y-0.5">
                              <li className="font-semibold text-slate-600 dark:text-zinc-300">R16</li>
                              {r16.map(([a, b], idx) => (
                                <li key={idx}>
                                  {a.seed}. {a.name} ({Math.round(a.overallRating)}) vs {b.seed}. {b.name} ({Math.round(b.overallRating)})
                                </li>
                              ))}
                            </ul>
                          </>
                        );
                      }
                      if (seeds.length >= 8) {
                        const qfs = [
                          [seeds[0], seeds[7]],
                          [seeds[3], seeds[4]],
                          [seeds[1], seeds[6]],
                          [seeds[2], seeds[5]],
                        ];
                        return (
                          <>
                            <p className="text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1.5">{label}</p>
                            <ul className="text-xs sm:text-sm text-slate-700 dark:text-zinc-200 space-y-0.5">
                              <li className="font-semibold text-slate-600 dark:text-zinc-300">Quarterfinals</li>
                              {qfs.map(([a, b], idx) => (
                                <li key={idx}>
                                  {a.seed}. {a.name} ({Math.round(a.overallRating)}) vs {b.seed}. {b.name} ({Math.round(b.overallRating)})
                                </li>
                              ))}
                            </ul>
                          </>
                        );
                      }
                      return <p className="text-xs font-medium text-slate-600 dark:text-zinc-300 mb-1.5">{label}</p>;
                    })()}
                  </div>
                )}
                {(state.lastWeekSummary.eventType === 'tournament' ||
                  state.lastWeekSummary.eventType === 'district' ||
                  state.lastWeekSummary.eventType === 'state') &&
                  state.lastWeekSummary.matches &&
                  state.lastWeekSummary.matches.length > 0 && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs text-slate-600 dark:text-zinc-300">
                        Tournament mini-game: {tournamentRevealCount === 0
                          ? 'Click to wrestle your first match.'
                          : `Matches shown: ${tournamentRevealCount}/${state.lastWeekSummary && state.lastWeekSummary.matches ? state.lastWeekSummary.matches.length : 0}`}
                      </p>
                      {state.lastWeekSummary &&
                        state.lastWeekSummary.matches &&
                        tournamentRevealCount < state.lastWeekSummary.matches.length && (
                        <button
                          type="button"
                          onClick={() =>
                            setTournamentRevealCount((c) =>
                              state.lastWeekSummary && state.lastWeekSummary.matches
                                ? Math.min(c + 1, state.lastWeekSummary.matches.length)
                                : c
                            )
                          }
                          className="ml-2 rounded bg-blue-600 text-white text-xs px-2 py-1 hover:bg-blue-700 active:bg-blue-800"
                        >
                          {tournamentRevealCount === 0 ? 'Go to tournament' : 'Wrestle next match'}
                        </button>
                      )}
                    </div>
                    {tournamentRevealCount > 0 && (
                      <ul className="text-sm text-slate-600 dark:text-zinc-300 space-y-1">
                        {state.lastWeekSummary.matches.slice(0, tournamentRevealCount).map((m, i) => (
                          <li key={i}>
                            {m.won ? 'W' : 'L'} vs {m.opponentName} ({Math.round(m.opponentOverall)})
                            {m.stateRank != null && ` #${m.stateRank} state`}
                            {m.nationalRank != null && ` #${m.nationalRank} nat'l`}
                            {m.method && ` — ${m.method}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {!(state.lastWeekSummary.eventType === 'tournament' ||
                  state.lastWeekSummary.eventType === 'district' ||
                  state.lastWeekSummary.eventType === 'state') &&
                  state.lastWeekSummary.matches &&
                  state.lastWeekSummary.matches.length > 0 && (
                  <ul className="text-sm text-slate-600 dark:text-zinc-300 space-y-1 mb-2">
                    {state.lastWeekSummary.matches.map((m, i) => (
                      <li key={i}>
                        {m.won ? 'W' : 'L'} vs {m.opponentName} ({Math.round(m.opponentOverall)})
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
                    Finances: +${state.lastWeekEconomy.income.total} income
                    {state.lastWeekEconomy.income.nil != null && state.lastWeekEconomy.income.nil > 0 ? ` (NIL $${state.lastWeekEconomy.income.nil})` : ''}
                    {state.lastWeekEconomy.income.partTime != null && state.lastWeekEconomy.income.partTime > 0 ? ` (part-time $${state.lastWeekEconomy.income.partTime})` : ''}
                    , −${state.lastWeekEconomy.expenses.total} expenses
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

            {lastOffseasonBracket && lastOffseasonBracket.participants.length >= 8 && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-4">
                <h3 className="text-blue-600 dark:text-blue-400 font-semibold mb-2">Bracket: {lastOffseasonBracket.name}</h3>
                {(() => {
                  const seeds = [...lastOffseasonBracket.participants].sort((a, b) => a.seed - b.seed);
                  if (seeds.length < 8) return null;
                  const qfs = [
                    [seeds[0], seeds[7]],
                    [seeds[3], seeds[4]],
                    [seeds[1], seeds[6]],
                    [seeds[2], seeds[5]],
                  ];
                  return (
                    <ul className="text-xs sm:text-sm text-slate-700 dark:text-zinc-200 space-y-0.5">
                      <li className="font-semibold text-slate-600 dark:text-zinc-300">Quarterfinals</li>
                      {qfs.map(([a, b], idx) => (
                        <li key={idx}>
                          {a.seed}. {a.name} ({Math.round(a.overallRating)}) vs {b.seed}. {b.name} ({Math.round(b.overallRating)})
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                <button type="button" onClick={() => setLastOffseasonBracket(null)} className="text-xs text-slate-500 dark:text-zinc-400 mt-2 hover:underline">Dismiss</button>
              </div>
            )}

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
                        const result = runOffseasonEvent(ev.key) as { success: boolean; eventName?: string; message?: string };
                        if (result.success) {
                          setView('play');
                          setLastOffseasonBracket(null);
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
                <>
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {(['training', 'school', 'relationship'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPlayActionTab(t)}
                        className={`min-h-[32px] px-2.5 py-1.5 rounded-lg text-xs font-medium touch-manipulation ${playActionTab === t ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-slate-300 dark:bg-zinc-700 text-slate-700 dark:text-zinc-400'}`}
                      >
                        {t === 'training' ? 'Training' : t === 'school' ? 'School' : 'Relationships'}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const tabKey = playActionTab === 'school' ? 'life' : playActionTab === 'relationship' ? 'relationship' : 'training';
                      const tabChoices = choices.filter((c) => (c as { tab?: string }).tab === tabKey);
                      if (tabChoices.length === 0) {
                        return <p className="text-slate-500 dark:text-zinc-500 text-sm">No actions in this category right now.</p>;
                      }
                      return (
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
                                className="rounded-lg bg-slate-300 dark:bg-zinc-700 px-3 py-2.5 min-h-[44px] text-sm text-left hover:bg-blue-600 dark:hover:bg-blue-500 active:bg-blue-700 dark:active:bg-blue-600 transition-colors flex flex-col gap-0.5 touch-manipulation"
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
                      );
                    })()}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600 dark:text-zinc-400">Advance:</span>
              {([1, 3, 5] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => (w === 1 ? advanceWeek() : advanceWeeks(w))}
                  disabled={!getCanAdvanceWeek()}
                  className="rounded-lg bg-blue-600 dark:bg-blue-500 py-3 px-4 min-h-[44px] font-semibold text-white hover:bg-blue-500 dark:hover:bg-blue-400 active:bg-blue-700 dark:active:bg-blue-600 disabled:opacity-50 disabled:pointer-events-none touch-manipulation"
                >
                  {w} week{w !== 1 ? 's' : ''} →
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none mt-2">
              <input
                type="checkbox"
                checked={autoTrainOnAdvance}
                onChange={(e) => setAutoTrainOnAdvance(e.target.checked)}
                className="rounded border-slate-300 dark:border-zinc-500 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700 dark:text-zinc-300">Auto-train when advancing (trains what you need most; single week always trains if you have time & energy)</span>
            </label>
            {!getCanAdvanceWeek() && (
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                {state.pendingCompetition
                  ? 'Finish your current match before advancing.'
                  : state.pendingTournamentPlay
                  ? 'Go to tournament and play or simulate to advance.'
                  : state.transferPortalActive
                  ? 'Resolve transfer in College tab to advance.'
                  : 'Pick a college above to advance.'}
              </p>
            )}
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
                    <p className="text-sm text-slate-600 dark:text-zinc-400">Request interest from schools; they may or may not offer. Pick a school to transfer to or withdraw to stay.</p>
                    {requestTransferMessage && <p className="text-sm text-slate-600 dark:text-zinc-400">{requestTransferMessage}</p>}
                    {getTransferOffers().length === 0 ? (
                      <p className="text-sm text-amber-600 dark:text-amber-400">No offers yet. Request interest from schools below.</p>
                    ) : (
                      <ul className="space-y-3">
                        {getTransferOffers().map((offer) => (
                          <li key={offer.id} className="rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <span className="text-sm font-medium text-slate-900 dark:text-white">{offer.schoolName}</span>
                              <span className="text-xs text-slate-500 dark:text-zinc-400">{offer.division}</span>
                            </div>
                            <div className="text-xs text-slate-600 dark:text-zinc-400 mb-2">
                              {fmtOfferType(offer.offerType)} · Tuition {offer.tuitionCoveredPct}% · NIL ${fmtNIL(offer.nilAnnual)}/yr · Housing {offer.housingStipend} · Meals {offer.mealPlanPct}%
                              {offer.guaranteedStarter && ' · Guaranteed starter'}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={() => acceptTransfer(offer.schoolId)} className="rounded-lg bg-green-600 dark:bg-green-500 text-white px-3 py-1.5 text-sm font-medium min-h-[44px] touch-manipulation">Accept — transfer here</button>
                              <button
                                type="button"
                                onClick={() => { const r = negotiateTransferOffer(offer.schoolId, { moreTuition: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'tuition', success: r.success, message: r.message }); }}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium min-h-[44px] touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500'}`}
                              >
                                {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'Increased!' : negotiationFeedback.message) : 'Negotiate: more scholarship'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { const r = negotiateTransferOffer(offer.schoolId, { moreNIL: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'nil', success: r.success, message: r.message }); }}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium min-h-[44px] touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-slate-300 dark:bg-zinc-600 hover:bg-slate-400 dark:hover:bg-zinc-500'}`}
                              >
                                {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'Increased!' : negotiationFeedback.message) : 'Negotiate: more NIL'}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="pt-4 border-t border-amber-300 dark:border-amber-600">
                      <h5 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">Request interest from a school</h5>
                      <p className="text-xs text-slate-600 dark:text-zinc-400 mb-2">Click a school to request a transfer offer. They may accept or pass.</p>
                      <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                        {['D1', 'D2', 'D3', 'NAIA', 'JUCO'].map((div) => {
                          const currentName = (state.collegeName ?? '').toLowerCase();
                          const schools = getSchools().filter((sc) => sc.division === div && sc.name.toLowerCase() !== currentName);
                          const offeredIds = new Set(getTransferOffers().map((o) => o.schoolId));
                          const canRequest = schools.filter((sc) => !offeredIds.has(sc.id));
                          if (canRequest.length === 0) return null;
                          return (
                            <div key={div} className="flex flex-wrap gap-1.5 items-center">
                              <span className="text-xs font-medium text-slate-500 dark:text-zinc-500 w-10">{div}</span>
                              {canRequest.map((sc) => (
                                <button
                                  key={sc.id}
                                  type="button"
                                  onClick={() => { const r = requestTransferOffer(sc.id); setRequestTransferMessage(r.message); }}
                                  className="rounded-lg bg-slate-200 dark:bg-zinc-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-600 touch-manipulation"
                                >
                                  {sc.name}
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
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
                <p className="text-slate-700 dark:text-zinc-300 mb-4">You&apos;ve graduated. You have offers from some schools; you can also <strong>request interest</strong> from any school below. Pick a school and click <strong>Accept</strong> to commit — negotiate scholarship or NIL first if you want.</p>
                {requestOfferMessage && <p className="text-sm mb-2 text-slate-600 dark:text-zinc-400">{requestOfferMessage}</p>}
                {getCollegeOffers().length === 0 ? (
                  <p className="text-amber-700 dark:text-amber-300">No offers yet. Request interest from schools below.</p>
                ) : (
                  <div className="space-y-4">
                    {getCollegeOffers().map((offer) => (
                      <div key={offer.id} className="rounded-lg bg-white dark:bg-zinc-800 border-2 border-slate-200 dark:border-zinc-600 p-4">
                        <div className="font-semibold text-lg text-slate-900 dark:text-white mb-1">{offer.schoolName}</div>
                        <div className="text-sm text-slate-500 dark:text-zinc-500 mb-3">
                          {offer.division} · {fmtOfferType(offer.offerType)} · Tuition covered {offer.tuitionCoveredPct}% · NIL ${fmtNIL(offer.nilAnnual)}/yr · Housing ${offer.housingStipend} · Meals {offer.mealPlanPct}%
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
                            onClick={() => { const r = negotiateOffer(offer.schoolId, { moreTuition: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'tuition', success: r.success, message: r.message }); }}
                            className={`rounded-lg px-4 py-2.5 text-sm font-medium touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-amber-500 dark:bg-amber-600 text-white hover:bg-amber-600 dark:hover:bg-amber-500'}`}
                          >
                            {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'tuition' ? (negotiationFeedback.success ? 'Increased!' : 'No change') : 'Negotiate: more scholarship'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { const r = negotiateOffer(offer.schoolId, { moreNIL: true }); setNegotiationFeedback({ schoolId: offer.schoolId, kind: 'nil', success: r.success, message: r.message }); }}
                            className={`rounded-lg px-4 py-2.5 text-sm font-medium touch-manipulation ${negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'bg-green-600 dark:bg-green-500 text-white' : 'bg-slate-400 dark:bg-zinc-500 text-slate-200 dark:text-zinc-300') : 'bg-amber-500 dark:bg-amber-600 text-white hover:bg-amber-600 dark:hover:bg-amber-500'}`}
                          >
                            {negotiationFeedback?.schoolId === offer.schoolId && negotiationFeedback?.kind === 'nil' ? (negotiationFeedback.success ? 'Increased!' : 'No change') : 'Negotiate: more NIL'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {state.pendingCollegeChoice && (
                  <div className="mt-6 pt-4 border-t border-slate-200 dark:border-zinc-600">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">Request interest from a school</h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-500 mb-3">Click a school to request an offer. They may accept or pass.</p>
                    <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
                      {['D1', 'D2', 'D3', 'NAIA', 'JUCO'].map((div) => {
                        const schools = getSchools().filter((sc) => sc.division === div);
                        const offeredIds = new Set(getCollegeOffers().map((o) => o.schoolId));
                        const canRequest = schools.filter((sc) => !offeredIds.has(sc.id));
                        if (canRequest.length === 0) return null;
                        return (
                          <div key={div}>
                            <span className="text-xs font-medium text-slate-500 dark:text-zinc-500">{div}</span>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {canRequest.map((sc) => (
                                <button
                                  key={sc.id}
                                  type="button"
                                  onClick={() => { const r = requestCollegeOffer(sc.id); setRequestOfferMessage(r.message); }}
                                  className="rounded-lg bg-slate-200 dark:bg-zinc-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-600 touch-manipulation"
                                >
                                  {sc.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="text-slate-600 dark:text-zinc-400">
                  You&apos;re in high school. When you graduate (age 18), you&apos;ll get college offers and can request interest from any school. You can negotiate scholarship and NIL before committing.
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
                const phase = isInCollege ? (w === 15 ? 'NCAA' : w <= 14 ? 'Season' : '') : engine.getHSPhaseForWeek(w);
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
              {isInCollege ? 'Weeks 1–14: early season (opens + duals), midseason (duals + invites), conference stretch, Conf Champs (12), recovery; Week 15 NCAA. Travel duals = 2 matches; opens may rest starters.' : 'Duals and tournaments show opponent or event name. Weeks 9–20 Offseason, 21–30 Summer (Fargo 27–28), 31–38 Preseason, 39–49 Regular, 50 Districts, 51 State, 52 Wrap.'}
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

            <h4 className="text-sm font-semibold text-slate-700 dark:text-zinc-300 mt-6 mb-2">Custom purchases</h4>
            <p className="text-xs text-slate-500 dark:text-zinc-500 mb-3">One-time buys: gear, recovery, and luxuries. Some are expensive.</p>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {engine.getCustomLifestyleCatalog().map((item) => (
                <div key={item.id} className={`rounded-lg border p-3 ${item.owned ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20' : 'border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800/50'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-800 dark:text-zinc-200">{item.name}</div>
                      <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{item.description}</div>
                      {!item.owned && <div className="text-xs text-slate-600 dark:text-zinc-300 mt-1">{item.effectSummary}</div>}
                    </div>
                    {item.owned ? (
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">Owned</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-semibold ${item.cost >= 2000 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-zinc-300'}`}>${item.cost}</span>
                        {item.weeklyCost != null && item.weeklyCost > 0 && <span className="text-xs text-slate-500">+${item.weeklyCost}/wk</span>}
                        <button
                          type="button"
                          onClick={() => { const r = purchaseCustomItem(item.id); if (!r.success) alert(r.message); }}
                          className="rounded-lg bg-blue-600 dark:bg-blue-500 text-white px-3 py-1.5 text-sm font-medium min-h-[36px] touch-manipulation disabled:opacity-50"
                          disabled={!item.canAfford}
                        >
                          Buy
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'life' && (
          <div className="rounded-lg bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 p-4 max-w-lg">
            <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-lg mb-1">Life log</h3>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mb-4">Popup events and the choices you made. New events appear each week when you advance.</p>
            {lifeLog.length === 0 ? (
              <p className="text-slate-500 dark:text-zinc-500 text-sm">No life events logged yet. Advance a week to see popups and your choices here.</p>
            ) : (
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {lifeLog.map((entry, i) => (
                  <li key={i} className="text-sm text-slate-700 dark:text-zinc-300 border-l-2 border-slate-300 dark:border-zinc-600 pl-3 py-1">
                    {entry.text}
                  </li>
                ))}
              </ul>
            )}
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
              <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">Weight class</h4>
              <p className="text-xs text-slate-500 dark:text-zinc-500 mb-2">Switch to a different weight for your current level (HS or college).</p>
              <select
                value={state.weightClass ?? 145}
                onChange={(e) => setWeightClass(Number(e.target.value))}
                className="rounded-lg border border-slate-300 dark:border-zinc-500 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 px-3 py-2 text-sm min-h-[44px] touch-manipulation"
              >
                {UnifiedEngine.getWeightClasses(state.league).map((wc) => (
                  <option key={wc} value={wc}>{wc} lbs</option>
                ))}
              </select>
            </section>

            <section>
              <h4 className="text-sm font-medium text-slate-600 dark:text-zinc-300 mb-2">Game</h4>
              <div className="space-y-2 text-sm text-slate-600 dark:text-zinc-400">
                <p>Save data is stored in this browser. Start a new game to reset your career.</p>
                <button type="button" onClick={goToCreate} className="rounded-lg bg-slate-300 dark:bg-zinc-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-zinc-300 active:bg-slate-400 dark:active:bg-zinc-600 touch-manipulation mt-2">
                  New game
                </button>
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
                    <li>Spend <strong>hours</strong> each week on Train, Study, Rest, or Relationships. Hours reset every week.</li>
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

      {/* Desktop top-right bar (Hours, Energy, $ — New game is in Settings) */}
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
      </div>
    </div>
  );
}
