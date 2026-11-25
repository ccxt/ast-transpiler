import { Transpiler } from '../src/transpiler';

const rows = { 'build': { 2: 'Int64?', 3: 'Int64?' } };
const config: any = { 'verbose': false, 'csharp': { 'parser': { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(' }, 'numericArgTypes': rows, 'coreArgTypes': rows } };
const emit = (body: string) => {
    const t: any = new Transpiler(config);
    t.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => ({ n: 'int', ts: 'Int64?' })[node?.text];
    return t.transpileCSharp('class Exchange {\n' + body + '\n}').content;
};
const head = 'build (trades: any[], timeframe: string = \'1m\', ';
const loop = '{ const n = trades.length; for (let i = 0; i < n; i++) { const trade = this.safeDict (trades, i, {}); const ts = this.safeInteger (trade, \'timestamp\'); if (ts === undefined) { continue; } if (ts < since) { continue; } } return n; }';

describe('csharp narrowed since shadow with a literal default', () => {
    test('the comparison reads the shadow value', () => {
        const output = emit(head + 'since: number = 0, limit: number = 2147483647) ' + loop);
        expect(output).toContain('Int64? since = null');
        expect(output).toContain('ts.Value < sinceVar.GetValueOrDefault()');
        expect(output).not.toContain('isLessThan(ts, sinceVar)');
    });
    test('no default keeps the helper', () => {
        const output = emit(head + 'since: number = undefined, limit: number = 2147483647) ' + loop);
        expect(output).not.toContain('sinceVar.GetValueOrDefault()');
    });
    test('a later null write keeps the helper', () => {
        const output = emit(head + 'since: number = 0, limit: number = 2147483647) { since = undefined; ' + loop.slice(1));
        expect(output).not.toContain('sinceVar.GetValueOrDefault()');
    });
    test('a parameter outside the table keeps the helper', () => {
        const output = emit('other (trades: any[], since: number = 0) ' + loop);
        expect(output).toContain('isLessThan(ts, since)');
    });
});
