/// <reference types="node" />
/// <reference types="zen-obserables" />

/**
 * Config class definition
 */
declare class Config<T> extends event {
    // Constructor
    constructor(configFilePath: string, options?: Config.ConstructorOptions);

    // Properties
    public configFile: string;
    public schemaFile: string;
    public createOnNoEntry: boolean;
    public writeOnSet: boolean;
    public autoReload: boolean;
    public autoReloadActivated: boolean;
    public reloadDelay: number;
    public configHasBeenRead: boolean;
    public subscriptionObservers: Array<Array<string, ZenObservable.SubscriptionObserver<any>>>;
    public payload: T;
    public defaultSchema: object;

    // Static properties
    static DEFAULTSchema: object;

    // Methods
    public read(defaultPayload?: T): Promise<this>;
    public setupAutoReload(): void;
    public get<H>(fieldPath: string): H;
    public set<H>(fieldPath: string, fieldValue: H): void;
    public observableOf(fieldPath: string): ZenObservable.ObservableLike;
    public writeOnDisk(): Promise<void>;
    public close(): Promise<void>;
}

/**
 * Config namespace
 */
declare namespace Config {

    // Constructor interface
    interface ConstructorOptions {
        createOnNoEntry?: boolean;
        writeOnSet?: boolean;
        autoReload?: boolean;
        reloadDelay?: number;
        defaultSchema?: object;
    }

}

export as namespace Config;
export = Config;
