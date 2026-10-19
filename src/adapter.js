import { CONFIG } from './config.js';

// 通用的 JSON 请求函数
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[Adapter] ❌ 请求失败: ${url} - ${err.message}`);
    return null;
  }
}

// 1. 搜索接口
export async function fetchSearch(q, page = 1, perPage = 20) {
  const params = new URLSearchParams({
    q: q,
    per_page: perPage.toString(),
    page: page.toString(),
    sort_by: 'relevance',
    order_by: 'desc',
    safe_search: 'false',
    include: 'description'
  });
  
  const url = `${CONFIG.NFB_SEARCH_API}?${params.toString()}`;
  console.log(`[Adapter] 🔍 Search: ${url}`);
  return await fetchJson(url);
}

// 2. 目录接口
export async function fetchCatalog(page = 1, size = 20) {
  const params = new URLSearchParams({
    locale: 'en',
    size: size.toString(),
    page: page.toString(),
    include_series_episodes: 'true'
  });

  // include_fields 必须用 append，否则 422
  const fields = [
    'slug', 'duration', 'year', 'thumbnail', 'directors', 'cc', 'dv', 'rating',
    'coming_soon', 'is_new_release', 'leaving_soon', 'availability', 'geoblocked',
    'producers', 'year_max', 'year_min', 'seasons_count', 'episodes_count',
    'cataloging_language', 'story_art_horizontal', 'jacket'
  ];
  fields.forEach(f => params.append('include_fields', f));

  const url = `${CONFIG.NFB_CATALOG_API}?${params.toString()}`;
  console.log(`[Adapter] 📂 Catalog: ${url}`);
  return await fetchJson(url);
}

// 3. 影片详情接口 (返回 HTML)
export async function fetchMetaHtml(slug) {
  const url = `${CONFIG.NFB_META_API}${slug}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    console.error(`[Adapter] ❌ Meta HTML 请求失败: ${url} - ${err.message}`);
    return null;
  }
}

// 4. 播放地址接口 (返回 JSON)
export async function fetchStream(slug) {
  const url = `${CONFIG.NFB_STREAM_API}${slug}/stream`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[Adapter] ❌ Stream 请求失败: ${url} - ${err.message}`);
    return null;
  }
}