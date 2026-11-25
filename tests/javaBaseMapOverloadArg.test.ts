import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// base `extend (a, b)` and `safeDict (x, k, {..})` bind the hand-written Map overloads, so a Dict
// parameter slot takes them with no `(Map<String, Object>)` checkcast; other shapes keep it
describe('java base Map overload argument', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-base-map-overload-arg');
    const BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE_FIXTURE = path.join(TMP, 'exchanges', 'bitfake.ts');
    const source =
    "import type { Dict } from './types';\n" +
    "class T {\n" +
    "    extend (...args: any[]): any { return {}; }\n" +
    "    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n" +
    "    take (d: Dict): any { return d; }\n" +
    "    f1 (a: any, b: any): any { return this.take (this.extend (a, b)); }\n" +
    "    f2 (r: any): any { return this.take (this.safeDict (r, 0, {})); }\n" +
    "    f3 (r: any): any { return this.take (this.safeDict (r, 'k', r)); }\n" +
    "    f4 (r: any): any { return this.take (this.safeDict (r, 'k')); }\n" +
    "    f5 (a: any, b: any, c: any): any { return this.take (this.extend (a, b, c)); }\n" +
    "}\n";

    const TYPES = "export interface Dictionary<T> { [key: string]: T; }\nexport type Dict = Dictionary<any>;\n";
    let baseOutput: string;
    let venueOutput: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE_FIXTURE), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE_FIXTURE), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'types.ts'), TYPES);
        fs.writeFileSync(BASE_FIXTURE, source);
        fs.writeFileSync(VENUE_FIXTURE, source.replace("'./types'", "'../ts/src/base/types'"));
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        baseOutput = t.transpileJavaByPath(BASE_FIXTURE).content;
        venueOutput = t.transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('two-argument base extend needs no checkcast', () => {
        expect(baseOutput).toContain('this.take(this.extend(a, b))');
        expect(baseOutput).not.toContain('(Map<String, Object>) (this.extend(a, b))');
    });

    test('base safeDict with a literal default needs no checkcast', () => {
        expect(baseOutput).toMatch(/this\.take\(this\.safeDict\(r, 0, new (java\.util\.)?HashMap/);
    });

    test('safeDict with a non-literal or missing default keeps the checkcast', () => {
        expect(baseOutput).toContain('Map<String, Object>) (this.safeDict(r, "k", r))');
        expect(baseOutput).toContain('Map<String, Object>) (this.safeDict(r, "k"))');
    });

    test('three-argument extend keeps the checkcast', () => {
        expect(baseOutput).toContain('Map<String, Object>) (this.extend(a, b, c))');
    });
});
