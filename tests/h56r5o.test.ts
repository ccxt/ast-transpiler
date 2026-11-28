import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

describe('h56r5o: Rust typeof function + final-use dict-bearer push, Go typeof function', () => {
    let tmpDir: string;
    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'h56r5o-'));
        fs.mkdirSync(path.join(tmpDir, 'ts', 'src', 'base'), { recursive: true });
    });
    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('Rust emits false/true for typeof Value ===/!== function without is_function', () => {
        const file = path.join(tmpDir, 'ts', 'src', 'base', 'ProxyCheck.ts');
        fs.writeFileSync(file, `
export default class ProxyCheck {
    proxy: any = undefined;
    check (cb: any): boolean {
        if (typeof this.proxy === 'function') {
            return true;
        }
        if (typeof cb !== 'function') {
            return false;
        }
        return true;
    }
}
`);
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(file).content;
        expect(out).not.toContain('is_function');
        expect(out).toContain('if false {');
        expect(out).toContain('if true {');
    });

    test('Rust dict bearer handed to a final-use this. call emits native entry push without append_to_object_array', () => {
        const baseFile = path.join(tmpDir, 'ts', 'src', 'base', 'Exchange.ts');
        const venueFile = path.join(tmpDir, 'ts', 'src', 'venue.ts');
        fs.writeFileSync(baseFile, `
export interface Dict { [key: string]: any }
export type Str = string | undefined;
export default class Exchange {
    markets_by_id: any = undefined;
    safeString (o: any, k: any, d: Str = undefined): Str { return o; }
    mapToSafeMap (m: any): any { return m; }
    safeList (o: any, k: any, d: any[] = undefined): any[] { return o; }
}
`);
        fs.writeFileSync(venueFile, `
import Exchange from './base/Exchange.js';
import type { Dict } from './base/Exchange.js';
export default class venue extends Exchange {
    indexFinalMove (rows: Dict[]) {
        const byId: Dict = {};
        for (let i = 0; i < rows.length; i++) {
            const id = this.safeString (rows[i], 'id', '');
            if (!(id in byId)) {
                byId[id] = [];
            }
            byId[id].push (rows[i]);
        }
        this.markets_by_id = this.mapToSafeMap (byId);
    }
    indexLoopCall (rows: Dict[]) {
        const byId: Dict = {};
        for (let i = 0; i < rows.length; i++) {
            const id = this.safeString (rows[i], 'id', '');
            byId[id] = this.safeList (byId, id, []);
            byId[id].push (rows[i]);
        }
        return byId;
    }
}
`);
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const out = t.transpileRustByPath(venueFile).content;
        const finalBody = out.slice(out.indexOf('fn indexFinalMove'), out.indexOf('fn indexLoopCall'));
        expect(finalBody).toMatch(/let mut byId: indexmap::IndexMap<String, Value> = /);
        expect(finalBody).toContain('.or_insert_with(|| Value::Array(Vec::new())) { std::sync::Arc::make_mut(__a).push(');
        expect(finalBody).not.toContain('append_to_object_array');
        expect(finalBody).toContain('Value::Map(byId)');
        expect(finalBody).not.toContain('byId.clone()');
        const loopBody = out.slice(out.indexOf('fn indexLoopCall'));
        expect(loopBody).toMatch(/let mut byId: Value = /);
    });

    test('Go emits native reflect.TypeOf check for pure typeof function operands without IsFunction', () => {
        const file = path.join(tmpDir, 'ts', 'src', 'base', 'GoProxyCheck.ts');
        fs.writeFileSync(file, `
export default class GoProxyCheck {
    proxy: any = undefined;
    get (): any { return this.proxy; }
    check (cb: any): boolean {
        if (typeof this.proxy === 'function') {
            return true;
        }
        const notFn = (typeof cb !== 'function');
        if (typeof this.get () === 'function') {
            return notFn;
        }
        return false;
    }
}
`);
        const t = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
        const res = t.transpileGoByPath(file);
        const out = res.content;
        expect(out).toContain('import "reflect"');
        expect(out).toContain('if reflect.TypeOf(this.Proxy) != nil && reflect.TypeOf(this.Proxy).Kind() == reflect.Func {');
        expect(out).toContain('(reflect.TypeOf(cb) == nil || reflect.TypeOf(cb).Kind() != reflect.Func)');
        expect(out).toContain('IsFunction(this.Get())');
    });
});
