/**
 * BitLife-style life popup events: training, academics, health, social, money/NIL, discipline, relationships.
 * Weighted and conditional (e.g. low energy → more health/sleep; high popularity → more media/NIL).
 */

import type { UnifiedState } from '@/engine/unified/types';
import type { LifePopup, LifePopupCategory, LifePopupChoice, LifePopupChoiceEffects } from '@/engine/unified/types';

function clamp(min: number, max: number, x: number): number {
  return Math.max(min, Math.min(max, x));
}

/** Event definition: condition returns weight multiplier (0 = skip). */
export interface LifePopupDef {
  id: string;
  category: LifePopupCategory;
  text: string;
  choices: LifePopupChoice[];
  baseWeight: number;
  condition: (s: UnifiedState) => number;
}

const EFFECT = (e: LifePopupChoiceEffects): LifePopupChoice['effects'] => e;

/** Relationship is in trouble: love-interest meter low or romantic partner level low. */
function isRelationshipLow(s: UnifiedState): boolean {
  const meter = s.relationshipMeter ?? 50;
  const status = s.relationshipStatus;
  const romantic = (s.relationships ?? []).find((r) => r.kind === 'romantic');
  const romanticLevel = romantic?.level ?? 60;
  if ((status === 'DATING' || status === 'PARTNER') && meter < 40) return true;
  if (romantic && romanticLevel < 40) return true;
  return false;
}

/** Relationship is healthy: meter or romantic level decent. */
function isRelationshipOkay(s: UnifiedState): boolean {
  const meter = s.relationshipMeter ?? 50;
  const romantic = (s.relationships ?? []).find((r) => r.kind === 'romantic');
  const romanticLevel = romantic?.level ?? 60;
  if ((s.relationshipStatus === 'DATING' || s.relationshipStatus === 'PARTNER') && meter >= 50) return true;
  if (romantic && romanticLevel >= 50) return true;
  return false;
}

export const LIFE_POPUP_DEFS: LifePopupDef[] = [
  // ─── Training / performance ─────────────────────────────────────────────
  {
    id: 'popup_sore_morning',
    category: 'training_performance',
    text: "You wake up sore. Yesterday's practice was brutal.",
    baseWeight: 1.2,
    condition: (s) => (s.energy ?? 100) < 60 ? 1.5 : 1,
    choices: [
      { label: 'Push through', effects: EFFECT({ energy: -8, performanceMult: 0.05, injuryRiskMult: 0.1 }) },
      { label: 'Light session', effects: EFFECT({ energy: -3, health: 2 }) },
      { label: 'Skip and recover', effects: EFFECT({ energy: 12, health: 4, coachTrust: -2 }) },
    ],
  },
  {
    id: 'popup_coach_feedback',
    category: 'training_performance',
    text: "Coach pulls you aside. 'You're looking sharp this week.'",
    baseWeight: 1,
    condition: () => 1,
    choices: [
      { label: 'Thank him and ask for tips', effects: EFFECT({ coachTrust: 4, stress: -2 }) },
      { label: 'Nod and get back to work', effects: EFFECT({ coachTrust: 1 }) },
      { label: "Ask about lineup", effects: EFFECT({ coachTrust: 2, stress: 1 }) },
    ],
  },
  {
    id: 'popup_teammate_rival',
    category: 'training_performance',
    text: 'A teammate is gunning for your spot. He goes hard every drill.',
    baseWeight: 0.9,
    condition: (s) => (s.coachTrust ?? 50) > 40 ? 1.2 : 0.8,
    choices: [
      { label: 'Match his intensity', effects: EFFECT({ energy: -10, performanceMult: 0.08, coachTrust: 3 }) },
      { label: 'Stay steady, don’t get hurt', effects: EFFECT({ energy: -4, injuryRiskMult: -0.05 }) },
      { label: 'Talk to coach', effects: EFFECT({ stress: -3, coachTrust: -1 }) },
    ],
  },
  // ─── School / academics ──────────────────────────────────────────────────
  {
    id: 'popup_midterm_warning',
    category: 'school_academics',
    text: "A professor mentions you're borderline in the class. Eligibility could be at risk.",
    baseWeight: 1.1,
    condition: (s) => (s.grades ?? 75) < 72 ? 1.8 : (s.grades ?? 75) < 80 ? 1 : 0.3,
    choices: [
      { label: 'Hit the books this week', effects: EFFECT({ grades: 5, energy: -6, stress: 2 }) },
      { label: 'Get a tutor', effects: EFFECT({ grades: 6, money: -80 }) },
      { label: 'Talk to the professor', effects: EFFECT({ grades: 2, stress: -2 }) },
    ],
  },
  {
    id: 'popup_study_group',
    category: 'school_academics',
    text: 'Teammates invite you to a study group before the exam.',
    baseWeight: 1,
    condition: (s) => (s.grades ?? 75) < 85 ? 1.2 : 0.7,
    choices: [
      { label: 'Join them', effects: EFFECT({ grades: 4, social: 3, energy: -4 }) },
      { label: 'Study alone', effects: EFFECT({ grades: 3, energy: -5 }) },
      { label: 'Skip and rest', effects: EFFECT({ energy: 8, grades: -2 }) },
    ],
  },
  // ─── Health / recovery / injury ───────────────────────────────────────────
  {
    id: 'popup_sleep_deprived',
    category: 'health_recovery',
    text: "You've been running on little sleep. Body feels heavy.",
    baseWeight: 1.3,
    condition: (s) => (s.energy ?? 100) < 45 ? 1.6 : (s.energy ?? 100) < 65 ? 1.2 : 0.6,
    choices: [
      { label: 'Crash early tonight', effects: EFFECT({ energy: 15, health: 3 }) },
      { label: 'Power through', effects: EFFECT({ energy: -5, injuryRiskMult: 0.15 }) },
      { label: 'Nap and light practice', effects: EFFECT({ energy: 6, health: 1 }) },
    ],
  },
  {
    id: 'popup_tweaked_ankle',
    category: 'health_recovery',
    text: 'You tweaked your ankle in practice. It’s a little swollen.',
    baseWeight: 0.9,
    condition: (s) => (s.health ?? 100) < 80 ? 1.3 : 1,
    choices: [
      { label: 'Ice and rest', effects: EFFECT({ health: 4, energy: 5 }) },
      { label: 'Tape it and go', effects: EFFECT({ injuryRiskMult: 0.2, performanceMult: -0.05 }) },
      { label: 'See the trainer', effects: EFFECT({ health: 6, energy: 2 }) },
    ],
  },
  {
    id: 'popup_flu_season',
    category: 'health_recovery',
    text: 'Half the team is sick. You feel a scratchy throat.',
    baseWeight: 0.8,
    condition: () => 1,
    choices: [
      { label: 'Rest and hydrate', effects: EFFECT({ health: 5, energy: 8 }) },
      { label: 'Practice anyway', effects: EFFECT({ health: -4, energy: -8 }) },
      { label: 'Load up on vitamins', effects: EFFECT({ health: 2, money: -15 }) },
    ],
  },
  // ─── Social / team ───────────────────────────────────────────────────────
  {
    id: 'popup_team_dinner',
    category: 'social_team',
    text: 'The team is doing a dinner. You’re invited.',
    baseWeight: 1,
    condition: () => 1,
    choices: [
      { label: 'Go and bond', effects: EFFECT({ social: 5, popularity: 3, happiness: 4 }) },
      { label: 'Skip and recover', effects: EFFECT({ energy: 6, social: -2 }) },
      { label: 'Show up briefly', effects: EFFECT({ social: 2, popularity: 1 }) },
    ],
  },
  {
    id: 'popup_media_request',
    category: 'social_team',
    text: 'Student paper wants a quick quote about the season.',
    baseWeight: 0.9,
    condition: (s) => (s.popularity ?? 50) > 55 ? 1.4 : (s.popularity ?? 50) > 40 ? 1 : 0.6,
    choices: [
      { label: 'Give a good quote', effects: EFFECT({ popularity: 5, coachTrust: 2 }) },
      { label: 'Decline politely', effects: EFFECT({ stress: -1 }) },
      { label: 'Say something bold', effects: EFFECT({ popularity: 8, coachTrust: -3 }) },
    ],
  },
  // ─── Money / NIL ──────────────────────────────────────────────────────────
  {
    id: 'popup_nil_appearance',
    category: 'money_nil',
    text: 'A local business wants you to do a short promo for a small NIL deal.',
    baseWeight: 0.85,
    condition: (s) => (s.popularity ?? 50) > 50 && (s.collegeName != null) ? 1.3 : (s.collegeName != null) ? 0.8 : 0,
    choices: [
      { label: 'Do it', effects: EFFECT({ money: 120, energy: -4 }) },
      { label: 'Pass', effects: EFFECT({ energy: 2 }) },
      { label: 'Negotiate', effects: EFFECT({ money: 80, stress: 2 }) },
    ],
  },
  {
    id: 'popup_broke_week',
    category: 'money_nil',
    text: "Your account is tighter than usual. You're watching every dollar.",
    baseWeight: 1,
    condition: (s) => (s.money ?? 0) < 200 ? 1.5 : (s.money ?? 0) < 500 ? 1 : 0.4,
    choices: [
      { label: 'Cut nonessentials', effects: EFFECT({ stress: 2 }) },
      { label: 'Pick up a shift', effects: EFFECT({ money: 180, energy: -12 }) },
      { label: 'Borrow from a friend', effects: EFFECT({ money: 100, social: -3 }) },
    ],
  },
  // ─── Discipline ──────────────────────────────────────────────────────────
  {
    id: 'popup_curfew_risk',
    category: 'discipline',
    text: "Teammates want to go out late. Coach has a curfew.",
    baseWeight: 0.9,
    condition: () => 1,
    choices: [
      { label: 'Stay in', effects: EFFECT({ coachTrust: 2, energy: 5 }) },
      { label: 'Go out, be back early', effects: EFFECT({ social: 4, energy: -6 }) },
      { label: 'Go out and risk it', effects: EFFECT({ social: 6, coachTrust: -8, stress: 5 }) },
    ],
  },
  {
    id: 'popup_weight_make',
    category: 'discipline',
    text: "You're a pound over. Weigh-in is tomorrow.",
    baseWeight: 1,
    condition: () => 1,
    choices: [
      { label: 'Cut properly', effects: EFFECT({ energy: -6, stress: 3 }) },
      { label: 'Sweat it out', effects: EFFECT({ energy: -10, health: -2 }) },
      { label: 'Accept backup this week', effects: EFFECT({ coachTrust: -4, energy: 5 }) },
    ],
  },
  // ─── Relationships (generic / optional love interest) ─────────────────────
  {
    id: 'popup_friend_stress',
    category: 'relationships',
    text: 'A close friend is going through a rough patch and needs someone to talk to.',
    baseWeight: 1,
    condition: () => 1,
    choices: [
      { label: 'Be there for them', effects: EFFECT({ social: 4, stress: 2, energy: -3 }) },
      { label: 'Send a quick message', effects: EFFECT({ social: 1 }) },
      { label: "You're too busy", effects: EFFECT({ social: -4, stress: -1 }) },
    ],
  },
  {
    id: 'popup_meet_girlfriend',
    category: 'relationships',
    text: "You meet someone at a party. She's interested in getting to know you.",
    baseWeight: 0.85,
    condition: (s) => {
      const hasRomantic = (s.relationships ?? []).some((r) => r.kind === 'romantic') || s.relationship != null;
      return hasRomantic ? 0 : 1.2;
    },
    choices: [
      { label: 'Ask her out', effects: EFFECT({ social: 3, happiness: 5 }) },
      { label: 'Just friends', effects: EFFECT({ social: 2 }) },
      { label: 'Politely decline', effects: EFFECT({}) },
    ],
  },
  {
    id: 'popup_love_interest_meet',
    category: 'relationships',
    text: "Someone new catches your eye at a campus event. They smile at you.",
    baseWeight: 0.7,
    condition: (s) => (s.allowRelationshipEvents && (s.relationshipStatus === 'NONE' || s.relationshipStatus === undefined)) ? 1.5 : 0,
    choices: [
      { label: 'Say hi and chat', effects: EFFECT({ relationshipMeter: 15, chemistry: 5, social: 2 }) },
      { label: 'Smile back, walk over', effects: EFFECT({ relationshipMeter: 10, chemistry: 3 }) },
      { label: 'Keep to yourself', effects: EFFECT({}) },
    ],
  },
  {
    id: 'popup_drama_argument',
    category: 'relationships',
    text: "Things get heated with your partner. You both said things you didn't mean.",
    baseWeight: 0.6,
    condition: (s) => {
      if (!s.allowRelationshipEvents) return 0;
      const inRel = s.relationshipStatus === 'DATING' || s.relationshipStatus === 'PARTNER';
      const hasRomantic = (s.relationships ?? []).some((r) => r.kind === 'romantic');
      if (!inRel && !hasRomantic) return 0;
      const meter = s.relationshipMeter ?? 50;
      const romantic = (s.relationships ?? []).find((r) => r.kind === 'romantic');
      const level = romantic?.level ?? 60;
      const low = meter < 45 || (romantic != null && level < 50);
      if (meter < 35 || (romantic != null && level < 35)) return 2.2;
      if (low) return 1.8;
      if (meter < 70) return 1.4;
      return 0;
    },
    choices: [
      { label: 'Apologize and talk', effects: EFFECT({ relationshipMeter: 8, stress: -3 }) },
      { label: 'Give space', effects: EFFECT({ relationshipMeter: -5, stress: -2 }) },
      { label: 'Double down', effects: EFFECT({ relationshipMeter: -15, stress: 5 }) },
    ],
  },
  {
    id: 'popup_relationship_on_rocks',
    category: 'relationships',
    text: "Things have been rough. Your partner seems checked out—you're not sure where you stand.",
    baseWeight: 0.7,
    condition: (s) => (isRelationshipLow(s) ? 2.0 : 0),
    choices: [
      { label: 'Fight for it—show you care', effects: EFFECT({ relationshipMeter: 12, stress: -4, energy: -5 }) },
      { label: 'Have an honest talk', effects: EFFECT({ relationshipMeter: 5, stress: 2 }) },
      { label: 'Pull back and see what happens', effects: EFFECT({ relationshipMeter: -10, stress: -2 }) },
    ],
  },
  {
    id: 'popup_support_partner',
    category: 'relationships',
    text: "Your partner shows up to support you at practice. It means a lot.",
    baseWeight: 0.65,
    condition: (s) => {
      if (!s.allowRelationshipEvents && !(s.relationships ?? []).some((r) => r.kind === 'romantic')) return 0;
      if (isRelationshipLow(s)) return 0.25;
      if (isRelationshipOkay(s)) return 1.5;
      return 0.8;
    },
    choices: [
      { label: 'Thank them and focus', effects: EFFECT({ relationshipMeter: 5, performanceMult: 0.03 }) },
      { label: 'Spend time after', effects: EFFECT({ relationshipMeter: 10, energy: -4 }) },
      { label: 'Wave and get to work', effects: EFFECT({ relationshipMeter: 2 }) },
    ],
  },

  // ─── More events: grades ───────────────────────────────────────────────────
  {
    id: 'popup_professor_office_hours',
    category: 'school_academics',
    text: "Your professor has office hours. You're slipping in the class.",
    baseWeight: 0.9,
    condition: (s) => (s.grades ?? 75) < 78 ? 1.5 : (s.grades ?? 75) < 85 ? 0.9 : 0.3,
    choices: [
      { label: 'Go and get help', effects: EFFECT({ grades: 6, energy: -3 }) },
      { label: 'Email questions instead', effects: EFFECT({ grades: 3, stress: -1 }) },
      { label: 'Skip and hope for the best', effects: EFFECT({ grades: -2 }) },
    ],
  },
  {
    id: 'popup_academic_probation_warning',
    category: 'school_academics',
    text: "An advisor warns you: one more bad semester and you're on academic probation. Eligibility at risk.",
    baseWeight: 0.7,
    condition: (s) => (s.grades ?? 75) < 70 ? 1.8 : (s.grades ?? 75) < 75 ? 1.2 : 0,
    choices: [
      { label: 'Drop a nonessential and focus', effects: EFFECT({ grades: 8, stress: -4, energy: 2 }) },
      { label: 'Promise to turn it around', effects: EFFECT({ grades: 2, stress: 2 }) },
      { label: 'Get a tutor for every class', effects: EFFECT({ grades: 10, money: -150, energy: -5 }) },
    ],
  },
  {
    id: 'popup_deans_list_chance',
    category: 'school_academics',
    text: "You're close to dean's list this term. One more push could do it.",
    baseWeight: 0.75,
    condition: (s) => (s.grades ?? 75) >= 88 && (s.grades ?? 75) < 95 ? 1.4 : 0.4,
    choices: [
      { label: 'Go all in on finals', effects: EFFECT({ grades: 5, energy: -8 }) },
      { label: 'Stay the course', effects: EFFECT({ grades: 2 }) },
      { label: 'Prioritize wrestling', effects: EFFECT({ grades: -3, performanceMult: 0.05 }) },
    ],
  },
  {
    id: 'popup_group_project_conflict',
    category: 'school_academics',
    text: "Your group project partner isn't pulling weight. The deadline is close.",
    baseWeight: 0.85,
    condition: (s) => (s.grades ?? 75) > 70 ? 1.1 : 0.6,
    choices: [
      { label: 'Pick up the slack', effects: EFFECT({ grades: 4, energy: -10, stress: 3 }) },
      { label: 'Confront them', effects: EFFECT({ grades: 2, stress: 4 }) },
      { label: 'Talk to the professor', effects: EFFECT({ grades: 1, stress: 2 }) },
    ],
  },

  // ─── More events: relationship level (meter, status, chemistry) ────────────
  {
    id: 'popup_date_night_idea',
    category: 'relationships',
    text: "Your partner suggests a proper date night. You've both been busy.",
    baseWeight: 0.7,
    condition: (s) => (isRelationshipOkay(s) && !isRelationshipLow(s) && ((s.relationshipMeter ?? 0) >= 55 || ((s.relationships ?? []).find((r) => r.kind === 'romantic')?.level ?? 0) >= 55)) ? 1.3 : 0,
    choices: [
      { label: 'Plan something special', effects: EFFECT({ relationshipMeter: 12, chemistry: 3, money: -40, energy: -4 }) },
      { label: 'Low-key night in', effects: EFFECT({ relationshipMeter: 8, energy: -2 }) },
      { label: 'Maybe next week', effects: EFFECT({ relationshipMeter: -5 }) },
    ],
  },
  {
    id: 'popup_jealousy_rumor',
    category: 'relationships',
    text: "Someone told your partner they saw you with another person. It wasn't like that, but they're upset.",
    baseWeight: 0.5,
    condition: (s) => {
      const inRel = (s.relationshipStatus === 'DATING' || s.relationshipStatus === 'PARTNER') || (s.relationships ?? []).some((r) => r.kind === 'romantic');
      if (!inRel) return 0;
      const meter = s.relationshipMeter ?? 50;
      const romantic = (s.relationships ?? []).find((r) => r.kind === 'romantic');
      const level = romantic?.level ?? 60;
      if (meter < 40 || (romantic != null && level < 40)) return 2.0;
      if (meter < 65) return 1.5;
      return 0;
    },
    choices: [
      { label: 'Explain and reassure', effects: EFFECT({ relationshipMeter: 5, stress: -2 }) },
      { label: 'Get defensive', effects: EFFECT({ relationshipMeter: -12, stress: 4 }) },
      { label: 'Suggest time together', effects: EFFECT({ relationshipMeter: 8, energy: -5 }) },
    ],
  },
  {
    id: 'popup_meet_the_family',
    category: 'relationships',
    text: "Your partner wants you to meet their family. It's a big step.",
    baseWeight: 0.55,
    condition: (s) => {
      if (!isRelationshipOkay(s)) return 0;
      const meter = s.relationshipMeter ?? 0;
      const romanticLevel = (s.relationships ?? []).find((r) => r.kind === 'romantic')?.level ?? 0;
      return (meter >= 75 || romanticLevel >= 75) ? 1.4 : 0;
    },
    choices: [
      { label: "I'd be honored", effects: EFFECT({ relationshipMeter: 10, chemistry: 5, stress: 2 }) },
      { label: "Not yet—I'm nervous", effects: EFFECT({ relationshipMeter: -3 }) },
      { label: 'Keep it casual', effects: EFFECT({ relationshipMeter: 2 }) },
    ],
  },
  {
    id: 'popup_relationship_milestone',
    category: 'relationships',
    text: "Things feel really good between you two. You're thinking about the future.",
    baseWeight: 0.5,
    condition: (s) => (s.allowRelationshipEvents && (s.relationshipMeter ?? 0) >= 85 && (s.relationshipStatus === 'DATING' || s.relationshipStatus === 'PARTNER')) ? 1.2 : 0,
    choices: [
      { label: 'Share your feelings', effects: EFFECT({ relationshipMeter: 5, chemistry: 4, happiness: 6 }) },
      { label: 'Take it slow', effects: EFFECT({ relationshipMeter: 2 }) },
      { label: 'Change the subject', effects: EFFECT({ relationshipMeter: -8 }) },
    ],
  },
  {
    id: 'popup_talking_stage_fizzle',
    category: 'relationships',
    text: "You've been talking for a while but it's going nowhere. Do you push for a real date or let it go?",
    baseWeight: 0.6,
    condition: (s) => (s.allowRelationshipEvents && s.relationshipStatus === 'TALKING' && (s.relationshipMeter ?? 0) >= 25 && (s.relationshipMeter ?? 0) < 55) ? 1.3 : 0,
    choices: [
      { label: 'Ask them out properly', effects: EFFECT({ relationshipMeter: 15, chemistry: 5 }) },
      { label: 'Back off', effects: EFFECT({ relationshipMeter: -20 }) },
      { label: 'Keep texting', effects: EFFECT({ relationshipMeter: 2 }) },
    ],
  },

  // ─── More events: injury risk / health / recovery ─────────────────────────
  {
    id: 'popup_trainer_warning',
    category: 'health_recovery',
    text: "The trainer pulls you aside. 'Your body's sending signals. We need to manage load.'",
    baseWeight: 0.85,
    condition: (s) => (s.health ?? 100) < 75 || (s.energy ?? 100) < 40 ? 1.6 : (s.health ?? 100) < 85 ? 1.2 : 0.5,
    choices: [
      { label: 'Listen and scale back', effects: EFFECT({ health: 6, energy: 8, injuryRiskMult: -0.1 }) },
      { label: "I'm fine", effects: EFFECT({ injuryRiskMult: 0.2, coachTrust: -2 }) },
      { label: 'Extra rehab only', effects: EFFECT({ health: 4, energy: 2 }) },
    ],
  },
  {
    id: 'popup_overuse_nag',
    category: 'health_recovery',
    text: "Your knee has been nagging you. Too many hard sessions in a row.",
    baseWeight: 0.8,
    condition: (s) => (s.energy ?? 100) < 50 && (s.stress ?? 50) > 55 ? 1.5 : (s.energy ?? 100) < 65 ? 1 : 0.4,
    choices: [
      { label: 'Rest it', effects: EFFECT({ health: 5, energy: 10, injuryRiskMult: -0.15 }) },
      { label: 'Tape and go', effects: EFFECT({ injuryRiskMult: 0.25, performanceMult: -0.03 }) },
      { label: 'See the trainer', effects: EFFECT({ health: 4, money: -20 }) },
    ],
  },
  {
    id: 'popup_concussion_protocol',
    category: 'health_recovery',
    text: "You got dinged in practice. Coach says follow concussion protocol—no contact until cleared.",
    baseWeight: 0.5,
    condition: (s) => (s.health ?? 100) < 80 ? 1.2 : 0.8,
    choices: [
      { label: 'Follow protocol strictly', effects: EFFECT({ health: 8, energy: 5, coachTrust: 3 }) },
      { label: 'Push to get back sooner', effects: EFFECT({ health: -3, injuryRiskMult: 0.3 }) },
      { label: 'Use the time to study', effects: EFFECT({ health: 4, grades: 4 }) },
    ],
  },
  {
    id: 'popup_rehab_progress',
    category: 'health_recovery',
    text: "You've been doing your rehab. The trainer says you're ahead of schedule.",
    baseWeight: 0.65,
    condition: (s) => (s.health ?? 100) >= 60 && (s.health ?? 100) < 90 ? 1.2 : 0.5,
    choices: [
      { label: 'Stay patient', effects: EFFECT({ health: 5, injuryRiskMult: -0.08 }) },
      { label: 'Add a little more', effects: EFFECT({ health: 2, injuryRiskMult: 0.05 }) },
      { label: 'Ask about return date', effects: EFFECT({ stress: -2 }) },
    ],
  },

  // ─── More events: finances ────────────────────────────────────────────────
  {
    id: 'popup_bill_surprise',
    category: 'money_nil',
    text: "An unexpected bill shows up—books, fees, or a ticket you forgot.",
    baseWeight: 0.9,
    condition: (s) => (s.money ?? 0) > 100 ? 1.2 : (s.money ?? 0) > 50 ? 1.5 : 0.6,
    choices: [
      { label: 'Pay it', effects: EFFECT({ money: -75, stress: 1 }) },
      { label: 'Pay in installments', effects: EFFECT({ money: -30, stress: 3 }) },
      { label: 'Ask parents for help', effects: EFFECT({ money: 50, stress: -2 }) },
    ],
  },
  {
    id: 'popup_car_repair',
    category: 'money_nil',
    text: "Your car needs a repair. The estimate isn't pretty.",
    baseWeight: 0.7,
    condition: (s) => (s.money ?? 0) < 800 ? 1.4 : (s.money ?? 0) < 1500 ? 1.1 : 0.7,
    choices: [
      { label: 'Get it fixed', effects: EFFECT({ money: -200, stress: -2 }) },
      { label: 'Patch it for now', effects: EFFECT({ money: -60 }) },
      { label: 'Skip driving for a bit', effects: EFFECT({ energy: -2, stress: 2 }) },
    ],
  },
  {
    id: 'popup_rent_increase',
    category: 'money_nil',
    text: "Your landlord is raising rent next month. Budget is going to be tight.",
    baseWeight: 0.6,
    condition: (s) => (s.collegeName != null && (s.money ?? 0) < 600) ? 1.5 : (s.collegeName != null) ? 0.9 : 0,
    choices: [
      { label: 'Cut other spending', effects: EFFECT({ stress: 3 }) },
      { label: 'Pick up extra work', effects: EFFECT({ money: 120, energy: -8 }) },
      { label: 'Look for a cheaper place', effects: EFFECT({ stress: 4 }) },
    ],
  },
  {
    id: 'popup_windfall_side_gig',
    category: 'money_nil',
    text: "A one-off gig comes up—campus event, local ad, or helping a friend's business.",
    baseWeight: 0.75,
    condition: (s) => (s.money ?? 0) < 400 ? 1.3 : (s.popularity ?? 50) > 45 ? 1 : 0.6,
    choices: [
      { label: 'Take it', effects: EFFECT({ money: 140, energy: -6 }) },
      { label: 'Pass—focus on wrestling', effects: EFFECT({ energy: 3 }) },
      { label: 'Negotiate for more', effects: EFFECT({ money: 95, stress: 2 }) },
    ],
  },
  {
    id: 'popup_stipend_delay',
    category: 'money_nil',
    text: "The athletic department says your stipend will be a week late. You're short until then.",
    baseWeight: 0.55,
    condition: (s) => (s.collegeName != null && (s.money ?? 0) < 300) ? 1.6 : (s.collegeName != null) ? 0.8 : 0,
    choices: [
      { label: 'Tighten the belt', effects: EFFECT({ stress: 4 }) },
      { label: 'Borrow from a teammate', effects: EFFECT({ money: 80, social: -1 }) },
      { label: 'Complain to compliance', effects: EFFECT({ stress: -1, coachTrust: -1 }) },
    ],
  },

  // ─── More: discipline + coach trust ───────────────────────────────────────
  {
    id: 'popup_skip_class_catch',
    category: 'discipline',
    text: "Coach heard you skipped a class. He's not happy.",
    baseWeight: 0.6,
    condition: (s) => (s.grades ?? 75) < 80 && (s.coachTrust ?? 50) > 30 ? 1.3 : 0.5,
    choices: [
      { label: 'Own it and promise better', effects: EFFECT({ coachTrust: -2, grades: 2 }) },
      { label: "It was a one-time thing", effects: EFFECT({ coachTrust: -6 }) },
      { label: 'Show him your plan', effects: EFFECT({ coachTrust: 1, stress: 2 }) },
    ],
  },
  {
    id: 'popup_captain_chat',
    category: 'social_team',
    text: "A team captain pulls you aside. 'We need you to step up—in the room and off the mat.'",
    baseWeight: 0.65,
    condition: (s) => (s.coachTrust ?? 50) >= 45 && (s.popularity ?? 50) < 60 ? 1.2 : 0.7,
    choices: [
      { label: "I'm in", effects: EFFECT({ coachTrust: 4, popularity: 3 }) },
      { label: 'Focus on my own game', effects: EFFECT({ coachTrust: -1 }) },
      { label: 'Ask what they need', effects: EFFECT({ coachTrust: 3, social: 4 }) },
    ],
  },
];

/** Pick one event from defs with weighted selection; condition multiplies weight. */
function pickWeighted(
  defs: LifePopupDef[],
  state: UnifiedState,
  rng: { next: () => number; float: () => number }
): LifePopupDef | null {
  const weighted = defs
    .map((d) => ({ def: d, w: d.baseWeight * d.condition(state) }))
    .filter((x) => x.w > 0);
  if (weighted.length === 0) return null;
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = rng.float() * total;
  for (const { def, w } of weighted) {
    r -= w;
    if (r <= 0) return def;
  }
  return weighted[weighted.length - 1].def;
}

/** Generate 2–5 life popups for the week. */
export function generateLifePopups(
  state: UnifiedState,
  rng: { next: () => number; float: () => number },
  count: number
): LifePopup[] {
  const out: LifePopup[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    const def = pickWeighted(LIFE_POPUP_DEFS, state, rng);
    if (!def || used.has(def.id)) continue;
    used.add(def.id);
    out.push({
      id: def.id + '_' + state.week + '_' + state.year + '_' + rng.next(),
      category: def.category,
      text: def.text,
      choices: def.choices.map((c) => ({ label: c.label, effects: { ...c.effects } })),
    });
  }
  return out;
}
