import { connect } from 'node:net';
import { InternalError } from '../../core/errors.js';
import type {
  IVirusScanner,
  ScanVerdict,
} from '../../interfaces/integrations/virus-scan.interface.js';

/**
 * ClamAV over its INSTREAM protocol.
 *
 * Raw TCP rather than a library: INSTREAM is a handful of bytes — `zINSTREAM\0`,
 * then length-prefixed chunks, then a zero-length chunk — and a dependency
 * would add a supply-chain surface to the one component whose whole job is
 * keeping hostile bytes out.
 *
 * A scanner that cannot be reached throws. The caller turns that into a
 * refusal, because storing an unscanned CV would defeat the point of scanning.
 */
const CHUNK_SIZE = 64 * 1024;

export function createClamAvScanner(host: string, port: number, timeoutMs = 30_000): IVirusScanner {
  return {
    name: 'clamav',

    scan(buffer: Buffer): Promise<ScanVerdict> {
      return new Promise<ScanVerdict>((resolve, reject) => {
        const socket = connect({ host, port });
        let reply = '';

        const fail = (message: string): void => {
          socket.destroy();
          reject(new InternalError(message));
        };

        socket.setTimeout(timeoutMs, () => {
          fail('The virus scanner did not respond in time');
        });

        socket.on('error', (error: Error) => {
          fail(`The virus scanner is unreachable: ${error.message}`);
        });

        socket.on('data', (chunk: Buffer) => {
          reply += chunk.toString('utf8');
        });

        socket.on('end', () => {
          // "stream: OK" or "stream: <signature> FOUND".
          if (reply.includes('FOUND')) {
            resolve('infected');
            return;
          }

          if (reply.includes('OK')) {
            resolve('clean');
            return;
          }

          reject(new InternalError(`The virus scanner gave an unexpected reply: ${reply.trim()}`));
        });

        socket.on('connect', () => {
          socket.write('zINSTREAM\0');

          for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
            const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
            const size = Buffer.alloc(4);
            size.writeUInt32BE(chunk.length);

            socket.write(size);
            socket.write(chunk);
          }

          // A zero-length chunk ends the stream and asks for the verdict.
          socket.write(Buffer.alloc(4));
        });
      });
    },
  };
}
