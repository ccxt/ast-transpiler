import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const config = {
    'verbose': false,
    'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } }
};

// a class declaring the hand-written base members the way ts/src/base/Exchange.ts does
const klass = (body: string, params = 'code: string') => [
    'class Exchange {',
    '    urls: any;',
    '    requiredCredentials: any;',
    '    currencies: any;',
    '    positions: any;',
    '    other: any;',
    `    f (${params}) {`,
    body,
    '    }',
    '}',
].join('\n');

const printed = (body: string, params?: string): string => new Transpiler(config).transpileCSharp(klass(body, params)).content;

const API_WS = '(this.urlsApi != null && this.urlsApi.ContainsKey("ws") ? this.urlsApi["ws"] : null)';

describe('csharp typed views of the hand-written base dictionaries', () => {
    test('urls[\'api\'][literal] reads the urlsApi view instead of getValue', () => {
        const out = printed('        const a = this.urls[\'api\'][\'ws\'];\n        return a;');
        expect(out).toContain(`object a = ${API_WS};`);
        expect(out).not.toContain('getValue(');
    });

    test('an `as` assertion and parentheses around urls[\'api\'] print as the operand', () => {
        const out = printed('        const a = (this.urls[\'api\'] as any)[\'ws\'];\n        return a;');
        expect(out).toContain(`object a = ${API_WS};`);
    });

    test('a string-declared key keeps the helper\'s key test, an untyped key casts like GetValue', () => {
        const local = printed('        const key = \'k\' + \'1\';\n        return this.urls[\'api\'][key];');
        expect(local).toContain('(this.urlsApi != null && key != null && this.urlsApi.ContainsKey(key) ? this.urlsApi[key] : null)');
        const param = printed('        return this.currencies[code];');
        expect(param).toContain('(this.currenciesDict != null && code != null && this.currenciesDict.ContainsKey((string)code) ? this.currenciesDict[(string)code] : null)');
    });

    test('currencies and requiredCredentials: Object.keys and `in` use the typed member', () => {
        const out = printed('        const keys = Object.keys (this.currencies);\n        const names = Object.keys (this.requiredCredentials);\n        return [ keys, names, \'x\' in this.currencies, \'y\' in this.requiredCredentials ];');
        expect(out).toContain('new List<object>(this.currenciesDict.Keys)');
        expect(out).toContain('new List<object>(this.requiredCredentials.Keys)');
        expect(out).toContain('(this.currenciesDict != null && this.currenciesDict.ContainsKey("x"))');
        expect(out).toContain('(this.requiredCredentials != null && this.requiredCredentials.ContainsKey("y"))');
        expect(out).not.toContain('(IDictionary<string,object>)this.');
        expect(out).not.toContain('inOp(');
    });

    test('a declared IDictionary member is its own receiver for writes (no identity cast)', () => {
        const out = printed('        this.requiredCredentials[\'apiKey\'] = code;');
        expect(out).toContain('this.requiredCredentials["apiKey"] = ');
        expect(out).not.toContain('(IDictionary<string,object>)this.requiredCredentials');
    });

    test('members without a declared dictionary view keep the helper and the cast', () => {
        const positions = printed('        return this.positions[code];');
        expect(positions).toContain('getValue(this.positions, code)');
        expect(positions).not.toContain('IDictionary');
        const other = printed('        return this.urls[\'test\'][\'ws\'];');
        expect(other).not.toContain('urlsApi');
        const nonLiteralSection = printed('        return this.urls[code][\'ws\'];');
        expect(nonLiteralSection).not.toContain('urlsApi');
        const numeric = printed('        return this.currencies[code];', 'code: number');
        expect(numeric).toContain('getValue(this.currencies, code)');
    });

    test('a write target and a delete are never rewritten to the view', () => {
        const out = printed('        this.currencies[\'BTC\'] = code;\n        delete this.currencies[\'ETH\'];');
        expect(out).not.toContain('currenciesDict');
    });
});
