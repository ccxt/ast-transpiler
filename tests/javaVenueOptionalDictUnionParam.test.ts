import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// a venue `x: Dict | undefined = undefined` slot the body never reads and every in-file caller leaves
// undefined (or fills with a literal) prints Map<String, Object>; a boxed caller or a read keeps Object
describe('java venue optional Dict | undefined parameter', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-venue-optional-dict-union');
    const FIXTURE = path.join(TMP, 'ts', 'src', 'pro', 'bitfake.ts');
    const source =
    "import type { Dict } from '../base/types';\n" +
    "class T {\n" +
    "    handleA (client: any, message: Dict, subscription: Dict | undefined = undefined) { return message; }\n" +
    "    handleB (client: any, message: Dict, subscription: Dict | undefined = undefined) { return message; }\n" +
    "    handleC (client: any, message: Dict, subscription: Dict | undefined = undefined) { return subscription; }\n" +
    "    handleD (client: any, message: Dict, subscription: Dict | undefined = undefined) { return message; }\n" +
    "    handleE (client: any, message: Dict, subscription: any = undefined) { return message; }\n" +
    "    run (client: any, message: Dict, boxed: any) {\n" +
    "        this.handleA (client, message);\n" +
    "        this.handleA (client, message, undefined);\n" +
    "        this.handleB (client, message, boxed);\n" +
    "        this.handleD (client, message, { 'k': 1 });\n" +
    "        const method = this.handleA;\n" +
    "        method.call (this, client, message);\n" +
    "    }\n" +
    "}\n";
    const TYPES = "export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n";
    let out: string;

    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'), TYPES);
        fs.writeFileSync(FIXTURE, source);
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('an unread slot every caller leaves undefined prints Map', () => {
        expect(out).toMatch(/handleA\(Object client, (java\.util\.)?Map<String, Object> message, (java\.util\.)?Map<String, Object> subscription\)/);
    });

    test('an object-literal caller keeps Map', () => {
        expect(out).toMatch(/handleD\(Object client, (java\.util\.)?Map<String, Object> message, (java\.util\.)?Map<String, Object> subscription\)/);
    });

    test('a boxed caller keeps Object', () => {
        expect(out).toMatch(/handleB\(Object client, (java\.util\.)?Map<String, Object> message, Object subscription\)/);
    });

    test('a read slot keeps Object', () => {
        expect(out).toMatch(/handleC\(Object client, (java\.util\.)?Map<String, Object> message, Object subscription\)/);
    });

    test('an any slot keeps Object', () => {
        expect(out).toMatch(/handleE\(Object client, (java\.util\.)?Map<String, Object> message, Object subscription\)/);
    });
});
