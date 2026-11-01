import { Transpiler } from '../src/transpiler';

// FOLD1 GOCACHE: element write, delete and `in` over the symbol-keyed ws map fields of BaseExchange
const HEAD = 'type Dict = { [key: string]: any };\n'
    + 'class Exchange {\n'
    + '    ohlcvs: Dict = {};\n'
    + '    fundingRates: Dict = {};\n'
    + '    trades: Dict = {};\n'
    + '    safeString (d: any, k: any, def: any = undefined): string | undefined { return d; }\n'
    + '    safeSymbol (m: any): string | undefined { return m; }\n';
const print = (body: string): string => {
    const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return t.transpileGo (HEAD + '    handle (message: Dict) {\n' + body + '\n    }\n}\n').content;
};

describe('FOLD1 ws cache fields', () => {
    test('a map literal store behind a nil test is a native store (fails on the base printer)', () => {
        const out = print ("const symbol = this.safeString (message, 's'); this.ohlcvs[symbol] = {};");
        expect (out).toContain ('if symbol != nil {\n\t\tthis.Ohlcvs[*symbol] = map[string]any{}\n\t}');
        expect (out).not.toContain ('AddElementToObject(this.Ohlcvs');
    });
    test('an enclosing nil guard stores through the deref without a second guard', () => {
        const out = print ("const symbol = this.safeString (message, 's'); if (symbol !== undefined) { this.ohlcvs[symbol] = {}; }");
        expect (out).toContain ('this.Ohlcvs[*symbol] = map[string]any{}');
        expect (out).not.toContain ('if symbol != nil {\n\t\tif symbol != nil');
    });
    test('a pointer value keeps the helper', () => {
        const out = print ("const symbol = this.safeString (message, 's'); const rate = this.safeString (message, 'r'); this.fundingRates[symbol] = rate;");
        expect (out).toContain ('AddElementToObject(this.FundingRates');
    });
    test('an any-typed key keeps the helper', () => {
        const out = print ("this.ohlcvs[message['s']] = {};");
        expect (out).toContain ('AddElementToObject(this.Ohlcvs');
    });
    test('delete over a map field is native, behind the nil test of a pointer key', () => {
        const out = print ("const symbol = this.safeString (message, 's'); delete this.fundingRates[symbol];");
        expect (out).toContain ('if symbol != nil {\n\t\tdelete(this.FundingRates, *symbol)\n\t}');
        expect (out).not.toContain ('Remove(this.FundingRates');
    });
    test('delete over the trades cache goes through its own Delete', () => {
        const out = print ("const symbol = this.safeString (message, 's'); delete this.trades[symbol];");
        expect (out).toContain ('this.Trades.Delete(symbol)');
        expect (out).not.toContain ('Remove(this.Trades');
    });
    test('a delete used as an expression keeps the helper', () => {
        const out = print ("const symbol = this.safeString (message, 's'); const gone = delete this.fundingRates[symbol];");
        expect (out).not.toContain ('delete(this.FundingRates');
    });
    test('`in` over a ws map field with a guarded pointer key reads the comma-ok', () => {
        const out = print ("const symbol = this.safeString (message, 's'); if (symbol !== undefined) { if (symbol in this.fundingRates) { this.fundingRates[symbol] = {}; } }");
        expect (out).toContain ('_, ok := this.FundingRates[*symbol]; ok');
    });
});
