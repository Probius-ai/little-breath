/** A single writable account workspace per browser prevents cross-tab cache clobbering. */
export class AccountWorkspaceLease {
  private releaseCurrent?: () => void;
  private generation = 0;
  constructor(private locks: LockManager | undefined = navigator.locks) {}
  async acquire(owner: string): Promise<boolean> {
    this.release();
    const generation = this.generation;
    // Fail closed on browsers without Web Locks; guest/file workflows still work.
    if (!this.locks) return false;
    return new Promise<boolean>((resolve) => {
      void this.locks!.request(
        `little-breath.workspace.${owner}`,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock || this.generation !== generation) {
            resolve(false);
            return;
          }
          await new Promise<void>((release) => {
            this.releaseCurrent = release;
            resolve(true);
          });
        },
      ).catch(() => resolve(false));
    });
  }
  release() {
    this.generation++;
    this.releaseCurrent?.();
    this.releaseCurrent = undefined;
  }
}
