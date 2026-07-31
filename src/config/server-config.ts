import type { ServerOptions } from '../types/server.ts';
import * as dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT ? parseInt(process.env.PORT) : 4840;
const resourcePath = process.env.RESOURCEPATH || '/UA/';
const hostname = process.env.HOSTNAME || '127.0.0.1';
const productName = process.env.PRODUCTNAME || 'OPCUA-Server';

export const serverOptions: ServerOptions = {
  port: port,
  resourcePath: resourcePath,
  hostname: hostname,
  buildInfo: {
    productName: productName,
    buildNumber: '7658',
    buildDate: new Date(2026, 5, 2),
  },
};
