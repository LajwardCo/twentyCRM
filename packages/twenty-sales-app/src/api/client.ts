// Thin GraphQL client over fetch for the Twenty core (/graphql) and
// metadata (/metadata) APIs, with token persistence + auto-renew.

const STORAGE_KEY = 'salesAppAuth';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  email: string;
};

type GraphQLResponse<TData> = {
  data?: TData;
  errors?: { message: string; extensions?: { code?: string } }[];
};

// Same-origin in production (served under /sales/ behind the same domain);
// the Vite dev server proxies these paths to localhost:3010.
const BASE_URL = '';

let currentTokens: AuthTokens | null = null;

export const loadTokens = (): AuthTokens | null => {
  if (currentTokens) return currentTokens;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    currentTokens = raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch {
    currentTokens = null;
  }
  return currentTokens;
};

export const saveTokens = (tokens: AuthTokens | null) => {
  currentTokens = tokens;
  if (tokens === null) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }
};

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const rawRequest = async <TData>(
  endpoint: '/graphql' | '/metadata',
  query: string,
  variables: Record<string, unknown> | undefined,
  token: string | null,
): Promise<TData> => {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok && response.status !== 400) {
    throw new ApiError(`Server error (${response.status})`, 'HTTP_ERROR');
  }

  const json = (await response.json()) as GraphQLResponse<TData>;

  if (json.errors?.length) {
    const first = json.errors[0];
    throw new ApiError(first.message, first.extensions?.code);
  }

  if (json.data === undefined || json.data === null) {
    throw new ApiError('Empty response from server');
  }

  return json.data;
};

const isAuthError = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.code === 'UNAUTHENTICATED' ||
    /token|unauthenticated|unauthorized/i.test(error.message));

let onSessionExpired: (() => void) | null = null;

export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

let renewPromise: Promise<boolean> | null = null;

const tryRenewTokens = async (): Promise<boolean> => {
  const tokens = loadTokens();
  if (!tokens?.refreshToken) return false;

  if (!renewPromise) {
    renewPromise = (async () => {
      try {
        const data = await rawRequest<{
          renewToken: {
            tokens: {
              accessOrWorkspaceAgnosticToken: { token: string };
              refreshToken: { token: string };
            };
          };
        }>(
          '/metadata',
          `mutation Renew($appToken: String!) {
            renewToken(appToken: $appToken) {
              tokens {
                accessOrWorkspaceAgnosticToken { token }
                refreshToken { token }
              }
            }
          }`,
          { appToken: tokens.refreshToken },
          null,
        );
        saveTokens({
          email: tokens.email,
          accessToken:
            data.renewToken.tokens.accessOrWorkspaceAgnosticToken.token,
          refreshToken: data.renewToken.tokens.refreshToken.token,
        });
        return true;
      } catch {
        return false;
      } finally {
        renewPromise = null;
      }
    })();
  }

  return renewPromise;
};

export const gqlRequest = async <TData>(
  endpoint: '/graphql' | '/metadata',
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> => {
  const tokens = loadTokens();
  try {
    return await rawRequest<TData>(
      endpoint,
      query,
      variables,
      tokens?.accessToken ?? null,
    );
  } catch (error) {
    if (isAuthError(error) && (await tryRenewTokens())) {
      const renewed = loadTokens();
      return rawRequest<TData>(
        endpoint,
        query,
        variables,
        renewed?.accessToken ?? null,
      );
    }
    if (isAuthError(error)) {
      saveTokens(null);
      onSessionExpired?.();
    }
    throw error;
  }
};

export const coreQuery = <TData>(
  query: string,
  variables?: Record<string, unknown>,
) => gqlRequest<TData>('/graphql', query, variables);

export const metadataQuery = <TData>(
  query: string,
  variables?: Record<string, unknown>,
) => gqlRequest<TData>('/metadata', query, variables);
