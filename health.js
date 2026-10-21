#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TIMEOUT = parseInt(process.env.TIMEOUT || '20000', 10);
const UA = 'Stremio/4.4.168';

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };

let stats = { total: 0, passed: 0, failed: 0 };

async function fetchJson(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
        const res = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': UA }, signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function test(name, path, validate) {
    stats.total++;
    const start = Date.now();
    const data = await fetchJson(path);
    const elapsed = Date.now() - start;
    
    if (!data) {
        console.log(`${C.red}❌ [FAIL] ${name} - 请求失败或超时 (${elapsed}ms)${C.reset}`);
        stats.failed++;
        return;
    }
    const res = validate(data);
    if (res === true) {
        console.log(`${C.green}✅ [PASS] ${name} (${elapsed}ms)${C.reset}`);
        stats.passed++;
    } else {
        console.log(`${C.red}❌ [FAIL] ${name} - ${res} (${elapsed}ms)${C.reset}`);
        stats.failed++;
    }
}

async function run() {
    console.log(`\n${C.cyan}=== NFB 全面测试 ===${C.reset}\n`);

    await test('Manifest - 基础结构', '/manifest.json', d => {
        if (!d.catalogs) return '缺少 catalogs';
        if (!d.catalogs.some(c => c.type === 'movie')) return '缺少 movie 目录';
        if (!d.catalogs.some(c => c.type === 'series')) return '缺少 series 目录';
        return true;
    });

    let p1Data, p2Data;
    await test('Catalog - Movie 第 1 页', '/catalog/movie/nfb_trending_movies.json?skip=0', d => {
        if (!d.metas || d.metas.length === 0) return 'metas 为空';
        p1Data = d.metas;
        return true;
    });
    
    await test('Catalog - Movie 第 2 页 (懒加载验证)', '/catalog/movie/nfb_trending_movies.json?skip=20', d => {
        if (!d.metas) return 'metas 非数组';
        p2Data = d.metas;
        if (p1Data && p1Data.length > 0 && p2Data.length > 0) {
            if (p1Data[0].id === p2Data[0].id) return '两页数据完全一样，懒加载未生效';
        }
        return true;
    });

    await test('Catalog - 频道 Series', '/catalog/series/nfb_ch_binge-worthy-series_series.json', d => {
        if (!d.metas) return 'metas 非数组';
        return true;
    });

    await test('Search - Movie', '/catalog/movie/nfb_trending_movies/search=snit.json', d => {
        if (!d.metas || d.metas.length === 0) return '无搜索结果';
        if (!d.metas[0].id.startsWith('nfb_film_')) return '搜索结果 ID 未标记为 film';
        return true;
    });

    let filmId, seriesId;
    await test('Meta - Film 详情', '/meta/movie/nfb_film_bread-will-walk.json', d => {
        if (!d.meta) return 'meta 为空';
        filmId = d.meta.id;
        return true;
    });

    await test('Meta - Series 详情', '/meta/series/nfb_series_rwanda-series.json', d => {
        if (!d.meta) return 'meta 为空';
        if (!d.meta.videos || d.meta.videos.length === 0) return '缺少 videos 数组';
        seriesId = d.meta.videos[0].id;
        return true;
    });

    await test('Meta - Collection 详情', '/meta/series/nfb_collection_children-first-collection.json', d => {
        if (!d.meta) return 'meta 为空';
        return true;
    });

    // ★ 新增：测试 tt 映射
    await test('Meta - IMDb (tt0088805)', '/meta/movie/tt0088805.json', d => {
        if (!d.meta) return 'meta 为空 (映射失败)';
        if (d.meta.id !== 'tt0088805') return '返回的 ID 没有保留 tt 格式';
        return true;
    });

    await test('Stream - Film 播放', `/stream/movie/${filmId}.json`, d => {
        if (!d.streams || d.streams.length === 0) return '无播放源';
        return true;
    });

    await test('Stream - Series 子集播放', `/stream/series/${seriesId}.json`, d => {
        if (!d.streams || d.streams.length === 0) return '无播放源';
        return true;
    });

    console.log(`\n${C.cyan}=== 📊 汇总: 总计 ${stats.total} | ✅ 通过 ${stats.passed} | ❌ 失败 ${stats.failed} ===${C.reset}\n`);
}

run();