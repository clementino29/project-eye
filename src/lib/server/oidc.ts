// Connexion par le serveur Authentik du groupe (OpenID Connect, code + PKCE).
import * as client from 'openid-client';
import { config } from './config.ts';

let decouverte: Promise<client.Configuration> | undefined;

export function configurationOidc(): Promise<client.Configuration> {
	const { issuer, clientId, clientSecret } = config.authentik;
	if (!issuer || !clientId || !clientSecret) {
		throw new Error('Authentik n’est pas configuré (AUTHENTIK_ISSUER, AUTHENTIK_CLIENT_ID, AUTHENTIK_CLIENT_SECRET).');
	}
	decouverte ??= client.discovery(new URL(issuer), clientId, clientSecret).catch((e) => {
		decouverte = undefined;
		throw e;
	});
	return decouverte;
}

export const urlRetour = () => `${config.origine}/auth/callback`;

export interface EtatConnexion {
	verifier: string;
	state: string;
	nonce: string;
	retour: string;
}

export async function preparerConnexion(retour: string) {
	const conf = await configurationOidc();
	const verifier = client.randomPKCECodeVerifier();
	const etat: EtatConnexion = {
		verifier,
		state: client.randomState(),
		nonce: client.randomNonce(),
		retour
	};
	const url = client.buildAuthorizationUrl(conf, {
		redirect_uri: urlRetour(),
		scope: 'openid profile email',
		code_challenge: await client.calculatePKCECodeChallenge(verifier),
		code_challenge_method: 'S256',
		state: etat.state,
		nonce: etat.nonce
	});
	return { url, etat };
}

export async function terminerConnexion(urlCourante: URL, etat: EtatConnexion) {
	const conf = await configurationOidc();
	const tokens = await client.authorizationCodeGrant(conf, urlCourante, {
		pkceCodeVerifier: etat.verifier,
		expectedState: etat.state,
		expectedNonce: etat.nonce
	});
	const claims = tokens.claims();
	if (!claims) throw new Error('Authentik n’a pas renvoyé de jeton d’identité.');
	// Les groupes peuvent n'être que dans userinfo selon les mappings Authentik.
	let infos: Record<string, unknown> = {};
	try {
		infos = await client.fetchUserInfo(conf, tokens.access_token, claims.sub);
	} catch {
		// userinfo indisponible : on garde les claims du jeton
	}
	return { ...claims, ...infos, sub: claims.sub } as Record<string, unknown> & { sub: string };
}

/** N'accepte qu'un chemin interne comme destination après connexion. */
export function cheminSur(retour: string | null | undefined) {
	if (!retour || !retour.startsWith('/') || retour.startsWith('//') || retour.startsWith('/\\')) return '/';
	return retour;
}
