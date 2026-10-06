// A tiny concurrency lane: at most `max` tasks run at once, and the NEWEST
// waiting request goes next (the tiles on screen now, not ones already
// scrolled past). A request whose `isCancelled()` has turned true before it
// gets a turn is skipped and resolves to undefined. Pure JS so it's testable
// without Expo.
export function makeLane(max) {
  let running = 0;
  const waiting = [];
  const pump = () => {
    while (running < max && waiting.length) {
      const job = waiting.pop();
      if (job.isCancelled && job.isCancelled()) { job.resolve(undefined); continue; }
      running++;
      job.task().then(job.resolve, job.reject).finally(() => { running--; pump(); });
    }
  };
  return (task, isCancelled) => new Promise((resolve, reject) => {
    waiting.push({ task, isCancelled, resolve, reject });
    pump();
  });
}
