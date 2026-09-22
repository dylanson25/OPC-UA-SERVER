import path from 'node:path';
import { OPCUACertificateManager } from 'node-opcua-certificate-manager';
import type { ServerOptions } from '../types/server.ts';
import * as dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT ? parseInt(process.env.PORT) : 4840;
const resourcePath = process.env.RESOURCEPATH || '/UA/';
const hostname = process.env.HOSTNAME || '127.0.0.1';
const productName = process.env.PRODUCTNAME || 'OPCUA-Server';

// Extra NodeSet2 XML files to import on top of the standard UA nodeset — comma-separated
// paths, e.g. `NODESET_FILES=./nodeset.xml,./other.xml`. See `start --nodeset-file`
// (cli/commands/start.ts), which sets this same env var, and how it's consumed in
// opcua-server-manager.ts.
const nodesetFiles = (process.env.NODESET_FILES || '')
  .split(',')
  .map((p) => p.trim())
  .filter((p) => p.length > 0);

// A PKI store rooted in a project-relative `certs/` folder (self-initializing its own
// own/certs, own/private, trusted, rejected, issuers subfolders — see
// OPCUACertificateManager) rather than node-opcua's own default, which otherwise lives
// under the OS user profile (e.g. %APPDATA%/node-opcua-default-nodejs on Windows).
// That default is invisible/hard to find, and — inside a container — lost on every
// restart unless separately volume-mounted. `certs/` is predictable and easy to
// persist/mount, matching the `devices/` volume-mount convention (see README).
//
// `rootFolder` *is* the PKI root as-is (unlike getDefaultCertificateManager("PKI"),
// there's no `<rootFolder>/<name>` joining here) — pass the full `certs/` path directly.
const serverCertificateManager = new OPCUACertificateManager({
  rootFolder: path.join(process.cwd(), 'certs'),
});

// Deriving certificateFile/privateKeyFile from serverCertificateManager's own rootDir
// (rather than inventing our own separate `certs/certificate.pem` path) matters: the
// manager's own self-signed-certificate generation always signs with (and only ever
// writes) its own `<rootDir>/own/private/private_key.pem` — pointing privateKeyFile
// anywhere else would leave the generated certificate without a matching key file for
// the secure channel to actually load. Set CERTIFICATE_FILE/PRIVATE_KEY_FILE to use a
// certificate you already have (from your own CA/IT) instead of an auto-generated one —
// node-opcua only ever generates a new one when the configured path doesn't already exist.
const certificateFile =
  process.env.CERTIFICATE_FILE || path.join(serverCertificateManager.rootDir, 'own', 'certs', 'certificate.pem');
const privateKeyFile = process.env.PRIVATE_KEY_FILE || serverCertificateManager.privateKey;

export const serverOptions: ServerOptions = {
  port: port,
  resourcePath: resourcePath,
  hostname: hostname,
  certificateFile,
  privateKeyFile,
  serverCertificateManager,
  nodesetFiles,
  buildInfo: {
    productName: productName,
    buildNumber: '7658',
    buildDate: new Date(2026, 5, 2),
  },
};
