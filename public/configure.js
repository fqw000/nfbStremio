(function () {
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
        checkboxes: document.querySelectorAll('.channel-item input[type="checkbox"]')
    };

    // Base64 URL 编码
    function encodeConfig(config) {
        try {
            const json = JSON.stringify(config);
            const escaped = unescape(encodeURIComponent(json));
            return btoa(escaped).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } catch (err) { return ''; }
    }

    // 收集配置
    function collectConfig() {
        const config = {};

        // 1. 预设频道
        const checked = Array.from(el.checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        const total = el.checkboxes.length;
        if (checked.length > 0 && checked.length < total) {
            config.chs = checked;
        }
        if (checked.length === 0) {
            config.chs = []; // 全不选
        }

        // 2. 自定义频道 (逗号分隔)
        const custom = el.customChs.value.trim();
        if (custom) {
            config.customChs = custom;
        }

        // 3. API Keys
        const tmdb = el.tmdbKey.value.trim();
        if (tmdb) config.tmdbKey = tmdb;
        
        const os = el.osKey.value.trim();
        if (os) config.osKey = os;

        const subdl = el.subdlKey.value.trim();
        if (subdl) config.subdlKey = subdl;

        return config;
    }

    // 生成链接
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
            { config: Object.keys(config).length === 0 ? '(默认全选)' : config, manifest: manifestUrl },
            null, 2
        );

        el.resultCard.classList.add('show');
        el.resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 重置
    function reset() {
        el.checkboxes.forEach(cb => cb.checked = true);
        el.customChs.value = '';
        el.tmdbKey.value = '';
        el.osKey.value = '';
        el.subdlKey.value = '';
        el.resultCard.classList.remove('show');
    }

    // 复制
    function copyUrl() {
        const url = el.manifestUrl.value;
        if (!url) return;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(url).then(() => alert('已复制到剪贴板'));
        } else {
            el.manifestUrl.select();
            document.execCommand('copy');
            alert('已复制到剪贴板');
        }
    }

    // 事件绑定
    el.generateBtn.addEventListener('click', generate);
    el.resetBtn.addEventListener('click', reset);
    el.copyBtn.addEventListener('click', copyUrl);
    el.webInstallBtn.addEventListener('click', () => {
        const url = el.manifestUrl.value;
        if (url) window.open(`https://web.stremio.com/#/addons?addon=${encodeURIComponent(url)}`, '_blank');
    });

    // 自动生成 (如果 URL 带 autogen=1)
    if (new URLSearchParams(location.search).has('autogen')) {
        generate();
    }
})();