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
        return { 'url': '', 'headers': headers };
    }
    signAliased (params: Dict = {}) {
        let aliased: Dict = undefined;
        if (params['x'] !== undefined) {
            aliased = { 'A': 'b' };
            aliased['Content-Type'] = 'application/json';
        }
        const req = { 'headers': aliased };
        return req;
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
    prepareRequest (market: Dict = undefined, params: Dict = {}): [Dict, Dict] {
        const request: Dict = {};
        if (market !== undefined) {
            request['contract'] = market['id'];
            return [ request, this.omit (params, 'settle') ];
        }
        return [ request, params ];
    }
    passThrough (params: Dict = {}): [Dict, Dict] {
        return [ params, params ];
    }
    fetchPositions (params: Dict = {}) {
        const [ request, query ] = this.prepareRequest (undefined, params);
        request['settle'] = 'usdt';
        const [ echoed, rest ] = this.passThrough (params);
        echoed['x'] = 1;
        return [ request, query, echoed, rest ];
    }
    createOrder (params: Dict = {}) {
        let request: Dict = { 'a': 1 };
        request = this.omit (request, 'a');
        request['b'] = 2;
        let merged: Dict = {};
        merged = this.extend (merged, { 'c': 3 });
        merged['d'] = 4;
        let foreign: Dict = {};
        foreign = this.omit (params, 'x');
        foreign['e'] = 5;
        let extended: Dict = {};
        extended = this.extend (params, {});
        extended['f'] = 6;
        return [ request, merged, foreign, extended ];
    }
}
