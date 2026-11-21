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


const TMP = path.join(__dirname, 'files', 'tmp-h30j06');
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

describe('h30-J06 future lists seeded by a local or read with .length', () => {
    test('a list read with .length prints a typed future list', () => {
        const out = runAt(
            "    async many (): Promise<any> {\n" +
            "        const promises = [];\n" +
            "        promises.push (this.fetchA (1));\n" +
            "        const n = promises.length;\n" +
            "        promises.push (this.fetchA (2));\n" +
            "        const results = await Promise.all (promises);\n" +
            "        return [ results, n ];\n" +
            "    }\n");
        expect(out).toContain(`java.util.List<${F}<?>> promises = new java.util.ArrayList<${F}<?>>();`);
        expect(out).toContain('promises.add(this.fetchA(1))');
        expect(out).toContain(`${F}.allOf(promises.toArray(new ${F}<?>[0]))`);
        expect(out).not.toContain('promiseAllItem');
    });
    test('a const future local seeding the list prints typed', () => {
        const out = runAt(
            "    async many (): Promise<any> {\n" +
            "        const first = this.fetchA (1);\n" +
            "        const promises: Promise<any>[] = [ first ];\n" +
            "        promises.push (this.fetchA (2));\n" +
            "        const results = await Promise.all (promises);\n" +
            "        return results;\n" +
            "    }\n");
        expect(out).toContain(`${F}<?> first = this.fetchA(1);`);
        expect(out).toContain(`java.util.List<${F}<?>> promises = new java.util.ArrayList<${F}<?>>(java.util.Arrays.<${F}<?>>asList(first));`);
        expect(out).not.toContain('promiseAllItem');
    });
    test('negative: a pushed non-future keeps the helper', () => {
        const out = runAt(
            "    async many (): Promise<any> {\n" +
            "        const promises = [];\n" +
            "        promises.push (this.foo ());\n" +
            "        const n = promises.length;\n" +
            "        const results = await Promise.all (promises);\n" +
            "        return [ results, n ];\n" +
            "    }\n");
        expect(out).toContain('promiseAllItem');
    });
    test('negative: a seed local used twice keeps the helper', () => {
        const out = runAt(
            "    async many (): Promise<any> {\n" +
            "        const first = this.fetchA (1);\n" +
            "        const promises = [ first ];\n" +
            "        const results = await Promise.all (promises);\n" +
            "        return [ results, first ];\n" +
            "    }\n");
        expect(out).toContain('promiseAllItem');
        expect(out).not.toContain(`${F}<?> first =`);
    });
    test('negative: a list read by index keeps the helper', () => {
        const out = runAt(
            "    async many (): Promise<any> {\n" +
            "        const promises = [];\n" +
            "        promises.push (this.fetchA (1));\n" +
            "        const n = promises.length;\n" +
            "        const p = promises[0];\n" +
            "        const results = await Promise.all (promises);\n" +
            "        return [ results, n, p ];\n" +
            "    }\n");
        expect(out).toContain('promiseAllItem');
    });
});
