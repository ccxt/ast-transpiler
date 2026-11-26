import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `Str`-declared nil local written only with string literals holds a *string
describe('h54g50: literal-only Str locals', () => {
    const BASE = 'export type Dict = { [key: string]: unknown };\n'
        + 'export type Str = string | undefined;\n'
        + 'export type Int = number | undefined;\n'
        + 'export default class Exchange {\n'
        + '    safeString (a: Dict, k: string, d: Str = undefined): Str { return d; }\n'
        + '    async fetchPaginatedCallCursor (method: string, symbol: Str = undefined, since: Int = undefined, limit: Int = undefined, params: Dict = {}, cursorReceived: Str = undefined, cursorSent: Str = undefined): Promise<any[]> { return []; }\n'
        + '}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h54g50-'));
        try {
            fs.mkdirSync(path.join(tmp, 'ts/src/base'), { recursive: true });
            fs.writeFileSync(path.join(tmp, 'ts/src/base/Exchange.ts'), BASE);
            const file = path.join(tmp, 'ts/src/x.ts');
            fs.writeFileSync(file, "import Exchange, { Dict, Str, Int } from './base/Exchange.js';\nclass X extends Exchange {\n" + members + '}\n');
            const t = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks(t.goTranspiler);
            return t.transpileGoByPath(file).content;
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    };
    const cursor = (decl: string) => run('    async f (symbol: Str = undefined, params: Dict = {}): Promise<any[]> {\n'
        + '        const uta = this.safeString (params, \'uta\');\n'
        + '        ' + decl + '\n'
        + '        if (uta === \'1\') {\n'
        + '            cursorReceived = \'cursor\';\n'
        + '        } else if (uta === \'2\') {\n'
        + '            cursorReceived = \'endId\';\n'
        + '        }\n'
        + '        return await this.fetchPaginatedCallCursor (\'f\', symbol, undefined, undefined, params, cursorReceived);\n'
        + '    }\n');
    test('literal-only writes into a Str slot: *string', () => {
        const out = cursor('let cursorReceived: Str = undefined;');
        expect(out).toContain('var cursorReceived *string = nil');
    });
    test('an unannotated local keeps the box', () => {
        const out = cursor('let cursorReceived = undefined;');
        expect(out).not.toContain('var cursorReceived *string');
    });
    test('a map value store takes the guarded deref the call+literal join already prints', () => {
        const out = run('    f (params: Dict = {}): Dict {\n'
            + '        const t = this.safeString (params, \'t\');\n'
            + '        let marketType: Str = undefined;\n'
            + '        if (t === \'a\') {\n'
            + '            marketType = \'spot\';\n'
            + '        }\n'
            + '        return { \'type\': marketType };\n'
            + '    }\n');
        expect(out).toContain('var marketType *string = nil');
        expect(out).toContain('= *marketType');
    });
    test('a local written on every path keeps the plain string join', () => {
        const out = run('    f (params: Dict = {}): Dict {\n'
            + '        const t = this.safeString (params, \'t\');\n'
            + '        let side: Str = undefined;\n'
            + '        if (t === \'a\') {\n'
            + '            side = \'long\';\n'
            + '        } else {\n'
            + '            side = \'short\';\n'
            + '        }\n'
            + '        return { \'side\': side };\n'
            + '    }\n');
        expect(out).toContain('var side string');
        expect(out).not.toContain('var side *string');
    });
});
