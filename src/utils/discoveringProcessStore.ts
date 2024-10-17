import * as fs from 'fs';
import * as path from 'path';

class DiscoveringStore {
    private static _instance: DiscoveringStore;
    private discoveringFolder: string = path.resolve(__dirname + '../../discovering');

    private constructor() { }

    static getInstance() {
        if (!this._instance) {
            this._instance = new DiscoveringStore();
        }
        return this._instance;
    }


    save




    private _createOrGetDiscoverFolder() {
        try {
            if (!fs.existsSync(this.discoveringFolder)) fs.mkdirSync(this.discoveringFolder);
        } catch (error) {
            console.error('Error creating discovering folder', error);
        }
    }
}


const discoveringStore = DiscoveringStore.getInstance();

export default discoveringStore;

export { discoveringStore };