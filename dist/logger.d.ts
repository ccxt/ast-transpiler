declare class Logger {
    static verbose: boolean;
    static setVerboseMode(verbose: boolean): void;
    static log(message: string): void;
    static success(message: string): void;
    static warning(message: string): void;
    static error(message: string): void;
}
export { Logger };
