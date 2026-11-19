export interface Dict { [key: string]: any }
const extend = (...args: any[]) => Object.assign ({}, ...args);
export default class Exchange {
    extend = extend;
    hold (x: any): any { return x; }
}
