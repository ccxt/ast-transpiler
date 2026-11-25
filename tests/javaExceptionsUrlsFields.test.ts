import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } } as any);

describe('java exceptions / urls base fields are declared maps', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'java-exceptions-urls-'));
    const write = (relative: string, content: string): string => {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
        return file;
    };
    write('ts/src/base/Exchange.ts', 'type Dict = { [key: string]: any };\nexport default class Exchange {\n'
        + '    exceptions: { [key: string]: Dict } = {};\n    urls: { api: Dict; [key: string]: any } = { api: {} };\n'
        + '    throwExactlyMatchedException (exact: Dict, s: string, m: string) {}\n}\n');
    let venue = 0;
    const transpile = (relative: string, body: string): string => transpiler.transpileJavaByPath(write(relative.replace('#', String(venue++)), body)).content;
    const venueClass = (base: string, members: string) => `import Exchange from '${base}/Exchange.js';\nexport default class V extends Exchange {\n${members}\n}\n`;
    const members = `    handle (code: string, symbol: any) {
        this.throwExactlyMatchedException (this.exceptions, code, code);
        if (symbol in this.urls) {
            return true;
        }
        if ('test' in this.exceptions) {
            return false;
        }
        return this.urls[symbol];
    }`;

    test('the field passes into a Map slot and binds containsKey / get with no cast', () => {
        const output = transpile('ts/src/venue#.ts', venueClass('./base', members));
        expect(output).toContain('this.throwExactlyMatchedException(this.exceptions, code, code)');
        expect(output).toContain('this.urls.containsKey(symbol)');
        expect(output).toContain('this.exceptions.containsKey("test")');
        expect(output).not.toContain('(java.util.Map<?, ?>)this.urls');
        expect(output).not.toContain('(Map<String, Object>) (this.exceptions)');
    });

    test('a venue field that shadows the base declaration keeps the cast', () => {
        const own = `import Exchange from './base/Exchange.js';\nexport default class V extends Exchange {\n    declare urls: any;\n    handle (symbol: any) {\n        if (symbol in this.urls) {\n            return true;\n        }\n        return false;\n    }\n}\n`;
        const output = transpile('ts/src/venue#.ts', own);
        expect(output).not.toContain('this.urls.containsKey(symbol)');
    });

    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });
});
