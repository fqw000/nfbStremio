/**
 * 缓存模块（符合规范 v1.1）
 * 自动使用 CONFIG.APP_PREFIX 隔离不同项目的 Redis Key
 */
import { CONFIG } from './config.js';

const memCache = new Map();
const MAX_MEM_SIZE = 200;
const L1_TTL = 60;

const REDIS_TIMEOUT = 800;
const REDIS_SLOW_THRESHOLD = 500;
const REDIS_COOLDOWN = 60000;
const REDIS_SLOW_TRIGGER = 3;

let redisSlowCount = 0;
let redisCooldownUntil = 0;

function isRedisInCooldown() {
  return Date.now() < redisCooldownUntil;
}

function recordRedisSlow(elapsed, reason) {
  redisSlowCount++;
  if (redisSlowCount >= REDIS_SLOW_TRIGGER) {
    redisCooldownUntil = Date.now() + REDIS_COOLDOWN;
    console.warn(`[Cache] ⚠️ Redis ${reason} (${elapsed}ms × ${redisSlowCount})，冷却 ${REDIS_COOLDOWN / 1000} 秒`);
    redisSlowCount = 0;
  }
}

/**
 * 强制为 Key 添加 APP_PREFIX
 * 例如传入 'nfb:catalog:1'，返回 'nfb:prod:nfb:catalog:1'
 */
function prefixKey(rawKey) {
  const prefix = CONFIG.APP_PREFIX || 'unknown:unknown';
  return `${prefix}:${rawKey}`;
}

async function redisCommand(...args) {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = CONFIG;
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return null;
  if (isRedisInCooldown()) return null;

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT);

    const res = await fetch(UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const elapsed = Date.now() - startTime;
    if (!res.ok) { recordRedisSlow(elapsed, 'HTTP 错误'); return null; }
    
    const data = await res.json();
    if (elapsed > REDIS_SLOW_THRESHOLD) recordRedisSlow(elapsed, '慢响应');
    else redisSlowCount = 0;

    return data.result;
  } catch (err) {
    recordRedisSlow(Date.now() - startTime, '失败');
    return null;
  }
}

export async function getCache(rawKey) {
  // L1 内存缓存
  const mem = memCache.get(rawKey);
  if (mem && Date.now() <= mem.expireAt) return mem.data;
  if (mem) memCache.delete(rawKey);

  // L2 Redis 缓存
  const key = prefixKey(rawKey);
  const raw = await redisCommand('GET', key);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      console.log(`[Cache] ✅ L2 HIT: ${key}`);
      memCache.set(rawKey, { data, expireAt: Date.now() + L1_TTL * 1000 });
      return data;
    } catch (e) {}
  }
  return null;
}

export async function setCache(rawKey, data, ttlSeconds = 3600) {
  memCache.set(rawKey, { data, expireAt: Date.now() + Math.min(ttlSeconds, L1_TTL) * 1000 });
  if (memCache.size > MAX_MEM_SIZE) {
    memCache.delete(memCache.keys().next().value);
  }

  const key = prefixKey(rawKey);
  await redisCommand('SET', key, JSON.stringify(data), 'EX', ttlSeconds);
  console.log(`[Cache] ✅ L2 WRITE: ${key} (ttl=${ttlSeconds}s)`);
}