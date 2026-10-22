export interface Dict { [key: string]: any }
const omit = (x: Dict | undefined, ...args: any) => x;
export default class Exchange {
    omit = omit;
    options: Dict = {};
    handleOptionBoolAndParams (params: Dict, methodName: string, optionName: string, defaultValue: boolean = undefined): [boolean, Dict] {
        return [ defaultValue, this.omit (params, optionName) ];
    }
    handleMarketTypeAndParams (methodName: string, market: Dict = undefined, params: Dict = {}, defaultValue: string = undefined): [string, Dict] {
        return [ defaultValue, params ];
    }
    handleOther (params: Dict): [boolean, Dict] {
        return [ true, params ];
    }
}
