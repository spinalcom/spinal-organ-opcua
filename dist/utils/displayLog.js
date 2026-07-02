"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spinalLog = void 0;
const console_1 = require("console");
class SpinalLog extends console_1.Console {
    constructor() {
        super(process.stdout, process.stderr);
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new SpinalLog();
        }
        return this.instance;
    }
}
const spinalLog = SpinalLog.getInstance();
exports.spinalLog = spinalLog;
exports.default = spinalLog;
//# sourceMappingURL=displayLog.js.map