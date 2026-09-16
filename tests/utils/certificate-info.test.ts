import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockedExistsSync = vi.hoisted(() => vi.fn());
const mockedReadFileSync = vi.hoisted(() => vi.fn());
const mockedExploreCertificateInfo = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
    default: {
        existsSync: mockedExistsSync,
        readFileSync: mockedReadFileSync,
    },
    existsSync: mockedExistsSync,
    readFileSync: mockedReadFileSync,
}));

vi.mock('node-opcua-crypto', () => ({
    exploreCertificateInfo: mockedExploreCertificateInfo,
}));

import { readCertificateSummary, formatCertificateSubject } from '../../src/utils/certificate-info.ts';

beforeEach(() => {
    mockedExistsSync.mockReset();
    mockedReadFileSync.mockReset();
    mockedExploreCertificateInfo.mockReset();
});

describe('readCertificateSummary', () => {
    it('returns null when the certificate file does not exist', () => {
        mockedExistsSync.mockReturnValue(false);

        expect(readCertificateSummary('Z:\\certs\\certificate.pem')).toBeNull();
        expect(mockedReadFileSync).not.toHaveBeenCalled();
    });

    it('reads, parses, and summarizes an existing certificate', () => {
        mockedExistsSync.mockReturnValue(true);
        mockedReadFileSync.mockReturnValue('-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n');
        mockedExploreCertificateInfo.mockReturnValue({
            subject: { commonName: 'NodeOPCUA@MYHOST', organizationName: 'Sterfive' },
            notBefore: new Date('2026-04-15T00:00:00.000Z'),
            notAfter: new Date('2036-04-12T00:00:00.000Z'),
        });

        const summary = readCertificateSummary('Z:\\certs\\certificate.pem');

        expect(mockedReadFileSync).toHaveBeenCalledWith('Z:\\certs\\certificate.pem', 'utf8');
        expect(summary).toEqual({
            path: 'Z:\\certs\\certificate.pem',
            subject: 'CN=NodeOPCUA@MYHOST, O=Sterfive',
            notBefore: new Date('2026-04-15T00:00:00.000Z'),
            notAfter: new Date('2036-04-12T00:00:00.000Z'),
        });
    });

    it('propagates a parse failure rather than silently returning null', () => {
        mockedExistsSync.mockReturnValue(true);
        mockedReadFileSync.mockReturnValue('not a real cert');
        mockedExploreCertificateInfo.mockImplementation(() => {
            throw new Error('malformed certificate');
        });

        expect(() => readCertificateSummary('Z:\\certs\\certificate.pem')).toThrow('malformed certificate');
    });
});

describe('formatCertificateSubject', () => {
    it('formats every recognized field in a fixed order', () => {
        const result = formatCertificateSubject({
            commonName: 'NodeOPCUA@MYHOST',
            organizationName: 'Sterfive',
            organizationUnitName: 'R&D',
            localityName: 'Orleans',
            stateOrProvinceName: 'Centre',
        });

        expect(result).toBe('CN=NodeOPCUA@MYHOST, O=Sterfive, OU=R&D, L=Orleans, ST=Centre');
    });

    it('omits missing fields instead of printing them empty', () => {
        expect(formatCertificateSubject({ commonName: 'X' })).toBe('CN=X');
    });

    it('falls back to "(unknown)" when no field is present', () => {
        expect(formatCertificateSubject({})).toBe('(unknown)');
    });
});
