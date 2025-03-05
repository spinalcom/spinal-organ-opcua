import envPaths from "env-paths";
import { makeApplicationUrn } from "node-opcua-client";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const paths = envPaths("spinal-organ-opcua");

async function makeCertificate() {
	const configFolder = paths.config;

	const pkiFolder = path.join(configFolder, "pki");
	const certificateManager = new OPCUACertificateManager({
		rootFolder: pkiFolder,
	});

	// console.log("PKI Folder = ", pkiFolder);

	const clientCertificateManager = new OPCUACertificateManager({
		rootFolder: pkiFolder,
		automaticallyAcceptUnknownCertificate: true,
		name: "pki",
	});

	await clientCertificateManager.initialize();

	const certificateFile = path.join(pkiFolder, "own/certs/spinal-organ-opcua_certificate.pem");
	const privateKeyFile = clientCertificateManager.privateKey;
	if (!fs.existsSync(privateKeyFile)) {
		throw new Error("Cannot find privateKeyFile " + privateKeyFile);
	}

	const applicationName = "spinal-organ-opcua";
	const applicationUri = makeApplicationUrn(os.hostname(), applicationName);

	if (!fs.existsSync(certificateFile)) {
		await certificateManager.createSelfSignedCertificate({
			applicationUri,
			outputFile: certificateFile,
			subject: `/CN=${applicationName}/O=Sterfive;/L=France`,
			dns: [],
			// address: [],
			startDate: new Date(),
			validity: 365 * 10,
		});
	}

	return { certificateFile, clientCertificateManager, applicationName, applicationUri };
}

export default makeCertificate();
