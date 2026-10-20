import Exchange from './base/Exchange.js';
import type { Dict, Bool, List } from './base/Exchange.js';
export default class venue extends Exchange {
    a1 (params: Dict = {}, symbol: string = undefined) {
        let stock = undefined;
        let paramsStock = undefined;
        [ stock, paramsStock ] = this.handleOptionBoolAndParams (params, 'x', 'stock', false);
        if (symbol !== undefined) {
            stock = this.safeBool (params, 'stock', false);
        } else if (!stock) {
            throw new Error ('x');
        }
        return paramsStock;
    }
    a2 (params: Dict = {}, other: any = undefined) {
        let fees: Bool = undefined;
        let rest = undefined;
        [ fees, rest ] = this.handleOptionBoolAndParams (params, 'x', 'fees', true);
        fees = fees && other;
        if (fees) {
            return rest;
        }
        return params;
    }
    a3 (params: Dict = {}) {
        let isPm = undefined;
        [ isPm, params ] = this.handleOptionBoolAndParams (params, 'x', 'pm', false);
        if (isPm || (params['t'] === 'papi')) {
            return 1;
        }
        return 2;
    }
    a4 (ids: string[], params: Dict = {}) {
        const args: string[] = [];
        const hashes: string[] = [];
        const request: Dict = { 'method': 'SUB', 'params': args };
        for (let i = 0; i < ids.length; i++) {
            args.push (ids[i] + '@t');
            hashes.push ('t:' + ids[i]);
        }
        return this.extend (request, { 'h': hashes });
    }
    a5 (ids: string[]) {
        const out: string[] = [];
        for (let i = 0; i < ids.length; i++) {
            out.push (ids[i]);
        }
        const req: Dict = { 'ids': out.join (',') };
        return req;
    }
    a6 (ids: string[]) {
        const out: string[] = [];
        for (let i = 0; i < ids.length; i++) {
            out.push (ids[i]);
        }
        const first: Dict = { 'ids': out };
        const second: Dict = { 'more': out };
        return [ first, second ];
    }
    a7 (ids: string[]) {
        const late: string[] = [];
        const req: Dict = { 'late': late };
        late.push ('x');
        return req;
    }
    a8 (ids: any[]) {
        const loose: any[] = [];
        loose.push (ids[0]);
        return loose.join (',');
    }
    a9 (ids: string[]) {
        const looped: string[] = [];
        looped.push ('a');
        const reqs: Dict[] = [];
        for (let i = 0; i < ids.length; i++) {
            reqs.push ({ 'k': looped });
        }
        return reqs;
    }
}
