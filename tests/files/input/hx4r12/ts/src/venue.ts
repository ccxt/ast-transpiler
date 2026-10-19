import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    fetchStatus (response: Dict) {
        const data = this.safeDict (response, 'data', {});
        data['status'] = 'ok';
        const bare = this.safeDict (response, 'data');
        bare['a'] = 1;
        const nonPlainDefault = this.safeDict (response, 'data', response);
        nonPlainDefault['b'] = 2;
        const fromOptions = this.safeDict (this.options, 'fetchStatus', {});
        fromOptions['c'] = 3;
        const fromField = this.safeDict (this.markets, 'x', {});
        fromField['d'] = 4;
        return [ data, bare, nonPlainDefault, fromOptions, fromField ];
    }
    markets: Dict = {};
    createOrderRequest (symbol: string, params: Dict = {}): Dict {
        const request: Dict = { 'symbol': symbol };
        if (symbol === 'x') {
            return { 'a': 1 };
        }
        return this.extend (request, params);
    }
    asyncBuilder (params: Dict = {}): Promise<Dict> {
        return undefined;
    }
    parseThing (params: Dict = {}): Dict {
        return params;
    }
    createOrder (symbol: string, params: Dict = {}) {
        const request = this.createOrderRequest (symbol, params);
        request['clientOid'] = '1';
        const parsed = this.parseThing (params);
        parsed['x'] = 1;
        return [ request, parsed ];
    }
    isUnifiedEnabled (): any[] {
        const a = this.safeBool (this.options, 'a');
        if (a === undefined) {
            return [ false, true ];
        }
        return [ a, this.safeBool (this.options, 'b', false) ];
    }
    isConditionalOrder (params: Dict = {}): boolean {
        return this.safeValue (params, 'triggerPrice') !== undefined;
    }
    looseFlag (params: Dict = {}): boolean {
        return this.safeValue (params, 'flag');
    }
    fetchBalance (params: Dict = {}) {
        const [ enableUnifiedMargin, enableUnifiedAccount ] = this.isUnifiedEnabled ();
        const isUnified = (enableUnifiedMargin === true) || (enableUnifiedAccount === true);
        const [ paginate, rest ] = this.handleOptionBoolAndParams (params, 'fetchBalance', 'paginate', false);
        if (paginate) {
            return rest;
        }
        let isTrigger = undefined;
        [ isTrigger, params ] = this.handleTriggerAndParams (params);
        if (isTrigger) {
            return params;
        }
        if (!this.isConditionalOrder (params)) {
            return params;
        }
        if (this.looseFlag (params)) {
            return params;
        }
        const [ loose, rest2 ] = this.handleOptionAndParams (params, 'fetchBalance', 'loose');
        if (loose) {
            return rest2;
        }
        return isUnified;
    }
}
