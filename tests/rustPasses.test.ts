import * as passes from '../src/rustPasses/index';
import { hx10w2R03SelfTest } from '../src/rustPasses/hx10w2-R03';
import { r04SelfTest } from '../src/rustPasses/hx10w2-R04';
import { r06SelfTest } from '../src/rustPasses/hx10w2-r06';
import { r01SelfTest } from '../src/rustPasses/hx10w3-R01';
import { hx10R03SelfTest } from '../src/rustPasses/hx10w3-R03';
import { r04CalleeSelfTest } from '../src/rustPasses/hx10w3-R04';
import { r06w3SelfTest } from '../src/rustPasses/hx10w3-R06';
import { r07StringSelfTest } from '../src/rustPasses/hx10w3-R07';
import { r10SelfTest } from '../src/rustPasses/hx10w7-R10';
import { r01W2SelfTest } from '../src/rustPasses/hx10w2-R01';
import { rp02SelfTest } from '../src/rustPasses/hx10w9-RP02';

describe('rust final-text passes (moved from ccxt build/)', () => {
    test('every pass is exported from the package entry', () => {
        for (const name of ['nativeGetValue', 'r02NativeInserts', 'hx10w2R03', 'r04Scalars', 'r06Push', 'r01TypedLocals',
            'hx10w3R03', 'r04Callee', 'r05FieldChainInserts', 'r06w3Push', 'r07StringNatives', 'bf03PlainDictChains',
            'r10ClientHandle', 'narrowStrSinkLocals', 'narrowStrNullLocals', 'hx11RustSignApiStr']) {
            expect(typeof (passes as any)[name]).toBe('function');
        }
    });
    const selfTests: { [k: string]: () => string[] | number } = {
        hx10w2R03SelfTest, r04SelfTest, r06SelfTest, r01SelfTest, hx10R03SelfTest, r04CalleeSelfTest, r06w3SelfTest, r07StringSelfTest, r10SelfTest,
    };
    for (const [name, fn] of Object.entries(selfTests)) {
        test(`${name} passes`, () => { expect(fn()).toEqual([]); });
    }
    test('r01W2 and RP02 self-tests pass', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        try { expect(r01W2SelfTest()).toBe(0); expect(rp02SelfTest()).toBe(0); } finally { log.mockRestore(); }
    });
    test('narrowStrSinkLocals types a format!-only safe_string local', () => {
        const src = 'pub fn f(&mut self) -> Value {\n    let mut s: Value = self.safe_string_k(x.clone(), "id", &[]);\n    let t: String = format!("a{}", s);\n    return Value::Null;\n}\n';
        expect(passes.narrowStrSinkLocals(src)).toContain('safe_string_k_opt');
    });
    test('hx11RustSignApiStr is idempotent on unrelated text', () => {
        const src = 'fn f() { let x = 1; }\n';
        expect(passes.hx11RustSignApiStr(src)).toBe(src);
    });
    test('bf03PlainDictChains lowers a Value-ident key on balance/ohlcvs without get_value_mut', () => {
        const src = 'pub fn f(&mut self, symbol: Value) {\n    let mut tf: Value = Value::Null;\n    if let Value::Dict(__r05d) = get_value_mut(&mut self.ohlcvs, &symbol) { std::sync::Arc::make_mut(__r05d).insert(crate::runtime::stringify_param(&tf), tf.clone()); }\n}\n';
        const out = passes.bf03PlainDictChains(src);
        expect(out).not.toContain('get_value_mut');
        expect(out).toContain('.entry(crate::runtime::stringify_param(&symbol)).or_insert(Value::Null)');
        const unknown = src.replace('symbol: Value', 'symbol: &str');
        expect(passes.bf03PlainDictChains(unknown)).toContain('get_value_mut');
    });
});

describe('narrowStrNullLocals inlined __pro_message read', () => {
    const read = (name: string, key: string, dflt = 'Value::Null'): string => 'let mut ' + name + ': Value = (match __pro_message.get("' + key + '").cloned() { Some(Value::Str(__s)) if !__s.is_empty() => Value::Str(__s), '
        + 'Some(Value::Int(__n)) => Value::Str(__n.to_string().into()), Some(Value::Float(__f)) => Value::Str(__f.to_string().into()), _ => ' + dflt + ' });';
    test('narrows an inlined read used by a null test and an as_str compare', () => {
        const src = 'fn f() {\n    ' + read('topic', 'topic') + '\n    if (topic != Value::Null) {\n        let ok = topic.as_str() == Some("a");\n    }\n}\n';
        const out = passes.narrowStrNullLocals(src);
        expect(out).toContain('let mut topic: Option<String> = match __pro_message.get("topic").cloned()');
        expect(out).toContain('topic.is_some()');
        expect(out).toContain('topic.as_deref() == Some("a")');
    });
    test('keeps Value when a use cannot be rewritten', () => {
        const src = 'fn f() {\n    ' + read('topic', 'topic') + '\n    self.go(&mut topic);\n}\n';
        expect(passes.narrowStrNullLocals(src)).toBe(src);
    });
    test('keeps a read with a non-Null default', () => {
        const src = 'fn f() {\n    ' + read('topic', 'topic', 'Value::Str("".into())') + '\n    let a = topic.as_str();\n}\n';
        expect(passes.narrowStrNullLocals(src)).toBe(src);
    });
});

describe('narrowStrNullLocals inlined integer read', () => {
    const intRead = 'let mut pong: Value = (match __pro_message.get("pong").cloned() { Some(Value::Int(__n)) => Value::Int(__n), Some(Value::Float(__f)) => Value::Int(__f as i64), '
        + 'Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<i64>() { Ok(__n) => Value::Int(__n), Err(_) => match __s.parse::<f64>() { Ok(__f) if __f.is_finite() => Value::Int(__f as i64), _ => Value::Null } }, _ => Value::Null });';
    test('narrows to Option<i64> for a null test only', () => {
        const out = passes.narrowStrNullLocals('fn f() {\n    ' + intRead + '\n    if (pong != Value::Null) { return; }\n}\n');
        expect(out).toContain('let mut pong: Option<i64> = match __pro_message.get("pong").cloned()');
        expect(out).toContain('pong.is_some()');
    });
    test('keeps Value when the integer is used otherwise', () => {
        const src = 'fn f() {\n    ' + intRead + '\n    self.go(pong);\n}\n';
        expect(passes.narrowStrNullLocals(src)).toBe(src);
    });
});
