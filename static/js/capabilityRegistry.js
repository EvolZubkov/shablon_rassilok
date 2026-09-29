// capabilityRegistry.js — реестр capabilities и применение обёрток

const CapabilityRegistry = {
    _caps: {},

    register(cap) {
        this._caps[cap.id] = cap;
    },

    get(id) {
        return this._caps[id] || null;
    },

    // Применить все wrapper-обёртки к HTML блока.
    // mode: 'preview' | 'email'
    applyWrappers(html, block, mode) {
        if (!html || !block) return html || '';
        if (typeof ProfileLoader === 'undefined' || !ProfileLoader.loaded) return html;

        const capIds = ProfileLoader.getCapabilities(block.type);
        return capIds.reduce((acc, capId) => {
            const cap = this.get(capId);
            if (!cap) return acc;
            return mode === 'email'
                ? (cap.wrapEmail   ? cap.wrapEmail(acc, block.settings)   : acc)
                : (cap.wrapPreview ? cap.wrapPreview(acc, block.settings) : acc);
        }, html);
    },
};
