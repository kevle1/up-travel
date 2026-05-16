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
    this.fetchFn = opts.fetch ?? globalThis.fetch;
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

  async listWebhooks(): Promise<{ id: string; url: string }[]> {
    const res = await this.fetchFn(`${this.base}/webhooks`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Up API ${res.status}`);
    const json = (await res.json()) as { data: { id: string; attributes: { url: string } }[] };
    return json.data.map((d) => ({ id: d.id, url: d.attributes.url }));
  }

  async registerWebhook(url: string): Promise<{ id: string; secret: string }> {
    const res = await this.fetchFn(`${this.base}/webhooks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ data: { attributes: { url } } }),
    });
    if (!res.ok) throw new Error(`Up API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: { id: string; attributes: { secretKey: string } } };
    return { id: json.data.id, secret: json.data.attributes.secretKey };
  }

  async deleteWebhook(id: string): Promise<void> {
    const res = await this.fetchFn(`${this.base}/webhooks/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Up API ${res.status}`);
  }

  async getTransaction(id: string): Promise<unknown> {
    const res = await this.fetchFn(`${this.base}/transactions/${id}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Up API ${res.status}`);
    return (await res.json() as { data: unknown }).data;
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
