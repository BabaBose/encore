/**
 * Repositories: the only place SQL and the domain types meet.
 *
 * Everything above this file works with domain records (`EntertainerRecord`,
 * `RateCard`, `AvailabilityBlock`), never with rows, so a schema change stops
 * here.
 *
 * Two things to know when reading the SQL:
 *
 *  - Postgres returns `bigint` and `count(*)` as strings, to avoid silently
 *    losing precision in JavaScript. Money and counts go through `num()` on the
 *    way out, so nothing above this file sees `'420000'` where it wants a
 *    number.
 *  - Loading entertainers is batched. Every list query fetches genres, travel
 *    cities, rates and calendars for the whole page in one query each rather
 *    than per row: against a database across the network, the per-row version
 *    turned one search into fifty round trips.
 */
import type { Db } from './client';
import { newId } from './ids';
import type { AvailabilityBlock } from '@/domain/availability';
import type { RateCard, RateRule, SpecialDateRate } from '@/domain/rates';
import type { CityRef, EntertainerRecord } from '@/domain/search';
import type {
  BlockKind,
  BlockSource,
  ContractLength,
  GigType,
  InquiryStatus,
  IsoDate,
  ProfileStatus,
  ResidencyInquiryPolicy,
  TimeBlock,
  TopCategory,
  UserRole,
  Weekday,
} from '@/domain/types';

type Row = Record<string, unknown>;

const nowIso = () => new Date().toISOString();

function num(value: unknown): number {
  return typeof value === 'string' ? Number(value) : (value as number);
}

function numOrNull(value: unknown): number | null {
  return value == null ? null : num(value);
}

/** Groups rows by a key, for assembling batched loads. */
function groupBy<T extends Row>(rows: T[], key: string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = row[key] as string;
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
}

// ------------------------------------------------------------------ cities --

export async function listCities(db: Db): Promise<CityRef[]> {
  const { rows } = await db.query<CityRef>('SELECT id, name, country, lat, lng FROM cities ORDER BY name');
  return rows;
}

export async function getCity(db: Db, id: string): Promise<CityRef | null> {
  const { rows } = await db.query<CityRef>('SELECT id, name, country, lat, lng FROM cities WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// -------------------------------------------------------------- categories --

export interface CategoryRow {
  id: string;
  parentId: string | null;
  slug: string;
  label: string;
  accent: string | null;
  sortOrder: number;
}

export async function listCategories(db: Db): Promise<CategoryRow[]> {
  const { rows } = await db.query<Row>(
    'SELECT id, parent_id, slug, label, accent, sort_order FROM categories ORDER BY sort_order, label',
  );
  return rows.map((r) => ({
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    slug: r.slug as string,
    label: r.label as string,
    accent: (r.accent as string | null) ?? null,
    sortOrder: num(r.sort_order),
  }));
}

export async function topCategories(db: Db): Promise<CategoryRow[]> {
  return (await listCategories(db)).filter((c) => c.parentId === null);
}

export async function genresFor(db: Db, categoryId: string): Promise<CategoryRow[]> {
  return (await listCategories(db)).filter((c) => c.parentId === categoryId);
}

// ------------------------------------------------------------------- users --

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  displayName: string;
  createdAt: string;
}

function mapUser(r: Row): UserRow {
  return {
    id: r.id as string,
    email: r.email as string,
    passwordHash: r.password_hash as string,
    role: r.role as UserRole,
    displayName: r.display_name as string,
    createdAt: r.created_at as string,
  };
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | null> {
  const { rows } = await db.query<Row>('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function findUserById(db: Db, id: string): Promise<UserRow | null> {
  const { rows } = await db.query<Row>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function createUser(
  db: Db,
  input: { email: string; passwordHash: string; role: UserRole; displayName: string },
): Promise<UserRow> {
  const id = newId('usr');
  await db.query(
    'INSERT INTO users (id, email, password_hash, role, display_name, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, input.email.toLowerCase(), input.passwordHash, input.role, input.displayName, nowIso()],
  );
  return (await findUserById(db, id))!;
}

// ---------------------------------------------------------------- sessions --

export async function createSession(db: Db, token: string, userId: string, expiresAt: string): Promise<void> {
  await db.query('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)', [
    token,
    userId,
    nowIso(),
    expiresAt,
  ]);
}

export async function findSessionUser(db: Db, token: string): Promise<UserRow | null> {
  const { rows } = await db.query<Row>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > $2`,
    [token, nowIso()],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token = $1', [token]);
}

// ------------------------------------------------------------- rate cards --

function buildRateCard(
  card: Row | undefined,
  rules: Row[],
  specials: Row[],
  contractLengths: ContractLength[],
): RateCard {
  const hasResidency = card && (card.residency_weekly != null || card.residency_monthly != null);
  return {
    currency: (card?.currency as string) ?? 'AED',
    baseHourly: card ? num(card.base_hourly) : 0,
    minimumHours: card ? num(card.minimum_hours) : 1,
    rules: rules.map<RateRule>((r) => ({
      weekday: num(r.weekday) as Weekday,
      timeBlock: r.time_block as TimeBlock,
      hourly: num(r.hourly),
      minimumHours: numOrNull(r.minimum_hours) ?? undefined,
    })),
    specialDates: specials.map<SpecialDateRate>((r) => ({
      date: r.date as IsoDate,
      label: r.label as string,
      hourly: num(r.hourly),
      minimumHours: numOrNull(r.minimum_hours) ?? undefined,
    })),
    residency: hasResidency
      ? {
          weekly: numOrNull(card.residency_weekly) ?? undefined,
          monthly: numOrNull(card.residency_monthly) ?? undefined,
          daysPerWeekIncluded: num(card.days_per_week_included),
          extraDayRate: numOrNull(card.extra_day_rate) ?? undefined,
          contractLengths,
        }
      : undefined,
  };
}

export async function loadRateCard(db: Db, entertainerId: string): Promise<RateCard> {
  const [card, rules, specials, ent] = await Promise.all([
    db.query<Row>('SELECT * FROM rate_cards WHERE entertainer_id = $1', [entertainerId]),
    db.query<Row>('SELECT weekday, time_block, hourly, minimum_hours FROM rate_rules WHERE entertainer_id = $1', [
      entertainerId,
    ]),
    db.query<Row>(
      'SELECT date, label, hourly, minimum_hours FROM special_date_rates WHERE entertainer_id = $1 ORDER BY date',
      [entertainerId],
    ),
    db.query<Row>('SELECT contract_lengths FROM entertainers WHERE id = $1', [entertainerId]),
  ]);
  const lengths = JSON.parse((ent.rows[0]?.contract_lengths as string) ?? '[]') as ContractLength[];
  return buildRateCard(card.rows[0], rules.rows, specials.rows, lengths);
}

export async function isRateCardPublished(db: Db, entertainerId: string): Promise<boolean> {
  const { rows } = await db.query<Row>('SELECT published FROM rate_cards WHERE entertainer_id = $1', [entertainerId]);
  return !!rows[0]?.published;
}

export async function upsertRateCard(
  db: Db,
  entertainerId: string,
  input: {
    currency: string;
    baseHourly: number;
    minimumHours: number;
    residencyWeekly?: number | null;
    residencyMonthly?: number | null;
    daysPerWeekIncluded: number;
    extraDayRate?: number | null;
    published: boolean;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO rate_cards (entertainer_id, currency, base_hourly, minimum_hours, residency_weekly,
                             residency_monthly, days_per_week_included, extra_day_rate, published, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (entertainer_id) DO UPDATE SET
       currency = EXCLUDED.currency, base_hourly = EXCLUDED.base_hourly,
       minimum_hours = EXCLUDED.minimum_hours, residency_weekly = EXCLUDED.residency_weekly,
       residency_monthly = EXCLUDED.residency_monthly,
       days_per_week_included = EXCLUDED.days_per_week_included,
       extra_day_rate = EXCLUDED.extra_day_rate, published = EXCLUDED.published,
       updated_at = EXCLUDED.updated_at`,
    [
      entertainerId,
      input.currency,
      input.baseHourly,
      input.minimumHours,
      input.residencyWeekly ?? null,
      input.residencyMonthly ?? null,
      input.daysPerWeekIncluded,
      input.extraDayRate ?? null,
      input.published,
      nowIso(),
    ],
  );
}

export async function setRateRule(
  db: Db,
  entertainerId: string,
  rule: { weekday: Weekday; timeBlock: TimeBlock; hourly: number; minimumHours?: number | null },
): Promise<void> {
  // An hourly rate of zero means "not offered", so the rule is removed rather
  // than stored as a free gig.
  if (rule.hourly <= 0) {
    await db.query('DELETE FROM rate_rules WHERE entertainer_id = $1 AND weekday = $2 AND time_block = $3', [
      entertainerId,
      rule.weekday,
      rule.timeBlock,
    ]);
    return;
  }
  await db.query(
    `INSERT INTO rate_rules (id, entertainer_id, weekday, time_block, hourly, minimum_hours)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (entertainer_id, weekday, time_block)
     DO UPDATE SET hourly = EXCLUDED.hourly, minimum_hours = EXCLUDED.minimum_hours`,
    [newId('rr'), entertainerId, rule.weekday, rule.timeBlock, rule.hourly, rule.minimumHours ?? null],
  );
}

export async function addSpecialDate(
  db: Db,
  entertainerId: string,
  input: { date: IsoDate; label: string; hourly: number; minimumHours?: number | null },
): Promise<void> {
  await db.query(
    `INSERT INTO special_date_rates (id, entertainer_id, date, label, hourly, minimum_hours)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (entertainer_id, date)
     DO UPDATE SET label = EXCLUDED.label, hourly = EXCLUDED.hourly, minimum_hours = EXCLUDED.minimum_hours`,
    [newId('sd'), entertainerId, input.date, input.label, input.hourly, input.minimumHours ?? null],
  );
}

export async function removeSpecialDate(db: Db, entertainerId: string, date: IsoDate): Promise<void> {
  await db.query('DELETE FROM special_date_rates WHERE entertainer_id = $1 AND date = $2', [entertainerId, date]);
}

// ------------------------------------------------------------ availability --

function mapBlock(r: Row): AvailabilityBlock {
  return {
    id: r.id as string,
    kind: r.kind as BlockKind,
    source: r.source as BlockSource,
    start: (r.start_date as string | null) ?? undefined,
    end: (r.end_date as string | null) ?? undefined,
    weekday: (numOrNull(r.weekday) as Weekday | null) ?? undefined,
    recurFrom: (r.recur_from as string | null) ?? undefined,
    recurUntil: (r.recur_until as string | null) ?? undefined,
    bookingId: (r.inquiry_id as string | null) ?? undefined,
    note: (r.note as string | null) ?? undefined,
  };
}

export async function loadBlocks(db: Db, entertainerId: string): Promise<AvailabilityBlock[]> {
  const { rows } = await db.query<Row>('SELECT * FROM availability_blocks WHERE entertainer_id = $1', [entertainerId]);
  return rows.map(mapBlock);
}

export async function insertBlock(db: Db, entertainerId: string, block: AvailabilityBlock): Promise<void> {
  await db.query(
    `INSERT INTO availability_blocks (id, entertainer_id, kind, source, start_date, end_date,
                                      weekday, recur_from, recur_until, inquiry_id, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      block.id,
      entertainerId,
      block.kind,
      block.source,
      block.start ?? null,
      block.end ?? null,
      block.weekday ?? null,
      block.recurFrom ?? null,
      block.recurUntil ?? null,
      block.bookingId ?? null,
      block.note ?? null,
      nowIso(),
    ],
  );
}

export async function deleteBlock(db: Db, entertainerId: string, blockId: string): Promise<void> {
  // Scoped to manual blocks in SQL as well as in the domain check, so a
  // booking's hold on a date cannot be dropped even by a direct call.
  await db.query("DELETE FROM availability_blocks WHERE id = $1 AND entertainer_id = $2 AND source = 'manual'", [
    blockId,
    entertainerId,
  ]);
}

export async function deleteBookingBlocks(db: Db, inquiryId: string): Promise<void> {
  await db.query("DELETE FROM availability_blocks WHERE inquiry_id = $1 AND source = 'booking'", [inquiryId]);
}

// ------------------------------------------------------------ entertainers --

export interface EntertainerDetail extends EntertainerRecord {
  userId: string;
  managedByUserId: string | null;
  representationNote: string | null;
  realName: string | null;
  fullBio: string;
  status: ProfileStatus;
  reviewNote: string | null;
  languages: string[];
  equipmentProvided: string;
  equipmentRequired: string;
  categoryLabel: string;
  genreLabels: string[];
  rateCardPublished: boolean;
  travelCityNames: string[];
}

const ENTERTAINER_SELECT = `
  SELECT e.*, c.label AS category_label, c.slug AS category_slug,
         city.id AS city_id, city.name AS city_name, city.country AS city_country,
         city.lat AS city_lat, city.lng AS city_lng,
         (SELECT AVG(rating) FROM reviews r WHERE r.entertainer_id = e.id AND r.moderation = 'approved') AS rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.entertainer_id = e.id AND r.moderation = 'approved') AS review_count
  FROM entertainers e
  LEFT JOIN categories c ON c.id = e.category_id
  LEFT JOIN cities city ON city.id = e.home_city_id
`;

/**
 * Turn entertainer rows into full records, fetching everything they hang off
 * in one query each rather than one per row.
 */
async function hydrate(db: Db, rows: Row[]): Promise<EntertainerDetail[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);

  const [genres, travel, cards, rules, specials, blocks] = await Promise.all([
    db.query<Row>(
      `SELECT g.entertainer_id, c.slug, c.label FROM entertainer_genres g
       JOIN categories c ON c.id = g.genre_id WHERE g.entertainer_id = ANY($1)`,
      [ids],
    ),
    db.query<Row>(
      `SELECT t.entertainer_id, c.id AS city_id, c.name FROM entertainer_travel_cities t
       JOIN cities c ON c.id = t.city_id WHERE t.entertainer_id = ANY($1)`,
      [ids],
    ),
    db.query<Row>('SELECT * FROM rate_cards WHERE entertainer_id = ANY($1)', [ids]),
    db.query<Row>(
      'SELECT entertainer_id, weekday, time_block, hourly, minimum_hours FROM rate_rules WHERE entertainer_id = ANY($1)',
      [ids],
    ),
    db.query<Row>(
      `SELECT entertainer_id, date, label, hourly, minimum_hours FROM special_date_rates
       WHERE entertainer_id = ANY($1) ORDER BY date`,
      [ids],
    ),
    db.query<Row>('SELECT * FROM availability_blocks WHERE entertainer_id = ANY($1)', [ids]),
  ]);

  const genresBy = groupBy(genres.rows, 'entertainer_id');
  const travelBy = groupBy(travel.rows, 'entertainer_id');
  const cardBy = new Map(cards.rows.map((r) => [r.entertainer_id as string, r]));
  const rulesBy = groupBy(rules.rows, 'entertainer_id');
  const specialsBy = groupBy(specials.rows, 'entertainer_id');
  const blocksBy = groupBy(blocks.rows, 'entertainer_id');

  return rows.map((r) => {
    const id = r.id as string;
    const g = genresBy.get(id) ?? [];
    const t = travelBy.get(id) ?? [];
    const contractLengths = JSON.parse((r.contract_lengths as string) ?? '[]') as ContractLength[];
    const card = cardBy.get(id);
    const rating = r.rating == null ? null : Math.round(Number(r.rating) * 10) / 10;

    return {
      id,
      userId: r.user_id as string,
      managedByUserId: (r.managed_by_user_id as string | null) ?? null,
      representationNote: (r.representation_note as string | null) ?? null,
      slug: r.slug as string,
      stageName: r.stage_name as string,
      realName: (r.real_name as string | null) ?? null,
      shortBio: r.short_bio as string,
      fullBio: r.full_bio as string,
      category: ((r.category_slug as string) ?? 'other') as TopCategory,
      categoryLabel: (r.category_label as string) ?? 'Other',
      genres: g.map((x) => x.slug as string),
      genreLabels: g.map((x) => x.label as string),
      countryOfOrigin: r.country_of_origin as string,
      homeCity: {
        id: (r.city_id as string) ?? '',
        name: (r.city_name as string) ?? '',
        country: (r.city_country as string) ?? '',
        lat: (r.city_lat as number) ?? 0,
        lng: (r.city_lng as number) ?? 0,
      },
      travelCities: t.map((x) => x.city_id as string),
      travelCityNames: t.map((x) => x.name as string),
      travelRadiusKm: num(r.travel_radius_km),
      acceptsShortTerm: !!r.accepts_short_term,
      acceptsLongTerm: !!r.accepts_long_term,
      openToRelocate: !!r.open_to_relocate,
      contractLengths,
      residencyInquiryPolicy: ((r.residency_inquiry_policy as string) ??
        'when_largely_free') as ResidencyInquiryPolicy,
      rateCard: buildRateCard(card, rulesBy.get(id) ?? [], specialsBy.get(id) ?? [], contractLengths),
      rateCardPublished: !!card?.published,
      blocks: (blocksBy.get(id) ?? []).map(mapBlock),
      rating,
      reviewCount: num(r.review_count ?? 0),
      verified: !!r.verified,
      featured: !!r.featured,
      status: r.status as ProfileStatus,
      reviewNote: (r.review_note as string | null) ?? null,
      isLive: r.status === 'live',
      heroAccent: r.cover_accent as string,
      teamSize: num(r.team_size),
      languages: JSON.parse((r.languages as string) ?? '[]') as string[],
      equipmentProvided: r.equipment_provided as string,
      equipmentRequired: r.equipment_required as string,
    };
  });
}

/** The discoverable pool. Search filters this in the domain layer. */
export async function liveEntertainers(db: Db): Promise<EntertainerDetail[]> {
  const { rows } = await db.query<Row>(`${ENTERTAINER_SELECT} WHERE e.status = 'live'`);
  return hydrate(db, rows);
}

export async function allEntertainers(db: Db): Promise<EntertainerDetail[]> {
  const { rows } = await db.query<Row>(`${ENTERTAINER_SELECT} ORDER BY e.created_at DESC`);
  return hydrate(db, rows);
}

export async function entertainersAwaitingReview(db: Db): Promise<EntertainerDetail[]> {
  const { rows } = await db.query<Row>(
    `${ENTERTAINER_SELECT} WHERE e.status = 'pending_review' ORDER BY e.updated_at`,
  );
  return hydrate(db, rows);
}

export async function getEntertainerBySlug(db: Db, slug: string): Promise<EntertainerDetail | null> {
  const { rows } = await db.query<Row>(`${ENTERTAINER_SELECT} WHERE e.slug = $1`, [slug]);
  return (await hydrate(db, rows))[0] ?? null;
}

export async function getEntertainerById(db: Db, id: string): Promise<EntertainerDetail | null> {
  const { rows } = await db.query<Row>(`${ENTERTAINER_SELECT} WHERE e.id = $1`, [id]);
  return (await hydrate(db, rows))[0] ?? null;
}

export async function getEntertainerForUser(db: Db, userId: string): Promise<EntertainerDetail | null> {
  const { rows } = await db.query<Row>(`${ENTERTAINER_SELECT} WHERE e.user_id = $1`, [userId]);
  return (await hydrate(db, rows))[0] ?? null;
}

/** Every act an agency or manager represents, for the roster view. */
export async function getEntertainersManagedBy(db: Db, userId: string): Promise<EntertainerDetail[]> {
  const { rows } = await db.query<Row>(
    `${ENTERTAINER_SELECT} WHERE e.managed_by_user_id = $1 ORDER BY e.stage_name`,
    [userId],
  );
  return hydrate(db, rows);
}

export async function updateEntertainerStatus(
  db: Db,
  id: string,
  status: ProfileStatus,
  note: string | null,
): Promise<void> {
  await db.query('UPDATE entertainers SET status = $1, review_note = $2, updated_at = $3 WHERE id = $4', [
    status,
    note,
    nowIso(),
    id,
  ]);
}

export async function setEntertainerFlags(
  db: Db,
  id: string,
  flags: { verified?: boolean; featured?: boolean },
): Promise<void> {
  if (flags.verified !== undefined) {
    await db.query('UPDATE entertainers SET verified = $1, updated_at = $2 WHERE id = $3', [
      flags.verified,
      nowIso(),
      id,
    ]);
  }
  if (flags.featured !== undefined) {
    await db.query('UPDATE entertainers SET featured = $1, updated_at = $2 WHERE id = $3', [
      flags.featured,
      nowIso(),
      id,
    ]);
  }
}

export async function updateEntertainerProfile(
  db: Db,
  id: string,
  input: {
    stageName: string;
    realName: string | null;
    shortBio: string;
    fullBio: string;
    categoryId: string | null;
    homeCityId: string | null;
    countryOfOrigin: string;
    teamSize: number;
    languages: string[];
    equipmentProvided: string;
    equipmentRequired: string;
    travelRadiusKm: number;
    acceptsShortTerm: boolean;
    acceptsLongTerm: boolean;
    openToRelocate: boolean;
    contractLengths: ContractLength[];
    residencyInquiryPolicy: ResidencyInquiryPolicy;
    representationNote: string | null;
  },
): Promise<void> {
  await db.query(
    `UPDATE entertainers SET
       stage_name = $1, real_name = $2, short_bio = $3, full_bio = $4,
       category_id = $5, home_city_id = $6, country_of_origin = $7,
       team_size = $8, languages = $9, equipment_provided = $10,
       equipment_required = $11, travel_radius_km = $12,
       accepts_short_term = $13, accepts_long_term = $14, open_to_relocate = $15,
       contract_lengths = $16, residency_inquiry_policy = $17,
       representation_note = $18, updated_at = $19
     WHERE id = $20`,
    [
      input.stageName,
      input.realName,
      input.shortBio,
      input.fullBio,
      input.categoryId,
      input.homeCityId,
      input.countryOfOrigin,
      input.teamSize,
      JSON.stringify(input.languages),
      input.equipmentProvided,
      input.equipmentRequired,
      input.travelRadiusKm,
      input.acceptsShortTerm,
      input.acceptsLongTerm,
      input.openToRelocate,
      JSON.stringify(input.contractLengths),
      input.residencyInquiryPolicy,
      input.representationNote,
      nowIso(),
      id,
    ],
  );
}

export async function setEntertainerGenres(db: Db, id: string, genreIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM entertainer_genres WHERE entertainer_id = $1', [id]);
    for (const gid of genreIds) {
      await tx.query('INSERT INTO entertainer_genres (entertainer_id, genre_id) VALUES ($1, $2)', [id, gid]);
    }
  });
}

// ------------------------------------------------------------------- media --

export interface MediaRow {
  id: string;
  kind: 'video' | 'photo';
  url: string;
  title: string | null;
  accent: string | null;
  moderation: 'pending' | 'approved' | 'rejected';
}

export async function listMedia(db: Db, entertainerId: string, kind?: 'video' | 'photo'): Promise<MediaRow[]> {
  const { rows } = kind
    ? await db.query<MediaRow>(
        'SELECT id, kind, url, title, accent, moderation FROM media WHERE entertainer_id = $1 AND kind = $2 ORDER BY sort_order',
        [entertainerId, kind],
      )
    : await db.query<MediaRow>(
        'SELECT id, kind, url, title, accent, moderation FROM media WHERE entertainer_id = $1 ORDER BY sort_order',
        [entertainerId],
      );
  return rows;
}

/** Only approved media reaches a venue. */
export async function listPublicMedia(db: Db, entertainerId: string, kind?: 'video' | 'photo'): Promise<MediaRow[]> {
  return (await listMedia(db, entertainerId, kind)).filter((m) => m.moderation === 'approved');
}

export async function addMedia(
  db: Db,
  entertainerId: string,
  input: { kind: 'video' | 'photo'; url: string; title?: string; accent?: string },
): Promise<string> {
  const id = newId('med');
  const { rows } = await db.query<Row>('SELECT COUNT(*) AS n FROM media WHERE entertainer_id = $1', [entertainerId]);
  await db.query(
    `INSERT INTO media (id, entertainer_id, kind, url, title, accent, sort_order, moderation, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8)`,
    [id, entertainerId, input.kind, input.url, input.title ?? null, input.accent ?? null, num(rows[0].n), nowIso()],
  );
  return id;
}

export async function deleteMedia(db: Db, entertainerId: string, mediaId: string): Promise<void> {
  await db.query('DELETE FROM media WHERE id = $1 AND entertainer_id = $2', [mediaId, entertainerId]);
}

export async function setMediaModeration(db: Db, mediaId: string, moderation: 'approved' | 'rejected'): Promise<void> {
  await db.query('UPDATE media SET moderation = $1 WHERE id = $2', [moderation, mediaId]);
}

export async function countVideos(db: Db, entertainerId: string): Promise<number> {
  const { rows } = await db.query<Row>(
    "SELECT COUNT(*) AS n FROM media WHERE entertainer_id = $1 AND kind = 'video'",
    [entertainerId],
  );
  return num(rows[0].n);
}

// ------------------------------------------------------ awards & references --

export interface AwardRow {
  id: string;
  title: string;
  issuer: string;
  year: number;
}

export async function listAwards(db: Db, entertainerId: string): Promise<AwardRow[]> {
  const { rows } = await db.query<Row>(
    'SELECT id, title, issuer, year FROM awards WHERE entertainer_id = $1 ORDER BY year DESC',
    [entertainerId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    issuer: r.issuer as string,
    year: num(r.year),
  }));
}

export async function addAward(
  db: Db,
  entertainerId: string,
  input: { title: string; issuer: string; year: number },
): Promise<void> {
  await db.query('INSERT INTO awards (id, entertainer_id, title, issuer, year) VALUES ($1, $2, $3, $4, $5)', [
    newId('awd'),
    entertainerId,
    input.title,
    input.issuer,
    input.year,
  ]);
}

export interface ReferenceRow {
  id: string;
  quote: string;
  clientName: string;
  gigDate: string | null;
  logoAccent: string | null;
  moderation: 'pending' | 'approved' | 'rejected';
}

function mapReference(r: Row): ReferenceRow {
  return {
    id: r.id as string,
    quote: r.quote as string,
    clientName: r.client_name as string,
    gigDate: (r.gig_date as string | null) ?? null,
    logoAccent: (r.logo_accent as string | null) ?? null,
    moderation: r.moderation as ReferenceRow['moderation'],
  };
}

export async function listReferences(db: Db, entertainerId: string, approvedOnly = true): Promise<ReferenceRow[]> {
  const { rows } = approvedOnly
    ? await db.query<Row>(
        "SELECT * FROM references_quotes WHERE entertainer_id = $1 AND moderation = 'approved' ORDER BY created_at DESC",
        [entertainerId],
      )
    : await db.query<Row>('SELECT * FROM references_quotes WHERE entertainer_id = $1 ORDER BY created_at DESC', [
        entertainerId,
      ]);
  return rows.map(mapReference);
}

export async function referencesAwaitingModeration(
  db: Db,
): Promise<Array<ReferenceRow & { entertainerName: string }>> {
  const { rows } = await db.query<Row>(
    `SELECT r.*, e.stage_name FROM references_quotes r JOIN entertainers e ON e.id = r.entertainer_id
     WHERE r.moderation = 'pending' ORDER BY r.created_at`,
  );
  return rows.map((r) => ({ ...mapReference(r), entertainerName: r.stage_name as string }));
}

export async function addReference(
  db: Db,
  entertainerId: string,
  input: { quote: string; clientName: string; gigDate?: string | null; logoAccent?: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO references_quotes (id, entertainer_id, quote, client_name, gig_date, logo_accent, moderation, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
    [
      newId('ref'),
      entertainerId,
      input.quote,
      input.clientName,
      input.gigDate ?? null,
      input.logoAccent ?? null,
      nowIso(),
    ],
  );
}

export async function setReferenceModeration(
  db: Db,
  id: string,
  moderation: 'approved' | 'rejected',
): Promise<void> {
  await db.query('UPDATE references_quotes SET moderation = $1 WHERE id = $2', [moderation, id]);
}

// ------------------------------------------------------------------ venues --

export interface VenueRow {
  id: string;
  userId: string;
  name: string;
  venueType: string;
  cityId: string | null;
  accent: string;
}

function mapVenue(r: Row): VenueRow {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    name: r.name as string,
    venueType: r.venue_type as string,
    cityId: (r.city_id as string | null) ?? null,
    accent: r.accent as string,
  };
}

export async function getVenueForUser(db: Db, userId: string): Promise<VenueRow | null> {
  const { rows } = await db.query<Row>('SELECT * FROM venues WHERE user_id = $1', [userId]);
  return rows[0] ? mapVenue(rows[0]) : null;
}

export async function getVenueById(db: Db, id: string): Promise<VenueRow | null> {
  const { rows } = await db.query<Row>('SELECT * FROM venues WHERE id = $1', [id]);
  return rows[0] ? mapVenue(rows[0]) : null;
}

export async function createVenue(
  db: Db,
  input: { userId: string; name: string; venueType: string; cityId: string | null },
): Promise<VenueRow> {
  const id = newId('ven');
  await db.query(
    'INSERT INTO venues (id, user_id, name, venue_type, city_id, accent, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, input.userId, input.name, input.venueType, input.cityId, '#5fb0ff', nowIso()],
  );
  return (await getVenueById(db, id))!;
}

// -------------------------------------------------------------- shortlists --

export interface ShortlistRow {
  id: string;
  name: string;
  note: string | null;
  itemCount: number;
  entertainerIds: string[];
}

export async function listShortlists(db: Db, venueId: string): Promise<ShortlistRow[]> {
  const { rows } = await db.query<Row>(
    'SELECT id, name, note FROM shortlists WHERE venue_id = $1 ORDER BY created_at DESC',
    [venueId],
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id as string);
  const { rows: items } = await db.query<Row>(
    'SELECT shortlist_id, entertainer_id FROM shortlist_items WHERE shortlist_id = ANY($1) ORDER BY added_at',
    [ids],
  );
  const byList = groupBy(items, 'shortlist_id');
  return rows.map((r) => {
    const entertainerIds = (byList.get(r.id as string) ?? []).map((i) => i.entertainer_id as string);
    return {
      id: r.id as string,
      name: r.name as string,
      note: (r.note as string | null) ?? null,
      itemCount: entertainerIds.length,
      entertainerIds,
    };
  });
}

export async function createShortlist(
  db: Db,
  venueId: string,
  name: string,
  note?: string | null,
): Promise<string> {
  const id = newId('sl');
  await db.query('INSERT INTO shortlists (id, venue_id, name, note, created_at) VALUES ($1, $2, $3, $4, $5)', [
    id,
    venueId,
    name,
    note ?? null,
    nowIso(),
  ]);
  return id;
}

export async function addToShortlist(db: Db, shortlistId: string, entertainerId: string): Promise<void> {
  await db.query(
    'INSERT INTO shortlist_items (shortlist_id, entertainer_id, added_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [shortlistId, entertainerId, nowIso()],
  );
}

export async function removeFromShortlist(db: Db, shortlistId: string, entertainerId: string): Promise<void> {
  await db.query('DELETE FROM shortlist_items WHERE shortlist_id = $1 AND entertainer_id = $2', [
    shortlistId,
    entertainerId,
  ]);
}

export async function shortlistOwnedBy(db: Db, shortlistId: string, venueId: string): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM shortlists WHERE id = $1 AND venue_id = $2', [shortlistId, venueId]);
  return rows.length > 0;
}

// --------------------------------------------------------------- inquiries --

export interface InquiryRow {
  id: string;
  venueId: string;
  venueName: string;
  venueUserId: string;
  entertainerId: string;
  entertainerName: string;
  entertainerSlug: string;
  entertainerUserId: string;
  /** Set when an agency or manager represents the act, so they can act too. */
  entertainerManagerId: string | null;
  entertainerAccent: string;
  gigType: GigType;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  timeBlock: TimeBlock | null;
  hours: number | null;
  months: number | null;
  daysPerWeek: number | null;
  cityId: string | null;
  cityName: string | null;
  eventType: string | null;
  notes: string | null;
  currency: string;
  quotedAmount: number;
  offerAmount: number;
  rateBasis: string;
  status: InquiryStatus;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

const INQUIRY_SELECT = `
  SELECT i.*, v.name AS venue_name, v.user_id AS venue_user_id,
         e.stage_name AS entertainer_name, e.slug AS entertainer_slug,
         e.user_id AS entertainer_user_id, e.managed_by_user_id AS entertainer_manager_id,
         e.cover_accent AS entertainer_accent,
         city.name AS city_name
  FROM inquiries i
  JOIN venues v ON v.id = i.venue_id
  JOIN entertainers e ON e.id = i.entertainer_id
  LEFT JOIN cities city ON city.id = i.city_id
`;

function mapInquiry(r: Row): InquiryRow {
  return {
    id: r.id as string,
    venueId: r.venue_id as string,
    venueName: r.venue_name as string,
    venueUserId: r.venue_user_id as string,
    entertainerId: r.entertainer_id as string,
    entertainerName: r.entertainer_name as string,
    entertainerSlug: r.entertainer_slug as string,
    entertainerUserId: r.entertainer_user_id as string,
    entertainerManagerId: (r.entertainer_manager_id as string | null) ?? null,
    entertainerAccent: r.entertainer_accent as string,
    gigType: r.gig_type as GigType,
    startDate: (r.start_date as string | null) ?? null,
    endDate: (r.end_date as string | null) ?? null,
    timeBlock: (r.time_block as TimeBlock | null) ?? null,
    hours: numOrNull(r.hours),
    months: numOrNull(r.months),
    daysPerWeek: numOrNull(r.days_per_week),
    cityId: (r.city_id as string | null) ?? null,
    cityName: (r.city_name as string | null) ?? null,
    eventType: (r.event_type as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    currency: r.currency as string,
    quotedAmount: num(r.quoted_amount),
    offerAmount: num(r.offer_amount),
    rateBasis: r.rate_basis as string,
    status: r.status as InquiryStatus,
    cancelReason: (r.cancel_reason as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function createInquiry(
  db: Db,
  input: {
    venueId: string;
    entertainerId: string;
    gigType: GigType;
    startDate?: IsoDate | null;
    endDate?: IsoDate | null;
    timeBlock?: TimeBlock | null;
    hours?: number | null;
    months?: number | null;
    daysPerWeek?: number | null;
    cityId?: string | null;
    eventType?: string | null;
    notes?: string | null;
    currency: string;
    quotedAmount: number;
    offerAmount: number;
    rateBasis: string;
  },
): Promise<string> {
  const id = newId('inq');
  const now = nowIso();
  await db.query(
    `INSERT INTO inquiries (id, venue_id, entertainer_id, gig_type, start_date, end_date, time_block, hours,
                            months, days_per_week, city_id, event_type, notes, currency, quoted_amount,
                            offer_amount, rate_basis, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'new', $18, $18)`,
    [
      id,
      input.venueId,
      input.entertainerId,
      input.gigType,
      input.startDate ?? null,
      input.endDate ?? null,
      input.timeBlock ?? null,
      input.hours ?? null,
      input.months ?? null,
      input.daysPerWeek ?? null,
      input.cityId ?? null,
      input.eventType ?? null,
      input.notes ?? null,
      input.currency,
      input.quotedAmount,
      input.offerAmount,
      input.rateBasis,
      now,
    ],
  );
  await recordInquiryEvent(db, { inquiryId: id, from: null, to: 'new', actor: 'venue', actorId: input.venueId });
  return id;
}

export async function getInquiry(db: Db, id: string): Promise<InquiryRow | null> {
  const { rows } = await db.query<Row>(`${INQUIRY_SELECT} WHERE i.id = $1`, [id]);
  return rows[0] ? mapInquiry(rows[0]) : null;
}

export async function listInquiriesForVenue(db: Db, venueId: string): Promise<InquiryRow[]> {
  const { rows } = await db.query<Row>(`${INQUIRY_SELECT} WHERE i.venue_id = $1 ORDER BY i.updated_at DESC`, [venueId]);
  return rows.map(mapInquiry);
}

export async function listInquiriesForEntertainer(db: Db, entertainerId: string): Promise<InquiryRow[]> {
  const { rows } = await db.query<Row>(`${INQUIRY_SELECT} WHERE i.entertainer_id = $1 ORDER BY i.updated_at DESC`, [
    entertainerId,
  ]);
  return rows.map(mapInquiry);
}

export async function listAllInquiries(db: Db): Promise<InquiryRow[]> {
  const { rows } = await db.query<Row>(`${INQUIRY_SELECT} ORDER BY i.updated_at DESC`);
  return rows.map(mapInquiry);
}

export async function updateInquiryStatus(
  db: Db,
  id: string,
  status: InquiryStatus,
  fields: { offerAmount?: number | null; cancelReason?: string | null } = {},
): Promise<void> {
  await db.query(
    `UPDATE inquiries SET status = $1,
       offer_amount = COALESCE($2, offer_amount),
       cancel_reason = COALESCE($3, cancel_reason),
       updated_at = $4
     WHERE id = $5`,
    [status, fields.offerAmount ?? null, fields.cancelReason ?? null, nowIso(), id],
  );
}

export async function recordInquiryEvent(
  db: Db,
  input: {
    inquiryId: string;
    from: InquiryStatus | null;
    to: InquiryStatus;
    actor: string;
    actorId?: string | null;
    reason?: string | null;
    offer?: number | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO inquiry_events (id, inquiry_id, from_status, to_status, actor, actor_id, reason, offer, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newId('ev'),
      input.inquiryId,
      input.from,
      input.to,
      input.actor,
      input.actorId ?? null,
      input.reason ?? null,
      input.offer ?? null,
      nowIso(),
    ],
  );
}

export interface InquiryEventRow {
  id: string;
  fromStatus: InquiryStatus | null;
  toStatus: InquiryStatus;
  actor: string;
  reason: string | null;
  offer: number | null;
  createdAt: string;
}

export async function listInquiryEvents(db: Db, inquiryId: string): Promise<InquiryEventRow[]> {
  const { rows } = await db.query<Row>('SELECT * FROM inquiry_events WHERE inquiry_id = $1 ORDER BY created_at', [
    inquiryId,
  ]);
  return rows.map((r) => ({
    id: r.id as string,
    fromStatus: (r.from_status as InquiryStatus | null) ?? null,
    toStatus: r.to_status as InquiryStatus,
    actor: r.actor as string,
    reason: (r.reason as string | null) ?? null,
    offer: numOrNull(r.offer),
    createdAt: r.created_at as string,
  }));
}

// ---------------------------------------------------------------- messages --

export interface MessageRow {
  id: string;
  inquiryId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export async function listMessages(db: Db, inquiryId: string): Promise<MessageRow[]> {
  const { rows } = await db.query<Row>(
    `SELECT m.*, u.display_name FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.inquiry_id = $1 ORDER BY m.created_at`,
    [inquiryId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    inquiryId: r.inquiry_id as string,
    senderId: r.sender_id as string,
    senderName: r.display_name as string,
    body: r.body as string,
    createdAt: r.created_at as string,
    readAt: (r.read_at as string | null) ?? null,
  }));
}

export async function addMessage(db: Db, inquiryId: string, senderId: string, body: string): Promise<string> {
  const id = newId('msg');
  const now = nowIso();
  await db.query('INSERT INTO messages (id, inquiry_id, sender_id, body, created_at) VALUES ($1, $2, $3, $4, $5)', [
    id,
    inquiryId,
    senderId,
    body,
    now,
  ]);
  await db.query('UPDATE inquiries SET updated_at = $1 WHERE id = $2', [now, inquiryId]);
  return id;
}

export async function markThreadRead(db: Db, inquiryId: string, readerId: string): Promise<void> {
  await db.query(
    'UPDATE messages SET read_at = $1 WHERE inquiry_id = $2 AND sender_id <> $3 AND read_at IS NULL',
    [nowIso(), inquiryId, readerId],
  );
}

export async function unreadCount(db: Db, inquiryId: string, readerId: string): Promise<number> {
  const { rows } = await db.query<Row>(
    'SELECT COUNT(*) AS n FROM messages WHERE inquiry_id = $1 AND sender_id <> $2 AND read_at IS NULL',
    [inquiryId, readerId],
  );
  return num(rows[0].n);
}

// ----------------------------------------------------------------- reviews --

export interface ReviewRow {
  id: string;
  rating: number;
  body: string;
  venueName: string;
  createdAt: string;
  gigDate: string | null;
}

export async function listReviews(db: Db, entertainerId: string): Promise<ReviewRow[]> {
  const { rows } = await db.query<Row>(
    `SELECT r.id, r.rating, r.body, r.created_at, v.name AS venue_name, i.start_date
     FROM reviews r
     JOIN venues v ON v.id = r.venue_id
     JOIN inquiries i ON i.id = r.inquiry_id
     WHERE r.entertainer_id = $1 AND r.moderation = 'approved'
     ORDER BY r.created_at DESC`,
    [entertainerId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    rating: num(r.rating),
    body: r.body as string,
    venueName: r.venue_name as string,
    createdAt: r.created_at as string,
    gigDate: (r.start_date as string | null) ?? null,
  }));
}

export async function createReview(
  db: Db,
  input: { inquiryId: string; entertainerId: string; venueId: string; rating: number; body: string },
): Promise<void> {
  await db.query(
    `INSERT INTO reviews (id, inquiry_id, entertainer_id, venue_id, rating, body, moderation, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7)`,
    [newId('rev'), input.inquiryId, input.entertainerId, input.venueId, input.rating, input.body, nowIso()],
  );
}

export async function reviewForInquiry(db: Db, inquiryId: string): Promise<{ id: string } | null> {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM reviews WHERE inquiry_id = $1', [inquiryId]);
  return rows[0] ?? null;
}

// ----------------------------------------------------------- notifications --

export interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function notify(
  db: Db,
  input: { userId: string; kind: string; title: string; body?: string; link?: string | null },
): Promise<void> {
  await db.query(
    'INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [newId('ntf'), input.userId, input.kind, input.title, input.body ?? '', input.link ?? null, nowIso()],
  );
}

export async function listNotifications(db: Db, userId: string, limit = 30): Promise<NotificationRow[]> {
  const { rows } = await db.query<Row>(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    title: r.title as string,
    body: r.body as string,
    link: (r.link as string | null) ?? null,
    readAt: (r.read_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function unreadNotificationCount(db: Db, userId: string): Promise<number> {
  const { rows } = await db.query<Row>(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return num(rows[0].n);
}

export async function markNotificationsRead(db: Db, userId: string): Promise<void> {
  await db.query('UPDATE notifications SET read_at = $1 WHERE user_id = $2 AND read_at IS NULL', [nowIso(), userId]);
}

// ----------------------------------------------------------- subscriptions --

export interface SubscriptionRow {
  id: string;
  plan: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  renewsAt: string | null;
}

export async function getSubscription(db: Db, userId: string): Promise<SubscriptionRow | null> {
  const { rows } = await db.query<Row>(
    'SELECT id, plan, status, renews_at FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as string,
    plan: row.plan as string,
    status: row.status as SubscriptionRow['status'],
    renewsAt: (row.renews_at as string | null) ?? null,
  };
}

export async function createSubscription(
  db: Db,
  input: { userId: string; plan: string; status: SubscriptionRow['status']; renewsAt: string | null },
): Promise<void> {
  await db.query(
    'INSERT INTO subscriptions (id, user_id, plan, status, renews_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [newId('sub'), input.userId, input.plan, input.status, input.renewsAt, nowIso()],
  );
}
