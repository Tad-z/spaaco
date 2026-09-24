import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createServerLifecycle } from '../../src/core/lifecycle.js';

/**
 * Graceful shutdown.
 *
 * The behaviour that matters in a container: on SIGTERM the platform stops
 * routing new traffic, but requests already in flight are still being served.
 * A server that closed its sockets immediately would cut off an editor
 * mid-save and an applicant mid-upload, and neither would know whether it
 * worked. So each test holds a request open across the signal.
 *
 * `fetch` rather than supertest, because these tests need a real socket held
 * open against a real listening server, which is the one thing supertest's
 * ephemeral-server mode takes away.
 */

let running: Server | undefined;

afterEach(async () => {
  if (running?.listening === true) {
    running.close();
    await once(running, 'close');
  }
  running = undefined;
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A server with one route that answers only when told to. */
async function listen(): Promise<{ server: Server; url: string; release: () => void }> {
  let release: (() => void) | undefined;
  const app = express();

  app.get('/slow', (_req, res) => {
    release = () => {
      res.json({ finished: true });
    };
  });
  app.get('/fast', (_req, res) => {
    res.json({ ok: true });
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  running = server;

  const { port } = server.address() as AddressInfo;

  return {
    server,
    url: `http://127.0.0.1:${String(port)}`,
    release: () => {
      release?.();
    },
  };
}

describe('shutting down', () => {
  it('lets an in-flight request finish', async () => {
    const { server, url, release } = await listen();

    const lifecycle = createServerLifecycle(server, {
      onClose: () => Promise.resolve(),
      exit: () => undefined,
    });

    const inFlight = fetch(`${url}/slow`);
    // Long enough for the request to reach the handler before the signal.
    await sleep(50);

    lifecycle.shutdown('SIGTERM');

    // The socket is still open and the handler still owns the response.
    release();
    const res = await inFlight;

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ finished: true });
  });

  it('stops accepting new connections once the signal arrives', async () => {
    const { server, url, release } = await listen();

    const lifecycle = createServerLifecycle(server, {
      onClose: () => Promise.resolve(),
      exit: () => undefined,
    });

    const inFlight = fetch(`${url}/slow`);
    await sleep(50);

    lifecycle.shutdown('SIGTERM');
    await sleep(20);

    // A platform that has not yet stopped routing must not get new work in.
    await expect(fetch(`${url}/fast`)).rejects.toThrow();

    release();
    await inFlight;
  });

  it('closes the database only after the server has drained, then exits', async () => {
    const { server, url, release } = await listen();

    const order: string[] = [];
    const lifecycle = createServerLifecycle(server, {
      onClose: () => {
        order.push('database closed');
        return Promise.resolve();
      },
      exit: (code) => {
        order.push(`exit ${String(code)}`);
      },
    });

    const inFlight = fetch(`${url}/slow`);
    await sleep(50);

    lifecycle.shutdown('SIGTERM');

    // Closing the connection while a handler might still query it is how a
    // restart turns into a page of errors.
    expect(order).toEqual([]);

    release();
    await inFlight;
    await lifecycle.finished;

    expect(order).toEqual(['database closed', 'exit 0']);
  });

  it('ignores a second signal rather than shutting down twice', async () => {
    const { server } = await listen();

    let closes = 0;
    const lifecycle = createServerLifecycle(server, {
      onClose: () => {
        closes += 1;
        return Promise.resolve();
      },
      exit: () => undefined,
    });

    lifecycle.shutdown('SIGTERM');
    lifecycle.shutdown('SIGINT');

    await lifecycle.finished;

    expect(closes).toBe(1);
  });

  it('gives up on a connection that will not drain', async () => {
    const { server, url } = await listen();

    const exits: number[] = [];
    const lifecycle = createServerLifecycle(
      server,
      {
        onClose: () => Promise.resolve(),
        exit: (code) => {
          exits.push(code);
        },
      },
      // A 100 ms deadline, so the test does not wait the real ten seconds.
      100
    );

    // Never released, so this request holds the server open indefinitely.
    void fetch(`${url}/slow`).catch(() => undefined);
    await sleep(50);

    lifecycle.shutdown('SIGTERM');
    await sleep(250);

    // A hung connection must not keep a container alive for ever.
    expect(exits).toContain(1);
  });
});
