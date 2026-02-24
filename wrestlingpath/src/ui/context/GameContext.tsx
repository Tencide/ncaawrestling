'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import type { UnifiedState, CustomStartOptions, CollegeOffer, HousingTier, CarTier, MealPlanTier, RecoveryTier, LifePopup, LifeLogEntry, BracketParticipant, PendingTournamentPlay } from '@/engine/unified/types';
import type { School } from '@/engine/types';
import { UnifiedEngine } from '@/engine/unified/UnifiedEngine';

type Screen = 'create' | 'game';

interface GameContextValue {
  screen: Screen;
  state: UnifiedState | null;
  engine: UnifiedEngine | null;
  startNewGame: (seed: string, options: { name: string; weightClass?: number; customStart?: CustomStartOptions }) => void;
  loadGame: (loaded: UnifiedState) => void;
  applyChoice: (choiceKey: string) => void;
  applyRelationshipAction: (relId: string, actionKey: string) => void;
  advanceWeek: () => boolean;
  advanceWeeks: (n: number) => boolean;
  autoTrainOnAdvance: boolean;
  setAutoTrainOnAdvance: (value: boolean) => void;
  runOffseasonEvent: (eventKey: string) => { success: boolean; place?: number; eventName?: string; message?: string; matches?: { won: boolean; method: string }[]; bracketParticipants?: BracketParticipant[] };
  getCollegeOffers: () => CollegeOffer[];
  getSchools: () => School[];
  requestCollegeOffer: (schoolId: string) => { success: boolean; message: string };
  getCanAdvanceWeek: () => boolean;
  acceptOffer: (schoolId: string) => boolean;
  negotiateOffer: (schoolId: string, request: { moreTuition?: boolean; moreNIL?: boolean }) => { success: boolean; message: string };
  canEnterTransferPortal: () => boolean;
  enterTransferPortal: () => boolean;
  getTransferOffers: () => CollegeOffer[];
  requestTransferOffer: (schoolId: string) => { success: boolean; message: string };
  negotiateTransferOffer: (schoolId: string, request: { moreTuition?: boolean; moreNIL?: boolean }) => { success: boolean; message: string };
  acceptTransfer: (schoolId: string) => boolean;
  withdrawFromTransferPortal: () => boolean;
  purchaseLifestyle: (category: 'car' | 'recoveryEquipment', tier: CarTier | RecoveryTier) => { success: boolean; message: string };
  upgradeLifestyleWeekly: (category: 'housing' | 'mealPlan', tier: HousingTier | MealPlanTier) => { success: boolean; message: string };
  purchaseCustomItem: (itemId: string) => { success: boolean; message: string };
  getPendingLifePopups: () => LifePopup[];
  resolveLifePopup: (popupId: string, choiceIndex: number) => void;
  getLifeLog: () => LifeLogEntry[];
  playCompetitionAction: (actionKey: string, opts?: { timedOut?: boolean }) => void;
  getPendingTournamentPlay: () => PendingTournamentPlay | null;
  startTournamentPlay: () => boolean;
  simulateTournamentBracket: () => boolean;
  simulatePendingCompetitionMatch: () => boolean;
  choosePostCollegeOption: (option: 'olympics' | 'restart' | 'retire') => void;
  setWeightClass: (newWeight: number) => boolean;
  goToCreate: () => void;
  goToGame: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<Screen>('create');
  const [state, setState] = useState<UnifiedState | null>(null);
  const [engine, setEngine] = useState<UnifiedEngine | null>(null);

  const startNewGame = useCallback((seed: string, options: { name: string; weightClass?: number; customStart?: CustomStartOptions }) => {
    const initial = UnifiedEngine.createState(seed, options);
    const eng = new UnifiedEngine(initial);
    setEngine(eng);
    setState(eng.getState());
    setScreen('game');
  }, []);

  const loadGame = useCallback((loaded: UnifiedState) => {
    const eng = new UnifiedEngine(loaded);
    setEngine(eng);
    setState(eng.getState());
    setScreen('game');
  }, []);

  const applyChoice = useCallback((choiceKey: string) => {
    if (!engine) return;
    engine.applyChoice(choiceKey);
    setState(JSON.parse(JSON.stringify(engine.getState())));
  }, [engine]);

  const applyRelationshipAction = useCallback((relId: string, actionKey: string) => {
    if (!engine) return;
    engine.applyRelationshipAction(relId, actionKey);
    setState(JSON.parse(JSON.stringify(engine.getState())));
  }, [engine]);

  const advanceWeek = useCallback((): boolean => {
    if (!engine) return false;
    const newYear = engine.advanceWeek();
    setState(JSON.parse(JSON.stringify(engine.getState())));
    return newYear;
  }, [engine]);

  const advanceWeeks = useCallback((n: number): boolean => {
    if (!engine || n < 1) return false;
    const newYear = engine.advanceWeeks(n);
    setState(JSON.parse(JSON.stringify(engine.getState())));
    return newYear;
  }, [engine]);

  const setAutoTrainOnAdvance = useCallback((value: boolean) => {
    if (!engine) return;
    engine.setAutoTrainOnAdvance(value);
    setState(JSON.parse(JSON.stringify(engine.getState())));
  }, [engine]);

  const runOffseasonEvent = useCallback((eventKey: string) => {
    if (!engine) return { success: false, message: 'No game' };
    const result = engine.runOffseasonEvent(eventKey);
    if (result.success) setState(JSON.parse(JSON.stringify(engine.getState())));
    return result;
  }, [engine]);

  const getCollegeOffers = useCallback(() => (engine ? engine.getCollegeOffers() : []), [engine]);
  const getSchools = useCallback(() => (engine ? engine.getSchools() : []), [engine]);
  const requestCollegeOffer = useCallback((schoolId: string) => {
    if (!engine) return { success: false, message: 'No game.' };
    const result = engine.requestCollegeOffer(schoolId);
    if (result.success) setState(JSON.parse(JSON.stringify(engine.getState())));
    return result;
  }, [engine]);
  const getCanAdvanceWeek = useCallback(() => (engine ? engine.getCanAdvanceWeek() : false), [engine]);
  const acceptOffer = useCallback((schoolId: string) => {
    if (!engine) return false;
    const ok = engine.acceptOffer(schoolId);
    if (ok) setState(JSON.parse(JSON.stringify(engine.getState())));
    return ok;
  }, [engine]);
  const negotiateOffer = useCallback((schoolId: string, request: { moreTuition?: boolean; moreNIL?: boolean }) => {
    if (!engine) return { success: false, message: 'No game.' };
    const result = engine.negotiateOffer(schoolId, request);
    if (result.success) setState(JSON.parse(JSON.stringify(engine.getState())));
    return result;
  }, [engine]);

  const canEnterTransferPortal = useCallback(() => (engine ? engine.canEnterTransferPortal() : false), [engine]);
  const enterTransferPortal = useCallback(() => {
    if (!engine) return false;
    const ok = engine.enterTransferPortal();
    if (ok) setState(JSON.parse(JSON.stringify(engine.getState())));
    return ok;
  }, [engine]);
  const getTransferOffers = useCallback(() => (engine ? engine.getTransferOffers() : []), [engine]);
  const requestTransferOffer = useCallback((schoolId: string) => {
    if (!engine) return { success: false, message: 'No game.' };
    const result = engine.requestTransferOffer(schoolId);
    if (result.success) setState(JSON.parse(JSON.stringify(engine.getState())));
    return result;
  }, [engine]);
  const negotiateTransferOffer = useCallback((schoolId: string, request: { moreTuition?: boolean; moreNIL?: boolean }) => {
    if (!engine) return { success: false, message: 'No game.' };
    const result = engine.negotiateTransferOffer(schoolId, request);
    if (result.success) setState(JSON.parse(JSON.stringify(engine.getState())));
    return result;
  }, [engine]);
  const acceptTransfer = useCallback((schoolId: string) => {
    if (!engine) return false;
    const ok = engine.acceptTransfer(schoolId);
    if (ok) setState(JSON.parse(JSON.stringify(engine.getState())));
    return ok;
  }, [engine]);
  const withdrawFromTransferPortal = useCallback(() => {
    if (!engine) return false;
    const ok = engine.withdrawFromTransferPortal();
    if (ok) setState(JSON.parse(JSON.stringify(engine.getState())));
    return ok;
  }, [engine]);

  const purchaseLifestyle = useCallback((category: 'car' | 'recoveryEquipment', tier: CarTier | RecoveryTier) => {
    if (!engine) return { success: false, message: 'No game.' };
    const result = engine.purchaseLifestyle(category, tier);
    if (result.success) setState(JSON.parse(JSON.stringify(engine.getState())));
    return result;
  }, [engine]);
  const upgradeLifestyleWeekly = useCallback((category: 'housing' | 'mealPlan', tier: HousingTier | MealPlanTier) => {
    if (!engine) return { success: false, message: 'No game.' };
    const result = engine.upgradeLifestyleWeekly(category, tier);
    if (result.success) setState(JSON.parse(JSON.stringify(engine.getState())));
    return result;
  }, [engine]);

  const purchaseCustomItem = useCallback((itemId: string) => {
    if (!engine) return { success: false, message: 'No game.' };
    const result = engine.purchaseCustomItem(itemId);
    if (result.success) setState(JSON.parse(JSON.stringify(engine.getState())));
    return result;
  }, [engine]);

  const getPendingLifePopups = useCallback(() => (engine ? engine.getPendingLifePopups() : []), [engine]);
  const resolveLifePopup = useCallback((popupId: string, choiceIndex: number) => {
    if (!engine) return;
    engine.resolveLifePopup(popupId, choiceIndex);
    setState(JSON.parse(JSON.stringify(engine.getState())));
  }, [engine]);
  const getLifeLog = useCallback(() => (engine ? engine.getLifeLog() : []), [engine]);

  const playCompetitionAction = useCallback((actionKey: string, opts?: { timedOut?: boolean }) => {
    if (!engine) return;
    engine.playPendingCompetitionAction(actionKey, opts);
    setState(JSON.parse(JSON.stringify(engine.getState())));
  }, [engine]);

  const getPendingTournamentPlay = useCallback(() => (engine ? engine.getPendingTournamentPlay() : null), [engine]);
  const startTournamentPlay = useCallback(() => {
    if (!engine) return false;
    const ok = engine.startTournamentPlay();
    if (ok) setState(JSON.parse(JSON.stringify(engine.getState())));
    return ok;
  }, [engine]);
  const simulateTournamentBracket = useCallback(() => {
    if (!engine) return false;
    const ok = engine.simulateTournamentBracket();
    if (ok) setState(JSON.parse(JSON.stringify(engine.getState())));
    return ok;
  }, [engine]);
  const simulatePendingCompetitionMatch = useCallback(() => {
    if (!engine) return false;
    const ok = engine.simulatePendingCompetitionMatch();
    if (ok) setState(JSON.parse(JSON.stringify(engine.getState())));
    return ok;
  }, [engine]);

  const choosePostCollegeOption = useCallback((option: 'olympics' | 'restart' | 'retire') => {
    if (!engine) return;
    engine.choosePostCollegeOption(option);
    setState(JSON.parse(JSON.stringify(engine.getState())));
  }, [engine]);

  const setWeightClass = useCallback((newWeight: number): boolean => {
    if (!engine) return false;
    const ok = engine.setWeightClass(newWeight);
    if (ok) setState(JSON.parse(JSON.stringify(engine.getState())));
    return ok;
  }, [engine]);

  const value: GameContextValue = {
    screen,
    state,
    engine,
    startNewGame,
    loadGame,
    applyChoice,
    applyRelationshipAction,
    advanceWeek,
    advanceWeeks,
    autoTrainOnAdvance: state?.autoTrainOnAdvance ?? true,
    setAutoTrainOnAdvance,
    runOffseasonEvent,
    getCollegeOffers,
    getSchools,
    requestCollegeOffer,
    getCanAdvanceWeek,
    acceptOffer,
    negotiateOffer,
    canEnterTransferPortal,
    enterTransferPortal,
    getTransferOffers,
    requestTransferOffer,
    negotiateTransferOffer,
    acceptTransfer,
    withdrawFromTransferPortal,
    purchaseLifestyle,
    upgradeLifestyleWeekly,
    purchaseCustomItem,
    getPendingLifePopups,
    resolveLifePopup,
    getLifeLog,
    playCompetitionAction,
    getPendingTournamentPlay,
    startTournamentPlay,
    simulateTournamentBracket,
    simulatePendingCompetitionMatch,
    choosePostCollegeOption,
    setWeightClass,
    goToCreate: () => setScreen('create'),
    goToGame: () => setScreen('game'),
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
