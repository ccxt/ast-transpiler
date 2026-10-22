export interface Dict { [key: string]: any }
export type Bool = boolean | undefined;
const omit = (x: Dict | undefined, ...args: any) => x;
const extend = (...args: any[]) => Object.assign ({}, ...args);
export default class Exchange {
    options: Dict = {};
    omit = omit;
    extend = extend;
    safeValue (d: any, k: any, dflt: any = undefined): any {
        return d === undefined ? dflt : d[k];
    }
    safeDict (d: any, k: any, dflt: Dict = undefined): Dict {
        const v = this.safeValue (d, k);
        return (typeof v === 'object') ? v : dflt;
    }
    safeBool (d: any, k: any, dflt: Bool = undefined): Bool {
        const v = this.safeValue (d, k);
        return (typeof v === 'boolean') ? v : dflt;
    }
    checkOptionBool (methodName: string, optionName: string, value: any): Bool {
        if (value === undefined) {
            return undefined;
        }
        return value === true;
    }
    handleOptionBoolAndParams (params: Dict, methodName: string, optionName: string, defaultValue: Bool = undefined): [Bool, Dict] {
        const value = this.safeValue (params, optionName, defaultValue);
        return [ this.checkOptionBool (methodName, optionName, value), params ];
    }
    handleTriggerAndParams (params: any): any[] {
        const isTrigger = this.safeBool (params, 'trigger');
        return [ isTrigger, params ];
    }
    handleOptionAndParams (params: Dict, methodName: string, optionName: string, defaultValue: any = undefined): [any, Dict] {
        return [ this.safeValue (params, optionName, defaultValue), params ];
    }
}
