import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a local handed to a thrown error constructor moves (the throw leaves the function)
const base = "export interface Dict { [key: string]: any }\nexport class ExchangeError extends Error {}\nexport default class Exchange {\n    id: string = '';\n"
    + "    note (x: any, y: any = undefined): any { return x; }\n    keep (x: any): any { return x; }\n}\n";
const venue = (body: string) => "import Exchange from './base/Exchange.js';\nimport { ExchangeError } from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\n"
    + "export default class venue extends Exchange {\n"
    + `    run (flag: boolean, a: any, b: any): any {\n${body}\n    }\n}\n`;

function build (src: string): string {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-h51r45-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), src);
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try {
        return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
    } finally {
        fs.rmSync (root, { recursive: true, force: true });
    }
}

describe ('h51r45: a local handed to a thrown error', () => {
    test ('the thrown error takes the local without a clone', () => {
        const out = build (venue ("        const feedback = this.id + ' ' + this.keep (a);\n        if (flag) {\n            this.note (feedback);\n            throw new ExchangeError (feedback);\n        }\n        return this.note (b, feedback);"));
        expect (out).toMatch (/exchange_error\(feedback\)/);
    });
    test ('a boxed local handed to a thrown error moves too', () => {
        const out = build (venue ("        const m = this.keep (a);\n        if (flag) {\n            throw new ExchangeError (m);\n        }\n        return this.note (b, m);"));
        expect (out).toMatch (/exchange_error\(m\)/);
    });
    test ('negative: inside a try the clone stays', () => {
        const out = build (venue ("        const feedback = this.id + ' ' + this.keep (a);\n        try {\n            throw new ExchangeError (feedback);\n        } catch (e) {\n            return this.note (feedback);\n        }"));
        expect (out).not.toMatch (/exchange_error\(feedback\)/);
    });
});
