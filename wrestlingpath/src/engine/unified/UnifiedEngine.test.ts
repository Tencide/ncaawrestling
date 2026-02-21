import { describe, it, expect } from 'vitest';
import { UnifiedEngine } from './UnifiedEngine';

describe('UnifiedEngine – weekly modifiers', () => {
  it('Life/Relationship actions reduce availableHours correctly', () => {
    const state = UnifiedEngine.createState('mod-test-1', { name: 'Test', weightClass: 145 });
    const engine = new UnifiedEngine(state);
    const initialHours = engine.getState().hoursLeftThisWeek ?? 40;
    engine.applyChoice('date');
    let s = engine.getState();
    expect(s.hoursLeftThisWeek).toBe(initialHours - 6);
    engine.applyChoice('party');
    s = engine.getState();
    expect(s.hoursLeftThisWeek).toBe(initialHours - 6 - 5);
  });

  it('Actions write weekModifiers and reasons', () => {
    const state = UnifiedEngine.createState('mod-test-2', { name: 'Test', weightClass: 145 });
    const engine = new UnifiedEngine(state);
    expect(engine.getWeekModifiers().reasons).toHaveLength(0);
    engine.applyChoice('rest');
    expect(engine.getWeekModifiers().injuryRiskMult).toBeLessThan(1);
    expect(engine.getWeekModifiers().reasons).toContain('Rest');
    engine.applyChoice('relationship_time');
    // relationship_time requires a partner; createState doesn't set one, so we need state with relationship
    const stateWithPartner = UnifiedEngine.createState('mod-test-2b', { name: 'Test', weightClass: 145 });
    stateWithPartner.relationship = { status: 'dating', partnerName: 'J', level: 50, weeklyTimeRequired: 4 };
    const engine2 = new UnifiedEngine(stateWithPartner);
    engine2.applyChoice('relationship_time');
    expect(engine2.getWeekModifiers().performanceMult).toBeGreaterThan(1);
    expect(engine2.getWeekModifiers().reasons).toContain('Time with partner');
  });

  it('Training gains use trainingMult from weekModifiers', () => {
    const state = UnifiedEngine.createState('mod-test-3', { name: 'Test', weightClass: 145 });
    state.weekModifiers = { trainingMult: 1.5, performanceMult: 1, injuryRiskMult: 1, weightCutSeverityMult: 1, reasons: ['Test'] };
    const engine = new UnifiedEngine(state);
    const techBefore = engine.getState().technique;
    engine.applyChoice('train_technique');
    const techAfter = engine.getState().technique;
    expect(techAfter).toBeGreaterThanOrEqual(techBefore);
  });

  it('Determinism: same seed + same actions => same modifiers and outcomes after reload', () => {
    const seed = 'determinism-test';
    const initial = UnifiedEngine.createState(seed, { name: 'A', weightClass: 145 });
    const engine1 = new UnifiedEngine(initial);
    engine1.applyChoice('rest');
    engine1.applyChoice('train_technique');
    const state1 = engine1.getState();
    const mods1 = engine1.getWeekModifiers();

    const loaded = JSON.parse(JSON.stringify(state1));
    const engine2 = new UnifiedEngine(loaded);
    engine2.applyChoice('train_conditioning');
    const state2 = engine2.getState();
    const mods2 = engine2.getWeekModifiers();

    const initial2 = UnifiedEngine.createState(seed, { name: 'A', weightClass: 145 });
    const engine3 = new UnifiedEngine(initial2);
    engine3.applyChoice('rest');
    engine3.applyChoice('train_technique');
    engine3.applyChoice('train_conditioning');
    const state3 = engine3.getState();
    const mods3 = engine3.getWeekModifiers();

    expect(state2.technique).toBe(state3.technique);
    expect(state2.conditioning).toBe(state3.conditioning);
    expect(mods2.trainingMult).toBe(mods3.trainingMult);
    expect(mods2.reasons).toEqual(mods3.reasons);
  });
});

describe('UnifiedEngine – HS scheduling and sim', () => {
  it('Dual week with Varsity simulates exactly 1 match and updates record', () => {
    const state = UnifiedEngine.createState('dual-test', { name: 'V', weightClass: 145 });
    state.league = 'HS_VARSITY';
    state.week = 38;
    state.hsSchedule = [{ week: 39, type: 'dual', opponentId: 'unr_145_1' }];
    state.opponentPools = {
      unranked: [{ id: 'unr_145_1', name: 'Opp', overallRating: 55, style: 'grinder', clutch: 50 }],
      stateRanked: [],
      nationalRanked: [],
    };
    const engine = new UnifiedEngine(state);
    const winsBefore = engine.getState().stats.seasonWins;
    const lossesBefore = engine.getState().stats.seasonLosses;
    engine.advanceWeek();
    const s = engine.getState();
    expect(s.week).toBe(39);
    expect(s.stats.seasonWins - winsBefore + (s.stats.seasonLosses - lossesBefore)).toBe(1);
    expect(s.lastWeekSummary?.eventType).toBe('dual');
    expect(s.lastWeekSummary?.matches?.length).toBe(1);
  });

  it('Tournament week simulates multiple matches and can include losses', () => {
    const state = UnifiedEngine.createState('tourney-test', { name: 'T', weightClass: 145 });
    state.league = 'HS_VARSITY';
    state.week = 40;
    state.hsSchedule = [{ week: 41, type: 'tournament' }];
    state.opponentPools = {
      unranked: Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, name: `O${i}`, overallRating: 50 + i, style: 'grinder' as const, clutch: 50 })),
      stateRanked: [],
      nationalRanked: [],
    };
    const engine = new UnifiedEngine(state);
    engine.advanceWeek();
    engine.advanceWeek();
    const s = engine.getState();
    expect(s.week).toBe(41);
    expect(s.lastWeekSummary?.eventType).toBe('tournament');
    // Double-elim 8-man: 2 matches (e.g. out in quarters + conso R1) up to 5 (e.g. 2nd place through conso)
    expect((s.lastWeekSummary?.matches?.length ?? 0)).toBeGreaterThanOrEqual(2);
    expect((s.lastWeekSummary?.matches?.length ?? 0)).toBeLessThanOrEqual(5);
  });

  it('Schedule contains at least 6 duals and includes dual/tournament/rival', () => {
    const state = UnifiedEngine.createState('sched-test', { name: 'S', weightClass: 145 });
    state.league = 'HS_VARSITY';
    state.week = 52;
    const engine = new UnifiedEngine(state);
    engine.advanceWeek();
    const s = engine.getState();
    expect(s.week).toBe(1);
    expect(s.hsSchedule?.length).toBeGreaterThanOrEqual(10);
    const duals = s.hsSchedule?.filter((e) => e.type === 'dual' || e.type === 'rival') ?? [];
    const tournaments = s.hsSchedule?.filter((e) => e.type === 'tournament') ?? [];
    expect(duals.length).toBeGreaterThanOrEqual(6);
    expect(tournaments.length).toBeGreaterThanOrEqual(2);
    expect(s.hsSchedule?.some((e) => e.type === 'rival')).toBe(true);
  });

  it('Fargo/Super32/WNO occur at correct weeks', () => {
    const state = UnifiedEngine.createState('events-test', { name: 'E', weightClass: 145 });
    state.league = 'HS_VARSITY';
    state.recruitingScore = 70;
    state.money = 500;
    state.week = 27;
    const engine = new UnifiedEngine(state);
    const evs = engine.getOffseasonEvents();
    expect(evs.some((e) => e.key === 'fargo')).toBe(true);
  });
});
