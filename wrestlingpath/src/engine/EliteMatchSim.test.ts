/**
 * Validation tests for elite match sim: Monte Carlo 10k runs per scenario.
 * Tune constants in EliteMatchSim until all constraints are satisfied.
 */

import { describe, it, expect } from 'vitest';
import { simEliteMatch } from './EliteMatchSim';
import { SeededRNG } from './SeededRNG';

const N = 10_000;

function underdogWinRate(
  baseA: number,
  energyA: number,
  injuryA: number,
  baseB: number,
  energyB: number,
  injuryB: number
): number {
  let underdogWins = 0;
  const underdogIsB = baseA >= baseB;
  for (let i = 0; i < N; i++) {
    const rng = new SeededRNG(`elite-mc-${baseA}-${baseB}-${i}`);
    const result = simEliteMatch(
      {
        baseA,
        energyA,
        injuryA,
        composureA: 80,
        baseB,
        energyB,
        injuryB,
        composureB: 80,
      },
      rng
    );
    const bWins = !result.won;
    if (underdogIsB && bWins) underdogWins++;
    if (!underdogIsB && !bWins) underdogWins++;
  }
  return underdogWins / N;
}

describe('EliteMatchSim validation (Monte Carlo 10k)', () => {
  it('A=94 e80 i0 vs B=64 e80 i0 => underdog (B) win rate <= 0.2%', () => {
    const rate = underdogWinRate(94, 80, 0, 64, 80, 0);
    expect(rate).toBeLessThanOrEqual(0.002);
  });

  it('A=94 e80 i0 vs B=82 e80 i0 => underdog (B) win rate <= 3%', () => {
    const rate = underdogWinRate(94, 80, 0, 82, 80, 0);
    expect(rate).toBeLessThanOrEqual(0.03);
  });

  it('A=94 e45 i0 vs B=82 e80 i0 => underdog (B) win rate <= 8%', () => {
    const rate = underdogWinRate(94, 45, 0, 82, 80, 0);
    expect(rate).toBeLessThanOrEqual(0.08);
  });

  it('A=94 e20 i0 vs B=82 e80 i0 => underdog (B) win rate 15-35%', () => {
    const rate = underdogWinRate(94, 20, 0, 82, 80, 0);
    expect(rate).toBeGreaterThanOrEqual(0.15);
    expect(rate).toBeLessThanOrEqual(0.35);
  });

  it('A=94 e70 i0.6 vs B=82 e80 i0 => underdog (B) win rate 10-30%', () => {
    const rate = underdogWinRate(94, 70, 0.6, 82, 80, 0);
    expect(rate).toBeGreaterThanOrEqual(0.10);
    expect(rate).toBeLessThanOrEqual(0.30);
  });

  it('A=94 e80 i0 vs B=92 e80 i0 => underdog (B) win rate 35-55%', () => {
    const rate = underdogWinRate(94, 80, 0, 92, 80, 0);
    expect(rate).toBeGreaterThanOrEqual(0.35);
    expect(rate).toBeLessThanOrEqual(0.55);
  });
});
