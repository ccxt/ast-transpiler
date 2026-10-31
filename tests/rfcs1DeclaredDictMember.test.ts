import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const config: any = { 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'INFER_ARG_TYPE': true, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } };

const source =
    "class Client {\n" +
    "    futures: Dictionary<any>;\n" +
    "    subscriptions: Dictionary<any>;\n" +
    "}\n" +
    "class Exchange {\n" +
    "    f (client: Client, messageHash: string, other: any) {\n" +
    "        const a = client.futures[messageHash];\n" +
    "        const b = this.safeValue (client.subscriptions, messageHash);\n" +
    "        const c = client.subscriptions['authenticated'];\n" +
    "        const d = client.subscriptions[other];\n" +
    "        const e = this.safeValue (client.subscriptions, messageHash, {});\n" +
    "        client.subscriptions[messageHash] = 1;\n" +
    "    }\n" +
    "}";

const printer = (hook: boolean): string => {
    const transpiler: any = new Transpiler(config);
    if (hook) {
        // the consumer hook: members declared by `Client` answer, everything else does not
        transpiler.csharpTranspiler.csharpDeclaredDictMember = (node: any) => {
            const getters: any = { 'futures': 'getFuture', 'subscriptions': 'getSubscription' };
            return getters[node.name.text] ? { getter: getters[node.name.text] } : undefined;
        };
    }
    return transpiler.transpileCSharp(source).content;
};

describe('RF-cs-1 c03: declared dictionary member reads', () => {
    test('without the consumer hook the helper emission is unchanged', () => {
        const out = printer(false);
        expect(out).toContain('getValue(client.futures, messageHash)');
        expect(out).toContain('callDynamically(this, "safeValue", new object[] { client.subscriptions, messageHash })');
    });

    test('a member read through a string key prints the key-tested indexer', () => {
        const out = printer(true);
        expect(out).toContain('object a = (client.futures != null && messageHash != null && client.futures.ContainsKey(messageHash) ? client.futures[messageHash] : null);');
        expect(out).toContain('object c = (client.subscriptions != null && client.subscriptions.ContainsKey("authenticated") ? client.subscriptions["authenticated"] : null);');
    });

    test('safeValue on the member prints the typed accessor', () => {
        expect(printer(true)).toContain('object b = client.getSubscription(messageHash);');
    });

    test('a non-string key, a safeValue default and a write keep the helper', () => {
        const out = printer(true);
        expect(out).toContain('getValue(client.subscriptions, other)');
        expect(out).toContain('"safeValue", new object[] { client.subscriptions, messageHash');
        expect(out).not.toContain('ContainsKey(other)');
    });
});
