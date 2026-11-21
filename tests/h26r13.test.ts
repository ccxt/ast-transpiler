import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe("rust bool local from an or-chain with an int-literal compare", () => {
    const BASE = [
        'export interface Dict { [key: string]: any }',
        'export type Int = number | undefined;',
        'export type Bool = boolean | undefined;',
        'export default class Exchange {',
        '    safeValue (d: any, k: any, def: any = undefined): any { return d[k] ?? def; }',
        '    sum (...args: any[]): any { return 0; }',
        '    milliseconds (): number { return 0; }',
        '    store (x: any): void { }',
        '    safeInteger (d: any, k: any, def: Int = undefined): Int { return d[k] ?? def; }',
        '    safeBool (d: any, k: any, def: Bool = undefined): Bool { return d[k] ?? def; }',
        '    safeString (d: any, k: any, def: any = undefined): string { return d[k] ?? def; }',
        '    safeBool (d: any, k: any, def: any = undefined): boolean { return d[k] ?? def; }',
        '}',
        '',
    ].join('\n');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h26r13-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, body: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', name + '.ts');
        fs.writeFileSync(file, ["import Exchange from './base/Exchange.js';", 'export default class venue extends Exchange {', body, '}', ''].join('\n'));
        return t.transpileRustByPath(file).content;
    };
    const M = (body: string[]) => run('v' + Math.random().toString(36).slice(2, 8), body.join('\n'));
    test('an or-chain over an int-literal compare of a typed int local prints bool (fails on the base printer)', () => {
        const out = M([ '    b2 (d: any) {', "        const st = this.safeInteger (d, 'j', 1);", "        const s = this.safeString (d, 'k');", "        const active = (s === 'x') || (st === 1);", "        return { 'active': active };", '    }' ]);
        expect(out).toContain('let mut active: bool = ((s.as_deref() == Some("x")) || (st == 1));');
        expect(out).toContain('Value::Bool(active)');
    });
    test('a bool local over an int-literal compare and a bool local inside a loop prints bool', () => {
        const out = M([ '    p1 (rows: any[]) {', '        const result = [];', '        for (let i = 0; i < rows.length; i++) {', '            const market = rows[i];', "            const isAllowedRaw = this.safeInteger (market, 'is_allow', 1);", '            let isTradingSwap = false;', "            const isT = this.safeBool (market, 'isTrading', false);", '            if (isT) { isTradingSwap = true; }', '            const isActive = isTradingSwap || (isAllowedRaw !== 0);', "            result.push ({ 'id': i, 'active': isActive });", '        }', '        return result;', '    }' ]);
        expect(out).toContain('let mut isActive: bool = (isTradingSwap || (isAllowedRaw != 0));');
    });
    test('negative: an untyped operand keeps the Value box', () => {
        const out = M([ '    b3 (d: any, x: any) {', "        const s = this.safeString (d, 'k');", "        const active = (s === 'x') || (x === 1);", "        return { 'active': active };", '    }' ]);
        expect(out).toContain('let mut active: Value = ');
    });
    test('negative: a nullable int local (no default) keeps the Value box', () => {
        const out = M([ '    b4 (d: any) {', "        const st = this.safeInteger (d, 'j');", "        const s = this.safeString (d, 'k');", "        const active = (s === 'x') || (st === 1);", "        if (st === undefined) { return undefined; }", "        return { 'active': active };", '    }' ]);
        expect(out).not.toContain('let mut active: bool = ((s.as_deref() == Some("x")) || (st == 1));');
    });
    test('negative: a later non-bool write keeps the Value box', () => {
        const out = M([ '    b5 (d: any) {', "        const st = this.safeInteger (d, 'j', 1);", "        const s = this.safeString (d, 'k');", "        let active: any = (s === 'x') || (st === 1);", "        active = s;", "        return { 'active': active };", '    }' ]);
        expect(out).not.toContain('let mut active: bool');
    });
});
