import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

const newJavaTranspiler = (): Transpiler => new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });

describe('java: === / !== on a ws Client operand prints the reference compare', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-ws-client-identity');
    const CLIENT_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'ws', 'Client.ts');
    const BASE_FIXTURE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE_FIXTURE = path.join(TMP, 'ts', 'src', 'pro', 'probe.ts');
    let out: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(CLIENT_FIXTURE), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE_FIXTURE), { recursive: true });
        fs.writeFileSync(CLIENT_FIXTURE,
            "export default class Client {\n" +
            "    url: string = '';\n" +
            "}\n");
        fs.writeFileSync(BASE_FIXTURE,
            "export default class Exchange {\n" +
            "    clients: { [key: string]: any } = {};\n" +
            "    safeValue (obj: any, key: any, defaultValue: any = undefined): any { return defaultValue; }\n" +
            "}\n");
        fs.writeFileSync(VENUE_FIXTURE,
            "import Exchange from '../base/Exchange';\n" +
            "import Client from '../base/ws/Client';\n" +
            "class NotAClient {\n" +
            "    url: string = '';\n" +
            "}\n" +
            "class Probe extends Exchange {\n" +
            "    stale (client: Client) {\n" +
            "        const current = this.safeValue (this.clients, client.url);\n" +
            "        if (current !== client) {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        if (client === current) {\n" +
            "            return 2;\n" +
            "        }\n" +
            "        return 3;\n" +
            "    }\n" +
            "    other (a: NotAClient, b: any) {\n" +
            "        if (b !== a) {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        return 2;\n" +
            "    }\n" +
            "    loose (a: any, b: any) {\n" +
            "        if (a !== b) {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        return 2;\n" +
            "    }\n" +
            "    maybe (a: Client | undefined, b: any) {\n" +
            "        if (a !== b) {\n" +
            "            return 1;\n" +
            "        }\n" +
            "        return 2;\n" +
            "    }\n" +
            "}\n");
        out = newJavaTranspiler().transpileJavaByPath(VENUE_FIXTURE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    test('a Client operand compares by reference, negated and not', () => {
        expect(out).toContain('(current != client)');
        expect(out).toContain('(client == current)');
        expect(out).not.toContain('Helpers.isEqual(current, client)');
    });

    test('a class that is not the ws Client, an any pair and a nullable union keep the helper', () => {
        expect(out).toContain('Helpers.isEqual(b, a)');
        expect(out).toContain('Helpers.isEqual(a, b)');
        expect(out.split('Helpers.isEqual(a, b)').length).toBe(3);
    });
});
