/**
 * API Proxy ユーティリティ
 * Workers API へのリクエストを転送して CORS を回避
 */

import { NextRequest, NextResponse } from 'next/server';


import { getRequestContext } from '@cloudflare/next-on-pages';

function resolveEnvVar(name: string): string | undefined {
  try {
    // Cloudflare Pages (next-on-pages)
    const ctx = getRequestContext();
// @ts-expect-error -- shim
    const v = (ctx?.env as any)?.[name];
    if (typeof v === 'string' && v.length) return v;
  } catch {}
  // Local dev / Node
// @ts-expect-error -- shim
  const pv = (process?.env as any)?.[name];
  if (typeof pv === 'string' && pv.length) return pv;
  return undefined;
}
/**
 * API Base URL を取得（サーバー側環境変数を優先）
 */
export function getApiBase(): string {
  // BOOKING_API_BASE を優先、なければ API_BASE、それもなければデフォルト
  const apiBase = 
    resolveEnvVar("BOOKING_API_BASE") ??
    resolveEnvVar("API_BASE") ?? 
    resolveEnvVar("NEXT_PUBLIC_API_BASE") ?? 
    '(process.env.CF_PAGES ? "https://saas-factory-api-staging.hekuijincun.workers.dev" : "(process.env.CF_PAGES ? "https://saas-factory-api-staging.hekuijincun.workers.dev" : "https://saas-factory-api-staging.hekuijincun.workers.dev"):8787")';
  
  // 末尾のスラッシュを削除
  return apiBase.replace(/\/$/, '');
}

/**
 * JSON リクエストを転送
 */
export async function forwardJson(
  req: NextRequest,
  path: string
): Promise<Response> {
  const apiBase = getApiBase();
  const url = `${apiBase}${path.startsWith('/') ? path : `/${path}`}`;

  // リクエストボディを取得（GET/HEAD の場合は不要）
  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = await req.text();
    } catch {
      // body がない場合は undefined のまま
    }
  }

  // ヘッダーを構築（重要でないものは除外、必要なら追加）
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Authorization ヘッダーがあれば引き継ぎ
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  // Cookie があれば引き継ぎ
  const cookie = req.headers.get('cookie');
  if (cookie) {
    headers['Cookie'] = cookie;
  }

  // リクエストを転送
  try {
    // デバッグ用: URLをログ出力（秘密値は含まない）
    console.log(`[proxy] ${req.method} ${url}`);

    const response = await fetch(url, {
      method: req.method,
      headers,
      body: body || undefined,
    });

    // レスポンスボディを取得
    let responseBody: unknown;
    try {
      const text = await response.text();
      responseBody = text ? JSON.parse(text) : null;
    } catch (parseError) {
      // JSONパース失敗時は空オブジェクト
      responseBody = { ok: false, error: 'Invalid JSON response' };
    }

    // ステータスコードとヘッダーをそのまま返す
    return NextResponse.json(responseBody, {
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    // エラー時は JSON レスポンスを返す（デバッグ可能にする）
    const errorMessage = error instanceof Error ? error.message : 'Proxy request failed';
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    
    console.error(`[proxy] Error: ${errorName} - ${errorMessage}`, {
      method: req.method,
      path,
      url,
    });

    // LINE status の場合は kind: "error" を返す
    if (path.includes('/line/status')) {
      return NextResponse.json(
        {
          kind: 'error',
          message: `Proxy failed: ${errorMessage}`,
        },
        { status: 500 }
      );
    }

    // その他のエンドポイントは ok: false を返す
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
        url,
      },
      { status: 500 }
    );
  }
}








