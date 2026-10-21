import { getManifest } from './manifest.js';
import { CONFIG } from './config.js';
import { parseDuration, buildImageUrl } from './helper.js';
import * as Adapter from './adapter.js';
import { getSubtitles } from './subtitles.js';
import { resolveImdbToSlug, resolveSlugToImdb } from './resolver.js';

function jsonResponse(data, cacheSeconds = 0) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
  if (cacheSeconds > 0) headers['Cache-Control'] = `public, s-maxage=${cacheSeconds}`;
  return new Response(JSON.stringify(data, null, 2), { headers });
}

export async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const pattern = 'https://assets.nfbcdn.ca/medias/norman/{path}?w={width}&h={height}';

  const cfgB64 = url.searchParams.get('cfg');
  if (cfgB64) {
    try {
      const base64 = cfgB64.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      globalThis.__USER_CONFIG = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (err) { globalThis.__USER_CONFIG = {}; }
  } else { globalThis.__USER_CONFIG = {}; }

  console.log(`[Worker] 📨 ${request.method} ${pathname}${url.search}`);

  if (pathname === '/manifest.json') {
    const m = getManifest();
    console.log(`[Manifest] ✅ 返回 ${m.catalogs.length} 个目录`);
    return jsonResponse(m, 0);
  }

  // ================= Catalog =================
  const catalogMatch = pathname.match(/^\/catalog\/(movie|series)\/([^/]+)(?:\/([^/]+))?\.json$/);
  if (catalogMatch) {
    const type = catalogMatch[1]; 
    const catalogId = catalogMatch[2];
    const extraPath = catalogMatch[3] || '';
    
    const extras = {};
    if (extraPath) {
      extraPath.split('&').forEach(part => {
        const [k, v] = part.split('=');
        if (k && v) extras[k] = decodeURIComponent(v);
      });
    }
    for (const key of ['skip', 'search']) {
      const qv = url.searchParams.get(key);
      if (qv !== null) extras[key] = qv;
    }

const skip = parseInt(extras.skip || '0', 10);

// ★ P0 修复：防止 Stremio 补页死循环
// Stremio 在返回不满一页（PAGE_SIZE）时，会用"已加载条数"作为 skip 补页
// 如果 skip 不是 PAGE_SIZE 的倍数，说明底层数据已到底，返回空让 Stremio 停止
const PAGE_SIZE = 20;
if (skip > 0 && skip % PAGE_SIZE !== 0) {
  console.log(`[Catalog] 🛑 skip=${skip} 非 ${PAGE_SIZE} 倍数，返回空表示到底`);
  return jsonResponse({ metas: [] }, 60);
}

const page = Math.floor(skip / PAGE_SIZE) + 1;
    const query = extras.search;

    console.log(`[Catalog] 🔍 解析: type=${type}, id=${catalogId}, page=${page}, query="${query || ''}"`);

    let items = [];
    let isSearch = false;

    if (query) {
      isSearch = true;
      if (type === 'movie') {
        const res = await Adapter.fetchFilmSearch(query, page);
        items = res?.items || [];
      } else {
        const [sRes, cRes] = await Promise.all([
          Adapter.fetchSeriesSearch(query, page),
          Adapter.fetchCollectionsSearch(query, page)
        ]);
        items = [...(sRes?.items || []), ...(cRes?.items || [])];
        const seen = new Set();
        items = items.filter(i => !seen.has(i.slug) && seen.add(i.slug));
      }
    } else {
      let res;
if (catalogId === 'nfb_ch_childrens_film_movies') {
  console.log(`[Catalog] 🎬 获取 Genre: Children's film (Movie)`);
  res = await Adapter.fetchByGenre("Children's film", page, 20, true);
} else if (catalogId === 'nfb_ch_childrens_film_series') {
  // ★ 底层 genre=Children's film 的 series 数据为 0，直接返回空
  console.log(`[Catalog] ⚠️ childrens_film_series 无数据源，返回空`);
  return jsonResponse({ metas: [] }, 60);
} else if (catalogId.startsWith('nfb_ch_')) {
        const chName = catalogId.replace('nfb_ch_', '').replace('_movies', '').replace('_series', '');
        res = await Adapter.fetchChannel(chName, page);
      } else {
        res = await Adapter.fetchTrending(page);
      }
      items = res?.data || res?.items || [];
    }

const filtered = items.filter(item => {
  if (isSearch) return true;

  // ★ 只过滤确定不可访问的影片
  // - is_public === false：非公开
  // - geoblocked === true：地区限制
  // 注意：buy === true 只表示有实体 DVD 可购买，不代表不能在线播放，故不过滤
  if (item.availability && item.availability.is_public === false) {
    return false;
  }
  if (item.geoblocked === true) {
    return false;
  }

  const isMovie = item.type === 'film' || item.category === 'film' || (item.url && item.url.includes('/film/'));
  const isSeries = item.type === 'series' || item.type === 'collection' || item.category === 'series' || item.category === 'collection' || (item.url && (item.url.includes('/series/') || item.url.includes('/collection/')));
  return type === 'movie' ? isMovie : isSeries;
});

    const metas = filtered.map(item => {
      let rawType = item.type || item.category;
      if (!rawType) {
        if (item.url && item.url.includes('/collection/')) rawType = 'collection';
        else if (item.url && item.url.includes('/series/')) rawType = 'series';
        else rawType = type === 'movie' ? 'film' : 'series';
      }
      const thumb = item.thumbnail || item.thumbnail_path;
      return {
        id: `nfb_${rawType}_${item.slug}`,
        type: type,
        name: item.title,
        poster: thumb ? (thumb.startsWith('http') ? thumb : buildImageUrl(pattern, thumb, 300, 200)) : '',
        posterShape: 'landscape',
        releaseInfo: item.year ? String(item.year) : '',
        runtime: parseDuration(item.duration || item.time)
      };
    });

console.log(`[Catalog] ✅ 返回 ${metas.length} 条结果（原始 ${items.length} 条）`);
    return jsonResponse({ metas }, 300);
  }

  // ================= Meta =================
  const metaMatch = pathname.match(/^\/meta\/(movie|series)\/([^/]+)\.json$/);
  if (metaMatch) {
    const type = metaMatch[1];
    const rawId = decodeURIComponent(metaMatch[2]);

    let slug = rawId;
    let category = 'film';
    
    if (rawId.startsWith('tt')) {
      console.log(`[Meta] 🔍 检测到 IMDb ID: ${rawId}，开始映射...`);
      const mappedSlug = await resolveImdbToSlug(rawId);
      if (!mappedSlug) {
        console.log(`[Meta] ❌ IMDb 映射失败: ${rawId}`);
        return jsonResponse({ meta: null });
      }
      slug = mappedSlug;
      category = 'film';
    } else if (rawId.startsWith('nfb_')) {
      const parts = rawId.split('_');
      category = parts[1];
      slug = parts.slice(2).join('_');
    }

    console.log(`[Meta] 🔍 解析: type=${type}, category=${category}, slug=${slug}`);

    let data = null;
    if (category === 'film') data = await Adapter.fetchFilmMeta(slug);
    else if (category === 'series') data = await Adapter.fetchSeriesMeta(slug);
    else if (category === 'collection') data = await Adapter.fetchCollectionMeta(slug);

    if (!data) {
      console.log(`[Meta] ❌ 数据为空`);
      return jsonResponse({ meta: null });
    }

    const meta = {
      id: rawId,
      type: type,
      name: data.title,
      poster: data.image ? (data.image.startsWith('http') ? data.image : buildImageUrl(pattern, data.image, 400, 600)) : (data.jacket ? buildImageUrl(pattern, data.jacket, 400, 600) : ''),
      background: data.thumbnailUrl ? data.thumbnailUrl.replace(/\?.*$/, '') + '?w=1920&h=1080' : (data.thumbnail ? buildImageUrl(pattern, data.thumbnail, 1920, 1080) : ''),
      description: data.description || '',
      releaseInfo: data.year ? String(data.year) : '',
      year: data.year ? String(data.year) : '',
      runtime: parseDuration(data.duration),
    };

    if (data.seasons && data.seasons[0] && data.seasons[0].episodes) {
      meta.videos = data.seasons[0].episodes.map(ep => ({
        id: `nfb_film_${ep.slug}`,
        title: ep.title,
        season: 1,
        episode: ep.number || 1,
        released: `${ep.year || data.year}-01-01T00:00:00Z`,
        thumbnail: ep.thumbnail ? buildImageUrl(pattern, ep.thumbnail, 300, 200) : ''
      }));
    } else {
      meta.videos = [{ id: rawId, title: data.title, season: 1, episode: 1 }];
    }

    console.log(`[Meta] ✅ 返回详情: ${meta.name}, videos=${meta.videos.length}`);
    return jsonResponse({ meta }, 600);
  }

  // ================= Stream =================
  const streamMatch = pathname.match(/^\/stream\/(movie|series)\/([^/]+)\.json$/);
  if (streamMatch) {
    const rawId = decodeURIComponent(streamMatch[2]);
    if (rawId === 'undefined') {
      return jsonResponse({ streams: [] });
    }
    let slug = rawId;
    if (rawId.startsWith('nfb_')) {
      slug = rawId.split('_').slice(2).join('_');
    } else if (rawId.startsWith('tt')) {
      const mappedSlug = await resolveImdbToSlug(rawId);
      if (!mappedSlug) return jsonResponse({ streams: [] });
      slug = mappedSlug;
    }
    
    console.log(`[Stream] 🔍 解析: slug=${slug}`);

    const data = await Adapter.fetchStream(slug);
    if (!data || !data.hls) {
      console.log(`[Stream] ❌ 无播放源`);
      return jsonResponse({ streams: [] });
    }

    const streams = [];
    if (data.hls) streams.push({ name: 'NFB', title: 'HLS / Auto', url: data.hls.split('#')[0] });
    if (data.hls_dv) streams.push({ name: 'NFB', title: 'HLS / Dolby Vision', url: data.hls_dv.split('#')[0] });

    console.log(`[Stream] ✅ 返回 ${streams.length} 个播放源`);
    return jsonResponse({ streams }, 600);
  }

  // ================= Subtitles =================
  const subMatch = pathname.match(/^\/subtitles\/(movie|series)\/([^/]+)\.json$/);
  if (subMatch) {
    const rawId = decodeURIComponent(subMatch[2]);
    console.log(`[Subtitles] 🔍 解析: id=${rawId}`);

    let imdbId = null;

    if (rawId.startsWith('tt')) {
      imdbId = rawId;
    } else if (rawId.startsWith('nfb_')) {
      const parts = rawId.split('_');
      const category = parts[1];
      const slug = parts.slice(2).join('_');

      console.log(`[Subtitles] 需要 IMDb ID，正在获取 NFB 详情...`);
      let data = null;
      if (category === 'film') data = await Adapter.fetchFilmMeta(slug);
      else if (category === 'series') data = await Adapter.fetchSeriesMeta(slug);
      else if (category === 'collection') data = await Adapter.fetchCollectionMeta(slug);

      if (data && data.title) {
        console.log(`[Subtitles] 🔍 反向映射 TMDB: "${data.title}" (${data.year})`);
        imdbId = await resolveSlugToImdb(slug, data.title, data.year);
      }
    }

    if (!imdbId) {
      console.log(`[Subtitles] ❌ 无法获取 IMDb ID，返回空字幕`);
      return jsonResponse({ subtitles: [] }, 600);
    }

    const targetLang = globalThis.__USER_CONFIG.subtitleLang || 'zh-en';
    console.log(`[Subtitles] 🎯 开始拉取字幕: imdbId=${imdbId}, lang=${targetLang}`);
    
    const subtitles = await getSubtitles(imdbId, targetLang);
    console.log(`[Subtitles] ✅ 返回 ${subtitles.length} 条字幕`);
    
    return jsonResponse({ subtitles }, 600);
  }

  // 兜底 404
  return new Response('Not Found', { status: 404 });
}

export default { fetch: handleRequest };