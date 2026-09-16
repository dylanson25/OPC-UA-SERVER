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
