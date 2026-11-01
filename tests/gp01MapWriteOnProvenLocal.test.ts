import { Transpiler } from '../src/transpiler';

let transpiler: Transpiler;

beforeAll(() => {
    const config = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
    transpiler = new Transpiler(config);
});

function go(ts: string): string {
    return transpiler.transpileGo(ts).content;
}

const PRELUDE = 'type Dict = { [key: string]: any };\n' +
    'type Strings = string[] | undefined;\n' +
    'class Base {}\n';

function flat(output: string): string {
    return output.replace(/\s+/g, ' ');
}

function cls(body: string): string {
    return PRELUDE + 'class Test extends Base {\n' + body + '}\n';
}

const SAFE = '    safeString (a: any, b: any): string { return ""; }\n' +
    '    safeDict (a: any, b: any): any { return a; }\n';

describe('hx10 GP01 native map writes on proven locals', () => {
    test('a Dict parameter with a {} default is the GetArgMap map: a literal key is a plain store', () => {
        const out = go(cls('    make (symbol: string, cost: number, params: Dict = {}): any {\n' +
            "        params['quoteOrderQty'] = cost;\n" +
            '        return params;\n' +
            '    }\n'));
        expect(out).toContain('var params map[string]any = GetArgMap(optionalArgs, 0, map[string]any{})');
        expect(out).toContain('params["quoteOrderQty"] = cost');
        expect(out).not.toContain('AddElementToObject(params,');
    });

    test('a nullable *string key gets the helper guard and a dereferenced store', () => {
        const out = go(cls('    make (symbols: Strings): any {\n' +
            '        const result: Dict = {};\n' +
            '        for (let i = 0; i < symbols.length; i++) {\n' +
            '            const symbol = this.safeString (symbols, i);\n' +
            '            result[symbol] = 1;\n' +
            '        }\n' +
            '        return result;\n' +
            '    }\n' + SAFE));
        expect(out).toContain('var symbol *string = this.SafeString(symbols, i)');
        expect(flat(out)).toContain('if symbol != nil { result[*symbol] = 1 }');
        expect(out).not.toContain('AddElementToObject(result, symbol,');
    });

    test('a boolean literal value takes the same guard store', () => {
        const out = go(cls('    make (symbols: Strings): any {\n' +
            '        const result: Dict = {};\n' +
            '        const symbol = this.safeString (symbols, 0);\n' +
            '        result[symbol] = true;\n' +
            '        return result;\n' +
            '    }\n' + SAFE));
        expect(flat(out)).toContain('if symbol != nil { result[*symbol] = true }');
    });

    test('a shared map local keeps the helper: another holder could write it', () => {
        const out = go(cls('    make (symbols: Strings, shared: Dict): any {\n' +
            '        const result = shared;\n' +
            '        const symbol = this.safeString (symbols, 0);\n' +
            '        result[symbol] = 1;\n' +
            '        return result;\n' +
            '    }\n' + SAFE));
        expect(out).toContain('AddElementToObject(result, symbol, 1)');
    });

    test('a nullable *string key on the GetArgMap local takes the same guard', () => {
        const out = go(cls('    make (params: Dict = {}): any {\n' +
            '        const code = this.safeString (params, "code");\n' +
            '        params[code] = true;\n' +
            '        return params;\n' +
            '    }\n' + SAFE));
        expect(flat(out)).toContain('if code != nil { params[*code] = true }');
    });

    test('a pointer value keeps the helper: its deref is what the helper stores', () => {
        const out = go(cls('    make (symbols: Strings, params: Dict = {}): any {\n' +
            '        const result: Dict = {};\n' +
            '        const symbol = this.safeString (symbols, 0);\n' +
            "        result[symbol] = this.safeString (params, 'value');\n" +
            '        return result;\n' +
            '    }\n' + SAFE));
        expect(out).toContain('AddElementToObject(result, symbol,');
    });

    test('an any-boxed value keeps the helper: the box may hold a pointer', () => {
        const out = go(cls('    make (tickers: Dict, symbols: Strings): any {\n' +
            '        const result: Dict = {};\n' +
            '        for (let i = 0; i < symbols.length; i++) {\n' +
            '            const symbol = this.safeString (symbols, i);\n' +
            '            const ticker = this.safeDict (tickers, symbol);\n' +
            '            result[symbol] = ticker;\n' +
            '        }\n' +
            '        return result;\n' +
            '    }\n' + SAFE));
        expect(out).toContain('AddElementToObject(result, symbol, ticker)');
    });

    test('element writes on the parameter do not block the store', () => {
        const out = go(cls('    make (other: Dict, params: Dict = {}): any {\n' +
            '        let request = params;\n' +
            "        request['a'] = 1;\n" +
            "        params['b'] = 2;\n" +
            '        return params;\n' +
            '    }\n'));
        expect(out).toContain('AddElementToObject(request, "a", 1)');
        expect(out).toContain('params["b"] = 2');
    });

    test('a rebound parameter keeps the helper', () => {
        const out = go(cls('    make (other: Dict, params: Dict = {}): any {\n' +
            "        params['a'] = 1;\n" +
            '        params = other;\n' +
            "        params['b'] = 2;\n" +
            '        return params;\n' +
            '    }\n'));
        expect(out).toContain('AddElementToObject(params, "a", 1)');
        expect(out).toContain('AddElementToObject(params, "b", 2)');
    });

    test('a parameter without a map default stays the box', () => {
        const out = go(cls('    make (params: any): any {\n' +
            "        params['a'] = 1;\n" +
            '        return params;\n' +
            '    }\n'));
        expect(out).toContain('AddElementToObject(params, "a", 1)');
    });

    test('a multi-line object literal value sits one level deeper inside the nil-key guard', () => {
        const out = go(cls('    make (symbols: Strings): any {\n' +
            '        const result: Dict = {};\n' +
            '        const symbol = this.safeString (symbols, 0);\n' +
            "        result[symbol] = { 'min': 1, 'max': 2 };\n" +
            '        return result;\n' +
            '    }\n' + SAFE));
        expect(out).toContain('\tif symbol != nil {\n\t\tresult[*symbol] = map[string]any{\n\t\t\t"min": 1,\n\t\t\t"max": 2,\n\t\t}\n\t}');
        expect(out).not.toContain('AddElementToObject(result, symbol,');
    });

    test('a numeric literal under a *string key is a guarded store; an `in` read of the map does not share it', () => {
        const out = go(cls('    make (entries: any): any {\n' +
            '        const seen: Dict = {};\n' +
            '        const id = this.safeString (entries, 0);\n' +
            '        if (!(id in seen)) {\n' +
            '            seen[id] = 1;\n' +
            '        }\n' +
            '        return seen;\n' +
            '    }\n' + SAFE));
        expect(flat(out)).toContain('if id != nil { seen[*id] = 1 }');
        expect(out).not.toContain('AddElementToObject(seen, id,');
    });

    test('a map handed to a call before the write keeps the helper', () => {
        const out = go(cls('    make (entries: any): any {\n' +
            '        const seen: Dict = {};\n' +
            '        const id = this.safeString (entries, 0);\n' +
            '        this.keep (seen);\n' +
            "        seen[id] = { 'a': 1, 'b': 2 };\n" +
            '        return seen;\n' +
            '    }\n' + SAFE + '    keep (a: any): void {}\n'));
        expect(out).toContain('AddElementToObject(seen, id,');
    });
});
