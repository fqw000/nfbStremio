import { CONFIG } from './config.js';
import { getCache, setCache } from './cache.js';

// 用于并发去重的内存 Map
const inflight = new Map();

// 通用底层请求
async function fetchRaw(url, isHtml = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
  
  console.log(`[Adapter] 🌐 请求: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': isHtml ? 'text/html' : 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    
    if (!res.ok) {
      console.error(`[Adapter] ❌ HTTP ${res.status}: ${url}`);
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = isHtml ? await res.text() : await res.json();
    console.log(`[Adapter] ✅ 成功: ${url} (${isHtml ? data.length + ' bytes' : JSON.stringify(data).length + ' bytes'})`);
    return data;
  } catch (err) {
    console.error(`[Adapter] ❌ 请求失败: ${url} - ${err.message}`);
    return null;
  }
}

/**
 * 带缓存与并发去重的请求包装器
 * @param {string} cacheKey 缓存 Key
 * @param {number} ttl 缓存时间（秒）
 * @param {Function} fetchFn 实际请求函数
 * @param {boolean} cacheEmpty 是否缓存空结果（防止源站无数据时频繁请求）
 */
async function fetchWithCache(cacheKey, ttl, fetchFn, cacheEmpty = true) {
  // 1. 查缓存
  const cached = await getCache(cacheKey);
  if (cached !== null && cached !== undefined) {
    // 如果是缓存了空数据标志，直接返回空
    if (cached === '__EMPTY__') return null;
    return cached;
  }

  // 2. 并发去重
  if (inflight.has(cacheKey)) {
    console.log(`[Adapter] ⏳ 等待进行中的请求: ${cacheKey}`);
    return inflight.get(cacheKey);
  }

  // 3. 实际请求
  const promise = (async () => {
    try {
      const data = await fetchFn();
      
      // 4. 写入缓存
      if (data !== null && data !== undefined) {
        // 如果数据明确为空（比如空数组或空对象），视情况缓存
        let isEmpty = false;
        if (Array.isArray(data) && data.length === 0) isEmpty = true;
        if (data.data && Array.isArray(data.data) && data.data.length === 0) isEmpty = true;
        if (data.items && Array.isArray(data.items) && data.items.length === 0) isEmpty = true;

        if (isEmpty) {
          if (cacheEmpty) await setCache(cacheKey, '__EMPTY__', ttl);
          return data;
        }
        
        await setCache(cacheKey, data, ttl);
        return data;
      } else {
        // 请求失败（如 403 或网络错误），缓存失败标志（短效，如 120 秒）
        await setCache(cacheKey, '__EMPTY__', 120);
        return null;
      }
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, promise);
  return promise;
}

// ==========================================
// 1. Catalog 与 Channel (缓存 10 分钟)
// ==========================================

export async function fetchTrending(page = 1, perPage = 20) {
  const key = `nfb:catalog:trending:${page}:${perPage}`;
  return fetchWithCache(key, 600, () => fetchRaw(`${CONFIG.NFB_TRENDING_API}?per_page=${perPage}&page=${page}`));
}

export async function fetchChannel(channelName, page = 1, perPage = 20) {
  const key = `nfb:catalog:channel:${channelName}:${page}:${perPage}`;
  return fetchWithCache(key, 600, () => fetchRaw(`${CONFIG.NFB_CHANNEL_API}/${channelName}/items?per_page=${perPage}&page=${page}`));
}

// ==========================================
// 2. Search (缓存 10 分钟)
// ==========================================

export async function fetchFilmSearch(q, page = 1, perPage = 20) {
  const key = `nfb:search:film:${q}:${page}`;
  return fetchWithCache(key, 600, () => fetchRaw(`${CONFIG.NFB_SEARCH_API}?q=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}`));
}

export async function fetchSeriesSearch(q, page = 1, size = 20) {
  const key = `nfb:search:series:${q}:${page}`;
  return fetchWithCache(key, 600, () => fetchRaw(`${CONFIG.NFB_SERIES_API}?query=${encodeURIComponent(q)}&page=${page}&size=${size}&locale=en`));
}

export async function fetchCollectionsSearch(q, page = 1, size = 20) {
  const key = `nfb:search:collection:${q}:${page}`;
  return fetchWithCache(key, 600, () => fetchRaw(`${CONFIG.NFB_COLLECTION_API}?query=${encodeURIComponent(q)}&page=${page}&size=${size}&locale=en`));
}

// ==========================================
// 3. Meta (缓存 30 分钟)
// ==========================================

export async function fetchFilmMeta(slug) {
  const key = `nfb:meta:film:${slug}`;
  return fetchWithCache(key, 1800, async () => {
    const html = await fetchRaw(`${CONFIG.NFB_META_API}${slug}/`, true);
    if (!html) return null;
    
    const match = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return null;
    
    try {
      const jsonLd = JSON.parse(match[1].trim());
      return {
        title: jsonLd.name,
        description: jsonLd.description,
        duration: jsonLd.duration,
        image: jsonLd.image,
        thumbnailUrl: jsonLd.thumbnailUrl,
        year: jsonLd.uploadDate ? String(jsonLd.uploadDate).slice(0, 4) : '',
      };
    } catch (e) {
      return null;
    }
  });
}

export async function fetchSeriesMeta(slug) {
  const key = `nfb:meta:series:${slug}`;
  return fetchWithCache(key, 1800, async () => {
    const res = await fetchRaw(`${CONFIG.NFB_SERIES_API}/${slug}`);
    return res?.item || null;
  });
}

export async function fetchCollectionMeta(slug) {
  const key = `nfb:meta:collection:${slug}`;
  return fetchWithCache(key, 1800, async () => {
    const res = await fetchRaw(`${CONFIG.NFB_COLLECTION_API}/${slug}`);
    return res?.item || null;
  });
}

// ==========================================
// 4. Stream (缓存 3 分钟)
// ==========================================

export async function fetchStream(slug) {
  const key = `nfb:stream:${slug}`;
  // Stream 的失效性较强，且可能 403，所以统一缓存 180 秒（含失败标志）
  return fetchWithCache(key, 180, () => fetchRaw(`${CONFIG.NFB_STREAM_API}${slug}/stream`), true);
}