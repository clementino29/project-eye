declare module 'gamedig' {
	export interface QueryOptions {
		type: string;
		host: string;
		port?: number;
		maxRetries?: number;
		socketTimeout?: number;
		attemptTimeout?: number;
	}
	export interface QueryResult {
		name: string;
		map: string;
		maxplayers: number;
		numplayers: number;
		players: { name?: string }[];
		ping: number;
	}
	export const GameDig: { query(options: QueryOptions): Promise<QueryResult> };
}
