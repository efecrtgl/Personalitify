import { describe, expect, it, vi } from 'vitest';
import { EventSequencer } from '../src/index.js';

const event = (seq) => ({ seq, event: 'task.updated', entityId: `e${seq}` });

/** A log of `count` events and a `fetchAfter` that pages through it. */
function serverWith(count, pageSize = 100) {
  const log = Array.from({ length: count }, (_, index) => event(index + 1));
  const fetchAfter = vi.fn(async (after) => {
    const events = log.filter((item) => item.seq > after).slice(0, pageSize);
    const last = events.at(-1)?.seq ?? after;
    return { events, headSeq: log.length, hasMore: last < log.length };
  });
  return { log, fetchAfter };
}

function sequencerFor(server, options = {}) {
  const delivered = [];
  const sequencer = new EventSequencer({
    onEvent: (item) => delivered.push(item.seq),
    fetchAfter: server.fetchAfter,
    ...options,
  });
  return { sequencer, delivered };
}

describe('event sequencer', () => {
  it('starts at the server’s position and delivers what follows in order', async () => {
    const server = serverWith(5);
    const { sequencer, delivered } = sequencerFor(server);

    await sequencer.start(5);
    expect(sequencer.cursor).toBe(5);
    sequencer.push(event(6));
    sequencer.push(event(7));
    expect(delivered).toEqual([6, 7]);
    expect(sequencer.cursor).toBe(7);
    expect(server.fetchAfter).not.toHaveBeenCalled();
  });

  it('drops duplicates', async () => {
    const { sequencer, delivered } = sequencerFor(serverWith(0));
    await sequencer.start(0);
    sequencer.push(event(1));
    sequencer.push(event(1));
    sequencer.push(event(2));
    sequencer.push(event(1));
    expect(delivered).toEqual([1, 2]);
  });

  it('holds back an early event and fills the gap before delivering it', async () => {
    const server = serverWith(4);
    const { sequencer, delivered } = sequencerFor(server);
    await sequencer.start(1);

    // 2 and 3 were lost on the way; 4 arrives.
    sequencer.push(event(4));
    expect(delivered).toEqual([]);
    await sequencer.catchUp();
    expect(delivered).toEqual([2, 3, 4]);
    expect(server.fetchAfter).toHaveBeenCalledTimes(1);
    expect(server.fetchAfter).toHaveBeenCalledWith(1);

    // Events that arrive while the gap is being filled are not delivered twice.
    server.log.push(event(5), event(6), event(7));
    sequencer.push(event(7));
    sequencer.push(event(6));
    await sequencer.catchUp();
    expect(delivered).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('catches up after a reconnect, page by page', async () => {
    const server = serverWith(250, 100);
    const { sequencer, delivered } = sequencerFor(server, { cursor: 20 });

    await sequencer.start(250);
    expect(delivered).toHaveLength(230);
    expect(delivered[0]).toBe(21);
    expect(delivered.at(-1)).toBe(250);
    expect(delivered.every((seq, index) => index === 0 || seq === delivered[index - 1] + 1)).toBe(
      true,
    );
    expect(server.fetchAfter).toHaveBeenCalledTimes(3);
  });

  it('keeps events that arrive before the start', async () => {
    const server = serverWith(3);
    const { sequencer, delivered } = sequencerFor(server);
    sequencer.push(event(4));
    sequencer.push(event(3));
    expect(delivered).toEqual([]);
    // The server's position was 3 when the connection became ready: 3 is old, 4 is news.
    await sequencer.start(3);
    expect(delivered).toEqual([4]);
  });

  it('asks for a reload instead of replaying a very long absence', async () => {
    const server = serverWith(5000);
    const onReset = vi.fn();
    const { sequencer, delivered } = sequencerFor(server, { cursor: 10, maxReplay: 1000, onReset });

    await sequencer.start(5000);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(delivered).toEqual([]);
    expect(sequencer.cursor).toBe(5000);
    expect(server.fetchAfter).not.toHaveBeenCalled();
    sequencer.push(event(5001));
    expect(delivered).toEqual([5001]);
  });

  it('reports a failed catch-up and tries again on the next occasion', async () => {
    const server = serverWith(3);
    const onError = vi.fn();
    let failing = true;
    const fetchAfter = vi.fn(async (after) => {
      if (failing) throw new Error('offline');
      return server.fetchAfter(after);
    });
    const { sequencer, delivered } = sequencerFor({ fetchAfter }, { cursor: 0, onError });

    await expect(sequencer.start(3)).rejects.toThrow('offline');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(delivered).toEqual([]);

    failing = false;
    await sequencer.start(3);
    expect(delivered).toEqual([1, 2, 3]);
  });
});
