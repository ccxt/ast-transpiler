import { Transpiler } from '../src/transpiler';

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

const make = (): Transpiler => new Transpiler({
    verbose: false,
    java: {
        parser: { NUM_LINES_END_FILE: 0 },
    },
});

const run = (body: string) => make().transpileJava(
    "type Dict = { [key: string]: any };\n" +
    "class T {\n" +
    "    events: Dict = undefined;\n" +
    "    other: any = undefined;\n" +
    "    parseEvent (e: Dict): Dict {\n" +
    "        return e;\n" +
    "    }\n" +
    body +
    "}\n").content;

const group = (seed: string, extra = '', tail = '') =>
    "    groups (rows: any[], keys: string[]): any {\n" +
    "        const groups: Dict = {};\n" +
    "        for (let i = 0; i < keys.length; i++) {\n" +
    "            const key = keys[i];\n" +
    "            if (!(key in groups)) {\n" +
    "                groups[key] = " + seed + ";\n" +
    "            }\n" +
    "            const group = groups[key];\n" +
    "            const items = group['items'];\n" +
    "            items.push (rows[i]);\n" +
    "            group['items'] = items;\n" +
    "        }\n" +
    extra +
    "        const result = [];\n" +
    "        const groupKeys = Object.keys (groups);\n" +
    "        for (let i = 0; i < groupKeys.length; i++) {\n" +
    "            result.push (this.parseEvent (groups[groupKeys[i]]));\n" +
    "        }\n" +
    tail +
    "        return result;\n" +
    "    }\n";

describe('h30-J04 row container stored into a Dict field', () => {
    test('a last-use store into a Dict field keeps the typed container and copies it', () => {
        const out = run(group("{ 'key': key, 'items': [] }", '', "        this.events = groups;\n"));
        expect(out).toContain('java.util.Map<String, Map<String, Object>> groups = new java.util.HashMap<String, Map<String, Object>>()');
        expect(out).toContain('this.events = new java.util.HashMap<String, Object>(groups);');
        expect(out).not.toContain('Helpers.GetValue(group, "items")');
    });

    test('a store into an any field keeps the box', () => {
        const out = run(group("{ 'items': [] }", '', "        this.other = groups;\n"));
        expect(out).not.toContain('Map<String, Map<String, Object>> groups');
        expect(out).toContain('Helpers.GetValue(group, "items")');
    });

    test('a container used after the store keeps the box', () => {
        const out = run(group("{ 'items': [] }", "        this.events = groups;\n        groups['x'] = { 'items': [] };\n"));
        expect(out).not.toContain('Map<String, Map<String, Object>> groups');
        expect(out).not.toContain('new java.util.HashMap<String, Object>(groups)');
    });

    test('a container with a non-literal write stored into the field keeps the box', () => {
        const out = run(group("{ 'items': [] }", "        groups['y'] = rows[0];\n", "        this.events = groups;\n"));
        expect(out).not.toContain('Map<String, Map<String, Object>> groups');
        expect(out).not.toContain('new java.util.HashMap<String, Object>(groups)');
    });
});
