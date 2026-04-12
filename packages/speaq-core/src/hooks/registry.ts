/**
 * SPEAQ Core - Hook Registry
 * PORT from plexaris-agent-core/hooks/registry.py
 * PRD Section 5: Pre-send hooks (encryptie), post-receive hooks (decryptie), payment validation
 */

export type HookEvent =
  | "pre-send"
  | "post-receive"
  | "pre-encrypt"
  | "post-decrypt"
  | "pre-pay"
  | "post-pay"
  | "pre-call"
  | "post-call"
  | "on-connect"
  | "on-disconnect";

type HookFn = (data: unknown) => Promise<unknown> | unknown;

export class HookRegistry {
  private hooks: Map<HookEvent, HookFn[]> = new Map();

  register(event: HookEvent, hook: HookFn): void {
    const existing = this.hooks.get(event) || [];
    existing.push(hook);
    this.hooks.set(event, existing);
  }

  unregister(event: HookEvent, hook: HookFn): void {
    const existing = this.hooks.get(event) || [];
    this.hooks.set(
      event,
      existing.filter((h) => h !== hook)
    );
  }

  async trigger(event: HookEvent, data: unknown): Promise<unknown> {
    const hooks = this.hooks.get(event) || [];
    let result = data;
    for (const hook of hooks) {
      result = await hook(result);
    }
    return result;
  }

  getHookCount(event: HookEvent): number {
    return (this.hooks.get(event) || []).length;
  }

  clear(event?: HookEvent): void {
    if (event) {
      this.hooks.delete(event);
    } else {
      this.hooks.clear();
    }
  }
}
