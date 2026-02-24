/**
 * Tournament match simulation: uses EliteMatchSim for outcome (effective rating, logistic, floors),
 * plus matchup-style modifiers, intensity, and injury roll.
 */

import type { SeededRNG } from './SeededRNG';
import { simEliteMatch } from './EliteMatchSim';

/** Player snapshot for tournament (UnifiedState subset + run-time injury). */
export interface TournamentPlayerState {
  technique: number;
  matIQ: number;
  conditioning: number;
  strength: number;
  speed: number;
  flexibility: number;
  energy: number;
  health: number;
  stress: number;
  trueSkill: number;
  overallRating: number;
  /** Injury severity this event (0 = none); penalizes rating and increases future risk. */
  injurySeverity: number;
  /** Week modifiers.performanceMult applied to win prob. */
  performanceMult?: number;
}

/** Opponent with optional matchup stats (derived from overallRating/style if missing). */
export interface TournamentOpponent {
  id: string;
  name: string;
  overallRating: number;
  style: 'grinder' | 'scrambler' | 'defensive';
  clutch: number;
  stateRank?: number;
  nationalRank?: number;
  physicality?: number;
  tdOffense?: number;
  tdDefense?: number;
  riding?: number;
  escapes?: number;
}

export interface TournamentMatchResult {
  won: boolean;
  method: string;
  /** 0–1; used for energy drain. */
  intensity: number;
  /** True if an injury occurred this match. */
  injuryOccurred: boolean;
  /** If injuryOccurred, 1–10. */
  injurySeverity: number;
}

const SIGMOID_K = 10;

function clamp(min: number, max: number, x: number): number {
  return Math.max(min, Math.min(max, x));
}

function sigmoid(x: number, k: number = SIGMOID_K): number {
  return 1 / (1 + Math.exp(-x / k));
}

/** Derive opponent matchup stats from rating and style when not provided. */
function deriveOpponentStats(opp: TournamentOpponent): { physicality: number; tdOffense: number; tdDefense: number; riding: number; escapes: number } {
  const r = opp.overallRating / 100;
  const style = opp.style;
  const physicality = opp.physicality ?? clamp(40, 95, (r * 70) + (style === 'grinder' ? 15 : style === 'defensive' ? 5 : 0));
  const tdOffense = opp.tdOffense ?? clamp(40, 95, (r * 65) + (style === 'scrambler' ? 15 : 0));
  const tdDefense = opp.tdDefense ?? clamp(40, 95, (r * 65) + (style === 'defensive' ? 15 : 0));
  const riding = opp.riding ?? clamp(40, 95, (r * 60) + (style === 'grinder' ? 20 : 0));
  const escapes = opp.escapes ?? clamp(40, 95, (r * 60) + (style === 'scrambler' ? 15 : 0));
  return { physicality, tdOffense, tdDefense, riding, escapes };
}

/** Effective rating from attributes, form, energy, injury. */
function effectiveRating(p: TournamentPlayerState): number {
  const skill = (p.technique ?? 50) * 0.3 + (p.matIQ ?? 50) * 0.25;
  const physical = (p.conditioning ?? 50) * 0.25 + (p.strength ?? 50) * 0.1 + (p.speed ?? 50) * 0.1;
  const mental = Math.max(0, 100 - (p.stress ?? 50)) * 0.15; // composure
  const base = skill + physical + mental;
  const energyFactor = (p.energy ?? 100) / 100;
  const injuryPenalty = (p.injurySeverity ?? 0) * 2.5; // each severity point hurts
  return base * energyFactor - injuryPenalty;
}

/** Matchup interaction: TD vs TD defense, riding vs escapes (advantage in points). */
function matchupTerms(p: TournamentPlayerState, opp: TournamentOpponent): number {
  const oppStats = deriveOpponentStats(opp);
  const myTD = (p.technique ?? 50) * 0.5 + (p.speed ?? 50) * 0.5;
  const myTDDef = (p.matIQ ?? 50) * 0.5 + (p.strength ?? 50) * 0.5;
  const myRiding = (p.strength ?? 50) * 0.5 + (p.matIQ ?? 50) * 0.5;
  const myEscapes = (p.conditioning ?? 50) * 0.5 + (p.flexibility ?? 50) * 0.5;
  const tdAdv = (myTD - oppStats.tdDefense) * 0.08;
  const tdDefAdv = (myTDDef - oppStats.tdOffense) * 0.06;
  const rideAdv = (myRiding - oppStats.escapes) * 0.05;
  const escapeAdv = (myEscapes - oppStats.riding) * 0.05;
  return tdAdv + tdDefAdv + rideAdv + escapeAdv;
}

/** Variance scale: higher when low composure (high stress) or high fatigue (low energy). */
function varianceScale(p: TournamentPlayerState): number {
  const composure = Math.max(0, 100 - (p.stress ?? 50)) / 100;
  const fatigue = 1 - (p.energy ?? 100) / 100;
  return 4 + (1 - composure) * 3 + fatigue * 4; // more variance when stressed or tired
}

/** Decide method of victory/defeat. */
function decideMethod(won: boolean, diff: number, rng: SeededRNG): string {
  if (!won) return 'Dec';
  const roll = rng.float();
  if (roll < 0.12) return 'Fall';
  if (roll < 0.32) return 'Tech';
  if (roll < 0.52) return 'Major';
  return 'Dec';
}

/** Match intensity (0–1) for energy drain: closer matches and losses = higher. */
function matchIntensity(diff: number, won: boolean, rng: SeededRNG): number {
  const close = Math.abs(diff) < 8;
  const base = won ? 0.4 + rng.float() * 0.3 : 0.6 + rng.float() * 0.35;
  return clamp(0.2, 1, close ? base + 0.15 : base);
}

export function simTournamentMatch(
  player: TournamentPlayerState,
  opponent: TournamentOpponent,
  rng: SeededRNG
): TournamentMatchResult {
  const injurySeverityNorm = Math.min(1, (player.injurySeverity ?? 0) / 10);
  const composure = Math.max(0, 100 - (player.stress ?? 50));
  const matchup = matchupTerms(player, opponent);
  const result = simEliteMatch(
    {
      baseA: player.overallRating,
      energyA: player.energy,
      injuryA: injurySeverityNorm,
      composureA: composure,
      baseB: opponent.overallRating,
      energyB: 80,
      injuryB: 0,
      composureB: 80,
      formModA: matchup,
      performanceMult: player.performanceMult,
    },
    rng
  );
  const won = result.won;
  const method = result.method;
  const intensity = matchIntensity(result.effectiveGap, won, rng);

  // Injury roll: base + (low energy) + (opp physicality) - (toughness from health/conditioning)
  const toughness = ((player.health ?? 100) / 100) * 0.4 + ((player.conditioning ?? 50) / 100) * 0.3;
  const oppStats = deriveOpponentStats(opponent);
  const lowEnergyFactor = (100 - (player.energy ?? 100)) / 100 * 0.15;
  const oppPhysicalFactor = (oppStats.physicality / 100) * 0.12;
  const injuryRisk = clamp(0.02, 0.45, 0.08 + lowEnergyFactor + oppPhysicalFactor - toughness + (player.injurySeverity ?? 0) * 0.02);
  const injuryOccurred = rng.float() < injuryRisk;
  const injurySeverity = injuryOccurred ? clamp(1, 10, 1 + Math.floor(rng.float() * 5) + (player.energy < 30 ? 1 : 0)) : 0;

  return { won, method, intensity, injuryOccurred, injurySeverity };
}

/** Apply post-match energy drain (caller mutates player state). */
export function applyPostMatchEnergy(
  player: { energy: number; conditioning: number },
  intensity: number
): number {
  const cardio = (player.conditioning ?? 50) / 100;
  const drain = intensity * (1.2 - cardio * 0.6) * 12;
  const actual = Math.min(drain, player.energy ?? 100);
  player.energy = Math.max(0, (player.energy ?? 100) - actual);
  return -actual;
}

/** One match entry for bracket logging. */
export interface BracketMatchEntry {
  roundLabel: string;
  opponentName: string;
  opponentOverall: number;
  stateRank?: number;
  nationalRank?: number;
  won: boolean;
  method: string;
}

/** Result of running the full double-elim bracket for the player. */
export interface DoubleElimResult {
  placement: number;
  matches: BracketMatchEntry[];
}

/** Bracket size: 8-man (QF, SF, Final) or 16-man (R16, QF, SF, Final). */
export type BracketSize = 8 | 16;

/** Round label for 3rd/4th place match; after this round the wrestler has no further matches. */
export const ROUND_3RD_4TH = '3rd/4th';

/**
 * True double-elimination: everyone starts in Winners Bracket (WB), first loss → Losers Bracket (LB),
 * second loss → eliminated. Finals = WB champ vs LB champ (optional bracket reset).
 * Consolation final = 3rd/4th match only; winner places 3rd, loser 4th, then both are done (no 2nd/3rd match).
 * Placement: 3rd/4th from that match; 1st/2nd from Final (+ bracket reset); 5–8 from LB elimination order.
 */
export function runDoubleElimBracket(
  player: TournamentPlayerState,
  getOpponent: (roundLabel: string) => TournamentOpponent,
  rng: SeededRNG,
  bracketSize: BracketSize = 8
): DoubleElimResult {
  const matches: BracketMatchEntry[] = [];
  const push = (roundLabel: string, opp: TournamentOpponent, won: boolean, method: string) => {
    matches.push({
      roundLabel,
      opponentName: opp.name,
      opponentOverall: opp.overallRating,
      stateRank: opp.stateRank,
      nationalRank: opp.nationalRank,
      won,
      method,
    });
  };

  const playMatch = (roundLabel: string): { won: boolean; method: string; intensity: number; injuryOccurred: boolean; injurySeverity: number } => {
    const opp = getOpponent(roundLabel);
    const result = simTournamentMatch(player, opp, rng);
    push(roundLabel, opp, result.won, result.method);
    applyPostMatchEnergy(player, result.intensity);
    if (result.injuryOccurred) player.injurySeverity = (player.injurySeverity ?? 0) + result.injurySeverity;
    return result;
  };

  const is8 = bracketSize === 8;

  if (is8) {
    // ——— 8-man: WB = Quarterfinal, Semifinal, Winner's Final ———
    const wbR1 = playMatch('Quarterfinal');
    if (!wbR1.won) {
      const lbR1 = playMatch('Consolation R1');
      if (!lbR1.won) return { placement: rng.chance(0.5) ? 7 : 8, matches };
      const lbR2 = playMatch('Consolation R2');
      if (!lbR2.won) return { placement: rng.chance(0.5) ? 5 : 6, matches };
      const thirdFourth = playMatch(ROUND_3RD_4TH);
      if (thirdFourth.won) return { placement: 3, matches };
      return { placement: 4, matches };
    }

    const wbR2 = playMatch('Semifinal');
    if (!wbR2.won) {
      const lbR2 = playMatch('Consolation R2');
      if (!lbR2.won) return { placement: rng.chance(0.5) ? 5 : 6, matches };
      const thirdFourth = playMatch(ROUND_3RD_4TH);
      if (thirdFourth.won) return { placement: 3, matches };
      return { placement: 4, matches };
    }

    const wbR3 = playMatch("Winner's Final");
    if (!wbR3.won) {
      // WB final loser: wrestle LB champ in LB Final; loser gets 2nd, winner goes to bracket reset
      const lbFinal = playMatch('LB Final');
      if (!lbFinal.won) return { placement: 2, matches };
      const reset = playMatch('Bracket reset');
      return { placement: reset.won ? 1 : 2, matches };
    }

    // WB champ: wrestle LB champ in Final; win = 1st, lose = bracket reset
    const final = playMatch('Final');
    if (final.won) return { placement: 1, matches };
    const reset = playMatch('Bracket reset');
    return { placement: reset.won ? 1 : 2, matches };
  }

  // ——— 16-man: WB = R16, Quarterfinal, Semifinal, Winner's Final. LB: Cons R1–R4, then 3rd/4th. ———
  const wbR16 = playMatch('R16');
  if (!wbR16.won) {
    const lbR1 = playMatch('Consolation R1');
    if (!lbR1.won) return { placement: rng.chance(0.5) ? 15 : 16, matches };
    const lbR2 = playMatch('Consolation R2');
    if (!lbR2.won) return { placement: rng.chance(0.5) ? 13 : 14, matches };
    const lbR3 = playMatch('Consolation R3');
    if (!lbR3.won) return { placement: rng.chance(0.5) ? 11 : 12, matches };
    const lbR4 = playMatch('Consolation R4');
    if (!lbR4.won) return { placement: rng.chance(0.5) ? 9 : 10, matches };
    const thirdFourth = playMatch(ROUND_3RD_4TH);
    if (thirdFourth.won) return { placement: 3, matches };
    return { placement: 4, matches };
  }

  const wbQF = playMatch('Quarterfinal');
  if (!wbQF.won) {
    const lbR2 = playMatch('Consolation R2');
    if (!lbR2.won) return { placement: rng.chance(0.5) ? 13 : 14, matches };
    const lbR3 = playMatch('Consolation R3');
    if (!lbR3.won) return { placement: rng.chance(0.5) ? 11 : 12, matches };
    const lbR4 = playMatch('Consolation R4');
    if (!lbR4.won) return { placement: rng.chance(0.5) ? 9 : 10, matches };
    const thirdFourth = playMatch(ROUND_3RD_4TH);
    if (thirdFourth.won) return { placement: 3, matches };
    return { placement: 4, matches };
  }

  const wbSF = playMatch('Semifinal');
  if (!wbSF.won) {
    const lbR4 = playMatch('Consolation R4');
    if (!lbR4.won) return { placement: rng.chance(0.5) ? 5 : 6, matches };
    const thirdFourth = playMatch(ROUND_3RD_4TH);
    if (thirdFourth.won) return { placement: 3, matches };
    return { placement: 4, matches };
  }

  const wbFinal = playMatch("Winner's Final");
  if (!wbFinal.won) {
    const lbFinal = playMatch('LB Final');
    if (!lbFinal.won) return { placement: 2, matches };
    const reset = playMatch('Bracket reset');
    return { placement: reset.won ? 1 : 2, matches };
  }

  const final = playMatch('Final');
  if (final.won) return { placement: 1, matches };
  const reset = playMatch('Bracket reset');
  return { placement: reset.won ? 1 : 2, matches };
}

/**
 * Validates that a bracket match sequence is possible under true double-elimination.
 * Flags impossible sequences (e.g. any match after 3rd/4th for that wrestler).
 */
export function validateBracketMatchSequence(matches: BracketMatchEntry[]): { valid: boolean; message?: string } {
  const i = matches.findIndex((m) => m.roundLabel === ROUND_3RD_4TH || m.roundLabel === 'Consolation 3rd/4th');
  if (i >= 0 && i < matches.length - 1) {
    return {
      valid: false,
      message: `Impossible sequence: "${ROUND_3RD_4TH}" (or Consolation 3rd/4th) must be the wrestler's last match; found another round after it: "${matches[i + 1].roundLabel}".`,
    };
  }
  return { valid: true };
}

/** Minimal match shape for placement validation. */
export interface TournamentMatchForValidation {
  won: boolean;
}

/**
 * Validates that placement is consistent with match results (double-elimination rules).
 * Champion must have 0 or 1 loss; no "Placed 1st" with 2+ losses.
 * No matches may occur after a wrestler's 2nd loss (elimination).
 */
export function validateTournamentResult(
  placement: number,
  matches: TournamentMatchForValidation[]
): { valid: boolean; message?: string } {
  const losses = matches.filter((m) => !m.won).length;
  let runningLosses = 0;
  for (let i = 0; i < matches.length; i++) {
    if (!matches[i].won) runningLosses++;
    if (runningLosses >= 2 && i < matches.length - 1) {
      return {
        valid: false,
        message: `Wrestler eliminated (2nd loss) at match ${i + 1} but has ${matches.length - i - 1} more match(es) logged.`,
      };
    }
  }
  if (placement === 1 && losses >= 2) {
    return {
      valid: false,
      message: `Champion cannot have 2+ losses (had ${losses}). Placement 1st is invalid for record ${matches.filter((m) => m.won).length}-${losses}.`,
    };
  }
  if (placement === 2 && losses > 2) {
    return {
      valid: false,
      message: `Runner-up cannot have more than 2 losses (had ${losses}).`,
    };
  }
  return { valid: true };
}
