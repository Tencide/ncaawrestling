/**
 * College wrestling season schedule generator.
 * Builds weekly blocks with phases (early, midseason, conference stretch, postseason),
 * dual/tournament/recovery mix, conference duals, travel fatigue, and coach strategy.
 */

import type { CollegeScheduleEntry, SeasonPhase, WeeklyBlockType, EventFormat } from '../unified/types';
import type { SeededRNG } from '../SeededRNG';
import { getConferenceOpponents } from '@/data/conferences';
import { SCHOOLS } from '@/data/schools';

/** Season length: weeks 1..SEASON_WEEKS are competition; NCAA is week NCAA_WEEK. */
export const SEASON_WEEKS = 14;
export const NCAA_WEEK = 15;

/** Week ranges for each phase (1-based). */
const EARLY_WEEKS = [1, 2, 3, 4];
const MIDSEASON_WEEKS = [5, 6, 7, 8];
const CONFERENCE_STRETCH_WEEKS = [9, 10, 11];
const POSTSEASON_WEEKS = [12, 13, 14]; // 12 = conference tournament, 13–14 = recovery/buffer

/** Tournament names by format. */
const OPEN_NAMES = ['Black Knight Open', 'Edinboro Open', 'Mountaineer Open', 'Lock Haven Open', 'Mat Town Open', 'F&M Open'];
const INVITE_NAMES = ['Cliff Keen Las Vegas', 'Southern Scuffle', 'Midlands', 'Beast of the East', 'Colonial Athletic', 'Las Vegas Invite'];
const BIG_TOURNAMENT_NAMES = ['CKLV', 'Midlands', 'Southern Scuffle', 'Big Ten Invite', 'National Duals'];

/** Powerhouse school ids (ranked opponents more common when facing these). */
const POWERHOUSE_IDS = new Set(['iowa', 'penn-state', 'ohio-state', 'oklahoma-state']);

function clamp(min: number, max: number, x: number): number {
  return Math.max(min, Math.min(max, x));
}

function pick<T>(arr: T[], rng: SeededRNG): T {
  return arr[rng.next() % arr.length];
}

function shuffle<T>(arr: T[], rng: SeededRNG): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.next() % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function getPhase(week: number): SeasonPhase {
  if (EARLY_WEEKS.includes(week)) return 'early';
  if (MIDSEASON_WEEKS.includes(week)) return 'midseason';
  if (CONFERENCE_STRETCH_WEEKS.includes(week)) return 'conference_stretch';
  if (POSTSEASON_WEEKS.includes(week)) return 'postseason';
  return 'midseason';
}

/** Derive coach strategy from school's coachAggressiveness (0–1). */
export function getCoachStrategy(coachAggressiveness: number): 'aggressive' | 'balanced' | 'conservative' {
  if (coachAggressiveness >= 0.72) return 'aggressive';
  if (coachAggressiveness >= 0.45) return 'balanced';
  return 'conservative';
}

/** Decide if starters participate in an "open" format event (smaller opens). Depends on coach strategy and RNG. */
export function shouldStarterParticipateInOpen(
  strategy: 'aggressive' | 'balanced' | 'conservative',
  rng: SeededRNG
): boolean {
  const roll = rng.float();
  if (strategy === 'aggressive') return roll < 0.85;
  if (strategy === 'balanced') return roll < 0.6;
  return roll < 0.35;
}

/** Get all non-conference opponent school ids (same division preferred). */
function getNonConferenceOpponents(
  schoolId: string,
  division: string,
  conferenceOpponentIds: string[],
  rng: SeededRNG
): string[] {
  const exclude = new Set([schoolId, ...conferenceOpponentIds]);
  const candidates = SCHOOLS.filter((s) => !exclude.has(s.id) && s.division === division).map((s) => s.id);
  if (candidates.length === 0) {
    return SCHOOLS.filter((s) => !exclude.has(s.id)).map((s) => s.id);
  }
  return shuffle(candidates, rng);
}

/** Generate the full college season schedule for a school. */
export function generateSeasonSchedule(
  schoolId: string,
  coachAggressiveness: number,
  rng: SeededRNG
): CollegeScheduleEntry[] {
  const school = SCHOOLS.find((s) => s.id === schoolId);
  const division = school?.division ?? 'D1';
  const conferenceOpponentIds = getConferenceOpponents(schoolId).filter((id) =>
    SCHOOLS.some((s) => s.id === id)
  );
  const nonConfOpponents = getNonConferenceOpponents(schoolId, division, conferenceOpponentIds, rng);
  const strategy = getCoachStrategy(coachAggressiveness);

  // How many conference duals to schedule (5–8); spread over conference stretch + maybe one in midseason
  const numConferenceDuals = clamp(5, 8, conferenceOpponentIds.length);
  const confDualOpponents = shuffle(conferenceOpponentIds, rng).slice(0, numConferenceDuals);

  // Tournament count for the season: 4–8
  const totalTournaments = 4 + rng.next() % 5;
  // Recovery weeks: 1–2
  const numRecoveryWeeks = 1 + rng.next() % 2;

  const entries: CollegeScheduleEntry[] = [];
  const usedWeeks = new Set<number>();
  const tournamentWeeks: number[] = [];
  const recoveryWeeks: number[] = [];
  const dualWeeksByPhase: Record<SeasonPhase, number[]> = {
    early: [...EARLY_WEEKS],
    midseason: [...MIDSEASON_WEEKS],
    conference_stretch: [...CONFERENCE_STRETCH_WEEKS],
    postseason: [...POSTSEASON_WEEKS],
  };

  // Postseason: week 12 = conference tournament, 13 = recovery, 14 = optional recovery or bye
  entries.push({
    week: 12,
    type: 'conference',
    phase: 'postseason',
    blockType: 'tournament_weekend',
    eventFormat: 'big_tournament',
    tournamentName: 'Conference Championship',
    tournamentMatchCount: 2 + rng.next() % 4,
    isTravelWeek: true,
    starterParticipates: true,
  });
  usedWeeks.add(12);

  // Weeks 13–14 are always recovery (post-conference, pre-NCAA). Optionally 1–2 more in season.
  recoveryWeeks.push(13, 14);
  usedWeeks.add(13);
  usedWeeks.add(14);
  const candidateRecoveryWeeks = [...EARLY_WEEKS, ...MIDSEASON_WEEKS, ...CONFERENCE_STRETCH_WEEKS].filter(
    (w) => w !== 12 && !usedWeeks.has(w)
  );
  const shuffledRecovery = shuffle(candidateRecoveryWeeks, rng);
  for (let i = 0; i < numRecoveryWeeks - 1; i++) {
    const w = shuffledRecovery[i];
    if (usedWeeks.has(w)) continue;
    recoveryWeeks.push(w);
    usedWeeks.add(w);
  }
  recoveryWeeks.sort((a, b) => a - b);

  // Pick tournament weeks (4–8 total) from weeks 1–11 only (not 13–14)
  const tournamentCandidateWeeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((w) => !usedWeeks.has(w));
  const shuffledTournament = shuffle(tournamentCandidateWeeks, rng);
  const numTournamentsToPlace = Math.min(totalTournaments, shuffledTournament.length);
  for (let i = 0; i < numTournamentsToPlace; i++) {
    tournamentWeeks.push(shuffledTournament[i]);
    usedWeeks.add(shuffledTournament[i]);
  }
  tournamentWeeks.sort((a, b) => a - b);

  // Remaining weeks are dual weeks. Split into single dual vs travel dual weekend.
  const dualCandidateWeeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((w) => !usedWeeks.has(w));
  const numDualWeeks = dualCandidateWeeks.length;
  const numTravelDualWeeks = numDualWeeks >= 2 ? clamp(1, 3, rng.next() % 3 + 1) : 0;
  const travelDualWeeks = shuffle(dualCandidateWeeks, rng).slice(0, numTravelDualWeeks);
  const singleDualWeeks = dualCandidateWeeks.filter((w) => !travelDualWeeks.includes(w)).sort((a, b) => a - b);

  // Assign conference duals to conference_stretch weeks first (and maybe one midseason)
  const confWeeks = shuffle([...CONFERENCE_STRETCH_WEEKS], rng);
  const midWeeks = shuffle([...MIDSEASON_WEEKS], rng);
  const earlyWeeks = shuffle([...EARLY_WEEKS], rng);
  const conferenceDualAssignments: number[] = []; // weeks that get conference dual(s)
  let confIdx = 0;
  for (const w of confWeeks) {
    if (confIdx >= confDualOpponents.length) break;
    if (singleDualWeeks.includes(w)) {
      conferenceDualAssignments.push(w);
      confIdx += 1;
    } else if (travelDualWeeks.includes(w)) {
      conferenceDualAssignments.push(w, w);
      confIdx += 2;
    }
  }
  for (const w of midWeeks) {
    if (confIdx >= confDualOpponents.length) break;
    if (singleDualWeeks.includes(w)) {
      conferenceDualAssignments.push(w);
      confIdx += 1;
    }
  }

  // Build opponent name list for dual weeks (conference first, then non-conf)
  const schoolIdToName = Object.fromEntries(SCHOOLS.map((s) => [s.id, s.name]));
  let confOppIdx = 0;
  let nonConfOppIdx = 0;

  for (const w of singleDualWeeks) {
    const isConf = conferenceDualAssignments.includes(w);
    const oppId = isConf
      ? confDualOpponents[confOppIdx++ % confDualOpponents.length]
      : nonConfOpponents[nonConfOppIdx++ % nonConfOpponents.length];
    const phase = getPhase(w);
    entries.push({
      week: w,
      type: 'dual',
      phase,
      blockType: 'single_dual',
      eventFormat: 'dual',
      opponentName: schoolIdToName[oppId] ?? oppId,
      opponentNames: [schoolIdToName[oppId] ?? oppId],
      isConference: isConf,
      isTravelWeek: false,
    });
  }

  for (const w of travelDualWeeks) {
    const numDuals = 2;
    const opps: string[] = [];
    const requestedConf = conferenceDualAssignments.filter((x) => x === w).length;
    const confCount = Math.min(requestedConf, confDualOpponents.length - confOppIdx);
    for (let i = 0; i < confCount; i++) {
      opps.push(schoolIdToName[confDualOpponents[confOppIdx++]] ?? confDualOpponents[confOppIdx - 1]);
    }
    for (let i = opps.length; i < numDuals; i++) {
      opps.push(schoolIdToName[nonConfOpponents[nonConfOppIdx++ % nonConfOpponents.length]] ?? nonConfOpponents[(nonConfOppIdx - 1) % nonConfOpponents.length]);
    }
    const phase = getPhase(w);
    entries.push({
      week: w,
      type: 'dual',
      phase,
      blockType: 'travel_dual_weekend',
      eventFormat: opps.length >= 3 ? 'quad' : 'dual',
      opponentName: opps[0],
      opponentNames: opps,
      isConference: confCount > 0,
      isTravelWeek: true,
    });
  }

  for (const w of tournamentWeeks) {
    const phase = getPhase(w);
    const isBig = phase === 'midseason' && rng.float() < 0.4;
    const isInvite = !isBig && rng.float() < 0.5;
    const eventFormat: EventFormat = isBig ? 'big_tournament' : isInvite ? 'invite' : 'open';
    const tournamentName = isBig
      ? pick(BIG_TOURNAMENT_NAMES, rng)
      : isInvite
        ? pick(INVITE_NAMES, rng)
        : pick(OPEN_NAMES, rng);
    const matchCount = isBig ? 3 + rng.next() % 3 : 2 + rng.next() % 3; // 2–5
    const starterParticipates =
      eventFormat === 'open' ? shouldStarterParticipateInOpen(strategy, rng) : true;
    entries.push({
      week: w,
      type: 'tournament',
      phase,
      blockType: 'tournament_weekend',
      eventFormat,
      tournamentName,
      tournamentMatchCount: clamp(2, 5, matchCount),
      isTravelWeek: true,
      starterParticipates,
    });
  }

  for (const w of recoveryWeeks) {
    if (w === 12) continue; // already added conference
    entries.push({
      week: w,
      type: 'none',
      phase: w >= 12 ? 'postseason' : getPhase(w),
      blockType: 'recovery',
      isTravelWeek: false,
    });
  }

  // NCAA week
  entries.push({
    week: NCAA_WEEK,
    type: 'ncaa',
    phase: 'postseason',
    blockType: 'tournament_weekend',
    eventFormat: 'big_tournament',
    tournamentName: 'NCAA Championships',
    isTravelWeek: true,
    starterParticipates: true,
  });

  return entries.sort((a, b) => a.week - b.week);
}

/** Whether a given school id is a "powerhouse" (ranked opponents more common). */
export function isPowerhouse(schoolId: string): boolean {
  return POWERHOUSE_IDS.has(schoolId);
}
