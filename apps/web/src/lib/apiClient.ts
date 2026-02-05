/**
 * APIクライアントのベース実装
 * - baseURL を環境変数から読み込み
 * - fetch wrapper で timeout, json parse, error normalize を提供
 */

export interface ApiError {
  message: string;
  status?: number;
  statusText?: string;
  data?: unknown;
}

export class ApiClientError extends Error {
  status?: number;
  statusText?: string;
  data?: unknown;

  constructor(message: string, status?: number, statusText?: string, data?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

interface RequestOptions extends RequestInit {
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30000; // 30秒（スロット取得など重い処理に対応）

/**
 * baseURL を環境変数から取得（防御的実装）
 * 優先順位:
 * 1) NEXT_PUBLIC_API_BASE
 * 2) fallback: http://127.0.0.1:8787
 * 
 * NOTE: /api/proxy/* のエンドポイントは Next.js の Route Handler なので、
 * この baseURL は使わず、相対パスで fetch する。
 */
function getBaseURL(): string {
  // Next.js の環境変数から取得
  const baseURL = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8787';
  const normalizedURL = baseURL.replace(/\/$/, ''); // 末尾のスラッシュを削除

  // 開発時のみ Console に出力（1回だけ）
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    if (!(window as any).__API_BASE_LOGGED) {
      console.log('[booking] API_BASE =', normalizedURL, '(Worker API)');
      console.log('[booking] using Next proxy /api/proxy/* for proxy endpoints');
      (window as any).__API_BASE_LOGGED = true;
    }
  }

  return normalizedURL;
}

/**
 * fetch wrapper with timeout and error handling
 * 
 * NOTE: /api/proxy/* のエンドポイントは Next.js の Route Handler なので、
 * Worker の API_BASE を使わず、相対パスで fetch する。
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  // /api/proxy/* の場合は相対パスで fetch（Next.js Route Handler）
  const isProxyEndpoint = endpoint.startsWith('/api/proxy/');
  const url = isProxyEndpoint
    ? endpoint
    : `${getBaseURL()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  // timeout を実装するための AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    // レスポンスのJSONをパース
    let data: unknown;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (parseError) {
        throw new ApiClientError(
          'Failed to parse JSON response',
          response.status,
          response.statusText
        );
      }
    } else {
      data = await response.text();
    }

    // エラーレスポンスの正規化
    if (!response.ok) {
      const errorMessage =
        (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string')
          ? data.error
          : (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
            ? data.message
            : `API request failed: ${response.status} ${response.statusText}`;

      throw new ApiClientError(
        errorMessage,
        response.status,
        response.statusText,
        data
      );
    }

    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);

    // AbortError (timeout) の処理
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError(`Request timeout after ${timeout}ms`);
    }

    // 既に ApiClientError の場合はそのまま再スロー
    if (error instanceof ApiClientError) {
      throw error;
    }

    // その他のエラー
    if (error instanceof Error) {
      throw new ApiClientError(error.message);
    }

    throw new ApiClientError('Unknown error occurred');
  }
}

/**
 * GET リクエスト
 */
export async function apiGet<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'GET',
  });
}

/**
 * POST リクエスト
 */
export async function apiPost<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE リクエスト
 */
export async function apiDelete<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'DELETE',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH リクエスト
 */
export async function apiPatch<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT リクエスト
 */
export async function apiPut<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * LINE設定保存（相対パスで Next.js proxy を経由）
 * NOTE: /api/proxy/* は Next.js の Route Handler なので、必ず相対パスで叩く。
 */
export async function updateLineConfig(payload: unknown, tenantId?: string): Promise<Response> {
  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  return fetch(`/api/proxy/admin/line/config${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
}

