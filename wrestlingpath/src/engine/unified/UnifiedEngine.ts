/**
 * Unified game engine: week-by-week choices + tournaments + offseason + recruiting.
 * Uses SeededRNG for deterministic save/load.
 */

import { SeededRNG } from '../SeededRNG';
import type { UnifiedState, LeagueKey, ChoiceItem, OffseasonEventItem, CustomStartOptions, WeekModifiers, ChoicePreview, HSScheduleEntry, CollegeScheduleEntry, CollegeTeammate, Opponent, OpponentPools, WeekSummary, RelationshipEntry, RelationshipActionItem, NextEventInfo, CollegeOffer, LifestyleState, HousingTier, CarTier, MealPlanTier, RecoveryTier } from './types';
import type { School } from '../types';
import { SCHOOLS } from '@/data/schools';

const WEIGHT_CLASSES = [106, 113, 120, 126, 132, 138, 145, 152, 160, 170, 182, 195, 220, 285];
/** NCAA college weight classes (different from HS). */
const COLLEGE_WEIGHT_CLASSES = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285];
const HS_LEAGUES: LeagueKey[] = ['HS_JV', 'HS_VARSITY', 'HS_ELITE'];
const LEAGUES: Record<LeagueKey, { meanTrueSkill: number; ratingBase: number; ratingScale: number }> = {
  HS_JV: { meanTrueSkill: 42, ratingBase: 52, ratingScale: 0.81 },
  HS_VARSITY: { meanTrueSkill: 50, ratingBase: 55, ratingScale: 0.88 },
  HS_ELITE: { meanTrueSkill: 58, ratingBase: 58, ratingScale: 0.98 },
  JUCO: { meanTrueSkill: 55, ratingBase: 56, ratingScale: 0.38 },
  NAIA: { meanTrueSkill: 60, ratingBase: 58, ratingScale: 0.36 },
  D3: { meanTrueSkill: 62, ratingBase: 58, ratingScale: 0.35 },
  D2: { meanTrueSkill: 66, ratingBase: 60, ratingScale: 0.33 },
  D1: { meanTrueSkill: 74, ratingBase: 62, ratingScale: 0.3 },
};
/** HS year calendar (52 weeks): Offseason 9–20, Summer 21–30, Preseason 31–38, Regular 39–49, Postseason 50–52 */
const HS_OFFSEASON_START = 9;
const HS_OFFSEASON_END = 20;
const HS_SUMMER_START = 21;
const HS_SUMMER_END = 30;
const HS_PRESEASON_START = 31;
const HS_PRESEASON_END = 38;
const HS_REGULAR_START = 39;
const HS_REGULAR_END = 49;
const HS_WEEK_DISTRICT = 50;
const HS_WEEK_STATE = 51;
const HS_WEEK_WRAP = 52;
const FARGO_WEEKS = [27, 28];
const SUPER32_WEEK = 36;
const WNO_WEEK = 37;
const WNO_RECRUITING_MIN = 68;
const WEEK_CONFERENCE_COLLEGE = 8;
const WEEK_NCAA = 12;
const DISTRICTS_QUALIFY_TOP = 4;
const CONFERENCE_QUALIFY_TOP = 3;
const US_OPEN_WEEK = 18;
const WORLD_CHAMPIONSHIP_WEEK = 22;
const OFFSEASON_EVENTS: Record<string, { name: string; week: number; cost: number; prestige: number; recScoreMin: number; inviteOnly: boolean; collegeOnly?: boolean }> = {
  fargo: { name: 'Fargo', week: 27, cost: 450, prestige: 1.4, recScoreMin: 0, inviteOnly: false },
  super32: { name: 'Super 32', week: SUPER32_WEEK, cost: 320, prestige: 1.25, recScoreMin: 0, inviteOnly: false },
  wno: { name: "Who's Number One", week: WNO_WEEK, cost: 280, prestige: 1.5, recScoreMin: WNO_RECRUITING_MIN, inviteOnly: true },
  us_open: { name: 'US Open', week: US_OPEN_WEEK, cost: 380, prestige: 1.6, recScoreMin: 0, inviteOnly: false, collegeOnly: true },
  world_championship: { name: 'World Championship', week: WORLD_CHAMPIONSHIP_WEEK, cost: 1200, prestige: 1.9, recScoreMin: 0, inviteOnly: false, collegeOnly: true },
};
const HOURS_PER_WEEK = 40;
const BASE_HOURS_AUTO = 0;

function defaultWeekModifiers(): WeekModifiers {
  return {
    trainingMult: 1,
    performanceMult: 1,
    injuryRiskMult: 1,
    weightCutSeverityMult: 1,
    reasons: [],
  };
}

const PARENT_NAMES = ['Mom', 'Dad', 'Mike', 'Sarah', 'James', 'Lisa', 'David', 'Jennifer'];
const SIBLING_FIRST = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn'];
const COACH_NAMES = ['Coach Williams', 'Coach Martinez', 'Coach Brown', 'Coach Davis'];
const FRIEND_FIRST = ['Jake', 'Kyle', 'Marcus', 'Devin', 'Chris', 'Nick', 'Tyler', 'Cole'];

function generateInitialRelationships(rng: SeededRNG, _playerName: string): RelationshipEntry[] {
  const list: RelationshipEntry[] = [];
  const id = () => 'rel_' + rng.int(1, 1e9) + '_' + rng.int(1, 1e9);
  const parent1 = PARENT_NAMES[rng.next() % PARENT_NAMES.length];
  let parent2 = PARENT_NAMES[rng.next() % PARENT_NAMES.length];
  while (parent2 === parent1) parent2 = PARENT_NAMES[rng.next() % PARENT_NAMES.length];
  list.push({ id: id(), kind: 'parent', name: parent1, level: 70 + rng.int(0, 25), label: 'Parent' });
  list.push({ id: id(), kind: 'parent', name: parent2, level: 65 + rng.int(0, 30), label: 'Parent' });
  const numSiblings = rng.int(0, 2);
  for (let i = 0; i < numSiblings; i++) {
    list.push({ id: id(), kind: 'sibling', name: SIBLING_FIRST[rng.next() % SIBLING_FIRST.length], level: 40 + rng.int(0, 40), label: 'Sibling' });
  }
  list.push({ id: id(), kind: 'coach', name: COACH_NAMES[rng.next() % COACH_NAMES.length], level: 50 + rng.int(0, 30), label: 'Coach' });
  const numFriends = 2 + rng.int(0, 2);
  for (let i = 0; i < numFriends; i++) {
    list.push({ id: id(), kind: 'friend', name: FRIEND_FIRST[rng.next() % FRIEND_FIRST.length], level: 35 + rng.int(0, 45), label: 'Friend' });
  }
  return list;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

function defaultStats(): UnifiedState['stats'] {
  return {
    matchesWon: 0,
    matchesLost: 0,
    pins: 0,
    techs: 0,
    majors: 0,
    tournamentsWon: 0,
    stateAppearances: 0,
    stateTitles: 0,
    statePlacements: [],
    ncaaAppearances: 0,
    ncaaAllAmerican: 0,
    ncaaTitles: 0,
    ncaaPlacements: [],
    seasonWins: 0,
    seasonLosses: 0,
    seasonPins: 0,
    seasonTechs: 0,
    seasonMajors: 0,
    winStreak: 0,
    weightMisses: 0,
    fargoPlacements: [],
    super32Placements: [],
    wnoAppearances: 0,
    wnoWins: 0,
    usOpenPlacements: [],
    worldChampionshipPlacements: [],
    hsRecord: { matchesWon: 0, matchesLost: 0, pins: 0, techs: 0, majors: 0, stateAppearances: 0, stateTitles: 0 },
    collegeRecord: { matchesWon: 0, matchesLost: 0, pins: 0, techs: 0, majors: 0, ncaaAppearances: 0, ncaaAllAmerican: 0, ncaaTitles: 0 },
  };
}

function computeTrueSkill(s: UnifiedState): number {
  const w = (s.technique ?? 50) * 0.28 + (s.matIQ ?? 50) * 0.24 + (s.conditioning ?? 50) * 0.22 +
    (s.strength ?? 50) * 0.12 + (s.speed ?? 50) * 0.08 + (s.flexibility ?? 50) * 0.06;
  return w;
}

/** Overall rating = weighted average of attributes (trueSkill), so the number matches what you see in tech/matIQ/conditioning/etc. */
function overallFromTrueSkill(ts: number, _league: LeagueKey): number {
  return Math.round(clamp(40, 99, ts));
}

function updateRating(s: UnifiedState): void {
  s.trueSkill = computeTrueSkill(s);
  s.overallRating = overallFromTrueSkill(s.trueSkill, s.league);
}

function addStory(s: UnifiedState, text: string): void {
  s.history.push({ year: s.year, week: s.week, age: s.age, text });
  s.story = text;
}

function isInCollege(s: UnifiedState): boolean {
  return HS_LEAGUES.indexOf(s.league) === -1;
}

function getEffectiveModifiers(s: UnifiedState): WeekModifiers {
  const w = s.weekModifiers ?? defaultWeekModifiers();
  return {
    trainingMult: clamp(0.1, 2, w.trainingMult),
    performanceMult: clamp(0.1, 2, w.performanceMult),
    injuryRiskMult: clamp(0, 3, w.injuryRiskMult),
    weightCutSeverityMult: clamp(0, 3, w.weightCutSeverityMult),
    reasons: w.reasons ?? [],
  };
}

function getHSPhase(week: number): string {
  if (week >= HS_OFFSEASON_START && week <= HS_OFFSEASON_END) return 'Offseason (Spring)';
  if (week >= HS_SUMMER_START && week <= HS_SUMMER_END) return 'Summer';
  if (week >= HS_PRESEASON_START && week <= HS_PRESEASON_END) return 'Preseason (Fall)';
  if (week >= HS_REGULAR_START && week <= HS_REGULAR_END) return 'Regular Season';
  if (week === HS_WEEK_DISTRICT) return 'District/Sectional';
  if (week === HS_WEEK_STATE) return 'State Tournament';
  if (week === HS_WEEK_WRAP) return 'Season Wrap';
  if (week >= 1 && week < HS_OFFSEASON_START) return 'Early Offseason';
  return 'Offseason';
}

function isHSRegularSeason(week: number): boolean {
  return week >= HS_REGULAR_START && week <= HS_REGULAR_END;
}

export class UnifiedEngine {
  private state: UnifiedState;
  private rng: SeededRNG;

  constructor(initial: UnifiedState) {
    this.state = JSON.parse(JSON.stringify(initial));
    const old = this.state as unknown as { month?: number; hoursLeftThisMonth?: number; monthsInCollege?: number; didPartTimeThisMonth?: boolean; lastMonthEconomy?: unknown };
    if (this.state.week == null) this.state.week = old.month ?? 1;
    if (this.state.hoursLeftThisWeek == null) this.state.hoursLeftThisWeek = old.hoursLeftThisMonth ?? HOURS_PER_WEEK;
    if (this.state.weeksInCollege == null) this.state.weeksInCollege = old.monthsInCollege != null ? old.monthsInCollege * 4 : 0;
    if (this.state.didPartTimeThisWeek == null) this.state.didPartTimeThisWeek = old.didPartTimeThisMonth ?? false;
    if (this.state.lastWeekEconomy == null) this.state.lastWeekEconomy = null;
    if (this.state.relationship == null) this.state.relationship = null;
    if (this.state.weekModifiers == null) this.state.weekModifiers = defaultWeekModifiers();
    if (this.state.relationships == null) this.state.relationships = [];
    if (this.state.offseasonEventsUsedThisYear == null) this.state.offseasonEventsUsedThisYear = {};
    if (this.state.hsSchedule == null) this.state.hsSchedule = null;
    if (this.state.opponentPools == null) this.state.opponentPools = null;
    if (this.state.collegeSchedule == null) this.state.collegeSchedule = null;
    if (this.state.collegeRoster == null) this.state.collegeRoster = null;
    if (this.state.lastWeekSummary == null) this.state.lastWeekSummary = null;
    if (this.state.studiedThisWeek == null) this.state.studiedThisWeek = false;
    if (this.state.trainedThisWeek == null) this.state.trainedThisWeek = false;
    if (this.state.didRestOrRehabThisWeek == null) this.state.didRestOrRehabThisWeek = false;
    if (!Array.isArray(this.state.offers)) this.state.offers = [];
    if (this.state.pendingCollegeChoice == null) this.state.pendingCollegeChoice = false;
    if (this.state.eligibilityYearsRemaining == null && !HS_LEAGUES.includes(this.state.league)) this.state.eligibilityYearsRemaining = 4;
    if (!this.state.lifestyle) this.state.lifestyle = UnifiedEngine.DEFAULT_LIFESTYLE;
    if (!Array.isArray(this.state.stats.usOpenPlacements)) this.state.stats.usOpenPlacements = [];
    if (!Array.isArray(this.state.stats.worldChampionshipPlacements)) this.state.stats.worldChampionshipPlacements = [];
    this.rng = SeededRNG.deserialize(this.state.seed, this.state.rngState);
    // Recompute overall from current attributes so it always matches (fixes loaded saves with stale overall)
    updateRating(this.state);
  }

  getState(): Readonly<UnifiedState> {
    return this.state;
  }

  getRngState(): string {
    return this.rng.serialize();
  }

  private saveRng(): void {
    this.state.rngState = this.rng.serialize();
  }

  /** Create initial state for new game. Pass customStart to override age, year, week, league. */
  static createState(seed: string, options: { name: string; weightClass?: number; stateId?: string; customStart?: CustomStartOptions }): UnifiedState {
    const s = options as { name: string; weightClass: number; customStart?: CustomStartOptions };
    const custom = s.customStart;
    const weightClass = WEIGHT_CLASSES.includes(s.weightClass) ? s.weightClass : 145;
    const rng = new SeededRNG(seed);
    const attrs = {
      technique: 35 + rng.int(0, 20),
      matIQ: 32 + rng.int(0, 20),
      conditioning: 38 + rng.int(0, 20),
      strength: 30 + rng.int(0, 20),
      speed: 32 + rng.int(0, 20),
      flexibility: 35 + rng.int(0, 20),
    };
    const league = custom?.league && HS_LEAGUES.includes(custom.league) ? custom.league : (custom?.league && LEAGUES[custom.league as LeagueKey] ? custom.league as LeagueKey : 'HS_JV');
    const trueSkill = (attrs.technique * 0.28 + attrs.matIQ * 0.24 + attrs.conditioning * 0.22 + attrs.strength * 0.12 + attrs.speed * 0.08 + attrs.flexibility * 0.06);
    const age = custom?.age != null ? clamp(14, 24, custom.age) : 14;
    const year = custom?.year != null ? Math.max(1, custom.year) : 1;
    const week = custom?.week != null ? clamp(1, 52, custom.week) : 1;
    const inCollege = HS_LEAGUES.indexOf(league) === -1;
    const state: UnifiedState = {
      seed,
      rngState: rng.serialize(),
      name: options.name || 'Wrestler',
      age,
      year,
      week,
      league,
      collegeName: inCollege ? 'College' : null,
      fromHS: HS_LEAGUES.includes(league),
      weeksInCollege: 0,
      weightClass,
      ...attrs,
      energy: 100,
      health: 100,
      stress: 0,
      happiness: 75,
      grades: 75,
      social: 50,
      money: 200,
      trueSkill,
      overallRating: overallFromTrueSkill(trueSkill, league),
      recruitingScore: 50,
      potentialCeiling: 95,
      yearlyGrowthCap: 14,
      yearlyGrowthUsed: 0,
      consecutiveRestWeeks: 0,
      techniqueTranslationWeeks: 0,
      stateQualified: false,
      ncaaQualified: false,
      didPartTimeThisWeek: false,
      broke: false,
      story: custom ? `Week ${week}, Year ${year}. ${options.name || 'Wrestler'} continues.` : options.name + ' starts high school. Make your first choice.',
      history: [],
      accolades: [],
      stats: defaultStats(),
      rankingsByWeight: {},
      lastWeekEconomy: null,
      pendingRandomChoice: null,
      offers: [],
      pendingNILDeal: null,
      hoursLeftThisWeek: HOURS_PER_WEEK,
      studiedThisWeek: false,
      trainedThisWeek: false,
      didRestOrRehabThisWeek: false,
      weekModifiers: defaultWeekModifiers(),
      relationship: null,
      relationships: generateInitialRelationships(rng, options.name || 'Wrestler'),
      offseasonEventsUsedThisYear: {},
      hsSchedule: null,
      opponentPools: null,
      collegeSchedule: null,
      collegeRoster: null,
      lastWeekSummary: null,
      lifestyle: UnifiedEngine.DEFAULT_LIFESTYLE,
    };
    if (custom) {
      if (custom.technique != null) state.technique = clamp(0, 100, custom.technique);
      if (custom.matIQ != null) state.matIQ = clamp(0, 100, custom.matIQ);
      if (custom.conditioning != null) state.conditioning = clamp(0, 100, custom.conditioning);
      if (custom.strength != null) state.strength = clamp(0, 100, custom.strength);
      if (custom.speed != null) state.speed = clamp(0, 100, custom.speed);
      if (custom.flexibility != null) state.flexibility = clamp(0, 100, custom.flexibility);
      if (custom.energy != null) state.energy = clamp(0, 100, custom.energy);
      if (custom.health != null) state.health = clamp(0, 100, custom.health);
      if (custom.stress != null) state.stress = clamp(0, 100, custom.stress);
      if (custom.happiness != null) state.happiness = clamp(0, 100, custom.happiness);
      if (custom.grades != null) state.grades = clamp(0, 100, custom.grades);
      if (custom.social != null) state.social = clamp(0, 100, custom.social);
      if (custom.money != null) state.money = Math.max(0, custom.money);
      if (custom.recruitingScore != null) state.recruitingScore = clamp(0, 100, custom.recruitingScore);
      updateRating(state);
    }
    // Start on varsity if good enough (rating >= 68 or age >= 15)
    if (state.league === 'HS_JV' && (state.age >= 15 || (state.overallRating ?? 0) >= 68)) {
      state.league = 'HS_VARSITY';
    }
    return state;
  }

  /** Hours cost per choice (deducted from hoursLeftThisWeek). */
  private static readonly HOURS_COST: Record<string, number> = {
    train_technique: 10,
    train_conditioning: 10,
    train_strength: 8,
    study_film: 4,
    compete: 12,
    rest: 4,
    study: 6,
    hang_out: 4,
    part_time_job: 12,
    relationship_time: 6,
    date: 6,
    party: 5,
    argument: 2,
    interview: 3,
    rehab: 6,
  };

  private static readonly MONEY_COST: Record<string, number> = {
    date: 30,
    party: 20,
    interview: 0,
    rehab: 0,
    argument: 0,
  };

  /** Modifier deltas and reason per action (stack onto weekModifiers). */
  private static readonly MODIFIER_DELTAS: Record<string, { trainingMult?: number; performanceMult?: number; injuryRiskMult?: number; weightCutSeverityMult?: number; reason: string }> = {
    relationship_time: { performanceMult: 0.05, reason: 'Time with partner' },
    date: { performanceMult: 0.08, reason: 'Date night' },
    argument: { performanceMult: -0.1, reason: 'Argument' },
    party: { trainingMult: -0.1, performanceMult: -0.05, reason: 'Party' },
    interview: { performanceMult: 0.05, reason: 'Interview' },
    rehab: { injuryRiskMult: -0.2, trainingMult: -0.05, reason: 'Rehab' },
    rest: { injuryRiskMult: -0.15, reason: 'Rest' },
  };

  private static readonly DEFAULT_LIFESTYLE: LifestyleState = {
    housing: 'none',
    car: 'none',
    mealPlan: 'none',
    recoveryEquipment: 'none',
  };

  /** Weekly cost per housing tier (rent). */
  private static readonly HOUSING_WEEKLY: Record<HousingTier, number> = {
    none: 0,
    basic: 80,
    apartment: 220,
    nice_apartment: 450,
    luxury: 850,
  };
  /** One-time cost per car tier. */
  private static readonly CAR_COST: Record<CarTier, number> = {
    none: 0,
    beater: 1200,
    used: 4500,
    reliable: 12000,
    nice: 28000,
  };
  /** Small weekly upkeep for car (gas/insurance). */
  private static readonly CAR_WEEKLY: Record<CarTier, number> = {
    none: 0,
    beater: 35,
    used: 55,
    reliable: 75,
    nice: 120,
  };
  /** Weekly cost per meal plan tier. */
  private static readonly MEAL_PLAN_WEEKLY: Record<MealPlanTier, number> = {
    none: 0,
    basic: 45,
    good: 95,
    premium: 165,
  };
  /** One-time cost per recovery equipment tier. */
  private static readonly RECOVERY_COST: Record<RecoveryTier, number> = {
    none: 0,
    basic: 80,
    pro: 450,
  };

  private static readonly HOUSING_ORDER: HousingTier[] = ['none', 'basic', 'apartment', 'nice_apartment', 'luxury'];
  private static readonly CAR_ORDER: CarTier[] = ['none', 'beater', 'used', 'reliable', 'nice'];
  private static readonly MEAL_PLAN_ORDER: MealPlanTier[] = ['none', 'basic', 'good', 'premium'];
  private static readonly RECOVERY_ORDER: RecoveryTier[] = ['none', 'basic', 'pro'];

  getLifestyle(): LifestyleState {
    return this.state.lifestyle ?? UnifiedEngine.DEFAULT_LIFESTYLE;
  }

  /** Weekly cost from housing + car upkeep + meal plan. */
  getLifestyleWeeklyCost(): number {
    const L = this.getLifestyle();
    return UnifiedEngine.HOUSING_WEEKLY[L.housing]
      + UnifiedEngine.CAR_WEEKLY[L.car]
      + UnifiedEngine.MEAL_PLAN_WEEKLY[L.mealPlan];
  }

  /** One-time cost to upgrade to the given tier (for car or recovery). Current tier cost is not refunded. */
  getLifestyleOneTimeCost(category: 'car' | 'recoveryEquipment', tier: CarTier | RecoveryTier): number {
    if (category === 'car') return UnifiedEngine.CAR_COST[tier as CarTier];
    return UnifiedEngine.RECOVERY_COST[tier as RecoveryTier];
  }

  /** Next upgrade tier for a category, or null if at max. */
  getNextLifestyleUpgrade(category: 'housing' | 'car' | 'mealPlan' | 'recoveryEquipment'): { tier: HousingTier | CarTier | MealPlanTier | RecoveryTier; weeklyCost?: number; oneTimeCost?: number; label: string } | null {
    const L = this.getLifestyle();
    const orders = {
      housing: UnifiedEngine.HOUSING_ORDER,
      car: UnifiedEngine.CAR_ORDER,
      mealPlan: UnifiedEngine.MEAL_PLAN_ORDER,
      recoveryEquipment: UnifiedEngine.RECOVERY_ORDER,
    };
    const key = category;
    const order = orders[key];
    const current = L[key];
    const idx = order.indexOf(current);
    if (idx < 0 || idx >= order.length - 1) return null;
    const next = order[idx + 1] as HousingTier | CarTier | MealPlanTier | RecoveryTier;
    const labels: Record<string, string> = {
      none: 'None', basic: 'Basic', apartment: 'Apartment', nice_apartment: 'Nice apartment', luxury: 'Luxury',
      beater: 'Beater', used: 'Used car', reliable: 'Reliable car', nice: 'Nice car',
      good: 'Good', premium: 'Premium',
      pro: 'Pro equipment',
    };
    const weeklyCost = key === 'housing' ? UnifiedEngine.HOUSING_WEEKLY[next as HousingTier]
      : key === 'mealPlan' ? UnifiedEngine.MEAL_PLAN_WEEKLY[next as MealPlanTier]
      : key === 'car' ? UnifiedEngine.CAR_WEEKLY[next as CarTier] : undefined;
    const oneTimeCost = key === 'car' ? UnifiedEngine.CAR_COST[next as CarTier]
      : key === 'recoveryEquipment' ? UnifiedEngine.RECOVERY_COST[next as RecoveryTier] : undefined;
    return { tier: next, weeklyCost, oneTimeCost, label: labels[next] ?? next };
  }

  /** All current lifestyle options for UI (current tier + next upgrade if any). */
  getLifestyleOptions(): { category: 'housing' | 'car' | 'mealPlan' | 'recoveryEquipment'; current: string; currentWeekly?: number; nextUpgrade: { tier: string; weeklyCost?: number; oneTimeCost?: number; label: string } | null }[] {
    const L = this.getLifestyle();
    const label = (t: string) => ({ none: 'None', basic: 'Basic', apartment: 'Apartment', nice_apartment: 'Nice apartment', luxury: 'Luxury', beater: 'Beater', used: 'Used car', reliable: 'Reliable car', nice: 'Nice car', good: 'Good', premium: 'Premium', pro: 'Pro equipment' }[t] ?? t);
    const categories: ('housing' | 'car' | 'mealPlan' | 'recoveryEquipment')[] = ['housing', 'car', 'mealPlan', 'recoveryEquipment'];
    return categories.map((cat) => {
      const current = L[cat];
      const next = this.getNextLifestyleUpgrade(cat);
      const currentWeekly = cat === 'housing' ? UnifiedEngine.HOUSING_WEEKLY[current as HousingTier]
        : cat === 'mealPlan' ? UnifiedEngine.MEAL_PLAN_WEEKLY[current as MealPlanTier]
        : cat === 'car' ? UnifiedEngine.CAR_WEEKLY[current as CarTier] : undefined;
      return {
        category: cat,
        current: label(current),
        currentWeekly: currentWeekly || undefined,
        nextUpgrade: next ? { tier: next.tier, weeklyCost: next.weeklyCost, oneTimeCost: next.oneTimeCost, label: next.label } : null,
      };
    });
  }

  /** Purchase or upgrade lifestyle. Returns true if successful. */
  purchaseLifestyle(category: 'housing' | 'car' | 'mealPlan' | 'recoveryEquipment', tier: HousingTier | CarTier | MealPlanTier | RecoveryTier): { success: boolean; message: string } {
    const s = this.state;
    const L = s.lifestyle ?? UnifiedEngine.DEFAULT_LIFESTYLE;
    const orders = { housing: UnifiedEngine.HOUSING_ORDER, car: UnifiedEngine.CAR_ORDER, mealPlan: UnifiedEngine.MEAL_PLAN_ORDER, recoveryEquipment: UnifiedEngine.RECOVERY_ORDER };
    const order = orders[category];
    const currentIdx = order.indexOf(L[category]);
    const targetIdx = order.indexOf(tier);
    if (targetIdx <= currentIdx) return { success: false, message: 'Already at that tier or invalid.' };
    const oneTime = category === 'car' ? UnifiedEngine.CAR_COST[tier as CarTier] : category === 'recoveryEquipment' ? UnifiedEngine.RECOVERY_COST[tier as RecoveryTier] : 0;
    const money = s.money ?? 0;
    if (oneTime > money) return { success: false, message: `Need $${oneTime}; you have $${money}.` };
    if (!s.lifestyle) s.lifestyle = { ...UnifiedEngine.DEFAULT_LIFESTYLE };
    s.lifestyle[category] = tier;
    if (oneTime > 0) s.money = Math.max(0, money - oneTime);
    addStory(s, `Upgraded ${category}: now ${tier}.`);
    this.saveRng();
    return { success: true, message: `You upgraded to ${tier}.` };
  }

  /** Upgrade housing or meal plan (weekly cost; rent/food deducted each week). Requires one week's cost in bank to upgrade. */
  upgradeLifestyleWeekly(category: 'housing' | 'mealPlan', tier: HousingTier | MealPlanTier): { success: boolean; message: string } {
    const s = this.state;
    const L = s.lifestyle ?? UnifiedEngine.DEFAULT_LIFESTYLE;
    const order = category === 'housing' ? UnifiedEngine.HOUSING_ORDER : UnifiedEngine.MEAL_PLAN_ORDER;
    const currentIdx = order.indexOf(L[category]);
    const targetIdx = order.indexOf(tier);
    if (targetIdx <= currentIdx) return { success: false, message: 'Already at that tier or invalid.' };
    const weekly = category === 'housing' ? UnifiedEngine.HOUSING_WEEKLY[tier as HousingTier] : UnifiedEngine.MEAL_PLAN_WEEKLY[tier as MealPlanTier];
    const money = s.money ?? 0;
    if (weekly > money) return { success: false, message: `You need $${weekly} (one week) in the bank to switch; you have $${money}.` };
    if (!s.lifestyle) s.lifestyle = { ...UnifiedEngine.DEFAULT_LIFESTYLE };
    s.lifestyle[category] = tier;
    addStory(s, `Upgraded ${category}: now ${tier} ($${weekly}/wk).`);
    this.saveRng();
    return { success: true, message: `You upgraded to ${tier}. $${weekly}/week.` };
  }

  private applyLifestyleModifiers(): void {
    const L = this.getLifestyle();
    const w = this.state.weekModifiers ?? defaultWeekModifiers();
    if (L.housing === 'nice_apartment') { w.performanceMult += 0.02; w.reasons.push('Nice apartment'); }
    if (L.housing === 'luxury') { w.performanceMult += 0.04; w.reasons.push('Luxury place'); }
    if (L.mealPlan === 'good') { w.trainingMult += 0.03; w.reasons.push('Good meals'); }
    if (L.mealPlan === 'premium') { w.trainingMult += 0.06; w.reasons.push('Premium meals'); }
    if (L.recoveryEquipment === 'basic') { w.injuryRiskMult -= 0.05; w.reasons.push('Recovery gear'); }
    if (L.recoveryEquipment === 'pro') { w.injuryRiskMult -= 0.12; w.reasons.push('Pro recovery'); }
  }

  private applyWeekModifierDeltas(
    deltas: { trainingMult?: number; performanceMult?: number; injuryRiskMult?: number; weightCutSeverityMult?: number },
    reason: string,
  ): void {
    const s = this.state;
    const w = s.weekModifiers ?? defaultWeekModifiers();
    if (deltas.trainingMult != null) w.trainingMult += deltas.trainingMult;
    if (deltas.performanceMult != null) w.performanceMult += deltas.performanceMult;
    if (deltas.injuryRiskMult != null) w.injuryRiskMult += deltas.injuryRiskMult;
    if (deltas.weightCutSeverityMult != null) w.weightCutSeverityMult += deltas.weightCutSeverityMult;
    if (reason && !w.reasons.includes(reason)) w.reasons.push(reason);
  }

  getChoicePreview(choiceKey: string): ChoicePreview | null {
    const hours = UnifiedEngine.HOURS_COST[choiceKey] ?? 6;
    const money = UnifiedEngine.MONEY_COST[choiceKey] ?? 0;
    const md = UnifiedEngine.MODIFIER_DELTAS[choiceKey];
    const modifierDeltas = md ? {
      trainingMult: md.trainingMult,
      performanceMult: md.performanceMult,
      injuryRiskMult: md.injuryRiskMult,
      weightCutSeverityMult: md.weightCutSeverityMult,
    } : undefined;
    const reason = md?.reason;
    const base: ChoicePreview = { hours, money, reason, modifierDeltas };
    switch (choiceKey) {
      case 'train_technique':
      case 'train_conditioning':
      case 'train_strength':
        return { ...base, energy: -20 };
      case 'study_film':
        return { ...base, energy: 5 };
      case 'compete':
        return { ...base, energy: -14 };
      case 'rest':
        return { ...base, health: 3, happiness: 2, energy: 28, stress: -2 };
      case 'study':
        return { ...base, energy: 8 };
      case 'hang_out':
        return { ...base, energy: 10 };
      case 'part_time_job':
        return { ...base };
      case 'relationship_time':
        return { ...base };
      case 'date':
        return { ...base, happiness: 8 };
      case 'party':
        return { ...base, happiness: 5, energy: -5 };
      case 'argument':
        return { ...base, stress: 5, happiness: -5 };
      case 'interview':
        return { ...base, happiness: 3 };
      case 'rehab':
        return { ...base, health: 5 };
      default:
        return base;
    }
  }

  getChoices(): ChoiceItem[] {
    const s = this.state;
    const hoursLeft = s.hoursLeftThisWeek ?? HOURS_PER_WEEK;
    const money = s.money ?? 0;
    if (hoursLeft <= 0) return [];
    const list: ChoiceItem[] = [
      { key: 'train_technique', label: 'Train technique', tab: 'training' },
      { key: 'train_conditioning', label: 'Train conditioning', tab: 'training' },
      { key: 'train_strength', label: 'Lift weights', tab: 'training' },
      { key: 'study_film', label: 'Study film', tab: 'training' },
      ...(isInCollege(s) ? [{ key: 'compete', label: 'Compete / scrimmage', tab: 'training' as const }] : []),
      { key: 'rest', label: 'Rest and recover', tab: 'training' },
      { key: 'study', label: 'Study', tab: 'life' },
      { key: 'hang_out', label: 'Hang out', tab: 'life' },
      { key: 'party', label: 'Party', tab: 'life' },
      { key: 'interview', label: 'Media interview', tab: 'life' },
      { key: 'rehab', label: 'Rehab / recovery', tab: 'life' },
    ];
    if (isInCollege(s)) list.push({ key: 'part_time_job', label: 'Part-time job', tab: 'life' });
    if (s.relationship) {
      list.push({ key: 'relationship_time', label: 'Spend time with ' + s.relationship.partnerName, tab: 'relationship' });
      list.push({ key: 'date', label: 'Date night', tab: 'relationship' });
      list.push({ key: 'argument', label: 'Argument (stress)', tab: 'relationship' });
    }
    return list.filter((c) => {
      const h = UnifiedEngine.HOURS_COST[c.key] ?? 6;
      const m = UnifiedEngine.MONEY_COST[c.key] ?? 0;
      return h <= hoursLeft && m <= money;
    });
  }

  applyChoice(choiceKey: string): void {
    const s = this.state;
    const hoursCost = UnifiedEngine.HOURS_COST[choiceKey] ?? 6;
    const moneyCost = UnifiedEngine.MONEY_COST[choiceKey] ?? 0;
    s.hoursLeftThisWeek = Math.max(0, (s.hoursLeftThisWeek ?? HOURS_PER_WEEK) - hoursCost);
    if (moneyCost > 0) s.money = Math.max(0, (s.money ?? 0) - moneyCost);
    const mod = UnifiedEngine.MODIFIER_DELTAS[choiceKey];
    if (mod) {
      this.applyWeekModifierDeltas(
        {
          trainingMult: mod.trainingMult,
          performanceMult: mod.performanceMult,
          injuryRiskMult: mod.injuryRiskMult,
          weightCutSeverityMult: mod.weightCutSeverityMult,
        },
        mod.reason,
      );
    }
    const energyCost = 20;
    const eff = getEffectiveModifiers(s);
    const canTrainHard = (s.energy ?? 100) >= 25;
    const mult = () => {
      const cap = s.yearlyGrowthCap ?? 14;
      const used = s.yearlyGrowthUsed ?? 0;
      if (used >= cap) return 0;
      const ef = 0.4 + 0.6 * ((s.energy ?? 100) / 100);
      const rem = cap - used;
      const cf = rem <= 2 ? 0.2 : rem <= 4 ? 0.6 : 1;
      return Math.min(1, ef * cf);
    };
    /** useYearlyCap: false for conditioning/strength so they can grow every week when you train; true for technique/matIQ (skill cap). */
    const addGrowth = (attr: keyof UnifiedState, raw: number, useYearlyCap = true) => {
      const cur = (s[attr] as number) ?? 50;
      const ceiling = s.potentialCeiling ?? 99;
      const diminished = raw > 0 ? (cur >= 92 ? raw * 0.25 : cur >= 85 ? raw * 0.5 : raw) : 0;
      const effectiveMult = useYearlyCap ? mult() : (0.5 + 0.5 * ((s.energy ?? 100) / 100)) * eff.trainingMult;
      const actual = useYearlyCap
        ? Math.floor(diminished * effectiveMult)
        : Math.floor(diminished * Math.min(1, effectiveMult));
      const remainingCap = useYearlyCap ? (s.yearlyGrowthCap ?? 14) - (s.yearlyGrowthUsed ?? 0) : actual + 1;
      const capped = Math.min(ceiling - cur, actual, remainingCap);
      if (capped > 0) {
        (s as unknown as Record<string, number>)[attr] = cur + capped;
        if (useYearlyCap) s.yearlyGrowthUsed = (s.yearlyGrowthUsed ?? 0) + capped;
      }
    };

    switch (choiceKey) {
      case 'train_technique':
        s.trainedThisWeek = true;
        s.consecutiveRestWeeks = 0;
        s.energy = Math.max(0, (s.energy ?? 100) - energyCost);
        addGrowth('technique', canTrainHard ? this.rng.int(1, 3) : this.rng.int(0, 1));
        if (s.techniqueTranslationWeeks) s.techniqueTranslationWeeks--;
        addStory(s, canTrainHard ? 'You drilled hard. Technique improved.' : 'You were tired; light technique work.');
        break;
      case 'train_conditioning':
        s.trainedThisWeek = true;
        s.consecutiveRestWeeks = 0;
        s.energy = Math.max(0, (s.energy ?? 100) - energyCost);
        addGrowth('conditioning', canTrainHard ? this.rng.int(1, 3) : this.rng.int(0, 1), false);
        addStory(s, 'You pushed your cardio. Gas tank improved.');
        break;
      case 'train_strength':
        s.trainedThisWeek = true;
        s.consecutiveRestWeeks = 0;
        s.energy = Math.max(0, (s.energy ?? 100) - energyCost);
        addGrowth('strength', canTrainHard ? this.rng.int(0, 2) : this.rng.int(0, 1), false);
        addStory(s, 'You hit the weight room. Stronger.');
        break;
      case 'study_film':
        s.consecutiveRestWeeks = 0;
        addGrowth('matIQ', this.rng.int(0, 2));
        s.energy = Math.min(100, (s.energy ?? 100) + 5);
        addStory(s, 'Film study paid off. Mat IQ up.');
        break;
      case 'compete':
        s.trainedThisWeek = true;
        s.energy = Math.max(0, (s.energy ?? 100) - 14);
        const matches = this.rng.int(2, 5);
        let w = 0, l = 0;
        for (let i = 0; i < matches; i++) {
          let winChance = clamp(0.02, 0.98, 0.45 + (s.overallRating ?? 50) / 120);
          winChance = clamp(0.02, 0.98, winChance * eff.performanceMult);
          if (this.rng.float() < winChance) { s.stats.matchesWon++; s.stats.seasonWins++; w++; }
          else { s.stats.matchesLost++; s.stats.seasonLosses++; l++; }
        }
        s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(2, 6));
        s.stats.hsRecord.matchesWon += w;
        s.stats.hsRecord.matchesLost += l;
        addStory(s, `You competed. Went ${w}-${l} this week.`);
        break;
      case 'rest':
        s.didRestOrRehabThisWeek = true;
        s.consecutiveRestWeeks = (s.consecutiveRestWeeks ?? 0) + 1;
        s.health = Math.min(100, (s.health ?? 100) + this.rng.int(2, 5));
        s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(1, 4));
        s.energy = Math.min(100, (s.energy ?? 100) + 28);
        s.stress = Math.max(0, (s.stress ?? 0) - this.rng.int(1, 3));
        addStory(s, 'You rested. Body and mind feel better.');
        break;
      case 'study':
        s.studiedThisWeek = true;
        s.grades = Math.min(100, (s.grades ?? 75) + this.rng.int(1, 4));
        s.energy = Math.min(100, (s.energy ?? 100) + 8);
        addStory(s, 'You hit the books. Grades improved.');
        break;
      case 'hang_out':
        s.social = Math.min(100, (s.social ?? 50) + this.rng.int(2, 5));
        s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(1, 4));
        s.energy = Math.min(100, (s.energy ?? 100) + 10);
        addStory(s, 'You hung out. Social and mood improved.');
        break;
      case 'part_time_job':
        s.didPartTimeThisWeek = true;
        s.money = (s.money ?? 0) + this.rng.int(200, 450);
        s.health = Math.max(0, (s.health ?? 100) - this.rng.int(0, 2));
        addStory(s, 'You worked a shift. Earned some cash.');
        break;
      case 'relationship_time':
        if (s.relationship) {
          s.relationship.level = Math.min(100, (s.relationship.level ?? 50) + this.rng.int(2, 5));
          addStory(s, 'You spent time with ' + s.relationship.partnerName + '. Relationship stronger.');
        }
        break;
      case 'date':
        if (s.relationship) {
          s.relationship.level = Math.min(100, (s.relationship.level ?? 50) + this.rng.int(3, 6));
          s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(5, 12));
          addStory(s, 'Date night with ' + s.relationship.partnerName + '. Great week for performance.');
        }
        break;
      case 'party':
        s.social = Math.min(100, (s.social ?? 50) + this.rng.int(3, 6));
        s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(2, 6));
        s.energy = Math.max(0, (s.energy ?? 100) - 5);
        addStory(s, 'You went to a party. Social up but training takes a hit this week.');
        break;
      case 'argument':
        s.stress = Math.min(100, (s.stress ?? 0) + this.rng.int(4, 8));
        s.happiness = Math.max(0, (s.happiness ?? 75) - this.rng.int(3, 7));
        if (s.relationship) s.relationship.level = Math.max(0, (s.relationship.level ?? 50) - this.rng.int(2, 4));
        addStory(s, 'Argument with ' + (s.relationship?.partnerName ?? 'someone') + '. Performance may suffer.');
        break;
      case 'interview':
        s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(2, 5));
        addStory(s, 'Media interview went well. Slight confidence boost.');
        break;
      case 'rehab':
        s.didRestOrRehabThisWeek = true;
        s.health = Math.min(100, (s.health ?? 100) + this.rng.int(4, 8));
        addStory(s, 'Rehab session. Injury risk down, body recovering.');
        break;
      default:
        addStory(s, 'Week ' + s.week + ', Year ' + s.year + '.');
    }
    updateRating(s);
    this.computeRecruitingScore();
    this.saveRng();
  }

  private computeRecruitingScore(): void {
    const s = this.state;
    let score = s.trueSkill ?? 50;
    if ((s.grades ?? 75) >= 3.5) score += 8;
    else if ((s.grades ?? 75) < 2.5) score -= 10;
    (s.stats.statePlacements ?? []).forEach((p) => { if (p === 1) score += 4; else if (p <= 4) score += 1.5; });
    (s.stats.fargoPlacements ?? []).forEach((p) => { if (p <= 2) score += 3; else if (p <= 4) score += 2; });
    s.recruitingScore = Math.round(clamp(0, 100, score));
  }

  /** GPA from grades 0–100: 2.0–4.0 scale. */
  private gradesToGPA(grades: number): number {
    return 2 + (grades / 100) * 2;
  }

  /** College weight classes (schools use these); map HS weight to nearest for need lookup. */
  private collegeWeightForNeed(playerWeight: number): number {
    let best = COLLEGE_WEIGHT_CLASSES[0];
    for (const w of COLLEGE_WEIGHT_CLASSES) {
      if (Math.abs(w - playerWeight) < Math.abs(best - playerWeight)) best = w;
    }
    return best;
  }

  /** Map HS weight to nearest NCAA college weight (used when entering college). */
  private mapToCollegeWeight(hsWeight: number): number {
    return this.collegeWeightForNeed(hsWeight);
  }

  private generateCollegeOffers(): void {
    const s = this.state;
    const gpa = this.gradesToGPA(s.grades ?? 75);
    const recScore = clamp(0, 100, s.recruitingScore ?? 50);
    const wc = s.weightClass ?? 145;
    const collegeWc = this.collegeWeightForNeed(wc);
    const needAt = (sc: School) => sc.needsByWeight[collegeWc] ?? sc.needsByWeight[wc] ?? 0;
    const meetsGPA = (sc: School) => sc.academicMinGPA <= gpa;
    const hasNeed = (sc: School) => needAt(sc) >= 1;

    const byDivision = {
      D1: SCHOOLS.filter((sc) => sc.division === 'D1' && meetsGPA && hasNeed(sc)),
      D2: SCHOOLS.filter((sc) => sc.division === 'D2' && meetsGPA && hasNeed(sc)),
      D3: SCHOOLS.filter((sc) => sc.division === 'D3' && meetsGPA && hasNeed(sc)),
      NAIA: SCHOOLS.filter((sc) => sc.division === 'NAIA' && meetsGPA && hasNeed(sc)),
      JUCO: SCHOOLS.filter((sc) => sc.division === 'JUCO' && meetsGPA && hasNeed(sc)),
    };
    if (byDivision.JUCO.length === 0) byDivision.JUCO = SCHOOLS.filter((sc) => sc.division === 'JUCO');
    if (byDivision.NAIA.length === 0) byDivision.NAIA = SCHOOLS.filter((sc) => sc.division === 'NAIA');

    const pick = (arr: School[], n: number): School[] => {
      const sh = [...arr].sort(() => this.rng.float() - 0.5);
      return sh.slice(0, Math.min(n, sh.length));
    };
    let pool: School[] = [];
    if (recScore >= 70) {
      pool = [...pick(byDivision.D1, 4), ...pick(byDivision.D2, 2)];
    } else if (recScore >= 55) {
      pool = [...pick(byDivision.D1, 2), ...pick(byDivision.D2, 2), ...pick(byDivision.D3, 1), ...pick(byDivision.NAIA, 1)];
    } else if (recScore >= 40) {
      pool = [...pick(byDivision.D1, 1), ...pick(byDivision.D2, 2), ...pick(byDivision.D3, 1), ...pick(byDivision.NAIA, 1), ...pick(byDivision.JUCO, 1)];
    } else if (recScore >= 25) {
      pool = [...pick(byDivision.D2, 1), ...pick(byDivision.D3, 2), ...pick(byDivision.NAIA, 1), ...pick(byDivision.JUCO, 2)];
    } else {
      pool = [...pick(byDivision.D3, 1), ...pick(byDivision.NAIA, 2), ...pick(byDivision.JUCO, 3)];
    }
    pool = pool.filter((sc) => sc != null);
    if (pool.length === 0) {
      pool = [...byDivision.JUCO, ...byDivision.NAIA].slice(0, 6);
    }
    if (pool.length === 0) {
      pool = SCHOOLS.filter((sc) => sc.division === 'JUCO' || sc.division === 'NAIA').slice(0, 6);
    }

    const offers: CollegeOffer[] = [];
    const recNorm = recScore / 100;
    const week = s.week ?? 1;
    const year = s.year ?? 1;
    for (const sc of pool) {
      const need = needAt(sc) || 3;
      const needNorm = Math.min(1, need / 5);
      const tuitionPct = clamp(15, 85, 20 + Math.floor((needNorm * 30 + recNorm * 35) * (0.85 + this.rng.float() * 0.3)));
      const nilCap = sc.division === 'D1' ? 8000 : sc.division === 'D2' ? 4000 : sc.division === 'NAIA' ? 3000 : 2000;
      const nilAnnual = this.rng.int(0, Math.min(nilCap, Math.floor((sc.scholarshipBudget ?? 0) / 50)));
      const housingStipend = sc.division === 'D1' ? this.rng.int(0, 2000) : this.rng.int(0, 800);
      const mealPlanPct = this.rng.int(0, 50);
      offers.push({
        id: `offer_${sc.id}_${year}_${week}`,
        schoolId: sc.id,
        schoolName: sc.name,
        division: sc.division as LeagueKey,
        tuitionCoveredPct: tuitionPct,
        nilAnnual,
        housingStipend,
        mealPlanPct,
        guaranteedStarter: recNorm >= 0.7 && this.rng.float() < 0.35,
        deadlineWeek: week + 4,
        offeredAtWeek: week,
      });
    }
    s.offers = offers;
    this.saveRng();
  }

  getCollegeOffers(): CollegeOffer[] {
    return Array.isArray(this.state.offers) ? (this.state.offers as CollegeOffer[]) : [];
  }

  getSchools(): School[] {
    return SCHOOLS;
  }

  getCanAdvanceWeek(): boolean {
    return !this.state.pendingCollegeChoice && !this.state.transferPortalActive;
  }

  /** True if player is in college (not HS) and has eligibility left. */
  canEnterTransferPortal(): boolean {
    const s = this.state;
    if (HS_LEAGUES.indexOf(s.league) !== -1) return false;
    if ((s.eligibilityYearsRemaining ?? 0) <= 0) return false;
    return !s.transferPortalActive;
  }

  enterTransferPortal(): boolean {
    const s = this.state;
    if (!this.canEnterTransferPortal()) return false;
    s.transferPortalActive = true;
    this.generateTransferOffers();
    addStory(s, 'You entered the transfer portal. Other schools can contact you; pick a new school or withdraw.');
    this.saveRng();
    return true;
  }

  private generateTransferOffers(): void {
    const s = this.state;
    const currentName = (s.collegeName ?? '').toLowerCase();
    const otherSchools = SCHOOLS.filter((sc) => sc.name.toLowerCase() !== currentName && HS_LEAGUES.indexOf(sc.division as LeagueKey) === -1);
    const wc = s.weightClass ?? 145;
    const needAt = (sc: School) => sc.needsByWeight[wc] ?? sc.needsByWeight[this.collegeWeightForNeed(wc)] ?? 0;
    const pick = (arr: School[], n: number): School[] => {
      const sh = [...arr].sort(() => this.rng.float() - 0.5);
      return sh.slice(0, Math.min(n, sh.length));
    };
    const rating = s.overallRating ?? 60;
    // More generous pool: lower thresholds so better schools appear more often
    let pool: School[] = rating >= 70 ? pick(otherSchools.filter((sc) => sc.division === 'D1'), 5)
      : rating >= 62 ? [...pick(otherSchools.filter((sc) => sc.division === 'D1'), 3), ...pick(otherSchools.filter((sc) => sc.division === 'D2'), 2)]
      : rating >= 55 ? [...pick(otherSchools.filter((sc) => sc.division === 'D1'), 1), ...pick(otherSchools.filter((sc) => sc.division === 'D2'), 2), ...pick(otherSchools.filter((sc) => sc.division === 'D3' || sc.division === 'NAIA'), 2)]
      : [...pick(otherSchools.filter((sc) => sc.division === 'D2'), 2), ...pick(otherSchools.filter((sc) => sc.division === 'D3' || sc.division === 'NAIA'), 2), ...pick(otherSchools.filter((sc) => sc.division === 'JUCO'), 1)];
    if (pool.length === 0) pool = otherSchools.slice(0, 6);
    const offers: CollegeOffer[] = [];
    const week = s.week ?? 1;
    const year = s.year ?? 1;
    // Higher NIL caps and floor so transfer offers are more substantial
    const nilCaps: Record<string, number> = { D1: 14000, D2: 7000, D3: 3500, NAIA: 4000, JUCO: 3000 };
    for (const sc of pool) {
      const need = needAt(sc) || 3;
      const needNorm = Math.min(1, need / 5);
      const recNorm = (s.recruitingScore ?? 50) / 100;
      const ratingNorm = (rating - 50) / 50;
      const tuitionPct = clamp(25, 95, 30 + Math.floor((needNorm * 30 + recNorm * 35 + ratingNorm * 10) * (0.95 + this.rng.float() * 0.15)));
      const nilCap = nilCaps[sc.division] ?? 3000;
      const nilFloor = Math.floor(nilCap * 0.2);
      const nilAnnual = this.rng.int(nilFloor, Math.min(nilCap, Math.max(nilFloor, Math.floor((sc.scholarshipBudget ?? 0) / 45))));
      offers.push({
        id: `transfer_${sc.id}_${year}_${week}`,
        schoolId: sc.id,
        schoolName: sc.name,
        division: sc.division as LeagueKey,
        tuitionCoveredPct: tuitionPct,
        nilAnnual,
        housingStipend: sc.division === 'D1' ? this.rng.int(400, 2200) : sc.division === 'D2' ? this.rng.int(200, 1200) : this.rng.int(0, 800),
        mealPlanPct: this.rng.int(10, 50),
        guaranteedStarter: this.rng.float() < 0.5,
        deadlineWeek: week + 4,
        offeredAtWeek: week,
      });
    }
    s.transferOffers = offers;
  }

  getTransferOffers(): CollegeOffer[] {
    return Array.isArray(this.state.transferOffers) ? (this.state.transferOffers as CollegeOffer[]) : [];
  }

  negotiateTransferOffer(schoolId: string, request: { moreTuition?: boolean; moreNIL?: boolean }): { success: boolean; message: string; kind?: 'tuition' | 'nil' } {
    const s = this.state;
    const offers = this.getTransferOffers();
    const idx = offers.findIndex((o) => o.schoolId === schoolId);
    const kind = request.moreTuition ? 'tuition' : 'nil';
    if (idx < 0 || !request.moreTuition && !request.moreNIL) return { success: false, message: 'No offer or invalid request.', kind };
    const school = SCHOOLS.find((sc) => sc.id === schoolId);
    if (!school) return { success: false, message: 'School not found.', kind };
    const need = school.needsByWeight[this.collegeWeightForNeed(s.weightClass ?? 145)] ?? school.needsByWeight[s.weightClass ?? 145] ?? 3;
    const recNorm = (s.recruitingScore ?? 50) / 100;
    const ratingNorm = ((s.overallRating ?? 60) - 50) / 50;
    const chance = clamp(0.35, 0.85, 0.4 + recNorm * 0.3 + (need / 5) * 0.2 + school.coachAggressiveness * 0.1 + ratingNorm * 0.1);
    if (this.rng.float() >= chance) {
      this.saveRng();
      return { success: false, message: "They didn't budge.", kind };
    }
    const offer = offers[idx] as CollegeOffer;
    const updated = { ...offer };
    if (request.moreTuition && offer.tuitionCoveredPct < 100) {
      updated.tuitionCoveredPct = Math.min(100, offer.tuitionCoveredPct + 5 + this.rng.next() % 8);
    }
    if (request.moreNIL) {
      const cap = school.division === 'D1' ? 18000 : school.division === 'D2' ? 10000 : school.division === 'NAIA' ? 6000 : 4500;
      updated.nilAnnual = Math.min(cap, offer.nilAnnual + 600 + this.rng.next() % 1200);
    }
    (s.transferOffers as CollegeOffer[])[idx] = updated;
    this.saveRng();
    return { success: true, message: 'They increased the offer.', kind };
  }

  acceptTransfer(schoolId: string): boolean {
    const s = this.state;
    const offers = this.getTransferOffers();
    const offer = offers.find((o) => o.schoolId === schoolId);
    if (!offer || !s.transferPortalActive) return false;
    const school = SCHOOLS.find((sc) => sc.id === schoolId);
    if (!school) return false;
    const prevName = s.collegeName;
    s.collegeName = school.name;
    s.league = offer.division;
    s.transferPortalActive = false;
    s.transferOffers = [];
    s.collegeSchedule = this.generateCollegeSchedule();
    s.collegeRoster = this.generateCollegeRoster();
    addStory(s, `You transferred from ${prevName ?? 'your previous school'} to ${school.name}.`);
    this.saveRng();
    return true;
  }

  withdrawFromTransferPortal(): boolean {
    const s = this.state;
    if (!s.transferPortalActive) return false;
    s.transferPortalActive = false;
    s.transferOffers = [];
    addStory(s, 'You withdrew from the transfer portal and are staying at your current school.');
    this.saveRng();
    return true;
  }

  acceptOffer(schoolId: string): boolean {
    const s = this.state;
    const offers = this.getCollegeOffers();
    const offer = offers.find((o) => o.schoolId === schoolId);
    if (!offer || s.pendingCollegeChoice !== true) return false;
    const school = SCHOOLS.find((sc) => sc.id === schoolId);
    if (!school) return false;
    s.collegeName = school.name;
    s.league = offer.division;
    s.pendingCollegeChoice = false;
    s.offers = [];
    s.fromHS = true;
    s.weeksInCollege = 0;
    s.eligibilityYearsRemaining = 4;
    const oldWeight = s.weightClass ?? 145;
    s.weightClass = this.mapToCollegeWeight(oldWeight);
    const bump = () => this.rng.int(1, 3);
    s.technique = Math.min(100, (s.technique ?? 50) + bump());
    s.matIQ = Math.min(100, (s.matIQ ?? 50) + bump());
    s.conditioning = Math.min(100, (s.conditioning ?? 50) + bump());
    s.strength = Math.min(100, (s.strength ?? 50) + bump());
    s.speed = Math.min(100, (s.speed ?? 50) + bump());
    s.flexibility = Math.min(100, (s.flexibility ?? 50) + bump());
    updateRating(s);
    s.collegeSchedule = this.generateCollegeSchedule();
    s.collegeRoster = this.generateCollegeRoster();
    addStory(s, `You're committed to ${school.name}! You're now at ${s.weightClass} lbs (college weights). Attributes and overall updated for the next level.`);
    this.computeRecruitingScore();
    this.saveRng();
    return true;
  }

  negotiateOffer(schoolId: string, request: { moreTuition?: boolean; moreNIL?: boolean }): { success: boolean; message: string; kind?: 'tuition' | 'nil' } {
    const s = this.state;
    const offers = this.getCollegeOffers();
    const idx = offers.findIndex((o) => o.schoolId === schoolId);
    const kind = request.moreTuition ? 'tuition' : 'nil';
    if (idx < 0 || !request.moreTuition && !request.moreNIL) return { success: false, message: 'No offer or invalid request.', kind };
    const school = SCHOOLS.find((sc) => sc.id === schoolId);
    if (!school) return { success: false, message: 'School not found.', kind };
    const need = school.needsByWeight[this.collegeWeightForNeed(s.weightClass ?? 145)] ?? 3;
    const recNorm = (s.recruitingScore ?? 50) / 100;
    const chance = clamp(0.2, 0.75, 0.3 + recNorm * 0.35 + (need / 5) * 0.2 + school.coachAggressiveness * 0.1);
    if (this.rng.float() >= chance) {
      this.saveRng();
      return { success: false, message: "They didn't budge.", kind };
    }
    const offer = offers[idx] as CollegeOffer;
    const updated = { ...offer };
    if (request.moreTuition && offer.tuitionCoveredPct < 100) {
      updated.tuitionCoveredPct = Math.min(100, offer.tuitionCoveredPct + 5 + this.rng.next() % 6);
    }
    if (request.moreNIL) {
      const cap = school.division === 'D1' ? 12000 : 5000;
      updated.nilAnnual = Math.min(cap, offer.nilAnnual + 500 + this.rng.next() % 1000);
    }
    (s.offers as CollegeOffer[])[idx] = updated;
    this.saveRng();
    return { success: true, message: 'They increased the offer.', kind };
  }

  private generateOpponentPools(weightClass: number): OpponentPools {
    const first = ['Jake', 'Kyle', 'David', 'Ryan', 'Cole', 'Blake', 'Mason', 'Hunter', 'Chase', 'Tyler'];
    const last = ['Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson'];
    const styles: Opponent['style'][] = ['grinder', 'scrambler', 'defensive'];
    const unranked: Opponent[] = [];
    for (let i = 0; i < 30; i++) {
      unranked.push({
        id: `unr_${weightClass}_${this.rng.next()}`,
        name: first[this.rng.next() % first.length] + ' ' + last[this.rng.next() % last.length],
        overallRating: clamp(40, 88, 50 + (this.rng.float() - 0.5) * 50),
        style: styles[this.rng.next() % 3],
        clutch: this.rng.int(20, 80),
      });
    }
    const stateRanked: Opponent[] = [];
    for (let r = 1; r <= 20; r++) {
      stateRanked.push({
        id: `state_${weightClass}_${r}`,
        name: first[this.rng.next() % first.length] + ' ' + last[this.rng.next() % last.length],
        overallRating: clamp(55, 95, 60 + (this.rng.float() - 0.5) * 30),
        stateRank: r,
        style: styles[this.rng.next() % 3],
        clutch: this.rng.int(30, 90),
      });
    }
    stateRanked.sort((a, b) => b.overallRating - a.overallRating);
    const nationalRanked: Opponent[] = [];
    for (let r = 1; r <= 20; r++) {
      nationalRanked.push({
        id: `nat_${weightClass}_${r}`,
        name: first[this.rng.next() % first.length] + ' ' + last[this.rng.next() % last.length],
        overallRating: clamp(65, 99, 70 + (this.rng.float() - 0.5) * 25),
        nationalRank: r,
        stateRank: this.rng.int(1, 10),
        style: styles[this.rng.next() % 3],
        clutch: this.rng.int(40, 95),
      });
    }
    nationalRanked.sort((a, b) => b.overallRating - a.overallRating);
    return { unranked, stateRanked, nationalRanked };
  }

  private generateHSSchedule(): HSScheduleEntry[] {
    const wc = this.state.weightClass ?? 145;
    if (!this.state.opponentPools) this.state.opponentPools = this.generateOpponentPools(wc);
    const pools = this.state.opponentPools;
    const template: { week: number; type: HSScheduleEntry['type'] }[] = [
      { week: 39, type: 'dual' }, { week: 40, type: 'dual' }, { week: 41, type: 'tournament' },
      { week: 42, type: 'dual' }, { week: 43, type: 'rival' }, { week: 44, type: 'tournament' },
      { week: 45, type: 'dual' }, { week: 46, type: 'dual' }, { week: 47, type: 'tournament' },
      { week: 48, type: 'dual' }, { week: 49, type: 'dual' },
    ];
    const stateWeeks = [39, 42, 45];
    const nationalWeek = (this.state.recruitingScore ?? 50) >= 55 || (this.state.stats?.fargoPlacements?.length ?? 0) > 0 ? 43 : null;
    const entries: HSScheduleEntry[] = template.map((t) => {
      let opponentId: string | undefined;
      if (t.type === 'dual' || t.type === 'rival') {
        if (nationalWeek === t.week && pools.nationalRanked.length > 0)
          opponentId = pools.nationalRanked[this.rng.next() % pools.nationalRanked.length].id;
        else if (stateWeeks.includes(t.week) && pools.stateRanked.length > 0)
          opponentId = pools.stateRanked[this.rng.next() % pools.stateRanked.length].id;
        else if (pools.unranked.length > 0)
          opponentId = pools.unranked[this.rng.next() % pools.unranked.length].id;
      }
      return { week: t.week, type: t.type, opponentId };
    });
    return entries;
  }

  private generateCollegeSchedule(): CollegeScheduleEntry[] {
    const mySchoolName = (this.state.collegeName ?? 'College').toLowerCase();
    const opponents = SCHOOLS.filter((sc) => !sc.name.toLowerCase().includes(mySchoolName) && mySchoolName !== sc.name.toLowerCase()).map((sc) => sc.name);
    const shuffle = (arr: string[]) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = this.rng.next() % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    const oppNames = shuffle(opponents.length >= 5 ? opponents : [...opponents, 'Central State', 'Eastern U', 'Western U', 'Northern U', 'Southern U'].slice(0, 7));
    const tournamentNames = ['Midlands', 'Southern Scuffle', 'Cliff Keen', 'Beast of the East', 'Colonial'];
    const entries: CollegeScheduleEntry[] = [
      { week: 1, type: 'dual', opponentName: oppNames[0] },
      { week: 2, type: 'dual', opponentName: oppNames[1] },
      { week: 3, type: 'tournament', tournamentName: tournamentNames[this.rng.next() % tournamentNames.length] },
      { week: 4, type: 'dual', opponentName: oppNames[2] },
      { week: 5, type: 'dual', opponentName: oppNames[3] },
      { week: 6, type: 'tournament', tournamentName: tournamentNames[this.rng.next() % tournamentNames.length] },
      { week: 7, type: 'dual', opponentName: oppNames[4] },
      { week: 8, type: 'conference' },
      { week: 12, type: 'ncaa' },
    ];
    return entries;
  }

  private generateCollegeRoster(): CollegeTeammate[] {
    const s = this.state;
    const firstNames = ['James', 'Marcus', 'David', 'Ryan', 'Cole', 'Jordan', 'Alex', 'Kyle', 'Chase', 'Carter', 'Parker', 'Brooks', 'Tyler', 'Devin', 'Luke'];
    const roster: CollegeTeammate[] = [];
    const baseRating = s.league === 'D1' ? 62 : s.league === 'D2' ? 58 : s.league === 'D3' ? 56 : s.league === 'NAIA' ? 55 : 54;
    for (const wc of COLLEGE_WEIGHT_CLASSES) {
      const depth = 2 + (this.rng.next() % 2);
      const atMyWeight = wc === (s.weightClass ?? 145);
      const players: CollegeTeammate[] = [];
      if (atMyWeight) {
        players.push({
          id: 'player',
          name: s.name,
          weightClass: wc,
          overallRating: s.overallRating ?? 50,
          isPlayer: true,
        });
      }
      for (let i = 0; i < depth - (atMyWeight ? 1 : 0); i++) {
        const name = firstNames[this.rng.next() % firstNames.length] + ' ' + (this.rng.next() % 2 ? 'Smith' : 'Jones');
        const rating = clamp(45, 85, baseRating + this.rng.int(-8, 12));
        players.push({ id: `tm_${wc}_${i}`, name, weightClass: wc, overallRating: rating, isPlayer: false });
      }
      players.sort((a, b) => b.overallRating - a.overallRating);
      roster.push(...players);
    }
    return roster;
  }

  /** True if player is the best at their weight on the roster (starter for duals). */
  private isStarterAtWeight(): boolean {
    const s = this.state;
    const roster = s.collegeRoster ?? [];
    const atWeight = roster.filter((r) => r.weightClass === (s.weightClass ?? 145));
    if (atWeight.length === 0) return true;
    const best = atWeight.reduce((a, b) => (a.overallRating >= b.overallRating ? a : b));
    return best.isPlayer;
  }

  private findOpponent(id: string): Opponent | null {
    const p = this.state.opponentPools;
    if (!p) return null;
    const all = [...p.unranked, ...p.stateRanked, ...p.nationalRanked];
    return all.find((o) => o.id === id) ?? null;
  }

  private simOneMatch(opponent: Opponent, isRival: boolean): { won: boolean; method: string } {
    const s = this.state;
    const eff = getEffectiveModifiers(s);
    let winChance = 0.45 + (s.overallRating ?? 50) / 120 - opponent.overallRating / 120;
    winChance *= eff.performanceMult;
    if (isRival) winChance += (this.rng.float() - 0.5) * 0.2;
    winChance = clamp(0.05, 0.95, winChance);
    const won = this.rng.float() < winChance;
    const method = won ? (this.rng.float() < 0.3 ? 'Fall' : this.rng.float() < 0.5 ? 'Tech' : 'Dec') : 'Dec';
    return { won, method };
  }

  /**
   * Run an 8-man double-elimination bracket from the player's POV.
   * Winner's bracket: quarters → semis → final. One loss drops to consolation.
   * Consolation: R1 (WB R1 losers), R2 (winners vs WB R2 losers), then 3rd/4th match, then 2nd/3rd (WB final loser vs conso champ).
   * Returns placement (1–8) and all matches with round labels.
   */
  private runDoubleElimTournament(getOpponent: (round: string) => Opponent): { placement: number; matches: NonNullable<WeekSummary['matches']> } {
    const matches: NonNullable<WeekSummary['matches']> = [];
    const pushMatch = (opp: Opponent, roundLabel: string, won: boolean, method: string) => {
      matches.push({
        opponentName: `${opp.name} (${roundLabel})`,
        opponentOverall: opp.overallRating,
        stateRank: opp.stateRank,
        nationalRank: opp.nationalRank,
        won,
        method,
      });
    };

    // Winner's bracket: R1 (quarters), R2 (semis), R3 (winner's final)
    const wbR1Opp = getOpponent("Quarterfinal");
    const wbR1 = this.simOneMatch(wbR1Opp, false);
    pushMatch(wbR1Opp, 'Quarterfinal', wbR1.won, wbR1.method);
    if (!wbR1.won) {
      // Lost in quarters → conso R1 (wrestle another quarterfinal loser). Lose = 7th/8th, Win = conso R2
      const consoR1Opp = getOpponent("Consolation R1");
      const consoR1 = this.simOneMatch(consoR1Opp, false);
      pushMatch(consoR1Opp, 'Consolation R1', consoR1.won, consoR1.method);
      if (!consoR1.won) return { placement: this.rng.next() % 2 === 0 ? 7 : 8, matches };
      // Conso R2
      const consoR2Opp = getOpponent("Consolation R2");
      const consoR2 = this.simOneMatch(consoR2Opp, false);
      pushMatch(consoR2Opp, 'Consolation R2', consoR2.won, consoR2.method);
      if (!consoR2.won) return { placement: this.rng.next() % 2 === 0 ? 5 : 6, matches };
      // Conso semi (3rd/4th)
      const consoSemiOpp = getOpponent("3rd/4th");
      const consoSemi = this.simOneMatch(consoSemiOpp, false);
      pushMatch(consoSemiOpp, '3rd/4th', consoSemi.won, consoSemi.method);
      if (!consoSemi.won) return { placement: 4, matches };
      // 2nd/3rd match (conso champ vs WB final loser — we're conso champ, opponent is WB final loser)
      const secondThirdOpp = getOpponent("2nd/3rd");
      const secondThird = this.simOneMatch(secondThirdOpp, false);
      pushMatch(secondThirdOpp, '2nd/3rd', secondThird.won, secondThird.method);
      return { placement: secondThird.won ? 2 : 3, matches };
    }

    const wbR2Opp = getOpponent("Semifinal");
    const wbR2 = this.simOneMatch(wbR2Opp, false);
    pushMatch(wbR2Opp, 'Semifinal', wbR2.won, wbR2.method);
    if (!wbR2.won) {
      // Lost in semis → conso R2 (vs conso R1 winner)
      const consoR2Opp = getOpponent("Consolation R2");
      const consoR2 = this.simOneMatch(consoR2Opp, false);
      pushMatch(consoR2Opp, 'Consolation R2', consoR2.won, consoR2.method);
      if (!consoR2.won) return { placement: this.rng.next() % 2 === 0 ? 5 : 6, matches };
      const consoSemiOpp = getOpponent("3rd/4th");
      const consoSemi = this.simOneMatch(consoSemiOpp, false);
      pushMatch(consoSemiOpp, '3rd/4th', consoSemi.won, consoSemi.method);
      if (!consoSemi.won) return { placement: 4, matches };
      const secondThirdOpp = getOpponent("2nd/3rd");
      const secondThird = this.simOneMatch(secondThirdOpp, false);
      pushMatch(secondThirdOpp, '2nd/3rd', secondThird.won, secondThird.method);
      return { placement: secondThird.won ? 2 : 3, matches };
    }

    // Winner's final
    const wbFinalOpp = getOpponent("Winner's Final");
    const wbFinal = this.simOneMatch(wbFinalOpp, false);
    pushMatch(wbFinalOpp, "Winner's Final", wbFinal.won, wbFinal.method);
    if (wbFinal.won) return { placement: 1, matches };
    // WB final loser → 2nd/3rd match vs conso champ
    const secondThirdOpp = getOpponent("2nd/3rd");
    const secondThird = this.simOneMatch(secondThirdOpp, false);
    pushMatch(secondThirdOpp, '2nd/3rd', secondThird.won, secondThird.method);
    return { placement: secondThird.won ? 2 : 3, matches };
  }

  private runHSWeekCompetition(): WeekSummary | null {
    const s = this.state;
    if (!HS_LEAGUES.includes(s.league) || s.week < HS_REGULAR_START || s.week > HS_REGULAR_END) return null;
    if (!s.hsSchedule || s.hsSchedule.length === 0) return null;
    const entry = s.hsSchedule.find((e) => e.week === s.week);
    if (!entry || entry.type === 'none') return null;
    const summary: WeekSummary = { week: s.week, year: s.year, phase: getHSPhase(s.week), message: [] };
    const recBefore = s.recruitingScore ?? 50;

    if (entry.type === 'dual' || entry.type === 'rival') {
      if (s.league === 'HS_JV') {
        summary.eventType = 'dual';
        summary.message.push('JV week: practice only (no varsity match).');
        s.lastWeekSummary = summary;
        return summary;
      }
      const opp = entry.opponentId ? this.findOpponent(entry.opponentId) : null;
      const opponent = opp ?? (s.opponentPools?.unranked[this.rng.next() % (s.opponentPools?.unranked?.length ?? 1)] ?? null);
      if (!opponent) {
        summary.message.push('No opponent scheduled.');
        s.lastWeekSummary = summary;
        return summary;
      }
      const { won, method } = this.simOneMatch(opponent, entry.type === 'rival');
      if (won) {
        s.stats.matchesWon++; s.stats.seasonWins++; s.stats.hsRecord.matchesWon++;
        s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(2, 6));
      } else {
        s.stats.matchesLost++; s.stats.seasonLosses++; s.stats.hsRecord.matchesLost++;
      }
      summary.eventType = 'dual';
      summary.matches = [{ opponentName: opponent.name, opponentOverall: opponent.overallRating, stateRank: opponent.stateRank, nationalRank: opponent.nationalRank, won, method }];
      summary.recordChange = { wins: won ? 1 : 0, losses: won ? 0 : 1 };
      summary.message.push(`${won ? 'W' : 'L'} vs ${opponent.name} (${opponent.overallRating})${opponent.stateRank ? ` #${opponent.stateRank} state` : ''}${opponent.nationalRank ? ` #${opponent.nationalRank} national` : ''} — ${method}.`);
    } else if (entry.type === 'tournament') {
      const pool = s.opponentPools;
      const oppList = [...(pool?.unranked ?? []), ...(pool?.stateRanked ?? [])];
      const listLen = Math.max(1, oppList.length);
      const getOpponent = (round: string): Opponent => {
        const base = oppList[this.rng.next() % listLen];
        const bump = round === "Winner's Final" || round === 'Semifinal' ? this.rng.int(2, 8) : round === 'Quarterfinal' ? this.rng.int(0, 4) : this.rng.int(-2, 4);
        const rating = clamp(40, 95, (base.overallRating ?? 50) + bump);
        return { ...base, overallRating: rating };
      };
      const { placement: place, matches: bracketMatches } = this.runDoubleElimTournament(getOpponent);
      const wins = bracketMatches.filter((m) => m.won).length;
      const losses = bracketMatches.filter((m) => !m.won).length;
      for (const m of bracketMatches) {
        if (m.won) { s.stats.matchesWon++; s.stats.seasonWins++; s.stats.hsRecord.matchesWon++; }
        else { s.stats.matchesLost++; s.stats.seasonLosses++; s.stats.hsRecord.matchesLost++; }
      }
      const placeStr = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
      summary.eventType = 'tournament';
      summary.matches = bracketMatches;
      summary.placement = place;
      summary.recordChange = { wins, losses };
      summary.message.push(`Tournament (double elim): ${wins}-${losses}. Placed ${placeStr}.`);
    }

    this.computeRecruitingScore();
    summary.recruitingChange = (s.recruitingScore ?? 50) - recBefore;
    s.lastWeekSummary = summary;
    return summary;
  }

  private runCollegeWeekCompetition(): WeekSummary | null {
    const s = this.state;
    if (!isInCollege(s) || !s.collegeSchedule || s.week < 1 || s.week > 7) return null;
    const entry = s.collegeSchedule.find((e) => e.week === s.week);
    if (!entry || entry.type === 'conference' || entry.type === 'ncaa') return null;
    const summary: WeekSummary = { week: s.week, year: s.year, phase: 'College season', message: [] };

    if (entry.type === 'dual') {
      if (!this.isStarterAtWeight()) {
        summary.eventType = 'dual';
        summary.message.push(`You didn't start — backup at ${s.weightClass} lbs. Next week: keep training to earn the spot.`);
        s.lastWeekSummary = summary;
        return summary;
      }
      const oppRating = clamp(50, 88, (s.overallRating ?? 50) + this.rng.int(-8, 10));
      const opponent: Opponent = { id: 'col_dual', name: entry.opponentName ?? 'Opponent', overallRating: oppRating, style: 'grinder', clutch: 50 };
      const { won, method } = this.simOneMatch(opponent, false);
      if (won) {
        s.stats.matchesWon++; s.stats.seasonWins++; s.stats.collegeRecord.matchesWon++;
      } else {
        s.stats.matchesLost++; s.stats.seasonLosses++; s.stats.collegeRecord.matchesLost++;
      }
      summary.eventType = 'dual';
      summary.matches = [{ opponentName: opponent.name, opponentOverall: opponent.overallRating, won, method }];
      summary.recordChange = { wins: won ? 1 : 0, losses: won ? 0 : 1 };
      summary.message.push(`${won ? 'W' : 'L'} vs ${opponent.name} (${opponent.overallRating}) — ${method}.`);
    } else if (entry.type === 'tournament') {
      const myRating = s.overallRating ?? 50;
      const getOpponent = (round: string): Opponent => {
        const spread = round === "Winner's Final" ? this.rng.int(2, 10) : round === 'Semifinal' ? this.rng.int(-2, 8) : round === 'Quarterfinal' ? this.rng.int(-6, 6) : this.rng.int(-6, 4);
        const rating = clamp(52, 92, myRating + spread);
        return { id: `col_t_${round}`, name: 'Tournament opponent', overallRating: rating, style: 'grinder', clutch: 50 };
      };
      const { placement: place, matches: bracketMatches } = this.runDoubleElimTournament(getOpponent);
      const wins = bracketMatches.filter((m) => m.won).length;
      const losses = bracketMatches.filter((m) => !m.won).length;
      for (const m of bracketMatches) {
        if (m.won) { s.stats.matchesWon++; s.stats.seasonWins++; s.stats.collegeRecord.matchesWon++; }
        else { s.stats.matchesLost++; s.stats.seasonLosses++; s.stats.collegeRecord.matchesLost++; }
      }
      const placeStr = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
      summary.eventType = 'tournament';
      summary.matches = bracketMatches;
      summary.placement = place;
      summary.recordChange = { wins, losses };
      summary.message.push(`${entry.tournamentName ?? 'Tournament'} (double elim): ${wins}-${losses}, placed ${placeStr}.`);
    }
    s.lastWeekSummary = summary;
    return summary;
  }

  advanceWeek(): boolean {
    const s = this.state;
    if (s.pendingCollegeChoice) return false;
    // Decay grades/conditioning if player didn't study or train this week (rest/rehab do not reduce conditioning)
    if (!s.studiedThisWeek) s.grades = Math.max(0, (s.grades ?? 75) - 1);
    if (!s.trainedThisWeek && !s.didRestOrRehabThisWeek) s.conditioning = Math.max(0, (s.conditioning ?? 50) - 1);
    s.studiedThisWeek = false;
    s.trainedThisWeek = false;
    s.didRestOrRehabThisWeek = false;

    s.lastWeekSummary = null;
    s.weekModifiers = defaultWeekModifiers();
    this.applyLifestyleModifiers();
    s.week++;
    const availableAfterBase = HOURS_PER_WEEK - BASE_HOURS_AUTO;
    s.hoursLeftThisWeek = availableAfterBase;
    s.energy = Math.min(100, (s.energy ?? 100) + 6);
    if (s.fromHS && s.weeksInCollege < 52 * 4) s.weeksInCollege++;
    if (s.relationship) {
      s.relationship.level = Math.max(0, (s.relationship.level ?? 50) - 2);
      if (s.relationship.level < 20 && this.rng.float() < 0.15) {
        addStory(s, 'You and ' + s.relationship.partnerName + ' grew apart. Single again.');
        s.relationship = null;
        s.relationships = (s.relationships ?? []).filter((r) => r.kind !== 'romantic');
      }
    } else if (s.age >= 15 && (s.social ?? 50) >= 50 && this.rng.float() < 0.12) {
      const names = ['Jordan', 'Sam', 'Alex', 'Morgan', 'Riley'];
      s.relationship = {
        status: 'dating',
        partnerName: names[this.rng.next() % names.length],
        level: 30,
        weeklyTimeRequired: 4,
      };
      addStory(s, 'You started dating ' + s.relationship.partnerName + '!');
    }
    const didPartTime = s.didPartTimeThisWeek;
    s.didPartTimeThisWeek = false;
    const income = isInCollege(s) ? 0 : 20;
    const partIncome = didPartTime ? this.rng.int(200, 450) : 0;
    const baseExpenses = isInCollege(s) ? Math.round((450 + 280 + 80 + 2200 + 120) / 4) : (this.rng.float() < 0.5 ? 10 : 0);
    const lifestyleCost = this.getLifestyleWeeklyCost();
    const expenses = baseExpenses + lifestyleCost;
    s.money = Math.max(0, (s.money ?? 0) + income + partIncome - expenses);
    s.lastWeekEconomy = { expenses: { total: expenses, lifestyle: lifestyleCost }, income: { total: income + partIncome }, net: income + partIncome - expenses, balance: s.money };

    if (s.week > 52) {
      s.week = 1;
      s.age++;
      s.year++;
      s.yearlyGrowthUsed = 0;
      s.consecutiveRestWeeks = 0;
      s.offseasonEventsUsedThisYear = {};
      s.qualifiedForWorldChampionshipThisYear = false;
      s.stats.seasonWins = 0;
      s.stats.seasonLosses = 0;
      s.stats.seasonPins = 0;
      s.stats.seasonTechs = 0;
      s.stats.seasonMajors = 0;
      if (HS_LEAGUES.includes(s.league)) {
        s.hsSchedule = this.generateHSSchedule();
        s.opponentPools = this.state.opponentPools;
      }
      if (isInCollege(s)) {
        s.collegeSchedule = this.generateCollegeSchedule();
        s.collegeRoster = this.generateCollegeRoster();
        if ((s.eligibilityYearsRemaining ?? 4) > 0) s.eligibilityYearsRemaining = (s.eligibilityYearsRemaining ?? 4) - 1;
      }
      const rating = s.overallRating ?? 50;
      const goodEnoughForVarsity = rating >= 68;
      const goodEnoughForElite = rating >= 75;
      // Graduation: age 18+ in HS → must choose college (before any promotion)
      if (HS_LEAGUES.includes(s.league) && s.age >= 18) {
        s.pendingCollegeChoice = true;
        this.generateCollegeOffers();
        s.story = "You've graduated high school! Choose your college and negotiate scholarship or NIL.";
      } else if (s.league === 'HS_JV' && (s.age >= 15 || goodEnoughForVarsity)) {
        s.league = 'HS_VARSITY';
        addStory(s, goodEnoughForVarsity && s.age < 15 ? 'Your level earned you a varsity spot. Tougher competition.' : 'You made varsity. Tougher competition.');
      } else if (s.league === 'HS_VARSITY' && (s.age >= 17 || goodEnoughForElite)) {
        s.league = 'HS_ELITE';
        addStory(s, goodEnoughForElite && s.age < 17 ? "You're good enough for Elite. College scouts are watching." : "You're now HS Elite. College scouts are watching.");
      } else {
        s.story = 'Week ' + s.week + ', Year ' + s.year + '.';
      }
    } else {
      if (HS_LEAGUES.includes(s.league) && isHSRegularSeason(s.week)) {
        if (!s.hsSchedule || s.hsSchedule.length === 0) {
          s.hsSchedule = this.generateHSSchedule();
          s.opponentPools = this.state.opponentPools;
        }
        this.runHSWeekCompetition();
      }
      if (isInCollege(s)) {
        if (!s.collegeSchedule?.length) {
          s.collegeSchedule = this.generateCollegeSchedule();
          s.collegeRoster = this.generateCollegeRoster();
        }
        if (s.week >= 1 && s.week <= 7) this.runCollegeWeekCompetition();
      }
      const ran = this.runPostWeekTournaments();
      if (!ran) {
        if (!s.lastWeekSummary) s.story = 'Week ' + s.week + ', Year ' + s.year + '.';
      }
    }
    updateRating(s);
    // Mid-season promotion: good enough → varsity (or elite) during the year, not only at year rollover
    if (s.week !== 1 && HS_LEAGUES.includes(s.league)) {
      const rating = s.overallRating ?? 50;
      if (s.league === 'HS_JV' && (s.age >= 15 || rating >= 68)) {
        s.league = 'HS_VARSITY';
        addStory(s, rating >= 68 && s.age < 15 ? 'Your level earned you a varsity spot. Tougher competition.' : 'You made varsity. Tougher competition.');
      } else if (s.league === 'HS_VARSITY' && (s.age >= 17 || rating >= 75)) {
        s.league = 'HS_ELITE';
        addStory(s, rating >= 75 && s.age < 17 ? "You're good enough for Elite. College scouts are watching." : "You're now HS Elite. College scouts are watching.");
      }
    }
    this.computeRecruitingScore();
    this.saveRng();
    return s.week === 1;
  }

  private runPostWeekTournaments(): boolean {
    const s = this.state;
    if (s.week === HS_WEEK_DISTRICT && HS_LEAGUES.includes(s.league)) {
      if (s.league === 'HS_JV') {
        addStory(s, "JV doesn't compete at districts. Focus on next year.");
        return true;
      }
      const finalsOppRating = clamp(55, 88, (s.overallRating ?? 50) + this.rng.int(-5, 12));
      const wonFinals = this.simOneMatch({ id: 'dist_finals', name: 'District finals opponent', overallRating: finalsOppRating, style: 'grinder', clutch: 50 }, false).won;
      const place = wonFinals ? 1 : 2;
      s.stateQualified = place <= DISTRICTS_QUALIFY_TOP;
      s.lastWeekSummary = { week: s.week, year: s.year, phase: 'District/Sectional', eventType: 'district', placement: place, message: [s.stateQualified ? `Districts: Finals ${wonFinals ? 'W' : 'L'} — placed ${place}, qualified for state!` : `Districts: placed ${place}. Top ${DISTRICTS_QUALIFY_TOP} qualify.`] };
      addStory(s, s.stateQualified ? `Districts: Finals ${wonFinals ? 'W' : 'L'} — placed ${place}, qualified for state!` : `Districts: placed ${place}. Top ${DISTRICTS_QUALIFY_TOP} qualify.`);
      return true;
    }
    if (s.week === HS_WEEK_STATE && HS_LEAGUES.includes(s.league) && s.stateQualified) {
      s.stats.stateAppearances++;
      s.stats.hsRecord.stateAppearances++;
      const finalsOppRating = clamp(60, 92, (s.overallRating ?? 50) + this.rng.int(-3, 10));
      const wonFinals = this.simOneMatch({ id: 'state_finals', name: 'State finals opponent', overallRating: finalsOppRating, style: 'grinder', clutch: 50 }, false).won;
      const place = wonFinals ? 1 : 2;
      s.stats.statePlacements.push(place);
      if (place === 1) {
        s.stats.stateTitles++;
        s.stats.hsRecord.stateTitles++;
        s.accolades.push('State Champion (Year ' + s.year + ')');
        addStory(s, 'STATE TOURNAMENT: You won the state finals! STATE CHAMPION!');
      } else addStory(s, `State tournament: Lost in the finals. Placed 2nd.`);
      s.stateQualified = false;
      s.lastWeekSummary = { week: s.week, year: s.year, phase: 'State Tournament', eventType: 'state', placement: place, message: [place === 1 ? 'STATE CHAMPION!' : `State: lost in finals, 2nd.`] };
      return true;
    }
    if (s.week === HS_WEEK_WRAP && HS_LEAGUES.includes(s.league)) {
      s.lastWeekSummary = { week: s.week, year: s.year, phase: 'Season Wrap', eventType: 'wrap', message: [`Season complete. Record: ${s.stats.seasonWins}-${s.stats.seasonLosses}. Recruiting: ${s.recruitingScore}.`] };
      s.story = 'Week ' + s.week + ', Year ' + s.year + '. Season wrap.';
      return true;
    }
    if (s.week === WEEK_CONFERENCE_COLLEGE && isInCollege(s)) {
      const finalsOppRating = clamp(58, 90, (s.overallRating ?? 50) + this.rng.int(-4, 10));
      const wonFinals = this.simOneMatch({ id: 'conf_finals', name: 'Conference finals opponent', overallRating: finalsOppRating, style: 'grinder', clutch: 50 }, false).won;
      const place = wonFinals ? 1 : 2;
      s.ncaaQualified = place <= CONFERENCE_QUALIFY_TOP;
      addStory(s, s.ncaaQualified ? `Conference: ${wonFinals ? 'Won the finals!' : 'Lost in finals, 2nd.'} Qualified for NCAAs!` : `Conference: placed ${place}. Top ${CONFERENCE_QUALIFY_TOP} advance.`);
      s.lastWeekSummary = { week: s.week, year: s.year, phase: 'Conference', eventType: 'district', placement: place, message: [s.ncaaQualified ? `Conference finals ${wonFinals ? 'W' : 'L'} — qualified for NCAAs.` : `Conference: placed ${place}.`] };
      return true;
    }
    if (s.week === WEEK_NCAA && isInCollege(s) && s.ncaaQualified) {
      s.stats.ncaaAppearances++;
      s.stats.collegeRecord.ncaaAppearances++;
      const finalsOppRating = clamp(65, 95, (s.overallRating ?? 50) + this.rng.int(-2, 8));
      const wonFinals = this.simOneMatch({ id: 'ncaa_finals', name: 'NCAA finals opponent', overallRating: finalsOppRating, style: 'grinder', clutch: 50 }, false).won;
      const place = wonFinals ? 1 : 2;
      s.stats.ncaaPlacements.push(place);
      if (place === 1) {
        s.stats.ncaaTitles++;
        s.stats.collegeRecord.ncaaTitles++;
        s.accolades.push('NCAA Champion (Year ' + s.year + ')');
        addStory(s, 'NCAA CHAMPIONSHIPS: You won the national finals! NATIONAL CHAMPION!');
      } else {
        s.stats.ncaaAllAmerican++;
        s.stats.collegeRecord.ncaaAllAmerican++;
        addStory(s, 'NCAA Championships: Lost in the finals. All-American, 2nd place.');
      }
      s.ncaaQualified = false;
      s.lastWeekSummary = { week: s.week, year: s.year, phase: 'NCAA Championships', eventType: 'state', placement: place, message: [place === 1 ? 'NCAA CHAMPION!' : 'NCAA finals: 2nd, All-American.'] };
      return true;
    }
    return false;
  }

  getOffseasonEvents(): OffseasonEventItem[] {
    const s = this.state;
    const used = s.offseasonEventsUsedThisYear ?? {};
    const list: OffseasonEventItem[] = [];
    const inCollege = HS_LEAGUES.indexOf(s.league) === -1;
    for (const [key, ev] of Object.entries(OFFSEASON_EVENTS)) {
      if (ev.collegeOnly && !inCollege) continue;
      if (!ev.collegeOnly && inCollege) continue;
      if (used[key]) continue;
      const weekMatch = key === 'fargo' ? FARGO_WEEKS.includes(s.week) : s.week === ev.week;
      if (!weekMatch) continue;
      if (ev.inviteOnly && (s.recruitingScore ?? 50) < ev.recScoreMin) continue;
      if (key === 'world_championship' && !s.qualifiedForWorldChampionshipThisYear) continue;
      list.push({ ...ev, key, canAfford: (s.money ?? 0) >= ev.cost });
    }
    return list;
  }

  runOffseasonEvent(eventKey: string): { success: boolean; place?: number; eventName?: string; message?: string; matches?: { won: boolean; method: string }[] } {
    const s = this.state;
    const ev = OFFSEASON_EVENTS[eventKey];
    const weekOk = eventKey === 'fargo' ? FARGO_WEEKS.includes(s.week) : ev ? s.week === ev.week : false;
    const inCollege = HS_LEAGUES.indexOf(s.league) === -1;
    if (!ev || !weekOk) return { success: false, message: 'Not available.' };
    if (ev.collegeOnly && !inCollege) return { success: false, message: 'College event only.' };
    if (!ev.collegeOnly && inCollege) return { success: false, message: 'High school event only.' };
    if (eventKey === 'world_championship' && !s.qualifiedForWorldChampionshipThisYear) return { success: false, message: 'Qualify at US Open first (place 1st or 2nd).' };
    if ((s.money ?? 0) < ev.cost) return { success: false, message: "You can't afford it." };
    if ((s.offseasonEventsUsedThisYear ?? {})[eventKey]) return { success: false, message: 'Already competed here this year.' };
    s.offseasonEventsUsedThisYear = s.offseasonEventsUsedThisYear ?? {};
    s.offseasonEventsUsedThisYear[eventKey] = true;
    s.money = Math.max(0, (s.money ?? 0) - ev.cost);

    const eff = getEffectiveModifiers(s);
    const myRating = s.overallRating ?? 50;
    const matches: { won: boolean; method: string }[] = [];
    let wins = 0;
    let place: number;

    if (eventKey === 'us_open' || eventKey === 'world_championship') {
      const getOpponent = (round: string): Opponent => {
        const spread = round === 'Finals' ? this.rng.int(0, 8) : round === 'Semifinal' ? this.rng.int(-4, 6) : this.rng.int(-6, 4);
        const rating = clamp(58, 96, myRating + spread + (ev.prestige - 1) * 5);
        return { id: `${eventKey}_${round}`, name: round + ' opponent', overallRating: rating, style: 'grinder', clutch: 60 };
      };
      const numPoolMatches = 3;
      for (let i = 0; i < numPoolMatches; i++) {
        const opp = getOpponent('Pool');
        let winChance = 0.45 + myRating / 120 - opp.overallRating / 120;
        winChance *= eff.performanceMult;
        winChance = clamp(0.08, 0.92, winChance);
        const won = this.rng.float() < winChance;
        const method = won ? (this.rng.float() < 0.2 ? 'Fall' : this.rng.float() < 0.45 ? 'Tech' : 'Dec') : 'Dec';
        matches.push({ won, method });
        if (won) { wins++; s.stats.matchesWon++; s.stats.seasonWins++; s.stats.collegeRecord.matchesWon++; }
        else { s.stats.matchesLost++; s.stats.seasonLosses++; s.stats.collegeRecord.matchesLost++; }
      }
      const finalsOpp = getOpponent('Finals');
      let finalsChance = 0.45 + myRating / 120 - finalsOpp.overallRating / 120;
      finalsChance *= eff.performanceMult;
      finalsChance = clamp(0.08, 0.92, finalsChance);
      const wonFinals = this.rng.float() < finalsChance;
      const finalsMethod = wonFinals ? (this.rng.float() < 0.2 ? 'Fall' : this.rng.float() < 0.45 ? 'Tech' : 'Dec') : 'Dec';
      matches.push({ won: wonFinals, method: finalsMethod });
      if (wonFinals) { wins++; s.stats.matchesWon++; s.stats.seasonWins++; s.stats.collegeRecord.matchesWon++; }
      else { s.stats.matchesLost++; s.stats.seasonLosses++; s.stats.collegeRecord.matchesLost++; }
      place = wonFinals ? 1 : 2;
      const totalM = matches.length;
      s.stats.collegeRecord.matchesWon += wins;
      s.stats.collegeRecord.matchesLost += totalM - wins;
      const matchStr = matches.map((m) => (m.won ? 'W' : 'L') + ' (' + m.method + ')').join(', ');
      const placeStr = place === 1 ? '1st' : '2nd';
      addStory(s, `${ev.name}: ${wins}-${totalM - wins}. ${matchStr}. Placed ${placeStr}.`);
      if (eventKey === 'us_open') {
        (s.stats.usOpenPlacements ?? []).push(place);
        if (place <= 2) {
          s.qualifiedForWorldChampionshipThisYear = true;
          addStory(s, 'You qualified for the World Championship!');
        }
        if (place <= 2) s.accolades.push('US Open ' + (place === 1 ? 'Champ' : 'Runner-up') + ' (Year ' + s.year + ')');
      } else {
        (s.stats.worldChampionshipPlacements ?? []).push(place);
        if (place <= 2) s.accolades.push('World ' + (place === 1 ? 'Champion' : 'Runner-up') + ' (Year ' + s.year + ')');
      }
      updateRating(s);
      this.saveRng();
      return { success: true, place, eventName: ev.name, matches };
    }

    if (eventKey === 'wno') {
      // Who's Number One = one match: if you're #1 you face #2, if you're #2 you face #1. Win = #1, lose = #2.
      const youAreNo1 = this.rng.float() < 0.5;
      const wc = s.weightClass ?? 145;
      const opponentRating = youAreNo1
        ? clamp(70, 92, myRating + this.rng.int(-3, 5))  // #2 is close to you
        : clamp(72, 94, myRating + this.rng.int(2, 8));  // #1 is slightly better
      const opp: Opponent = {
        id: 'wno',
        name: (youAreNo1 ? '#2' : '#1') + ' at ' + wc + ' lbs',
        overallRating: opponentRating,
        style: 'grinder',
        clutch: 68,
      };
      const { won, method } = this.simOneMatch(opp, false);
      matches.push({ won, method });
      if (won) {
        wins++;
        s.stats.matchesWon++;
        s.stats.seasonWins++;
      } else {
        s.stats.matchesLost++;
        s.stats.seasonLosses++;
      }
      place = won ? 1 : 2;  // Win = #1, lose = #2
    } else {
      const numPoolMatches = eventKey === 'fargo' ? 4 : 3;
      for (let i = 0; i < numPoolMatches; i++) {
        const oppStrength = 50 + (ev.prestige - 1) * 15 + (this.rng.float() - 0.5) * 20 + (i * 4);
        const oppRating = clamp(45, 95, Math.round(oppStrength));
        let winChance = 0.45 + myRating / 120 - oppRating / 120;
        winChance *= eff.performanceMult;
        winChance = clamp(0.08, 0.92, winChance);
        const won = this.rng.float() < winChance;
        const method = won ? (this.rng.float() < 0.25 ? 'Fall' : this.rng.float() < 0.5 ? 'Tech' : 'Dec') : 'Dec';
        matches.push({ won, method });
        if (won) {
          wins++;
          s.stats.matchesWon++;
          s.stats.seasonWins++;
        } else {
          s.stats.matchesLost++;
          s.stats.seasonLosses++;
        }
      }
      const finalsOppRating = clamp(55, 95, myRating + this.rng.int(2, 12));
      let finalsWinChance = 0.45 + myRating / 120 - finalsOppRating / 120;
      finalsWinChance *= eff.performanceMult;
      finalsWinChance = clamp(0.08, 0.92, finalsWinChance);
      const wonFinals = this.rng.float() < finalsWinChance;
      const finalsMethod = wonFinals ? (this.rng.float() < 0.25 ? 'Fall' : this.rng.float() < 0.5 ? 'Tech' : 'Dec') : 'Dec';
      matches.push({ won: wonFinals, method: finalsMethod });
      if (wonFinals) {
        wins++;
        s.stats.matchesWon++;
        s.stats.seasonWins++;
      } else {
        s.stats.matchesLost++;
        s.stats.seasonLosses++;
      }
      place = wonFinals ? 1 : 2;
    }

    const totalMatches = matches.length;
    s.stats.hsRecord.matchesWon += wins;
    s.stats.hsRecord.matchesLost += totalMatches - wins;
    const matchStr = matches.map((m) => (m.won ? 'W' : 'L') + ' (' + m.method + ')').join(', ');
    const placeStr = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : place + 'th';
    addStory(s, eventKey === 'wno'
      ? `${ev.name}: One match for the top spot. ${matchStr}. ${place === 1 ? "You're #1." : "You're #2."}`
      : `${ev.name}: You went ${wins}-${totalMatches - wins}. ${matchStr}. Placed ${placeStr}.`);

    if (eventKey === 'fargo') {
      s.stats.fargoPlacements.push(place);
      if (place <= 2) s.accolades.push('Fargo ' + (place === 1 ? 'Champ' : 'Runner-up') + ' (Year ' + s.year + ')');
    } else if (eventKey === 'super32') {
      s.stats.super32Placements.push(place);
      if (place <= 2) s.accolades.push('Super 32 ' + (place === 1 ? 'Champ' : 'Runner-up') + ' (Year ' + s.year + ')');
    } else if (eventKey === 'wno') {
      s.stats.wnoAppearances++;
      if (place === 1) {
        s.stats.wnoWins++;
        s.accolades.push('WNO Champion (Year ' + s.year + ')');
        s.overallRating = Math.min(99, (s.overallRating ?? 50) + 5);
      }
    }
    this.computeRecruitingScore();
    this.saveRng();
    return { success: true, place, eventName: ev.name, matches };
  }

  getRelationships(): RelationshipEntry[] {
    const s = this.state;
    const list = [...(s.relationships ?? [])];
    if (s.relationship && !list.some((r) => r.kind === 'romantic')) {
      list.push({
        id: 'romantic_sync',
        kind: 'romantic',
        name: s.relationship.partnerName,
        level: s.relationship.level,
        label: 'Partner',
      });
    }
    return list;
  }

  getRelationshipActions(relId: string): RelationshipActionItem[] {
    const s = this.state;
    const rel = this.getRelationships().find((r) => r.id === relId);
    if (!rel) return [];
    const hoursLeft = s.hoursLeftThisWeek ?? HOURS_PER_WEEK;
    const money = s.money ?? 0;
    const actions: RelationshipActionItem[] = [];
    switch (rel.kind) {
      case 'parent':
        if (hoursLeft >= 4) actions.push({ key: 'rel_spend_time', label: 'Spend time', hours: 4 });
        if (hoursLeft >= 2) actions.push({ key: 'rel_ask_advice', label: 'Ask for advice', hours: 2 });
        break;
      case 'sibling':
        if (hoursLeft >= 4) actions.push({ key: 'rel_spend_time', label: 'Spend time', hours: 4 });
        if (hoursLeft >= 3) actions.push({ key: 'rel_hang_out', label: 'Hang out', hours: 3 });
        break;
      case 'coach':
        if (hoursLeft >= 6) actions.push({ key: 'rel_spend_time', label: 'Spend time', hours: 6 });
        if (hoursLeft >= 4) actions.push({ key: 'rel_get_advice', label: 'Get coaching advice', hours: 4 });
        break;
      case 'friend':
        if (hoursLeft >= 4) actions.push({ key: 'rel_spend_time', label: 'Spend time', hours: 4 });
        if (hoursLeft >= 3) actions.push({ key: 'rel_hang_out', label: 'Hang out', hours: 3 });
        break;
      case 'romantic':
        if (hoursLeft >= 6) actions.push({ key: 'rel_spend_time', label: 'Spend time together', hours: 6 });
        if (hoursLeft >= 6 && money >= 30) actions.push({ key: 'rel_date', label: 'Date night', hours: 6, money: 30 });
        if (hoursLeft >= 2) actions.push({ key: 'rel_argument', label: 'Argument (stress)', hours: 2 });
        break;
    }
    return actions;
  }

  applyRelationshipAction(relId: string, actionKey: string): void {
    const s = this.state;
    const rel = this.getRelationships().find((r) => r.id === relId);
    if (!rel) return;
    const actions = this.getRelationshipActions(relId);
    const act = actions.find((a) => a.key === actionKey);
    if (!act || (s.hoursLeftThisWeek ?? 0) < act.hours || ((act.money ?? 0) > 0 && (s.money ?? 0) < (act.money ?? 0))) return;
    s.hoursLeftThisWeek = Math.max(0, (s.hoursLeftThisWeek ?? HOURS_PER_WEEK) - act.hours);
    if (act.money != null && act.money > 0) s.money = Math.max(0, (s.money ?? 0) - act.money);
    const delta = this.rng.int(2, 5);
    const negDelta = this.rng.int(2, 4);
    const syncRelLevel = (newLevel: number) => {
      if (rel.kind === 'romantic' && s.relationship) s.relationship.level = newLevel;
      const stateRel = s.relationships?.find((r) => r.id === relId);
      if (stateRel) stateRel.level = newLevel;
    };
    switch (actionKey) {
      case 'rel_spend_time':
        syncRelLevel(Math.min(100, rel.level + delta));
        if (rel.kind === 'romantic' && s.relationship) this.applyWeekModifierDeltas({ performanceMult: 0.05 }, 'Time with partner');
        addStory(s, `You spent time with ${rel.name}. Relationship stronger.`);
        break;
      case 'rel_ask_advice':
        syncRelLevel(Math.min(100, rel.level + 1));
        s.stress = Math.max(0, (s.stress ?? 0) - this.rng.int(1, 3));
        addStory(s, `You asked ${rel.name} for advice. Felt supported.`);
        break;
      case 'rel_hang_out':
        syncRelLevel(Math.min(100, rel.level + delta));
        s.social = Math.min(100, (s.social ?? 50) + this.rng.int(1, 3));
        s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(1, 4));
        addStory(s, `You hung out with ${rel.name}.`);
        break;
      case 'rel_get_advice':
        syncRelLevel(Math.min(100, rel.level + 2));
        const matGain = this.rng.int(0, 1);
        if (matGain) s.matIQ = Math.min(100, (s.matIQ ?? 50) + 1);
        addStory(s, `Coach ${rel.name} gave you some pointers.${matGain ? ' Mat IQ up.' : ''}`);
        break;
      case 'rel_date':
        if (rel.kind === 'romantic' && s.relationship) {
          const newLevel = Math.min(100, s.relationship.level + this.rng.int(3, 6));
          s.relationship.level = newLevel;
          syncRelLevel(newLevel);
          s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(5, 12));
          this.applyWeekModifierDeltas({ performanceMult: 0.08 }, 'Date night');
        }
        addStory(s, `Date night with ${rel.name}. Great for performance.`);
        break;
      case 'rel_argument':
        if (rel.kind === 'romantic' && s.relationship) {
          const newLevel = Math.max(0, s.relationship.level - negDelta);
          s.relationship.level = newLevel;
          syncRelLevel(newLevel);
          this.applyWeekModifierDeltas({ performanceMult: -0.1 }, 'Argument');
        }
        s.stress = Math.min(100, (s.stress ?? 0) + this.rng.int(4, 8));
        s.happiness = Math.max(0, (s.happiness ?? 75) - this.rng.int(3, 7));
        addStory(s, `Argument with ${rel.name}. Performance may suffer.`);
        break;
      default:
        break;
    }
    updateRating(s);
    this.saveRng();
  }

  getRankingsBoard(): Record<number, Array<{ rank: number; name: string; overall: number; record?: string }> & { playerRank?: number; playerRating?: number }> {
    const s = this.state;
    type Row = { rank: number; name: string; overall: number; record?: string };
    type BoardRow = Row[] & { playerRank?: number; playerRating?: number };
    const board: Record<number, BoardRow> = {} as Record<number, BoardRow>;
    const wc = s.weightClass ?? 145;
    const weightList = HS_LEAGUES.indexOf(s.league) === -1 ? COLLEGE_WEIGHT_CLASSES : WEIGHT_CLASSES;
    const firstNames = ['Jake', 'Kyle', 'David', 'Ryan', 'Cole', 'Blake', 'Mason', 'Hunter'];
    const lastNames = ['Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson'];
    /** Synthetic season record for NPC from id+rating (stable per wrestler). */
    const syntheticRecord = (id: string, overallRating: number): { wins: number; losses: number } => {
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
      const spread = Math.abs(h % 7) - 3; // -3 to +3
      const wins = clamp(0, 15, 5 + Math.floor((overallRating - 65) / 5) + spread);
      const losses = clamp(0, 12, 10 - wins + (Math.abs(h >> 4) % 3));
      return { wins, losses };
    };
    /** Sort key: record first (wins - losses), then rating. */
    const rankScore = (wins: number, losses: number, overall: number) => (wins - losses) * 1000 + overall;
    for (const w of weightList) {
      if (!s.rankingsByWeight[w] || s.rankingsByWeight[w].length === 0) {
        s.rankingsByWeight[w] = [];
        for (let i = 0; i < 15; i++) {
          const ts = 58 + (this.rng.float() - 0.5) * 28;
          const overall = clamp(62, 99, Math.round(72 + (this.rng.float() - 0.5) * 22));
          s.rankingsByWeight[w].push({
            id: `ai_${w}_${this.rng.next()}`,
            name: firstNames[this.rng.next() % firstNames.length] + ' ' + lastNames[this.rng.next() % lastNames.length],
            overallRating: overall,
            trueSkill: ts,
          });
        }
        s.rankingsByWeight[w].sort((a, b) => b.overallRating - a.overallRating);
      }
      const list = s.rankingsByWeight[w];
      if (w === wc) {
        const myRating = s.overallRating ?? 50;
        const playerW = s.stats.seasonWins ?? 0;
        const playerL = s.stats.seasonLosses ?? 0;
        const playerEntry = { id: 'player', name: s.name, overallRating: myRating, trueSkill: s.trueSkill ?? 50 };
        const withRecords: { id: string; name: string; overallRating: number; wins: number; losses: number }[] = [
          ...list.map((e) => {
            const rec = syntheticRecord(e.id, e.overallRating);
            return { id: e.id, name: e.name, overallRating: e.overallRating, wins: rec.wins, losses: rec.losses };
          }),
          { id: 'player', name: playerEntry.name, overallRating: playerEntry.overallRating, wins: playerW, losses: playerL },
        ];
        withRecords.sort((a, b) => rankScore(b.wins, b.losses, b.overallRating) - rankScore(a.wins, a.losses, a.overallRating));
        const rows: Row[] = withRecords.slice(0, 10).map((e, i) => ({
          rank: i + 1,
          name: e.name,
          overall: e.overallRating,
          record: e.wins + '-' + e.losses,
        }));
        const entry = rows as BoardRow;
        const playerIndex = withRecords.findIndex((e) => e.id === 'player');
        entry.playerRank = playerIndex >= 0 ? playerIndex + 1 : withRecords.length + 1;
        entry.playerRating = myRating;
        board[w] = entry;
      } else {
        const withRecords = list.map((e) => {
          const rec = syntheticRecord(e.id, e.overallRating);
          return { ...e, wins: rec.wins, losses: rec.losses };
        });
        withRecords.sort((a, b) => rankScore(b.wins, b.losses, b.overallRating) - rankScore(a.wins, a.losses, a.overallRating));
        const rows: Row[] = withRecords.slice(0, 10).map((e, i) => ({
          rank: i + 1,
          name: e.name,
          overall: e.overallRating,
          record: e.wins + '-' + e.losses,
        }));
        board[w] = rows as BoardRow;
      }
    }
    return board;
  }

  getWeekLabel(): string {
    return 'Week ' + (this.state.week ?? 1);
  }

  getWeekModifiers(): WeekModifiers {
    return getEffectiveModifiers(this.state);
  }

  getHSPhaseForWeek(week: number): string {
    return getHSPhase(week);
  }

  getHSScheduleEntry(week: number): HSScheduleEntry | undefined {
    return this.state.hsSchedule?.find((e) => e.week === week);
  }

  getCollegeScheduleEntry(week: number): CollegeScheduleEntry | undefined {
    return this.state.collegeSchedule?.find((e) => e.week === week);
  }

  /** Label to show on the calendar for a given week (tournament name, dual opponent, Conference, NCAA, Districts, State, etc.). */
  getScheduleDisplayLabel(week: number): string {
    if (HS_LEAGUES.includes(this.state.league)) {
      const entry = this.getHSScheduleEntry(week);
      if (entry?.type === 'dual' || entry?.type === 'rival') {
        const name = entry.opponentId ? this.findOpponent(entry.opponentId)?.name : null;
        return name ? (entry.type === 'rival' ? `Rival: ${name}` : `vs ${name}`) : (entry.type === 'rival' ? 'Rival' : 'Dual');
      }
      if (entry?.type === 'tournament') return 'Tournament';
      if (week === HS_WEEK_DISTRICT) return 'Districts';
      if (week === HS_WEEK_STATE) return 'State';
      if (week === HS_WEEK_WRAP) return 'Wrap';
      return '';
    }
    const entry = this.getCollegeScheduleEntry(week);
    if (!entry) return '';
    if (entry.type === 'dual') return entry.opponentName ? `vs ${entry.opponentName}` : 'Dual';
    if (entry.type === 'tournament') return entry.tournamentName ?? 'Tournament';
    if (entry.type === 'conference') return 'Conference';
    if (entry.type === 'ncaa') return 'NCAA';
    return '';
  }

  getNextEvent(): NextEventInfo | null {
    const s = this.state;
    const cur = s.week ?? 1;
    if (HS_LEAGUES.includes(s.league) && s.hsSchedule?.length) {
      const next = s.hsSchedule.find((e) => e.week >= cur && e.type !== 'none');
      if (next) {
        const label = next.type === 'dual' || next.type === 'rival' ? `Dual vs ${next.opponentId ? this.findOpponent(next.opponentId)?.name ?? 'TBD' : 'TBD'}` : next.type === 'tournament' ? 'Tournament' : next.type;
        return { week: next.week, label, type: next.type };
      }
      if (cur <= HS_WEEK_DISTRICT) return { week: HS_WEEK_DISTRICT, label: 'Districts', type: 'district' };
      if (cur <= HS_WEEK_STATE) return { week: HS_WEEK_STATE, label: 'State', type: 'state' };
      return { week: HS_WEEK_WRAP, label: 'Season wrap', type: 'wrap' };
    }
    if (isInCollege(s)) {
      if (s.collegeSchedule?.length) {
        const next = s.collegeSchedule.find((e) => e.week >= cur && (e.type === 'dual' || e.type === 'tournament' || e.type === 'conference' || e.type === 'ncaa'));
        if (next) {
          const label = next.type === 'dual' ? `Dual vs ${next.opponentName ?? 'TBD'}` : next.type === 'tournament' ? (next.tournamentName ?? 'Tournament') : next.type === 'conference' ? 'Conference' : 'NCAA Championships';
          return { week: next.week, label, type: next.type };
        }
      } else {
        return { week: cur, label: 'Season starts', type: 'dual' };
      }
    }
    return null;
  }

  getCollegeLineup(): CollegeTeammate[] {
    return this.state.collegeRoster ?? [];
  }

  isCollegeStarter(): boolean {
    return this.isStarterAtWeight();
  }

  static getWeightClasses(league?: LeagueKey): number[] {
    const inCollege = league && HS_LEAGUES.indexOf(league) === -1;
    return inCollege ? [...COLLEGE_WEIGHT_CLASSES] : [...WEIGHT_CLASSES];
  }
}
