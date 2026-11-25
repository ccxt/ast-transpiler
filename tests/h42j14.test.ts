import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// `this.ohlcvs[s][k] = v` with a never-null value prints the typed row put without a fresh-row anchor
describe('h42j14: ohlcvs row write of a non-null value is the typed row put', () => {
    let out: string;
    beforeAll(() => {
        const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'h42j14-'));
        try {
            fs.mkdirSync(path.join(dir, 'ts', 'src', 'base'), { recursive: true });
            fs.mkdirSync(path.join(dir, 'ts', 'src', 'pro'), { recursive: true });
            fs.writeFileSync(path.join(dir, 'ts', 'src', 'base', 'Exchange.ts'),
                'type Dict = { [key: string]: any };\n'
                + 'export class Cache { constructor (n: number) {} }\n'
                + 'export default class Exchange {\n'
                + '    ohlcvs: { [key: string]: { [key: string]: any } } = {};\n'
                + '    safeDict (obj: any, key: any, defaultValue: any = undefined): Dict { return defaultValue; }\n'
                + '}\n');
            const file = path.join(dir, 'ts', 'src', 'pro', 'probe.ts');
            fs.writeFileSync(file,
                'import Exchange, { Cache } from \'../base/Exchange\';\n'
                + 'class Probe extends Exchange {\n'
                + '    literal (symbol: string, timeframe: string) {\n'
                + '        this.ohlcvs[symbol][timeframe] = new Cache (5);\n'
                + '    }\n'
                + '    nullable (symbol: string, timeframe: string, v: Cache | undefined) {\n'
                + '        this.ohlcvs[symbol][timeframe] = v;\n'
                + '    }\n'
                + '    boxed (symbol: string, timeframe: string, v: any) {\n'
                + '        this.ohlcvs[symbol][timeframe] = v;\n'
                + '    }\n'
                + '    anyKey (symbol: string, timeframe: any) {\n'
                + '        this.ohlcvs[symbol][timeframe] = new Cache (5);\n'
                + '    }\n'
                + '}\n');
            out = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } }).transpileJavaByPath(file).content;
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
    const method = (name: string): string => {
        const start = out.indexOf(' ' + name + '(');
        return out.slice(start, out.indexOf('\n    }', start));
    };
    test('a new-expression value prints the row put', () => {
        expect(method('literal')).toMatch(/this\.ohlcvs\.get\(symbol\)\.put\(timeframe, new /);
        expect(method('literal')).not.toContain('addElementToObject');
    });
    test('a nullable value keeps the helper', () => {
        expect(method('nullable')).toContain('Helpers.addElementToObject(');
    });
    test('an any value keeps the helper', () => {
        expect(method('boxed')).toContain('Helpers.addElementToObject(');
    });
    test('a key not proven a string keeps the helper', () => {
        expect(method('anyKey')).toContain('Helpers.addElementToObject(');
    });
});
