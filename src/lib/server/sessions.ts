import type { Cookies } from '@sveltejs/kit';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db, schema } from './db/index.ts';
import { hacher, jetonAleatoire } from './crypto.ts';

export const COOKIE_SESSION = 'nh_session';
const DUREE = 30 * 24 * 3600 * 1000;

export function ouvrirSession(cookies: Cookies, membreId: number, securise: boolean) {
	const jeton = jetonAleatoire();
	const expireLe = Date.now() + DUREE;
	db().insert(schema.sessionsWeb).values({ id: hacher(jeton), membreId, expireLe }).run();
	cookies.set(COOKIE_SESSION, jeton, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: securise,
		expires: new Date(expireLe)
	});
	// Ménage des sessions expirées.
	db().delete(schema.sessionsWeb).where(lt(schema.sessionsWeb.expireLe, Date.now())).run();
}

export function membreDeLaSession(cookies: Cookies): number | undefined {
	const jeton = cookies.get(COOKIE_SESSION);
	if (!jeton) return undefined;
	const s = db()
		.select()
		.from(schema.sessionsWeb)
		.where(and(eq(schema.sessionsWeb.id, hacher(jeton)), gt(schema.sessionsWeb.expireLe, Date.now())))
		.get();
	return s?.membreId;
}

export function fermerSession(cookies: Cookies) {
	const jeton = cookies.get(COOKIE_SESSION);
	if (jeton) db().delete(schema.sessionsWeb).where(eq(schema.sessionsWeb.id, hacher(jeton))).run();
	cookies.delete(COOKIE_SESSION, { path: '/' });
}

/** Coupe toutes les sessions d'un membre (par exemple s'il quitte le groupe Authentik). */
export function fermerSessionsDe(membreId: number) {
	db().delete(schema.sessionsWeb).where(eq(schema.sessionsWeb.membreId, membreId)).run();
}
