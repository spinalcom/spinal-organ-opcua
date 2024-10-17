"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoveringStore = void 0;
const fs = require("fs");
const path = require("path");
class DiscoveringStore {
    constructor() {
        this.discoveringFolder = path.resolve(__dirname + '../../discovering');
    }
    static getInstance() {
        if (!this._instance) {
            this._instance = new DiscoveringStore();
        }
        return this._instance;
    }
    _createOrGetDiscoverFolder() {
        try {
            if (!fs.existsSync(this.discoveringFolder))
                fs.mkdirSync(this.discoveringFolder);
        }
        catch (error) {
            console.error('Error creating discovering folder', error);
        }
    }
}
const discoveringStore = DiscoveringStore.getInstance();
exports.discoveringStore = discoveringStore;
exports.default = discoveringStore;
//# sourceMappingURL=discoveringProcessStore.js.map