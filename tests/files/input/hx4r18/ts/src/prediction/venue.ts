import Exchange from '../base/Exchange.js';
import type { Dict } from '../base/Exchange.js';
export default class venue extends Exchange {
    keysOf (params: Dict = {}, response: any = undefined) {
        const query: Dict = {};
        query['a'] = params['a'];
        const queryKeys = Object.keys (query);
        const queryValues = Object.values (query);
        const loose = Object.keys (response);
        return [ queryKeys, queryValues, loose ];
    }
}
