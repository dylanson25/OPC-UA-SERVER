import fs from 'node:fs';

import { exploreCertificateInfo } from 'node-opcua-crypto';

type CertificateSubject = ReturnType<typeof exploreCertificateInfo>['subject'];

export interface CertificateSummary {
    path: string;
    subject: string;
    notBefore: Date;
    notAfter: Date;
}

/**
 * Reads and parses the server's own OPC UA certificate — shared by `opcua-server cert`
 * and the startup log (OPCUAServerManager.start()) so both report exactly the same
 * data. Returns `null` rather than throwing when the file doesn't exist yet (a brand
 * new deployment before its first `start`); a malformed/unreadable file still throws,
 * since that's a real problem worth surfacing rather than silently hiding.
 */
export function readCertificateSummary(certificateFile: string): CertificateSummary | null {
    if (!fs.existsSync(certificateFile)) return null;

    const pem = fs.readFileSync(certificateFile, 'utf8');
    const info = exploreCertificateInfo(pem);

    return {
        path: certificateFile,
        subject: formatCertificateSubject(info.subject),
        notBefore: info.notBefore,
        notAfter: info.notAfter,
    };
}

export function formatCertificateSubject(subject: CertificateSubject): string {
    const parts = [
        subject.commonName && `CN=${subject.commonName}`,
        subject.organizationName && `O=${subject.organizationName}`,
        subject.organizationUnitName && `OU=${subject.organizationUnitName}`,
        subject.localityName && `L=${subject.localityName}`,
        subject.stateOrProvinceName && `ST=${subject.stateOrProvinceName}`,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : '(unknown)';
}
