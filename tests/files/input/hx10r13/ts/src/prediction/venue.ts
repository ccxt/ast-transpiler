import Exchange from '../base/Exchange.js';
import type { Dict } from '../base/Exchange.js';
export default class venue extends Exchange {
    wrapHead (o: Dict, params: Dict = {}): Dict {
        return this.extend (o, params);
    }
    wrapTail (o: Dict, params: Dict = {}): Dict {
        return this.extend (params, o);
    }
    run (params: Dict = {}) {
        const a = this.extend ({ 'n': 1 }, params);
        delete a['n'];
        const b = this.extend (params, { 'n': 1 });
        delete b['n'];
        const c = this.wrapHead ({ 'n': 1 }, params);
        delete c['n'];
        const e = this.wrapTail (params, { 'n': 1 });
        delete e['n'];
        return [ a, b, c, e ];
    }
}
