export interface Dict { [key: string]: any }
export interface BalanceAccount { free: string | undefined, used: string | undefined, total: string | undefined }
export default class Exchange {
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
