import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import os from 'os';
import path from 'path';

// a local the build layer declares io.github.ccxt.ws.ArrayCache (an ArrayList<Object>):
// its length is the list's own size and an integer-expression index reads the list natively
describe('java ArrayCache local: native size and index reads', () => {
    let TMP: string;
    let out: string;
    beforeAll(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'java-h51j01-'));
        const base = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
        const venue = path.join(TMP, 'ts', 'src', 'probe.ts');
        fs.mkdirSync(path.dirname(base), { recursive: true });
        fs.writeFileSync(base, 'export default class Exchange {\n    safeValue (o: any, k: any): any { return o[k]; }\n}\n');
        fs.writeFileSync(venue,
            "import Exchange from './base/Exchange';\n" +
            'export default class probe extends Exchange {\n' +
            '    a (o: any): any {\n' +
            "        const stored: any[] = this.safeValue (o, 'k');\n" +
            '        const length: number = stored.length;\n' +
            '        if (length > 0) {\n' +
            '            return stored[length - 1];\n' +
            '        }\n' +
            '        return undefined;\n' +
            '    }\n' +
            '    b (o: any): any {\n' +
            "        const other: any[] = this.safeValue (o, 'k');\n" +
            '        const length: number = other.length;\n' +
            '        if (length > 0) {\n' +
            '            return other[length - 1];\n' +
            '        }\n' +
            '        return undefined;\n' +
            '    }\n' +
            '}\n');
        const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        (transpiler as any).javaTranspiler.javaDeclaredLocalTypeResolver = (declaration: any) => {
            const name = declaration?.name?.text;
            if (name === 'stored') return 'io.github.ccxt.ws.ArrayCache';
            if (name === 'other') return 'Object';
            if (name === 'length') return 'Integer';
            return undefined;
        };
        out = transpiler.transpileJavaByPath(venue).content;
    });
    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    const body = (name: string): string => {
        const at = out.indexOf(` ${name}(`);
        return out.slice(at, out.indexOf('\n    }', at));
    };

    test('the length of an ArrayCache local is its own size, no cast', () => {
        expect(body('a')).toContain('stored.size()');
        expect(body('a')).not.toContain('List<?>)stored');
    });

    test('an integer-expression index on an ArrayCache local reads the list with the helper null and range answers', () => {
        expect(body('a')).not.toContain('Helpers.GetValue');
        expect(body('a')).toContain('(stored == null || ((int) (((long) length) - 1L)) < 0 || ((int) (((long) length) - 1L)) >= stored.size() ? null : stored.get(((int) (((long) length) - 1L))))');
    });

    test('an Object local keeps the cast size and the helper read', () => {
        expect(body('b')).not.toContain('other.size()');
        expect(body('b')).toContain('Helpers.GetValue(other');
    });
});
