/** Thin client for the FocusGate relay backend. */

export interface BlockStatus {
  active: { id: number; studentId: number; startedAt: number; endsAt: number } | null;
}

export class FocusGateApi {
  constructor(private baseUrl: string, private studentId: number) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async registerPushToken(token: string): Promise<void> {
    const res = await fetch(this.url(`/students/${this.studentId}/push-token`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw new Error(`register token failed: ${res.status}`);
  }

  async startBlock(durationMinutes: number): Promise<void> {
    const res = await fetch(this.url(`/blocks/${this.studentId}/start`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ durationMinutes }),
    });
    if (!res.ok) throw new Error(`start block failed: ${res.status}`);
  }

  async stopBlock(): Promise<{ heldCount: number; digest: string }> {
    const res = await fetch(this.url(`/blocks/${this.studentId}/stop`), { method: "POST" });
    if (!res.ok) throw new Error(`stop block failed: ${res.status}`);
    return (await res.json()) as { heldCount: number; digest: string };
  }

  async status(): Promise<BlockStatus> {
    const res = await fetch(this.url(`/blocks/${this.studentId}/status`));
    if (!res.ok) throw new Error(`status failed: ${res.status}`);
    return (await res.json()) as BlockStatus;
  }
}
