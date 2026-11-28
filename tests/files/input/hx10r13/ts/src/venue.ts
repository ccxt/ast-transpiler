import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    req (a: string, params: Dict = {}): Dict {
        const request: Dict = { 'a': a };
        return this.extend (request, params);
    }
    lit (a: string): Dict {
        const request: Dict = { 'a': a, 'b': 1 };
        return request;
    }
    mixed (a: string, params: Dict = {}): Dict {
        if (a === 'x') {
            return params;
        }
        return this.extend ({}, params);
    }
    run (params: Dict = {}) {
        const r1 = this.req ('x', params);
        delete r1['category'];
        const r2 = this.lit ('y');
        delete r2['b'];
        const r3 = this.extend ({ 'n': 1 }, params);
        delete r3['signer'];
        const r4 = this.mixed ('z', params);
        delete r4['k'];
        let r5 = this.req ('x', params);
        delete r5['q'];
        return [ r1, r2, r3, r4, r5 ];
    }
}
