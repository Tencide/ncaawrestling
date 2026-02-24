/**
 * Elite wrestler realism: effective rating, logistic win prob, capped noise, probability floors.
 * A 94 should rarely lose to <85 unless severely compromised (tired/injured).
 */

import type { SeededRNG } from './SeededRNG';

export const ELITE_MATCH_CONSTANTS = {
  fatigueMax: 26,
  fatigueExponent: 2.3,
  injuryMax: 32,
  logisticScale: 11.5,
  baseSigma: 3.6,
  noiseCap: 7,
} as const;

function clamp(min: number, max: number, x: number): number {
  return Math.max(min, Math.min(max, x));
}

/** energy 0-100 -> normalized [0,1] */
function energyN(energy: number): number {
  return clamp(0, 1, energy / 100);
}

/**
 * Fatigue penalty: fatigueMax * (1 - energyN)^fatigueExponent
 */
export function fatiguePenalty(energy: number, fatigueMax = ELITE_MATCH_CONSTANTS.fatigueMax, fatigueExponent = ELITE_MATCH_CONSTANTS.fatigueExponent): number {
  const en = energyN(energy);
  return fatigueMax * Math.pow(1 - en, fatigueExponent);
}

/**
 * Injury penalty: injuryMax * injurySeverity (severity in [0, 1])
 */
export function injuryPenalty(injurySeverity: number, injuryMax = ELITE_MATCH_CONSTANTS.injuryMax): number {
  const sev = clamp(0, 1, injurySeverity);
  return injuryMax * sev;
}

/**
 * Effective rating = baseRating + formModifier + styleMatchupModifier - fatiguePenalty - injuryPenalty
 */
export function effectiveRating(
  baseRating: number,
  energy: number,
  injurySeverity: number,
  formModifier = 0,
  styleMatchupModifier = 0,
  constants = ELITE_MATCH_CONSTANTS
): number {
  const fat = fatiguePenalty(energy, constants.fatigueMax, constants.fatigueExponent);
  const inj = injuryPenalty(injurySeverity, constants.injuryMax);
  return baseRating + formModifier + styleMatchupModifier - fat - inj;
}

/**
 * Win probability from effective rating difference: pA = 1 / (1 + exp(-diff / scale))
 */
export function logisticWinProb(diff: number, scale: number = ELITE_MATCH_CONSTANTS.logisticScale): number {
  return 1 / (1 + Math.exp(-diff / scale));
}

/**
 * Capped noise: sigma from composure and energy, then Normal(0, sigma) clamped to [-noiseCap, +noiseCap]
 * sigma = baseSigma * (1 - 0.55*composure/100) * (1 + 0.9*(1-energyN))
 */
export function cappedNoise(
  composure: number,
  energy: number,
  rng: SeededRNG,
  baseSigma = ELITE_MATCH_CONSTANTS.baseSigma,
  noiseCap = ELITE_MATCH_CONSTANTS.noiseCap
): number {
  const comp = clamp(0, 100, composure) / 100;
  const en = energyN(energy);
  const sigma = baseSigma * (1 - 0.55 * comp) * (1 + 0.9 * (1 - en));
  const noise = rng.normal() * sigma;
  return clamp(-noiseCap, noiseCap, noise);
}

/**
 * Favorite is compromised if energy <= 30 OR injurySeverity >= 0.40
 */
export function isCompromised(energy: number, injurySeverity: number): boolean {
  return energy <= 30 || clamp(0, 1, injurySeverity) >= 0.4;
}

/**
 * Minimum win probability floors when NOT compromised (favorite vs underdog by base rating).
 * Elite cutoff: favorite >= 92 and underdog <= 84 => pFavorite >= 0.985.
 */
export function eliteFloor(baseGap: number, favoriteBase: number, underdogBase: number, compromised: boolean): number | null {
  if (compromised) return null;
  // Elite vs elite: both >= 90 — don't apply big-gap floors (unless gap >= 20)
  if (favoriteBase >= 90 && underdogBase >= 90) {
    if (baseGap >= 20) {
      if (baseGap >= 30) return 0.995;
      if (baseGap >= 25) return 0.985;
      return 0.97;
    }
    return null;
  }
  // Elite cutoff: favorite >= 92, underdog <= 84
  if (favoriteBase >= 92 && underdogBase <= 84) return 0.985;
  if (baseGap >= 30) return 0.998; // ≤0.2% underdog in 10k (94 vs 64)
  if (baseGap >= 25) return 0.985;
  if (baseGap >= 20) return 0.97;
  if (baseGap >= 15) return 0.93;
  return null;
}

export interface EliteMatchInput {
  /** Player A (e.g. "player") base rating, energy, injury [0,1], composure 0-100 */
  baseA: number;
  energyA: number;
  injuryA: number;
  composureA: number;
  /** Player B (opponent) */
  baseB: number;
  energyB?: number;
  injuryB?: number;
  composureB?: number;
  /** Optional form/style modifiers (added to effective) */
  formModA?: number;
  formModB?: number;
  styleModA?: number;
  styleModB?: number;
  /** Week modifier: multiply win prob by this (e.g. performanceMult) */
  performanceMult?: number;
  /** Slight extra variance (e.g. rival) */
  isRival?: boolean;
}

export interface EliteMatchResult {
  won: boolean;
  /** true if A won (A is "player") */
  method: string;
  pFavorite: number;
  effectiveGap: number;
  baseGap: number;
  upsetLogLine: string | null;
}

/**
 * Run one match with elite realism: effective ratings, logistic, capped noise, floors, upset logging.
 */
export function simEliteMatch(input: EliteMatchInput, rng: SeededRNG, constants = ELITE_MATCH_CONSTANTS): EliteMatchResult {
  const energyB = input.energyB ?? 80;
  const injuryB = input.injuryB ?? 0;
  const composureB = input.composureB ?? 80;
  const formA = input.formModA ?? 0;
  const formB = input.formModB ?? 0;
  const styleA = input.styleModA ?? 0;
  const styleB = input.styleModB ?? 0;

  const effA = effectiveRating(input.baseA, input.energyA, input.injuryA, formA, styleA, constants);
  const effB = effectiveRating(input.baseB, energyB, injuryB, formB, styleB, constants);

  // Noise applied to diff (favor variance when tired/stressed)
  const noiseA = cappedNoise(input.composureA, input.energyA, rng, constants.baseSigma, constants.noiseCap);
  const noiseB = cappedNoise(composureB, energyB, rng, constants.baseSigma, constants.noiseCap);
  let diffNoise = noiseA - noiseB;
  if (input.isRival) {
    diffNoise += (rng.float() - 0.5) * 2;
  }
  const diff = effA - effB + diffNoise;
  let pA = logisticWinProb(diff, constants.logisticScale);

  const favoriteBase = input.baseA >= input.baseB ? input.baseA : input.baseB;
  const underdogBase = input.baseA >= input.baseB ? input.baseB : input.baseA;
  const baseGap = favoriteBase - underdogBase;
  const aIsFavorite = input.baseA >= input.baseB;
  const compromisedA = isCompromised(input.energyA, input.injuryA);
  const compromisedB = isCompromised(energyB, injuryB);
  const favoriteCompromised = aIsFavorite ? compromisedA : compromisedB;

  const floor = eliteFloor(baseGap, favoriteBase, underdogBase, favoriteCompromised);
  if (floor != null) {
    const pFavorite = aIsFavorite ? pA : 1 - pA;
    if (pFavorite < floor) {
      if (aIsFavorite) pA = floor;
      else pA = 1 - floor;
    }
  }

  if (input.performanceMult != null) {
    pA = clamp(0.02, 0.98, pA * input.performanceMult);
  }

  const won = rng.float() < pA;
  const method = won ? (rng.float() < 0.3 ? 'Fall' : rng.float() < 0.5 ? 'Tech' : 'Dec') : 'Dec';

  let upsetLogLine: string | null = null;
  const underdogWon = (won && !aIsFavorite) || (!won && aIsFavorite);
  if (underdogWon && baseGap >= 15) {
    const pFavorite = aIsFavorite ? (won ? 1 - pA : pA) : (won ? pA : 1 - pA);
    const effectiveGap = aIsFavorite ? effA - effB : effB - effA;
    const favEnergy = aIsFavorite ? input.energyA : energyB;
    const favInjury = aIsFavorite ? input.injuryA : injuryB;
    upsetLogLine = `UPSET: baseGap=${baseGap} REASON: energy=${favEnergy} injury=${favInjury.toFixed(2)} effectiveGap=${effectiveGap.toFixed(1)} pFavorite=${pFavorite.toFixed(3)}`;
  }

  const pFavorite = aIsFavorite ? pA : 1 - pA;
  const effectiveGap = effA - effB;
  return { won, method, pFavorite: aIsFavorite ? pA : 1 - pA, effectiveGap, baseGap, upsetLogLine };
}
