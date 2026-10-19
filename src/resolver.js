// 利用 TMDB 的 find 接口，根据 tt ID 查到主页，如果主页包含 nfb.ca/film/，则提取 slug。
// 既然 TMDB 有英文标题和年份，我们就拿这个标题去 NFB 自己的搜索接口搜一下，如果年份匹配，那就是它

import { CONFIG } from './config.js';
import { getCache, setCache } from './cache.js';
import { fetchSearch } from './adapter.js';

/**
 * 从 TMDB 匹配 IMDb ID，并提取 NFB slug
 */
export async function resolveImdbToSlug(imdbId) {
  const cacheKey = `nfb:imdb2slug:${imdbId}`;
  
  const cached = await getCache(cacheKey);
  if (cached && cached.slug) {
    console.log(`[Resolver] ✅ 缓存命中: ${imdbId} -> ${cached.slug}`);
    return cached.slug; 
  }

  if (!CONFIG.TMDB_API_KEY) return null;

  const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${CONFIG.TMDB_API_KEY}&external_source=imdb_id&language=en-US`;
  console.log(`[Resolver] 🔍 TMDB Find: ${imdbId}`);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    const results = data.movie_results || [];
    if (results.length === 0) return null;

    const movie = results[0];
    const title = movie.title || movie.original_title;
    const year = movie.release_date ? parseInt(movie.release_date.slice(0, 4), 10) : null;
    
    let slug = null;

    const homepage = movie.homepage || '';
    const match = homepage.match(/nfb\.ca\/film\/([^\/]+)/i);
    if (match) {
      slug = match[1];
    } else {
      const nfbRes = await fetchSearch(title, 1, 10);
      if (nfbRes && nfbRes.items) {
        for (const item of nfbRes.items) {
          if (item.title.toLowerCase() === title.toLowerCase() && (!year || !item.year || Math.abs(item.year - year) <= 1)) {
            slug = item.slug;
            break;
          }
        }
      }
    }

    if (slug) {
      await setCache(cacheKey, { slug }, 7 * 24 * 3600);
      // ★ 关键改进：顺便把反向关系也存下来，方便查字幕
      await setCache(`nfb:slug2imdb:${slug}`, { imdbId }, 7 * 24 * 3600);
      console.log(`[Resolver] ✅ 映射成功: ${imdbId} -> ${slug}`);
      return slug;
    }
    return null;
  } catch (err) {
    console.error(`[Resolver] ❌ TMDB 请求失败: ${err.message}`);
    return null; 
  }
}

/**
 * 通过 slug 获取影片信息，再通过 TMDB 搜索拿到 IMDb ID
 */
/**
 * 通过 slug 获取影片信息，再通过 TMDB 搜索拿到 IMDb ID
 */
export async function resolveSlugToImdb(slug, title, year) {
  const cacheKey = `nfb:slug2imdb:${slug}`;
  
  const cached = await getCache(cacheKey);
  if (cached && cached.imdbId) {
    console.log(`[Resolver] ✅ 反向缓存命中: ${slug} -> ${cached.imdbId}`);
    return cached.imdbId;
  }

  if (!CONFIG.TMDB_API_KEY) return null;

  console.log(`[Resolver] 🔍 反向 TMDB 搜索: "${title}" (${year})`);
  
  try {
    // 第一次尝试：带年份
    let searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
    if (year) searchUrl += `&year=${year}`;

    let res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let data = await res.json();
    let movie = data.results && data.results[0];

    // 第二次尝试：如果带年份没搜到，去掉年份再搜
    if (!movie && year) {
      console.log(`[Resolver] ⚠️ 带年份搜索无结果，尝试去掉年份重试...`);
      searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
      res = await fetch(searchUrl);
      if (res.ok) {
        data = await res.json();
        // 去掉年份后，取标题完全匹配的第一个结果
        movie = (data.results || []).find(m => 
          (m.title || '').toLowerCase() === title.toLowerCase()
        );
      }
    }

    if (movie) {
      console.log(`[Resolver] 🔍 找到 TMDB ID: ${movie.id}，正在获取 IMDb ID...`);
      const findUrl = `https://api.themoviedb.org/3/movie/${movie.id}/external_ids?api_key=${CONFIG.TMDB_API_KEY}`;
      const findRes = await fetch(findUrl);
      if (!findRes.ok) throw new Error(`HTTP ${findRes.status}`);
      const findData = await findRes.json();
      
      const imdbId = findData.imdb_id;
      if (imdbId) {
        await setCache(cacheKey, { imdbId }, 7 * 24 * 3600);
        // 顺便存正向
        await setCache(`nfb:imdb2slug:${imdbId}`, { slug }, 7 * 24 * 3600);
        console.log(`[Resolver] ✅ 反向映射成功: ${slug} -> ${imdbId}`);
        return imdbId;
      }
    } else {
      console.warn(`[Resolver] ❌ TMDB 中未找到对应电影: "${title}"`);
    }
  } catch (e) {
    console.error(`[Resolver] ❌ TMDB 反向搜索失败:`, e.message);
  }
  return null;
}