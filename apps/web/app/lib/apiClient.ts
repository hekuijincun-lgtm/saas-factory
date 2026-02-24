/**
 * APIクライアントのベース実装
 * 
 * ブラウザ(クライアント)では必ず /api/proxy 経由でAPIにアクセスします。
 * サーバー側(Next Route Handler 等)だけ Worker 直URL(例 http://127.0.0.1:8787) を使用します。
 * 
 * - ブラウザ: baseURL は常に "/api/proxy" を使用（固定）
 * - サーバー側: baseURL は環境変数から取得（BOOKING_API_BASE 等）
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

const DEFAULT_TIMEOUT = 10000; // 10秒

/**
 * ブラウザかどうかを判定
 */
const isBrowser = typeof window !== 'undefined';

/**
 * クライアント側のベースURL（ブラウザでは必ず /api/proxy を使用）
 */
const CLIENT_BASE = '/api/proxy';

/**
 * サーバー側のベースURL（環境変数から取得、なければデフォルト値）
 */
const SERVER_BASE =
  process.env.BOOKING_API_BASE ||
  process.env.NEXT_PUBLIC_BOOKING_API_BASE ||
  'http://127.0.0.1:8787';

/**
 * API URL を構築する関数
 * ブラウザなら /api/proxy 固定、サーバー側なら Worker 直URL を使用
 * 
 * @param path - API パス（例: '/admin/menu'）
 * @returns 完全な API URL
 * 
 * @example
 * apiUrl('/admin/menu') // ブラウザ: '/api/proxy/admin/menu', サーバー: 'http://127.0.0.1:8787/admin/menu'
 */
export function apiUrl(path: string): string {
  const base = isBrowser ? CLIENT_BASE : SERVER_BASE;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * baseURL を取得
 * ブラウザなら /api/proxy 固定、サーバー側なら Worker 直URL を使用
 */
function getBaseURL(): string {
  // ブラウザ(クライアント)では必ず /api/proxy を使用
  if (isBrowser) {
    // localStorage に残った古い API_BASE 系キーを明示的に破棄して暴発を防ぐ
    try {
      localStorage.removeItem('apiBase');
      localStorage.removeItem('API_BASE');
      localStorage.removeItem('apiUrl');
      localStorage.removeItem('API_URL');
    } catch {
      // 破棄に失敗しても処理は続行（ブラウザ以外の環境など）
    }
    
    return CLIENT_BASE;
  }
  
  // サーバー側(Next Route Handler 等)では環境変数から取得
  // 環境変数が未設定の場合は開発環境用のデフォルト値を使用
  return SERVER_BASE;
}

/**
 * endpoint に tenantId を自動付与する
 * tenantId が既に含まれている場合はそのまま、なければ default を追加
 */
function ensureTenantId(endpoint: string, tenantId?: string): string {
  // クエリパラメータを解析
  const [path, queryString] = endpoint.split('?');
  const searchParams = new URLSearchParams(queryString || '');
  
  // tenantId が既に含まれている場合はそのまま返す
  if (searchParams.has('tenantId')) {
    return endpoint;
  }
  
  // tenantId を追加
  searchParams.set('tenantId', tenantId || 'default');
  const newQueryString = searchParams.toString();
  
  return newQueryString ? `${path}?${newQueryString}` : path;
}

/**
 * fetch wrapper with timeout and error handling
 * tenantId を自動付与する
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions & { tenantId?: string } = {}
): Promise<T> {
  const baseURL = getBaseURL();
  const { tenantId, ...requestOptions } = options;
  
  // tenantId を自動付与
  const endpointWithTenantId = ensureTenantId(endpoint, tenantId);
  const url = `${baseURL}${endpointWithTenantId.startsWith('/') ? endpointWithTenantId : `/${endpointWithTenantId}`}`;
  const timeout = requestOptions.timeout ?? DEFAULT_TIMEOUT;

  // 開発時は実際に叩くURLをログ出力（デバッグ用）
  if (process.env.NODE_ENV !== 'production') {
    console.log('[apiRequest] fetch ->', url, { method: options.method ?? 'GET' });
  }

  // timeout を実装するための AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...requestOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...requestOptions.headers,
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
        (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
          ? data.message
          : `API request failed: ${response.status} ${response.statusText}`;

      // 例外で落ちないように try/catch の中で console.error({ url, status, body }) を出す
      console.error('[apiRequest] HTTP Error Response:', {
        url,
        status: response.status,
        statusText: response.statusText,
        body: data,
        message: errorMessage,
      });

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

    // エラー時にURLをログ出力（デバッグ用）
    // 例外で落ちないように try/catch の中で console.error({ url, status, body }) を出す
    let status: number | undefined;
    let body: unknown;

    // AbortError (timeout) の処理
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[apiRequest] Request Timeout:', {
        url,
        status: undefined,
        body: undefined,
        timeout,
      });
      throw new ApiClientError(`Request timeout after ${timeout}ms`, undefined, undefined, { url, timeout });
    }

    // 既に ApiClientError の場合はそのまま再スロー
    if (error instanceof ApiClientError) {
      status = error.status;
      body = error.data;
      
      // エラーにURL情報を追加
      if (!error.data || typeof error.data !== 'object') {
        error.data = { url };
      }
      
      console.error('[apiRequest] API Error:', {
        url,
        status,
        statusText: error.statusText,
        body,
        message: error.message,
      });
      
      throw error;
    }

    // ネットワークエラー（CORS、接続失敗など）
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[apiRequest] Network Error:', {
        url,
        status: undefined,
        body: undefined,
        errorType: 'NetworkError',
        originalError: error.message,
      });
      
      throw new ApiClientError(
        `Network error: Failed to fetch from ${url}. Check CORS settings or network connection.`,
        undefined,
        undefined,
        { url, errorType: 'NetworkError', originalError: error.message }
      );
    }

    // その他のエラー
    if (error instanceof Error) {
      console.error('[apiRequest] Unknown Error:', {
        url,
        status: undefined,
        body: undefined,
        errorType: 'UnknownError',
        originalError: error.message,
      });
      
      throw new ApiClientError(
        error.message,
        undefined,
        undefined,
        { url, errorType: 'UnknownError', originalError: error.message }
      );
    }

    console.error('[apiRequest] Unknown Error (non-Error object):', {
      url,
      status: undefined,
      body: undefined,
      error: String(error),
    });

    throw new ApiClientError('Unknown error occurred', undefined, undefined, { url });
  }
}

/**
 * GET リクエスト
 * tenantId を自動付与する（指定されていない場合は 'default'）
 */
export async function apiGet<T>(endpoint: string, options?: RequestOptions & { tenantId?: string }): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'GET',
  });
}

/**
 * POST リクエスト
 * tenantId を自動付与する（指定されていない場合は 'default'）
 */
export async function apiPost<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions & { tenantId?: string }
): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT リクエスト
 * tenantId を自動付与する（指定されていない場合は 'default'）
 */
export async function apiPut<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestOptions & { tenantId?: string }
): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE リクエスト
 * tenantId を自動付与する（指定されていない場合は 'default'）
 */
export async function apiDelete<T>(endpoint: string, options?: RequestOptions & { tenantId?: string }): Promise<T> {
  return apiRequest<T>(endpoint, {
    ...options,
    method: 'DELETE',
  });
}

