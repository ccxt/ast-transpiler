// Rust final-text passes that ccxt's build script runs over the generated Rust after its own
// post-passes. They are pure `string -> string` functions (hx10 waves 2-9, hx11): the build script
// owns the ORDER (it interleaves them with its own passes); the logic lives here.
export { nativeGetValue } from './hx10w2-R01.js';
export { r02NativeInserts } from './hx10w2-R02.js';
export { hx10w2R03 } from './hx10w2-R03.js';
export { r04Scalars } from './hx10w2-R04.js';
export { r06Push } from './hx10w2-r06.js';
export { r01TypedLocals } from './hx10w3-R01.js';
export { hx10w3R03 } from './hx10w3-R03.js';
export { r04Callee } from './hx10w3-R04.js';
export { r05FieldChainInserts } from './hx10w3-R05.js';
export { r06w3Push } from './hx10w3-R06.js';
export { r07StringNatives } from './hx10w3-R07.js';
export { bf03PlainDictChains } from './hx10w4-BF03.js';
export { r10ClientHandle } from './hx10w7-R10.js';
export { hx10w9Rp02ParamKind, hx10w9Rp02DispatchArg, hx10w9Rp02SplitArgs, hx10w9Rp02RefMapParamNames } from './hx10w9-RP02.js';
export { narrowStrSinkLocals, narrowStrNullLocals } from './hx11-narrow-str.js';
export { hx11RustSignApiStr } from './hx11-sign-api.js';
export { hx11w9RustIntLocalNullSinkOptionI64 } from './hx11w9RustIntLocalNullSinkOptionI64.js';
export { hx11w9RustStrLiteralLocalNativeString } from './hx11w9RustStrLiteralLocalNativeString.js';
export { hx11w9StrLocalReassign } from './hx11w9-str-local-reassign.js';
export { hx11w9RustBoolKLocalOptionBool } from './hx11w9-rust-bool-k-local-option-bool.js';
export { hx11w9RustBool2LocalOptionBool } from './hx11w9RustBool2LocalOptionBool.js';
export { hx11w9RustBoolNLocalOptionBool } from './hx11w9RustBoolNLocalOptionBool.js';
export { hx11w9RustStr2LocalOptionString } from './hx11w9RustStr2LocalOptionString.js';
export { hx11w9RustNumber2LocalOptionF64 } from './hx11w9RustNumber2LocalOptionF64.js';
export { hx11w9RustInt2IntNLocalOptionI64 } from './hx11w9RustInt2IntNLocalOptionI64.js';
export { hx11w9RustStrNLocalOptionString } from './hx11w9RustStrNLocalOptionString.js';
export { hx11w9RustNumber2SinkLocalOptionF64R2 } from './hx11w9RustNumber2SinkLocalOptionF64R2.js';
