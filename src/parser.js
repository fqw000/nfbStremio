/**
 * 从 HTML 中提取 JSON-LD 数据
 */
export function extractJsonLd(html) {
  if (!html) return null;

  // 兼容 <script nonce="xxx" type="application/ld+json"> 等带有其他属性的情况
  const match = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  
  if (!match) {
    console.warn(`[Parser] ⚠️ 未找到 JSON-LD 标签`);
    return null;
  }

  try {
    let jsonStr = match[1].trim();
    // 处理可能被 HTML 实体编码的特殊字符（尽管 NFB 目前没用，但防御性编程）
    jsonStr = jsonStr.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error(`[Parser] ❌ JSON-LD 解析失败:`, e.message);
    return null;
  }
}