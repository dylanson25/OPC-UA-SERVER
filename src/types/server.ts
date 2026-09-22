import type { OPCUACertificateManager } from 'node-opcua-certificate-manager';

export interface ServerBuildInfo {
  productName: string;
  buildNumber: string;
  buildDate: Date;
}

export interface ServerOptions {
  port: number;
  resourcePath: string;
  hostname: string;
  /** Where the server's own OPC UA identity cert/key live — see server-config.ts. */
  certificateFile: string;
  privateKeyFile: string;
  /** PKI store (trust/reject/issuers + own cert/key) rooted in the project's certs/ folder. */
  serverCertificateManager: OPCUACertificateManager;
  buildInfo: ServerBuildInfo;
  /**
   * Extra NodeSet2 XML files to import alongside the standard UA nodeset — e.g. a file
   * exported by `export-nodeset` or produced by UaModeler. See NODESET_FILES /
   * `start --nodeset-file` in server-config.ts / cli/commands/start.ts.
   */
  nodesetFiles: string[];
}

export interface SessionLike {
  channel?: {
    remoteAddress?: string;
    remotePort?: number;
  };
  _secureChannel?: {
    remoteAddress?: string;
    remotePort?: number;
  };
  session?: {
    channel?: {
      remoteAddress?: string;
      remotePort?: number;
    };
  };
  sessionName?: string;
  sessionId?: string | number;
  clientDescription?: {
    applicationName?: { text?: string };
  };
  creationDate?: Date;
}
