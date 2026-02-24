/**
 * College wrestling conferences: membership for schedule generation.
 * Used to generate 5–8 conference duals and a conference tournament.
 */

export interface Conference {
  id: string;
  name: string;
  /** School ids in this conference (for duals and conference tournament). */
  schoolIds: string[];
}

/** Only school ids that exist in SCHOOLS (see schools.ts). */
export const CONFERENCES: Conference[] = [
  {
    id: 'big-ten',
    name: 'Big Ten',
    schoolIds: ['iowa', 'penn-state', 'ohio-state', 'michigan', 'nebraska', 'wisconsin', 'rutgers', 'minnesota'],
  },
  {
    id: 'big-12',
    name: 'Big 12',
    schoolIds: ['oklahoma-state', 'iowa-state', 'mizzou', 'nc-state', 'arizona-state', 'cornell'],
  },
  {
    id: 'acc',
    name: 'ACC',
    schoolIds: ['virginia-tech', 'virginia'],
  },
  {
    id: 'miaa-d2',
    name: 'MIAA (D2)',
    schoolIds: ['nebraska-kearney', 'central-oklahoma', 'pittsburg-state', 'lindenwood', 'mckendree', 'st-cloud'],
  },
  {
    id: 'iii-d3',
    name: 'D3 Conference',
    schoolIds: ['wartburg', 'augsburg', 'north-central', 'coe'],
  },
  {
    id: 'heart-naia',
    name: 'Heart (NAIA)',
    schoolIds: ['grand-view', 'life', 'doane'],
  },
  {
    id: 'njcaa-region',
    name: 'NJCAA Region',
    schoolIds: ['iowa-central', 'northeastern-ok', 'clackamas', 'western-wyoming'],
  },
];

/** Map school id -> conference id. Only schools in CONFERENCES are included. */
const SCHOOL_TO_CONF: Record<string, string> = {};
for (const c of CONFERENCES) {
  for (const sid of c.schoolIds) {
    SCHOOL_TO_CONF[sid] = c.id;
  }
}

/** Get conference id for a school (if any). Schools not in list are assigned a default conference by division. */
export function getConferenceIdForSchool(schoolId: string): string | null {
  return SCHOOL_TO_CONF[schoolId] ?? null;
}

export function getConferenceById(conferenceId: string): Conference | undefined {
  return CONFERENCES.find((c) => c.id === conferenceId);
}

/** Get other conference member school ids (excluding the given school). */
export function getConferenceOpponents(schoolId: string): string[] {
  const confId = getConferenceIdForSchool(schoolId);
  if (!confId) return [];
  const conf = getConferenceById(confId);
  if (!conf) return [];
  return conf.schoolIds.filter((id) => id !== schoolId);
}
