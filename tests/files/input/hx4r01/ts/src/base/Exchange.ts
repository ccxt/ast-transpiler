export interface Dict { [key: string]: any }
export interface BalanceAccount { free: string | undefined, used: string | undefined, total: string | undefined }
const omit = (x: Dict | undefined, ...args: any) => x;
const extend = (...args: any[]) => Object.assign ({}, ...args);
export default class Exchange {
    omit = omit;
    extend = extend;
    account (): BalanceAccount {
        return { 'free': undefined, 'used': undefined, 'total': undefined };
    }
    handleUntilOption (key: string, request: Dict, params: Dict, multiplier: number = 1): [Dict, Dict] {
        return [ request, params ];
    }
    parseOrder (order: Dict): Dict {
        return order;
    }
}
