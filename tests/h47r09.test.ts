import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `let x: Dict = p; if (p === undefined) { x = {}; }` on a base `p: Dict` parameter: `p` takes `impl ExtendHead`, `x` is a
// `Dict` copied by `into_head` (Null and a non-map give `{}`), and literal-key writes on `x` are native inserts
describe('rust head-seeded map local (safeOrder orderDict)', () => {
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h47r09-'));
        fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
        const base = [
            'export interface Dict { [key: string]: any }',
            'export type Str = string | undefined;',
            'export default class Exchange {',
            '    safeString (d: any, k: any, v: Str = undefined): Str { return d; }',
            '    extend (...args: any[]): any { return args[0]; }',
            '    keep (x: any): any { return x; }',
            '    safeOrd (order: Dict, market: any = undefined): Dict {',
            body,
            '    }',
            '}',
            '',
        ].join('\n');
        fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), base);
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
        const out = t.transpileRustByPath(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts')).content;
        fs.rmSync(tmp, { recursive: true, force: true });
        return out;
    };
    const SEED = '        let orderDict: Dict = order;\n        if (order === undefined) {\n            orderDict = {};\n        }\n';
    test('positive: ExtendHead parameter, Dict local, native inserts, no seed guard', () => {
        const out = print(SEED + "        const id = this.safeString (orderDict, 'id');\n        if (id === undefined) {\n            orderDict['id'] = '1';\n        }\n        return this.extend (orderDict, { 'x': id });");
        expect(out).toMatch(/fn safeOrd\(&self, order: impl crate::value::ExtendHead/);
        expect(out).toContain('let mut orderDict: crate::value::Dict = std::sync::Arc::new(crate::value::ExtendHead::into_head(order));');
        expect(out).toContain('std::sync::Arc::make_mut(&mut orderDict).insert("id".into(), ');
        expect(out).not.toContain('add_element_to_object(&mut orderDict');
        expect(out).not.toContain('order == Value::Null');
    });
    test('negative: the parameter used again keeps the box', () => {
        const out = print(SEED + "        orderDict['id'] = '1';\n        this.keep (order);\n        return this.extend (orderDict, {});");
        expect(out).not.toContain('impl crate::value::ExtendHead');
        expect(out).toContain('add_element_to_object(&mut orderDict');
    });
    test('negative: the local handed whole to another method keeps the box', () => {
        const out = print(SEED + "        orderDict['id'] = '1';\n        this.keep (orderDict);\n        return this.extend (orderDict, {});");
        expect(out).not.toContain('impl crate::value::ExtendHead');
        expect(out).toContain('add_element_to_object(&mut orderDict');
    });
    test('negative: a variable-key write keeps the box', () => {
        const out = print(SEED + "        const k = this.safeString (orderDict, 'k', 'a');\n        orderDict[k] = '1';\n        return this.extend (orderDict, {});");
        expect(out).not.toContain('impl crate::value::ExtendHead');
    });
});
