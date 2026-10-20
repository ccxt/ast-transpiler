import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    collect (response: any) {
        const rows = this.safeList (response, 'rows', []);
        const out = [];
        for (let i = 0; i < rows.length; i++) {
            out.push (rows[i]);
        }
        const loose = this.safeList (response, 'loose');
        const count = loose.length;
        const parsed = this.toArray (response) as any;
        return [ out, count, parsed.length ];
    }
    rebound (response: any) {
        let list = [];
        list.push (1);
        list = response;
        list.push (2);
        return list.length;
    }
    nullable (response: any) {
        const maybe = this.safeList (response, 'x');
        maybe.push (3);
        return maybe;
    }
    aliased (args: any) {
        const ids = [];
        const req = { 'ids': ids };
        ids.push (args);
        return req;
    }
    captured (response: any) {
        const items = [];
        const add = (x) => { items.push (x); };
        add (response);
        items.push (4);
        return items.length;
    }
    selfRef () {
        const seq = [];
        seq.push (seq.length);
        return seq;
    }
    hasKey (params: Dict = {}, response: any = undefined) {
        const request: Dict = {};
        if ('symbol' in params) {
            request['symbol'] = params['symbol'];
        }
        const account = this.account ();
        if ('free' in account) {
            return 1;
        }
        if ('code' in response) {
            return 2;
        }
        return request;
    }
}
