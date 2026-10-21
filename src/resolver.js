import { CONFIG } from './config.js';
import { getCache, setCache } from './cache.js';
import { fetchFilmSearch } from './adapter.js';

// 内存并发去重
const inflightImdb2Slug = new Map();
const inflightSlug2Imdb = new Map();

// ==========================================
// 1. tt -> nfb (IMDb 映射到 NFB slug)
// ==========================================

export async function resolveImdbToSlug(imdbId) {
  const cacheKey = `nfb:imdb2slug:${imdbId}`;
  const failKey = `nfb:imdb2slug:fail:${imdbId}`;
  
  const cached = await getCache(cacheKey);
  if (cached && cached.slug) return cached.slug; 
  
  const isFailed = await getCache(failKey);
  if (isFailed) {
    console.log(`[Resolver] ⚠️ 命中失败缓存，跳过 TMDB (tt): ${imdbId}`);
    return null;
  }

  if (inflightImdb2Slug.has(imdbId)) {
    console.log(`[Resolver] ⏳ 等待进行中的 TMDB 映射: ${imdbId}`);
    return inflightImdb2Slug.get(imdbId);
  }

  const promise = doImdb2Slug(imdbId, cacheKey, failKey)
    .finally(() => inflightImdb2Slug.delete(imdbId));

  inflightImdb2Slug.set(imdbId, promise);
  return promise;
}

async function doImdb2Slug(imdbId, cacheKey, failKey) {
  if (!CONFIG.TMDB_API_KEY) return null;

  const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${CONFIG.TMDB_API_KEY}&external_source=imdb_id&language=en-US`;
  console.log(`[Resolver] 🔍 TMDB Find: ${imdbId}`);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    const results = data.movie_results || [];
    if (results.length === 0) {
      await setCache(failKey, true, 3600); 
      return null;
    }

    const movie = results[0];
    const title = movie.title || movie.original_title;
    const year = movie.release_date ? parseInt(movie.release_date.slice(0, 4), 10) : null;
    const homepage = movie.homepage || '';

    let slug = null;
    const match = homepage.match(/nfb\.ca\/film\/([^\/]+)/i);
    
    if (match) {
      slug = match[1];
      console.log(`[Resolver] ✅ 主页映射成功: ${slug}`);
    } else {
      console.log(`[Resolver] ⚠️ 无主页链接，用标题搜索 NFB: "${title}"`);
      const nfbRes = await fetchFilmSearch(title, 1, 10);
      
      if (nfbRes && nfbRes.items) {
        for (const item of nfbRes.items) {
          const titleMatch = item.title.toLowerCase() === title.toLowerCase();
          const yearMatch = !year || !item.year || Math.abs(item.year - year) <= 1;
          if (titleMatch && yearMatch) {
            slug = item.slug;
            console.log(`[Resolver] ✅ 标题搜索匹配: ${slug}`);
            break;
          }
        }
      }
    }

    if (slug) {
      await setCache(cacheKey, { slug }, 7 * 24 * 3600);
      return slug;
    } else {
      await setCache(failKey, true, 3600);
      return null;
    }

  } catch (err) {
    console.error(`[Resolver] ❌ TMDB 请求失败: ${err.message}，进入 60 秒冷却`);
    await setCache(failKey, true, 60); 
    return null; 
  }
}

// ==========================================
// 2. nfb -> tt (NFB slug 映射到 IMDb，用于字幕查询)
// ==========================================

export async function resolveSlugToImdb(slug, title, year) {
  const cacheKey = `nfb:slug2imdb:${slug}`;
  const failKey = `nfb:slug2imdb:fail:${slug}`;

  const cached = await getCache(cacheKey);
  if (cached && cached.imdbId) return cached.imdbId;

  const isFailed = await getCache(failKey);
  if (isFailed) {
    console.log(`[Resolver] ⚠️ 命中失败缓存，跳过 TMDB (slug): ${slug}`);
    return null;
  }

  if (inflightSlug2Imdb.has(slug)) {
    console.log(`[Resolver] ⏳ 等待进行中的 TMDB 反向映射: ${slug}`);
    return inflightSlug2Imdb.get(slug);
  }

  const promise = doSlug2Imdb(slug, title, year, cacheKey, failKey)
    .finally(() => inflightSlug2Imdb.delete(slug));

  inflightSlug2Imdb.set(slug, promise);
  return promise;
}

async function doSlug2Imdb(slug, title, year, cacheKey, failKey) {
  if (!CONFIG.TMDB_API_KEY) return null;

  console.log(`[Resolver] 🔍 反向 TMDB 搜索: "${title}" (${year})`);
  
  try {
    let searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
    if (year) searchUrl += `&year=${year}`;

    let res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let data = await res.json();
    let movie = data.results && data.results[0];

    // 容错：如果带年份没搜到，去掉年份再搜
    if (!movie && year) {
      console.log(`[Resolver] ⚠️ 带年份搜索无结果，尝试去掉年份重试...`);
      searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
      res = await fetch(searchUrl);
      if (res.ok) {
        data = await res.json();
        movie = (data.results || []).find(m => 
          (m.title || '').toLowerCase() === title.toLowerCase()
        );
      }
    }

    if (movie) {
      const findUrl = `https://api.themoviedb.org/3/movie/${movie.id}/external_ids?api_key=${CONFIG.TMDB_API_KEY}`;
      const findRes = await fetch(findUrl);
      if (!findRes.ok) throw new Error(`HTTP ${findRes.status}`);
      const findData = await findRes.json();
      
      const imdbId = findData.imdb_id;
      if (imdbId) {
        await setCache(cacheKey, { imdbId }, 7 * 24 * 3600);
        // 顺便把正向映射也缓存了
        await setCache(`nfb:imdb2slug:${imdbId}`, { slug }, 7 * 24 * 3600);
        console.log(`[Resolver] ✅ 反向映射成功: ${slug} -> ${imdbId}`);
        return imdbId;
      }
    }
    
    console.warn(`[Resolver] ❌ TMDB 中未找到对应电影: "${title}"`);
    await setCache(failKey, true, 3600);
    return null;

  } catch (err) {
    console.error(`[Resolver] ❌ TMDB 反向搜索失败: ${err.message}，进入 60 秒冷却`);
    await setCache(failKey, true, 60);
    return null;
  }
}