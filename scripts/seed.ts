/**
 * Seed the database with a demo marketplace.
 *
 * The cast and the numbers come from the design mockups — Nadia Rahim, The
 * Amber Quartet, Kael Voss, The Penthouse's NYE booking — so the running app
 * and the designs tell the same story. Every password is `password`.
 *
 * Run with `npm run seed`, or `npm run reset` to start from an empty database.
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, migrate } from '../src/db/client';
import * as repo from '../src/db/repo';
import { hashPassword } from '../src/lib/auth-core';
import { newId, slugify } from '../src/db/ids';
import { sendInquiry, transitionInquiry, postMessage, leaveReview } from '../src/services/booking';
import { addDays } from '../src/domain/dates';
import type { ContractLength, TimeBlock, Weekday } from '../src/domain/types';

const DB_PATH = process.env.ENCORE_DB_PATH ?? join(process.cwd(), 'data', 'encore.db');

// Wipe first so seeding is repeatable rather than additive.
for (const suffix of ['', '-wal', '-shm']) {
  try {
    rmSync(`${DB_PATH}${suffix}`);
  } catch {
    /* nothing to remove */
  }
}

const db = openDatabase(DB_PATH);
migrate(db);

const PINK = '#ff5fa2';
const AMBER = '#ffb43a';
const GREEN = '#3ddc84';
const VIOLET = '#a97bff';
const CORAL = '#ff7a59';
const BLUE = '#5fb0ff';

const now = new Date();
const TODAY = now.toISOString().slice(0, 10);
/** The demo calendar centres on the next 31 December, as the designs do. */
const NEXT_NYE = (() => {
  const thisYear = `${now.getUTCFullYear()}-12-31`;
  return thisYear >= TODAY ? thisYear : `${now.getUTCFullYear() + 1}-12-31`;
})();

// ------------------------------------------------------------------ cities --

const cities = [
  { id: 'dubai', name: 'Dubai', country: 'AE', lat: 25.2048, lng: 55.2708 },
  { id: 'abu-dhabi', name: 'Abu Dhabi', country: 'AE', lat: 24.4539, lng: 54.3773 },
  { id: 'sharjah', name: 'Sharjah', country: 'AE', lat: 25.3463, lng: 55.4209 },
  { id: 'doha', name: 'Doha', country: 'QA', lat: 25.2854, lng: 51.531 },
  { id: 'riyadh', name: 'Riyadh', country: 'SA', lat: 24.7136, lng: 46.6753 },
  { id: 'london', name: 'London', country: 'GB', lat: 51.5072, lng: -0.1276 },
  { id: 'beirut', name: 'Beirut', country: 'LB', lat: 33.8938, lng: 35.5018 },
  { id: 'mumbai', name: 'Mumbai', country: 'IN', lat: 19.076, lng: 72.8777 },
];
const insertCity = db.prepare('INSERT INTO cities (id, name, country, lat, lng) VALUES (?, ?, ?, ?, ?)');
for (const c of cities) insertCity.run(c.id, c.name, c.country, c.lat, c.lng);

// -------------------------------------------------------------- categories --

const insertCategory = db.prepare(
  'INSERT INTO categories (id, parent_id, slug, label, accent, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
);

interface CategorySeed {
  slug: string;
  label: string;
  accent: string;
  genres: string[];
}

const taxonomy: CategorySeed[] = [
  { slug: 'singer', label: 'Singer', accent: PINK, genres: ['Neo-soul', 'Pop', 'Jazz vocal', 'Arabic', 'R&B'] },
  { slug: 'band', label: 'Band', accent: CORAL, genres: ['Live cover band', 'Jazz ensemble', 'Brass', 'Funk'] },
  { slug: 'magician', label: 'Magician', accent: GREEN, genres: ['Close-up magic', 'Stage illusion', 'Mentalism'] },
  { slug: 'instrumentalist', label: 'Instrumentalist', accent: BLUE, genres: ['Piano', 'Cello', 'Violin', 'Saxophone', 'Strings'] },
  { slug: 'dj', label: 'DJ', accent: VIOLET, genres: ['House', 'Deep house', 'Open format', 'Afro house'] },
  { slug: 'dancer', label: 'Dancer', accent: PINK, genres: ['Contemporary', 'Latin', 'Traditional'] },
  { slug: 'comedian', label: 'Comedian', accent: AMBER, genres: ['Stand-up', 'Improv'] },
  { slug: 'other', label: 'Other', accent: '#8e8d96', genres: ['Speciality act', 'Circus'] },
];

const categoryIds = new Map<string, string>();
const genreIds = new Map<string, string>();

taxonomy.forEach((cat, i) => {
  const id = `cat_${cat.slug}`;
  categoryIds.set(cat.slug, id);
  insertCategory.run(id, null, cat.slug, cat.label, cat.accent, i);
  cat.genres.forEach((g, j) => {
    const gid = `gen_${cat.slug}_${slugify(g)}`;
    genreIds.set(g.toLowerCase(), gid);
    insertCategory.run(gid, id, slugify(g), g, cat.accent, j);
  });
});

// ------------------------------------------------------------ entertainers --

interface ActSeed {
  name: string;
  email: string;
  shortBio: string;
  fullBio: string;
  category: string;
  genres: string[];
  city: string;
  origin: string;
  accent: string;
  teamSize: number;
  languages: string[];
  provides: string;
  requires: string;
  travelCities?: string[];
  travelRadiusKm?: number;
  shortTerm?: boolean;
  longTerm?: boolean;
  relocate?: boolean;
  contractLengths?: ContractLength[];
  baseHourly: number;
  minimumHours: number;
  rules: Array<[Weekday, TimeBlock, number, number?]>;
  specials?: Array<{ offsetFromNye?: number; date?: string; label: string; hourly: number; min?: number }>;
  residency?: { weekly?: number; monthly?: number; days: number; extraDay?: number };
  status?: 'draft' | 'pending_review' | 'live' | 'suspended';
  verified?: boolean;
  featured?: boolean;
  awards?: Array<{ title: string; issuer: string; year: number }>;
  references?: Array<{ quote: string; client: string; approved?: boolean }>;
  videos: string[];
  photos?: number;
  blocks?: Array<{ from: number; to: number; note: string }>;
  managedBy?: string;
}

// Rate rules follow the grid in the entertainer dashboard design: weekdays
// cheaper, Thursday to Saturday evenings at a premium, late night higher again.
const standardRules = (weekdayEve: number, weekendEve: number, day: number): Array<[Weekday, TimeBlock, number, number?]> => [
  [2, 'daytime', day, undefined],
  [0, 'evening', weekdayEve],
  [1, 'evening', weekdayEve],
  [2, 'evening', weekdayEve],
  [3, 'daytime', Math.round(day * 1.08)],
  [3, 'evening', weekendEve],
  [3, 'late_night', Math.round(weekendEve * 1.2)],
  [4, 'daytime', Math.round(day * 1.2)],
  [4, 'evening', Math.round(weekendEve * 1.08)],
  [4, 'late_night', Math.round(weekendEve * 1.31)],
  [5, 'daytime', Math.round(day * 1.2)],
  [5, 'evening', Math.round(weekendEve * 1.08)],
  [5, 'late_night', Math.round(weekendEve * 1.31)],
  [6, 'evening', Math.round(weekdayEve * 1.07)],
  [6, 'late_night', Math.round(weekdayEve * 1.19)],
];

const acts: ActSeed[] = [
  {
    name: 'Nadia Rahim',
    email: 'nadia@encore.test',
    shortBio: 'Neo-soul vocalist for rooftop and lounge sets.',
    fullBio:
      'Nadia has fronted rooftop residencies across the Gulf for six years, moving between a stripped-back duo and a full six-piece band. Her sets lean neo-soul and jazz-adjacent R&B, built to sit under conversation early and lift a room after eleven.',
    category: 'singer',
    genres: ['Neo-soul', 'R&B', 'Jazz vocal'],
    city: 'dubai',
    origin: 'AE',
    accent: PINK,
    teamSize: 1,
    languages: ['English', 'Arabic'],
    provides: 'Own in-ear monitors and vocal mic',
    requires: 'PA system, two monitor sends, vocal mic on a boom',
    travelCities: ['abu-dhabi', 'doha'],
    travelRadiusKm: 180,
    shortTerm: true,
    longTerm: true,
    relocate: false,
    contractLengths: [3, 6],
    baseHourly: 40000,
    minimumHours: 3,
    rules: standardRules(42000, 52000, 35000),
    specials: [
      { offsetFromNye: 0, label: "New Year's Eve", hourly: 340000, min: 4 },
      { offsetFromNye: -7, label: 'Christmas Eve', hourly: 180000, min: 4 },
    ],
    residency: { monthly: 1400000, weekly: 380000, days: 4, extraDay: 90000 },
    verified: true,
    featured: true,
    awards: [{ title: 'Best Live Vocalist', issuer: 'Gulf Hospitality Awards', year: 2025 }],
    references: [
      {
        quote: 'Nadia held a 180-cover rooftop for four hours without a dip. Booked her again before she left.',
        client: 'The Penthouse',
        approved: true,
      },
    ],
    videos: ['https://www.youtube.com/watch?v=encore-nadia-rooftop', 'https://vimeo.com/encore-nadia-duo'],
    photos: 4,
    blocks: [
      { from: 3, to: 4, note: 'Recording' },
      { from: 17, to: 18, note: 'Away' },
    ],
  },
  {
    name: 'The Amber Quartet',
    email: 'amber@encore.test',
    shortBio: 'Jazz ensemble — standards, bossa and late-night bebop.',
    fullBio:
      'A four-piece built for hotel lobbies and long dinner services: upright bass, piano, drums and a rotating horn chair. The Amber Quartet has held two multi-month residencies in Downtown Dubai and travels as a unit.',
    category: 'band',
    genres: ['Jazz ensemble', 'Live cover band'],
    city: 'dubai',
    origin: 'LB',
    accent: AMBER,
    teamSize: 4,
    languages: ['English', 'French'],
    provides: 'Full backline, own sound engineer for residencies',
    requires: 'Stage or corner of 4m x 3m, three power drops',
    travelCities: ['abu-dhabi', 'doha', 'riyadh'],
    travelRadiusKm: 400,
    shortTerm: true,
    longTerm: true,
    relocate: true,
    contractLengths: [3, 6, 12],
    baseHourly: 110000,
    minimumHours: 3,
    rules: standardRules(120000, 150000, 95000),
    specials: [{ offsetFromNye: 0, label: "New Year's Eve", hourly: 600000, min: 4 }],
    residency: { monthly: 1800000, weekly: 480000, days: 5, extraDay: 140000 },
    verified: true,
    featured: true,
    awards: [{ title: 'Residency of the Year', issuer: 'Time Out Dubai', year: 2024 }],
    references: [
      { quote: 'Six months, five nights a week, never once a problem. The band the room was built around.', client: 'Marrow & Vine', approved: true },
    ],
    videos: ['https://www.youtube.com/watch?v=encore-amber-quartet'],
    photos: 3,
    blocks: [{ from: 10, to: 11, note: 'Touring' }],
  },
  {
    name: 'Kael Voss',
    email: 'kael@encore.test',
    shortBio: 'Close-up magician working tables in 25-minute rotations.',
    fullBio:
      'Kael works the room rather than a stage — sleight of hand at the table, built around 25-minute rotations so a full restaurant sees him across a service. Equally at home in a private dining room.',
    category: 'magician',
    genres: ['Close-up magic', 'Mentalism'],
    city: 'dubai',
    origin: 'GB',
    accent: GREEN,
    teamSize: 1,
    languages: ['English'],
    provides: 'Everything — no technical requirements at all',
    requires: 'Nothing',
    travelCities: ['abu-dhabi'],
    travelRadiusKm: 150,
    shortTerm: true,
    longTerm: false,
    baseHourly: 65000,
    minimumHours: 2,
    rules: standardRules(65000, 78000, 58000),
    specials: [{ offsetFromNye: 0, label: "New Year's Eve", hourly: 190000, min: 3 }],
    verified: false,
    featured: true,
    videos: ['https://www.instagram.com/reel/encore-kael-closeup'],
    photos: 2,
  },
  {
    name: 'Yusuf Barak',
    email: 'yusuf@encore.test',
    shortBio: 'Solo jazz piano — brunch through to late service.',
    fullBio:
      'Twenty years of hotel piano across Beirut and the Gulf. Yusuf reads a room quickly, moves between standards and Arabic repertoire, and is happy to play four hours without a set list.',
    category: 'instrumentalist',
    genres: ['Piano', 'Jazz vocal'],
    city: 'dubai',
    origin: 'LB',
    accent: AMBER,
    teamSize: 1,
    languages: ['Arabic', 'English', 'French'],
    provides: 'Nothing — plays the house piano',
    requires: 'Tuned piano or weighted 88-key stage piano',
    travelCities: ['abu-dhabi', 'sharjah'],
    travelRadiusKm: 200,
    shortTerm: true,
    longTerm: true,
    relocate: true,
    contractLengths: [1, 3, 6, 12],
    baseHourly: 38000,
    minimumHours: 2,
    rules: standardRules(38000, 46000, 32000),
    residency: { monthly: 1100000, weekly: 290000, days: 6, extraDay: 60000 },
    verified: true,
    awards: [{ title: 'Long Service, Live Music', issuer: 'Emirates Hospitality Guild', year: 2023 }],
    videos: ['https://www.youtube.com/watch?v=encore-yusuf-brunch'],
    photos: 2,
  },
  {
    name: 'Lena Marr',
    email: 'lena@encore.test',
    shortBio: 'Soul and piano-vocal duo, Abu Dhabi based.',
    fullBio:
      'Lena performs solo at the piano or as a duo with guitar. Her repertoire runs soul and slow-burn pop, and she has held two winter residencies on the Corniche.',
    category: 'singer',
    genres: ['Neo-soul', 'Pop'],
    city: 'abu-dhabi',
    origin: 'AE',
    accent: PINK,
    teamSize: 2,
    languages: ['English'],
    provides: 'Keyboard and own PA for rooms under 100 covers',
    requires: 'Two power sockets',
    travelCities: ['dubai'],
    travelRadiusKm: 180,
    shortTerm: true,
    longTerm: true,
    relocate: false,
    contractLengths: [3, 6],
    baseHourly: 45000,
    minimumHours: 3,
    rules: standardRules(45000, 55000, 38000),
    residency: { monthly: 1300000, days: 4, extraDay: 85000 },
    verified: false,
    videos: ['https://www.youtube.com/watch?v=encore-lena-duo'],
    photos: 3,
  },
  {
    name: 'Dario Sette',
    email: 'dario@encore.test',
    shortBio: 'Jazz trio for dinner service and late sets.',
    fullBio:
      'Piano, bass and brushed drums. Dario builds the set around the service — quiet under the first sitting, opening up after ten.',
    category: 'band',
    genres: ['Jazz ensemble'],
    city: 'dubai',
    origin: 'IT',
    accent: AMBER,
    teamSize: 3,
    languages: ['English', 'Italian'],
    provides: 'Backline and drum kit',
    requires: 'Room for three, one power drop',
    travelRadiusKm: 120,
    shortTerm: true,
    longTerm: true,
    relocate: false,
    contractLengths: [3],
    baseHourly: 95000,
    minimumHours: 3,
    rules: standardRules(100000, 120000, 85000),
    residency: { monthly: 1800000, days: 5, extraDay: 130000 },
    videos: ['https://www.youtube.com/watch?v=encore-dario-trio'],
    photos: 2,
  },
  {
    name: 'Ines Quist',
    email: 'ines@encore.test',
    shortBio: 'Classical cello and strings for lobbies and ceremonies.',
    fullBio:
      'Ines plays solo cello or brings a string trio. Her programme runs baroque through to arranged contemporary covers, and she is used to playing to a room that is not listening yet.',
    category: 'instrumentalist',
    genres: ['Cello', 'Strings', 'Violin'],
    city: 'sharjah',
    origin: 'DE',
    accent: BLUE,
    teamSize: 1,
    languages: ['English', 'German'],
    provides: 'Instrument and amplification',
    requires: 'One chair, no music stand light needed',
    travelCities: ['dubai'],
    travelRadiusKm: 100,
    shortTerm: true,
    longTerm: false,
    baseHourly: 30000,
    minimumHours: 2,
    rules: standardRules(30000, 38000, 28000),
    verified: true,
    videos: ['https://www.youtube.com/watch?v=encore-ines-cello'],
    photos: 2,
  },
  {
    name: 'Sable',
    email: 'sable@encore.test',
    shortBio: 'Open-format and deep house DJ, late slots.',
    fullBio:
      'Sable plays the back half of the night — deep house into open format, reading the floor rather than running a prepared set. Brings controller and needs only a booth feed.',
    category: 'dj',
    genres: ['Deep house', 'Open format', 'House'],
    city: 'dubai',
    origin: 'AE',
    accent: VIOLET,
    teamSize: 1,
    languages: ['English'],
    provides: 'Controller and headphones',
    requires: 'Booth, two channels into the house system',
    travelCities: ['abu-dhabi', 'doha'],
    travelRadiusKm: 300,
    shortTerm: true,
    longTerm: true,
    relocate: true,
    contractLengths: [3, 6],
    baseHourly: 90000,
    minimumHours: 3,
    rules: standardRules(90000, 110000, 70000),
    specials: [{ offsetFromNye: 0, label: "New Year's Eve", hourly: 290000, min: 4 }],
    residency: { monthly: 1600000, days: 4, extraDay: 110000 },
    videos: ['https://www.youtube.com/watch?v=encore-sable-set'],
    photos: 3,
  },
  {
    name: 'Kestrel Strings',
    email: 'kestrel@encore.test',
    shortBio: 'String quartet — ceremonies, arrivals and long lunches.',
    fullBio:
      'Four players, arranged pop as readily as Vivaldi. Kestrel is a London-based quartet that takes multi-month hotel contracts abroad and handles its own travel.',
    category: 'instrumentalist',
    genres: ['Strings', 'Violin', 'Cello'],
    city: 'london',
    origin: 'GB',
    accent: BLUE,
    teamSize: 4,
    languages: ['English'],
    provides: 'Instruments and stands',
    requires: 'Four chairs, shade if outdoors',
    shortTerm: true,
    longTerm: true,
    relocate: true,
    contractLengths: [3, 6, 12],
    baseHourly: 110000,
    minimumHours: 2,
    rules: standardRules(110000, 130000, 100000),
    residency: { monthly: 1500000, days: 5, extraDay: 120000 },
    verified: true,
    videos: ['https://www.youtube.com/watch?v=encore-kestrel-quartet'],
    photos: 2,
  },
  {
    name: 'Brass Rule',
    email: 'brass@encore.test',
    shortBio: 'Seven-piece brass band for parties and openings.',
    fullBio:
      'Loud, mobile and built for a crowd that is already standing. Brass Rule plays without amplification and can walk a room.',
    category: 'band',
    genres: ['Brass', 'Funk'],
    city: 'beirut',
    origin: 'LB',
    accent: CORAL,
    teamSize: 7,
    languages: ['Arabic', 'English'],
    provides: 'Everything — acoustic act',
    requires: 'Nothing',
    shortTerm: true,
    longTerm: true,
    relocate: true,
    contractLengths: [1, 3],
    baseHourly: 150000,
    minimumHours: 2,
    rules: standardRules(150000, 190000, 140000),
    residency: { monthly: 2200000, days: 3, extraDay: 200000 },
    videos: ['https://www.youtube.com/watch?v=encore-brass-rule'],
    photos: 2,
  },
  {
    name: 'Mira Deyn',
    email: 'mira@encore.test',
    shortBio: 'Arabic and pop vocalist, agency represented.',
    fullBio:
      'Mira sings Arabic standards and contemporary pop, and works with a band or to backing tracks. Represented by Northline Artists, who handle her calendar and contracts.',
    category: 'singer',
    genres: ['Arabic', 'Pop'],
    city: 'dubai',
    origin: 'JO',
    accent: PINK,
    teamSize: 1,
    languages: ['Arabic', 'English'],
    provides: 'Own tracks and mic',
    requires: 'PA and a monitor',
    travelCities: ['abu-dhabi', 'riyadh', 'doha'],
    travelRadiusKm: 500,
    shortTerm: true,
    longTerm: true,
    relocate: true,
    contractLengths: [3, 6],
    baseHourly: 70000,
    minimumHours: 3,
    rules: standardRules(70000, 88000, 60000),
    residency: { monthly: 1450000, days: 4, extraDay: 100000 },
    managedBy: 'northline@encore.test',
    videos: ['https://www.youtube.com/watch?v=encore-mira-set'],
    photos: 2,
  },
  {
    name: 'Rue Alderic',
    email: 'rue@encore.test',
    shortBio: 'Stand-up, clean sets for corporate rooms.',
    fullBio:
      'Rue writes to the room and works clean by default. Ten years of club sets behind a act that now mostly plays corporate dinners and awards nights.',
    category: 'comedian',
    genres: ['Stand-up'],
    city: 'dubai',
    origin: 'GB',
    accent: AMBER,
    teamSize: 1,
    languages: ['English'],
    provides: 'Nothing',
    requires: 'Mic, stand and a light on the stage',
    shortTerm: true,
    longTerm: false,
    baseHourly: 80000,
    minimumHours: 1,
    rules: standardRules(80000, 95000, 75000),
    // Submitted but not yet approved — this is what the admin queue shows.
    status: 'pending_review',
    videos: ['https://www.youtube.com/watch?v=encore-rue-set'],
    photos: 1,
  },
];

const insertEnt = db.prepare(
  `INSERT INTO entertainers (id, user_id, managed_by_user_id, representation_note, slug, stage_name, real_name,
                             short_bio, full_bio, category_id, home_city_id, travel_radius_km, country_of_origin,
                             team_size, languages, equipment_provided, equipment_required, cover_accent, status,
                             verified, featured, accepts_short_term, accepts_long_term, open_to_relocate,
                             contract_lengths, created_at, updated_at)
   VALUES (@id, @userId, @managedBy, @repNote, @slug, @name, @realName, @shortBio, @fullBio, @categoryId,
           @cityId, @radius, @origin, @teamSize, @languages, @provides, @requires, @accent, @status,
           @verified, @featured, @short, @long, @relocate, @lengths, @now, @now)`,
);

// An agency account first, so the acts it represents can point at it.
const agencyUser = repo.createUser(db, {
  email: 'northline@encore.test',
  passwordHash: hashPassword('password'),
  role: 'agency',
  displayName: 'Northline Artists',
});
repo.createSubscription(db, {
  userId: agencyUser.id,
  plan: 'agency',
  status: 'active',
  renewsAt: addDays(TODAY, 300),
});

const actIds = new Map<string, string>();

for (const act of acts) {
  const user = repo.createUser(db, {
    email: act.email,
    passwordHash: hashPassword('password'),
    role: 'entertainer',
    displayName: act.name,
  });

  // Entertainers pay a subscription; the platform takes no booking commission.
  repo.createSubscription(db, {
    userId: user.id,
    plan: 'standard',
    status: 'active',
    renewsAt: addDays(TODAY, 240),
  });

  const id = newId('ent');
  actIds.set(act.name, id);
  const managerId = act.managedBy ? agencyUser.id : null;

  insertEnt.run({
    id,
    userId: user.id,
    managedBy: managerId,
    repNote: managerId ? 'Represented by Northline Artists (agency)' : null,
    slug: slugify(act.name),
    name: act.name,
    realName: null,
    shortBio: act.shortBio,
    fullBio: act.fullBio,
    categoryId: categoryIds.get(act.category)!,
    cityId: act.city,
    radius: act.travelRadiusKm ?? 0,
    origin: act.origin,
    teamSize: act.teamSize,
    languages: JSON.stringify(act.languages),
    provides: act.provides,
    requires: act.requires,
    accent: act.accent,
    status: act.status ?? 'live',
    verified: act.verified ? 1 : 0,
    featured: act.featured ? 1 : 0,
    short: act.shortTerm === false ? 0 : 1,
    long: act.longTerm ? 1 : 0,
    relocate: act.relocate ? 1 : 0,
    lengths: JSON.stringify(act.contractLengths ?? []),
    now: new Date().toISOString(),
  });

  repo.setEntertainerGenres(
    db,
    id,
    act.genres.map((g) => genreIds.get(g.toLowerCase())).filter((x): x is string => !!x),
  );

  for (const cityId of act.travelCities ?? []) {
    db.prepare('INSERT OR IGNORE INTO entertainer_travel_cities (entertainer_id, city_id) VALUES (?, ?)').run(id, cityId);
  }

  repo.upsertRateCard(db, id, {
    currency: 'AED',
    baseHourly: act.baseHourly,
    minimumHours: act.minimumHours,
    residencyWeekly: act.residency?.weekly ?? null,
    residencyMonthly: act.residency?.monthly ?? null,
    daysPerWeekIncluded: act.residency?.days ?? 5,
    extraDayRate: act.residency?.extraDay ?? null,
    published: true,
  });

  for (const [weekday, block, hourly, min] of act.rules) {
    repo.setRateRule(db, id, { weekday, timeBlock: block, hourly, minimumHours: min ?? null });
  }

  for (const special of act.specials ?? []) {
    const date = special.date ?? addDays(NEXT_NYE, special.offsetFromNye ?? 0);
    repo.addSpecialDate(db, id, { date, label: special.label, hourly: special.hourly, minimumHours: special.min ?? null });
  }

  act.videos.forEach((url, i) =>
    repo.addMedia(db, id, { kind: 'video', url, title: `${act.name} — reel ${i + 1}`, accent: act.accent }),
  );
  for (let i = 0; i < (act.photos ?? 0); i++) {
    repo.addMedia(db, id, { kind: 'photo', url: `gradient:${act.accent}:${i}`, accent: act.accent });
  }

  for (const award of act.awards ?? []) repo.addAward(db, id, award);

  for (const ref of act.references ?? []) {
    repo.addReference(db, id, { quote: ref.quote, clientName: ref.client, gigDate: addDays(TODAY, -120), logoAccent: act.accent });
    if (ref.approved) {
      const [row] = repo.listReferences(db, id, false);
      if (row) repo.setReferenceModeration(db, row.id, 'approved');
    }
  }

  // Manual blocks, mirroring the red days in the calendar mockup.
  for (const b of act.blocks ?? []) {
    repo.insertBlock(db, id, {
      id: newId('blk'),
      kind: b.from === b.to ? 'single' : 'range',
      source: 'manual',
      start: addDays(TODAY, b.from),
      end: addDays(TODAY, b.to),
      note: b.note,
    });
  }
}

// Every Monday off for Yusuf, exercising the recurring-block path.
repo.insertBlock(db, actIds.get('Yusuf Barak')!, {
  id: newId('blk'),
  kind: 'recurring_weekday',
  source: 'manual',
  weekday: 0,
  note: 'Never plays Mondays',
});

// ------------------------------------------------------------------ venues --

interface VenueSeed {
  name: string;
  email: string;
  type: string;
  city: string;
}

const venueSeeds: VenueSeed[] = [
  { name: 'The Penthouse', email: 'penthouse@encore.test', type: 'hotel', city: 'dubai' },
  { name: 'Marrow & Vine', email: 'marrow@encore.test', type: 'restaurant', city: 'dubai' },
  { name: 'Corniche Grand', email: 'corniche@encore.test', type: 'hotel', city: 'abu-dhabi' },
];

const venueIds = new Map<string, string>();
const venueUserIds = new Map<string, string>();

for (const v of venueSeeds) {
  const user = repo.createUser(db, {
    email: v.email,
    passwordHash: hashPassword('password'),
    role: 'venue',
    displayName: v.name,
  });
  const venue = repo.createVenue(db, { userId: user.id, name: v.name, venueType: v.type, cityId: v.city });
  venueIds.set(v.name, venue.id);
  venueUserIds.set(v.name, user.id);
}

// ------------------------------------------------------------------- admin --

repo.createUser(db, {
  email: 'admin@encore.test',
  passwordHash: hashPassword('password'),
  role: 'admin',
  displayName: 'Encore Admin',
});

// -------------------------------------------------------------- shortlists --

const penthouse = venueIds.get('The Penthouse')!;
const nyeList = repo.createShortlist(db, penthouse, 'NYE rooftop', 'Four hours, 180 covers, 21:00 start');
for (const name of ['Nadia Rahim', 'Sable', 'Kael Voss', 'Brass Rule']) {
  repo.addToShortlist(db, nyeList, actIds.get(name)!);
}
const brunchList = repo.createShortlist(db, penthouse, 'Friday jazz brunch', 'Weekly, 12:00–16:00');
for (const name of ['Yusuf Barak', 'Dario Sette', 'The Amber Quartet']) {
  repo.addToShortlist(db, brunchList, actIds.get(name)!);
}
const residencyList = repo.createShortlist(db, penthouse, 'Residency longlist', 'Six months, open to relocation');
for (const name of ['The Amber Quartet', 'Kestrel Strings', 'Mira Deyn']) {
  repo.addToShortlist(db, residencyList, actIds.get(name)!);
}

// --------------------------------------------------------------- inquiries --

const penthouseUser = venueUserIds.get('The Penthouse')!;

// 1. The NYE booking from the mockups: confirmed, so it holds 31 December.
const nyeInquiry = sendInquiry(db, {
  venueId: penthouse,
  entertainerId: actIds.get('Nadia Rahim')!,
  gigType: 'one_time',
  startDate: NEXT_NYE,
  timeBlock: 'late_night',
  hours: 4,
  cityId: 'dubai',
  eventType: 'New Year’s Eve rooftop',
  notes: '21:00–01:00, 180 covers. Two 90-minute sets with a break at midnight.',
});
const nadiaUser = repo.getEntertainerById(db, actIds.get('Nadia Rahim')!)!.userId;

postMessage(db, nyeInquiry, penthouseUser, 'Hi Nadia — we loved the rooftop reel. Holding 31 Dec, 21:00–01:00, 180 covers.');
transitionInquiry(db, { inquiryId: nyeInquiry, to: 'viewed', actor: 'entertainer', actorUserId: nadiaUser });
postMessage(db, nyeInquiry, nadiaUser, 'Thanks! That date is open. Two 90-minute sets with a break at midnight works for me.');
transitionInquiry(db, { inquiryId: nyeInquiry, to: 'accepted', actor: 'entertainer', actorUserId: nadiaUser });
transitionInquiry(db, { inquiryId: nyeInquiry, to: 'confirmed', actor: 'entertainer', actorUserId: nadiaUser });
postMessage(db, nyeInquiry, nadiaUser, 'Accepted. I’ll bring my own IEMs, just need two monitor sends and a vocal mic on a boom.');
postMessage(db, nyeInquiry, penthouseUser, 'Noted — our engineer will be there from 18:00 for line check.');

// 2. A counter-offer on the table, for the venue's inquiry pipeline.
const sableUser = repo.getEntertainerById(db, actIds.get('Sable')!)!.userId;
const sableInquiry = sendInquiry(db, {
  venueId: penthouse,
  entertainerId: actIds.get('Sable')!,
  gigType: 'one_time',
  startDate: NEXT_NYE,
  timeBlock: 'late_night',
  hours: 4,
  cityId: 'dubai',
  eventType: 'NYE late slot',
  notes: 'Taking over from the live act at 01:00.',
  offerAmount: 1000000,
});
transitionInquiry(db, { inquiryId: sableInquiry, to: 'viewed', actor: 'entertainer', actorUserId: sableUser });
transitionInquiry(db, {
  inquiryId: sableInquiry,
  to: 'countered',
  actor: 'entertainer',
  actorUserId: sableUser,
  offer: 1160000,
});
postMessage(db, sableInquiry, sableUser, 'Can we move the load-in to 18:30? And NYE sits at my special-date rate.');

// 3. A residency inquiry, viewed and awaiting a response.
const amberUser = repo.getEntertainerById(db, actIds.get('The Amber Quartet')!)!.userId;
const residencyInquiry = sendInquiry(db, {
  venueId: penthouse,
  entertainerId: actIds.get('The Amber Quartet')!,
  gigType: 'long_term',
  startDate: addDays(TODAY, 60),
  months: 6,
  daysPerWeek: 5,
  cityId: 'dubai',
  eventType: 'Lobby residency',
  notes: 'Six months, five nights a week, 19:00–23:00.',
});
transitionInquiry(db, { inquiryId: residencyInquiry, to: 'viewed', actor: 'entertainer', actorUserId: amberUser });
postMessage(db, residencyInquiry, amberUser, 'Attaching the residency rider and the visa timeline — happy to talk relocation.');

// 4. A brand-new inquiry sitting in the entertainer's queue.
sendInquiry(db, {
  venueId: penthouse,
  entertainerId: actIds.get('Kael Voss')!,
  gigType: 'one_time',
  startDate: addDays(TODAY, 45),
  timeBlock: 'evening',
  hours: 3,
  cityId: 'dubai',
  eventType: 'Valentine’s service',
  notes: 'Table-to-table across two sittings.',
});

// 5. A completed booking with a verified review, so profiles show real ratings.
const marrow = venueIds.get('Marrow & Vine')!;
const marrowUser = venueUserIds.get('Marrow & Vine')!;
const yusufUser = repo.getEntertainerById(db, actIds.get('Yusuf Barak')!)!.userId;
const pastGig = sendInquiry(db, {
  venueId: marrow,
  entertainerId: actIds.get('Yusuf Barak')!,
  gigType: 'one_time',
  startDate: addDays(TODAY, -30),
  timeBlock: 'evening',
  hours: 4,
  cityId: 'dubai',
  eventType: 'Anniversary dinner service',
});
transitionInquiry(db, { inquiryId: pastGig, to: 'viewed', actor: 'entertainer', actorUserId: yusufUser });
transitionInquiry(db, { inquiryId: pastGig, to: 'accepted', actor: 'entertainer', actorUserId: yusufUser });
transitionInquiry(db, { inquiryId: pastGig, to: 'confirmed', actor: 'entertainer', actorUserId: yusufUser });
transitionInquiry(db, { inquiryId: pastGig, to: 'completed', actor: 'venue', actorUserId: marrowUser });
leaveReview(db, {
  inquiryId: pastGig,
  venueUserId: marrowUser,
  rating: 5,
  body: 'Four hours, no set list, and the room never noticed the transitions. Rebooked on the spot.',
});

// A second completed gig so an act has more than one review to average.
const corniche = venueIds.get('Corniche Grand')!;
const cornicheUser = venueUserIds.get('Corniche Grand')!;
const lenaUser = repo.getEntertainerById(db, actIds.get('Lena Marr')!)!.userId;
const pastGig2 = sendInquiry(db, {
  venueId: corniche,
  entertainerId: actIds.get('Lena Marr')!,
  gigType: 'one_time',
  startDate: addDays(TODAY, -60),
  timeBlock: 'evening',
  hours: 3,
  cityId: 'abu-dhabi',
  eventType: 'Terrace sessions',
});
transitionInquiry(db, { inquiryId: pastGig2, to: 'accepted', actor: 'entertainer', actorUserId: lenaUser });
transitionInquiry(db, { inquiryId: pastGig2, to: 'confirmed', actor: 'entertainer', actorUserId: lenaUser });
transitionInquiry(db, { inquiryId: pastGig2, to: 'completed', actor: 'venue', actorUserId: cornicheUser });
leaveReview(db, {
  inquiryId: pastGig2,
  venueUserId: cornicheUser,
  rating: 4,
  body: 'Lovely set and easy to work with. Load-in ran late, which is the only reason this is not five.',
});

const counts = {
  entertainers: acts.length,
  venues: venueSeeds.length,
  cities: cities.length,
  categories: taxonomy.length,
  inquiries: repo.listAllInquiries(db).length,
};

db.close();

console.log('Seeded Encore:', counts);
console.log('\nSign in with any of these — the password is always `password`:');
console.log('  venue        penthouse@encore.test');
console.log('  entertainer  nadia@encore.test');
console.log('  agency       northline@encore.test');
console.log('  admin        admin@encore.test');
