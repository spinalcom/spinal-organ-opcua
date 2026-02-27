"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noSubscriptionError = exports.noSessionError = exports.NAMES_TO_IGNORE = void 0;
exports.NAMES_TO_IGNORE = [
    "server",
    "locations",
    "aliases",
    // "deviceset",
    "networkset",
    "devicetopology",
];
exports.noSessionError = new Error("No session available, please connect first");
exports.noSubscriptionError = new Error("No subscription available, please connect first");
//# sourceMappingURL=constants.js.map