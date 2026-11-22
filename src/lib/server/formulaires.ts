// Petits utilitaires de lecture des formulaires.
export const texte = (f: FormData, cle: string, max = 200) => String(f.get(cle) ?? '').trim().slice(0, max);

export const entier = (f: FormData, cle: string) => {
	const n = Number.parseInt(String(f.get(cle) ?? ''), 10);
	return Number.isFinite(n) ? n : null;
};

export const ids = (f: FormData, cle: string) =>
	[...new Set(f.getAll(cle).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))];

/** N'accepte que des liens http(s) pour les images. */
export const urlImage = (v: string) => (/^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : null);

export function parmi<T extends string>(v: string, valeurs: readonly T[]): T | null {
	return (valeurs as readonly string[]).includes(v) ? (v as T) : null;
}
