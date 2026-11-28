import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

const HEAD = 'type int = number;\ntype Int = number | undefined;\n'
    + 'class BaseExchange {\n    options: any;\n    sum = sum;\n    milliseconds (): int { return 1; }\n'
    + '    parseTimeframe (t: string): int { return 1; }\n'
    + '    safeInteger (o: any, k: string, d?: int): Int { return 1; }\n}\nfunction sum (...xs: any[]): any { return 1; }\nexport default BaseExchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h55g43-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\ntype int = number;\ntype Int = number | undefined;\nclass x extends Exchange {\n' + body + '}\n');
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};
const fn = (offset: string): string => '    f (timeframe: string, since: Int = undefined, limit: Int = undefined, params = {}) {\n'
    + '        const until = this.safeInteger (params, \'until\', this.milliseconds ());\n'
    + '        let startTime = since;\n'
    + '        if (since === undefined) {\n'
    + '            const tf = this.parseTimeframe (timeframe);\n'
    + '            const candleCount = (limit !== undefined) ? limit : 100;\n'
    + '            const startOffset = ' + offset + ';\n'
    + '            const shiftedStart = this.sum (until, startOffset);\n'
    + '            startTime = shiftedStart;\n'
    + '            if (shiftedStart < 0) {\n'
    + '                startTime = 0;\n'
    + '            }\n'
    + '        }\n'
    + '        return startTime;\n'
    + '    }\n';
describe ('h55g43: `x * -N` on an int64 x prints the native product, so its sum and compare stay native', () => {
    test ('positive: int64 product times a negative literal (prediction/hyperliquid fetchOHLCV shape)', () => {
        const out = print (fn ('tf * candleCount * -1000'));
        expect (out).toContain ('var startOffset int64 = (tf * candleCount) * -1000');
        expect (out).toContain ('var shiftedStart int64 = *until + startOffset');
        expect (out).toContain ('if shiftedStart < 0 {');
        expect (out).not.toContain ('OpNeg(');
        expect (out).not.toContain ('IsLessThan(');
    });
    test ('negative: a nilable *int64 left operand keeps the helper', () => {
        const out = print (fn ('tf * limit * -1000'));
        expect (out).not.toContain ('var startOffset int64');
        expect (out).toContain ('Multiply(');
    });
    test ('negative: the negative literal on the left keeps the helper', () => {
        const out = print (fn ('-1000 * tf'));
        expect (out).not.toContain ('var startOffset int64');
    });
    test ('negative: a negative float literal is not an int constant', () => {
        const out = print (fn ('tf * -0.5'));
        expect (out).not.toContain ('var startOffset int64');
    });
    test ('negative: a product handed to Math.pow keeps the form the pow rule reads', () => {
        const out = print ('    g (p: number) {\n        const n = this.parseTimeframe (\'1m\');\n        return Math.pow (10, n * -1);\n    }\n');
        expect (out).not.toContain ('n*-1');
    });
});
