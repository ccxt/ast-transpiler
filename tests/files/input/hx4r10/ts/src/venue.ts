import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    readParams (params: Dict) {
        const copied = this.parseOrder (params);
        const keys = this.sortKeys (params);
        const out = [ copied ];
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = params[key];
            out.push (value);
        }
        return out;
    }
    sortKeys (x): any {
        return Object.keys (x);
    }
    readLocal (code) {
        let result = undefined;
        result = { 'a': 1 };
        const viaCode = result[code];
        const viaLit = result['a'];
        return [ viaCode, viaLit ];
    }
    readAccount (code) {
        const account = this.account ();
        const free = account['free'];
        return [ free, account[code] ];
    }
    readTuple (params: Dict = {}) {
        const request: Dict = {};
        const [ requestUntil, paramsUntil ] = this.handleUntilOption ('endTime', request, params);
        const interval = requestUntil['interval'];
        return [ interval, paramsUntil ];
    }
    readReassignedParam (params: Dict, key) {
        params = this.parseOrder (params);
        return params[key];
    }
    readUnsafeKey (params: Dict) {
        return params['timestamp'];
    }
    readParsed (params: Dict, key) {
        const order = this.parseOrder (params);
        return order[key];
    }
    readNumericKey (params: Dict, n: number) {
        return params[n];
    }
}
