import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// RF-go-6-F: a destructured tuple slot whose producer's Go slot type is *int64 is a native *int64 local.

const SRC = `
type Dict = { [key: string]: any };
class Exchange {
    json (o: any): string { return ''; }
    hmac (o: any): string { return ''; }
    omit (a: any, b: any): any { return a; }
    handleOptionIntegerAndParams (params: Dict, m: string, o: string, d?: number): [ number, Dict ] { return [ 1, params ]; }
    sign (method = 'GET', params = {}) {
        let requestBody: string = undefined;
        let other: string = undefined;
        if (method === 'POST') {
            requestBody = this.json (params);
            other = this.hmac (params);
        }
        const bodyJson = (method === 'POST') ? this.json (params) : undefined;
        return { 'body': requestBody, 'b2': bodyJson, 'o': other };
    }
    async fetchX (symbol: string, params = {}) {
        const [ until, paramsUntil ] = this.handleOptionIntegerAndParams (params, 'fetchX', 'until');
        const request = {};
        if (until !== undefined) {
            request['t'] = until;
            request['u'] = this.parseToInt (until / 1000);
        }
        return request;
    }
    async fetchY (symbol: string, params = {}) {
        const [ until, paramsUntil ] = this.handleOptionIntegerAndParams (params, 'fetchY', 'until');
        const request = { 'u': until };
        return request;
    }
    async fetchZ (symbol: string, params = {}) {
        const [ until, paramsUntil ] = this.handleOptionIntegerAndParams (params, 'fetchZ', 'until', 5);
        if (until !== undefined) {
            return 1;
        }
        return 2;
    }
    async fetchG (symbol: string, params = {}) {
        const [ until, paramsUntil ] = this.handleOptionIntegerAndParams (params, 'fetchG', 'until');
        if (until === undefined) {
            throw new Error ('until is required');
        }
        const request = {};
        request['endTime'] = until;
        return request;
    }
    async fetchL (method: string, params = {}) {
        const [ calls, paramsCalls ] = this.handleOptionIntegerAndParams (params, method, 'paginationCalls');
        let n = 0;
        for (let i = 0; i < calls; i++) {
            n = n + 1;
        }
        return n;
    }
    parseToInt (a: any): number { return 1; }
}
`;

const TABLES = {
    'goTupleSlotTypes': { 'HandleOptionIntegerAndParams': [ '*int64' ] },
    'goTupleValueDefaultArg': { 'HandleOptionIntegerAndParams': 3 },
};

const print = (tables: any): string => {
    const t = new Transpiler ({ 'verbose': false, 'go': Object.assign ({ 'parser': { 'NUM_LINES_END_FILE': 0 } }, tables) });
    installCcxtGoHooks (t.goTranspiler);
    return t.transpileGo (SRC).content;
};

describe('RF-go-6-F: *int64 tuple slot', () => {
    test('a *int64 tuple slot read by nil tests and guarded reads is a native *int64 local (fails on the base printer)', () => {
        const base = print ({});
        const out = print (TABLES);
        expect (base).toContain ('until := GetValue(untilparamsUntilVariable, 0)');
        expect (out).toContain ('var until *int64 = nil\n\tif p, ok := untilparamsUntilVariable[0].(*int64); ok {\n\t\tuntil = p\n\t}');
        expect (out).toContain ('if until != nil {');
        expect (out).toContain ('request[\"t\"] = *until');
        expect (out).toContain ('float64(*until) / 1000');
    });
    test('an unguarded read of the slot keeps the boxed local', () => {
        const out = print (TABLES);
        const fetchY = out.split ('func (this *Exchange) fetchYBody')[1].split ('\nfunc ')[0];
        expect (fetchY).toContain ('until := GetValue(untilparamsUntilVariable, 0)');
        expect (fetchY).not.toContain ('var until *int64');
    });
    test('an integer-literal default selects the value form and is not a pointer slot', () => {
        const out = print (TABLES);
        const fetchZ = out.split ('func (this *Exchange) fetchZBody')[1].split ('\nfunc ')[0];
        expect (fetchZ).not.toContain ('var until *int64');
    });
    test('a slot behind an exiting nil guard is stored by value, never as the pointer', () => {
        const out = print (TABLES);
        const fetchG = out.split ('func (this *Exchange) fetchGBody')[1].split ('\nfunc ')[0];
        expect (fetchG).toContain ('var until *int64 = nil');
        expect (fetchG).toContain ('request[\"endTime\"] = *until');
    });
    test('a slot used as the bound of an ordered comparison is a native *int64 local', () => {
        const out = print (TABLES);
        const fetchL = out.split ('func (this *Exchange) fetchLBody')[1].split ('\nfunc ')[0];
        expect (fetchL).toContain ('var calls *int64 = nil');
        expect (fetchL).toContain ('calls != nil && int64(i) < *calls');
    });
    test('no tables, no change', () => {
        const out = print ({});
        expect (out).not.toContain ('var until *int64');
    });
});
