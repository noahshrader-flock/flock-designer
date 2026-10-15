export declare const MAX_BODY: number;
export interface ExchangeEnv {
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	ALLOWED_ORIGIN?: string;
	REDIRECT_URI?: string;
}
export declare const handleExchange: (
	request: { method: string; origin: string | undefined; body: string },
	env: ExchangeEnv,
	fetchImpl?: typeof fetch,
) => Promise<{ status: number; headers: Record<string, string>; body: string }>;
