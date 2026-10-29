import { describe, expect, it } from 'vitest';
import { CoreFailure } from '../core/api';
import { core } from '../core/stub/index';
import { createWorkerClient, type WorkerTransport } from './client';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { routeRequest } from './route';

/** Records posted messages; the test answers them when and how it likes. */
const fakeTransport = () => {
  const posted: { message: WorkerRequest; transfer: Transferable[] }[] = [];
  let deliver: (response: WorkerResponse) => void = () => undefined;
  let fail: (message: string) => void = () => undefined;
  let terminated = false;
  const transport: WorkerTransport = {
    post: (message, transfer) => posted.push({ message, transfer }),
    listen(onMessage, onError) {
      deliver = onMessage;
      fail = onError;
    },
    terminate: () => {
      terminated = true;
    },
  };
  const ofType = (type: WorkerRequest['type']) => posted.filter((p) => p.message.type === type).map((p) => p.message);
  return {
    transport,
    posted,
    ofType,
    /** Answers a posted request with the stub core, as the worker would. */
    answer(message: WorkerRequest) {
      deliver(routeRequest(core, message).response);
    },
    reply: (response: WorkerResponse) => deliver(response),
    crash: (message: string) => fail(message),
    get terminated() {
      return terminated;
    },
  };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const balloonInput = (height: number) => ({
  parameters: { ...core.balloon.defaults, height },
  pattern: core.balloon.pattern.defaults,
  purge: core.balloon.purge.defaults,
});

describe('createWorkerClient', () => {
  it('starts the worker with init', async () => {
    const fake = fakeTransport();
    const client = createWorkerClient('preview', { transport: fake.transport });
    const [init] = fake.ofType('init');
    fake.answer(init!);
    await expect(client.ready).resolves.toEqual({ implementation: 'stub' });
  });

  it('coalesces previews per part: three quick requests post two', async () => {
    const fake = fakeTransport();
    const client = createWorkerClient('preview', { transport: fake.transport });
    const first = client.preview('balloon', balloonInput(200));
    const second = client.preview('balloon', balloonInput(210));
    const third = client.preview('balloon', balloonInput(220));
    expect(fake.ofType('preview')).toHaveLength(1);
    // The second never reaches the worker: the third replaced it while it waited.
    await expect(second).resolves.toEqual({ status: 'superseded' });

    fake.answer(fake.ofType('preview')[0]!);
    // The first finished with a newer request waiting: stale, dropped.
    await expect(first).resolves.toEqual({ status: 'superseded' });
    const previews = fake.ofType('preview');
    expect(previews).toHaveLength(2);
    expect(previews[1]).toMatchObject({ request: { part: 'balloon', input: balloonInput(220) } });

    fake.answer(previews[1]!);
    const latest = await third;
    expect(latest.status).toBe('current');
    if (latest.status === 'current') expect(latest.value.parameters.height).toBe(220);
  });

  it('keeps parts apart: cloud and sun coalesce on their own', async () => {
    const fake = fakeTransport();
    const client = createWorkerClient('preview', { transport: fake.transport });
    const cloud = client.preview('cloud', core.cloud.defaults('cloud'));
    const sun = client.preview('sun', core.cloud.defaults('sun'));
    const ring = client.preview('ring', core.ring.presets.solid);
    expect(fake.ofType('preview')).toHaveLength(3);
    for (const message of fake.ofType('preview')) fake.answer(message);
    const results = await Promise.all([cloud, sun, ring]);
    expect(results.map((r) => r.status)).toEqual(['current', 'current', 'current']);
    if (results[1].status === 'current') expect(results[1].value.parameters.kind).toBe('sun');
  });

  it('drops responses with stale or unknown ids', async () => {
    const fake = fakeTransport();
    const client = createWorkerClient('preview', { transport: fake.transport });
    const pending = client.preview('clip', core.clip.defaults);
    const [message] = fake.ofType('preview');
    fake.reply({ id: 9999, ok: true, result: 'from nowhere' });
    fake.answer(message!);
    // A duplicate of an answered id is stale too.
    fake.reply({ id: message!.id, ok: false, error: { code: 'internal', message: 'late duplicate' } });
    const result = await pending;
    expect(result.status).toBe('current');
  });

  it('rejects the latest preview with the core error, and a superseded one silently', async () => {
    const fake = fakeTransport();
    const client = createWorkerClient('preview', { transport: fake.transport });
    const old = client.preview('figure', core.figure.defaults);
    const latest = client.preview('figure', { ...core.figure.defaults, height: 80 });
    const [first] = fake.ofType('preview');
    fake.reply({ id: first!.id, ok: false, error: { code: 'internal', message: 'boom' } });
    await expect(old).resolves.toEqual({ status: 'superseded' });
    const [, second] = fake.ofType('preview');
    fake.reply({ id: second!.id, ok: false, error: { code: 'invalid-mesh', message: 'The model could not be exported: empty geometry' } });
    const error = await latest.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CoreFailure);
    expect(error).toMatchObject({ code: 'invalid-mesh', message: 'The model could not be exported: empty geometry' });
  });

  it('never coalesces exports, and passes their errors through', async () => {
    const fake = fakeTransport();
    const client = createWorkerClient('io', { transport: fake.transport });
    const a = client.export('clip', core.clip.defaults);
    const b = client.export('clip', { ...core.clip.defaults, nailHeadDiameter: 2.2 });
    const exports = fake.ofType('export');
    expect(exports).toHaveLength(2);
    for (const message of exports) fake.answer(message);
    await expect(a).resolves.toMatchObject({ filename: 'Cable-Clip-3.75mm.stl', mime: 'model/stl' });
    await expect(b).rejects.toMatchObject({
      code: 'export-blocked',
      message: 'A 2.2 mm head is too small for a 1.8 mm nail: it needs a head of 2.4 mm or more to hold the plate.',
    });
  });

  it('transfers an imported STL buffer and decodes lamp settings', async () => {
    const fake = fakeTransport();
    const client = createWorkerClient('io', { transport: fake.transport });
    const bytes = new Uint8Array(84);
    const imported = client.importSTL(bytes);
    const settings = client.decodeLampSettings('{"width":100}');
    const importPost = fake.posted.find((p) => p.message.type === 'importSTL')!;
    expect(importPost.transfer).toEqual([bytes.buffer]);
    fake.answer(importPost.message);
    fake.answer(fake.ofType('decodeLampSettings')[0]!);
    await expect(imported).resolves.toMatchObject({ restoredSettings: false });
    await expect(settings).rejects.toMatchObject({ code: 'invalid-lamp-settings' });
  });

  it('settles everything when the worker fails or is disposed', async () => {
    const fake = fakeTransport();
    const client = createWorkerClient('io', { transport: fake.transport });
    const running = client.preview('basket', core.basket.defaults);
    const queued = client.preview('basket', { ...core.basket.defaults, width: 70 });
    const exporting = client.export('basket', core.basket.defaults);
    fake.crash('The core worker failed to start.');
    await expect(client.ready).rejects.toMatchObject({ code: 'internal', message: 'The core worker failed to start.' });
    await expect(running).resolves.toEqual({ status: 'superseded' });
    await expect(queued).resolves.toEqual({ status: 'superseded' });
    await expect(exporting).rejects.toBeInstanceOf(CoreFailure);
    // A failed worker answers nothing more: later requests settle at once.
    await expect(client.decodeLampSettings('{}')).rejects.toMatchObject({ message: 'The core worker failed to start.' });
    expect(fake.ofType('decodeLampSettings')).toHaveLength(0);

    client.dispose();
    expect(fake.terminated).toBe(true);
    await expect(client.export('basket', core.basket.defaults)).rejects.toMatchObject({ message: 'The core worker was stopped.' });
    await expect(client.preview('basket', core.basket.defaults)).resolves.toEqual({ status: 'superseded' });
    await flush();
  });
});
