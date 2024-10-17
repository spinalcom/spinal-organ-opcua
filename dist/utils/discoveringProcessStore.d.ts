declare class DiscoveringStore {
    private static _instance;
    private discoveringFolder;
    private constructor();
    static getInstance(): DiscoveringStore;
    save: any;
    private _createOrGetDiscoverFolder;
}
declare const discoveringStore: DiscoveringStore;
export default discoveringStore;
export { discoveringStore };
