export interface UpClientOpts {
  token: string;
  base: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class UpClient {
  private readonly token: string;
  private readonly base: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: UpClientOpts) {
    this.token = opts.token;
    this.base = opts.base;
    // Bind globalThis.fetch so workerd doesn't throw "Illegal invocation"
    // when we call it as an instance method (this.fetchFn(url)).
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async getJson(url: string, attempt = 0): Promise<{ data: unknown[]; links: { next: string | null } }> {
    const res = await this.fetchFn(url, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
    });
    if (res.status === 429 && attempt < 3) {
      const delay = Number(res.headers.get("retry-after") ?? "1") * 1000 || Math.pow(4, attempt) * 1000;
      await this.sleep(delay);
      return this.getJson(url, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`Up API ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as { data: unknown[]; links: { next: string | null } };
  }

  async *listTransactionsSince(sinceIso: string): AsyncGenerator<{ id: string }, void, void> {
    const params = new URLSearchParams({ "filter[since]": sinceIso, "page[size]": "100" });
    let url: string | null = `${this.base}/transactions?${params.toString()}`;
    while (url) {
      const page = await this.getJson(url);
      for (const t of page.data as { id: string }[]) yield t;
      url = page.links.next;
    }
  }

  async getSpendingAccountId(): Promise<string> {
    const res = await this.fetchFn(`${this.base}/accounts`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Up API ${res.status}`);
    const json = (await res.json()) as {
      data: { id: string; attributes: { accountType: string } }[];
    };
    const spending = json.data.find((a) => a.attributes.accountType === "TRANSACTIONAL");
    if (!spending) throw new Error("No TRANSACTIONAL (Spending) account found");
    return spending.id;
  }
}
