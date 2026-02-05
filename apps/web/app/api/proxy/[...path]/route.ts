export const runtime = 'edge';

/**
 * Catch-all proxy route for Worker API
 * 
 * /api/proxy/{path}?{query} を {BOOKING_API_BASE}/{path}?{query} に転送
 * 
 * 対応メソッド: GET, POST, PUT, PATCH, DELETE
 * 
 * 環境変数:
 * - BOOKING_API_BASE: Worker API のベースURL（デフォルト: http://127.0.0.1:8787）
 */

import { NextRequest, NextResponse } from 'next/server';

function getWorkerBaseUrl(): string {
  const base = process.env.BOOKING_API_BASE || 'http://127.0.0.1:8787';
  return base.replace(/\/$/, ''); // 末尾のスラッシュを削除
}

export async function GET(req: NextRequest) {
  return forwardRequest(req);
}

export async function POST(req: NextRequest) {
  return forwardRequest(req);
}

export async function PUT(req: NextRequest) {
  return forwardRequest(req);
}

export async function PATCH(req: NextRequest) {
  return forwardRequest(req);
}

export async function DELETE(req: NextRequest) {
  return forwardRequest(req);
}

async function forwardRequest(req: NextRequest) {
  try {
    const workerBase = getWorkerBaseUrl();
    
    // /api/proxy/{path} から {path} を抽出
    const path = req.nextUrl.pathname.replace(/^\/api\/proxy/, '') || '/';
    const queryString = req.nextUrl.search;
    
    // Worker API の URL を構築
    const upstreamUrl = `${workerBase}${path}${queryString}`;
    
    // リクエストボディを取得（GET/HEAD の場合は不要）
    let body: string | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        body = await req.text();
      } catch {
        // body がない場合は undefined のまま
      }
    }
    
    // ヘッダーを構築（Host など不要なものは除外）
    const headers: HeadersInit = {};
    
    // Content-Type があれば引き継ぎ
    const contentType = req.headers.get('content-type');
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    
    // Authorization があれば引き継ぎ
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    // Accept ヘッダー（デフォルト: application/json）
    headers['Accept'] = req.headers.get('accept') || 'application/json';
    
    // Worker API へ fetch（タイムアウト: 30秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: body || undefined,
        cache: 'no-store',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // レスポンスボディを取得
      const responseBody = await response.text();
      
      // Worker API のレスポンスをそのまま返却
      return new NextResponse(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': response.headers.get('content-type') || 'application/json',
        },
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // AbortError (タイムアウト) の処理
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          {
            ok: false,
            error: 'Request timeout after 30000ms',
            stage: 'proxy_timeout',
          },
          { status: 504 }
        );
      }
      
      // その他の fetch エラー
      throw fetchError;
    }
  } catch (error) {
    // 例外時は 502 Bad Gateway を返す
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    
    console.error(`[api/proxy] Proxy error: ${errorName} - ${errorMessage}`, {
      path: req.nextUrl.pathname,
      method: req.method,
    });
    
    return NextResponse.json(
      {
        ok: false,
        error: `Proxy failed: ${errorMessage}`,
        stage: 'proxy_error',
      },
      { status: 502 }
    );
  }
}





