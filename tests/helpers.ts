import { createTestDb } from '@/db/pglite';
import type { Db } from '@/db/client';
import * as repo from '@/db/repo';
import { newId } from '@/db/ids';
import { hashPassword } from '@/lib/auth-core';
import type { ContractLength, TimeBlock, Weekday } from '@/domain/types';

/**
 * A small, fully-wired marketplace in memory: one venue, one act with rates and
 * a calendar, and whatever else a test asks for.
 */
export interface Fixture {
  db: Db;
  venueId: string;
  venueUserId: string;
  entertainerId: string;
  entertainerUserId: string;
  managerUserId: string;
}

export async function makeFixture(options: { managed?: boolean } = {}): Promise<Fixture> {
  const db = await createTestDb();

  await db.query('INSERT INTO cities (id, name, country, lat, lng) VALUES ($1, $2, $3, $4, $5)', [
    'dubai',
    'Dubai',
    'AE',
    25.2048,
    55.2708,
  ]);
  for (const row of [
    ['cat_singer', null, 'singer', 'Singer', '#ff5fa2', 0],
    ['gen_soul', 'cat_singer', 'neo-soul', 'Neo-soul', '#ff5fa2', 0],
  ]) {
    await db.query(
      'INSERT INTO categories (id, parent_id, slug, label, accent, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
      row,
    );
  }

  const manager = await repo.createUser(db, {
    email: 'agency@test',
    passwordHash: hashPassword('password'),
    role: 'agency',
    displayName: 'Test Agency',
  });

  const entUser = await repo.createUser(db, {
    email: 'act@test',
    passwordHash: hashPassword('password'),
    role: 'entertainer',
    displayName: 'Test Act',
  });

  const entertainerId = newId('ent');
  await db.query(
    `INSERT INTO entertainers (id, user_id, managed_by_user_id, representation_note, slug, stage_name, short_bio,
                               full_bio, category_id, home_city_id, country_of_origin, cover_accent, status,
                               accepts_short_term, accepts_long_term, open_to_relocate, contract_lengths,
                               created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'test-act', 'Test Act', 'A short bio for cards',
             'A full bio that is comfortably long enough to pass the go-live check for length.',
             'cat_singer', 'dubai', 'AE', '#ff5fa2', 'live', TRUE, TRUE, TRUE, '[3,6]', $5, $5)`,
    [
      entertainerId,
      entUser.id,
      options.managed ? manager.id : null,
      options.managed ? 'Represented by Test Agency' : null,
      new Date().toISOString(),
    ],
  );

  await repo.setEntertainerGenres(db, entertainerId, ['gen_soul']);

  await repo.upsertRateCard(db, entertainerId, {
    currency: 'AED',
    baseHourly: 40000,
    minimumHours: 3,
    residencyMonthly: 1400000,
    daysPerWeekIncluded: 4,
    extraDayRate: 90000,
    published: true,
  });

  const rules: Array<[Weekday, TimeBlock, number]> = [
    [3, 'evening', 52000],
    [3, 'late_night', 62000],
  ];
  for (const [weekday, timeBlock, hourly] of rules) {
    await repo.setRateRule(db, entertainerId, { weekday, timeBlock, hourly });
  }
  await repo.addSpecialDate(db, entertainerId, {
    date: '2026-12-31',
    label: "New Year's Eve",
    hourly: 340000,
    minimumHours: 4,
  });
  await repo.addMedia(db, entertainerId, { kind: 'video', url: 'https://example.test/reel' });

  const venueUser = await repo.createUser(db, {
    email: 'venue@test',
    passwordHash: hashPassword('password'),
    role: 'venue',
    displayName: 'Test Venue',
  });
  const venue = await repo.createVenue(db, {
    userId: venueUser.id,
    name: 'Test Venue',
    venueType: 'hotel',
    cityId: 'dubai',
  });

  return {
    db,
    venueId: venue.id,
    venueUserId: venueUser.id,
    entertainerId,
    entertainerUserId: entUser.id,
    managerUserId: manager.id,
  };
}

export const CONTRACT: ContractLength = 6;
