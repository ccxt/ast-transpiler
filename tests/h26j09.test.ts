import { Transpiler } from '../src/transpiler';

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

const make = (): Transpiler => new Transpiler({
    verbose: false,
    java: {
        parser: { NUM_LINES_END_FILE: 0 },
        asyncSupplier: 'BaseExchange.supplyAsync',
        asyncCoreSplit: '.',
    },
});

const SOURCE =
    "class T {\n" +
    "    async pong(client: any, message: any) {\n" +
    "        return message;\n" +
    "    }\n" +
    "    sync(client: any, message: any) {\n" +
    "        return message;\n" +
    "    }\n" +
    "    async snap(client: any, hash: string, limit: number = undefined) {\n" +
    "        return hash;\n" +
    "    }\n" +
    "    handle(client: any, message: any) {\n" +
    "        this.spawn (this.pong, client, message);\n" +
    "        this.spawn (this.snap, client, 'h');\n" +
    "        this.spawn (this.sync, client, message);\n" +
    "        this.spawn (this.implicit, client, message);\n" +
    "        const f = this.spawn (this.pong, client, message);\n" +
    "        return f;\n" +
    "    }\n" +
    "    implicit(client: any, message: any): Promise<any> {\n" +
    "        return undefined as any;\n" +
    "    }\n" +
    "    spawn(m: any, ...args) {\n" +
    "        return undefined;\n" +
    "    }\n" +
    "}";

describe('java spawn of an async method prints the direct call', () => {
    const out = make().transpileJava(SOURCE).content;
    test('positive: statement spawn of an async method is a direct call', () => {
        expect(out).toMatch(/\n +this\.pong\(client, message\);\n/);
        expect(out).toMatch(/\n +this\.snap\(client, "h", \(Object\) null\);\n/);
    });
    test('negative: a sync target keeps the spawn', () => {
        expect(out).toMatch(/this\.spawn\(this\.sync, client, message\);/);
        // a Promise-typed method without `async` may run its body on the caller: keep the spawn
        expect(out).toMatch(/this\.spawn\(this\.implicit, client, message\);/);
    });
    test('negative: a spawn whose value is used keeps the spawn', () => {
        expect(out).toMatch(/f = this\.spawn\(this\.pong, client, message\);/);
    });
});

import * as fs from 'fs';
import * as path from 'path';

describe('java spawn of a base-tier async method keeps the spawn', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h26j09');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'pro', 'probe.ts');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.dirname(BASE), { recursive: true });
        fs.writeFileSync(BASE,
            "export default class Exchange {\n" +
            "    spawn (method: any, ...args: any[]): any {\n" +
            "    }\n" +
            "    async loadBook (client: any, hash: string) {\n" +
            "        return hash;\n" +
            "    }\n" +
            "}\n");
        fs.mkdirSync(path.dirname(VENUE), { recursive: true });
        fs.writeFileSync(VENUE,
            "import Exchange from '../base/Exchange';\n" +
            "export default class probe extends Exchange {\n" +
            "    async pong (client: any, message: any) {\n" +
            "        return message;\n" +
            "    }\n" +
            "    handle (client: any, message: any) {\n" +
            "        this.spawn (this.loadBook, client, 'h');\n" +
            "        this.spawn (this.pong, client, message);\n" +
            "    }\n" +
            "}\n");
        out = make().transpileJavaByPath(VENUE).content;
    });
    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    test('negative: a base-tier target (may be hand-written sync in Java) keeps the spawn', () => {
        expect(out).toContain('this.spawn(this.loadBook, client, "h");');
    });
    test('positive: a venue async target is called directly', () => {
        expect(out).toMatch(/\n +this\.pong\(client, message\);\n/);
    });
});
