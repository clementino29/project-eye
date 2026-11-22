import { db } from '#lib/server/db/index.ts';
import { sql } from 'drizzle-orm';

/** Sonde pour Docker et Uptime Kuma. */
export const GET = () => {
	db().run(sql`select 1`);
	return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
};
