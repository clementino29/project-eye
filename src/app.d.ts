import type { Membre } from '#lib/server/db/schema.ts';

declare global {
	namespace App {
		interface Locals {
			membre: Membre | null;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
