import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    async privatePostLedgers (params: Dict = {}): Promise<any> {
        return {};
    }
    async fetchLedger (params: Dict = {}) {
        const response = await this.privatePostLedgers (params);
        const ledger = this.safeDict (response, 'ledger', {});
        const keys = Object.keys (ledger);
        const items = [];
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = ledger[key];
            value['id'] = key;
            items.push (value);
        }
        return items;
    }
    findAlt (id: any) {
        const byAlt = this.safeDict (this.options, 'byAlt', {});
        if (id in byAlt) {
            const found = byAlt[id];
            return found;
        }
        const loose = this.safeDict (this.options, 'loose', this.options);
        if (id in loose) {
            return loose[id];
        }
        return undefined;
    }
    flagged (params: Dict = {}) {
        const flag = this.safeBool (params, 'flag', false);
        if (flag) {
            return 1;
        }
        return 0;
    }
    lastOf (order: Dict) {
        const trades = this.safeList (order, 'trades', []);
        const numTrades = trades.length;
        let last = undefined;
        if (numTrades > 0) {
            last = trades[numTrades - 1];
        }
        for (let i = 1; i < numTrades; i++) {
            const prev = trades[i - 1];
            last = this.extend (prev, last);
        }
        const k = this.safeValue (order, 'k');
        return [ last, trades[k - 1] ];
    }
}
