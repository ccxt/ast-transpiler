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
    "    parseEvent (e: Dict): Dict {\n" +
    "        return e;\n" +
    "    }\n" +
    body +
    "}\n").content;

const group = (seed: string, extra = '') =>
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
    "        return result;\n" +
    "    }\n";

describe('h29-J04 dict-of-rows container', () => {
    test('a container seeded only with map literals types its rows', () => {
        const out = run(group("{ 'key': key, 'items': [] }"));
        expect(out).toContain('java.util.Map<String, Map<String, Object>> groups = new java.util.HashMap<String, Map<String, Object>>()');
        expect(out).toContain('Map<String, Object> group = ');
        expect(out).not.toContain('Helpers.GetValue(group, "items")');
        expect(out).not.toContain('Helpers.GetValue(groups, key)');
        expect(out).not.toContain(')groups)');
    });

    test('a container written with a non-literal value keeps the box', () => {
        const out = run(group("{ 'items': [] }", "        groups['x'] = rows[0];\n"));
        expect(out).not.toContain('Map<String, Map<String, Object>> groups');
        expect(out).toContain('Helpers.GetValue(group, "items")');
    });

    test('a row read without the seeding guard (may be null) keeps the box', () => {
        const out = run(
            "    pick (keys: string[]): any {\n" +
            "        const groups: Dict = {};\n" +
            "        groups['a'] = { 'items': [] };\n" +
            "        const key = keys[0];\n" +
            "        const group = groups[key];\n" +
            "        if (group === undefined) {\n" +
            "            return undefined;\n" +
            "        }\n" +
            "        return group['items'];\n" +
            "    }\n");
        expect(out).toContain('Helpers.GetValue(group, "items")');
    });

    test('a container handed to a field keeps the box', () => {
        const out = run(group("{ 'items': [] }", "        this['last'] = groups;\n"));
        expect(out).not.toContain('Map<String, Map<String, Object>> groups');
    });
});
