export interface ServerBuildInfo {
  productName: string;
  buildNumber: string;
  buildDate: Date;
}

export interface ServerOptions {
  port: number;
  resourcePath: string;
  hostname: string;
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
}
