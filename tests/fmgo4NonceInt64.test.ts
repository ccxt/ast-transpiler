import { Transpiler } from '../src/transpiler';

// FM-GO4-1: Nonce () / IncrementingNonce () are int64 end to end (was ccxt build/hx11w8-nonce-int64.ts).
// The rule is keyed on the checker: a method named nonce () of a class chain ending in BaseExchange.nonce
// prints int64 when every return is a provable int64 operand; a local fed by nonce () is an int64.

let transpiler: Transpiler;
beforeAll(() => {
    transpiler = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
});

const BASE = 'type int = number;\ntype Int = number | undefined;\ntype Str = string | undefined;\n'
    + 'class BaseExchange {\n'
    + '    options: any;\n'
    + '    sum = sum;\n'
    + '    milliseconds (): int { return 1; }\n'
    + '    seconds (): int { return 1; }\n'
    + '    microseconds (): int { return 1; }\n'
    + '    safeInteger (o: any, k: string, d?: int): Int { return 1; }\n'
    + '    safeString (o: any, k: string, d?: string): Str { return d; }\n'
    + '    nonce (): int { return this.seconds (); }\n'
    + '    incrementingNonce (): int { return this.nonce (); }\n'
    + '}\n'
    + 'function sum (...xs: any[]): any { return 1; }\n';

const go = (derived: string) => transpiler.transpileGo(BASE + 'class Venue extends BaseExchange {\n' + derived + '\n}\n').content;
const venueNonce = (out: string) => out.substring(out.indexOf('func (this *Venue) Nonce()'));

describe('FM-GO4-1 nonce is int64', () => {
    test('base nonce () prints int64', () => {
        expect(go('')).toContain('func (this *BaseExchange) Nonce() int64 {');
    });
    test('a clock override prints int64', () => {
        expect(go('override nonce (): int { return this.milliseconds (); }')).toContain('func (this *Venue) Nonce() int64 {');
    });
    test('a literal-default safeInteger difference prints int64', () => {
        const out = go("override nonce (): int { return this.milliseconds () - this.safeInteger (this.options, 'timeDifference', 0); }");
        expect(out).toContain('func (this *Venue) Nonce() int64 {');
        expect(out).toContain('return this.Milliseconds() - *this.SafeInteger(this.Options, "timeDifference", 0)');
    });
    test('a narrowed *int64 local difference prints int64', () => {
        const out = go("override nonce (): int { const d = this.safeInteger (this.options, 'td'); if (d === undefined) { throw new Error ('x'); } return this.milliseconds () - d; }");
        expect(out).toContain('func (this *Venue) Nonce() int64 {');
        expect(out).toContain('return this.Milliseconds() - *d');
    });
    test('two arms returning clocks print int64', () => {
        const out = go("override nonce (): int { const m = this.safeString (this.options, 'n', 'milliseconds'); if (m === 'milliseconds') { return this.milliseconds (); } return this.seconds (); }");
        expect(out).toContain('func (this *Venue) Nonce() int64 {');
    });
    test('this.sum of two int64 operands prints the native +', () => {
        const out = go('override nonce (): int { const t = this.seconds (); return this.sum (this.microseconds () * 1000, t); }');
        expect(out).toContain('func (this *Venue) Nonce() int64 {');
        expect(out).toContain('return this.Microseconds()*1000 + t');
        expect(venueNonce(out)).not.toContain('this.Sum(');
    });
    test('negative: this.sum with an unproven operand throws', () => {
        expect(() => go('override nonce (): int { const d: any = 1; return this.sum (this.seconds (), d); }')).toThrow(/nonce returns unproven/);
    });
    test('a local fed by nonce () / incrementingNonce () is an int64', () => {
        const out = go('f (): any { const n = this.nonce (); const m = this.incrementingNonce (); return [ n, m ]; }');
        expect(out).toContain('var n int64 = this.Nonce()');
        expect(out).toContain('var m int64 = this.IncrementingNonce()');
    });
    test('negative: a local rewritten with another value keeps its box', () => {
        const out = go('f (): any { let n = this.nonce (); n = this.safeString ({}, "k"); return n; }');
        expect(out).not.toContain('var n int64 = this.Nonce()');
    });
    test('negative: an unproven return throws instead of printing a wrong signature', () => {
        expect(() => go('override nonce (): int { const d: any = 1; return d; }')).toThrow(/nonce returns unproven/);
        expect(() => go('override nonce (): int { return this.milliseconds () - this.safeInteger (this.options, "k"); }')).toThrow(/nonce returns unproven/);
        expect(() => go('override nonce (): int { return this.milliseconds () / 2; }')).toThrow(/nonce returns unproven/);
    });
    test('negative: a nonce method of a class that is not a BaseExchange descendant is untouched', () => {
        const out = transpiler.transpileGo('class Other {\n    nonce (): any { return 1; }\n}\n').content;
        expect(out).toContain('func (this *Other) Nonce() any {');
    });
    test('negative: another method of a venue is untouched', () => {
        const out = go('override nonce (): int { return this.milliseconds (); }\n    other (): any { return 1; }');
        expect(out).toContain('func (this *Venue) Other() any {');
    });
});
