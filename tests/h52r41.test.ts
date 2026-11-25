import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const base = "export interface Dict { [key: string]: any }\nexport type List = any[];\nexport default class Exchange {\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n    safeString (o: any, k: any, d: any = undefined): string | undefined { return o; }\n    keep (o: any): any { return o; }\n}\n";
const api = "import Exchange from '../base/Exchange.js';\nimport type { Dict, List } from '../base/Exchange.js';\nexport default abstract class venueApi extends Exchange {\n    publicGetA (params = {}): Promise<Dict> { return this.keep (params); }\n    publicGetC (params = {}): Promise<List> { return this.keep (params); }\n}\n";
const venue = (endpoint: string, fill: string) => "import venueApi from './abstract/venue.js';\nimport type { Dict, List } from './base/Exchange.js';\nexport default class venue extends venueApi {\n    async m (params: Dict = {}) {\n        const response = await this.publicGet" + endpoint + " (params);\n        let inner = this.safeDict (response, 'data', response);\n        if (inner === undefined) {\n            inner = " + fill + ";\n        }\n        return this.parseOrder (inner);\n    }\n    parseOrder (order: Dict, market = undefined) {\n        return { 'id': this.safeString (order, 'id'), 'info': order };\n    }\n}\n";

describe('rust: an empty map literal written into an optional map local', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h52r41-'));
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
    const run = (name: string, endpoint: string, fill: string) => {
        const dir = path.join(root, name);
        fs.mkdirSync(path.join(dir, 'ts/src/base'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'ts/src/abstract'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'ts/src/base/Exchange.ts'), base);
        fs.writeFileSync(path.join(dir, 'ts/src/abstract/venue.ts'), api);
        fs.writeFileSync(path.join(dir, 'ts/src/venue.ts'), venue(endpoint, fill));
        return new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } }).transpileRustByPath(path.join(dir, 'ts/src/venue.ts')).content as string;
    };
    test('is the empty typed map in Some, with no into_opt_dict wrap (fails on the base printer)', () => {
        const out = run('empty', 'A', '{}');
        expect(out).toContain('let mut inner: Option<crate::value::Dict> = ');
        expect(out).toContain('inner = Some(crate::value::Dict::default());');
        expect(out).not.toMatch(/inner = Value::Map/);
        // a missing key is still the None test
        expect(out).toContain('inner.is_none()');
    });
    test('a non-empty literal keeps the built map form', () => {
        const out = run('built', 'A', "{ 'id': '1' }");
        expect(out).toContain('inner = Some(crate::value::Dict::new(');
        expect(out).not.toContain('Some(crate::value::Dict::default())');
    });
    test('negative: a list-or-dict endpoint keeps the boxed local', () => {
        const out = run('neg', 'C', '{}');
        expect(out).toContain('let mut inner: Value');
        expect(out).not.toContain('Some(crate::value::Dict::default())');
    });
});
