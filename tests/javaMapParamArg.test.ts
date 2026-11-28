import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// a Dict parameter the method prints as Map<String, Object> passes bare into a Map slot;
// (the header proves it, writes are cast at the write site); an any parameter keeps the checkcast
describe('java Map parameter into a Map slot', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-map-param-arg');
    const FIXTURE = path.join(TMP, 'ts', 'src', 'bitfake.ts');
    const source =
    "import type { Dict } from './base/types';\n" +
    "class T {\n" +
    "    take (d: Dict): any { return d; }\n" +
    "    f1 (params: Dict): any { return this.take (params); }\n" +
    "    f2 (params: any): any { return this.take (params); }\n" +
    "    f3 (params: Dict): any { params = this.take (params); return this.take (params); }\n" +
    "    f4 (x: Dict = {}): any { return this.take (x); }\n" +
    "}\n";
    const TYPES = "export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n";
    let out: string;

    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'), TYPES);
        fs.writeFileSync(FIXTURE, source);
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a fixed Map parameter passes bare', () => {
        expect(out).toMatch(/f1\((java\.util\.)?Map<String, Object> parameters\)\s*\{\s*return this\.take\(parameters\);/);
    });

    test('an any parameter keeps the checkcast', () => {
        expect(out).toMatch(/f2\(Object parameters\)\s*\{\s*return this\.take\(\((java\.util\.)?Map<String, Object>\) \(parameters\)\);/);
    });

    test('a written or defaulted Map parameter passes bare', () => {
        expect(out).toContain('parameters = (java.util.Map<String, Object>) (this.take(parameters));');
        expect(out).toContain('return this.take(x);');
    });
});
