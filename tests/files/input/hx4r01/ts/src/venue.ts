import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    fetchBalance (params: Dict = {}) {
        if (params['a'] !== undefined) {
            const account = this.account ();
            account['free'] = '1';
            return account;
        }
        const account = this.account ();
        account['used'] = '0';
        return account;
    }
    sign (params: Dict = {}) {
        let headers: Dict = undefined;
        if (params['x'] !== undefined) {
            headers = { 'A': 'b' };
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    }
    fetchOHLCV (params: Dict = {}) {
        const request: Dict = {};
        const [ requestUntil, paramsUntil ] = this.handleUntilOption ('endTime', request, params);
        requestUntil['interval'] = '1m';
        return [ requestUntil, paramsUntil ];
    }
    fetchOrder (params: Dict = {}) {
        const order = this.parseOrder (params);
        order['status'] = 'open';
        let mixed: Dict = {};
        mixed = this.parseOrder (params);
        mixed['k'] = 1;
        const captured = this.account ();
        const f = () => { captured['free'] = '2'; };
        return [ order, mixed, f ];
    }
}
