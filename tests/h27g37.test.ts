import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes } from '../src/transpiler';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const BASE_FIXTURE =
    "export class Exchange {\n" +
    "    id: string = 'x';\n" +
    "    safeString (a, b, c?) { return undefined; }\n" +
    "    safeDict (a, b, c?) { return undefined; }\n" +
    "    spawn (m: any, ...args) { return undefined; }\n" +
    "    handleMessage (client, message) {}\n" +
    "}\n";
const HEADER =
    "import { Exchange } from '../base/Exchange';\n" +
    "import type { Dict } from '../base/types';\n";

const treeFor = (name: string, pro: string) => {
    const src = path.join(__dirname, 'files', name, 'ts', 'src');
    fs.mkdirSync(path.join(src, 'base'), { recursive: true });
    fs.mkdirSync(path.join(src, 'pro'), { recursive: true });
    fs.writeFileSync(path.join(src, 'base', 'Exchange.ts'), BASE_FIXTURE);
    fs.writeFileSync(path.join(src, 'base', 'types.ts'), "export type Dict = {[key: string]: any};\nexport type Str = string | undefined;\n");
    fs.writeFileSync(path.join(src, 'pro', 'ex.ts'), HEADER + pro);
    return path.join(src, 'pro', 'ex.ts');
};
const go = (name: string, pro: string, hooks = false) => {
    const t = new Transpiler({ verbose: false, go: {} } as any);
    if (hooks) {
        installCcxtGoHooks((t as any).goTranspiler);
        installCcxtGoLocalTypes((t as any).goTranspiler);
    }
    return t.transpileGoByPath(treeFor(name, pro)).content;
};

const CALLEE =
    "    async handleCheckErr (client: any, symbol: string, messageHash: string) {\n" +
    "        const e = this.id + ' ' + symbol;\n" +
    "        return e + messageHash;\n" +
    "    }\n";

describe('h27g37: spawned-only async callee takes the string its spawns pass', () => {
    afterAll(() => {
        for (const entry of fs.readdirSync(path.join(__dirname, 'files'))) {
            if (entry.startsWith('tmp-h27g37-')) {
                fs.rmSync(path.join(__dirname, 'files', entry), { recursive: true, force: true });
            }
        }
    });

    test('positive: a defaulted safeString local and a string concat type the params (fails on the base printer)', () => {
        const out = go('tmp-h27g37-pos',
            "export class ex extends Exchange {\n" +
            "    handleBook (client: any, message: Dict) {\n" +
            "        const symbol = this.safeString (message, 'symbol', '');\n" +
            "        const messageHash = 'orderbook:' + symbol;\n" +
            "        this.spawn (this.handleCheckErr, client, symbol, messageHash);\n" +
            "    }\n" + CALLEE + "}\n");
        expect(out).toContain('HandleCheckErr(client any, symbol string, messageHash string)');
        expect(out).toContain('this.Spawn(this.HandleCheckErr, client, *symbol, messageHash)');
        expect(out).not.toContain('Add(');
    });

    test('positive: the base orderbookChecksumMessage return is a Go string at a spawn slot', () => {
        const out = go('tmp-h27g37-checksum',
            "export class ex extends Exchange {\n" +
            "    orderbookChecksumMessage (symbol: string): string { return symbol; }\n" +
            "    handleBook (client: any, message: Dict) {\n" +
            "        const symbol = this.safeString (message, 'symbol', '');\n" +
            "        this.spawn (this.handleCheckErr, client, symbol, this.orderbookChecksumMessage (symbol));\n" +
            "    }\n" + CALLEE + "}\n", true);
        expect(out).toContain('HandleCheckErr(client any, symbol string, messageHash string)');
    });

    test('negative: a spawn argument that can be nil keeps the box', () => {
        const out = go('tmp-h27g37-nil',
            "export class ex extends Exchange {\n" +
            "    handleBook (client: any, message: Dict) {\n" +
            "        const symbol = this.safeString (message, 'symbol');\n" +
            "        const messageHash = 'orderbook:' + symbol;\n" +
            "        this.spawn (this.handleCheckErr, client, symbol, messageHash);\n" +
            "    }\n" + CALLEE + "}\n");
        expect(out).toContain('HandleCheckErr(client any, symbol any, messageHash any)');
        expect(out).toContain('this.Spawn(this.HandleCheckErr, client, symbol, messageHash)');
    });

    test('negative: a boxed argument (a dict value) keeps the box', () => {
        const out = go('tmp-h27g37-box',
            "export class ex extends Exchange {\n" +
            "    handleBook (client: any, message: Dict) {\n" +
            "        this.spawn (this.handleCheckErr, client, message['s'], message['h']);\n" +
            "    }\n" + CALLEE + "}\n");
        expect(out).toContain('HandleCheckErr(client any, symbol any, messageHash any)');
    });

    test('negative: a direct call besides the spawn leaves the existing proof in charge', () => {
        const out = go('tmp-h27g37-direct',
            "export class ex extends Exchange {\n" +
            "    handleBook (client: any, message: Dict) {\n" +
            "        const symbol = this.safeString (message, 'symbol', '');\n" +
            "        this.spawn (this.handleCheckErr, client, symbol, 'h');\n" +
            "        this.handleCheckErr (client, message['s'], 'h');\n" +
            "    }\n" + CALLEE + "}\n");
        expect(out).toContain('HandleCheckErr(client any, symbol any, messageHash');
        expect(out).toContain('this.Spawn(this.HandleCheckErr, client, symbol, ');
    });

    test('negative: a body that writes a non-string keeps the box', () => {
        const out = go('tmp-h27g37-write',
            "export class ex extends Exchange {\n" +
            "    handleBook (client: any, message: Dict) {\n" +
            "        this.spawn (this.handleCheckErr2, client, 'a');\n" +
            "    }\n" +
            "    async handleCheckErr2 (client: any, symbol: string) {\n" +
            "        symbol = message2 as any;\n" +
            "        return symbol;\n" +
            "    }\n" + "}\nconst message2 = undefined;\n");
        expect(out).toContain('HandleCheckErr2(client any, symbol any)');
    });
});
