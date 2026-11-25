import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
const rs = (body: string) => transpiler.transpileRust (`class T {\n    parseX (x) { return x; }\n    keep (x) { return x; }\n    f (flag, a) {\n${body}\n    }\n}`).content;

// a bare local inserted into a typed map at its last use moves (no clone)
describe ('h52r45: a last-use local inserted into a typed map', () => {
    test ('the insert takes the local without a clone', () => {
        const out = rs ("        const id = this.keep (a);\n        const request = { 'type': 'limit' };\n        request['orderId'] = id;\n        return this.parseX (request);");
        expect (out).toContain ('request.insert("orderId".into(), id)');
        expect (out).not.toContain ('id.clone()');
    });
    test ('each arm of an if / else moves the local', () => {
        const out = rs ("        const id = this.keep (a);\n        const request = { 'type': 'limit' };\n        if (flag) {\n            request['rfqId'] = id;\n        } else {\n            request['orderId'] = id;\n        }\n        return this.parseX (request);");
        expect (out).toContain ('request.insert("rfqId".into(), id)');
        expect (out).toContain ('request.insert("orderId".into(), id)');
    });
    test ('negative: a local read again later keeps the clone', () => {
        const out = rs ("        const id = this.keep (a);\n        const request = { 'type': 'limit' };\n        request['orderId'] = id;\n        this.keep (request);\n        return this.parseX (id);");
        expect (out).toContain ('request.insert("orderId".into(), id.clone())');
    });
    test ('negative: an insert inside a loop keeps the clone', () => {
        const out = rs ("        const id = this.keep (a);\n        const request = { 'type': 'limit' };\n        for (let i = 0; i < 3; i++) {\n            request['orderId'] = id;\n        }\n        return this.parseX (request);");
        expect (out).toContain ('request.insert("orderId".into(), id.clone())');
    });
});
