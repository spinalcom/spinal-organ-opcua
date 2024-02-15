"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const env_paths_1 = require("env-paths");
const node_opcua_client_1 = require("node-opcua-client");
const node_opcua_certificate_manager_1 = require("node-opcua-certificate-manager");
const fs = require("fs");
const path = require("path");
const os = require("os");
const paths = (0, env_paths_1.default)("spinal-organ-opcua");
function makeCertificate() {
    return __awaiter(this, void 0, void 0, function* () {
        const configFolder = paths.config;
        const pkiFolder = path.join(configFolder, "pki");
        const certificateManager = new node_opcua_certificate_manager_1.OPCUACertificateManager({
            rootFolder: pkiFolder,
        });
        console.log("PKI Folder = ", pkiFolder);
        const clientCertificateManager = new node_opcua_certificate_manager_1.OPCUACertificateManager({
            rootFolder: pkiFolder,
            automaticallyAcceptUnknownCertificate: true,
            name: "pki",
        });
        yield clientCertificateManager.initialize();
        const certificateFile = path.join(pkiFolder, "own/certs/spinal-organ-opcua_certificate.pem");
        const privateKeyFile = clientCertificateManager.privateKey;
        if (!fs.existsSync(privateKeyFile)) {
            throw new Error("Cannot find privateKeyFile " + privateKeyFile);
        }
        const applicationName = "spinal-organ-opcua";
        const applicationUri = (0, node_opcua_client_1.makeApplicationUrn)(os.hostname(), applicationName);
        if (!fs.existsSync(certificateFile)) {
            yield certificateManager.createSelfSignedCertificate({
                applicationUri,
                outputFile: certificateFile,
                subject: `/CN=${applicationName}/O=Sterfive;/L=France`,
                dns: [],
                // ip: [],
                startDate: new Date(),
                validity: 365 * 10,
            });
        }
        return { certificateFile, clientCertificateManager, applicationName, applicationUri };
    });
}
exports.default = makeCertificate();
//# sourceMappingURL=make_certificate.js.map