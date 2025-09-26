/**
 * @fileoverview Unit tests for Event Queue
 * @author Raul JM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventQueue } from '../../src/utils/event-queue.js';
import { VectorClock } from '../../src/utils/vector-clock.js';

describe('EventQueue', () => {
  let eventQueue;
  let mockHandler;

  beforeEach(() => {
    eventQueue = new EventQueue('test-node');
    mockHandler = vi.fn();
  });

  describe('constructor', () => {
    it('should create event queue with node ID', () => {
      expect(eventQueue.nodeId).toBe('test-node');
      expect(eventQueue.getVectorClock().nodeId).toBe('test-node');
    });
  });

  describe('on', () => {
    it('should add event handler', () => {
      eventQueue.on('test-event', mockHandler);
      expect(eventQueue.eventHandlers.has('test-event')).toBe(true);
      expect(eventQueue.eventHandlers.get('test-event')).toContain(mockHandler);
    });

    it('should add multiple handlers for same event type', () => {
      const handler2 = vi.fn();
      eventQueue.on('test-event', mockHandler);
      eventQueue.on('test-event', handler2);

      const handlers = eventQueue.eventHandlers.get('test-event');
      expect(handlers).toContain(mockHandler);
      expect(handlers).toContain(handler2);
    });
  });

  describe('off', () => {
    it('should remove event handler', () => {
      eventQueue.on('test-event', mockHandler);
      eventQueue.off('test-event', mockHandler);

      const handlers = eventQueue.eventHandlers.get('test-event');
      expect(handlers).not.toContain(mockHandler);
    });

    it('should handle removing non-existent handler', () => {
      expect(() => eventQueue.off('test-event', mockHandler)).not.toThrow();
    });
  });

  describe('enqueue', () => {
    it('should enqueue event without vector clock', async () => {
      eventQueue.on('test-event', mockHandler);

      await eventQueue.enqueue({ type: 'test-event', data: 'test' });

      expect(mockHandler).toHaveBeenCalledWith(
        { type: 'test-event', data: 'test' },
        expect.any(VectorClock)
      );
    });

    it('should enqueue event with vector clock', async () => {
      eventQueue.on('test-event', mockHandler);
      const vectorClock = new VectorClock('other-node');
      vectorClock.tick();

      await eventQueue.enqueue({ type: 'test-event', data: 'test' }, vectorClock);

      expect(mockHandler).toHaveBeenCalledWith(
        { type: 'test-event', data: 'test' },
        expect.any(VectorClock)
      );
    });

    it('should process events in order', async () => {
      const order = [];
      eventQueue.on('test-event', event => {
        order.push(event.data);
      });

      // Enqueue events with different vector clocks
      const clock1 = new VectorClock('node1');
      const clock2 = new VectorClock('node2');

      clock1.tick(); // node1: 1
      clock2.tick(); // node2: 1
      clock1.update(clock2); // node1: 2, node2: 1

      await eventQueue.enqueue({ type: 'test-event', data: 'second' }, clock1);
      await eventQueue.enqueue({ type: 'test-event', data: 'first' }, clock2);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(order).toEqual(['first', 'second']);
    });

    it('should skip duplicate events', async () => {
      eventQueue.on('test-event', mockHandler);

      const vectorClock = new VectorClock('other-node');
      vectorClock.tick();

      // Enqueue same event twice
      await eventQueue.enqueue({ type: 'test-event', data: 'test' }, vectorClock);
      await eventQueue.enqueue({ type: 'test-event', data: 'test' }, vectorClock);

      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getVectorClock', () => {
    it('should return cloned vector clock', () => {
      const clock = eventQueue.getVectorClock();
      expect(clock).toBeInstanceOf(VectorClock);
      expect(clock.nodeId).toBe('test-node');
      expect(clock).not.toBe(eventQueue.vectorClock);
    });
  });

  describe('getPendingCount', () => {
    it('should return pending events count', () => {
      expect(eventQueue.getPendingCount()).toBe(0);
    });
  });

  describe('getProcessedCount', () => {
    it('should return processed events count', () => {
      expect(eventQueue.getProcessedCount()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all events', () => {
      eventQueue.clear();
      expect(eventQueue.getPendingCount()).toBe(0);
      expect(eventQueue.getProcessedCount()).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return queue status', () => {
      const status = eventQueue.getStatus();
      expect(status).toHaveProperty('nodeId', 'test-node');
      expect(status).toHaveProperty('vectorClock');
      expect(status).toHaveProperty('pendingCount', 0);
      expect(status).toHaveProperty('processedCount', 0);
      expect(status).toHaveProperty('processing', false);
    });
  });

  describe('error handling', () => {
    it('should handle handler errors gracefully', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
      eventQueue.on('test-event', errorHandler);

      // Should not throw
      await expect(eventQueue.enqueue({ type: 'test-event', data: 'test' })).resolves.not.toThrow();

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('concurrent processing', () => {
    it('should prevent concurrent processing', async () => {
      let processingCount = 0;
      const slowHandler = vi.fn().mockImplementation(async () => {
        processingCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        processingCount--;
      });

      eventQueue.on('test-event', slowHandler);

      // Enqueue multiple events quickly
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(eventQueue.enqueue({ type: 'test-event', data: `test${i}` }));
      }

      await Promise.all(promises);

      // Should not have concurrent processing
      expect(processingCount).toBe(0);
    });
  });
});
