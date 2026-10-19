/**
 * 解析时长字符串
 * 支持 "PT00:01:50" 和 "PT11M" 和 浮点秒 "110.0"
 */
export function parseDuration(text) {
  if (text === undefined || text === null) return '';
  if (typeof text === 'number') {
    if (text === 0) return '';
    return `${Math.round(text / 60)}min`;
  }

  const str = String(text);
  // 处理 "PT00:01:50"
  const clockMatch = str.match(/^PT(\d{2}):(\d{2}):(\d{2})$/);
  if (clockMatch) {
    const h = parseInt(clockMatch[1], 10);
    const m = parseInt(clockMatch[2], 10);
    const s = parseInt(clockMatch[3], 10);
    const totalMin = Math.round(h * 60 + m + s / 60);
    return totalMin > 0 ? `${totalMin}min` : '';
  }

  // 处理 "PT11M" 或 "PT1H30M"
  const isoMatch = str.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (isoMatch) {
    const h = parseInt(isoMatch[1] || '0', 10);
    const m = parseInt(isoMatch[2] || '0', 10);
    const totalMin = h * 60 + m;
    return totalMin > 0 ? `${totalMin}min` : '';
  }
  return '';
}

/**
 * 拼接 NFB 图片 URL
 */
export function buildImageUrl(pattern, path, width, height) {
  if (!pattern || !path) return '';
  return pattern
    .replace('{path}', path)
    .replace('{width}', String(width))
    .replace('{height}', String(height));
}

/**
 * 统一解析 ID
 * 输入 'nfb_bread-will-walk' 返回 { kind: 'slug', slug: 'bread-will-walk' }
 * 输入 'tt0109830' 返回 { kind: 'imdb', imdbId: 'tt0109830' }
 */
export function resolveId(rawId) {
  if (/^tt\d+$/.test(rawId)) return { kind: 'imdb', imdbId: rawId };
  if (/^nfb_/.test(rawId)) return { kind: 'slug', slug: rawId.slice(4) };
  return { kind: 'slug', slug: rawId };
}