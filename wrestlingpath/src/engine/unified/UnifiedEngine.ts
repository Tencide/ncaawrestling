/**
 * Unified game engine: week-by-week choices + tournaments + offseason + recruiting.
 * Uses SeededRNG for deterministic save/load.
 */

import { SeededRNG } from '../SeededRNG';
import type { UnifiedState, LeagueKey, ChoiceItem, OffseasonEventItem, CustomStartOptions, WeekModifiers, ChoicePreview, HSScheduleEntry, CollegeScheduleEntry, CollegeTeammate, Opponent, OpponentPools, WeekSummary, BracketParticipant, RelationshipEntry, RelationshipActionItem, NextEventInfo, CollegeOffer, LifestyleState, HousingTier, CarTier, MealPlanTier, RecoveryTier, ProgramTier, OfferType, NoOfferReason, LifePopup, LifeLogEntry, CustomLifestyleItemDef, PendingCompetitionState, PendingBracketState, PendingBracketPhase, CompetitionKind, PendingCompetitionMatch, CompletedCompetitionMatch, PendingTournamentPlay } from './types';
import { generateLifePopups } from '@/data/lifePopups';
import type { School } from '../types';
import { SCHOOLS } from '@/data/schools';
import { generateSeasonSchedule, NCAA_WEEK, SEASON_WEEKS, isPowerhouse } from '../college/SeasonSchedule';
import {
  runDoubleElimBracket,
  validateBracketMatchSequence,
  validateTournamentResult,
  type TournamentPlayerState,
  type TournamentOpponent,
  type BracketMatchEntry,
} from '../TournamentSim';
import { simEliteMatch } from '../EliteMatchSim';
import { createInitialMinigameState, generateExchangePrompt, resolveExchange, DECISION_TIMER_SECONDS, type MinigameWrestler, type MatchPosition } from '../MatchMinigame';

const WEIGHT_CLASSES = [106, 113, 120, 126, 132, 138, 145, 152, 160, 170, 182, 195, 220, 285];

/** 2025-style NIL tiers (wrestling): Top $250K–$1M, AA $40K–$150K, Starter P5 $10K–$50K, Average D1 $0–$10K. */
const NIL_TIERS_D1 = [
  { min: 250_000, max: 700_000 },   // tier 0: national champ / Hodge-level
  { min: 40_000, max: 150_000 },    // tier 1: All-American
  { min: 10_000, max: 50_000 },     // tier 2: starter at Power 5
  { min: 0, max: 10_000 },          // tier 3: average D1
] as const;
/** D2/NAIA/JUCO scale factors vs D1 (wrestling NIL is smaller outside top programs). */
const NIL_DIVISION_SCALE: Record<string, number> = { D1: 1, D2: 0.35, D3: 0.12, NAIA: 0.2, JUCO: 0.1 };
/** Schools with strong wrestling NIL collectives (can push athletes into higher tier). */
const STRONG_NIL_COLLECTIVE_IDS = new Set(['penn-state', 'iowa', 'oklahoma-state']);

/** Program tier A–D: budget, offer slots, standards. Tier A = blue bloods, D = smaller programs. */
const PROGRAM_TIER_BY_SCHOOL: Record<string, ProgramTier> = {
  'iowa': 'A', 'penn-state': 'A', 'ohio-state': 'A', 'oklahoma-state': 'A',
  'nc-state': 'B', 'michigan': 'B', 'iowa-state': 'B', 'cornell': 'B', 'virginia-tech': 'B', 'nebraska': 'B', 'minnesota': 'B', 'wisconsin': 'B', 'arizona-state': 'B', 'mizzou': 'B',
  'virginia': 'C', 'rutgers': 'C', 'st-cloud': 'B', 'nebraska-kearney': 'C', 'central-oklahoma': 'C', 'pittsburg-state': 'C', 'grand-view': 'B', 'life': 'B', 'lindenwood': 'C', 'mckendree': 'C',
  'wartburg': 'D', 'augsburg': 'D', 'north-central': 'D', 'coe': 'D', 'doane': 'C', 'iowa-central': 'C', 'northeastern-ok': 'D', 'clackamas': 'D', 'western-wyoming': 'D',
};
/** Tier config: slots per recruiting class, min recruiting score, base offer chance (0–1), NIL pool range (annual $). */
const RECRUITING_TIER_CFG: Record<ProgramTier, { slots: number; minRecruiting: number; baseChance: number; nilPoolMin: number; nilPoolMax: number }> = {
  A: { slots: 4, minRecruiting: 55, baseChance: 0.35, nilPoolMin: 600_000, nilPoolMax: 1_200_000 },
  B: { slots: 5, minRecruiting: 40, baseChance: 0.45, nilPoolMin: 200_000, nilPoolMax: 500_000 },
  C: { slots: 6, minRecruiting: 28, baseChance: 0.55, nilPoolMin: 40_000, nilPoolMax: 150_000 },
  D: { slots: 8, minRecruiting: 15, baseChance: 0.65, nilPoolMin: 0, nilPoolMax: 40_000 },
};
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
/** Minimum grades (0–100) to be eligible to wrestle. Below this = academic ineligibility. */
const MIN_GRADES_TO_WRESTLE = 50;

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
    if (this.state.pendingCollegeGraduation == null) this.state.pendingCollegeGraduation = false;
    if (this.state.careerEnded == null) this.state.careerEnded = false;
    if (isInCollege(this.state) && (this.state.eligibilityYearsRemaining ?? 0) <= 0 && !this.state.careerEnded && !this.state.pendingCollegeGraduation) this.state.pendingCollegeGraduation = true;
    if (this.state.eligibilityYearsRemaining == null && !HS_LEAGUES.includes(this.state.league)) this.state.eligibilityYearsRemaining = 4;
    if (!this.state.lifestyle) this.state.lifestyle = UnifiedEngine.DEFAULT_LIFESTYLE;
    if (!Array.isArray(this.state.stats.usOpenPlacements)) this.state.stats.usOpenPlacements = [];
    if (!Array.isArray(this.state.stats.worldChampionshipPlacements)) this.state.stats.worldChampionshipPlacements = [];
    if (this.state.popularity == null) this.state.popularity = 50;
    if (this.state.coachTrust == null) this.state.coachTrust = 50;
    if (!Array.isArray(this.state.pendingLifePopups)) this.state.pendingLifePopups = [];
    if (!Array.isArray(this.state.lifeLog)) this.state.lifeLog = [];
    if (this.state.allowRelationshipEvents == null) this.state.allowRelationshipEvents = true;
    if (this.state.relationshipStatus == null) this.state.relationshipStatus = 'NONE';
    if (this.state.relationshipMeter == null) this.state.relationshipMeter = 0;
    if (this.state.pendingCompetition == null) this.state.pendingCompetition = null;
    if (this.state.pendingTournamentPlay == null) this.state.pendingTournamentPlay = null;
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
      weeksWithoutTraining: 0,
      didRestOrRehabThisWeek: false,
      weekModifiers: defaultWeekModifiers(),
      autoTrainOnAdvance: true,
      relationship: null,
      relationships: generateInitialRelationships(rng, options.name || 'Wrestler'),
      offseasonEventsUsedThisYear: {},
      hsSchedule: null,
      opponentPools: null,
      collegeSchedule: null,
      collegeRoster: null,
      lastWeekSummary: null,
      lifestyle: UnifiedEngine.DEFAULT_LIFESTYLE,
      pendingLifePopups: [],
      lifeLog: [],
      popularity: 50,
      coachTrust: 50,
      allowRelationshipEvents: true,
      relationshipStatus: 'NONE',
      relationshipMeter: 0,
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
    purchasedCustomIds: [],
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

  /** Custom one-time (or subscription) lifestyle purchases — specific items, some expensive. */
  private static readonly CUSTOM_LIFESTYLE_ITEMS: CustomLifestyleItemDef[] = [
    { id: 'quality_headgear', name: 'Quality competition headgear', description: 'Better fit and protection.', cost: 120, effectSummary: '−3% injury risk', effects: { injuryRiskMult: -0.03 } },
    { id: 'compression_boots', name: 'Compression recovery boots', description: 'Speeds recovery between sessions.', cost: 380, effectSummary: '−4% injury risk, +1 health', effects: { injuryRiskMult: -0.04, health: 1 } },
    { id: 'sleep_tracker', name: 'Sleep tracker + program', description: 'Optimize sleep and recovery.', cost: 180, effectSummary: '+2 health, better energy', effects: { health: 2 } },
    { id: 'custom_singlet', name: 'Custom team singlet', description: 'Your colors, your fit.', cost: 220, effectSummary: '+2 happiness', effects: { happiness: 2 } },
    { id: 'private_mat', name: 'Private mat time (10 sessions)', description: 'Extra drilling when the room is empty.', cost: 600, effectSummary: '+2% training effect', effects: { trainingMult: 0.02 } },
    { id: 'nutritionist', name: 'Personal nutritionist (semester)', description: 'Meal plans and supplement advice.', cost: 1800, effectSummary: '+3% training, +2 health', effects: { trainingMult: 0.03, health: 2 } },
    { id: 'elite_recovery', name: 'Elite recovery package', description: 'Theragun, NormaTec, and protocols.', cost: 2200, effectSummary: '−8% injury risk, +3 health', effects: { injuryRiskMult: -0.08, health: 3 } },
    { id: 'media_suit', name: 'Designer suit for media', description: 'Look the part for interviews and NIL.', cost: 950, effectSummary: '+4 popularity', effects: { popularity: 4 } },
    { id: 'cold_plunge', name: 'Cold plunge tub', description: 'Home ice baths for recovery.', cost: 4500, effectSummary: '−5% injury risk, +2 health, −2 stress', effects: { injuryRiskMult: -0.05, health: 2, stress: -2 } },
    { id: 'chef_month', name: 'Chef-prepared meals (1 month)', description: 'High-end fuel, no cooking.', cost: 1200, weeklyCost: 0, effectSummary: '+4 health, +2% training', effects: { health: 4, trainingMult: 0.02 } },
    { id: 'luxury_watch', name: 'Luxury watch', description: 'Statement piece for appearances.', cost: 3200, effectSummary: '+5 happiness, +2 popularity', effects: { happiness: 5, popularity: 2 } },
    { id: 'home_sauna', name: 'In-home sauna', description: 'Heat and recovery at home.', cost: 7500, effectSummary: '−3% injury risk, +3 health, −3 stress', effects: { injuryRiskMult: -0.03, health: 3, stress: -3 } },
    { id: 'premium_physio', name: 'Premium physio package (6 months)', description: 'Weekly bodywork and screening.', cost: 3600, weeklyCost: 0, effectSummary: '−6% injury risk, +4 health', effects: { injuryRiskMult: -0.06, health: 4 } },
  ];

  getLifestyle(): LifestyleState {
    return this.state.lifestyle ?? UnifiedEngine.DEFAULT_LIFESTYLE;
  }

  /** Weekly cost from housing + car upkeep + meal plan + any custom item weekly costs. */
  getLifestyleWeeklyCost(): number {
    const L = this.getLifestyle();
    let sum = UnifiedEngine.HOUSING_WEEKLY[L.housing]
      + UnifiedEngine.CAR_WEEKLY[L.car]
      + UnifiedEngine.MEAL_PLAN_WEEKLY[L.mealPlan];
    const purchased = L.purchasedCustomIds ?? [];
    for (const item of UnifiedEngine.CUSTOM_LIFESTYLE_ITEMS) {
      if (purchased.includes(item.id) && (item.weeklyCost ?? 0) > 0) sum += item.weeklyCost!;
    }
    return sum;
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
    const idx = (order as readonly (HousingTier | CarTier | MealPlanTier | RecoveryTier)[]).indexOf(current as HousingTier | CarTier | MealPlanTier | RecoveryTier);
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

  /** Catalog of custom lifestyle items with owned flag and affordability. */
  getCustomLifestyleCatalog(): (CustomLifestyleItemDef & { owned: boolean; canAfford: boolean })[] {
    const L = this.getLifestyle();
    const purchased = new Set(L.purchasedCustomIds ?? []);
    const money = this.state.money ?? 0;
    return UnifiedEngine.CUSTOM_LIFESTYLE_ITEMS.map((item) => ({
      ...item,
      owned: purchased.has(item.id),
      canAfford: !purchased.has(item.id) && money >= item.cost,
    }));
  }

  /** Purchase a custom lifestyle item (one-time cost). Returns success and message. */
  purchaseCustomItem(itemId: string): { success: boolean; message: string } {
    const s = this.state;
    const L = s.lifestyle ?? UnifiedEngine.DEFAULT_LIFESTYLE;
    const purchased = L.purchasedCustomIds ?? [];
    if (purchased.includes(itemId)) return { success: false, message: 'Already owned.' };
    const item = UnifiedEngine.CUSTOM_LIFESTYLE_ITEMS.find((i) => i.id === itemId);
    if (!item) return { success: false, message: 'Unknown item.' };
    const money = s.money ?? 0;
    if (money < item.cost) return { success: false, message: `Need $${item.cost}; you have $${money}.` };
    if (!s.lifestyle) s.lifestyle = { ...UnifiedEngine.DEFAULT_LIFESTYLE };
    if (!s.lifestyle.purchasedCustomIds) s.lifestyle.purchasedCustomIds = [];
    s.lifestyle.purchasedCustomIds = [...s.lifestyle.purchasedCustomIds, itemId];
    s.money = Math.max(0, money - item.cost);
    if (item.effects?.health != null) s.health = Math.min(100, (s.health ?? 100) + item.effects.health);
    if (item.effects?.happiness != null) s.happiness = Math.min(100, (s.happiness ?? 75) + item.effects.happiness);
    if (item.effects?.stress != null) s.stress = Math.max(0, (s.stress ?? 50) + item.effects.stress);
    if (item.effects?.popularity != null) s.popularity = Math.min(100, (s.popularity ?? 50) + item.effects.popularity);
    addStory(s, `Bought ${item.name}.`);
    this.saveRng();
    return { success: true, message: `Purchased ${item.name}.` };
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
    const order = orders[category] as readonly (HousingTier | CarTier | MealPlanTier | RecoveryTier)[];
    const current = L[category] as HousingTier | CarTier | MealPlanTier | RecoveryTier;
    const currentIdx = order.indexOf(current);
    const targetIdx = order.indexOf(tier);
    if (targetIdx <= currentIdx) return { success: false, message: 'Already at that tier or invalid.' };
    const oneTime = category === 'car' ? UnifiedEngine.CAR_COST[tier as CarTier] : category === 'recoveryEquipment' ? UnifiedEngine.RECOVERY_COST[tier as RecoveryTier] : 0;
    const money = s.money ?? 0;
    if (oneTime > money) return { success: false, message: `Need $${oneTime}; you have $${money}.` };
    if (!s.lifestyle) s.lifestyle = { ...UnifiedEngine.DEFAULT_LIFESTYLE };
    (s.lifestyle as unknown as Record<string, HousingTier | CarTier | MealPlanTier | RecoveryTier>)[category] = tier;
    if (oneTime > 0) s.money = Math.max(0, money - oneTime);
    addStory(s, `Upgraded ${category}: now ${tier}.`);
    this.saveRng();
    return { success: true, message: `You upgraded to ${tier}.` };
  }

  /** Upgrade housing or meal plan (weekly cost; rent/food deducted each week). Requires one week's cost in bank to upgrade. */
  upgradeLifestyleWeekly(category: 'housing' | 'mealPlan', tier: HousingTier | MealPlanTier): { success: boolean; message: string } {
    const s = this.state;
    const L = s.lifestyle ?? UnifiedEngine.DEFAULT_LIFESTYLE;
    const order = (category === 'housing' ? UnifiedEngine.HOUSING_ORDER : UnifiedEngine.MEAL_PLAN_ORDER) as readonly (HousingTier | MealPlanTier)[];
    const current = L[category] as HousingTier | MealPlanTier;
    const currentIdx = order.indexOf(current);
    const targetIdx = order.indexOf(tier);
    if (targetIdx <= currentIdx) return { success: false, message: 'Already at that tier or invalid.' };
    const weekly = category === 'housing' ? UnifiedEngine.HOUSING_WEEKLY[tier as HousingTier] : UnifiedEngine.MEAL_PLAN_WEEKLY[tier as MealPlanTier];
    const money = s.money ?? 0;
    if (weekly > money) return { success: false, message: `You need $${weekly} (one week) in the bank to switch; you have $${money}.` };
    if (!s.lifestyle) s.lifestyle = { ...UnifiedEngine.DEFAULT_LIFESTYLE };
    (s.lifestyle as unknown as Record<string, HousingTier | MealPlanTier>)[category] = tier;
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
    const purchased = L.purchasedCustomIds ?? [];
    for (const id of purchased) {
      const item = UnifiedEngine.CUSTOM_LIFESTYLE_ITEMS.find((i) => i.id === id);
      if (!item?.effects) continue;
      if (item.effects.performanceMult != null) { w.performanceMult += item.effects.performanceMult; w.reasons.push(item.name); }
      if (item.effects.trainingMult != null) { w.trainingMult += item.effects.trainingMult; }
      if (item.effects.injuryRiskMult != null) { w.injuryRiskMult += item.effects.injuryRiskMult; }
    }
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
    /** Growth multiplier: energy + training mods only (no yearly cap — hours/energy are the limits). */
    const mult = () => Math.min(1, (0.4 + 0.6 * ((s.energy ?? 100) / 100)) * eff.trainingMult);
    const addGrowth = (attr: keyof UnifiedState, raw: number, _useYearlyCap = true) => {
      const cur = (s[attr] as number) ?? 50;
      const ceiling = s.potentialCeiling ?? 99;
      const diminished = raw > 0 ? (cur >= 92 ? raw * 0.25 : cur >= 85 ? raw * 0.5 : raw) : 0;
      const effectiveMult = mult();
      const actual = Math.floor(diminished * Math.min(1, effectiveMult));
      const capped = Math.min(ceiling - cur, actual);
      if (capped > 0) {
        (s as unknown as Record<string, number>)[attr] = cur + capped;
      }
    };

    switch (choiceKey) {
      case 'train_technique':
        s.trainedThisWeek = true;
        s.consecutiveRestWeeks = 0;
        s.energy = Math.max(0, (s.energy ?? 100) - energyCost);
        addGrowth('technique', canTrainHard ? this.rng.int(1, 3) : this.rng.int(0, 1));
        if (s.techniqueTranslationWeeks) s.techniqueTranslationWeeks--;
        s.conditioning = Math.min(100, (s.conditioning ?? 50) + (canTrainHard ? 1 : 0));
        addStory(s, canTrainHard ? 'You drilled hard. Technique improved.' : 'You were tired; light technique work.');
        break;
      case 'train_conditioning':
        s.trainedThisWeek = true;
        s.consecutiveRestWeeks = 0;
        s.energy = Math.max(0, (s.energy ?? 100) - energyCost);
        addGrowth('conditioning', canTrainHard ? this.rng.int(3, 6) : this.rng.int(1, 3), false);
        addStory(s, 'You pushed your cardio. Gas tank improved.');
        break;
      case 'train_strength':
        s.trainedThisWeek = true;
        s.consecutiveRestWeeks = 0;
        s.energy = Math.max(0, (s.energy ?? 100) - energyCost);
        addGrowth('strength', canTrainHard ? this.rng.int(0, 2) : this.rng.int(0, 1), false);
        s.conditioning = Math.min(100, (s.conditioning ?? 50) + (canTrainHard ? 1 : 0));
        addStory(s, 'You hit the weight room. Stronger.');
        break;
      case 'study_film':
        s.consecutiveRestWeeks = 0;
        addGrowth('matIQ', this.rng.int(0, 2));
        s.energy = Math.min(100, (s.energy ?? 100) + 5);
        addStory(s, 'Film study paid off. Mat IQ up.');
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

  /** NIL tier 0–3 from recruiting/rating + accolades (for 2025-style NIL ranges). */
  private getNILTierForPlayer(isTransfer: boolean): number {
    const s = this.state;
    if (isTransfer) {
      const rating = s.overallRating ?? 50;
      const ncaaTitles = s.stats?.ncaaTitles ?? 0;
      const allAmerican = (s.stats?.ncaaAllAmerican ?? 0) >= 1;
      if (ncaaTitles >= 1 || rating >= 90) return 0;   // top tier
      if (allAmerican || rating >= 80) return 1;      // AA
      if (rating >= 70) return 2;                     // starter P5
      return 3;
    }
    const recScore = s.recruitingScore ?? 50;
    const stateTitles = s.stats?.stateTitles ?? 0;
    if (recScore >= 88 || stateTitles >= 2) return 0;
    if (recScore >= 72 || stateTitles >= 1) return 1;
    if (recScore >= 58) return 2;
    return 3;
  }

  /** One NIL amount in range for division; strong-collective schools can bump tier up once. */
  private rollNILForOffer(tier: number, division: string, schoolId: string): number {
    const effectiveTier = STRONG_NIL_COLLECTIVE_IDS.has(schoolId) && tier > 0 ? Math.max(0, tier - 1) : tier;
    const scale = NIL_DIVISION_SCALE[division] ?? 0.15;
    const d1 = NIL_TIERS_D1[Math.min(effectiveTier, 3)];
    const min = Math.round(d1.min * scale);
    const max = Math.round(d1.max * scale);
    return this.rng.int(min, Math.max(min, max));
  }

  /** Max NIL for negotiation cap (tier + division + strong collective). */
  private getNILMaxForTier(tier: number, division: string, schoolId: string): number {
    const effectiveTier = STRONG_NIL_COLLECTIVE_IDS.has(schoolId) && tier > 0 ? Math.max(0, tier - 1) : tier;
    const scale = NIL_DIVISION_SCALE[division] ?? 0.15;
    const d1 = NIL_TIERS_D1[Math.min(effectiveTier, 3)];
    return Math.round(d1.max * scale);
  }

  private getProgramTier(schoolId: string): ProgramTier {
    return PROGRAM_TIER_BY_SCHOOL[schoolId] ?? 'D';
  }

  /** Build or reuse recruiting context for this class (slots used + committed weights per school). */
  private ensureRecruitingContext(): void {
    const s = this.state;
    if (s.recruitingClassContext) return;
    const ctx: Record<string, { slotsUsed: number; committedWeights: number[] }> = {};
    for (const sc of SCHOOLS) {
      const tier = this.getProgramTier(sc.id);
      const cfg = RECRUITING_TIER_CFG[tier];
      const slotsUsed = this.rng.int(0, Math.max(0, cfg.slots - 1)); // 0 to slots-1 used by "other" recruits
      const weightsWithNeed = COLLEGE_WEIGHT_CLASSES.filter((w) => (sc.needsByWeight[w] ?? 0) >= 1);
      const numCommitted = Math.min(slotsUsed, weightsWithNeed.length);
      const committedWeights: number[] = [];
      const shuffled = [...weightsWithNeed].sort(() => this.rng.float() - 0.5);
      for (let i = 0; i < numCommitted; i++) committedWeights.push(shuffled[i]);
      ctx[sc.id] = { slotsUsed, committedWeights };
    }
    s.recruitingClassContext = ctx;
  }

  /** Human-readable no-offer reason for UI. */
  private noOfferReasonMessage(reason: NoOfferReason, schoolName: string): string {
    switch (reason) {
      case 'set_at_your_weight': return `${schoolName}: Set at your weight.`;
      case 'budget_used': return `${schoolName}: Budget used for this class.`;
      case 'already_filled_spot': return `${schoolName}: Already filled spot at your weight.`;
      case 'no_slots_left': return `${schoolName}: No recruiting slots left.`;
      case 'academic_standards': return `${schoolName}: Academic standards not met.`;
      case 'not_a_fit': return `${schoolName}: Not a fit at this time.`;
      default: return `${schoolName}: No offer.`;
    }
  }

  /**
   * Evaluate whether a school will offer the player. Uses tier, need, slots, budget, and probability.
   * Returns either an offer or a clear no-offer reason.
   */
  private evaluateSchoolOffer(sc: School, collegeWc: number, recScore: number, gpa: number): { offer: CollegeOffer } | { noOffer: true; reason: NoOfferReason } {
    const s = this.state;
    this.ensureRecruitingContext();
    const ctx = s.recruitingClassContext![sc.id];
    if (!ctx) return { noOffer: true, reason: 'not_a_fit' };
    const tier = this.getProgramTier(sc.id);
    const cfg = RECRUITING_TIER_CFG[tier];
    const need = sc.needsByWeight[collegeWc] ?? sc.needsByWeight[this.collegeWeightForNeed(collegeWc)] ?? 0;
    const week = s.week ?? 1;
    const year = s.year ?? 1;

    if (gpa < sc.academicMinGPA) return { noOffer: true, reason: 'academic_standards' };
    if (need < 1) return { noOffer: true, reason: 'set_at_your_weight' };
    if (ctx.committedWeights.includes(collegeWc)) return { noOffer: true, reason: 'already_filled_spot' };
    if (ctx.slotsUsed >= cfg.slots) return { noOffer: true, reason: 'no_slots_left' };
    const budgetTotal = sc.scholarshipBudget ?? 0;
    const avgCostPerRecruit = tier === 'D' ? 0 : Math.max(20000, budgetTotal / (cfg.slots * 4));
    const budgetUsed = ctx.slotsUsed * avgCostPerRecruit;
    if (budgetTotal > 0 && budgetUsed >= budgetTotal * 0.92) return { noOffer: true, reason: 'budget_used' };
    if (recScore < cfg.minRecruiting) return { noOffer: true, reason: 'not_a_fit' };

    const needNorm = Math.min(1, need / 5);
    const talentFit = (recScore - cfg.minRecruiting) / (100 - cfg.minRecruiting);
    const competitionPenalty = ctx.slotsUsed / cfg.slots;
    const academicBonus = gpa >= sc.academicMinGPA + 0.3 ? 0.08 : 0;
    let chance = cfg.baseChance + needNorm * 0.2 + talentFit * 0.25 - competitionPenalty * 0.15 + academicBonus;
    chance = clamp(0.08, 0.92, chance);
    if (this.rng.float() > chance) return { noOffer: true, reason: 'not_a_fit' };

    const offer = this.buildRecruitingOffer(sc, collegeWc, recScore, need, week, year);
    return { offer };
  }

  /** Build one offer: type (full/partial/preferred walkon/walkon) and NIL from school pool by projected impact. */
  private buildRecruitingOffer(sc: School, collegeWc: number, recScore: number, need: number, week: number, year: number): CollegeOffer {
    const s = this.state;
    const tier = this.getProgramTier(sc.id);
    const cfg = RECRUITING_TIER_CFG[tier];
    const recNorm = recScore / 100;
    const needNorm = Math.min(1, need / 5);
    const depth = sc.rosterDepth[collegeWc] ?? 2;
    const wouldStartSoon = need >= 3 && depth <= 2;
    const stateChamp = (s.stats?.stateTitles ?? 0) >= 1;
    const marketability = recNorm * 0.7 + (stateChamp ? 0.2 : 0);

    let offerType: OfferType;
    if (recNorm >= 0.75 && needNorm >= 0.5) offerType = 'full';
    else if (recNorm >= 0.5 || needNorm >= 0.6) offerType = 'partial';
    else if (recNorm >= 0.35 || need >= 2) offerType = 'preferred_walkon';
    else offerType = 'walkon';

    let tuitionPct: number;
    if (offerType === 'full') tuitionPct = this.rng.int(85, 100);
    else if (offerType === 'partial') tuitionPct = clamp(25, 75, 25 + Math.floor((needNorm * 30 + recNorm * 25) * (0.9 + this.rng.float() * 0.2)));
    else tuitionPct = 0;

    const nilPool = cfg.nilPoolMin + this.rng.int(0, Math.max(0, cfg.nilPoolMax - cfg.nilPoolMin));
    const poolScale = sc.division === 'D1' ? 1 : sc.division === 'D2' ? 0.4 : sc.division === 'NAIA' ? 0.25 : 0.12;
    const effectivePool = Math.round(nilPool * poolScale);
    const starterShare = wouldStartSoon ? this.rng.float() * 0.25 + 0.15 : this.rng.float() * 0.06 + 0.02;
    const nilAnnual = Math.round(effectivePool * starterShare * marketability);
    const housingStipend = sc.division === 'D1' ? this.rng.int(0, 2000) : this.rng.int(0, 800);
    const mealPlanPct = offerType === 'full' ? this.rng.int(40, 80) : offerType === 'partial' ? this.rng.int(0, 50) : 0;
    const guaranteedStarter = wouldStartSoon && recNorm >= 0.65 && this.rng.float() < 0.4;

    return {
      id: `offer_${sc.id}_${year}_${week}`,
      schoolId: sc.id,
      schoolName: sc.name,
      division: sc.division as LeagueKey,
      offerType,
      tuitionCoveredPct: tuitionPct,
      nilAnnual,
      housingStipend,
      mealPlanPct,
      guaranteedStarter,
      deadlineWeek: week + 4,
      offeredAtWeek: week,
    };
  }

  private generateCollegeOffers(): void {
    const s = this.state;
    const gpa = this.gradesToGPA(s.grades ?? 75);
    const recScore = clamp(0, 100, s.recruitingScore ?? 50);
    const wc = s.weightClass ?? 145;
    const collegeWc = this.collegeWeightForNeed(wc);
    this.ensureRecruitingContext();

    const byDivision = {
      D1: SCHOOLS.filter((sc) => sc.division === 'D1'),
      D2: SCHOOLS.filter((sc) => sc.division === 'D2'),
      D3: SCHOOLS.filter((sc) => sc.division === 'D3'),
      NAIA: SCHOOLS.filter((sc) => sc.division === 'NAIA'),
      JUCO: SCHOOLS.filter((sc) => sc.division === 'JUCO'),
    };
    const pick = (arr: School[], n: number): School[] => {
      const sh = [...arr].sort(() => this.rng.float() - 0.5);
      return sh.slice(0, Math.min(n, sh.length));
    };
    let pool: School[] = [];
    if (recScore >= 70) {
      pool = [...pick(byDivision.D1, 6), ...pick(byDivision.D2, 3)];
    } else if (recScore >= 55) {
      pool = [...pick(byDivision.D1, 4), ...pick(byDivision.D2, 3), ...pick(byDivision.D3, 2), ...pick(byDivision.NAIA, 2)];
    } else if (recScore >= 40) {
      pool = [...pick(byDivision.D1, 2), ...pick(byDivision.D2, 3), ...pick(byDivision.D3, 2), ...pick(byDivision.NAIA, 2), ...pick(byDivision.JUCO, 2)];
    } else if (recScore >= 25) {
      pool = [...pick(byDivision.D2, 2), ...pick(byDivision.D3, 3), ...pick(byDivision.NAIA, 2), ...pick(byDivision.JUCO, 3)];
    } else {
      pool = [...pick(byDivision.D3, 2), ...pick(byDivision.NAIA, 3), ...pick(byDivision.JUCO, 4)];
    }
    pool = pool.filter((sc) => sc != null);
    if (pool.length === 0) pool = SCHOOLS.slice(0, 10);

    const offers: CollegeOffer[] = [];
    for (const sc of pool) {
      const result = this.evaluateSchoolOffer(sc, collegeWc, recScore, gpa);
      if ('offer' in result) offers.push(result.offer);
    }
    if (offers.length === 0) {
      for (const sc of [...byDivision.JUCO, ...byDivision.NAIA].slice(0, 6)) {
        const result = this.evaluateSchoolOffer(sc, collegeWc, recScore, gpa);
        if ('offer' in result) offers.push(result.offer);
        if (offers.length >= 3) break;
      }
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

  /** Request an offer from a specific school. Uses same recruiting logic; returns clear reason if no offer. */
  requestCollegeOffer(schoolId: string): { success: boolean; message: string } {
    const s = this.state;
    if (!s.pendingCollegeChoice) return { success: false, message: 'Not choosing a college right now.' };
    const existing = (s.offers ?? []).find((o: CollegeOffer) => o.schoolId === schoolId);
    if (existing) return { success: false, message: 'You already have an offer from this school.' };
    const sc = SCHOOLS.find((x) => x.id === schoolId);
    if (!sc) return { success: false, message: 'School not found.' };
    const gpa = this.gradesToGPA(s.grades ?? 75);
    const recScore = clamp(0, 100, s.recruitingScore ?? 50);
    const collegeWc = this.collegeWeightForNeed(s.weightClass ?? 145);
    const result = this.evaluateSchoolOffer(sc, collegeWc, recScore, gpa);
    if ('noOffer' in result) {
      return { success: false, message: this.noOfferReasonMessage(result.reason, sc.name) };
    }
    const offer = { ...result.offer, id: `${result.offer.id}_req` };
    if (!Array.isArray(s.offers)) s.offers = [];
    s.offers.push(offer);
    this.saveRng();
    return { success: true, message: `${sc.name} sent you an offer.` };
  }

  getCanAdvanceWeek(): boolean {
    return !this.state.pendingCollegeChoice && !this.state.transferPortalActive && !this.state.pendingCollegeGraduation && !this.state.careerEnded && !this.state.pendingCompetition && !this.state.pendingTournamentPlay;
  }

  getPendingCompetition(): PendingCompetitionState | null {
    return (this.state.pendingCompetition ?? null) as PendingCompetitionState | null;
  }

  getPendingTournamentPlay(): PendingTournamentPlay | null {
    return this.state.pendingTournamentPlay ?? null;
  }

  /** Start playing the bracket (minigame) after user clicked "Go to tournament" → "Play bracket". */
  startTournamentPlay(): boolean {
    const pt = this.state.pendingTournamentPlay;
    if (!pt) return false;
    const bracketSize = pt.bracketSize ?? 8;
    this.startPendingBracketCompetition(pt.kind, pt.phaseLabel, pt.eventType ?? 'tournament', pt.opponents, pt.offseasonEventKey, bracketSize);
    this.state.pendingTournamentPlay = null;
    this.saveRng();
    return true;
  }

  /** Simulate the full bracket without playing; updates record and summary, clears pendingTournamentPlay. */
  simulateTournamentBracket(): boolean {
    const pt = this.state.pendingTournamentPlay;
    if (!pt) return false;
    let roundIndex = 0;
    const getOpponent = (_round: string): Opponent => {
      const o = pt.opponents[roundIndex++ % pt.opponents.length] ?? { id: 'pad', name: 'Opponent', overallRating: 70, style: 'grinder', clutch: 50 };
      return { ...o, overallRating: o.overallRating ?? 50 };
    };
    const bracketSize = pt.bracketSize ?? 8;
    const { placement, matches } = this.runDoubleElimTournament(getOpponent, bracketSize);
    const wins = matches.filter((m) => m.won).length;
    const losses = matches.length - wins;
    const summary: WeekSummary = {
      week: pt.week,
      year: pt.year,
      phase: pt.phaseLabel,
      eventType: pt.eventType,
      message: [],
      matches: matches.map((m) => ({
        opponentName: m.opponentName,
        opponentOverall: m.opponentOverall,
        won: m.won,
        method: m.method,
      })),
      recordChange: { wins, losses },
      placement,
      bracketParticipants: pt.bracketParticipants,
    };
    const s = this.state;
    if (pt.kind === 'district') {
      s.stateQualified = placement <= DISTRICTS_QUALIFY_TOP;
      summary.message.push(s.stateQualified ? `Placed ${placement}. Qualified for state!` : `Placed ${placement}. Top ${DISTRICTS_QUALIFY_TOP} qualify.`);
    } else if (pt.kind === 'state') {
      s.stats.stateAppearances = (s.stats.stateAppearances ?? 0) + 1;
      s.stats.hsRecord.stateAppearances = (s.stats.hsRecord?.stateAppearances ?? 0) + 1;
      s.stats.statePlacements = s.stats.statePlacements ?? [];
      s.stats.statePlacements.push(placement);
      if (placement === 1) {
        s.stats.stateTitles = (s.stats.stateTitles ?? 0) + 1;
        s.stats.hsRecord.stateTitles = (s.stats.hsRecord?.stateTitles ?? 0) + 1;
        s.accolades.push('State Champion (Year ' + s.year + ')');
        summary.message.push('STATE CHAMPION!');
      }
      s.stateQualified = false;
    }
    if (pt.kind === 'tournament' && pt.conferenceQualifyTop != null) {
      const dnp = wins <= 1;
      s.ncaaQualified = !dnp && placement <= pt.conferenceQualifyTop;
      if (s.ncaaQualified) summary.message.push('Qualified for NCAA Championships!');
    }
    if (pt.kind === 'offseason' && pt.offseasonEventKey) {
      const key = pt.offseasonEventKey;
      const isDnp = wins <= 1;
      if (!isDnp) {
        if (key === 'fargo') {
          s.stats.fargoPlacements = s.stats.fargoPlacements ?? [];
          s.stats.fargoPlacements.push(placement);
          if (placement <= 2) s.accolades.push('Fargo ' + (placement === 1 ? 'Champ' : 'Runner-up') + ' (Year ' + s.year + ')');
        } else if (key === 'super32') {
          s.stats.super32Placements = s.stats.super32Placements ?? [];
          s.stats.super32Placements.push(placement);
          if (placement <= 2) s.accolades.push('Super 32 ' + (placement === 1 ? 'Champ' : 'Runner-up') + ' (Year ' + s.year + ')');
        } else if (key === 'us_open') {
          s.stats.usOpenPlacements = s.stats.usOpenPlacements ?? [];
          s.stats.usOpenPlacements.push(placement);
          if (placement <= 2) {
            s.qualifiedForWorldChampionshipThisYear = true;
            addStory(s, 'You qualified for the World Championship!');
            s.accolades.push('US Open ' + (placement === 1 ? 'Champ' : 'Runner-up') + ' (Year ' + s.year + ')');
          }
        } else if (key === 'world_championship') {
          s.stats.worldChampionshipPlacements = s.stats.worldChampionshipPlacements ?? [];
          s.stats.worldChampionshipPlacements.push(placement);
          if (placement <= 2) s.accolades.push('World ' + (placement === 1 ? 'Champion' : 'Runner-up') + ' (Year ' + s.year + ')');
        }
      }
    }
    summary.message.push(`${pt.phaseLabel}: ${wins}-${losses}.${placement != null ? ` Placed ${placement}.` : ''}`);
    s.lastWeekSummary = summary;
    addStory(s, summary.message[0] ?? pt.phaseLabel);
    if (HS_LEAGUES.includes(s.league)) this.computeRecruitingScore();
    s.pendingTournamentPlay = null;
    this.saveRng();
    return true;
  }

  /** Simulate the current match (no minigame); advances to next match or finalizes. */
  simulatePendingCompetitionMatch(): boolean {
    const s = this.state;
    const pc = s.pendingCompetition ?? null;
    if (!pc || !pc.current) return false;
    if (pc.finished) return false;
    const opponent = pc.current.opponent;
    const isRival = pc.current.roundLabel.toLowerCase().includes('rival');
    const { won, method } = this.simOneMatch(opponent, isRival);
    const completed: CompletedCompetitionMatch = {
      roundLabel: pc.current.roundLabel,
      opponentName: opponent.name,
      opponentOverall: opponent.overallRating,
      won,
      method,
      myScore: 0,
      oppScore: 0,
      exchangeLog: [],
    };
    pc.completed = pc.completed ?? [];
    pc.completed.push(completed);
    if (won) {
      s.stats.matchesWon++;
      s.stats.seasonWins++;
      if (HS_LEAGUES.includes(s.league)) s.stats.hsRecord.matchesWon++;
      else s.stats.collegeRecord.matchesWon++;
    } else {
      s.stats.matchesLost++;
      s.stats.seasonLosses++;
      if (HS_LEAGUES.includes(s.league)) s.stats.hsRecord.matchesLost++;
      else s.stats.collegeRecord.matchesLost++;
    }
    if (pc.bracket) {
      this.advancePendingBracket(pc, won);
    } else if (pc.queue) {
      this.advancePendingQueue(pc);
    } else {
      pc.finished = true;
      pc.finalResult = { won, method, myScore: 0, oppScore: 0, eliteEffectiveGap: 0, eliteBaseGap: 0, eliteFavoriteProb: won ? 1 : 0 };
      this.finalizePendingCompetition(pc);
      s.pendingCompetition = null;
    }
    s.pendingCompetition = pc;
    this.saveRng();
    return true;
  }

  playPendingCompetitionAction(actionKey: string, opts?: { timedOut?: boolean }): boolean {
    const s = this.state;
    const pc = s.pendingCompetition ?? null;
    if (!pc || !pc.current) return false;
    if (pc.finished) return false;

    const timedOut = !!opts?.timedOut;
    const res = resolveExchange(
      pc.current.matchState,
      actionKey,
      this.rng,
      { timerSeconds: pc.current.timerSeconds },
      { timedOut }
    );
    pc.current.matchState = res.state;
    if (res.nextPrompt) pc.current.prompt = res.nextPrompt;

    // If match finished, commit the match and either advance bracket or finish competition.
    if (res.state.finished && res.state.result) {
      const r = res.state.result;
      const completed: CompletedCompetitionMatch = {
        roundLabel: pc.current.roundLabel,
        opponentName: pc.current.opponent.name,
        opponentOverall: pc.current.opponent.overallRating,
        won: r.won,
        method: r.method,
        myScore: r.myScore,
        oppScore: r.oppScore,
        exchangeLog: [...res.state.logs],
      };
      pc.completed = pc.completed ?? [];
      pc.completed.push(completed);

      // Persist energy/health from the minigame match state
      s.energy = clamp(0, 100, Math.round(res.state.my.energy));
      s.health = clamp(0, 100, Math.round(100 - clamp(0, 1, res.state.my.injurySeverity) * 100));

      // Update record per match (applies to all competition kinds)
      if (completed.won) {
        s.stats.matchesWon++;
        s.stats.seasonWins++;
        if (HS_LEAGUES.includes(s.league)) s.stats.hsRecord.matchesWon++;
        else s.stats.collegeRecord.matchesWon++;
      } else {
        s.stats.matchesLost++;
        s.stats.seasonLosses++;
        if (HS_LEAGUES.includes(s.league)) s.stats.hsRecord.matchesLost++;
        else s.stats.collegeRecord.matchesLost++;
      }

      // Decide next step based on competition type
      if (pc.bracket) {
        this.advancePendingBracket(pc, completed.won);
      } else if (pc.queue) {
        this.advancePendingQueue(pc);
      } else {
        pc.finalResult = r;
        pc.finished = true;
        this.finalizePendingCompetition(pc);
        s.pendingCompetition = null;
      }
    }

    // Only keep pending competition if it wasn't just cleared (match/bracket finished)
    if (s.pendingCompetition != null) {
      s.pendingCompetition = pc;
    }
    this.saveRng();
    return true;
  }

  private toMinigameWrestlerFromPlayer(): MinigameWrestler {
    const s = this.state;
    const injurySeverity = clamp(0, 1, (100 - (s.health ?? 100)) / 100);
    return {
      name: s.name ?? 'You',
      overallRating: s.overallRating ?? 50,
      technique: s.technique ?? 50,
      matIQ: s.matIQ ?? 50,
      conditioning: s.conditioning ?? 50,
      strength: s.strength ?? 50,
      speed: s.speed ?? 50,
      flexibility: s.flexibility ?? 50,
      energy: s.energy ?? 100,
      injurySeverity,
    };
  }

  private toMinigameWrestlerFromOpponent(o: Opponent): MinigameWrestler {
    const base = o.overallRating ?? 60;
    const style = o.style ?? 'grinder';
    const bump = (k: number) => clamp(35, 98, base + k + this.rng.int(-4, 4));
    // Style-tilted attribute profiles derived from overall rating
    const technique = bump(style === 'defensive' ? 6 : style === 'scrambler' ? 3 : 2);
    const matIQ = bump(style === 'defensive' ? 8 : style === 'grinder' ? 3 : 2);
    const conditioning = bump(style === 'grinder' ? 8 : 3);
    const strength = bump(style === 'grinder' ? 10 : 2);
    const speed = bump(style === 'scrambler' ? 10 : 2);
    const flexibility = bump(style === 'scrambler' ? 8 : 2);
    return {
      name: o.name,
      overallRating: base,
      technique,
      matIQ,
      conditioning,
      strength,
      speed,
      flexibility,
      energy: 80,
      injurySeverity: 0,
    };
  }

  private startPendingSingleMatch(kind: CompetitionKind, phaseLabel: string, eventType: WeekSummary['eventType'], opponent: Opponent, roundLabel: string, offseasonEventKey?: string): void {
    const s = this.state;
    const id = `comp_${kind}_${s.year}_${s.week}_${this.rng.next()}`;
    const my = this.toMinigameWrestlerFromPlayer();
    const opp = this.toMinigameWrestlerFromOpponent(opponent);
    const matchState = createInitialMinigameState(my, opp, 'NEUTRAL');
    const prompt = generateExchangePrompt(matchState, { timerSeconds: DECISION_TIMER_SECONDS });
    const current: PendingCompetitionMatch = {
      id,
      roundLabel,
      opponent,
      position: 'NEUTRAL',
      matchState,
      prompt,
      timerSeconds: DECISION_TIMER_SECONDS,
    };
    const pc: PendingCompetitionState = {
      kind,
      week: s.week,
      year: s.year,
      phaseLabel,
      eventType,
      ...(offseasonEventKey ? { offseasonEventKey } : {}),
      singleMatch: { opponent, roundLabel },
      current,
      completed: [],
      finished: false,
      finalResult: null,
    };
    s.pendingCompetition = pc;
    addStory(s, `${phaseLabel}: Match vs ${opponent.name} (${opponent.overallRating}). Play the 3-period minigame.`);
  }

  private startPendingBracketCompetition(kind: CompetitionKind, phaseLabel: string, eventType: WeekSummary['eventType'], opponents: Opponent[], offseasonEventKey?: string, bracketSize: 8 | 16 = 8): void {
    const s = this.state;
    const needOpponents = bracketSize === 16 ? 15 : 7;
    const list = [...opponents];
    while (list.length < needOpponents) list.push({ id: 'pad', name: 'Opponent', overallRating: 70, style: 'grinder', clutch: 50 });
    const bracketOpponents = list.slice(0, needOpponents);
    const phase: PendingBracketPhase = bracketSize === 16 ? 'R16' : 'QF';
    const bracket: PendingBracketState = { size: bracketSize, phase, opponents: bracketOpponents, opponentIndex: 0 };
    const opp = bracket.opponents[bracket.opponentIndex++]!;
    const my = this.toMinigameWrestlerFromPlayer();
    const oppW = this.toMinigameWrestlerFromOpponent(opp);
    const matchState = createInitialMinigameState(my, oppW, 'NEUTRAL');
    const prompt = generateExchangePrompt(matchState, { timerSeconds: DECISION_TIMER_SECONDS });
    const current: PendingCompetitionMatch = {
      id: `comp_${kind}_${s.year}_${s.week}_${this.rng.next()}`,
      roundLabel: this.bracketRoundLabel(bracket.phase),
      opponent: opp,
      position: 'NEUTRAL',
      matchState,
      prompt,
      timerSeconds: DECISION_TIMER_SECONDS,
    };
    const pc: PendingCompetitionState = {
      kind,
      week: s.week,
      year: s.year,
      phaseLabel,
      eventType,
      ...(offseasonEventKey ? { offseasonEventKey } : {}),
      bracket,
      current,
      completed: [],
      finished: false,
      placement: undefined,
    };
    s.pendingCompetition = pc;
    addStory(s, `${phaseLabel}: Tournament bracket started. Play your matches one by one.`);
  }

  private startPendingQueueCompetition(kind: CompetitionKind, phaseLabel: string, eventType: WeekSummary['eventType'], matches: { opponent: Opponent; roundLabel: string }[]): void {
    const s = this.state;
    const first = matches[0] ?? { opponent: { id: 'pad', name: 'Opponent', overallRating: 70, style: 'grinder', clutch: 50 }, roundLabel: 'Dual' };
    const id = `comp_${kind}_${s.year}_${s.week}_${this.rng.next()}`;
    const my = this.toMinigameWrestlerFromPlayer();
    const oppW = this.toMinigameWrestlerFromOpponent(first.opponent);
    const matchState = createInitialMinigameState(my, oppW, 'NEUTRAL');
    const prompt = generateExchangePrompt(matchState, { timerSeconds: DECISION_TIMER_SECONDS });
    const current: PendingCompetitionMatch = {
      id,
      roundLabel: first.roundLabel,
      opponent: first.opponent,
      position: 'NEUTRAL',
      matchState,
      prompt,
      timerSeconds: DECISION_TIMER_SECONDS,
    };
    const pc: PendingCompetitionState = {
      kind,
      week: s.week,
      year: s.year,
      phaseLabel,
      eventType,
      queue: { matches, index: 0 },
      current,
      completed: [],
      finished: false,
    };
    s.pendingCompetition = pc;
    addStory(s, `${phaseLabel}: Multiple matches this week. Play them one by one.`);
  }

  private bracketRoundLabel(phase: PendingBracketPhase): string {
    switch (phase) {
      case 'R16':
        return 'R16';
      case 'QF':
        return 'Quarterfinal';
      case 'SF':
        return 'Semifinal';
      case 'WB_FINAL':
        return "Winner's Final";
      case 'FINAL':
        return 'Final';
      case 'RESET':
        return 'Bracket reset';
      case 'LB_FINAL':
        return 'LB Final';
      case 'CONS_R1':
        return 'Consolation R1';
      case 'CONS_R2':
        return 'Consolation R2';
      case 'CONS_R3':
        return 'Consolation R3';
      case 'CONS_R4':
        return 'Consolation R4';
      case 'THIRD_FOURTH':
        return '3rd/4th';
      default:
        return 'Match';
    }
  }

  private advancePendingBracket(pc: PendingCompetitionState, won: boolean): void {
    const b = pc.bracket;
    if (!b) return;
    if (b.phase === 'DONE') return;

    const s = this.state;
    const is16 = b.size === 16;
    const consWins = (pc.completed ?? []).filter((m) => m.roundLabel.includes('Consolation')).length;

    switch (b.phase) {
      case 'R16':
        b.phase = won ? 'QF' : 'CONS_R1';
        break;
      case 'QF':
        b.phase = won ? 'SF' : 'CONS_R1';
        break;
      case 'CONS_R1':
        if (!won) {
          b.phase = 'DONE';
          b.placement = this.rng.chance(0.5) ? (is16 ? 15 : 7) : (is16 ? 16 : 8);
        } else {
          b.phase = 'CONS_R2';
        }
        break;
      case 'CONS_R2':
        if (!won) {
          b.phase = 'DONE';
          b.placement = is16
            ? (consWins === 1 ? (this.rng.chance(0.5) ? 13 : 14) : (this.rng.chance(0.5) ? 5 : 6))
            : (this.rng.chance(0.5) ? 5 : 6);
        } else {
          b.phase = is16 ? 'CONS_R3' : 'THIRD_FOURTH';
        }
        break;
      case 'CONS_R3':
        if (!won) {
          b.phase = 'DONE';
          b.placement = this.rng.chance(0.5) ? 11 : 12;
        } else {
          b.phase = 'CONS_R4';
        }
        break;
      case 'CONS_R4':
        if (!won) {
          b.phase = 'DONE';
          b.placement = this.rng.chance(0.5) ? 9 : 10;
        } else {
          b.phase = 'THIRD_FOURTH';
        }
        break;
      case 'THIRD_FOURTH':
        b.phase = 'DONE';
        b.placement = won ? 3 : 4;
        break;
      case 'SF':
        b.phase = won ? 'WB_FINAL' : (is16 ? 'CONS_R2' : 'CONS_R2');
        break;
      case 'WB_FINAL':
        b.phase = won ? 'FINAL' : 'LB_FINAL';
        break;
      case 'LB_FINAL':
        if (!won) {
          b.phase = 'DONE';
          b.placement = 2;
        } else {
          b.phase = 'RESET';
        }
        break;
      case 'FINAL':
        b.phase = won ? 'DONE' : 'RESET';
        if (won) b.placement = 1;
        break;
      case 'RESET':
        b.phase = 'DONE';
        b.placement = won ? 1 : 2;
        break;
      default:
        break;
    }

    if (b.phase === 'DONE') {
      pc.finished = true;
      pc.placement = b.placement;
      this.finalizePendingCompetition(pc);
      s.pendingCompetition = null;
      return;
    }

    // Set up next match in bracket
    const nextOpp = b.opponents[b.opponentIndex++] ?? { id: 'pad', name: 'Opponent', overallRating: 70, style: 'grinder', clutch: 50 };
    const my = this.toMinigameWrestlerFromPlayer();
    const oppW = this.toMinigameWrestlerFromOpponent(nextOpp);
    const matchState = createInitialMinigameState(my, oppW, 'NEUTRAL');
    const prompt = generateExchangePrompt(matchState, { timerSeconds: DECISION_TIMER_SECONDS });
    pc.current = {
      id: `comp_${pc.kind}_${pc.year}_${pc.week}_${this.rng.next()}`,
      roundLabel: this.bracketRoundLabel(b.phase),
      opponent: nextOpp,
      position: 'NEUTRAL',
      matchState,
      prompt,
      timerSeconds: DECISION_TIMER_SECONDS,
    };
    s.pendingCompetition = pc;
  }

  private advancePendingQueue(pc: PendingCompetitionState): void {
    const q = pc.queue;
    if (!q) return;
    q.index++;
    if (q.index >= q.matches.length) {
      pc.finished = true;
      this.finalizePendingCompetition(pc);
      this.state.pendingCompetition = null;
      return;
    }
    const next = q.matches[q.index]!;
    const my = this.toMinigameWrestlerFromPlayer();
    const oppW = this.toMinigameWrestlerFromOpponent(next.opponent);
    const matchState = createInitialMinigameState(my, oppW, 'NEUTRAL');
    const prompt = generateExchangePrompt(matchState, { timerSeconds: DECISION_TIMER_SECONDS });
    pc.current = {
      id: `comp_${pc.kind}_${pc.year}_${pc.week}_${this.rng.next()}`,
      roundLabel: next.roundLabel,
      opponent: next.opponent,
      position: 'NEUTRAL',
      matchState,
      prompt,
      timerSeconds: DECISION_TIMER_SECONDS,
    };
  }

  private finalizePendingCompetition(pc: PendingCompetitionState): void {
    const s = this.state;
    const wins = (pc.completed ?? []).filter((m) => m.won).length;
    const losses = (pc.completed ?? []).length - wins;

    const summary: WeekSummary = {
      week: pc.week,
      year: pc.year,
      phase: pc.phaseLabel,
      eventType: pc.eventType,
      message: [],
    };

    // Postseason bracket logic (district/state are 16-man; placement 1–16)
    if (pc.kind === 'district') {
      const place = pc.placement ?? (pc.completed.length > 0 && pc.completed[pc.completed.length - 1]!.won ? 1 : 2);
      s.stateQualified = place <= DISTRICTS_QUALIFY_TOP;
      summary.eventType = 'district';
      summary.placement = place;
      summary.message.push(s.stateQualified ? `Districts: placed ${place}, qualified for state!` : `Districts: placed ${place}. Top ${DISTRICTS_QUALIFY_TOP} qualify.`);
    } else if (pc.kind === 'state') {
      const place = pc.placement ?? (pc.completed.length > 0 && pc.completed[pc.completed.length - 1]!.won ? 1 : 2);
      s.stats.stateAppearances++;
      s.stats.hsRecord.stateAppearances++;
      s.stats.statePlacements.push(place);
      summary.eventType = 'state';
      summary.placement = place;
      if (place === 1) {
        s.stats.stateTitles++;
        s.stats.hsRecord.stateTitles++;
        s.accolades.push('State Champion (Year ' + s.year + ')');
        summary.message.push('STATE CHAMPION!');
      } else if (place === 2) {
        summary.message.push('State: 2nd place.');
      } else {
        summary.message.push(`State: placed ${place}.`);
      }
      s.stateQualified = false;
    } else if (pc.kind === 'ncaa') {
      const m = pc.completed[pc.completed.length - 1]!;
      const place = m.won ? 1 : 2;
      s.stats.ncaaAppearances++;
      s.stats.collegeRecord.ncaaAppearances++;
      s.stats.ncaaPlacements.push(place);
      summary.eventType = 'state';
      summary.placement = place;
      if (place === 1) {
        s.stats.ncaaTitles++;
        s.stats.collegeRecord.ncaaTitles++;
        s.accolades.push('NCAA Champion (Year ' + s.year + ')');
        s.money = (s.money ?? 0) + 150_000;
        summary.message.push('NCAA CHAMPION! $150,000 bonus.');
      } else {
        s.stats.ncaaAllAmerican++;
        s.stats.collegeRecord.ncaaAllAmerican++;
        summary.message.push('NCAA finals: 2nd, All-American.');
      }
      s.ncaaQualified = false;
    }

    // Offseason event rewards/placement logging
    if (pc.kind === 'offseason' && pc.offseasonEventKey) {
      const key = pc.offseasonEventKey;
      const place = pc.placement ?? (pc.completed[pc.completed.length - 1]?.won ? 1 : 2);
      const isBracketEvent = key !== 'wno';
      const isDnp = isBracketEvent && wins <= 1;

      if (!isDnp) {
        if (key === 'fargo') {
          s.stats.fargoPlacements = s.stats.fargoPlacements ?? [];
          s.stats.fargoPlacements.push(place);
          if (place <= 2) s.accolades.push('Fargo ' + (place === 1 ? 'Champ' : 'Runner-up') + ' (Year ' + s.year + ')');
        } else if (key === 'super32') {
          s.stats.super32Placements = s.stats.super32Placements ?? [];
          s.stats.super32Placements.push(place);
          if (place <= 2) s.accolades.push('Super 32 ' + (place === 1 ? 'Champ' : 'Runner-up') + ' (Year ' + s.year + ')');
        } else if (key === 'us_open') {
          s.stats.usOpenPlacements = s.stats.usOpenPlacements ?? [];
          s.stats.usOpenPlacements.push(place);
          if (place <= 2) {
            s.qualifiedForWorldChampionshipThisYear = true;
            addStory(s, 'You qualified for the World Championship!');
            s.accolades.push('US Open ' + (place === 1 ? 'Champ' : 'Runner-up') + ' (Year ' + s.year + ')');
          }
        } else if (key === 'world_championship') {
          s.stats.worldChampionshipPlacements = s.stats.worldChampionshipPlacements ?? [];
          s.stats.worldChampionshipPlacements.push(place);
          if (place <= 2) s.accolades.push('World ' + (place === 1 ? 'Champion' : 'Runner-up') + ' (Year ' + s.year + ')');
        } else if (key === 'wno') {
          s.stats.wnoAppearances = (s.stats.wnoAppearances ?? 0) + 1;
          if (place === 1) {
            s.stats.wnoWins = (s.stats.wnoWins ?? 0) + 1;
            s.accolades.push('WNO Champion (Year ' + s.year + ')');
            s.overallRating = Math.min(99, (s.overallRating ?? 50) + 5);
          }
        }
      } else {
        // DNP: do not record placement in arrays; hide placement in summary
        pc.placement = undefined;
      }
    }

    if (pc.kind === 'dual') {
      summary.eventType = 'dual';
      summary.matches = (pc.completed ?? []).map((m) => ({
        opponentName: pc.completed.length > 1 ? `${m.opponentName} (${m.roundLabel})` : m.opponentName,
        opponentOverall: m.opponentOverall,
        won: m.won,
        method: m.method,
      }));
      summary.recordChange = { wins, losses };
      if (pc.completed.length === 1) {
        const m = pc.completed[0]!;
        summary.message.push(`${m.won ? 'W' : 'L'} vs ${m.opponentName} (${m.opponentOverall}) — ${m.method}.`);
      } else {
        summary.message.push(`${pc.phaseLabel}: ${wins}-${losses} in duals this week.`);
      }
    } else {
      // Tournament-style (including offseason brackets)
      summary.eventType = pc.eventType ?? 'tournament';
      summary.matches = (pc.completed ?? []).map((m) => ({
        opponentName: `${m.opponentName} (${m.roundLabel})`,
        opponentOverall: m.opponentOverall,
        won: m.won,
        method: m.method,
      }));
      summary.recordChange = { wins, losses };
      if (pc.placement != null) summary.placement = pc.placement;
      if (pc.kind !== 'district' && pc.kind !== 'state' && pc.kind !== 'ncaa') {
        summary.message.push(`${pc.phaseLabel}: ${wins}-${losses}.${pc.placement != null ? ` Placed ${pc.placement}.` : ''}`);
      }
    }

    // Detailed exchange logs (3 per match)
    for (const m of pc.completed ?? []) {
      summary.message.push(`${m.won ? 'W' : 'L'} ${m.roundLabel}: vs ${m.opponentName} (${Math.round(m.opponentOverall)}) — ${m.method} (${m.myScore}-${m.oppScore})`);
      for (const ex of m.exchangeLog ?? []) {
        const injB = Math.round((ex.myInjuryBefore ?? 0) * 100);
        const injA = Math.round((ex.myInjuryAfter ?? 0) * 100);
        const timed = ex.timedOut ? ' (TIMER EXPIRED)' : '';
        const timerFail = ex.timerFailureScored ? ' TIMER FAILURE: gave up points.' : '';
        summary.message.push(
          `P${ex.period} ${ex.position}: ${ex.actionLabel}${timed} — ${ex.success ? 'SUCCESS' : 'FAIL'} (${ex.pointsFor}-${ex.pointsAgainst}) Energy ${Math.round(ex.myEnergyBefore)}→${Math.round(ex.myEnergyAfter)} Injury ${injB}→${injA}%${timerFail}`
        );
      }
    }

    s.lastWeekSummary = summary;
    addStory(s, summary.message[0] ?? pc.phaseLabel);

    // Conference qualification (after bracket completion)
    if (isInCollege(s) && /conference/i.test(pc.phaseLabel) && pc.placement != null) {
      const dnp = wins <= 1;
      s.ncaaQualified = !dnp && pc.placement <= CONFERENCE_QUALIFY_TOP;
      if (s.ncaaQualified) {
        summary.message.push('Qualified for NCAA Championships!');
        addStory(s, 'Qualified for NCAA Championships!');
      }
    }

    // Recruiting updates after HS competition weeks
    if (HS_LEAGUES.includes(s.league)) {
      this.computeRecruitingScore();
    }
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
    s.transferOffers = [];
    addStory(s, 'You entered the transfer portal. Request interest from schools; they may or may not offer.');
    this.saveRng();
    return true;
  }

  /** Request a transfer offer from a specific school (same idea as requestCollegeOffer). Returns offer or clear reason. */
  requestTransferOffer(schoolId: string): { success: boolean; message: string } {
    const s = this.state;
    if (!s.transferPortalActive) return { success: false, message: 'Not in the transfer portal.' };
    const existing = (s.transferOffers ?? []).find((o: CollegeOffer) => o.schoolId === schoolId);
    if (existing) return { success: false, message: 'You already have an offer from this school.' };
    const currentName = (s.collegeName ?? '').toLowerCase();
    const sc = SCHOOLS.find((x) => x.id === schoolId);
    if (!sc) return { success: false, message: 'School not found.' };
    if (sc.name.toLowerCase() === currentName) return { success: false, message: "That's your current school." };
    const wc = s.weightClass ?? 145;
    const collegeWc = this.collegeWeightForNeed(wc);
    const need = sc.needsByWeight[collegeWc] ?? sc.needsByWeight[wc] ?? 0;
    const rating = s.overallRating ?? 60;
    if (need < 1) return { success: false, message: `${sc.name}: Set at your weight.` };
    const tier = this.getProgramTier(sc.id);
    const cfg = RECRUITING_TIER_CFG[tier];
    const minRatingByTier: Record<ProgramTier, number> = { A: 72, B: 62, C: 52, D: 42 };
    const minRating = minRatingByTier[tier];
    if (rating < minRating && this.rng.float() < 0.75) return { success: false, message: `${sc.name}: Not interested at this time.` };
    const needNorm = Math.min(1, need / 5);
    const ratingNorm = (rating - 50) / 50;
    const chance = clamp(0.15, 0.85, cfg.baseChance * 0.9 + needNorm * 0.2 + ratingNorm * 0.25);
    if (this.rng.float() > chance) return { success: false, message: `${sc.name}: Passed for now.` };
    const offer = this.buildTransferOffer(sc, collegeWc, rating, s.week ?? 1, s.year ?? 1);
    if (!Array.isArray(s.transferOffers)) s.transferOffers = [];
    s.transferOffers.push(offer);
    this.saveRng();
    return { success: true, message: `${sc.name} sent you a transfer offer.` };
  }

  private buildTransferOffer(sc: School, collegeWc: number, rating: number, week: number, year: number): CollegeOffer {
    const s = this.state;
    const need = sc.needsByWeight[collegeWc] ?? 3;
    const needNorm = Math.min(1, need / 5);
    const ratingNorm = (rating - 50) / 50;
    const recNorm = (s.recruitingScore ?? 50) / 100;
    const tuitionPct = clamp(25, 95, 30 + Math.floor((needNorm * 30 + recNorm * 25 + ratingNorm * 15) * (0.9 + this.rng.float() * 0.2)));
    const nilTier = this.getNILTierForPlayer(true);
    const nilAnnual = this.rollNILForOffer(nilTier, sc.division, sc.id);
    return {
      id: `transfer_${sc.id}_${year}_${week}_req`,
      schoolId: sc.id,
      schoolName: sc.name,
      division: sc.division as LeagueKey,
      offerType: tuitionPct >= 80 ? 'full' : tuitionPct >= 25 ? 'partial' : 'preferred_walkon',
      tuitionCoveredPct: tuitionPct,
      nilAnnual,
      housingStipend: sc.division === 'D1' ? this.rng.int(400, 2200) : sc.division === 'D2' ? this.rng.int(200, 1200) : this.rng.int(0, 800),
      mealPlanPct: this.rng.int(10, 50),
      guaranteedStarter: this.rng.float() < 0.5,
      deadlineWeek: week + 4,
      offeredAtWeek: week,
    };
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
    const nilTier = this.getNILTierForPlayer(true);
    for (const sc of pool) {
      const need = needAt(sc) || 3;
      const needNorm = Math.min(1, need / 5);
      const recNorm = (s.recruitingScore ?? 50) / 100;
      const ratingNorm = (rating - 50) / 50;
      const tuitionPct = clamp(25, 95, 30 + Math.floor((needNorm * 30 + recNorm * 35 + ratingNorm * 10) * (0.95 + this.rng.float() * 0.15)));
      const nilAnnual = this.rollNILForOffer(nilTier, sc.division, sc.id);
      offers.push({
        id: `transfer_${sc.id}_${year}_${week}`,
        schoolId: sc.id,
        schoolName: sc.name,
        division: sc.division as LeagueKey,
        offerType: 'full' as OfferType,
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
    const attempts = s.negotiationAttempts?.[schoolId] ?? { tuition: 0, nil: 0 };
    const used = kind === 'tuition' ? attempts.tuition : attempts.nil;
    if (used >= 2) {
      this.saveRng();
      return { success: false, message: kind === 'tuition' ? "They've reached their limit on scholarship." : "They've reached their limit on NIL.", kind };
    }
    const offer = offers[idx] as CollegeOffer;
    if (request.moreTuition && offer.tuitionCoveredPct >= 100) return { success: false, message: 'Already full scholarship.', kind };
    const need = school.needsByWeight[this.collegeWeightForNeed(s.weightClass ?? 145)] ?? school.needsByWeight[s.weightClass ?? 145] ?? 3;
    const ratingNorm = ((s.overallRating ?? 60) - 50) / 50;
    const baseChance = clamp(0.3, 0.75, 0.4 + (need / 5) * 0.2 + school.coachAggressiveness * 0.1 + ratingNorm * 0.2);
    const chance = baseChance * Math.pow(0.4, used);
    if (this.rng.float() >= chance) {
      this.saveRng();
      return { success: false, message: "They didn't budge.", kind };
    }
    const updated = { ...offer };
    if (request.moreTuition && offer.tuitionCoveredPct < 100) {
      const room = 100 - offer.tuitionCoveredPct;
      const bump = room <= 10 ? this.rng.int(1, 3) : room <= 25 ? this.rng.int(3, 7) : this.rng.int(5, 11);
      updated.tuitionCoveredPct = Math.min(100, offer.tuitionCoveredPct + bump);
    }
    if (request.moreNIL) {
      const tier = this.getNILTierForPlayer(true);
      const cap = this.getNILMaxForTier(tier, school.division, school.id);
      const room = cap - offer.nilAnnual;
      const bump = room <= 5000 ? this.rng.int(500, 2000) : room <= 20000 ? this.rng.int(2000, 8000) : this.rng.int(3000, 14_000);
      updated.nilAnnual = Math.min(cap, offer.nilAnnual + bump);
    }
    (s.transferOffers as CollegeOffer[])[idx] = updated;
    if (!s.negotiationAttempts) s.negotiationAttempts = {};
    if (!s.negotiationAttempts[schoolId]) s.negotiationAttempts[schoolId] = { tuition: 0, nil: 0 };
    if (request.moreTuition) s.negotiationAttempts[schoolId].tuition++;
    if (request.moreNIL) s.negotiationAttempts[schoolId].nil++;
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
    s.nilAnnual = offer.nilAnnual ?? 0;
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
    s.nilAnnual = offer.nilAnnual ?? 0;
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
    const attempts = s.negotiationAttempts?.[schoolId] ?? { tuition: 0, nil: 0 };
    const used = kind === 'tuition' ? attempts.tuition : attempts.nil;
    if (used >= 2) {
      this.saveRng();
      return { success: false, message: kind === 'tuition' ? "They've reached their limit on scholarship." : "They've reached their limit on NIL.", kind };
    }
    const offer = offers[idx] as CollegeOffer;
    if (request.moreTuition && offer.tuitionCoveredPct >= 100) return { success: false, message: 'Already full scholarship.', kind };
    const need = school.needsByWeight[this.collegeWeightForNeed(s.weightClass ?? 145)] ?? 3;
    const recNorm = (s.recruitingScore ?? 50) / 100;
    const baseChance = clamp(0.25, 0.7, 0.35 + recNorm * 0.3 + (need / 5) * 0.15 + school.coachAggressiveness * 0.1);
    const chance = baseChance * Math.pow(0.4, used);
    if (this.rng.float() >= chance) {
      this.saveRng();
      return { success: false, message: "They didn't budge.", kind };
    }
    const updated = { ...offer };
    if (request.moreTuition && offer.tuitionCoveredPct < 100) {
      const room = 100 - offer.tuitionCoveredPct;
      const bump = room <= 10 ? this.rng.int(1, 3) : room <= 25 ? this.rng.int(3, 7) : this.rng.int(5, 12);
      updated.tuitionCoveredPct = Math.min(100, offer.tuitionCoveredPct + bump);
    }
    if (request.moreNIL) {
      const tier = this.getNILTierForPlayer(false);
      const cap = this.getNILMaxForTier(tier, school.division, school.id);
      const room = cap - offer.nilAnnual;
      const bump = room <= 5000 ? this.rng.int(500, 2000) : room <= 20000 ? this.rng.int(2000, 8000) : this.rng.int(3000, 14_000);
      updated.nilAnnual = Math.min(cap, offer.nilAnnual + bump);
    }
    (s.offers as CollegeOffer[])[idx] = updated;
    if (!s.negotiationAttempts) s.negotiationAttempts = {};
    if (!s.negotiationAttempts[schoolId]) s.negotiationAttempts[schoolId] = { tuition: 0, nil: 0 };
    if (request.moreTuition) s.negotiationAttempts[schoolId].tuition++;
    if (request.moreNIL) s.negotiationAttempts[schoolId].nil++;
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
    if (stateRanked.length > 0 && stateRanked[0].overallRating < 90) {
      stateRanked[0] = { ...stateRanked[0], overallRating: 90 };
    }
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
    if (nationalRanked.length > 0 && nationalRanked[0].overallRating < 90) {
      nationalRanked[0] = { ...nationalRanked[0], overallRating: 90 };
    }
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
    const collegeName = this.state.collegeName ?? 'NC State';
    const school = SCHOOLS.find((sc) => sc.name === collegeName);
    const schoolId = school?.id ?? 'nc-state';
    const coachAggressiveness = school?.coachAggressiveness ?? 0.7;
    return generateSeasonSchedule(schoolId, coachAggressiveness, this.rng);
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

  /** True if grades are high enough to be eligible to compete. */
  private canWrestle(): boolean {
    return (this.state.grades ?? 75) >= MIN_GRADES_TO_WRESTLE;
  }

  getCanWrestle(): boolean {
    return this.canWrestle();
  }

  static getMinGradesToWrestle(): number {
    return MIN_GRADES_TO_WRESTLE;
  }

  private findOpponent(id: string): Opponent | null {
    const p = this.state.opponentPools;
    if (!p) return null;
    const all = [...p.unranked, ...p.stateRanked, ...p.nationalRanked];
    return all.find((o) => o.id === id) ?? null;
  }

  /** Get the finals opponent from rankings at player's weight (the other top-2 wrestler). Returns null if rankings empty or only player. */
  private getFinalsOpponentFromRankings(): Opponent | null {
    const s = this.state;
    this.getRankingsBoard(); // ensure rankings populated
    const wc = s.weightClass ?? 145;
    const list = s.rankingsByWeight?.[wc];
    if (!list || list.length === 0) return null;
    const withPlayer = [
      ...list.filter((e) => e.id !== 'player'),
      { id: 'player', name: s.name, overallRating: s.overallRating ?? 50, trueSkill: s.trueSkill ?? 50 },
    ];
    withPlayer.sort((a, b) => b.overallRating - a.overallRating);
    const top2 = withPlayer.slice(0, 2);
    const other = top2.find((e) => e.id !== 'player');
    if (!other) return null;
    return {
      id: other.id,
      name: other.name,
      overallRating: other.overallRating,
      style: 'grinder',
      clutch: 50,
    };
  }

  private simOneMatch(opponent: Opponent, isRival: boolean): { won: boolean; method: string } {
    const s = this.state;
    const eff = getEffectiveModifiers(s);
    const injurySeverity = Math.max(0, (100 - (s.health ?? 100)) / 100);
    const composure = Math.max(0, 100 - (s.stress ?? 50));
    const result = simEliteMatch(
      {
        baseA: s.overallRating ?? 50,
        energyA: s.energy ?? 100,
        injuryA: injurySeverity,
        composureA: composure,
        baseB: opponent.overallRating,
        energyB: 80,
        injuryB: 0,
        composureB: 80,
        performanceMult: eff.performanceMult,
        isRival,
      },
      this.rng
    );
    if (result.upsetLogLine) addStory(s, (s.story || '') + '\n' + result.upsetLogLine);
    return { won: result.won, method: result.method };
  }

  /**
   * Build bracket (8- or 16-person). Seed 1 = player; opponents pad to 7 or 15.
   * getOpponent cycles through the opponent list by round.
   */
  private buildBracket(
    playerName: string,
    playerRating: number,
    opponents: Opponent[],
    size: 8 | 16 = 8
  ): { participants: BracketParticipant[]; getOpponent: (round: string) => Opponent } {
    const pad: Opponent = { id: 'bracket_pad', name: 'Opponent', overallRating: 70, style: 'grinder', clutch: 50 };
    const need = size === 16 ? 15 : 7;
    const list = [...opponents];
    while (list.length < need) list.push(pad);
    const slice = list.slice(0, need);
    const participants: BracketParticipant[] = [
      { seed: 1, name: playerName, overallRating: playerRating },
      ...slice.map((o, i) => ({ seed: i + 2, name: o.name, overallRating: o.overallRating ?? 50 })),
    ];
    let roundIndex = 0;
    const getOpponent = (_round: string): Opponent => {
      const o = slice[roundIndex++ % need]!;
      return { ...o, overallRating: o.overallRating ?? 50 };
    };
    return { participants, getOpponent };
  }

  /** Generate named opponents for brackets (no pool). Default 7; use count 15 for 16-man. */
  private generateNamedBracketOpponents(
    myRating: number,
    options: { minRating?: number; maxRating?: number; prestige?: number; count?: number }
  ): Opponent[] {
    const first = ['Jake', 'Kyle', 'David', 'Ryan', 'Cole', 'Blake', 'Mason', 'Hunter', 'Chase', 'Tyler', 'Brody', 'Cade'];
    const last = ['Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'Martinez', 'Lee'];
    const styles: Opponent['style'][] = ['grinder', 'scrambler', 'defensive'];
    const min = options.minRating ?? 52;
    const max = options.maxRating ?? 95;
    const prestige = options.prestige ?? 1;
    const count = options.count ?? 7;
    const out: Opponent[] = [];
    for (let i = 0; i < count; i++) {
      const spread = i <= 1 ? this.rng.int(2, 10) : i <= (count >> 1) ? this.rng.int(-2, 8) : this.rng.int(-4, 6);
      const rating = clamp(min, max, myRating + spread + (prestige - 1) * 4);
      out.push({
        id: `bracket_${i}`,
        name: first[this.rng.next() % first.length] + ' ' + last[this.rng.next() % last.length],
        overallRating: rating,
        style: styles[this.rng.next() % 3],
        clutch: this.rng.int(40, 85),
      });
    }
    out.sort((a, b) => b.overallRating - a.overallRating);
    return out;
  }

  /** Convert unified Opponent to TournamentOpponent for bracket sim. */
  private toTournamentOpponent(o: Opponent): TournamentOpponent {
    return {
      id: o.id,
      name: o.name,
      overallRating: o.overallRating,
      style: o.style,
      clutch: o.clutch,
      stateRank: o.stateRank,
      nationalRank: o.nationalRank,
    };
  }

  /**
   * Run double-elimination bracket (8- or 16-man): effective rating, matchup terms, energy/injury,
   * WB/LB and bracket reset. Placement from elimination order; record = actual match W-L.
   */
  private runDoubleElimTournament(getOpponent: (round: string) => Opponent, bracketSize: 8 | 16 = 8): { placement: number; matches: NonNullable<WeekSummary['matches']> } {
    const s = this.state;
    const eff = getEffectiveModifiers(s);
    const player: TournamentPlayerState = {
      technique: s.technique ?? 50,
      matIQ: s.matIQ ?? 50,
      conditioning: s.conditioning ?? 50,
      strength: s.strength ?? 50,
      speed: s.speed ?? 50,
      flexibility: s.flexibility ?? 50,
      energy: s.energy ?? 100,
      health: s.health ?? 100,
      stress: s.stress ?? 50,
      trueSkill: s.trueSkill ?? 50,
      overallRating: s.overallRating ?? 50,
      injurySeverity: 0,
      performanceMult: eff.performanceMult,
    };
    const getTournamentOpp = (round: string): TournamentOpponent => this.toTournamentOpponent(getOpponent(round));
    const result = runDoubleElimBracket(player, getTournamentOpp, this.rng, bracketSize);
    const validation = validateBracketMatchSequence(result.matches);
    if (!validation.valid && typeof console !== 'undefined' && console.warn) {
      console.warn('[Tournament] Invalid bracket sequence:', validation.message);
    }
    s.energy = Math.max(0, player.energy);
    if (player.injurySeverity > 0) {
      const healthPenalty = Math.min(25, player.injurySeverity * 3);
      s.health = Math.max(0, (s.health ?? 100) - healthPenalty);
    }
    const matches: NonNullable<WeekSummary['matches']> = result.matches.map((m: BracketMatchEntry) => ({
      opponentName: `${m.opponentName} (${m.roundLabel})`,
      opponentOverall: m.opponentOverall,
      stateRank: m.stateRank,
      nationalRank: m.nationalRank,
      won: m.won,
      method: m.method,
    }));
    return { placement: result.placement, matches };
  }

  private runHSWeekCompetition(): WeekSummary | null {
    const s = this.state;
    if (!HS_LEAGUES.includes(s.league) || s.week < HS_REGULAR_START || s.week > HS_REGULAR_END) return null;
    if (!s.hsSchedule || s.hsSchedule.length === 0) return null;
    const entry = s.hsSchedule.find((e) => e.week === s.week);
    if (!entry || entry.type === 'none') return null;
    const summary: WeekSummary = { week: s.week, year: s.year, phase: getHSPhase(s.week), message: [] };
    const recBefore = s.recruitingScore ?? 50;

    if (!this.canWrestle()) {
      summary.eventType = entry.type === 'tournament' ? 'tournament' : 'dual';
      summary.message.push("Grades too low — you're ineligible. No competition this week.");
      s.lastWeekSummary = summary;
      return summary;
    }

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
      this.startPendingSingleMatch('dual', getHSPhase(s.week), 'dual', opponent, entry.type === 'rival' ? 'Rival dual' : 'Dual');
      this.saveRng();
      return null;
    } else if (entry.type === 'tournament') {
      const pool = s.opponentPools;
      const rankedList = [...(pool?.stateRanked ?? []), ...(pool?.nationalRanked ?? [])]
        .sort((a, b) => b.overallRating - a.overallRating);
      let bracketOpponents: Opponent[] =
        rankedList.length >= 7
          ? rankedList.slice(0, 7)
          : [...rankedList, ...(pool?.unranked ?? []).slice(0, Math.max(0, 7 - rankedList.length))];
      if (bracketOpponents.length === 0) bracketOpponents = (pool?.unranked ?? []).slice(0, 7);
      if (bracketOpponents.length === 0) {
        bracketOpponents = [{ id: 'fallback', name: 'Opponent', overallRating: 70, style: 'grinder', clutch: 50 }];
      }
      const myRating = s.overallRating ?? 50;
      const { participants } = this.buildBracket(s.name, myRating, bracketOpponents);
      s.pendingTournamentPlay = {
        kind: 'tournament',
        phaseLabel: getHSPhase(s.week),
        eventType: 'tournament',
        week: s.week,
        year: s.year,
        opponents: bracketOpponents,
        bracketParticipants: participants,
      };
      summary.eventType = 'tournament';
      summary.message.push('Tournament this week. Go to tournament to compete.');
      summary.bracketParticipants = participants;
      this.computeRecruitingScore();
      summary.recruitingChange = (s.recruitingScore ?? 50) - recBefore;
      s.lastWeekSummary = summary;
      this.saveRng();
      return summary;
    }

    this.computeRecruitingScore();
    summary.recruitingChange = (s.recruitingScore ?? 50) - recBefore;
    s.lastWeekSummary = summary;
    return summary;
  }

  private runCollegeWeekCompetition(): WeekSummary | null {
    const s = this.state;
    if (!isInCollege(s) || !s.collegeSchedule || s.week < 1 || s.week > SEASON_WEEKS) return null;
    const entry = s.collegeSchedule.find((e) => e.week === s.week);
    if (!entry) return null;
    if (entry.type === 'ncaa') return null;
    const summary: WeekSummary = { week: s.week, year: s.year, phase: entry.phase ?? 'College season', message: [] };
    if (entry.type === 'conference') {
      return this.runConferenceTournamentWeek(summary, entry);
    }
    if (entry.type === 'none') {
      summary.message.push('Recovery week — no competition.');
      s.lastWeekSummary = summary;
      return summary;
    }
    if (entry.isTravelWeek) {
      s.energy = Math.max(0, (s.energy ?? 100) - this.rng.int(3, 8));
      summary.energyChange = -this.rng.int(3, 8);
      summary.message.push('Travel fatigue from the road trip.');
    }

    if (!this.canWrestle()) {
      summary.eventType = entry.type === 'tournament' ? 'tournament' : 'dual';
      summary.message.push("Academic ineligibility — grades too low. You didn't compete.");
      s.lastWeekSummary = summary;
      return summary;
    }

    if (entry.type === 'dual') {
      if (!this.isStarterAtWeight()) {
        summary.eventType = 'dual';
        summary.message.push(`You didn't start — backup at ${s.weightClass} lbs. Next week: keep training to earn the spot.`);
        s.lastWeekSummary = summary;
        return summary;
      }
      const opponents = entry.opponentNames?.length ? entry.opponentNames : (entry.opponentName ? [entry.opponentName] : ['Opponent']);
      const queueMatches: { opponent: Opponent; roundLabel: string }[] = [];
      for (let i = 0; i < opponents.length; i++) {
        const oppName = opponents[i];
        const oppSchool = SCHOOLS.find((sc) => sc.name === oppName);
        const isPowerhouseOpp = oppSchool ? isPowerhouse(oppSchool.id) : false;
        const isConf = entry.isConference ?? false;
        const ratingBump = (isPowerhouseOpp ? 4 : 0) + (isConf ? 2 : 0) + (entry.phase === 'conference_stretch' ? 2 : 0);
        const oppRating = clamp(50, 92, (s.overallRating ?? 50) + this.rng.int(-8, 10) + ratingBump);
        const opponent: Opponent = { id: `col_dual_${i}`, name: oppName, overallRating: oppRating, style: 'grinder', clutch: 50 };
        queueMatches.push({ opponent, roundLabel: opponents.length > 1 ? `Dual ${i + 1}` : 'Dual' });
      }
      this.startPendingQueueCompetition('dual', entry.phase ?? 'College season', 'dual', queueMatches);
      this.saveRng();
      return null;
    } else if (entry.type === 'tournament') {
      const openNoStart = (entry.eventFormat === 'open' || entry.eventFormat === 'invite') && entry.starterParticipates === false;
      if (openNoStart && this.isStarterAtWeight()) {
        summary.eventType = 'tournament';
        summary.message.push(`Coach sat the starters at ${entry.tournamentName ?? 'the open'} — recovery week for you.`);
        s.lastWeekSummary = summary;
        return summary;
      }
      if (!this.isStarterAtWeight()) {
        summary.eventType = 'tournament';
        summary.message.push(`You didn't travel — backup at ${s.weightClass}.`);
        s.lastWeekSummary = summary;
        return summary;
      }
      const myRating = s.overallRating ?? 50;
      const bigTournament = entry.eventFormat === 'big_tournament' || entry.eventFormat === 'invite';
      const collegeOpponents = this.generateNamedBracketOpponents(myRating, {
        minRating: 52,
        maxRating: 95,
        prestige: bigTournament ? 2 : 1,
      });
      const { participants } = this.buildBracket(s.name, myRating, collegeOpponents);
      s.pendingTournamentPlay = {
        kind: 'tournament',
        phaseLabel: entry.tournamentName ?? 'Tournament',
        eventType: 'tournament',
        week: s.week,
        year: s.year,
        opponents: collegeOpponents,
        bracketParticipants: participants,
      };
      summary.eventType = 'tournament';
      summary.message.push('Tournament this week. Go to tournament to compete.');
      summary.bracketParticipants = participants;
      s.lastWeekSummary = summary;
      this.saveRng();
      return summary;
    }
    s.lastWeekSummary = summary;
    return summary;
  }

  private runConferenceTournamentWeek(summary: WeekSummary, entry: CollegeScheduleEntry): WeekSummary | null {
    const s = this.state;
    if (entry.isTravelWeek) {
      s.energy = Math.max(0, (s.energy ?? 100) - this.rng.int(3, 8));
      summary.energyChange = -this.rng.int(3, 8);
      summary.message.push('Travel fatigue from the conference trip.');
    }
    if (!this.canWrestle()) {
      summary.eventType = 'tournament';
      summary.message.push("Academic ineligibility — you didn't compete at Conference.");
      s.lastWeekSummary = summary;
      return summary;
    }
    if (!this.isStarterAtWeight()) {
      summary.eventType = 'tournament';
      summary.message.push(`You didn't compete at Conference — backup at ${s.weightClass}.`);
      s.lastWeekSummary = summary;
      return summary;
    }
    const myRating = s.overallRating ?? 50;
    const confOpponents = this.generateNamedBracketOpponents(myRating, { minRating: 55, maxRating: 95, prestige: 2 });
    const { participants } = this.buildBracket(s.name, myRating, confOpponents);
    s.pendingTournamentPlay = {
      kind: 'tournament',
      phaseLabel: entry.tournamentName ?? 'Conference Championship',
      eventType: 'tournament',
      week: s.week,
      year: s.year,
      opponents: confOpponents,
      bracketParticipants: participants,
      conferenceQualifyTop: CONFERENCE_QUALIFY_TOP,
    };
    summary.eventType = 'tournament';
    summary.message.push('Conference Championship this week. Go to tournament to compete.');
    summary.bracketParticipants = participants;
    s.lastWeekSummary = summary;
    this.saveRng();
    return summary;
  }

  /** Picks the training choice that improves the attribute they need most (lowest of technique, conditioning, strength). */
  private pickBestAutoTrainChoice(): 'train_technique' | 'train_conditioning' | 'train_strength' {
    const s = this.state;
    const t = s.technique ?? 50;
    const c = s.conditioning ?? 50;
    const st = s.strength ?? 50;
    const min = Math.min(t, c, st);
    if (c === min) return 'train_conditioning';
    if (t === min) return 'train_technique';
    return 'train_strength';
  }

  advanceWeek(opts?: { skipAutoTrain?: boolean }): boolean {
    const s = this.state;
    if (s.pendingCollegeChoice || s.pendingCollegeGraduation || s.careerEnded || s.pendingCompetition) return false;
    // Decay grades if player didn't study this week
    if (!s.studiedThisWeek) s.grades = Math.max(0, (s.grades ?? 75) - 1);
    // Conditioning: only decay after 2+ weeks with no training (rest/rehab do not count as training but also don't trigger decay)
    if (!s.trainedThisWeek) s.weeksWithoutTraining = (s.weeksWithoutTraining ?? 0) + 1;
    else s.weeksWithoutTraining = 0;
    // Conditioning drops every 2 weeks without training (reduced from every week)
    if ((s.weeksWithoutTraining ?? 0) >= 2 && (s.weeksWithoutTraining ?? 0) % 2 === 0 && !s.didRestOrRehabThisWeek) s.conditioning = Math.max(0, (s.conditioning ?? 50) - 1);
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
    // Auto-train: single-week advance always; multi-week only when toggle is on. Train what they need most.
    if (!opts?.skipAutoTrain) {
      const hours = s.hoursLeftThisWeek ?? HOURS_PER_WEEK;
      const energy = s.energy ?? 100;
      if (hours >= 10 && energy >= 20) this.applyChoice(this.pickBestAutoTrainChoice());
    }
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
    // NIL pay every week when in college (nilAnnual/52); HS gets small allowance.
    const nilWeekly = isInCollege(s) ? Math.round((s.nilAnnual ?? 0) / 52) : 0;
    const income = isInCollege(s) ? nilWeekly : 20;
    const partIncome = didPartTime ? this.rng.int(200, 450) : 0;
    // College: higher base (rent/food/books/fees/travel/personal). HS: minimal.
    const baseExpenses = isInCollege(s)
      ? Math.round(850 + this.rng.int(0, 350))
      : (this.rng.float() < 0.5 ? 10 : 0);
    const lifestyleCost = this.getLifestyleWeeklyCost();
    const expenses = baseExpenses + lifestyleCost;
    s.money = Math.max(0, (s.money ?? 0) + income + partIncome - expenses);
    s.lastWeekEconomy = {
      expenses: { total: expenses, lifestyle: lifestyleCost },
      income: {
        total: income + partIncome,
        ...(nilWeekly > 0 && { nil: nilWeekly }),
        ...(partIncome > 0 && { partTime: partIncome }),
      },
      net: income + partIncome - expenses,
      balance: s.money,
    };

    // Random event: can help or hurt (injury, windfall, illness, etc.)
    this.applyRandomEvent(s);

    // Random weekly bonus: small chance for a free stat bump (makes progression a bit easier)
    this.applyRandomWeeklyBonus(s);

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
      s.conditioning = 50;
      if (HS_LEAGUES.includes(s.league)) {
        s.hsSchedule = this.generateHSSchedule();
        s.opponentPools = this.state.opponentPools;
      }
      if (isInCollege(s)) {
        s.collegeSchedule = this.generateCollegeSchedule();
        s.collegeRoster = this.generateCollegeRoster();
        if ((s.eligibilityYearsRemaining ?? 4) > 0) s.eligibilityYearsRemaining = (s.eligibilityYearsRemaining ?? 4) - 1;
        if ((s.eligibilityYearsRemaining ?? 0) <= 0) {
          s.pendingCollegeGraduation = true;
          s.story = "You've graduated college! Choose your path: pursue the Olympics, start a new career, or retire.";
        }
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
        if (s.pendingCompetition) {
          updateRating(s);
          this.saveRng();
          return s.week === 1;
        }
      }
      if (isInCollege(s)) {
        if (!s.collegeSchedule?.length) {
          s.collegeSchedule = this.generateCollegeSchedule();
          s.collegeRoster = this.generateCollegeRoster();
        }
        if (s.week >= 1 && s.week <= SEASON_WEEKS) this.runCollegeWeekCompetition();
        if (s.pendingCompetition) {
          updateRating(s);
          this.saveRng();
          return s.week === 1;
        }
      }
      const ran = this.runPostWeekTournaments();
      if (s.pendingCompetition) {
        updateRating(s);
        this.saveRng();
        return s.week === 1;
      }
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
    // Life popups: ~35% chance per week; cap at 3 total (including when advancing multiple weeks — we never add if queue already has 3)
    const MAX_PENDING_POPUPS = 3;
    const current = s.pendingLifePopups ?? [];
    if (current.length < MAX_PENDING_POPUPS && this.rng.float() < 0.35) {
      const maxNew = Math.min(3, MAX_PENDING_POPUPS - current.length);
      const newPopups = generateLifePopups(s, this.rng, maxNew);
      s.pendingLifePopups = [...current, ...newPopups].slice(0, MAX_PENDING_POPUPS);
    }
    this.saveRng();
    return s.week === 1;
  }

  /** Advance multiple weeks at once. Returns true if a new year was crossed. When autoTrainOnAdvance is true, each week is auto-trained (one training per week). */
  advanceWeeks(n: number): boolean {
    if (n < 1) return false;
    const skipAutoTrain = !(this.state.autoTrainOnAdvance ?? true);
    let newYear = false;
    for (let i = 0; i < n; i++) {
      if (this.state.pendingCompetition) break;
      // When auto-training multiple weeks, give a small energy bump so every week can train (otherwise energy can dip below 20 after a few weeks)
      if (!skipAutoTrain && n > 1 && (this.state.energy ?? 100) < 25) {
        this.state.energy = Math.min(100, (this.state.energy ?? 0) + 8);
      }
      if (this.advanceWeek({ skipAutoTrain })) newYear = true;
    }
    return newYear;
  }

  setAutoTrainOnAdvance(value: boolean): void {
    this.state.autoTrainOnAdvance = value;
  }

  /** Resolve post-college graduation choice: olympics (career end), retire (career end), or restart (caller should then go to create screen). Only available to college graduates. */
  choosePostCollegeOption(option: 'olympics' | 'restart' | 'retire'): void {
    const s = this.state;
    if (!s.pendingCollegeGraduation || HS_LEAGUES.includes(s.league)) return;
    s.pendingCollegeGraduation = false;
    if (option === 'olympics') {
      s.careerEnded = true;
      s.careerEndChoice = 'olympics';
      addStory(s, "You're going for the Olympics. Your collegiate career is complete — time to chase gold.");
    } else if (option === 'retire') {
      s.careerEnded = true;
      s.careerEndChoice = 'retire';
      addStory(s, "You've retired from competition. Thanks for an incredible career.");
    }
    // restart: only clear the flag; UI calls goToCreate() to start a new career
  }

  getPendingLifePopups(): LifePopup[] {
    return this.state.pendingLifePopups ?? [];
  }

  getLifeLog(): LifeLogEntry[] {
    return (this.state.lifeLog ?? []).slice(-80);
  }

  resolveLifePopup(popupId: string, choiceIndex: number): void {
    const s = this.state;
    const queue = s.pendingLifePopups ?? [];
    const idx = queue.findIndex((p) => p.id === popupId);
    if (idx < 0) return;
    const popup = queue[idx];
    const choice = popup.choices[choiceIndex];
    if (!choice) return;
    const eff = choice.effects;
    const logParts: string[] = [];
    if (eff.energy != null) {
      s.energy = clamp(0, 100, (s.energy ?? 100) + eff.energy);
      logParts.push(`Energy ${eff.energy >= 0 ? '+' : ''}${eff.energy}`);
    }
    if (eff.health != null) {
      s.health = clamp(0, 100, (s.health ?? 100) + eff.health);
      logParts.push(`Health ${eff.health >= 0 ? '+' : ''}${eff.health}`);
    }
    if (eff.stress != null) {
      s.stress = clamp(0, 100, (s.stress ?? 0) + eff.stress);
      logParts.push(`Stress ${eff.stress >= 0 ? '+' : ''}${eff.stress}`);
    }
    if (eff.grades != null) {
      s.grades = clamp(0, 100, (s.grades ?? 75) + eff.grades);
      logParts.push(`Grades ${eff.grades >= 0 ? '+' : ''}${eff.grades}`);
    }
    if (eff.popularity != null) {
      s.popularity = clamp(0, 100, (s.popularity ?? 50) + eff.popularity);
      logParts.push(`Popularity ${eff.popularity >= 0 ? '+' : ''}${eff.popularity}`);
    }
    if (eff.coachTrust != null) {
      s.coachTrust = clamp(0, 100, (s.coachTrust ?? 50) + eff.coachTrust);
      logParts.push(`CoachTrust ${eff.coachTrust >= 0 ? '+' : ''}${eff.coachTrust}`);
    }
    if (eff.money != null) {
      s.money = Math.max(0, (s.money ?? 0) + eff.money);
      logParts.push(`Money ${eff.money >= 0 ? '+' : ''}${eff.money}`);
    }
    if (eff.performanceMult != null) {
      const w = s.weekModifiers ?? defaultWeekModifiers();
      w.performanceMult = clamp(0.5, 1.5, (w.performanceMult ?? 1) + eff.performanceMult);
      w.reasons.push('Life event');
      logParts.push(`Perf ${eff.performanceMult >= 0 ? '+' : ''}${(eff.performanceMult * 100).toFixed(0)}%`);
    }
    if (eff.injuryRiskMult != null) {
      const w = s.weekModifiers ?? defaultWeekModifiers();
      w.injuryRiskMult = clamp(0.5, 2, (w.injuryRiskMult ?? 1) + eff.injuryRiskMult);
      w.reasons.push('Life event');
      logParts.push(`InjuryRisk ${eff.injuryRiskMult >= 0 ? '+' : ''}${(eff.injuryRiskMult * 100).toFixed(0)}%`);
    }
    if (eff.injurySeverity != null) {
      s.health = Math.max(0, (s.health ?? 100) - Math.abs(eff.injurySeverity) * 2);
      logParts.push('Injury');
    }
    if (eff.relationshipMeter != null) {
      s.relationshipMeter = clamp(0, 100, (s.relationshipMeter ?? 0) + eff.relationshipMeter);
      logParts.push(`Rel ${eff.relationshipMeter >= 0 ? '+' : ''}${eff.relationshipMeter}`);
    }
    if (eff.chemistry != null && s.loveInterest) {
      s.loveInterest.chemistry = clamp(0, 100, (s.loveInterest.chemistry ?? 50) + eff.chemistry);
      logParts.push(`Chemistry ${eff.chemistry >= 0 ? '+' : ''}${eff.chemistry}`);
    }
    if (eff.happiness != null) {
      s.happiness = clamp(0, 100, (s.happiness ?? 75) + eff.happiness);
      logParts.push(`Happiness ${eff.happiness >= 0 ? '+' : ''}${eff.happiness}`);
    }
    if (eff.social != null) {
      s.social = clamp(0, 100, (s.social ?? 50) + eff.social);
      logParts.push(`Social ${eff.social >= 0 ? '+' : ''}${eff.social}`);
    }
    if (popup.id.startsWith('popup_love_interest_meet') && (choiceIndex === 0 || choiceIndex === 1) && !s.loveInterest) {
      const names = ['Jordan', 'Sam', 'Alex', 'Morgan', 'Riley', 'Casey', 'Quinn'];
      s.loveInterest = { name: names[this.rng.next() % names.length], chemistry: 40 + this.rng.next() % 25 };
      s.relationshipStatus = 'TALKING';
      s.relationshipMeter = Math.min(100, (s.relationshipMeter ?? 0) + (choice.effects.relationshipMeter ?? 10));
    }
    const effectsStr = logParts.length ? logParts.join(', ') : '—';
    if (!s.lifeLog) s.lifeLog = [];
    s.lifeLog.push({
      week: s.week,
      year: s.year,
      text: `Popup: ${popup.text.slice(0, 50)}… / Choice: ${choice.label} / Effects: ${effectsStr}`,
    });
    s.pendingLifePopups = queue.filter((_, i) => i !== idx);
    this.saveRng();
  }

  /** Random events each week: good or bad (expenses, health, money, stress, etc.). */
  private applyRandomEvent(s: UnifiedState): void {
    if (this.rng.float() > 0.2) return;
    const inCollege = isInCollege(s);
    const roll = this.rng.int(0, inCollege ? 11 : 7);
    switch (roll) {
      case 0: {
        const cost = inCollege ? this.rng.int(80, 220) : this.rng.int(30, 100);
        s.money = Math.max(0, (s.money ?? 0) - cost);
        addStory(s, inCollege ? `Unexpected textbook and lab fees. -$${cost}.` : `School fees and supplies. -$${cost}.`);
        break;
      }
      case 1: {
        const cost = this.rng.int(50, 180);
        s.money = Math.max(0, (s.money ?? 0) - cost);
        addStory(s, 'Car trouble (or transit costs). -$' + cost + '.');
        break;
      }
      case 2: {
        const hit = this.rng.int(5, 14);
        s.health = Math.max(0, (s.health ?? 100) - hit);
        s.energy = Math.max(0, (s.energy ?? 100) - this.rng.int(8, 18));
        addStory(s, 'You caught a bug. Rest up. Health and energy took a hit.');
        break;
      }
      case 3: {
        s.stress = Math.min(100, (s.stress ?? 0) + this.rng.int(6, 16));
        s.happiness = Math.max(0, (s.happiness ?? 75) - this.rng.int(4, 10));
        addStory(s, 'Stressful week — family or personal stuff. Stress up, mood down.');
        break;
      }
      case 4: {
        const drop = this.rng.int(2, 6);
        s.grades = Math.max(0, (s.grades ?? 75) - drop);
        addStory(s, 'Missed assignment or tough exam. Grades -' + drop + '.');
        break;
      }
      case 5: {
        const gain = this.rng.int(40, 120);
        s.money = (s.money ?? 0) + gain;
        addStory(s, inCollege ? `Extra stipend from the program. +$${gain}.` : `Odd job or allowance. +$${gain}.`);
        break;
      }
      case 6: {
        s.energy = Math.min(100, (s.energy ?? 100) + this.rng.int(10, 22));
        s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(4, 10));
        addStory(s, 'Everything clicked this week. Energy and mood up.');
        break;
      }
      case 7: {
        if (!inCollege) break;
        const cost = this.rng.int(25, 75);
        s.money = Math.max(0, (s.money ?? 0) - cost);
        addStory(s, `Parking ticket on campus. -$${cost}.`);
        break;
      }
      case 8: {
        if (!inCollege) break;
        const cost = this.rng.int(60, 180);
        s.money = Math.max(0, (s.money ?? 0) - cost);
        addStory(s, 'Doctor visit — minor injury checkup. -$' + cost + '.');
        s.health = Math.min(100, (s.health ?? 100) + this.rng.int(2, 6));
        break;
      }
      case 9: {
        if (!inCollege) break;
        const gain = this.rng.int(30, 90);
        s.money = (s.money ?? 0) + gain;
        addStory(s, `NIL appearance or local sponsor. +$${gain}.`);
        break;
      }
      case 10: {
        if (!inCollege) break;
        s.stress = Math.min(100, (s.stress ?? 0) + this.rng.int(4, 12));
        addStory(s, 'Academic pressure — papers and exams piling up. Stress up.');
        break;
      }
      case 11: {
        if (!inCollege) break;
        s.relationship = s.relationship ? { ...s.relationship, level: Math.min(100, (s.relationship.level ?? 50) + this.rng.int(3, 8)) } : null;
        s.happiness = Math.min(100, (s.happiness ?? 75) + this.rng.int(2, 6));
        addStory(s, 'Surprise call or visit from someone special. Mood and relationship up.');
        break;
      }
      default:
        break;
    }
  }

  /** Small chance each week for a random stat bonus (coach tip, good sleep, etc.) to make progression a bit easier. */
  private applyRandomWeeklyBonus(s: UnifiedState): void {
    if (this.rng.float() > 0.22) return;
    const roll = this.rng.int(0, 6);
    switch (roll) {
      case 0:
        s.technique = Math.min(100, (s.technique ?? 50) + 1);
        addStory(s, 'Coach pointed out a detail in the room. Technique +1.');
        break;
      case 1:
        s.matIQ = Math.min(100, (s.matIQ ?? 50) + 1);
        addStory(s, 'Watched film on your own. Mat IQ +1.');
        break;
      case 2:
        s.conditioning = Math.min(100, (s.conditioning ?? 50) + 1);
        addStory(s, 'Felt sharp in the room. Conditioning +1.');
        break;
      case 3:
        s.strength = Math.min(100, (s.strength ?? 50) + 1);
        addStory(s, 'Extra reps paid off. Strength +1.');
        break;
      case 4:
        s.energy = Math.min(100, (s.energy ?? 100) + 6);
        addStory(s, 'Good sleep and recovery. Energy +6.');
        break;
      case 5:
        s.grades = Math.min(100, (s.grades ?? 75) + 1);
        addStory(s, 'Something clicked in class. Grades +1.');
        break;
      case 6:
        s.happiness = Math.min(100, (s.happiness ?? 75) + 3);
        addStory(s, 'A good week. Happiness +3.');
        break;
      default:
        break;
    }
  }

  /** Get 15 opponents for 16-man HS bracket (district/state) from pools or generated. */
  private getHSBracketOpponents16(): Opponent[] {
    const s = this.state;
    const pool = s.opponentPools;
    const rankedList = [...(pool?.stateRanked ?? []), ...(pool?.nationalRanked ?? [])]
      .sort((a, b) => b.overallRating - a.overallRating);
    let list: Opponent[] =
      rankedList.length >= 15
        ? rankedList.slice(0, 15)
        : [...rankedList, ...(pool?.unranked ?? []).slice(0, Math.max(0, 15 - rankedList.length))];
    if (list.length === 0) list = (pool?.unranked ?? []).slice(0, 15);
    if (list.length === 0) {
      list = this.generateNamedBracketOpponents(s.overallRating ?? 50, { minRating: 50, maxRating: 92, count: 15 });
    }
    while (list.length < 15) list.push({ id: 'pad', name: 'Opponent', overallRating: 70, style: 'grinder', clutch: 50 });
    return list.slice(0, 15);
  }

  private runPostWeekTournaments(): boolean {
    const s = this.state;
    if (s.week === HS_WEEK_DISTRICT && HS_LEAGUES.includes(s.league)) {
      if (s.league === 'HS_JV') {
        addStory(s, "JV doesn't compete at districts. Focus on next year.");
        return true;
      }
      if (!this.canWrestle()) {
        addStory(s, "Grades too low — you're ineligible for districts. No competition.");
        s.lastWeekSummary = { week: s.week, year: s.year, phase: 'District/Sectional', eventType: 'district', message: ["Academic ineligibility — you didn't compete at districts."] };
        return true;
      }
      const districtOpponents = this.getHSBracketOpponents16();
      const myRating = s.overallRating ?? 50;
      const { participants } = this.buildBracket(s.name ?? 'You', myRating, districtOpponents, 16);
      s.pendingTournamentPlay = {
        kind: 'district',
        phaseLabel: 'District/Sectional',
        eventType: 'district',
        week: s.week,
        year: s.year,
        opponents: districtOpponents,
        bracketParticipants: participants,
        bracketSize: 16,
      };
      s.lastWeekSummary = { week: s.week, year: s.year, phase: 'District/Sectional', eventType: 'district', message: ['16-man district bracket this week. Go to tournament to compete.'] };
      this.saveRng();
      return true;
    }
    if (s.week === HS_WEEK_STATE && HS_LEAGUES.includes(s.league) && s.stateQualified) {
      if (!this.canWrestle()) {
        addStory(s, "Grades too low — you're ineligible for state. You had to sit out.");
        s.stateQualified = false;
        s.lastWeekSummary = { week: s.week, year: s.year, phase: 'State Tournament', eventType: 'state', message: ["Academic ineligibility — you didn't compete at state."] };
        return true;
      }
      const stateOpponents = this.getHSBracketOpponents16();
      const myRating = s.overallRating ?? 50;
      const { participants } = this.buildBracket(s.name ?? 'You', myRating, stateOpponents, 16);
      s.pendingTournamentPlay = {
        kind: 'state',
        phaseLabel: 'State Tournament',
        eventType: 'state',
        week: s.week,
        year: s.year,
        opponents: stateOpponents,
        bracketParticipants: participants,
        bracketSize: 16,
      };
      s.lastWeekSummary = { week: s.week, year: s.year, phase: 'State Tournament', eventType: 'state', message: ['16-man state bracket this week. Go to tournament to compete.'] };
      this.saveRng();
      return true;
    }
    if (s.week === HS_WEEK_WRAP && HS_LEAGUES.includes(s.league)) {
      s.lastWeekSummary = { week: s.week, year: s.year, phase: 'Season Wrap', eventType: 'wrap', message: [`Season complete. Record: ${s.stats.seasonWins}-${s.stats.seasonLosses}. Recruiting: ${s.recruitingScore}.`] };
      s.story = 'Week ' + s.week + ', Year ' + s.year + '. Season wrap.';
      return true;
    }
    // Conference tournament is week 12 and handled in runCollegeWeekCompetition; NCAA qualification set there.
    if (s.week === NCAA_WEEK && isInCollege(s) && s.ncaaQualified) {
      if (!this.canWrestle()) {
        addStory(s, "Academic ineligibility — you couldn't compete at NCAA Championships.");
        s.ncaaQualified = false;
        s.lastWeekSummary = { week: s.week, year: s.year, phase: 'NCAA Championships', eventType: 'state', message: ["Academic ineligibility — you didn't compete at NCAAs."] };
        return true;
      }
      const finalsOpp = this.getFinalsOpponentFromRankings() ?? {
        id: 'ncaa_finals',
        name: 'NCAA finals opponent',
        overallRating: clamp(65, 95, (s.overallRating ?? 50) + this.rng.int(-2, 8)),
        style: 'grinder' as const,
        clutch: 50,
      };
      this.startPendingSingleMatch('ncaa', 'NCAA Championships', 'state', finalsOpp, 'Finals');
      this.saveRng();
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

  runOffseasonEvent(eventKey: string): { success: boolean; place?: number; eventName?: string; message?: string; matches?: { won: boolean; method: string }[]; bracketParticipants?: BracketParticipant[] } {
    const s = this.state;
    if (s.pendingCompetition) return { success: false, message: 'Finish your current competition first.' };
    if (s.pendingTournamentPlay) return { success: false, message: 'Go to tournament first (or simulate) before starting another event.' };
    const ev = OFFSEASON_EVENTS[eventKey];
    const weekOk = eventKey === 'fargo' ? FARGO_WEEKS.includes(s.week) : ev ? s.week === ev.week : false;
    const inCollege = HS_LEAGUES.indexOf(s.league) === -1;
    if (!ev || !weekOk) return { success: false, message: 'Not available.' };
    if (ev.collegeOnly && !inCollege) return { success: false, message: 'College event only.' };
    if (!ev.collegeOnly && inCollege) return { success: false, message: 'High school event only.' };
    if (eventKey === 'world_championship' && !s.qualifiedForWorldChampionshipThisYear) return { success: false, message: 'Qualify at US Open first (place 1st or 2nd).' };
    if ((s.money ?? 0) < ev.cost) return { success: false, message: "You can't afford it." };
    if (!this.canWrestle()) return { success: false, message: "Grades too low — you're academically ineligible to compete." };
    if ((s.offseasonEventsUsedThisYear ?? {})[eventKey]) return { success: false, message: 'Already competed here this year.' };
    s.offseasonEventsUsedThisYear = s.offseasonEventsUsedThisYear ?? {};
    s.offseasonEventsUsedThisYear[eventKey] = true;
    s.money = Math.max(0, (s.money ?? 0) - ev.cost);

    const myRating = s.overallRating ?? 50;
    if (eventKey === 'wno') {
      const youAreNo1 = this.rng.float() < 0.5;
      const wc = s.weightClass ?? 145;
      const opponentRating = youAreNo1
        ? clamp(70, 92, myRating + this.rng.int(-3, 5))
        : clamp(72, 94, myRating + this.rng.int(2, 8));
      const opp: Opponent = {
        id: 'wno',
        name: (youAreNo1 ? '#2' : '#1') + ' at ' + wc + ' lbs',
        overallRating: opponentRating,
        style: 'grinder',
        clutch: 68,
      };
      this.startPendingSingleMatch('offseason', ev.name, 'tournament', opp, 'Final', eventKey);
    } else if (eventKey === 'us_open' || eventKey === 'world_championship') {
      const colOpponents = this.generateNamedBracketOpponents(myRating, {
        minRating: 58,
        maxRating: 96,
        prestige: ev.prestige,
      });
      const { participants } = this.buildBracket(s.name, myRating, colOpponents);
      s.pendingTournamentPlay = {
        kind: 'offseason',
        phaseLabel: ev.name,
        eventType: 'tournament',
        week: s.week,
        year: s.year,
        opponents: colOpponents,
        bracketParticipants: participants,
        offseasonEventKey: eventKey,
      };
    } else {
      const hsOpponents = this.generateNamedBracketOpponents(myRating, {
        minRating: 45,
        maxRating: 95,
        prestige: ev.prestige,
      });
      const { participants } = this.buildBracket(s.name, myRating, hsOpponents);
      s.pendingTournamentPlay = {
        kind: 'offseason',
        phaseLabel: ev.name,
        eventType: 'tournament',
        week: s.week,
        year: s.year,
        opponents: hsOpponents,
        bracketParticipants: participants,
        offseasonEventKey: eventKey,
      };
    }

    this.saveRng();
    return { success: true, eventName: ev.name, message: 'Event started. Play your matches now.' };
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
        const pool = s.opponentPools;
        if (w === wc && pool && (pool.stateRanked.length > 0 || pool.nationalRanked.length > 0)) {
          const merged = [...pool.stateRanked, ...pool.nationalRanked]
            .sort((a, b) => b.overallRating - a.overallRating);
          s.rankingsByWeight[w] = merged.map((o) => ({
            id: o.id,
            name: o.name,
            overallRating: o.overallRating,
            trueSkill: o.overallRating,
          }));
        } else {
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

  /** Label to show on the calendar for a given week (tournament name, dual opponent, Conference, NCAA, Districts, State, offseason events, etc.). */
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
      if (FARGO_WEEKS.includes(week)) return 'Fargo';
      if (week === SUPER32_WEEK) return 'Super 32';
      if (week === WNO_WEEK) return "WNO";
      return '';
    }
    const entry = this.getCollegeScheduleEntry(week);
    if (entry) {
      if (entry.type === 'dual') {
        if (entry.blockType === 'travel_dual_weekend' && entry.opponentNames?.length) {
          return `2 duals: ${entry.opponentNames[0]}${entry.opponentNames.length > 1 ? '+' : ''}`;
        }
        return entry.opponentName ? `vs ${entry.opponentName}` : 'Dual';
      }
      if (entry.type === 'tournament') return entry.tournamentName ?? 'Tournament';
      if (entry.type === 'conference') return 'Conf Champs';
      if (entry.type === 'ncaa') return 'NCAA';
      if (entry.type === 'none') return 'Recovery';
    }
    if (week === US_OPEN_WEEK) return 'US Open';
    if (week === WORLD_CHAMPIONSHIP_WEEK) return 'World Champ';
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
          const label = next.type === 'dual'
            ? (next.opponentNames?.length ? `Duals: ${next.opponentNames.join(', ')}` : `Dual vs ${next.opponentName ?? 'TBD'}`)
            : next.type === 'tournament' ? (next.tournamentName ?? 'Tournament') : next.type === 'conference' ? 'Conference Championship' : 'NCAA Championships';
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

  /** Switch to a different weight class (must be valid for current league: HS or college). Returns true if changed. */
  setWeightClass(newWeight: number): boolean {
    const s = this.state;
    const allowed = UnifiedEngine.getWeightClasses(s.league);
    if (!allowed.includes(newWeight) || (s.weightClass ?? 145) === newWeight) return false;
    s.weightClass = newWeight;
    addStory(s, `You moved to ${newWeight} lbs.`);
    this.saveRng();
    return true;
  }
}
