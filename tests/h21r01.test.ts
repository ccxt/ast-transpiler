import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const BASE = [
    'export interface Dict { [key: string]: any }',
    'export type NullableDict = Dict | undefined;',
    'export type Str = string | undefined;',
    'export interface Position { [key: string]: any }',
    'export default class Exchange {',
    '    positionsByType: any = undefined;',
    '    safeDict (d: any, k: any, def: Dict = undefined): Dict { return d[k] ?? def; }',
    '    safeString (d: any, k: any, def: Str = undefined): Str { return d[k] ?? def; }',
    '    safePosition (p: Dict): Position { return p; }',
    '    milliseconds (): number { return 0; }',
    '    parseNumber (v: any): any { return v; }',
    '}',
    '',
].join('\n');

const src = (body: string) => [
    "import Exchange, { Dict, NullableDict, Str, Position } from '../base/Exchange.js';",
    'export default class venue extends Exchange {',
    '    handlePositionDelta (key: string, symbol: string, side: string, contracts: Str, entry: Dict) {',
    '        const cache = this.safeValue (this.positionsByType, key);',
    '        const symbolPositions = this.safeDict (cache.hashmap, symbol, {});',
    ...body.split('\n').map((l) => '        ' + l),
    '    }',
    '}',
    '',
].join('\n');

const OPPOSITE = [
    "const opposite = this.safeDict (symbolPositions, side);",
    "if (opposite !== undefined) {",
    "    const oc = this.safeString (opposite, 'contracts');",
    "    if (oc !== undefined) {",
    "        (opposite as Dict)['contracts'] = this.parseNumber ('0');",
    "        (opposite as Dict)['lastUpdateTimestamp'] = this.milliseconds ();",
    "        cache.append (opposite as Position);",
    "    }",
    "}",
].join('\n');

const POSITION = [
    "let position = this.safeDict (symbolPositions, side);",
    "if (position === undefined) {",
    "    position = this.safePosition ({ 'symbol': symbol, 'info': entry });",
    "}",
    "(position as Dict)['contracts'] = this.parseNumber (contracts);",
    "(position as Dict)['info'] = entry;",
    "cache.append (position as Position);",
    "return position as Position;",
].join('\n');

describe('derive cache rows: as-wrapped writes and a safePosition refill stay typed', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h21r01-'));
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'base'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'ts', 'src', 'pro'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
    const run = (name: string, text: string) => {
        const t = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
        const file = path.join(tmp, 'ts', 'src', 'pro', name + '.ts');
        fs.writeFileSync(file, text);
        return t.transpileRustByPath(file).content;
    };
    test('as-wrapped writes on a cache row and a safePosition refill print native inserts', () => {
        const a = run('venueA', src(OPPOSITE));
        expect(a).not.toMatch(/add_element_to_object\(&mut opposite\b/);
        expect(a).toMatch(/let mut opposite: Option<crate::value::Dict>/);
        expect(a).toContain('cache.append(opposite.map_or(Value::Null, Value::Dict))');
        const b = run('venueB', src(POSITION));
        expect(b).not.toMatch(/add_element_to_object\(&mut position\b/);
        expect(b).toMatch(/position = Some\(self\.safePosition\(/);
        expect(b).toContain('if let Some(__d) = &mut position');
    });
    test('negative: a refill that is not a base builder of a literal keeps the helper', () => {
        const out = run('venueC', src(POSITION.replace("this.safePosition ({ 'symbol': symbol, 'info': entry })", 'entry as any')));
        expect(out).toMatch(/add_element_to_object\(&mut position\b/);
    });
    test('negative: a row that may stay undefined and is null-tested after a non-Dict cast keeps the helper', () => {
        const out = run('venueD', src(OPPOSITE.split('(opposite as Dict)').join('(opposite as any)')));
        expect(out).toMatch(/add_element_to_object\(&mut opposite\b/);
    });
});
