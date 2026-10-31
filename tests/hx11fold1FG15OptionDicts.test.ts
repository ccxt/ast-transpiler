import { Transpiler } from '../src/transpiler';

let transpiler: Transpiler;

beforeAll(() => {
    transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
});

function go(ts: string): string {
    return transpiler.transpileGo(ts).content;
}

const PRELUDE = 'type Dict = { [key: string]: any };\nclass Base {\n    options: Dict;\n    has: Dict;\n    fees: Dict;\n    limits: Dict;\n' +
    '    extend (...a: any[]): any { return a; }\n    safeString (a: any, b: any, c: any = undefined): string { return ""; }\n' +
    '    safeInteger (a: any, b: any, c: any = undefined): number { return 0; }\n    safeDict (a: any, b: any, c: any = undefined): any { return a; }\n' +
    '    getMarketType (a: any, b: any): any { return a; }\n}\n';

function cls(body: string): string {
    return PRELUDE + 'class Test extends Base {\n' + body + '}\n';
}

function flat(output: string): string {
    return output.replace(/\s+/g, ' ');
}

describe('hx11 fold 1F G15: option dict field receivers', () => {
    test('a string-typed key stores natively behind the nil-map guard', () => {
        const out = go(cls('    a (marketType: string = "margin") {\n' +
            '        const options = this.safeDict (this.options, marketType, {});\n' +
            '        this.options[marketType] = this.extend (options, { "x": 1 });\n' +
            '    }\n'));
        expect(flat(out)).toContain('if this.Options != nil { this.Options[marketType] = this.Extend(options, map[string]any{ "x": 1, }) }');
        expect(out).not.toContain('AddElementToObject(this.Options');
    });

    test('a *string key adds its nil guard and a *string value stores dereferenced', () => {
        const out = go(cls('    a (params: Dict = {}) {\n' +
            '        const typeVar = this.safeString (params, "type", "margin");\n' +
            '        const id = this.safeString (params, "id");\n' +
            '        this.fees[typeVar] = id;\n' +
            '    }\n'));
        expect(flat(out)).toContain('if this.Fees != nil && typeVar != nil { this.Fees[*typeVar] = DerefScalar(id) }');
    });

    test('an any-typed key or value keeps the helper', () => {
        const out = go(cls('    a (params: Dict = {}) {\n' +
            '        const typeVar = this.getMarketType ("a", params);\n' +
            '        this.options[typeVar] = this.extend ({}, {});\n' +
            '        this.fees["k"] = this.safeInteger (params, "v");\n' +
            '    }\n'));
        expect(out).toContain('AddElementToObject(this.Options, typeVar,');
        expect(out).toContain('this.Fees["k"] = this.SafeInteger(params, "v")');
    });

    test('key in an option dict binds the comma-ok read in the if init clause', () => {
        const out = go(cls('    a (reload = false) {\n' +
            '        if (reload || !(\'k\' in this.options)) {\n' +
            '            this.options["k"] = 1;\n' +
            '        }\n' +
            '        if (!(\'k\' in this.fees)) {\n' +
            '            this.limits["k"] = 1;\n' +
            '        }\n' +
            '    }\n'));
        expect(out).toContain('if _, ok := this.Options["k"]; (reload == true) || !ok {');
        expect(out).toContain('if _, ok := this.Fees["k"]; !ok {');
        expect(out).not.toContain('InOp(this.');
    });
});
