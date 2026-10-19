
# NFB Stremio Addon

> 一个为 **Stremio** 打造的加拿大国家电影局（National Film Board of Canada）影视插件。支持目录浏览、关键词搜索、影片详情、流媒体播放以及多语言字幕。

基于 **Vercel Edge Functions** 部署，配合 **Upstash Redis** 实现跨实例缓存。

---

## 目录

- [核心特性](#核心特性)
- [架构总览](#架构总览)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [接口说明](#接口说明)
- [ID 格式](#id-格式)
- [字幕降级策略](#字幕降级策略)
- [项目结构](#项目结构)
- [常见问题](#常见问题)

---

## 核心特性

- **完整功能** — 支持 `catalog` / `search` / `meta` / `stream` / `subtitles` 五大接口。
- **双 ID 体系** — 原生支持 NFB 专属 `nfb_{slug}` 格式，以及基于 TMDB 桥接的 `tt{imdb_id}` 格式。
- **双向解析** — 既支持通过 IMDb ID 找到 NFB 影片播放，也支持为 NFB 影片反向匹配 IMDb ID 以拉取字幕。
- **多级缓存** — 内存 + Upstash Redis，缓存带前缀隔离，避免多项目冲突。
- **三级字幕降级** — 优先使用 `trybox.app` 聚合源，失败后降级到 `OpenSubtitles`，最终兜底 `SubDL`。
- **零运行时依赖** — 纯原生 `fetch` 请求，极速冷启动。

---

## 架构总览

```text
Stremio 客户端
      │
      ▼
Vercel Edge Function
      │
      ├── /catalog  ──▶ searchapi.nfb.ca / publicapi.nfb.ca
      ├── /meta     ──▶ www.nfb.ca/film/{slug}/ (解析 JSON-LD)
      ├── /stream   ──▶ www.nfb.ca/api/v4/films/{slug}/stream (剥离 #expires)
      ├── /subtitles──▶ trybox.app -> OpenSubtitles -> SubDL
      │
      └── TMDB Resolver
            ├── tt -> nfb (find + search 兜底)
            └── nfb -> tt (search + external_ids)
```

---

## 快速开始

### 前置条件

| 依赖 | 说明 |
|---|---|
| Node.js ≥ 18 | 本地开发 |
| Vercel 账号 | 部署平台 |
| Upstash 账号 | Redis 缓存 |

### 1. 克隆项目并安装

```bash
git clone <your-repo-url>
cd nfbStremio
npm install
```

### 2. 配置环境变量

在本地根目录创建 `.env.local`：

```bash
# 必填
APP_PREFIX="nfb:dev"
UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="xxx"

# 选填（用于 IMDb 映射）
TMDB_KEY="xxx"

# 选填（用于字幕增强）
OPENSUBTITLES_API_KEY="xxx"
SUBDL_API_KEY="xxx"
```

### 3. 本地运行

```bash
npx vercel dev
```
访问 `http://localhost:3000/manifest.json` 测试。

### 4. 部署到 Vercel

```bash
npx vercel --prod
```

在 Vercel Dashboard 中同样配置上述环境变量。注意区分 `Production` / `Preview` / `Development` 环境的 `APP_PREFIX`。

---

## 环境变量说明

| 变量名 | 必填 | 说明 |
|---|---|---|
| `APP_PREFIX` | ✅ | Redis Key 前缀（如 `nfb:prod`） |
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis 地址 |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis Token |
| `TMDB_KEY` | ❌ | TMDB API Key，用于 IMDb 双向映射 |
| `OPENSUBTITLES_API_KEY` | ❌ | OpenSubtitles 字幕库 Key |
| `SUBDL_API_KEY` | ❌ | SubDL 字幕库 Key |

---

## 接口说明

遵循 Stremio Addon 规范：

- `GET /manifest.json`
- `GET /catalog/movie/nfb_catalog.json?skip=0`
- `GET /catalog/movie/nfb_catalog/search={query}.json`
- `GET /meta/movie/{id}.json`
- `GET /stream/movie/{id}.json`
- `GET /subtitles/movie/{id}.json`

---

## ID 格式

| 格式 | 说明 | 示例 |
|---|---|---|
| `nfb_{slug}` | NFB 原生的影片标识 | `nfb_big_snit` |
| `tt{imdb_id}` | IMDb 格式，通过 TMDB 自动映射 | `tt0088805` |

- **Meta / Stream** 接口同时支持两种 ID。
- **Subtitles** 接口若收到 `nfb_` 格式，会先请求 NFB JSON-LD 拿到标题和年份，再通过 TMDB 搜索对应的 `tt` ID 以请求字幕。

---

## 字幕降级策略

1. **trybox.app**：优先请求，并严格按照 `zh-en` 配置过滤语言。
2. **OpenSubtitles**：若 trybox 没有匹配的语言，使用 `imdb_id` 请求官方 API。
3. **SubDL**：若 OpenSubtitles 仍无结果，走 SubDL 兜底。
4. **静默降级**：若全部失败或未配置 Key，返回 `{ subtitles: [] }`，不影响视频播放。

*注：对于过于冷门的 NFB 早期短片，可能不存在社区中英文字幕，属于正常情况。*

---

## 项目结构

```text
nfbStremio/
├── api/
│   └── index.js              # Vercel Edge Function 入口
├── src/
│   ├── handler.js            # 路由分发
│   ├── manifest.js           # Stremio Manifest
│   ├── config.js             # 配置合并
│   ├── cache.js              # 带前缀隔离的缓存层
│   ├── adapter.js            # 网络请求封装（Search/Catalog/Meta/Stream）
│   ├── parser.js             # HTML JSON-LD 提取
│   ├── resolver.js           # TMDB 双向 ID 映射
│   ├── subtitles.js          # 多级字幕降级拉取
│   └── helper.js             # 工具函数（时长解析、ID 解析等）
├── vercel.json
├── package.json
└── README.md
```

---

## 常见问题

**Q：为什么我搜索到的 NFB 影片海报是空白的？**
A：部分 NFB 页面只提供了横版缩略图（thumbnailUrl），没有提供竖版海报。为了保证 Stremio 的 UI 不被拉伸，代码会将空的海报留空并显示默认占位图。

**Q：为什么某个影片的字幕是空的？**
A：本插件优先获取中文和英文字幕。如果是非常早期的 NFB 实验短片或未在 OpenSubtitles/SubDL 上被收录，就会返回空。

**Q：如何修改 Catalog 的默认排序？**
A：目前使用 NFB 官方默认排序。如果想修改，可以在 `src/adapter.js` 的 `fetchCatalog` 中调整请求参数。
