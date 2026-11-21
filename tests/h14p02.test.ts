import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

describe('rustVenueOptStrParam: an optional `Str` slot of a sync ws method with no arm prints Option<&str>', () => {
    const exchange = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o[k]; }\n    safeDict (o: any, k: any, d: any = undefined): Dict { return o[k]; }\n    async watch (url: string, hash: string): Promise<any> { return undefined; }\n}\n";
    const build = (venueBody: string) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-h14p02-'));
        fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
        fs.mkdirSync(path.join(root, 'ts/src/pro'), { recursive: true });
        fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), exchange);
        fs.writeFileSync(path.join(root, 'ts/src/pro/venue.ts'), "import Exchange from '../base/Exchange.js';\nimport type { Dict, Str } from '../base/Exchange.js';\nexport default class venue extends Exchange {\n" + venueBody + "}\n");
        const t = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        try {
            t.transpileRustByPath(path.join(root, 'ts/src/base/Exchange.ts'));
            return t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content;
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    };
    const body = "    getPrivateUrl (kind: Str, listenKey: Str): string {\n        if (listenKey === undefined) {\n            throw new Error ('x');\n        }\n        return 'wss://x/' + listenKey;\n    }\n    async watchA (): Promise<any> {\n        const options: Dict = this.safeDict (this.options, 'a', {});\n        const listenKey = this.safeString (options, 'listenKey');\n        const url = this.getPrivateUrl ('a', listenKey);\n        return await this.watch (url, 'h');\n    }\n    async watchB (): Promise<any> {\n        const url = this.getPrivateUrl ('b', undefined);\n        return await this.watch (url, 'h');\n    }\n";
    test('positive: listenKey prints Option<&str>, the typed local is lent with as_deref, the other caller passes None', () => {
        const out = build(body);
        expect(out).toMatch(/fn getPrivateUrl\(&self, [^)]*listenKey: Option<&str>\)/);
        expect(out).toContain('listenKey.as_deref())');
        expect(out).toContain('None);');
        expect(out).not.toContain('listenKey.map(Value::from).unwrap_or(Value::Null)');
    });
    test('negative: one caller passes an untyped value, the parameter stays Value', () => {
        const out = build(body.replace("this.getPrivateUrl ('b', undefined)", "this.getPrivateUrl ('b', this.options['k'])"));
        expect(out).toMatch(/fn getPrivateUrl\(&self, [^)]*listenKey: Value\)/);
    });
    test('negative: no caller lends a string (only literals / undefined), the rule does not fire on its own', () => {
        const out = build(body.replace("this.getPrivateUrl ('a', listenKey)", "this.getPrivateUrl ('a', undefined)"));
        expect(out).not.toContain('listenKey.as_deref())');
    });
});
