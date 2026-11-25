import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

// a local the build layer declares as a unified-structure view class (a TypedMap, so a Map<String, Object>)
describe('h35p32: element reads and writes on a typed-view local', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h35p32');
    const TYPES = path.join(TMP, 'ts', 'src', 'base', 'types.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'probe.ts');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.dirname(TYPES), { recursive: true });
        fs.writeFileSync(TYPES, "export interface MarketInterface { id: string; stock?: boolean; }\nexport type Market = MarketInterface | undefined;\nexport type Dict = { [key: string]: any };\n");
        fs.writeFileSync(VENUE,
            "import type { Market, MarketInterface, Dict } from './base/types';\n" +
            "interface Local { id: string; }\n" +
            "export default class probe {\n" +
            "    pm (m: any): MarketInterface { return m; }\n" +
            "    lo (m: any): Local { return m; }\n" +
            "    a (m: any, flag: boolean): any {\n" +
            "        const pa = this.pm (m);\n" +
            "        pa['stock'] = flag;\n" +
            "        return pa;\n" +
            "    }\n" +
            "    b (m: any, v: any): any {\n" +
            "        const pb = this.pm (m);\n" +
            "        pb['stock'] = v;\n" +
            "        return pb;\n" +
            "    }\n" +
            "    c (m: any, part: string): any {\n" +
            "        const pc = this.pm (m);\n" +
            "        return pc[part];\n" +
            "    }\n" +
            "    d (m: any, part: string, flag: boolean): any {\n" +
            "        const pd = this.lo (m);\n" +
            "        pd['id'] = 'x';\n" +
            "        return pd[part];\n" +
            "    }\n" +
            "    e (m: any, part: string): any {\n" +
            "        const pe = this.pm (m);\n" +
            "        return pe[part];\n" +
            "    }\n" +
            "}\n");
        const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        const view = { pa: 'MarketInterface', pb: 'MarketInterface', pc: 'io.github.ccxt.types.MarketInterface', pd: 'Local' };
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver = (declaration: any) => view[declaration?.name?.text];
        out = transpiler.transpileJavaByPath(VENUE).content;
    });
    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    const body = (name: string): string => {
        const at = out.indexOf(` ${name}(`);
        return out.slice(at, out.indexOf('\n    }', at));
    };
    test('positive: a literal-key write of a never-null value prints the put', () => {
        expect(body('a')).toContain('pa.put("stock", flag)');
        expect(body('a')).not.toContain('Helpers.addElementToObject');
    });
    test('negative: a value that may be null keeps the helper (its removal arm)', () => {
        expect(body('b')).toContain('Helpers.addElementToObject(pb, "stock", v)');
    });
    test('positive: a string-key read prints the guarded get (null for a null key / receiver)', () => {
        expect(body('c')).toContain('(pc == null || part == null ? null : pc.get(part))');
        expect(body('c')).not.toContain('Helpers.GetValue');
    });
    test('negative: an interface outside base/types.ts keeps the helpers', () => {
        expect(body('d')).toContain('Helpers.addElementToObject(pd, "id", "x")');
        expect(body('d')).toContain('Helpers.GetValue(pd, part)');
    });
    test('negative: a local the build layer leaves Object keeps the helper', () => {
        expect(body('e')).toContain('Helpers.GetValue(pe, part)');
    });
});
