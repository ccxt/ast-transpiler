import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const BASE_FIXTURE =
    "export class Exchange {\n" +
    "    id: string = 'x';\n" +
    "    spawn (m: any, ...args) { return undefined; }\n" +
    "    fetchPositions (symbols = undefined, params = {}) { return undefined; }\n" +
    "    handleMarketTypeAndParams (m: string, market: any = undefined, params: any = {}, d: string | undefined = undefined): [string, any] { return [ d, params ]; }\n" +
    "}\n";

const go = (pro: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h45g08-'));
    try {
        const src = path.join(dir, 'ts', 'src');
        fs.mkdirSync(path.join(src, 'base'), { recursive: true });
        fs.mkdirSync(path.join(src, 'pro'), { recursive: true });
        fs.writeFileSync(path.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
        fs.writeFileSync(path.join(src, 'pro', 'ex.ts'), "import { Exchange } from '../base/Exchange';\n" + pro);
        const t = new Transpiler({ verbose: false, go: {} } as any);
        installCcxtGoHooks((t as any).goTranspiler);
        installCcxtGoLocalTypes((t as any).goTranspiler);
        return t.transpileGoByPath(path.join(src, 'pro', 'ex.ts')).content;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
};

const CALLEE =
    "    async loadSnap (client: any, messageHash: string, type: string) {\n" +
    "        const positions = await this.fetchPositions (undefined, { 'type': type });\n" +
    "        return messageHash + type;\n" +
    "    }\n";

describe('h45g08: a required declared-string parameter handed to a spawn slot', () => {
    test('positive: the caller parameter `type: string` types the spawned callee (fails on the base printer)', () => {
        const out = go(
            "export class ex extends Exchange {\n" +
            "    async watchPos (market: any = undefined, params: any = {}) {\n" +
            "        const [ type, rest ] = this.handleMarketTypeAndParams ('watchPos', market, params, 'swap');\n" +
            "        this.setCache (undefined, type);\n" +
            "    }\n" +
            "    setCache (client: any, type: string) {\n" +
            "        const messageHash = type + ':snap';\n" +
            "        this.spawn (this.loadSnap, client, messageHash, type);\n" +
            "    }\n" + CALLEE + "}\n");
        expect(out).toContain('this.Spawn(this.LoadSnap, client, messageHash, typeVar)');
        expect(out).toMatch(/LoadSnap(Async)?\(client any, messageHash any, typeVar string\)/);
    });

    test('negative: an optional parameter (may be nil) keeps the box', () => {
        const out = go(
            "export class ex extends Exchange {\n" +
            "    setCache (client: any, type: string = undefined) {\n" +
            "        this.spawn (this.loadSnap, client, 'h', type);\n" +
            "    }\n" + CALLEE + "}\n");
        expect(out).toMatch(/LoadSnap(Async)?\(client any, messageHash \w+, typeVar any\)/);
    });

    test('negative: a parameter written in its function keeps the box', () => {
        const out = go(
            "export class ex extends Exchange {\n" +
            "    setCache (client: any, type: string, o: any) {\n" +
            "        type = o['t'];\n" +
            "        this.spawn (this.loadSnap, client, 'h', type);\n" +
            "    }\n" + CALLEE + "}\n");
        expect(out).toMatch(/LoadSnap(Async)?\(client any, messageHash \w+, typeVar any\)/);
    });

    test('negative: a parameter declared `any` keeps the box', () => {
        const out = go(
            "export class ex extends Exchange {\n" +
            "    setCache (client: any, type: any) {\n" +
            "        this.spawn (this.loadSnap, client, 'h', type);\n" +
            "    }\n" + CALLEE + "}\n");
        expect(out).toMatch(/LoadSnap(Async)?\(client any, messageHash \w+, typeVar any\)/);
    });
});
