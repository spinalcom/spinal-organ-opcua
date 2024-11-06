import * as fs from 'fs';
import * as path from 'path';

class DiscoveringStore {
    private static _instance: DiscoveringStore;
    private discoveringFolder: string = path.resolve(__dirname + '../../../discover.db');

    private constructor() { }

    static getInstance() {
        if (!this._instance) {
            this._instance = new DiscoveringStore();
        }
        return this._instance;
    }



    saveProgress(url: string, tree: any, queue: any, state: any) {
        const data = JSON.stringify({ url, tree, queue, state });
        // const base64 = Buffer.from(data).toString('base64');
        this.wiriteInFile(url, data);
    }

    getProgress(url: string) {
        const filePath = this._createFilePath(url);
        if (!fs.existsSync(filePath)) return null;

        // const base64 = fs.readFileSync(filePath).toString();
        // const data = Buffer.from(base64, 'base64').toString('utf8');
        const data = fs.readFileSync(filePath).toString();
        return JSON.parse(data);
    }

    deleteProgress(url: string) {
        const filePath = this._createFilePath(url);
        if (!fs.existsSync(filePath)) return;
        fs.unlinkSync(filePath);
    }

    wiriteInFile(url: string, data: string) {
        try {
            this._createDirectoryIfNotExist(this.discoveringFolder);
            const filePath = this._createFilePath(url);
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, data);
                return;
            }

            fs.writeFileSync(filePath, data);
        } catch (error) {
            console.warn('Error writing file', error.message);
        }

    }

    fileExist(url: string) {
        const filePath = this._createFilePath(url);
        return fs.existsSync(filePath);
    }

    private _createDirectoryIfNotExist(path) {
        try {
            if (!fs.existsSync(path)) fs.mkdirSync(this.discoveringFolder);
        } catch (error) {
            console.error('Error creating discovering folder', error);
        }
    }

    private _createFilePath(url: string) {
        return path.resolve(this.discoveringFolder, url.replace(/[^a-zA-Z0-9]/g, '_') + '.db');
    }
}


const discoveringStore = DiscoveringStore.getInstance();

export default discoveringStore;

export { discoveringStore };