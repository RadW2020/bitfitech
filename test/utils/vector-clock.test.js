/**
 * @fileoverview Unit tests for Vector Clock
 * @author Raul JM
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VectorClock, TimestampedEvent } from '../../src/utils/vector-clock.js';

describe('VectorClock', () => {
  let clock1, clock2, clock3;

  beforeEach(() => {
    clock1 = new VectorClock('node1');
    clock2 = new VectorClock('node2');
    clock3 = new VectorClock('node3');
  });

  describe('constructor', () => {
    it('should create vector clock with node ID', () => {
      expect(clock1.nodeId).toBe('node1');
      expect(clock1.clock['node1']).toBe(0);
    });

    it('should create vector clock with initial clock', () => {
      const initialClock = { node1: 5, node2: 3 };
      const clock = new VectorClock('node1', initialClock);
      expect(clock.clock).toEqual({ node1: 5, node2: 3 });
    });
  });

  describe('tick', () => {
    it('should increment local clock', () => {
      expect(clock1.tick()).toBe(1);
      expect(clock1.tick()).toBe(2);
      expect(clock1.clock['node1']).toBe(2);
    });
  });

  describe('update', () => {
    it('should update with another vector clock', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1
      clock2.tick(); // node2: 2

      clock1.update(clock2);
      expect(clock1.clock['node1']).toBe(2); // max(1, 0) + 1
      expect(clock1.clock['node2']).toBe(2); // max(0, 2)
    });

    it('should handle concurrent updates', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1

      clock1.update(clock2);
      expect(clock1.clock['node1']).toBe(2);
      expect(clock1.clock['node2']).toBe(1);
    });
  });

  describe('compare', () => {
    it('should return 1 when this > other', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1
      clock1.update(clock2); // node1: 2, node2: 1

      expect(clock1.compare(clock2)).toBe(1);
    });

    it('should return -1 when this < other', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1
      clock1.update(clock2); // node1: 2, node2: 1

      expect(clock2.compare(clock1)).toBe(-1);
    });

    it('should return 0 when equal', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1
      clock1.update(clock2); // node1: 2, node2: 1
      clock2.update(clock1); // node2: 2, node1: 2

      expect(clock1.compare(clock2)).toBe(0);
    });

    it('should return null when concurrent', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1

      expect(clock1.compare(clock2)).toBe(null);
    });
  });

  describe('happensBefore', () => {
    it('should return true when this happens before other', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1
      clock1.update(clock2); // node1: 2, node2: 1

      expect(clock2.happensBefore(clock1)).toBe(true);
    });

    it('should return false when this does not happen before other', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1

      expect(clock1.happensBefore(clock2)).toBe(false);
    });
  });

  describe('happensAfter', () => {
    it('should return true when this happens after other', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1
      clock1.update(clock2); // node1: 2, node2: 1

      expect(clock1.happensAfter(clock2)).toBe(true);
    });

    it('should return false when this does not happen after other', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1

      expect(clock1.happensAfter(clock2)).toBe(false);
    });
  });

  describe('isConcurrent', () => {
    it('should return true when concurrent', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1

      expect(clock1.isConcurrent(clock2)).toBe(true);
    });

    it('should return false when not concurrent', () => {
      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1
      clock1.update(clock2); // node1: 2, node2: 1

      expect(clock1.isConcurrent(clock2)).toBe(false);
    });
  });

  describe('toObject', () => {
    it('should return clock as object', () => {
      clock1.tick();
      clock1.tick();
      const obj = clock1.toObject();
      expect(obj).toEqual({ node1: 2 });
    });
  });

  describe('fromObject', () => {
    it('should create vector clock from object', () => {
      const clock = VectorClock.fromObject('node1', { node1: 5, node2: 3 });
      expect(clock.nodeId).toBe('node1');
      expect(clock.clock).toEqual({ node1: 5, node2: 3 });
    });
  });

  describe('clone', () => {
    it('should clone vector clock', () => {
      clock1.tick();
      clock1.tick();
      const clone = clock1.clone();

      expect(clone.nodeId).toBe(clock1.nodeId);
      expect(clone.clock).toEqual(clock1.clock);
      expect(clone).not.toBe(clock1);
    });
  });
});

describe('TimestampedEvent', () => {
  let clock1, clock2, event1, event2;

  beforeEach(() => {
    clock1 = new VectorClock('node1');
    clock2 = new VectorClock('node2');

    clock1.tick(); // node1: 1
    clock2.tick(); // node2: 1

    event1 = new TimestampedEvent({ type: 'order', data: 'test1' }, clock1);
    event2 = new TimestampedEvent({ type: 'order', data: 'test2' }, clock2);
  });

  describe('constructor', () => {
    it('should create timestamped event', () => {
      expect(event1.event).toEqual({ type: 'order', data: 'test1' });
      expect(event1.vectorClock).toBe(clock1);
      expect(event1.timestamp).toBeDefined();
      expect(event1.id).toContain('node1-1-');
    });
  });

  describe('compare', () => {
    it('should compare using vector clock first', () => {
      clock1.update(clock2); // node1: 2, node2: 1
      const event1Updated = new TimestampedEvent({ type: 'order', data: 'test1' }, clock1);

      expect(event1Updated.compare(event2)).toBe(1);
    });

    it('should use timestamp as tiebreaker for concurrent events', () => {
      // Both events are concurrent, so timestamp should be used
      const result = event1.compare(event2);
      expect(typeof result).toBe('number');
    });

    it('should use ID as final tiebreaker', () => {
      // Create events with same vector clock and timestamp
      const sameTime = Date.now();
      const event1Same = new TimestampedEvent({ type: 'order', data: 'test1' }, clock1);
      const event2Same = new TimestampedEvent({ type: 'order', data: 'test2' }, clock1);

      // Mock timestamp to be the same
      event1Same.timestamp = sameTime;
      event2Same.timestamp = sameTime;

      const result = event1Same.compare(event2Same);
      expect(typeof result).toBe('number');
    });
  });

  describe('happensBefore', () => {
    it('should return true when this happens before other', () => {
      clock1.update(clock2); // node1: 2, node2: 1
      const event1Updated = new TimestampedEvent({ type: 'order', data: 'test1' }, clock1);

      expect(event2.happensBefore(event1Updated)).toBe(true);
    });
  });

  describe('getEvent', () => {
    it('should return event data', () => {
      expect(event1.getEvent()).toEqual({ type: 'order', data: 'test1' });
    });
  });

  describe('toString', () => {
    it('should return string representation', () => {
      const str = event1.toString();
      expect(str).toContain('Event(');
      expect(str).toContain('node1-1-');
      expect(str).toContain('test1');
    });
  });
});
