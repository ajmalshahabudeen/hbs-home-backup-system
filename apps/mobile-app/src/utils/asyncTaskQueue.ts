/**
 * Micro-yield helper to yield execution back to the React Native JS event loop.
 * This allows touch events, animation frames, and tab switching to process immediately.
 */
export const yieldToUI = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Yields until active UI animations, frame renders, and tab transitions settle.
 * Uses requestIdleCallback with a 100ms timeout or micro-task fallback to prevent
 * InteractionManager deprecation warnings.
 */
export const yieldToInteractions = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 100 });
    } else {
      setTimeout(resolve, 16);
    }
  });

export interface TaskOptions {
  id?: string;
  priority?: 'high' | 'normal' | 'low';
}

interface QueuedTask {
  id: string;
  priority: number;
  fn: (abortSignal: { isCancelled: boolean }) => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  abortToken: { isCancelled: boolean };
}

class AsyncTaskQueue {
  private queue: QueuedTask[] = [];
  private activeTaskCount: number = 0;
  private maxConcurrency: number = 2;
  private activeTaskIds: Map<string, { isCancelled: boolean }> = new Map();

  /**
   * Enqueues a heavy task to run asynchronously in background micro-yield workers
   * without locking the main UI thread.
   */
  public enqueue<T>(
    fn: (abortSignal: { isCancelled: boolean }) => Promise<T>,
    options?: TaskOptions
  ): Promise<T> {
    const id = options?.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const priorityMap = { high: 3, normal: 2, low: 1 };
    const priority = priorityMap[options?.priority || 'normal'];

    // If a task with the same ID is already queued/running, cancel previous one
    if (options?.id) {
      this.cancel(options.id);
    }

    const abortToken = { isCancelled: false };
    this.activeTaskIds.set(id, abortToken);

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id,
        priority,
        fn,
        resolve,
        reject,
        abortToken,
      });

      // Sort queue by priority (high priority first)
      this.queue.sort((a, b) => b.priority - a.priority);

      this.processNext();
    });
  }

  /**
   * Cancels a queued or running task by ID.
   */
  public cancel(id: string) {
    const existingToken = this.activeTaskIds.get(id);
    if (existingToken) {
      existingToken.isCancelled = true;
    }

    this.queue = this.queue.filter((task) => {
      if (task.id === id) {
        task.abortToken.isCancelled = true;
        task.resolve(undefined);
        return false;
      }
      return true;
    });

    this.activeTaskIds.delete(id);
  }

  /**
   * Cancels all running and pending tasks.
   */
  public cancelAll() {
    this.activeTaskIds.forEach((token) => {
      token.isCancelled = true;
    });

    this.queue.forEach((task) => {
      task.resolve(undefined);
    });

    this.queue = [];
    this.activeTaskIds.clear();
  }

  private async processNext() {
    if (this.activeTaskCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    if (task.abortToken.isCancelled) {
      task.resolve(undefined);
      this.processNext();
      return;
    }

    this.activeTaskCount++;

    try {
      // Yield to UI event loop before starting task execution
      await yieldToUI();

      if (task.abortToken.isCancelled) {
        task.resolve(undefined);
      } else {
        const result = await task.fn(task.abortToken);
        if (!task.abortToken.isCancelled) {
          task.resolve(result);
        } else {
          task.resolve(undefined);
        }
      }
    } catch (err) {
      if (task.abortToken.isCancelled) {
        task.resolve(undefined);
      } else {
        task.reject(err);
      }
    } finally {
      this.activeTaskCount--;
      this.activeTaskIds.delete(task.id);
      this.processNext();
    }
  }
}

export const asyncTaskQueue = new AsyncTaskQueue();
