/**
 * Cloudflare Pages Function - API 代理
 *
 * 用于代理 CORS 受限的 NBA 数据请求。
 * 部署后可通过 /api/proxy?url=... 调用。
 */

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
        return new Response(JSON.stringify({
            error: '缺少 url 参数',
            usage: '/api/proxy?url=https://example.com/data.json'
        }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
        });
    }

    try {
        const response = await fetch(target, {
            headers: {
                'User-Agent': 'NBA-Dashboard/1.0',
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            return new Response(JSON.stringify({
                error: `上游请求失败: ${response.status}`,
            }), {
                status: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            });
        }

        const data = await response.text();

        return new Response(data, {
            status: response.status,
            headers: {
                'Content-Type': response.headers.get('Content-Type') || 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Cache-Control': 'public, max-age=60',
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({
            error: `代理请求异常: ${err.message}`,
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
        });
    }
}
