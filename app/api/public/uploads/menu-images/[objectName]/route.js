const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '';

const ALLOWED_IMAGE_NAME = /^[a-f0-9-]+\.(png|jpe?g|webp|gif)$/i;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, context) {
  return proxyMenuImage(context, false);
}

export async function HEAD(_request, context) {
  return proxyMenuImage(context, true);
}

async function proxyMenuImage(context, headOnly) {
  const { objectName } = await context.params;
  const safeObjectName = String(objectName || '').trim();

  if (!ALLOWED_IMAGE_NAME.test(safeObjectName)) {
    return new Response(null, { status: 400 });
  }

  if (!BACKEND_URL) {
    return new Response(null, { status: 503 });
  }

  const target = `${BACKEND_URL.replace(/\/$/, '')}/api/public/uploads/menu-images/${encodeURIComponent(safeObjectName)}`;
  const upstream = await fetch(target, {
    method: headOnly ? 'HEAD' : 'GET',
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'ngrok-skip-browser-warning': 'true',
    },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return new Response(null, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  const contentType = upstream.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    return new Response(null, {
      status: 502,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  const headers = new Headers();
  copyHeader(upstream.headers, headers, 'content-type');
  copyHeader(upstream.headers, headers, 'content-length');
  copyHeader(upstream.headers, headers, 'etag');
  copyHeader(upstream.headers, headers, 'last-modified');
  copyHeader(upstream.headers, headers, 'accept-ranges');
  headers.set('Cache-Control', upstream.headers.get('cache-control') || 'public, max-age=31536000, immutable');

  return new Response(headOnly ? null : upstream.body, {
    status: 200,
    headers,
  });
}

function copyHeader(from, to, name) {
  const value = from.get(name);
  if (value) {
    to.set(name, value);
  }
}
