// ccxt's Go printer hooks, moved from ccxt build/ (hx11 ast-move). `installCcxtGoHooks` installs them in the order
// build/go-worker.ts and build/goTranspiler.ts used (local types, indexable types, parameter types, dict params,
// GB05 frame params, GB11 handleErrors code, sign typing), so the printed Go is unchanged.
import { installCcxtGoLocalTypes, installCcxtGoIndexableTypes } from './go-local-types.js';
import { installCcxtGoParamTypes } from './hx10w3-G08.js';
import { installCcxtGoDictParams } from './hx10w8-GB01.js';
import { installCcxtGoGb05ParamTypes } from './hx10w8-GB05.js';
import { installCcxtGoGb11HandleErrorsCode } from './hx10w9-GB11.js';
import { installCcxtGoSignTyping } from './hx11-sign-typing.js';
import { installHx11w8NumParams } from './hx11w8-num-param.js';
import { installRfGo5OwnedTables } from './hx11rf-go5.js';
import { installFmGo5G01 } from './hx11fmgo5-G01.js';
import { installFmGo5OG02 } from './hx11fmgo5-OG02.js';
import { installFmGo5GP08 } from './hx11fmgo5-GP08.js';
import { installFmGo5G04 } from './hx11fmgo5-G04.js';

export function installCcxtGoHooks (goTranspiler: any, unifiedInt64Params?: any): void {
    installCcxtGoLocalTypes (goTranspiler, unifiedInt64Params);
    installCcxtGoIndexableTypes (goTranspiler);
    installCcxtGoParamTypes (goTranspiler);
    installCcxtGoDictParams (goTranspiler);
    installCcxtGoGb05ParamTypes (goTranspiler);
    installCcxtGoGb11HandleErrorsCode (goTranspiler);
    installCcxtGoSignTyping (goTranspiler);
    installHx11w8NumParams (goTranspiler);
    installRfGo5OwnedTables (goTranspiler);
    installFmGo5G01 (goTranspiler);
    installFmGo5OG02 (goTranspiler);
    installFmGo5GP08 (goTranspiler);
    installFmGo5G04 (goTranspiler);
}

export {
    installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams,
    installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installHx11w8NumParams, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installFmGo5GP08, installFmGo5OG02,
};
export { CCXT_GO_HELPER_RETURN_TYPES, CCXT_GO_BOOL_METHOD_NAMES, CCXT_GO_STRING_PTR_METHOD_NAMES } from './go-local-types.js';
export { hx10G06Check } from './hx10w3-G06.js';
export { g08w3Check } from './hx10w3-G08.js';
export { hx10w8GB01Check } from './hx10w8-GB01.js';
export { hx10w8GB05Check } from './hx10w8-GB05.js';
export { hx10w9GB11Check } from './hx10w9-GB11.js';
