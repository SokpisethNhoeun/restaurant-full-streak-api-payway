const FALLBACK_IMAGE = '/logo.png';
const MENU_IMAGE_PROXY_PREFIX = '/api/public/uploads/menu-images/';
const MENU_IMAGE_BUCKET = 'happyboat-menu-images';

export function displayImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return FALLBACK_IMAGE;

  if (value.startsWith(MENU_IMAGE_PROXY_PREFIX)) {
    return value;
  }

  const proxyPath = menuImageProxyPath(value);
  if (proxyPath) {
    return proxyPath;
  }

  return value.replace(/^http:\/\/minio:9000/i, 'http://localhost:9000');
}

export function replaceBrokenImage(event) {
  if (event.currentTarget.src.endsWith(FALLBACK_IMAGE)) return;
  event.currentTarget.src = FALLBACK_IMAGE;
}

function menuImageProxyPath(value) {
  try {
    const parsed = new URL(value);
    return objectNameFromPath(parsed.pathname);
  } catch {
    return objectNameFromPath(value);
  }
}

function objectNameFromPath(path) {
  const parts = String(path || '')
    .split('/')
    .filter(Boolean)
    .map(safeDecode);
  const bucketIndex = parts.indexOf(MENU_IMAGE_BUCKET);
  if (bucketIndex < 0 || bucketIndex !== parts.length - 2) return '';
  const objectName = parts[bucketIndex + 1];
  if (!objectName || objectName.includes('\\') || objectName.includes('..')) return '';
  return `${MENU_IMAGE_PROXY_PREFIX}${encodeURIComponent(objectName)}`;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
