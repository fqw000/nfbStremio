const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function run() {
  console.log('========== 1. 验证 id / registry_id / expression_id 的等价性 ==========');
  // 从你给的 channel 示例中，Bread Will Walk 的 registry_id 是 1026550
  const testId = 1026550;
  
  try {
    const res1 = await fetchJson(`https://publicapi.nfb.ca/api/v5/works?expression_id=${testId}`);
    console.log(`[expression_id=${testId}] 查询结果:`, res1.items?.[0]?.title, '| id:', res1.items?.[0]?.id, '| work_id:', res1.items?.[0]?.work_id);
  } catch (e) { console.log('expression_id 查询失败:', e.message); }

  try {
    const res2 = await fetchJson(`https://publicapi.nfb.ca/api/v5/works?registry_ids=${testId}`);
    console.log(`[registry_ids=${testId}] 查询结果:`, res2.items?.[0]?.title, '| id:', res2.items?.[0]?.id, '| work_id:', res2.items?.[0]?.work_id);
  } catch (e) { console.log('registry_ids 查询失败:', e.message); }

  console.log('\n========== 2. 验证 Series 和 Collection 的 Meta 接口返回分类 ==========');
  // 测试 Series
  try {
    const resSeries = await fetchJson(`https://publicapi.nfb.ca/api/v5/series/rwanda-series`);
    console.log(`Series 接口: category=${resSeries.item.category}, slug=${resSeries.item.slug}, 包含 episodes 数量: ${resSeries.item.seasons?.[0]?.episodes?.length}`);
  } catch (e) { console.log('Series 请求失败:', e.message); }
  
  // 测试 Collection
  try {
    const resCol = await fetchJson(`https://publicapi.nfb.ca/api/v5/collections/children-first-collection`);
    console.log(`Collection 接口: category=${resCol.item.category}, slug=${resCol.item.slug}, 包含 episodes 数量: ${resCol.item.seasons?.[0]?.episodes?.length}`);
  } catch (e) { console.log('Collection 请求失败:', e.message); }

  console.log('\n========== 3. 验证 Stream 接口是否直接接受 episode_slug ==========');
  // 使用 Rwanda Series 的第 3 集 slug：chronicle-of-a-genocide-foretold-part-1
  const episodeSlug = 'chronicle-of-a-genocide-foretold-part-1';
  try {
    const resStream = await fetchJson(`https://www.nfb.ca/api/v4/films/${episodeSlug}/stream`);
    console.log(`Stream 查询 ${episodeSlug}: 成功，包含 hls=${!!resStream.hls}`);
  } catch (e) { console.log('Stream 请求失败:', e.message); }

  console.log('\n========== 4. 验证 Search 懒加载参数 (page=2 是否生效) ==========');
  try {
    const resSearch = await fetchJson(`https://searchapi.nfb.ca/api/search/v4/films/?q=children&per_page=10&page=2`);
    console.log(`Search page=2 返回条数: ${resSearch.items.length}, meta信息: page=${resSearch.meta.page}, pages=${resSearch.meta.pages}`);
  } catch (e) { console.log('Search 请求失败:', e.message); }

  console.log('\n========== 5. 验证 Channel 接口是否自带 type 和 registry_id ==========');
  try {
    const resChannel = await fetchJson(`https://www.nfb.ca/api/v4/channels/halloween-movies/items?per_page=3&page=1`);
    const items = resChannel.data || [];
    items.forEach((item, idx) => {
      console.log(`Channel 第${idx+1}条: title="${item.title}", type=${item.type}, registry_id=${item.registry_id}, slug=${item.slug}`);
    });
  } catch (e) { console.log('Channel 请求失败:', e.message); }
}

run().catch(console.error);