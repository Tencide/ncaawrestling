/**
 * Unified game state (NCAA + WrestlingPath combined).
 * Week-based flow: choices per week, tournaments at set weeks, offseason, recruiting.
 */

import type { ExchangeLogEntry, ExchangePrompt, MatchMinigameResult, MatchMinigameState, MatchPosition } from '../MatchMinigame';

export type LeagueKey =
  | 'HS_JV'
  | 'HS_VARSITY'
  | 'HS_ELITE'
  | 'JUCO'
  | 'NAIA'
  | 'D3'
  | 'D2'
  | 'D1';

export interface UnifiedState {
  seed: string;
  rngState: string;
  name: string;
  age: number;
  year: number;
  /** Week of year 1–52. Advance per week; when week > 52, next year. */
  week: number;
  league: LeagueKey;
  collegeName: string | null;
  fromHS: boolean;
  weeksInCollege: number;
  /** Years of eligibility remaining (4 when entering college; decrements each season). */
  eligibilityYearsRemaining?: number;
  weightClass: number;
  technique: number;
  matIQ: number;
  conditioning: number;
  strength: number;
  speed: number;
  flexibility: number;
  energy: number;
  health: number;
  stress: number;
  happiness: number;
  grades: number;
  social: number;
  money: number;
  /** Accepted NIL deal (annual $) when in college; paid weekly as nilAnnual/52. */
  nilAnnual?: number;
  trueSkill: number;
  overallRating: number;
  recruitingScore: number;
  potentialCeiling: number;
  yearlyGrowthCap: number;
  yearlyGrowthUsed: number;
  consecutiveRestWeeks: number;
  techniqueTranslationWeeks: number;
  stateQualified: boolean;
  ncaaQualified: boolean;
  didPartTimeThisWeek: boolean;
  broke: boolean;
  story: string;
  history: { year: number; week: number; age: number; text: string }[];
  accolades: string[];
  stats: {
    matchesWon: number;
    matchesLost: number;
    pins: number;
    techs: number;
    majors: number;
    tournamentsWon: number;
    stateAppearances: number;
    stateTitles: number;
    statePlacements: number[];
    ncaaAppearances: number;
    ncaaAllAmerican: number;
    ncaaTitles: number;
    ncaaPlacements: number[];
    seasonWins: number;
    seasonLosses: number;
    seasonPins: number;
    seasonTechs: number;
    seasonMajors: number;
    winStreak: number;
    weightMisses: number;
    fargoPlacements: number[];
    super32Placements: number[];
    wnoAppearances: number;
    wnoWins: number;
    usOpenPlacements: number[];
    worldChampionshipPlacements: number[];
    hsRecord: Record<string, number>;
    collegeRecord: Record<string, number>;
  };
  rankingsByWeight: Record<number, { id: string; name: string; overallRating: number; trueSkill: number }[]>;
  lastWeekEconomy: { expenses: { total: number; lifestyle?: number }; income: { total: number; nil?: number; partTime?: number }; net: number; balance: number } | null;
  pendingRandomChoice: {
    prompt: string;
    options: { label: string; resultText: string; effect: (s: UnifiedState) => void }[];
  } | null;
  /** College offers after HS graduation; player picks one and can negotiate NIL/scholarship. */
  offers: CollegeOffer[];
  /** Per-school recruiting context for this class: slots used and weights already committed (so not every school offers). */
  recruitingClassContext?: Record<string, { slotsUsed: number; committedWeights: number[] }>;
  pendingNILDeal: unknown | null;
  /** True when player has graduated HS (age 18+) and must choose a college before advancing. */
  pendingCollegeChoice?: boolean;
  /** True when player has graduated college (eligibility exhausted) and must choose: Olympics, Restart, or Retire. */
  pendingCollegeGraduation?: boolean;
  /** True when career is over (chose Olympics or Retire); show summary and option to start new career. */
  careerEnded?: boolean;
  /** How the career ended: olympics or retire. */
  careerEndChoice?: 'olympics' | 'retire';
  /** True when player has entered the transfer portal (college only); must pick a school or withdraw to advance. */
  transferPortalActive?: boolean;
  /** Transfer offers from other schools when in the portal. */
  transferOffers?: CollegeOffer[];
  /** Successful negotiation count per school (tuition / NIL) so schools push back after repeated asks. */
  negotiationAttempts?: Record<string, { tuition: number; nil: number }>;
  /** Hours left this week (resets each week). If 0, no actions available. */
  hoursLeftThisWeek: number;
  /** Set true when player picks Study this week; used for grades decay. */
  studiedThisWeek?: boolean;
  /** Set true when player picks train_* this week; used for conditioning decay. */
  trainedThisWeek?: boolean;
  /** Weeks in a row with no training; conditioning only decays after 2+ weeks without training. */
  weeksWithoutTraining?: number;
  /** Set true when player picks rest or rehab; rest/rehab do not reduce conditioning. */
  didRestOrRehabThisWeek?: boolean;
  /** When true, advancing multiple weeks will auto-train each week (train what they need most). Single-week advance always auto-trains if time/energy allow. */
  autoTrainOnAdvance?: boolean;
  /** Temporary multipliers for this week only; reset at start of each week. Affects training, match performance, injury risk, weight cut. */
  weekModifiers: WeekModifiers;
  /** Relationship; null = single. Kept for backward compat; also sync with relationships list. */
  relationship: {
    status: 'dating' | 'serious' | 'engaged' | 'married';
    partnerName: string;
    level: number;
    weeklyTimeRequired: number;
  } | null;
  /** All relationships: parents, siblings, coach, friends, romantic. */
  relationships: RelationshipEntry[];
  /** Offseason events already used this year (one per event per year). */
  offseasonEventsUsedThisYear: Record<string, boolean>;
  /** College: qualified for World Championship this year by placing at US Open. */
  qualifiedForWorldChampionshipThisYear?: boolean;
  /** HS only: season schedule W39–W49 (dual/tournament/rival/none). Generated at start of year; persisted for determinism. */
  hsSchedule: HSScheduleEntry[] | null;
  /** HS only: opponent pools for schedule (state-ranked, national, unranked). Persisted. */
  opponentPools: OpponentPools | null;
  /** College only: season schedule (weeks 1–7 duals/tournaments, 8 conference, 12 NCAA). Generated at year start. */
  collegeSchedule: CollegeScheduleEntry[] | null;
  /** College only: roster at your weight + teammates (for lineup). Generated when entering college or year start. */
  collegeRoster: CollegeTeammate[] | null;
  /** After "Next Week": summary for UI (match result, record, ranking, recruiting, etc.). Cleared when advancing again. */
  lastWeekSummary: WeekSummary | null;
  /** Lifestyle: housing, car, meal plan, recovery equipment. Affects weekly expenses and gameplay. */
  lifestyle?: LifestyleState;
  /** BitLife-style life popups: queue of 2–5 per week; resolve one at a time. */
  pendingLifePopups?: LifePopup[];
  /** Life log: "Popup:… / Choice:… / Effects:…" for each resolved popup. */
  lifeLog?: LifeLogEntry[];
  /** Recently shown life popup def ids (for variety: downweight repeat events). */
  recentLifePopupDefIds?: string[];
  /** Popularity 0–100; affects media/NIL/relationship event weight. */
  popularity?: number;
  /** Coach trust 0–100; affects discipline/opportunity events. */
  coachTrust?: number;
  /** If true, relationship path events can introduce LoveInterest and drama/support. */
  allowRelationshipEvents?: boolean;
  /** Love interest NPC when relationship path is active. */
  loveInterest?: { name: string; chemistry: number };
  /** Relationship status with love interest. */
  relationshipStatus?: RelationshipStatus;
  /** Relationship meter 0–100 with love interest. */
  relationshipMeter?: number;

  /** When non-null, a competition is in progress and must be played (interactive match minigame). */
  pendingCompetition?: PendingCompetitionState | null;

  /** When set, a tournament is waiting for "Go to tournament" → then Play or Simulate. Blocks advance until resolved. */
  pendingTournamentPlay?: PendingTournamentPlay | null;
}

/** Tournament week or offseason bracket not yet started; user must click Go to tournament then Play or Simulate. */
export interface PendingTournamentPlay {
  kind: CompetitionKind;
  phaseLabel: string;
  eventType?: WeekSummary['eventType'];
  week: number;
  year: number;
  opponents: Opponent[];
  bracketParticipants?: BracketParticipant[];
  /** 8 or 16; default 8. District and state are 16-man. */
  bracketSize?: 8 | 16;
  /** Conference tournament: top N qualify for NCAA. */
  conferenceQualifyTop?: number;
  /** Offseason event key when kind is 'offseason'. */
  offseasonEventKey?: string;
}

/** Life popup relationship status. */
export type RelationshipStatus = 'NONE' | 'TALKING' | 'DATING' | 'PARTNER';

/** One entry in the life log. */
export interface LifeLogEntry {
  week: number;
  year: number;
  text: string;
}

/** Category for life popup weighting and conditioning. */
export type LifePopupCategory =
  | 'training_performance'
  | 'school_academics'
  | 'health_recovery'
  | 'social_team'
  | 'money_nil'
  | 'discipline'
  | 'relationships';

/** Serializable effects for one choice (deltas applied to state). */
export interface LifePopupChoiceEffects {
  energy?: number;
  health?: number;
  stress?: number;
  grades?: number;
  popularity?: number;
  coachTrust?: number;
  money?: number;
  performanceMult?: number;
  injuryRiskMult?: number;
  injurySeverity?: number;
  relationshipMeter?: number;
  chemistry?: number;
  happiness?: number;
  social?: number;
}

/** One choice in a life popup. */
export interface LifePopupChoice {
  label: string;
  effects: LifePopupChoiceEffects;
}

/** A single life popup (queued after advance week). */
export interface LifePopup {
  id: string;
  category: LifePopupCategory;
  text: string;
  choices: LifePopupChoice[];
  /** Original def id for variety (downweight recently shown). */
  defId?: string;
  /** Optional payload (e.g. girlfriend name for "meet girlfriend" event). */
  payload?: { girlfriendName?: string };
}

/** Housing tier: weekly rent; better = less stress, more happiness. */
export type HousingTier = 'none' | 'basic' | 'apartment' | 'nice_apartment' | 'luxury';

/** Car: one-time purchase; better = happiness, optional small weekly upkeep. */
export type CarTier = 'none' | 'beater' | 'used' | 'reliable' | 'nice';

/** Meal plan: weekly cost; better = conditioning hold, health recovery. */
export type MealPlanTier = 'none' | 'basic' | 'good' | 'premium';

/** Recovery equipment: one-time purchase; better = rehab/rest more effective, less injury risk. */
export type RecoveryTier = 'none' | 'basic' | 'pro';

/** One custom purchasable lifestyle item (specific thing you can buy once). */
export interface CustomLifestyleItemDef {
  id: string;
  name: string;
  description: string;
  /** One-time cost in dollars. */
  cost: number;
  /** Optional weekly cost after purchase (e.g. subscription). */
  weeklyCost?: number;
  /** Short summary of effect for UI, e.g. "−5% injury risk, +2 health". */
  effectSummary: string;
  /** Optional modifier effects applied while owned (small values). */
  effects?: { performanceMult?: number; injuryRiskMult?: number; trainingMult?: number; health?: number; happiness?: number; stress?: number; popularity?: number };
}

export interface LifestyleState {
  housing: HousingTier;
  car: CarTier;
  mealPlan: MealPlanTier;
  recoveryEquipment: RecoveryTier;
  /** IDs of custom lifestyle items purchased (one-time buys). */
  purchasedCustomIds?: string[];
}

/** One entry in the HS season schedule (weeks 39–49). */
export interface HSScheduleEntry {
  week: number;
  type: 'dual' | 'tournament' | 'rival' | 'none';
  /** Set when type is dual/rival: opponent id from pool. */
  opponentId?: string;
}

/** Season phase for college schedule. */
export type SeasonPhase = 'early' | 'midseason' | 'conference_stretch' | 'postseason';

/** Weekly block type: single dual, travel weekend (2 duals), tournament, or recovery. */
export type WeeklyBlockType = 'single_dual' | 'travel_dual_weekend' | 'tournament_weekend' | 'recovery';

/** Event format for display and sim (dual, triangular, quad, open, invite, big multi-day). */
export type EventFormat = 'dual' | 'triangular' | 'quad' | 'open' | 'invite' | 'big_tournament';

/** Coach strategy: affects starter participation in smaller opens. */
export type CoachStrategy = 'aggressive' | 'balanced' | 'conservative';

/** One entry in the college season schedule (weeks 1–15). */
export interface CollegeScheduleEntry {
  week: number;
  type: 'dual' | 'tournament' | 'conference' | 'ncaa' | 'none';
  /** Opponent school name for single dual (backward compat). */
  opponentName?: string;
  /** Tournament name for display. */
  tournamentName?: string;
  /** Season phase (early / midseason / conference_stretch / postseason). */
  phase?: SeasonPhase;
  /** Weekly block: single_dual, travel_dual_weekend, tournament_weekend, recovery. */
  blockType?: WeeklyBlockType;
  /** Event format: dual, triangular, quad, open, invite, big_tournament. */
  eventFormat?: EventFormat;
  /** For travel dual weekend or triangular/quad: opponent school names in order. */
  opponentNames?: string[];
  /** True if any opponent this week is a conference dual. */
  isConference?: boolean;
  /** True if this week involves travel (travel dual weekend or away tournament). */
  isTravelWeek?: boolean;
  /** For opens: whether starters are sent (depends on coach strategy). */
  starterParticipates?: boolean;
  /** Tournament: expected match count (2–5). */
  tournamentMatchCount?: number;
}

/** Teammate (or player) at a weight for college lineup. */
export interface CollegeTeammate {
  id: string;
  name: string;
  weightClass: number;
  overallRating: number;
  isPlayer: boolean;
}

/** Next upcoming event for "Up next" on home. */
export interface NextEventInfo {
  week: number;
  label: string;
  type: string;
}

/** Program tier for recruiting: budget, slots, standards, NIL pool. */
export type ProgramTier = 'A' | 'B' | 'C' | 'D';

/** Offer type: full scholarship, partial, preferred walk-on, or walk-on. */
export type OfferType = 'full' | 'partial' | 'preferred_walkon' | 'walkon';

/** College offer after HS: school + scholarship + NIL. Player can accept or negotiate. */
export interface CollegeOffer {
  id: string;
  schoolId: string;
  schoolName: string;
  division: LeagueKey;
  /** full = ~100%, partial = 25–75%, preferred_walkon/walkon = 0%. Omitted on legacy saves = full. */
  offerType?: OfferType;
  tuitionCoveredPct: number;
  nilAnnual: number;
  housingStipend: number;
  mealPlanPct: number;
  guaranteedStarter: boolean;
  deadlineWeek: number;
  offeredAtWeek: number;
}

/** Reason a school did not offer (for UI). */
export type NoOfferReason =
  | 'set_at_your_weight'
  | 'budget_used'
  | 'already_filled_spot'
  | 'no_slots_left'
  | 'academic_standards'
  | 'not_a_fit';

/** Single opponent for dual/tournament. */
export interface Opponent {
  id: string;
  name: string;
  overallRating: number;
  stateRank?: number;
  nationalRank?: number;
  style: 'grinder' | 'scrambler' | 'defensive';
  clutch: number;
}

/** Pools per weight for HS schedule (generated once per year). */
export interface OpponentPools {
  unranked: Opponent[];
  stateRanked: Opponent[];
  nationalRanked: Opponent[];
}

/** Type of relationship (for display and available actions). */
export type RelationshipKind = 'parent' | 'sibling' | 'coach' | 'friend' | 'romantic';

/** One relationship entry (parent, sibling, coach, friend, or romantic partner). */
export interface RelationshipEntry {
  id: string;
  kind: RelationshipKind;
  name: string;
  level: number;
  /** Optional: e.g. "Mom", "Head coach" for UI. */
  label?: string;
}

/** Action available for a relationship (spend time, date, get advice, etc.). */
export interface RelationshipActionItem {
  key: string;
  label: string;
  hours: number;
  money?: number;
}

/** One seed in an 8-person tournament bracket (for display and sim). */
export interface BracketParticipant {
  seed: number;
  name: string;
  overallRating: number;
}

/** Shown after Next Week: competition result and deltas. */
export interface WeekSummary {
  week: number;
  year: number;
  phase: string;
  eventType?: 'dual' | 'tournament' | 'district' | 'state' | 'wrap' | 'none';
  matches?: { opponentName: string; opponentOverall: number; stateRank?: number; nationalRank?: number; won: boolean; method?: string }[];
  /** 8-person bracket (seed 1 = player, 2–8 = opponents) when eventType is tournament. */
  bracketParticipants?: BracketParticipant[];
  placement?: number;
  recordChange?: { wins: number; losses: number };
  message: string[];
  energyChange?: number;
  stressChange?: number;
  recruitingChange?: number;
}

/** Optional overrides when starting a new game (custom start). */
export interface CustomStartOptions {
  age?: number;
  year?: number;
  week?: number;
  league?: LeagueKey;
  /** Stat overrides (only applied when using custom start). */
  technique?: number;
  matIQ?: number;
  conditioning?: number;
  strength?: number;
  speed?: number;
  flexibility?: number;
  energy?: number;
  health?: number;
  stress?: number;
  happiness?: number;
  grades?: number;
  social?: number;
  money?: number;
  recruitingScore?: number;
}

/** Week-level multipliers (stack from actions); reset each week. Base 1.0 = no change. */
export interface WeekModifiers {
  trainingMult: number;
  performanceMult: number;
  injuryRiskMult: number;
  weightCutSeverityMult: number;
  /** Human-readable reasons for UI (e.g. "Date night", "Rehab"). */
  reasons: string[];
}

export interface ChoiceItem {
  key: string;
  label: string;
  /** Tab/category for grouping. */
  tab?: 'training' | 'relationship' | 'life';
}

/** Preview of an action's effects (hours, money, meters, modifier deltas). */
export interface ChoicePreview {
  hours: number;
  money: number;
  energy?: number;
  health?: number;
  stress?: number;
  happiness?: number;
  /** Additive deltas applied to weekModifiers (e.g. trainingMult: 0.05). */
  modifierDeltas?: Partial<Record<keyof Omit<WeekModifiers, 'reasons'>, number>>;
  reason?: string;
}

export interface OffseasonEventItem {
  key: string;
  name: string;
  week: number;
  cost: number;
  prestige: number;
  canAfford: boolean;
}

export type CompetitionKind = 'dual' | 'tournament' | 'district' | 'state' | 'ncaa' | 'offseason';

export type PendingBracketPhase =
  | 'R16'
  | 'QF'
  | 'CONS_R1'
  | 'CONS_R2'
  | 'CONS_R3'
  | 'CONS_R4'
  | 'SF'
  | 'WB_FINAL'
  | 'LB_FINAL'
  | 'FINAL'
  | 'RESET'
  | 'THIRD_FOURTH'
  | 'DONE';

export interface PendingBracketState {
  /** 8-man (QF start) or 16-man (R16 start). */
  size: 8 | 16;
  phase: PendingBracketPhase;
  /** Opponents: 7 for 8-man, 15 for 16-man. */
  opponents: Opponent[];
  opponentIndex: number;
  /** Set when DONE. */
  placement?: number;
}

export interface PendingCompetitionMatch {
  id: string;
  roundLabel: string;
  opponent: Opponent;
  /** Current match position at start of the exchange prompt. */
  position: MatchPosition;
  matchState: MatchMinigameState;
  prompt: ExchangePrompt;
  timerSeconds: number;
}

export interface CompletedCompetitionMatch {
  roundLabel: string;
  opponentName: string;
  opponentOverall: number;
  won: boolean;
  method: string;
  myScore: number;
  oppScore: number;
  exchangeLog: ExchangeLogEntry[];
}

export interface PendingCompetitionState {
  kind: CompetitionKind;
  week: number;
  year: number;
  phaseLabel: string;
  /** Mirrors WeekSummary.eventType for display. */
  eventType?: WeekSummary['eventType'];
  /** Optional: offseason event key when kind is 'offseason'. */
  offseasonEventKey?: string;
  /** For tournaments/brackets. */
  bracket?: PendingBracketState;
  /** For multi-match dual weeks (travel dual weekend, triangular/quad). */
  queue?: { matches: { opponent: Opponent; roundLabel: string }[]; index: number };
  /** Single-match competitions (dual/district/state/ncaa). */
  singleMatch?: { opponent: Opponent; roundLabel: string };
  /** Current match being played (always present until completion). */
  current: PendingCompetitionMatch;
  /** Completed matches so far (for tournaments/brackets). */
  completed: CompletedCompetitionMatch[];
  /** Set when the competition has finished (for UI). */
  finished?: boolean;
  /** Final placement when applicable. */
  placement?: number;
  /** Final match result for single-match competitions. */
  finalResult?: MatchMinigameResult | null;
}
