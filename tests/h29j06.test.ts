import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

const make = (): Transpiler => new Transpiler({
    verbose: false,
    java: {
        parser: { NUM_LINES_END_FILE: 0 },
    },
});

const wrap = (body: string) =>
    "class T {\n" +
    "    async fetchA (x: number): Promise<number> {\n" +
    "        return x;\n" +
    "    }\n" +
    "    foo (): number {\n" +
    "        return 1;\n" +
    "    }\n" +
    body +
    "}\n";


const TMP = path.join(__dirname, 'files', 'tmp-h29j06');
let fixtureN = 0;
const runAt = (body: string) => {
    const file = path.join(TMP, `w${process.pid}-${fixtureN++}`, 'ts', 'src', 'probe.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export default ' + wrap(body));
    return make().transpileJavaByPath(file).content as string;
};
afterAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
});

const F = 'java.util.concurrent.CompletableFuture';

describe('h29-J06 Promise.all over an inline literal of calls', () => {
    test('a call-only literal prints a typed future list then the allOf join', () => {
        const out = runAt(
            "    async many (): Promise<any> {\n" +
            "        const results = await Promise.all ([ this.fetchA (1), this.fetchA (2) ]);\n" +
            "        return results;\n" +
            "    }\n");
        expect(out).toContain(`java.util.List<${F}<?>> resultsFutures = new java.util.ArrayList<${F}<?>>(java.util.Arrays.<${F}<?>>asList(this.fetchA(1), this.fetchA(2)));`);
        expect(out).toContain(`${F}.allOf(resultsFutures.toArray(new ${F}<?>[0]))`);
        expect(out).not.toContain('promiseAllItem');
    });
    test('a destructured literal join uses the joined names', () => {
        const out = runAt(
            "    async many (): Promise<any> {\n" +
            "        const [ a, b ] = await Promise.all ([ this.fetchA (1), this.fetchA (2) ]);\n" +
            "        return a;\n" +
            "    }\n");
        expect(out).toContain('abFutures');
        expect(out).toContain(`${F}.allOf(abFutures.toArray(`);
    });
    test('a literal with a non-call element keeps the old form', () => {
        const out = runAt(
            "    async many (p: any): Promise<any> {\n" +
            "        const results = await Promise.all ([ this.fetchA (1), p ]);\n" +
            "        return results;\n" +
            "    }\n");
        expect(out).not.toContain('resultsFutures');
    });
    test('a literal with a non-future call keeps the old form', () => {
        const out = runAt(
            "    async many (): Promise<any> {\n" +
            "        const results = await Promise.all ([ this.fetchA (1), this.foo () ]);\n" +
            "        return results;\n" +
            "    }\n");
        expect(out).not.toContain('resultsFutures');
    });
});
