import { SeededRNG } from './SeededRNG';
import { fatiguePenalty, injuryPenalty, logisticWinProb, simEliteMatch } from './EliteMatchSim';

export type MatchPosition = 'NEUTRAL' | 'TOP' | 'BOTTOM';

export interface MinigameWrestler {
  name: string;
  overallRating: number;
  technique: number;
  matIQ: number;
  conditioning: number;
  strength: number;
  speed: number;
  flexibility: number;
  /** 0–100 */
  energy: number;
  /** 0–1 normalized severity */
  injurySeverity: number;
}

export interface ExchangeOption {
  key: string;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  reward: string;
}

export interface ExchangePrompt {
  period: 1 | 2 | 3;
  position: MatchPosition;
  prompt: string;
  options: ExchangeOption[];
  /** UI should enforce this (in seconds). Recommended: 6. */
  timerSeconds: number;
}

export interface ExchangeLogEntry {
  period: 1 | 2 | 3;
  position: MatchPosition;
  prompt: string;
  actionKey: string;
  actionLabel: string;
  timedOut: boolean;
  timerSeconds: number;
  success: boolean;
  /** Points you scored this exchange (can be 0). */
  pointsFor: number;
  /** Points opponent scored this exchange (can be 0). */
  pointsAgainst: number;
  myEnergyBefore: number;
  myEnergyAfter: number;
  myInjuryBefore: number;
  myInjuryAfter: number;
  momentumBefore: number;
  momentumAfter: number;
  /** True if timer expired and opponent scored (explicit hesitation penalty). */
  timerFailureScored: boolean;
  notes: string[];
}

export interface MatchMinigameResult {
  won: boolean;
  /** 'Dec', 'Major', 'Tech', or 'Fall' */
  method: string;
  myScore: number;
  oppScore: number;
  /** From internal elite sim, for debugging/analytics. */
  eliteEffectiveGap: number;
  eliteBaseGap: number;
  eliteFavoriteProb: number;
}

export interface MatchMinigameState {
  period: 1 | 2 | 3;
  position: MatchPosition;
  my: MinigameWrestler;
  opp: MinigameWrestler;
  myScore: number;
  oppScore: number;
  /** Simple momentum scalar; positive = you rolling, negative = opponent. */
  momentum: number;
  logs: ExchangeLogEntry[];
  finished: boolean;
  result: MatchMinigameResult | null;
}

export interface MatchMinigameConfig {
  /** Seconds for UI timer; engine just echoes it in prompts/logs. Default 10. */
  timerSeconds?: number;
}

/** Default decision timer in seconds (used by engine and UI). */
export const DECISION_TIMER_SECONDS = 7;

type Period = 1 | 2 | 3;

interface InternalActionDef {
  key: string;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  reward: string;
  from: MatchPosition;
  staminaCost: number;
  /** Extra stamina penalty on failure (added to staminaCost). */
  failStaminaBonus?: number;
  /** Base injury risk per exchange (before low-energy multiplier). */
  baseInjuryRisk: number;
  /** If true, on clean success there is a small chance of a pin. */
  canPinOnSuccess?: boolean;
  offenseWeights: Partial<Record<keyof Omit<MinigameWrestler, 'name' | 'overallRating' | 'injurySeverity' | 'energy'>, number>>;
  defenseWeights: Partial<Record<keyof Omit<MinigameWrestler, 'name' | 'overallRating' | 'injurySeverity' | 'energy'>, number>>;
  onSuccess: {
    pointsFor: number;
    pointsAgainst?: number;
    newPosition: MatchPosition;
    momentumDelta: number;
  };
  onFail: {
    pointsFor?: number;
    pointsAgainst: number;
    newPosition: MatchPosition;
    momentumDelta: number;
  };
}

const HESITATE_KEY = 'hesitate';

const ACTION_DEFS: InternalActionDef[] = [
  // NEUTRAL – offensive shots / counters
  {
    key: 'blast_double',
    label: 'Blast double',
    description: 'Explosive double-leg to score big but can gas you out.',
    risk: 'medium',
    reward: '2 points on finish; strong momentum swing.',
    from: 'NEUTRAL',
    staminaCost: 10,
    failStaminaBonus: 3,
    baseInjuryRisk: 0.03,
    offenseWeights: { technique: 0.5, strength: 0.4, speed: 0.4, conditioning: 0.2 },
    defenseWeights: { technique: 0.5, matIQ: 0.3, speed: 0.3, flexibility: 0.2 },
    onSuccess: { pointsFor: 2, newPosition: 'TOP', momentumDelta: 5 },
    onFail: { pointsAgainst: 2, newPosition: 'BOTTOM', momentumDelta: -4 },
  },
  {
    key: 'snap_go_behind',
    label: 'Snap & go-behind',
    description: 'Snappy front headlock to a clean go-behind.',
    risk: 'low',
    reward: '2 points with relatively low risk.',
    from: 'NEUTRAL',
    staminaCost: 6,
    baseInjuryRisk: 0.02,
    offenseWeights: { technique: 0.5, matIQ: 0.4, speed: 0.3 },
    defenseWeights: { technique: 0.5, strength: 0.2, speed: 0.3 },
    onSuccess: { pointsFor: 2, newPosition: 'TOP', momentumDelta: 3 },
    onFail: { pointsAgainst: 1, newPosition: 'BOTTOM', momentumDelta: -2 },
  },
  {
    key: 'counter_sprawl',
    label: 'Sprawl & circle',
    description: 'Beat their shot with a hard sprawl and circle behind.',
    risk: 'low',
    reward: 'Stuff their attack; sometimes score yourself.',
    from: 'NEUTRAL',
    staminaCost: 5,
    baseInjuryRisk: 0.02,
    offenseWeights: { matIQ: 0.4, speed: 0.4, flexibility: 0.3, conditioning: 0.2 },
    defenseWeights: { technique: 0.4, strength: 0.3, speed: 0.3 },
    onSuccess: { pointsFor: 2, newPosition: 'TOP', momentumDelta: 4 },
    onFail: { pointsAgainst: 2, newPosition: 'BOTTOM', momentumDelta: -3 },
  },

  // TOP – rides & turns
  {
    key: 'tight_waist_ride',
    label: 'Tight waist ride',
    description: 'Solid pressure ride, wear them down and look for breakdowns.',
    risk: 'low',
    reward: 'Ride time feel; small chance for nearfall.',
    from: 'TOP',
    staminaCost: 6,
    baseInjuryRisk: 0.02,
    offenseWeights: { strength: 0.4, conditioning: 0.4, matIQ: 0.3, technique: 0.3 },
    defenseWeights: { conditioning: 0.4, technique: 0.3, flexibility: 0.3 },
    onSuccess: { pointsFor: 0, newPosition: 'TOP', momentumDelta: 3 },
    onFail: { pointsAgainst: 1, newPosition: 'NEUTRAL', momentumDelta: -2 },
  },
  {
    key: 'tilt_turn',
    label: 'Tilt for nearfall',
    description: 'Risky turn to expose their back for nearfall.',
    risk: 'high',
    reward: '2–4 nearfall; big momentum.',
    from: 'TOP',
    staminaCost: 8,
    failStaminaBonus: 2,
    baseInjuryRisk: 0.04,
    canPinOnSuccess: true,
    offenseWeights: { technique: 0.6, matIQ: 0.4, flexibility: 0.3 },
    defenseWeights: { matIQ: 0.3, strength: 0.3, flexibility: 0.3 },
    onSuccess: { pointsFor: 3, newPosition: 'TOP', momentumDelta: 6 },
    onFail: { pointsAgainst: 2, newPosition: 'NEUTRAL', momentumDelta: -4 },
  },
  {
    key: 'ride_breakdown',
    label: 'Chop & breakdown',
    description: 'Fundamental chop breakdown to flatten them out.',
    risk: 'medium',
    reward: 'Control and occasional turn opportunity.',
    from: 'TOP',
    staminaCost: 7,
    baseInjuryRisk: 0.025,
    offenseWeights: { technique: 0.4, strength: 0.3, matIQ: 0.3, conditioning: 0.2 },
    defenseWeights: { strength: 0.3, conditioning: 0.3, flexibility: 0.2, matIQ: 0.3 },
    onSuccess: { pointsFor: 0, newPosition: 'TOP', momentumDelta: 4 },
    onFail: { pointsAgainst: 1, newPosition: 'NEUTRAL', momentumDelta: -3 },
  },

  // BOTTOM – escapes & reversals
  {
    key: 'explosion_standup',
    label: 'Explosion stand-up',
    description: 'Quick stand-up and clear hands for the escape.',
    risk: 'medium',
    reward: '1 escape; back to your feet.',
    from: 'BOTTOM',
    staminaCost: 9,
    failStaminaBonus: 2,
    baseInjuryRisk: 0.03,
    offenseWeights: { speed: 0.5, strength: 0.3, conditioning: 0.3, flexibility: 0.2 },
    defenseWeights: { strength: 0.3, conditioning: 0.4, matIQ: 0.3 },
    onSuccess: { pointsFor: 1, newPosition: 'NEUTRAL', momentumDelta: 3 },
    onFail: { pointsFor: 0, pointsAgainst: 2, newPosition: 'TOP', momentumDelta: -4 },
  },
  {
    key: 'sit_out_turn',
    label: 'Sit-out to reversal',
    description: 'Technical sit-out to a reversal; big swing but risky.',
    risk: 'high',
    reward: '2 reversal and top; huge swing if you hit it.',
    from: 'BOTTOM',
    staminaCost: 10,
    failStaminaBonus: 3,
    baseInjuryRisk: 0.04,
    offenseWeights: { technique: 0.5, matIQ: 0.4, strength: 0.3, flexibility: 0.3 },
    defenseWeights: { strength: 0.3, technique: 0.4, matIQ: 0.3 },
    onSuccess: { pointsFor: 2, newPosition: 'TOP', momentumDelta: 6 },
    onFail: { pointsAgainst: 2, newPosition: 'TOP', momentumDelta: -5 },
  },
  {
    key: 'controlled_reset',
    label: 'Controlled reset',
    description: 'Fight for hand control, build your base, avoid big moves.',
    risk: 'low',
    reward: 'Reduce risk, set up later escapes.',
    from: 'BOTTOM',
    staminaCost: 5,
    baseInjuryRisk: 0.02,
    offenseWeights: { matIQ: 0.4, conditioning: 0.3, flexibility: 0.3 },
    defenseWeights: { strength: 0.3, conditioning: 0.3, matIQ: 0.3 },
    onSuccess: { pointsFor: 0, newPosition: 'BOTTOM', momentumDelta: 2 },
    onFail: { pointsAgainst: 1, newPosition: 'TOP', momentumDelta: -2 },
  },

  // Hesitate / do nothing (shared for all positions)
  {
    key: HESITATE_KEY,
    label: 'Hesitate / Do nothing',
    description: 'Freeze up and let the moment pass — they get to their attack first.',
    risk: 'high',
    reward: 'None — you lose momentum and may give up points.',
    from: 'NEUTRAL',
    staminaCost: 3,
    baseInjuryRisk: 0.04,
    offenseWeights: {},
    defenseWeights: { technique: 0.3, matIQ: 0.3, strength: 0.3, conditioning: 0.2 },
    onSuccess: { pointsFor: 0, newPosition: 'NEUTRAL', momentumDelta: -3 },
    onFail: { pointsAgainst: 2, newPosition: 'NEUTRAL', momentumDelta: -6 },
  },
];

function getActionsForPosition(pos: MatchPosition): InternalActionDef[] {
  return ACTION_DEFS.filter((a) => a.from === pos || a.key === HESITATE_KEY);
}

function clamp(min: number, max: number, x: number): number {
  return Math.max(min, Math.min(max, x));
}

function copyWrestler(w: MinigameWrestler): MinigameWrestler {
  return { ...w };
}

function attributeScore(w: MinigameWrestler, weights: InternalActionDef['offenseWeights']): number {
  let sum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const k = key as keyof MinigameWrestler;
    const val = w[k];
    if (typeof val === 'number' && typeof weight === 'number') {
      sum += val * weight;
    }
  }
  return sum;
}

function buildPrompt(period: Period, position: MatchPosition, cfg: MatchMinigameConfig): ExchangePrompt {
  const baseText =
    position === 'NEUTRAL'
      ? 'Neutral — key exchange on the feet.'
      : position === 'TOP'
      ? 'Top — ride or turn from the mat.'
      : 'Bottom — get out or look for a reversal.';
  const actions = getActionsForPosition(position).filter((a) => a.key !== HESITATE_KEY);
  const timerSeconds = cfg.timerSeconds ?? DECISION_TIMER_SECONDS;
  return {
    period,
    position,
    prompt: `${baseText} Period ${period}: pick your attack.`,
    options: [
      ...actions.map<ExchangeOption>((a) => ({
        key: a.key,
        label: a.label,
        description: a.description,
        risk: a.risk,
        reward: a.reward,
      })),
      {
        key: HESITATE_KEY,
        label: 'Hesitate / Do nothing',
        description: 'Freeze up, lose momentum, and let them fire off their attack.',
        risk: 'high',
        reward: 'No upside — only downside if they capitalize.',
      },
    ],
    timerSeconds,
  };
}

export function createInitialMinigameState(
  my: MinigameWrestler,
  opp: MinigameWrestler,
  position: MatchPosition = 'NEUTRAL'
): MatchMinigameState {
  return {
    period: 1,
    position,
    my: copyWrestler(my),
    opp: copyWrestler(opp),
    myScore: 0,
    oppScore: 0,
    momentum: 0,
    logs: [],
    finished: false,
    result: null,
  };
}

export function generateExchangePrompt(state: MatchMinigameState, cfg: MatchMinigameConfig = {}): ExchangePrompt {
  return buildPrompt(state.period, state.position, cfg);
}

interface ResolveOptions {
  /** If true, treat this as a timer expiration: force Hesitate and apply extra penalty. */
  timedOut?: boolean;
}

export interface ExchangeResolution {
  state: MatchMinigameState;
  logEntry: ExchangeLogEntry;
  /** Prompt for next period, if any. */
  nextPrompt: ExchangePrompt | null;
}

export function resolveExchange(
  prevState: MatchMinigameState,
  actionKey: string,
  rng: SeededRNG,
  cfg: MatchMinigameConfig = {},
  options: ResolveOptions = {}
): ExchangeResolution {
  if (prevState.finished) {
    return { state: prevState, logEntry: prevState.logs[prevState.logs.length - 1]!, nextPrompt: null };
  }

  const state: MatchMinigameState = {
    ...prevState,
    my: copyWrestler(prevState.my),
    opp: copyWrestler(prevState.opp),
    logs: [...prevState.logs],
  };

  const period = state.period;
  const position = state.position;
  const forcedHesitate = options.timedOut === true;
  const key = forcedHesitate ? HESITATE_KEY : actionKey;
  const defs = getActionsForPosition(position);
  const def = defs.find((d) => d.key === key) ?? defs.find((d) => d.key === HESITATE_KEY)!;

  const myBefore = state.my.energy;
  const myInjuryBefore = state.my.injurySeverity;
  const momBefore = state.momentum;
  const notes: string[] = [];

  // Effective offense vs defense + momentum – fatigue/injury – hesitation penalty
  const offAttr = attributeScore(state.my, def.offenseWeights);
  const defAttr = attributeScore(state.opp, def.defenseWeights);
  const ratingGapTerm = (state.my.overallRating - state.opp.overallRating) * 0.6;
  const momentumBonus = state.momentum * 0.8;
  const fatigue = fatiguePenalty(state.my.energy);
  const inj = injuryPenalty(state.my.injurySeverity);
  const hesitationPenalty = forcedHesitate || def.key === HESITATE_KEY ? 8 : 0;

  const effective = offAttr - defAttr + ratingGapTerm + momentumBonus - fatigue - inj - hesitationPenalty;
  const pSuccess = logisticWinProb(effective, 12);
  const success = rng.chance(pSuccess);

  let pointsFor = 0;
  let pointsAgainst = 0;
  let newPos: MatchPosition;
  let momentumAfter: number;

  if (success) {
    pointsFor = def.onSuccess.pointsFor;
    pointsAgainst = def.onSuccess.pointsAgainst ?? 0;
    newPos = def.onSuccess.newPosition;
    momentumAfter = state.momentum + def.onSuccess.momentumDelta;
    // Very small chance of pin on high-risk top actions
    if (def.canPinOnSuccess && rng.chance(0.08)) {
      pointsFor = Math.max(pointsFor, 6);
      notes.push('You flat-out decked him off the action.');
    }
  } else {
    pointsFor = def.onFail.pointsFor ?? 0;
    pointsAgainst = def.onFail.pointsAgainst;
    newPos = def.onFail.newPosition;
    momentumAfter = state.momentum + def.onFail.momentumDelta;
  }

  // Stamina costs
  const staminaCost = def.staminaCost + (success ? 0 : def.failStaminaBonus ?? 0);
  const energyAfter = clamp(0, 100, state.my.energy - staminaCost);

  // Injury risk scaled by low energy + hesitation awkwardness
  const lowEnergyFactor = 1 + (1 - energyAfter / 100) * 1.2;
  const hesitationFactor = forcedHesitate || def.key === HESITATE_KEY ? 1.4 : 1.0;
  const injuryChance = def.baseInjuryRisk * lowEnergyFactor * hesitationFactor;
  let injuryAfter = state.my.injurySeverity;
  if (rng.chance(injuryChance)) {
    const deltaSev = 0.05 + rng.float() * 0.08;
    injuryAfter = clamp(0, 1, injuryAfter + deltaSev);
    notes.push('You tweaked something in the scramble — carrying a small injury now.');
  }

  state.my.energy = energyAfter;
  state.my.injurySeverity = injuryAfter;
  state.myScore += pointsFor;
  state.oppScore += pointsAgainst;
  state.position = newPos;
  state.momentum = clamp(-15, 15, momentumAfter);

  const timerSeconds = cfg.timerSeconds ?? DECISION_TIMER_SECONDS;
  const logEntry: ExchangeLogEntry = {
    period,
    position,
    prompt: buildPrompt(period, position, cfg).prompt,
    actionKey: def.key,
    actionLabel: def.label,
    timedOut: !!forcedHesitate,
    timerSeconds,
    success,
    pointsFor,
    pointsAgainst,
    myEnergyBefore: myBefore,
    myEnergyAfter: energyAfter,
    myInjuryBefore,
    myInjuryAfter: injuryAfter,
    momentumBefore: momBefore,
    momentumAfter: state.momentum,
    timerFailureScored: !!forcedHesitate && pointsAgainst > 0,
    notes,
  };

  state.logs.push(logEntry);

  if (period < 3) {
    state.period = ((period + 1) as Period);
    const nextPrompt = buildPrompt(state.period, state.position, cfg);
    return { state, logEntry, nextPrompt };
  }

  // After 3 periods: minigame score decides the winner when there's a clear margin.
  // Only use elite sim for tiebreaker (0-0 or equal score).
  state.finished = true;

  const scoreDiff = state.myScore - state.oppScore;
  let finalWon: boolean;
  let method: string;
  let effectiveGap: number;
  let baseGap: number;
  let pFavorite: number;

  if (scoreDiff > 0) {
    // You led in the minigame — you win. Method from margin.
    finalWon = true;
    method = scoreDiff >= 15 ? 'Tech' : scoreDiff >= 8 ? 'Major' : 'Dec';
    effectiveGap = scoreDiff * 2;
    baseGap = state.my.overallRating - state.opp.overallRating;
    pFavorite = 1;
  } else if (scoreDiff < 0) {
    // Opponent led in the minigame — you lose.
    finalWon = false;
    method = Math.abs(scoreDiff) >= 15 ? 'Tech' : Math.abs(scoreDiff) >= 8 ? 'Major' : 'Dec';
    effectiveGap = scoreDiff * 2;
    baseGap = state.my.overallRating - state.opp.overallRating;
    pFavorite = 0;
  } else {
    // Tie: use elite sim as tiebreaker with minigame momentum as form.
    const formModA = state.momentum * 0.8;
    const eliteResult = simEliteMatch(
      {
        baseA: state.my.overallRating,
        energyA: clamp(0, 100, state.my.energy),
        injuryA: clamp(0, 1, state.my.injurySeverity),
        composureA: 80,
        baseB: state.opp.overallRating,
        energyB: 80,
        injuryB: 0,
        composureB: 80,
        formModA,
        formModB: 0,
      },
      rng
    );
    finalWon = eliteResult.won;
    method = eliteResult.method;
    effectiveGap = eliteResult.effectiveGap;
    baseGap = eliteResult.baseGap;
    pFavorite = eliteResult.pFavorite;
  }

  state.result = {
    won: finalWon,
    method,
    myScore: state.myScore,
    oppScore: state.oppScore,
    eliteEffectiveGap: effectiveGap,
    eliteBaseGap: baseGap,
    eliteFavoriteProb: pFavorite,
  };

  return { state, logEntry, nextPrompt: null };
}

