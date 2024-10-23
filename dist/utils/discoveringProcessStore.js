"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoveringStore = void 0;
const fs = require("fs");
const path = require("path");
class DiscoveringStore {
    constructor() {
        this.discoveringFolder = path.resolve(__dirname + '../../../discover.db');
    }
    static getInstance() {
        if (!this._instance) {
            this._instance = new DiscoveringStore();
        }
        return this._instance;
    }
    saveProgress(url, tree, queue, state) {
        const data = JSON.stringify({ url, tree, queue, state });
        // const base64 = Buffer.from(data).toString('base64');
        this.wiriteInFile(url, data);
    }
    getProgress(url) {
        const filePath = this._createFilePath(url);
        if (!fs.existsSync(filePath))
            return null;
        // const base64 = fs.readFileSync(filePath).toString();
        // const data = Buffer.from(base64, 'base64').toString('utf8');
        const data = fs.readFileSync(filePath).toString();
        return JSON.parse(data);
    }
    deleteProgress(url) {
        const filePath = this._createFilePath(url);
        if (!fs.existsSync(filePath))
            return;
        fs.unlinkSync(filePath);
    }
    wiriteInFile(url, data) {
        try {
            this._createDirectoryIfNotExist(this.discoveringFolder);
            const filePath = this._createFilePath(url);
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, data);
                return;
            }
            fs.writeFileSync(filePath, data);
        }
        catch (error) {
            console.warn('Error writing file', error.message);
        }
    }
    _createDirectoryIfNotExist(path) {
        try {
            if (!fs.existsSync(path))
                fs.mkdirSync(this.discoveringFolder);
        }
        catch (error) {
            console.error('Error creating discovering folder', error);
        }
    }
    _createFilePath(url) {
        return path.resolve(this.discoveringFolder, url.replace(/[^a-zA-Z0-9]/g, '_') + '.db');
    }
}
const discoveringStore = DiscoveringStore.getInstance();
exports.discoveringStore = discoveringStore;
exports.default = discoveringStore;
//# sourceMappingURL=discoveringProcessStore.js.map