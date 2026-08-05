/**
 * NANP area code → IANA time zone, so a setter can see what time it is where
 * they're about to call. Dialing a California shop at 9am Eastern means ringing
 * their phone at 6am.
 *
 * US only, and deliberately incomplete: area codes that straddle two zones
 * (208 Idaho, 605 South Dakota, 812/930 Indiana, 906 Michigan, 308 Nebraska)
 * are omitted rather than guessed — an unknown code renders nothing, a wrong
 * one sends someone dialing at the wrong hour. Codes are grouped by zone so a
 * bad entry is easy to spot.
 */

const EASTERN = [
  // CT, DE, DC
  '203', '475', '860', '959', '302', '202',
  // FL (850 panhandle is Central — see below)
  '239', '305', '321', '352', '386', '407', '561', '689', '727', '754', '772',
  '786', '813', '863', '904', '941', '954',
  // GA
  '229', '404', '470', '478', '678', '706', '762', '770', '912', '943',
  // IN (Indianapolis + north-east)
  '260', '317', '463', '574', '765',
  // KY (eastern)
  '502', '606', '859',
  // ME, MD
  '207', '240', '301', '410', '443', '667',
  // MA
  '351', '413', '508', '617', '774', '781', '857', '978',
  // MI (lower peninsula)
  '231', '248', '269', '313', '517', '586', '616', '679', '734', '810', '947', '989',
  // NH, NJ
  '603', '201', '551', '609', '640', '732', '848', '856', '862', '908', '973',
  // NY
  '212', '315', '332', '347', '516', '518', '585', '607', '631', '646', '680',
  '716', '718', '838', '845', '914', '917', '929', '934',
  // NC
  '252', '336', '704', '743', '828', '910', '919', '980', '984',
  // OH
  '216', '220', '234', '326', '330', '380', '419', '440', '513', '567', '614', '740', '937',
  // PA
  '215', '223', '267', '272', '412', '445', '484', '570', '582', '610', '717',
  '724', '814', '835', '878',
  // RI, SC
  '401', '803', '843', '854', '864',
  // TN (eastern)
  '423', '865',
  // VT, VA
  '802', '276', '434', '540', '571', '703', '757', '804', '826', '948',
  // WV
  '304', '681',
];

const CENTRAL = [
  // AL
  '205', '251', '256', '334', '659', '938',
  // AR
  '479', '501', '870',
  // FL panhandle
  '850',
  // IL
  '217', '224', '309', '312', '331', '447', '464', '618', '630', '708', '730',
  '773', '779', '815', '847', '872',
  // IN (north-west / Gary)
  '219',
  // IA
  '319', '515', '563', '641', '712',
  // KS
  '316', '620', '785', '913',
  // KY (western)
  '270', '364',
  // LA
  '225', '318', '337', '504', '985',
  // MN
  '218', '320', '507', '612', '651', '763', '952',
  // MS
  '228', '601', '662', '769',
  // MO
  '314', '417', '557', '573', '636', '660', '816',
  // NE, ND
  '402', '531', '701',
  // OK
  '405', '539', '572', '580', '918',
  // TN (middle + west)
  '615', '629', '731', '901', '931',
  // TX (915 El Paso is Mountain — see below)
  '210', '214', '254', '281', '325', '346', '361', '409', '430', '432', '469',
  '512', '682', '713', '726', '737', '806', '817', '830', '832', '903', '936',
  '940', '945', '956', '972', '979',
  // WI
  '262', '274', '414', '534', '608', '715', '920',
];

const MOUNTAIN = [
  // CO
  '303', '719', '720', '970', '983',
  // MT, NM
  '406', '505', '575',
  // UT, WY
  '385', '435', '801', '307',
  // TX (El Paso)
  '915',
];

// Arizona skips DST, so it needs its own zone rather than Mountain.
const ARIZONA = ['480', '520', '602', '623', '928'];

const PACIFIC = [
  // CA
  '209', '213', '279', '310', '323', '341', '350', '408', '415', '424', '442',
  '510', '530', '559', '562', '619', '626', '628', '650', '657', '661', '669',
  '707', '714', '747', '760', '805', '818', '820', '831', '840', '858', '909',
  '916', '925', '949', '951',
  // NV
  '702', '725', '775',
  // OR
  '458', '503', '541', '971',
  // WA
  '206', '253', '360', '425', '509', '564',
];

const ZONE_BY_AREA_CODE: Record<string, string> = {};
const load = (codes: string[], zone: string) => {
  for (const c of codes) ZONE_BY_AREA_CODE[c] = zone;
};
load(EASTERN, 'America/New_York');
load(CENTRAL, 'America/Chicago');
load(MOUNTAIN, 'America/Denver');
load(ARIZONA, 'America/Phoenix');
load(PACIFIC, 'America/Los_Angeles');
load(['907'], 'America/Anchorage');
load(['808'], 'Pacific/Honolulu');

/** The IANA zone for a phone number, or null when we can't say confidently. */
export function timeZoneForPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  // Tolerate a leading country code on 11-digit US numbers.
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length < 10) return null;
  return ZONE_BY_AREA_CODE[national.slice(0, 3)] ?? null;
}

export type LocalTime = {
  /** e.g. "6:14 AM" */
  label: string;
  hour: number;
  /** Outside 8am–8pm local — don't dial. */
  offHours: boolean;
};

/**
 * Wall-clock time at the prospect's end. `now` is passed in (server-rendered)
 * so the value matches between server and client render.
 *
 * Returns null when the prospect shares `homeZone` with the studio — a setter
 * in Georgia calling a Georgia business doesn't need to be told their own
 * clock, and the off-hours warning only means something across zones.
 */
export function localTimeForPhone(
  phone: string | null | undefined,
  now: Date,
  homeZone?: string,
): LocalTime | null {
  const zone = timeZoneForPhone(phone);
  if (!zone) return null;
  if (homeZone && zone === homeZone) return null;
  try {
    const label = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(now);
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour: 'numeric',
        hour12: false,
      }).format(now),
    );
    return { label, hour, offHours: hour < 8 || hour >= 20 };
  } catch {
    return null;
  }
}
