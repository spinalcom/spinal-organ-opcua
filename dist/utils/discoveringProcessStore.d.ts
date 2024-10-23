declare class DiscoveringStore {
    private static _instance;
    private discoveringFolder;
    private constructor();
    static getInstance(): DiscoveringStore;
    saveProgress(url: string, tree: any, queue: any, state: any): void;
    getProgress(url: string): any;
    deleteProgress(url: string): void;
    wiriteInFile(url: string, data: string): void;
    private _createDirectoryIfNotExist;
    private _createFilePath;
}
declare const discoveringStore: DiscoveringStore;
export default discoveringStore;
export { discoveringStore };
