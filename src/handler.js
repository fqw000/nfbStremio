import { getManifest } from './manifest.js';
import { CONFIG } from './config.js';
import { resolveId, parseDuration, buildImageUrl } from './helper.js';
import { fetchSearch, fetchCatalog, fetchMetaHtml, fetchStream } from './adapter.js';
import { extractJsonLd } from './parser.js';
import { resolveImdbToSlug, resolveSlugToImdb } from './resolver.js';
import { getSubtitles } from './subtitles.js';

function jsonResponse(data, cacheSeconds = 0) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  };
  if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, s-maxage=${cacheSeconds}`;
  }
  return new Response(JSON.stringify(data, null, 2), { headers });
}

function inferCatalogType(item) {
  if (item.seasons_count > 0) return 'series';
  if (/\/collection\//.test(item.availability?.resource_url || '')) return 'collection';
  return 'movie';
}

export async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 解析用户配置 cfg
  const cfgB64 = url.searchParams.get('cfg');
  if (cfgB64) {
    try {
      const base64 = cfgB64.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      globalThis.__USER_CONFIG = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (err) {
      globalThis.__USER_CONFIG = {};
    }
  } else {
    globalThis.__USER_CONFIG = {};
  }

  console.log(`[Worker] 📨 ${request.method} ${pathname}${url.search}`);

  if (pathname === '/manifest.json') {
    return jsonResponse(getManifest(), 0);
  }

  // 2. Catalog 与 Search
  const catalogMatch = pathname.match(/^\/catalog\/movie\/([^/]+)(?:\/([^/]+))?\.json$/);
  if (catalogMatch) {
    // ... (保持阶段 2 的代码不变) ...
    const catalogId = catalogMatch[1];
    const extraPath = catalogMatch[2] || '';

    const extras = {};
    if (extraPath) {
      for (const part of extraPath.split('&')) {
        const [k, v] = part.split('=');
        if (k && v) extras[k] = decodeURIComponent(v);
      }
    }
    for (const key of ['skip', 'search']) {
      const qv = url.searchParams.get(key);
      if (qv !== null) extras[key] = qv;
    }

    const skip = parseInt(extras.skip || '0', 10);
    const page = Math.floor(skip / 20) + 1;
    const query = extras.search;

    let metas = [];

    if (query) {
      console.log(`[Catalog] 🔍 搜索: "${query}", page=${page}`);
      const res = await fetchSearch(query, page, 20);
      if (res && res.items) {
        const pattern = res.meta?.thumbnail_pattern;
        metas = res.items
          .filter(item => item.is_streamable_for_free)
          .map(item => ({
            id: `nfb_${item.slug}`,
            type: 'movie',
            name: item.title,
            poster: buildImageUrl(pattern, item.thumbnail_path, 300, 200),
            posterShape: 'landscape',
            description: item.description?.en || '',
            releaseInfo: item.year ? String(item.year) : '',
            runtime: parseDuration(item.time)
          }));
      }
    } else {
      console.log(`[Catalog] 📂 浏览目录, page=${page}`);
      const res = await fetchCatalog(page, 20);
      if (res && res.items) {
        const pattern = res.meta?.mixed_media?.thumbnail_url?.film;
        metas = res.items
          .filter(item => item.availability?.is_public)
          .map(item => {
            const imgPath = item.thumbnail || item.jacket;
            return {
              id: `nfb_${item.slug}`,
              type: inferCatalogType(item),
              name: item.title,
              poster: buildImageUrl(pattern, imgPath, 300, 200),
              posterShape: 'landscape',
              releaseInfo: item.year ? String(item.year) : '',
              runtime: parseDuration(item.duration)
            };
          });
      }
    }
    return jsonResponse({ metas }, 300);
  }

  // 3. Meta (详情)
  const metaMatch = pathname.match(/^\/meta\/movie\/([^/]+)\.json$/);
  if (metaMatch) {
    const rawId = decodeURIComponent(metaMatch[1]);
    const parsedId = resolveId(rawId);

    let slug = parsedId.slug;

    // ★ 处理 tt 映射
    if (parsedId.kind === 'imdb') {
      slug = await resolveImdbToSlug(parsedId.imdbId);
      if (!slug) {
        console.log(`[Meta] ⚠️ 无法映射 ${parsedId.imdbId} 到 NFB slug`);
        return jsonResponse({ meta: null });
      }
    }

    console.log(`[Meta] 📄 获取详情: slug=${slug}`);
    const html = await fetchMetaHtml(slug);
    if (!html) return jsonResponse({ meta: null });

    const jsonLd = extractJsonLd(html);
    if (!jsonLd || !jsonLd.name) return jsonResponse({ meta: null });

    let year = jsonLd.uploadDate ? String(jsonLd.uploadDate).slice(0, 4) : '';
    let bgUrl = jsonLd.thumbnailUrl ? jsonLd.thumbnailUrl.replace(/\?.*$/, '') + '?w=1920&h=1080' : '';

    const meta = {
      id: rawId, // ★ 必须原样返回用户的 ID（tt 或 nfb_）
      type: 'movie',
      name: jsonLd.name,
      poster: jsonLd.image || '',
      posterShape: 'poster',
      background: bgUrl,
      description: jsonLd.description || '',
      releaseInfo: year,
      year: year,
      runtime: parseDuration(jsonLd.duration),
      director: Array.isArray(jsonLd.director)
        ? jsonLd.director.map(d => typeof d === 'string' ? d : d.name).filter(Boolean)
        : (jsonLd.director ? [jsonLd.director.name] : [])
    };

    // ★ 必须匹配当前的 rawId
    meta.videos = [{ id: rawId, title: meta.name }];

    return jsonResponse({ meta }, 600);
  }

  // 4. Stream (播放地址)
  const streamMatch = pathname.match(/^\/stream\/movie\/([^/]+)\.json$/);
  if (streamMatch) {
    const rawId = decodeURIComponent(streamMatch[1]);
    const parsedId = resolveId(rawId);

    let slug = parsedId.slug;

    // ★ 处理 tt 映射
    if (parsedId.kind === 'imdb') {
      slug = await resolveImdbToSlug(parsedId.imdbId);
      if (!slug) {
        console.log(`[Stream] ⚠️ 无法映射 ${parsedId.imdbId} 到 NFB slug`);
        return jsonResponse({ streams: [] });
      }
    }

    console.log(`[Stream] ▶️ 获取播放地址: slug=${slug}`);
    const data = await fetchStream(slug);
    if (!data || !data.hls) return jsonResponse({ streams: [] });

    const streams = [];
    if (data.hls) {
      streams.push({
        name: 'NFB', title: 'HLS / Auto',
        url: data.hls.split('#')[0],
        behaviorHints: { bingeGroup: `nfb-${slug}` }
      });
    }
    if (data.hls_dv) {
      streams.push({
        name: 'NFB', title: 'HLS / Dolby Vision',
        url: data.hls_dv.split('#')[0],
        behaviorHints: { bingeGroup: `nfb-${slug}` }
      });
    }

    return jsonResponse({ streams }, 600);
  }

  // 5. Subtitles (字幕)
  const subMatch = pathname.match(/^\/subtitles\/movie\/([^/]+)\.json$/);
  if (subMatch) {
    const rawId = decodeURIComponent(subMatch[1]);
    const parsedId = resolveId(rawId);

    let imdbId = null;

    if (parsedId.kind === 'imdb') {
      imdbId = parsedId.imdbId;
    } else {
      console.log(`[Subtitles] 需要为 ${rawId} 查找 IMDb ID，slug=${parsedId.slug}`);
      const html = await fetchMetaHtml(parsedId.slug);
      
      if (!html) {
        console.warn(`[Subtitles] ⚠️ fetchMetaHtml 获取失败`);
      } else {
        const jsonLd = extractJsonLd(html);
        if (jsonLd && jsonLd.name) {
          const year = jsonLd.uploadDate ? String(jsonLd.uploadDate).slice(0, 4) : '';
          imdbId = await resolveSlugToImdb(parsedId.slug, jsonLd.name, year);
        } else {
          console.warn(`[Subtitles] ⚠️ 提取 JSON-LD 失败`);
        }
      }
    }

    if (!imdbId) {
      console.log(`[Subtitles] ❌ 无法解析 IMDb ID，返回空字幕`);
      return jsonResponse({ subtitles: [] });
    }

    console.log(`[Subtitles] 🔍 获取字幕: ${imdbId}`);
    const targetLang = globalThis.__USER_CONFIG.subtitleLang || 'zh-en';
    
    // 引入 src/subtitles.js
    const { getSubtitles } = await import('./subtitles.js');
    const subtitles = await getSubtitles(imdbId, targetLang);

    return jsonResponse({ subtitles }, 600);
  }


  return new Response('Not Found', { status: 404 });
}

export default { fetch: handleRequest };