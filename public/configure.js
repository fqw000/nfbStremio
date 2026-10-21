/**
 * NFB · 配置页面交互逻辑
 *
 * @module public/configure
 */
(function () {
    'use strict';

    // ==========================================
    // 常量
    // ==========================================

    /** 默认勾选的频道（与 src/config.js 的 isDefault 保持一致） */
    const DEFAULT_CHS = [
        'childrens_film',
        'exploreanimation_new_en',
        'cartoons_for_kids',
        'best_of_ani'
    ];

    /** 后端排序时优先的频道（与 src/config.js 的 PREFERRED 保持一致） */
    const PREFERRED = ['best_of_ani'];

    // ==========================================
    // DOM 缓存
    // ==========================================

    const $ = (id) => document.getElementById(id);

    const el = {
        customChs: $('customChs'),
        tmdbKey: $('tmdbKey'),
        osKey: $('osKey'),
        subdlKey: $('subdlKey'),
        generateBtn: $('generateBtn'),
        resetBtn: $('resetBtn'),
        resultCard: $('resultCard'),
        manifestUrl: $('manifestUrl'),
        copyBtn: $('copyBtn'),
        installBtn: $('installBtn'),
        webInstallBtn: $('webInstallBtn'),
        configPreview: $('configPreview'),
        orderList: $('orderList'),
        checkboxes: document.querySelectorAll('.channel-item input[type="checkbox"]')
    };

    /** 当前目录顺序（'trending' 或 channel id） */
    let currentOrder = ['trending'];

    // ==========================================
    // 工具函数
    // ==========================================

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c]));
    }

    function getCheckedChannels() {
        return Array.from(el.checkboxes)
            .filter((cb) => cb.checked)
            .map((cb) => cb.value);
    }

    function getCustomChannels() {
        return (el.customChs.value || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }

    /**
     * 计算默认目录顺序（必须与 src/config.js 的默认逻辑一致）
     * 规则：Trending 最前 → PREFERRED 频道 → 其余频道
     */
    function computeDefaultOrder(checkedIds, customIds) {
        const channelIds = [...checkedIds, ...customIds];
        const front = PREFERRED.filter((id) => channelIds.includes(id));
        const rest = channelIds.filter((id) => !PREFERRED.includes(id));
        return ['trending', ...front, ...rest];
    }

    function getChannelDisplayName(id) {
        if (id === 'trending') return '🔥 Trending (热门)';
        const cb = document.querySelector(
            `.channel-item input[value="${id}"]`
        );
        if (cb) {
            const label = cb.closest('label');
            const text = label?.querySelector('span')?.textContent;
            if (text) return text;
        }
        return `📺 ${id} (自定义)`;
    }

    // ==========================================
    // 排序列表渲染
    // ==========================================

    function renderOrderList() {
        const checkedIds = getCheckedChannels();
        const customIds = getCustomChannels();
        const allValidIds = new Set(['trending', ...checkedIds, ...customIds]);

        // 1. 保留顺序中仍有效的项
        currentOrder = currentOrder.filter((id) => allValidIds.has(id));

        // 2. 追加缺失的项
        //    优先补上 PREFERRED（例如用户先取消后重新勾选 best_of_ani）
        const missingIds = [...allValidIds].filter(
            (id) => !currentOrder.includes(id)
        );
        const preferredMissing = missingIds.filter((id) => PREFERRED.includes(id));
        const otherMissing = missingIds.filter((id) => !PREFERRED.includes(id));

        // PREFERRED 的缺失项插入到 trending 之后（若有）或最前面
        if (preferredMissing.length > 0) {
            const trendingIdx = currentOrder.indexOf('trending');
            const insertAt = trendingIdx >= 0 ? trendingIdx + 1 : 0;
            currentOrder.splice(insertAt, 0, ...preferredMissing);
        }
        currentOrder.push(...otherMissing);

        // 3. 渲染 DOM
        el.orderList.innerHTML = '';
        if (currentOrder.length === 0) {
            el.orderList.innerHTML =
                '<li class="order-empty">尚未选择任何目录</li>';
            return;
        }

        currentOrder.forEach((id, index) => {
            const li = document.createElement('li');
            li.className = 'order-item';
            const upDisabled = index === 0 ? 'disabled' : '';
            const downDisabled =
                index === currentOrder.length - 1 ? 'disabled' : '';
            li.innerHTML = `
                <span class="name">${escapeHtml(getChannelDisplayName(id))}</span>
                <div class="controls">
                    <button data-id="${escapeHtml(id)}" data-dir="up" ${upDisabled}>↑</button>
                    <button data-id="${escapeHtml(id)}" data-dir="down" ${downDisabled}>↓</button>
                </div>
            `;
            el.orderList.appendChild(li);
        });

        // 4. 绑定按钮事件
        el.orderList.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const dir = btn.dataset.dir;
                const idx = currentOrder.indexOf(id);
                if (idx < 0) return;
                if (dir === 'up' && idx > 0) {
                    [currentOrder[idx - 1], currentOrder[idx]] = [
                        currentOrder[idx],
                        currentOrder[idx - 1]
                    ];
                } else if (dir === 'down' && idx < currentOrder.length - 1) {
                    [currentOrder[idx], currentOrder[idx + 1]] = [
                        currentOrder[idx + 1],
                        currentOrder[idx]
                    ];
                }
                renderOrderList();
            });
        });
    }

    // ==========================================
    // 配置编码与收集
    // ==========================================

    function encodeConfig(config) {
        try {
            const json = JSON.stringify(config);
            const escaped = unescape(encodeURIComponent(json));
            return btoa(escaped)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');
        } catch (err) {
            console.error('配置编码失败:', err);
            return '';
        }
    }

    function collectConfig() {
        const config = {};

        // ===== 1. 频道勾选 =====
        const checked = getCheckedChannels();
        const checkedSet = new Set(checked);
        const defaultSet = new Set(DEFAULT_CHS);
        const isDefaultChs =
            checkedSet.size === defaultSet.size &&
            [...checkedSet].every((id) => defaultSet.has(id));

        // 只有非默认组合才写入（默认组合时后端走 isDefault=true 逻辑）
        if (!isDefaultChs) {
            config.chs = checked;
        }

        // ===== 2. 自定义频道 =====
        const custom = getCustomChannels();
        if (custom.length > 0) {
            config.customChs = custom.join(',');
        }

        // ===== 3. 目录顺序 =====
        // 只有当用户实际拖动过顺序（与"后端默认顺序"不一致）时才写入
        const defaultOrder = computeDefaultOrder(checked, custom);
        if (JSON.stringify(currentOrder) !== JSON.stringify(defaultOrder)) {
            config.order = currentOrder;
        }

        // ===== 4. API Keys =====
        const tmdb = el.tmdbKey.value.trim();
        if (tmdb) config.tmdbKey = tmdb;

        const os = el.osKey.value.trim();
        if (os) config.osKey = os;

        const subdl = el.subdlKey.value.trim();
        if (subdl) config.subdlKey = subdl;

        return config;
    }

    // ==========================================
    // 生成 / 重置 / 复制
    // ==========================================

    function generate() {
        const config = collectConfig();
        const base = window.location.origin;
        const hasConfig = Object.keys(config).length > 0;

        let manifestUrl = `${base}/manifest.json`;
        if (hasConfig) {
            manifestUrl += `?cfg=${encodeConfig(config)}`;
        }

        el.manifestUrl.value = manifestUrl;
        el.installBtn.href = manifestUrl.replace(/^https?:\/\//, 'stremio://');

        el.configPreview.textContent = JSON.stringify(
            {
                config:
                    Object.keys(config).length === 0
                        ? '(默认配置：Trending + 4 个默认频道)'
                        : config,
                manifest: manifestUrl
            },
            null,
            2
        );

        el.resultCard.classList.add('show');
        el.resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function reset() {
        // 1. 频道勾选恢复为默认
        el.checkboxes.forEach((cb) => {
            cb.checked = DEFAULT_CHS.includes(cb.value);
        });

        // 2. 清空自定义频道与 API Keys
        el.customChs.value = '';
        el.tmdbKey.value = '';
        el.osKey.value = '';
        el.subdlKey.value = '';

        // 3. 排序重置为默认顺序
        currentOrder = computeDefaultOrder(DEFAULT_CHS, []);
        renderOrderList();

        // 4. 隐藏结果卡片
        el.resultCard.classList.remove('show');
    }

    function copyUrl() {
        const url = el.manifestUrl.value;
        if (!url) return;

        const doCopy = () => {
            if (navigator.clipboard && window.isSecureContext) {
                return navigator.clipboard.writeText(url);
            }
            el.manifestUrl.select();
            el.manifestUrl.setSelectionRange(0, 99999);
            document.execCommand('copy');
            return Promise.resolve();
        };

        doCopy()
            .then(() => alert('✅ 已复制到剪贴板'))
            .catch((err) => {
                console.error('复制失败:', err);
                alert('复制失败，请手动选择');
            });
    }

    function webInstall() {
        const url = el.manifestUrl.value;
        if (!url) return;
        window.open(
            `https://web.stremio.com/#/addons?addon=${encodeURIComponent(url)}`,
            '_blank'
        );
    }

    // ==========================================
    // 事件绑定
    // ==========================================

    el.generateBtn.addEventListener('click', generate);
    el.resetBtn.addEventListener('click', reset);
    el.copyBtn.addEventListener('click', copyUrl);
    el.webInstallBtn.addEventListener('click', webInstall);

    // 频道勾选变化 → 刷新排序列表
    el.checkboxes.forEach((cb) => {
        cb.addEventListener('change', renderOrderList);
    });

    // 自定义频道输入 → 防抖刷新排序列表
    let customTimer = null;
    el.customChs.addEventListener('input', () => {
        clearTimeout(customTimer);
        customTimer = setTimeout(renderOrderList, 300);
    });

    // ==========================================
    // 初始化
    // ==========================================

    // 1. 恢复默认勾选状态
    el.checkboxes.forEach((cb) => {
        cb.checked = DEFAULT_CHS.includes(cb.value);
    });

    // 2. 初始化排序列表
    currentOrder = computeDefaultOrder(DEFAULT_CHS, []);
    renderOrderList();

    // 3. 如果 URL 带 autogen=1，自动生成
    if (new URLSearchParams(location.search).has('autogen')) {
        generate();
    }
})();