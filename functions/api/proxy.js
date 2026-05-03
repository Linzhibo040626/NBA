/**
 * Cloudflare Pages Function - API 代理
 *
 * 用于代理 CORS 受限的 NBA 数据请求。
 * 部署后可通过 /api/proxy?url=... 调用。
 *
 * Cloudflare Pages Functions 文档:
 * https://developers.cloudflare.com/pages/functions/
 */

// 处理 OPTIONS 预检请求
export async function onRequest(context) {
  // CORS 预检请求处理
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 仅接受 GET 请求
  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ error: '仅支持 GET 请求' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const url = new URL(context.request.url);
  const target = url.searchParams.get('url');

  if (!target) {
    return new Response(
      JSON.stringify({
        error: '缺少 url 参数',
        usage: '/api/proxy?url=https://example.com/data.json',
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  try {
    const response = await fetch(target, {
      headers: {
        'User-Agent': 'NBA-Dashboard/1.0',
        Accept: 'application/json',
      },
    });

    const data = await response.text();
    const contentType = response.headers.get('Content-Type') || 'application/json';

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `代理请求异常: ${err.message}`,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
