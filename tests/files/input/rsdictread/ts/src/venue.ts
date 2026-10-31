import Exchange from './base/Exchange.js';
export default class venue extends Exchange {
    plainLocal (code) {
        let result = undefined;
        result = { 'a': 1 };
        const viaCode = result[code];
        const viaCore = result['core'];
        const viaMarker = result['symbol'];
        const has = code in result;
        return [ viaCode, viaCore, viaMarker, has ];
    }
    dictyLocal (code) {
        const merged = this.extend ({ 'a': 1 }, {});
        const viaLit = merged['core'];
        const viaCode = merged[code];
        const hasCode = code in merged;
        const hasLit = 'core' in merged;
        return [ viaLit, viaCode, hasCode, hasLit ];
    }
    optionsField (code) {
        const viaCode = this.options[code];
        const viaLit = this.options['defaultType'];
        const has = code in this.options;
        return [ viaCode, viaLit, has ];
    }
    unprovenLocal (a, code) {
        let x = a;
        const viaLit = x['core'];
        return [ viaLit, x[code] ];
    }
}
