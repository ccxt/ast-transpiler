import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import os from 'os';
import path from 'path';

// `stored[i]` on a local the build layer declares io.github.ccxt.ws.ArrayCache (an ArrayList<Object>)
describe('java ArrayCache local: counter index read', () => {
    let TMP: string;
    let out: string;
    beforeAll(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'java-arraycache-'));
        const base = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
        const venue = path.join(TMP, 'ts', 'src', 'probe.ts');
        fs.mkdirSync(path.dirname(base), { recursive: true });
        fs.writeFileSync(base, 'export default class Exchange {\n    safeValue (o: any, k: any): any { return o[k]; }\n}\n');
        fs.writeFileSync(venue,
            "import Exchange from './base/Exchange';\n" +
            'export default class probe extends Exchange {\n' +
            '    a (o: any, out: any[]) {\n' +
            "        const stored = this.safeValue (o, 'k');\n" +
            '        for (let i = 0; i < 3; i++) {\n' +
            '            out.push (stored[i]);\n' +
            '        }\n' +
            '    }\n' +
            '    b (o: any, out: any[]) {\n' +
            "        const other = this.safeValue (o, 'k');\n" +
            '        for (let i = 0; i < 3; i++) {\n' +
            '            out.push (other[i]);\n' +
            '        }\n' +
            '    }\n' +
            '    c (o: any, out: any[]) {\n' +
            "        const stored = this.safeValue (o, 'k');\n" +
            '        out.push (stored[1]);\n' +
            '    }\n' +
            '}\n');
        const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver = (declaration: any) => (declaration?.name?.text === 'stored' ? 'io.github.ccxt.ws.ArrayCache' : undefined);
        out = transpiler.transpileJavaByPath(venue).content;
    });
    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    const body = (name: string): string => {
        const at = out.indexOf(` ${name}(`);
        return out.slice(at, out.indexOf('\n    }', at));
    };

    test('a counter index on an ArrayCache local reads the list with the helper null and range answers', () => {
        expect(body('a')).not.toContain('Helpers.GetValue');
        expect(body('a')).toContain('(stored == null || i < 0 || i >= stored.size() ? null : stored.get(i))');
    });

    test('an untyped local keeps the helper', () => {
        expect(body('b')).toContain('Helpers.GetValue(other, i)');
    });

    test('a literal index on an ArrayCache local is not claimed by this rule', () => {
        expect(body('c')).not.toContain('stored.get(1)');
    });
});
