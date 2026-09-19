/**
 * Authentication.
 *
 * Passwords are hashed with scrypt from node's own crypto, and sessions are
 * opaque random tokens looked up in the database — no third-party dependency
 * for either, and nothing about a user encoded in the cookie itself.
 */
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import type { UserRole } from '@/domain/types';

const SESSION_COOKIE = 'booktheact_session';
const SESSION_DAYS = 30;

export { hashPassword, verifyPassword } from './auth-core';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
}

export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  repo.createSession(getDb(), token, userId, expires.toISOString());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) repo.deleteSession(getDb(), token);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = repo.findSessionUser(getDb(), token);
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role, displayName: user.displayName };
}

/** For pages and actions that must not run for a signed-out visitor. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthError('You need to be signed in to do that');
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError(`This is a ${roles.join(' or ')} action`);
  }
  return user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
