import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const files: Record<string, string> = {
    'ts/src/base/Exchange.ts': [
        'export default class Exchange {',
        '    options: any;',
        '    safeString (o: any, k: any, d: any = undefined): any { return d; }',
        '    safeDict (o: any, k: any, d: any = undefined): any { return d; }',
        '}',
        '',
    ].join('\n'),
    'ts/src/venue.ts': [
        'import Exchange from \'./base/Exchange.js\';',
        'export default class venue extends Exchange {',
        '    refresh (snapshot: any): string[] {',
        '        const hash = this.safeString (snapshot, \'hash\');',
        '        const refreshed: string[] = [];',
        '        if (hash === undefined) {',
        '            return refreshed;',
        '        }',
        '        const books = this.safeDict (this.options, \'books\', {});',
        '        const syms = Object.keys (books);',
        '        for (let i = 0; i < syms.length; i++) {',
        '            refreshed.push (syms[i]);',
        '        }',
        '        return refreshed;',
        '    }',
        '    handle (rows: any[]) {',
        '        for (let i = 0; i < rows.length; i++) {',
        '            const refreshed = this.refresh (rows[i]);',
        '            for (let j = 0; j < refreshed.length; j++) {',
        '                const sym = this.safeString (refreshed, j, \'\');',
        '                this.safeString (this.options, sym);',
        '            }',
        '        }',
        '    }',
        '}',
        '',
    ].join('\n'),
};

describe('a venue string[] method that builds its own list returns the list', () => {
    let out = '';
    beforeAll(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h53r40-'));
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), text);
        }
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileRustByPath(path.join(root, 'ts/src/venue.ts')).content;
        fs.rmSync(root, { recursive: true, force: true });
    });
    test('the built string list is returned as the list (fails on the base printer)', () => {
        expect(out).toMatch(/fn refresh\([^\n]*\) -> crate::value::List \{/);
        expect((out.match(/return std::sync::Arc::new\(refreshed\);/g) ?? []).length).toBe(2);
        expect(out).toContain('self.refresh(rows.get(i as usize).cloned().unwrap_or(Value::Null)).to_vec()');
    });
    test('negative: a string[] method returning a reader result keeps the boxed return', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h53r40b-'));
        const f2 = { ...files, 'ts/src/venue.ts': files['ts/src/venue.ts'].replace('        return refreshed;\n    }\n    handle', '        return this.safeDict (this.options, \'x\') as any;\n    }\n    handle') };
        for (const [rel, text] of Object.entries(f2)) {
            fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
            fs.writeFileSync(path.join(root, rel), text);
        }
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const neg = t.transpileRustByPath(path.join(root, 'ts/src/venue.ts')).content;
        fs.rmSync(root, { recursive: true, force: true });
        expect(neg).toMatch(/fn refresh\([^\n]*\) -> Value \{/);
    });
});
