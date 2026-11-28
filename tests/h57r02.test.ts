import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// `this.safeValue (this.clients, client.url) === client`: the handle answers whether it is still the registered client
const files: Record<string, string> = {
    'ts/src/base/Exchange.ts': 'export interface Dict { [key: string]: any }\nexport default class Exchange {\n    clients: Dict = {};\n    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n    note (x: any): any { return x; }\n}\n',
    'ts/src/base/ws/Client.ts': 'export default class Client {\n    subscriptions: any = {};\n    url: string = "";\n    resolve (v: any, h: string | undefined = undefined): void {}\n}\n',
};
const venue = (body: string) => [
    "import Exchange from '../base/Exchange';",
    "import Client from '../base/ws/Client';",
    'export default class venue extends Exchange {',
    '    keepAlive (client: Client, other: Client) {',
    body,
    '    }',
    '}',
    '',
].join ('\n');

function build (body: string): string {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-h57r02-'));
    try {
        for (const [ name, text ] of Object.entries ({ ...files, 'ts/src/pro/venue.ts': venue (body) })) {
            fs.mkdirSync (path.dirname (path.join (root, name)), { recursive: true });
            fs.writeFileSync (path.join (root, name), text);
        }
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        return t.transpileRustByPath (path.join (root, 'ts/src/pro/venue.ts')).content;
    } finally {
        fs.rmSync (root, { recursive: true, force: true });
    }
}

describe ('h57r02: ws client identity test', () => {
    test ('a local only compared with the client parameter is the is_current bool', () => {
        const out = build ("        const current = this.safeValue (this.clients, client.url);\n        if (current !== client) {\n            return;\n        }\n        client.resolve (1, 'h');");
        expect (out).toMatch (/let current: bool = (?:__ch|client)\.is_current\(\)/);
        expect (out).toMatch (/if \(?!current\)? \{/);
        expect (out).not.toContain ('is_equal(');
    });
    test ('the === form reads the bool as it is', () => {
        const out = build ("        const current = this.safeValue (this.clients, client.url);\n        if (current === client) {\n            client.resolve (1, 'h');\n        }");
        expect (out).toMatch (/let current: bool = (?:__ch|client)\.is_current\(\)/);
        expect (out).toMatch (/if \(?current\)? \{/);
        expect (out).not.toContain ('is_equal(');
    });
    test ('negative: a local that is also handed on keeps the Value and the helper', () => {
        const out = build ("        const current = this.safeValue (this.clients, client.url);\n        if (current !== client) {\n            return;\n        }\n        this.note (current);");
        expect (out).not.toContain ('is_current()');
        expect (out).toContain ('is_equal(');
    });
    test ('negative: compared with another value', () => {
        const out = build ("        const current = this.safeValue (this.clients, client.url);\n        if (current !== other) {\n            return;\n        }\n        client.resolve (1, 'h');");
        expect (out).not.toContain ('is_current()');
    });
    test ('negative: another map or another key', () => {
        const out = build ("        const current = this.safeValue (this.clients, other.url);\n        if (current !== client) {\n            return;\n        }\n        client.resolve (1, 'h');");
        expect (out).not.toContain ('is_current()');
    });
});
