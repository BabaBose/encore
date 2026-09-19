/**
 * Repositories: the only place SQL and the domain types meet.
 *
 * Everything above this file works with domain records (`EntertainerRecord`,
 * `RateCard`, `AvailabilityBlock`), never with rows, so a schema change stops
 * here.
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

const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------------ cities --

export function listCities(db: Db): CityRef[] {
  return db.prepare('SELECT id, name, country, lat, lng FROM cities ORDER BY name').all() as CityRef[];
}

export function getCity(db: Db, id: string): CityRef | null {
  return (db.prepare('SELECT id, name, country, lat, lng FROM cities WHERE id = ?').get(id) as CityRef) ?? null;
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

export function listCategories(db: Db): CategoryRow[] {
  const rows = db
    .prepare('SELECT id, parent_id, slug, label, accent, sort_order FROM categories ORDER BY sort_order, label')
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    slug: r.slug as string,
    label: r.label as string,
    accent: (r.accent as string | null) ?? null,
    sortOrder: r.sort_order as number,
  }));
}

export function topCategories(db: Db): CategoryRow[] {
  return listCategories(db).filter((c) => c.parentId === null);
}

export function genresFor(db: Db, categoryId: string): CategoryRow[] {
  return listCategories(db).filter((c) => c.parentId === categoryId);
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

function mapUser(r: Record<string, unknown>): UserRow {
  return {
    id: r.id as string,
    email: r.email as string,
    passwordHash: r.password_hash as string,
    role: r.role as UserRole,
    displayName: r.display_name as string,
    createdAt: r.created_at as string,
  };
}

export function findUserByEmail(db: Db, email: string): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as
    | Record<string, unknown>
    | undefined;
  return row ? mapUser(row) : null;
}

export function findUserById(db: Db, id: string): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function createUser(
  db: Db,
  input: { email: string; passwordHash: string; role: UserRole; displayName: string },
): UserRow {
  const id = newId('usr');
  db.prepare(
    'INSERT INTO users (id, email, password_hash, role, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, input.email.toLowerCase(), input.passwordHash, input.role, input.displayName, nowIso());
  return findUserById(db, id)!;
}

// ---------------------------------------------------------------- sessions --

export function createSession(db: Db, token: string, userId: string, expiresAt: string): void {
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    nowIso(),
    expiresAt,
  );
}

export function findSessionUser(db: Db, token: string): UserRow | null {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, nowIso()) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ------------------------------------------------------------- rate cards --

export function loadRateCard(db: Db, entertainerId: string): RateCard {
  const card = db.prepare('SELECT * FROM rate_cards WHERE entertainer_id = ?').get(entertainerId) as
    | Record<string, unknown>
    | undefined;

  const rules = (
    db
      .prepare('SELECT weekday, time_block, hourly, minimum_hours FROM rate_rules WHERE entertainer_id = ?')
      .all(entertainerId) as Array<Record<string, unknown>>
  ).map<RateRule>((r) => ({
    weekday: r.weekday as Weekday,
    timeBlock: r.time_block as TimeBlock,
    hourly: r.hourly as number,
    minimumHours: (r.minimum_hours as number | null) ?? undefined,
  }));

  const specialDates = (
    db
      .prepare('SELECT date, label, hourly, minimum_hours FROM special_date_rates WHERE entertainer_id = ? ORDER BY date')
      .all(entertainerId) as Array<Record<string, unknown>>
  ).map<SpecialDateRate>((r) => ({
    date: r.date as IsoDate,
    label: r.label as string,
    hourly: r.hourly as number,
    minimumHours: (r.minimum_hours as number | null) ?? undefined,
  }));

  const contractLengths = JSON.parse(
    (db.prepare('SELECT contract_lengths FROM entertainers WHERE id = ?').get(entertainerId) as
      | { contract_lengths: string }
      | undefined)?.contract_lengths ?? '[]',
  ) as ContractLength[];

  const hasResidency = card && (card.residency_weekly != null || card.residency_monthly != null);

  return {
    currency: (card?.currency as string) ?? 'AED',
    baseHourly: (card?.base_hourly as number) ?? 0,
    minimumHours: (card?.minimum_hours as number) ?? 1,
    rules,
    specialDates,
    residency: hasResidency
      ? {
          weekly: (card.residency_weekly as number | null) ?? undefined,
          monthly: (card.residency_monthly as number | null) ?? undefined,
          daysPerWeekIncluded: (card.days_per_week_included as number) ?? 5,
          extraDayRate: (card.extra_day_rate as number | null) ?? undefined,
          contractLengths,
        }
      : undefined,
  };
}

export function isRateCardPublished(db: Db, entertainerId: string): boolean {
  const row = db.prepare('SELECT published FROM rate_cards WHERE entertainer_id = ?').get(entertainerId) as
    | { published: number }
    | undefined;
  return !!row?.published;
}

export function upsertRateCard(
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
): void {
  db.prepare(
    `INSERT INTO rate_cards (entertainer_id, currency, base_hourly, minimum_hours, residency_weekly,
                             residency_monthly, days_per_week_included, extra_day_rate, published, updated_at)
     VALUES (@id, @currency, @baseHourly, @minimumHours, @weekly, @monthly, @days, @extra, @published, @now)
     ON CONFLICT(entertainer_id) DO UPDATE SET
       currency = @currency, base_hourly = @baseHourly, minimum_hours = @minimumHours,
       residency_weekly = @weekly, residency_monthly = @monthly, days_per_week_included = @days,
       extra_day_rate = @extra, published = @published, updated_at = @now`,
  ).run({
    id: entertainerId,
    currency: input.currency,
    baseHourly: input.baseHourly,
    minimumHours: input.minimumHours,
    weekly: input.residencyWeekly ?? null,
    monthly: input.residencyMonthly ?? null,
    days: input.daysPerWeekIncluded,
    extra: input.extraDayRate ?? null,
    published: input.published ? 1 : 0,
    now: nowIso(),
  });
}

export function setRateRule(
  db: Db,
  entertainerId: string,
  rule: { weekday: Weekday; timeBlock: TimeBlock; hourly: number; minimumHours?: number | null },
): void {
  // An hourly rate of zero means "not offered", so the rule is removed rather
  // than stored as a free gig.
  if (rule.hourly <= 0) {
    db.prepare('DELETE FROM rate_rules WHERE entertainer_id = ? AND weekday = ? AND time_block = ?').run(
      entertainerId,
      rule.weekday,
      rule.timeBlock,
    );
    return;
  }
  db.prepare(
    `INSERT INTO rate_rules (id, entertainer_id, weekday, time_block, hourly, minimum_hours)
     VALUES (@id, @ent, @weekday, @block, @hourly, @min)
     ON CONFLICT(entertainer_id, weekday, time_block)
     DO UPDATE SET hourly = @hourly, minimum_hours = @min`,
  ).run({
    id: newId('rr'),
    ent: entertainerId,
    weekday: rule.weekday,
    block: rule.timeBlock,
    hourly: rule.hourly,
    min: rule.minimumHours ?? null,
  });
}

export function addSpecialDate(
  db: Db,
  entertainerId: string,
  input: { date: IsoDate; label: string; hourly: number; minimumHours?: number | null },
): void {
  db.prepare(
    `INSERT INTO special_date_rates (id, entertainer_id, date, label, hourly, minimum_hours)
     VALUES (@id, @ent, @date, @label, @hourly, @min)
     ON CONFLICT(entertainer_id, date)
     DO UPDATE SET label = @label, hourly = @hourly, minimum_hours = @min`,
  ).run({
    id: newId('sd'),
    ent: entertainerId,
    date: input.date,
    label: input.label,
    hourly: input.hourly,
    min: input.minimumHours ?? null,
  });
}

export function removeSpecialDate(db: Db, entertainerId: string, date: IsoDate): void {
  db.prepare('DELETE FROM special_date_rates WHERE entertainer_id = ? AND date = ?').run(entertainerId, date);
}

// ------------------------------------------------------------ availability --

export function loadBlocks(db: Db, entertainerId: string): AvailabilityBlock[] {
  const rows = db
    .prepare('SELECT * FROM availability_blocks WHERE entertainer_id = ?')
    .all(entertainerId) as Array<Record<string, unknown>>;
  return rows.map(mapBlock);
}

function mapBlock(r: Record<string, unknown>): AvailabilityBlock {
  return {
    id: r.id as string,
    kind: r.kind as BlockKind,
    source: r.source as BlockSource,
    start: (r.start_date as string | null) ?? undefined,
    end: (r.end_date as string | null) ?? undefined,
    weekday: (r.weekday as Weekday | null) ?? undefined,
    recurFrom: (r.recur_from as string | null) ?? undefined,
    recurUntil: (r.recur_until as string | null) ?? undefined,
    bookingId: (r.inquiry_id as string | null) ?? undefined,
    note: (r.note as string | null) ?? undefined,
  };
}

export function insertBlock(db: Db, entertainerId: string, block: AvailabilityBlock): void {
  db.prepare(
    `INSERT INTO availability_blocks (id, entertainer_id, kind, source, start_date, end_date,
                                      weekday, recur_from, recur_until, inquiry_id, note, created_at)
     VALUES (@id, @ent, @kind, @source, @start, @end, @weekday, @from, @until, @inquiry, @note, @now)`,
  ).run({
    id: block.id,
    ent: entertainerId,
    kind: block.kind,
    source: block.source,
    start: block.start ?? null,
    end: block.end ?? null,
    weekday: block.weekday ?? null,
    from: block.recurFrom ?? null,
    until: block.recurUntil ?? null,
    inquiry: block.bookingId ?? null,
    note: block.note ?? null,
    now: nowIso(),
  });
}

export function deleteBlock(db: Db, entertainerId: string, blockId: string): void {
  // Scoped to `source = 'manual'` in SQL as well as in the domain check, so a
  // booking's hold on a date cannot be dropped even by a direct call.
  db.prepare("DELETE FROM availability_blocks WHERE id = ? AND entertainer_id = ? AND source = 'manual'").run(
    blockId,
    entertainerId,
  );
}

export function deleteBookingBlocks(db: Db, inquiryId: string): void {
  db.prepare("DELETE FROM availability_blocks WHERE inquiry_id = ? AND source = 'booking'").run(inquiryId);
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

function mapEntertainer(db: Db, r: Record<string, unknown>): EntertainerDetail {
  const id = r.id as string;
  const genres = db
    .prepare(
      `SELECT c.slug, c.label FROM entertainer_genres g JOIN categories c ON c.id = g.genre_id
       WHERE g.entertainer_id = ?`,
    )
    .all(id) as Array<{ slug: string; label: string }>;

  const travelCities = db
    .prepare(
      `SELECT c.id, c.name FROM entertainer_travel_cities t JOIN cities c ON c.id = t.city_id
       WHERE t.entertainer_id = ?`,
    )
    .all(id) as Array<{ id: string; name: string }>;

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
    genres: genres.map((g) => g.slug),
    genreLabels: genres.map((g) => g.label),
    countryOfOrigin: r.country_of_origin as string,
    homeCity: {
      id: (r.city_id as string) ?? '',
      name: (r.city_name as string) ?? '',
      country: (r.city_country as string) ?? '',
      lat: (r.city_lat as number) ?? 0,
      lng: (r.city_lng as number) ?? 0,
    },
    travelCities: travelCities.map((c) => c.id),
    travelCityNames: travelCities.map((c) => c.name),
    travelRadiusKm: r.travel_radius_km as number,
    acceptsShortTerm: !!r.accepts_short_term,
    acceptsLongTerm: !!r.accepts_long_term,
    openToRelocate: !!r.open_to_relocate,
    contractLengths: JSON.parse((r.contract_lengths as string) ?? '[]') as ContractLength[],
    residencyInquiryPolicy: ((r.residency_inquiry_policy as string) ??
      'when_largely_free') as ResidencyInquiryPolicy,
    rateCard: loadRateCard(db, id),
    rateCardPublished: isRateCardPublished(db, id),
    blocks: loadBlocks(db, id),
    rating: r.rating == null ? null : Math.round((r.rating as number) * 10) / 10,
    reviewCount: (r.review_count as number) ?? 0,
    verified: !!r.verified,
    featured: !!r.featured,
    status: r.status as ProfileStatus,
    reviewNote: (r.review_note as string | null) ?? null,
    isLive: r.status === 'live',
    heroAccent: r.cover_accent as string,
    teamSize: r.team_size as number,
    languages: JSON.parse((r.languages as string) ?? '[]') as string[],
    equipmentProvided: r.equipment_provided as string,
    equipmentRequired: r.equipment_required as string,
  };
}

/** The discoverable pool. Search filters this in the domain layer. */
export function liveEntertainers(db: Db): EntertainerDetail[] {
  const rows = db.prepare(`${ENTERTAINER_SELECT} WHERE e.status = 'live'`).all() as Array<Record<string, unknown>>;
  return rows.map((r) => mapEntertainer(db, r));
}

export function allEntertainers(db: Db): EntertainerDetail[] {
  const rows = db.prepare(`${ENTERTAINER_SELECT} ORDER BY e.created_at DESC`).all() as Array<Record<string, unknown>>;
  return rows.map((r) => mapEntertainer(db, r));
}

export function entertainersAwaitingReview(db: Db): EntertainerDetail[] {
  const rows = db
    .prepare(`${ENTERTAINER_SELECT} WHERE e.status = 'pending_review' ORDER BY e.updated_at`)
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => mapEntertainer(db, r));
}

export function getEntertainerBySlug(db: Db, slug: string): EntertainerDetail | null {
  const row = db.prepare(`${ENTERTAINER_SELECT} WHERE e.slug = ?`).get(slug) as Record<string, unknown> | undefined;
  return row ? mapEntertainer(db, row) : null;
}

export function getEntertainerById(db: Db, id: string): EntertainerDetail | null {
  const row = db.prepare(`${ENTERTAINER_SELECT} WHERE e.id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? mapEntertainer(db, row) : null;
}

export function getEntertainerForUser(db: Db, userId: string): EntertainerDetail | null {
  const row = db.prepare(`${ENTERTAINER_SELECT} WHERE e.user_id = ?`).get(userId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapEntertainer(db, row) : null;
}

/** Every act an agency or manager represents, for the phase-2 roster view. */
export function getEntertainersManagedBy(db: Db, userId: string): EntertainerDetail[] {
  const rows = db
    .prepare(`${ENTERTAINER_SELECT} WHERE e.managed_by_user_id = ? ORDER BY e.stage_name`)
    .all(userId) as Array<Record<string, unknown>>;
  return rows.map((r) => mapEntertainer(db, r));
}

export function updateEntertainerStatus(db: Db, id: string, status: ProfileStatus, note: string | null): void {
  db.prepare('UPDATE entertainers SET status = ?, review_note = ?, updated_at = ? WHERE id = ?').run(
    status,
    note,
    nowIso(),
    id,
  );
}

export function setEntertainerFlags(
  db: Db,
  id: string,
  flags: { verified?: boolean; featured?: boolean },
): void {
  if (flags.verified !== undefined) {
    db.prepare('UPDATE entertainers SET verified = ?, updated_at = ? WHERE id = ?').run(
      flags.verified ? 1 : 0,
      nowIso(),
      id,
    );
  }
  if (flags.featured !== undefined) {
    db.prepare('UPDATE entertainers SET featured = ?, updated_at = ? WHERE id = ?').run(
      flags.featured ? 1 : 0,
      nowIso(),
      id,
    );
  }
}

export function updateEntertainerProfile(
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
): void {
  db.prepare(
    `UPDATE entertainers SET
       stage_name = @stageName, real_name = @realName, short_bio = @shortBio, full_bio = @fullBio,
       category_id = @categoryId, home_city_id = @homeCityId, country_of_origin = @country,
       team_size = @teamSize, languages = @languages, equipment_provided = @provided,
       equipment_required = @required, travel_radius_km = @radius,
       accepts_short_term = @short, accepts_long_term = @long, open_to_relocate = @relocate,
       contract_lengths = @lengths, residency_inquiry_policy = @residencyPolicy,
       representation_note = @repNote, updated_at = @now
     WHERE id = @id`,
  ).run({
    id,
    stageName: input.stageName,
    realName: input.realName,
    shortBio: input.shortBio,
    fullBio: input.fullBio,
    categoryId: input.categoryId,
    homeCityId: input.homeCityId,
    country: input.countryOfOrigin,
    teamSize: input.teamSize,
    languages: JSON.stringify(input.languages),
    provided: input.equipmentProvided,
    required: input.equipmentRequired,
    radius: input.travelRadiusKm,
    short: input.acceptsShortTerm ? 1 : 0,
    long: input.acceptsLongTerm ? 1 : 0,
    relocate: input.openToRelocate ? 1 : 0,
    lengths: JSON.stringify(input.contractLengths),
    residencyPolicy: input.residencyInquiryPolicy,
    repNote: input.representationNote,
    now: nowIso(),
  });
}

export function setEntertainerGenres(db: Db, id: string, genreIds: string[]): void {
  const tx = db.transaction((ids: string[]) => {
    db.prepare('DELETE FROM entertainer_genres WHERE entertainer_id = ?').run(id);
    const insert = db.prepare('INSERT INTO entertainer_genres (entertainer_id, genre_id) VALUES (?, ?)');
    for (const gid of ids) insert.run(id, gid);
  });
  tx(genreIds);
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

export function listMedia(db: Db, entertainerId: string, kind?: 'video' | 'photo'): MediaRow[] {
  const sql = kind
    ? 'SELECT id, kind, url, title, accent, moderation FROM media WHERE entertainer_id = ? AND kind = ? ORDER BY sort_order'
    : 'SELECT id, kind, url, title, accent, moderation FROM media WHERE entertainer_id = ? ORDER BY sort_order';
  const rows = kind
    ? (db.prepare(sql).all(entertainerId, kind) as MediaRow[])
    : (db.prepare(sql).all(entertainerId) as MediaRow[]);
  return rows;
}

/** Only approved media reaches a venue. */
export function listPublicMedia(db: Db, entertainerId: string, kind?: 'video' | 'photo'): MediaRow[] {
  return listMedia(db, entertainerId, kind).filter((m) => m.moderation === 'approved');
}

export function addMedia(
  db: Db,
  entertainerId: string,
  input: { kind: 'video' | 'photo'; url: string; title?: string; accent?: string },
): string {
  const id = newId('med');
  const order = (db.prepare('SELECT COUNT(*) AS n FROM media WHERE entertainer_id = ?').get(entertainerId) as {
    n: number;
  }).n;
  db.prepare(
    `INSERT INTO media (id, entertainer_id, kind, url, title, accent, sort_order, moderation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
  ).run(id, entertainerId, input.kind, input.url, input.title ?? null, input.accent ?? null, order, nowIso());
  return id;
}

export function deleteMedia(db: Db, entertainerId: string, mediaId: string): void {
  db.prepare('DELETE FROM media WHERE id = ? AND entertainer_id = ?').run(mediaId, entertainerId);
}

export function setMediaModeration(db: Db, mediaId: string, moderation: 'approved' | 'rejected'): void {
  db.prepare('UPDATE media SET moderation = ? WHERE id = ?').run(moderation, mediaId);
}

export function countVideos(db: Db, entertainerId: string): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM media WHERE entertainer_id = ? AND kind = 'video'").get(entertainerId) as {
      n: number;
    }
  ).n;
}

// ------------------------------------------------------ awards & references --

export interface AwardRow {
  id: string;
  title: string;
  issuer: string;
  year: number;
}

export function listAwards(db: Db, entertainerId: string): AwardRow[] {
  return db
    .prepare('SELECT id, title, issuer, year FROM awards WHERE entertainer_id = ? ORDER BY year DESC')
    .all(entertainerId) as AwardRow[];
}

export function addAward(db: Db, entertainerId: string, input: { title: string; issuer: string; year: number }): void {
  db.prepare('INSERT INTO awards (id, entertainer_id, title, issuer, year) VALUES (?, ?, ?, ?, ?)').run(
    newId('awd'),
    entertainerId,
    input.title,
    input.issuer,
    input.year,
  );
}

export interface ReferenceRow {
  id: string;
  quote: string;
  clientName: string;
  gigDate: string | null;
  logoAccent: string | null;
  moderation: 'pending' | 'approved' | 'rejected';
}

function mapReference(r: Record<string, unknown>): ReferenceRow {
  return {
    id: r.id as string,
    quote: r.quote as string,
    clientName: r.client_name as string,
    gigDate: (r.gig_date as string | null) ?? null,
    logoAccent: (r.logo_accent as string | null) ?? null,
    moderation: r.moderation as ReferenceRow['moderation'],
  };
}

export function listReferences(db: Db, entertainerId: string, approvedOnly = true): ReferenceRow[] {
  const sql = approvedOnly
    ? "SELECT * FROM references_quotes WHERE entertainer_id = ? AND moderation = 'approved' ORDER BY created_at DESC"
    : 'SELECT * FROM references_quotes WHERE entertainer_id = ? ORDER BY created_at DESC';
  return (db.prepare(sql).all(entertainerId) as Array<Record<string, unknown>>).map(mapReference);
}

export function referencesAwaitingModeration(db: Db): Array<ReferenceRow & { entertainerName: string }> {
  const rows = db
    .prepare(
      `SELECT r.*, e.stage_name FROM references_quotes r JOIN entertainers e ON e.id = r.entertainer_id
       WHERE r.moderation = 'pending' ORDER BY r.created_at`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({ ...mapReference(r), entertainerName: r.stage_name as string }));
}

export function addReference(
  db: Db,
  entertainerId: string,
  input: { quote: string; clientName: string; gigDate?: string | null; logoAccent?: string | null },
): void {
  db.prepare(
    `INSERT INTO references_quotes (id, entertainer_id, quote, client_name, gig_date, logo_accent, moderation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    newId('ref'),
    entertainerId,
    input.quote,
    input.clientName,
    input.gigDate ?? null,
    input.logoAccent ?? null,
    nowIso(),
  );
}

export function setReferenceModeration(db: Db, id: string, moderation: 'approved' | 'rejected'): void {
  db.prepare('UPDATE references_quotes SET moderation = ? WHERE id = ?').run(moderation, id);
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

function mapVenue(r: Record<string, unknown>): VenueRow {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    name: r.name as string,
    venueType: r.venue_type as string,
    cityId: (r.city_id as string | null) ?? null,
    accent: r.accent as string,
  };
}

export function getVenueForUser(db: Db, userId: string): VenueRow | null {
  const row = db.prepare('SELECT * FROM venues WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  return row ? mapVenue(row) : null;
}

export function getVenueById(db: Db, id: string): VenueRow | null {
  const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapVenue(row) : null;
}

export function createVenue(
  db: Db,
  input: { userId: string; name: string; venueType: string; cityId: string | null },
): VenueRow {
  const id = newId('ven');
  db.prepare(
    'INSERT INTO venues (id, user_id, name, venue_type, city_id, accent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, input.userId, input.name, input.venueType, input.cityId, '#5fb0ff', nowIso());
  return getVenueById(db, id)!;
}

// -------------------------------------------------------------- shortlists --

export interface ShortlistRow {
  id: string;
  name: string;
  note: string | null;
  itemCount: number;
  entertainerIds: string[];
}

export function listShortlists(db: Db, venueId: string): ShortlistRow[] {
  const rows = db
    .prepare('SELECT id, name, note FROM shortlists WHERE venue_id = ? ORDER BY created_at DESC')
    .all(venueId) as Array<{ id: string; name: string; note: string | null }>;
  const items = db.prepare('SELECT entertainer_id FROM shortlist_items WHERE shortlist_id = ? ORDER BY added_at');
  return rows.map((r) => {
    const ids = (items.all(r.id) as Array<{ entertainer_id: string }>).map((i) => i.entertainer_id);
    return { ...r, itemCount: ids.length, entertainerIds: ids };
  });
}

export function createShortlist(db: Db, venueId: string, name: string, note?: string | null): string {
  const id = newId('sl');
  db.prepare('INSERT INTO shortlists (id, venue_id, name, note, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    venueId,
    name,
    note ?? null,
    nowIso(),
  );
  return id;
}

export function addToShortlist(db: Db, shortlistId: string, entertainerId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO shortlist_items (shortlist_id, entertainer_id, added_at) VALUES (?, ?, ?)',
  ).run(shortlistId, entertainerId, nowIso());
}

export function removeFromShortlist(db: Db, shortlistId: string, entertainerId: string): void {
  db.prepare('DELETE FROM shortlist_items WHERE shortlist_id = ? AND entertainer_id = ?').run(
    shortlistId,
    entertainerId,
  );
}

export function shortlistOwnedBy(db: Db, shortlistId: string, venueId: string): boolean {
  return !!db.prepare('SELECT 1 FROM shortlists WHERE id = ? AND venue_id = ?').get(shortlistId, venueId);
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
  unreadCount?: number;
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

function mapInquiry(r: Record<string, unknown>): InquiryRow {
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
    hours: (r.hours as number | null) ?? null,
    months: (r.months as number | null) ?? null,
    daysPerWeek: (r.days_per_week as number | null) ?? null,
    cityId: (r.city_id as string | null) ?? null,
    cityName: (r.city_name as string | null) ?? null,
    eventType: (r.event_type as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    currency: r.currency as string,
    quotedAmount: r.quoted_amount as number,
    offerAmount: r.offer_amount as number,
    rateBasis: r.rate_basis as string,
    status: r.status as InquiryStatus,
    cancelReason: (r.cancel_reason as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function createInquiry(
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
): string {
  const id = newId('inq');
  db.prepare(
    `INSERT INTO inquiries (id, venue_id, entertainer_id, gig_type, start_date, end_date, time_block, hours,
                            months, days_per_week, city_id, event_type, notes, currency, quoted_amount,
                            offer_amount, rate_basis, status, created_at, updated_at)
     VALUES (@id, @venue, @ent, @gigType, @start, @end, @block, @hours, @months, @days, @city, @eventType,
             @notes, @currency, @quoted, @offer, @basis, 'new', @now, @now)`,
  ).run({
    id,
    venue: input.venueId,
    ent: input.entertainerId,
    gigType: input.gigType,
    start: input.startDate ?? null,
    end: input.endDate ?? null,
    block: input.timeBlock ?? null,
    hours: input.hours ?? null,
    months: input.months ?? null,
    days: input.daysPerWeek ?? null,
    city: input.cityId ?? null,
    eventType: input.eventType ?? null,
    notes: input.notes ?? null,
    currency: input.currency,
    quoted: input.quotedAmount,
    offer: input.offerAmount,
    basis: input.rateBasis,
    now: nowIso(),
  });
  recordInquiryEvent(db, { inquiryId: id, from: null, to: 'new', actor: 'venue', actorId: input.venueId });
  return id;
}

export function getInquiry(db: Db, id: string): InquiryRow | null {
  const row = db.prepare(`${INQUIRY_SELECT} WHERE i.id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? mapInquiry(row) : null;
}

export function listInquiriesForVenue(db: Db, venueId: string): InquiryRow[] {
  const rows = db
    .prepare(`${INQUIRY_SELECT} WHERE i.venue_id = ? ORDER BY i.updated_at DESC`)
    .all(venueId) as Array<Record<string, unknown>>;
  return rows.map(mapInquiry);
}

export function listInquiriesForEntertainer(db: Db, entertainerId: string): InquiryRow[] {
  const rows = db
    .prepare(`${INQUIRY_SELECT} WHERE i.entertainer_id = ? ORDER BY i.updated_at DESC`)
    .all(entertainerId) as Array<Record<string, unknown>>;
  return rows.map(mapInquiry);
}

export function listAllInquiries(db: Db): InquiryRow[] {
  const rows = db.prepare(`${INQUIRY_SELECT} ORDER BY i.updated_at DESC`).all() as Array<Record<string, unknown>>;
  return rows.map(mapInquiry);
}

export function updateInquiryStatus(
  db: Db,
  id: string,
  status: InquiryStatus,
  fields: { offerAmount?: number | null; cancelReason?: string | null } = {},
): void {
  db.prepare(
    `UPDATE inquiries SET status = ?,
       offer_amount = COALESCE(?, offer_amount),
       cancel_reason = COALESCE(?, cancel_reason),
       updated_at = ?
     WHERE id = ?`,
  ).run(status, fields.offerAmount ?? null, fields.cancelReason ?? null, nowIso(), id);
}

export function recordInquiryEvent(
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
): void {
  db.prepare(
    `INSERT INTO inquiry_events (id, inquiry_id, from_status, to_status, actor, actor_id, reason, offer, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId('ev'),
    input.inquiryId,
    input.from,
    input.to,
    input.actor,
    input.actorId ?? null,
    input.reason ?? null,
    input.offer ?? null,
    nowIso(),
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

export function listInquiryEvents(db: Db, inquiryId: string): InquiryEventRow[] {
  const rows = db
    .prepare('SELECT * FROM inquiry_events WHERE inquiry_id = ? ORDER BY created_at')
    .all(inquiryId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    fromStatus: (r.from_status as InquiryStatus | null) ?? null,
    toStatus: r.to_status as InquiryStatus,
    actor: r.actor as string,
    reason: (r.reason as string | null) ?? null,
    offer: (r.offer as number | null) ?? null,
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

export function listMessages(db: Db, inquiryId: string): MessageRow[] {
  const rows = db
    .prepare(
      `SELECT m.*, u.display_name FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.inquiry_id = ? ORDER BY m.created_at`,
    )
    .all(inquiryId) as Array<Record<string, unknown>>;
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

export function addMessage(db: Db, inquiryId: string, senderId: string, body: string): string {
  const id = newId('msg');
  db.prepare('INSERT INTO messages (id, inquiry_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    inquiryId,
    senderId,
    body,
    nowIso(),
  );
  db.prepare('UPDATE inquiries SET updated_at = ? WHERE id = ?').run(nowIso(), inquiryId);
  return id;
}

export function markThreadRead(db: Db, inquiryId: string, readerId: string): void {
  db.prepare('UPDATE messages SET read_at = ? WHERE inquiry_id = ? AND sender_id != ? AND read_at IS NULL').run(
    nowIso(),
    inquiryId,
    readerId,
  );
}

export function unreadCount(db: Db, inquiryId: string, readerId: string): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM messages WHERE inquiry_id = ? AND sender_id != ? AND read_at IS NULL')
      .get(inquiryId, readerId) as { n: number }
  ).n;
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

export function listReviews(db: Db, entertainerId: string): ReviewRow[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.rating, r.body, r.created_at, v.name AS venue_name, i.start_date
       FROM reviews r
       JOIN venues v ON v.id = r.venue_id
       JOIN inquiries i ON i.id = r.inquiry_id
       WHERE r.entertainer_id = ? AND r.moderation = 'approved'
       ORDER BY r.created_at DESC`,
    )
    .all(entertainerId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as string,
    rating: r.rating as number,
    body: r.body as string,
    venueName: r.venue_name as string,
    createdAt: r.created_at as string,
    gigDate: (r.start_date as string | null) ?? null,
  }));
}

export function createReview(
  db: Db,
  input: { inquiryId: string; entertainerId: string; venueId: string; rating: number; body: string },
): void {
  db.prepare(
    `INSERT INTO reviews (id, inquiry_id, entertainer_id, venue_id, rating, body, moderation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'approved', ?)`,
  ).run(newId('rev'), input.inquiryId, input.entertainerId, input.venueId, input.rating, input.body, nowIso());
}

export function reviewForInquiry(db: Db, inquiryId: string): { id: string } | null {
  return (db.prepare('SELECT id FROM reviews WHERE inquiry_id = ?').get(inquiryId) as { id: string }) ?? null;
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

export function notify(
  db: Db,
  input: { userId: string; kind: string; title: string; body?: string; link?: string | null },
): void {
  db.prepare(
    'INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(newId('ntf'), input.userId, input.kind, input.title, input.body ?? '', input.link ?? null, nowIso());
}

export function listNotifications(db: Db, userId: string, limit = 30): NotificationRow[] {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit) as Array<Record<string, unknown>>;
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

export function unreadNotificationCount(db: Db, userId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId) as {
      n: number;
    }
  ).n;
}

export function markNotificationsRead(db: Db, userId: string): void {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(nowIso(), userId);
}

// ----------------------------------------------------------- subscriptions --

export interface SubscriptionRow {
  id: string;
  plan: string;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  renewsAt: string | null;
}

export function getSubscription(db: Db, userId: string): SubscriptionRow | null {
  const row = db
    .prepare('SELECT id, plan, status, renews_at FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(userId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    plan: row.plan as string,
    status: row.status as SubscriptionRow['status'],
    renewsAt: (row.renews_at as string | null) ?? null,
  };
}

export function createSubscription(
  db: Db,
  input: { userId: string; plan: string; status: SubscriptionRow['status']; renewsAt: string | null },
): void {
  db.prepare('INSERT INTO subscriptions (id, user_id, plan, status, renews_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    newId('sub'),
    input.userId,
    input.plan,
    input.status,
    input.renewsAt,
    nowIso(),
  );
}
