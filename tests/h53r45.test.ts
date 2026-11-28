import { Transpiler } from '../src/transpiler';

const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
const rs = (body: string) => transpiler.transpileRust (`class T {\n    parseX (x) { return x; }\n    keep (x) { return x; }\n    f (flag, a) {\n${body}\n    }\n}`).content;

// a parameter inserted into a typed map at its last use moves (no clone)
describe ('h53r45: a last-use parameter inserted into a typed map', () => {
    test ('the insert takes the parameter without a clone', () => {
        const out = rs ("        const request = { 'type': 'limit' };\n        request['orderId'] = a;\n        return this.parseX (request);");
        expect (out).toContain ('request.insert("orderId".into(), a)');
        expect (out).not.toContain ('a.clone()');
    });
    test ('each arm of an if / else moves the parameter', () => {
        const out = rs ("        const request = { 'type': 'limit' };\n        if (flag) {\n            request['rfqId'] = a;\n        } else {\n            request['orderId'] = a;\n        }\n        return this.parseX (request);");
        expect (out).toContain ('request.insert("rfqId".into(), a)');
        expect (out).toContain ('request.insert("orderId".into(), a)');
    });
    test ('negative: a parameter read again later keeps the clone', () => {
        const out = rs ("        const request = { 'type': 'limit' };\n        request['orderId'] = a;\n        this.keep (request);\n        return this.parseX (a);");
        expect (out).toContain ('request.insert("orderId".into(), a.clone())');
    });
    test ('negative: an insert inside a loop keeps the clone', () => {
        const out = rs ("        const request = { 'type': 'limit' };\n        for (let i = 0; i < 3; i++) {\n            request['orderId'] = a;\n        }\n        return this.parseX (request);");
        expect (out).toContain ('request.insert("orderId".into(), a.clone())');
    });
});
