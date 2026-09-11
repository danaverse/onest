/**
 * Durable JSON store for XEC → PAW exchange orders (desk sells from inventory).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type ExchangeOrderStatus =
  | 'open'
  | 'paid'
  | 'fulfilled'
  | 'failed'
  | 'expired';

export interface ExchangeOrder {
  id: string;
  installId: string;
  address: string;
  pawAtoms: string;
  xecSats: string;
  depositAddress: string;
  status: ExchangeOrderStatus;
  createdAt: number;
  expiresAt: number;
  paidAt?: number;
  paymentTxid?: string;
  fulfillmentTxid?: string;
  error?: string;
}

interface StoreFile {
  version: 1;
  orders: ExchangeOrder[];
  processedTxids: string[];
}

const MAX_PROCESSED_TXIDS = 500;

export class ExchangeStore {
  private readonly filePath: string;
  private orders: ExchangeOrder[] = [];
  private processed: string[] = [];

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as StoreFile;
      if (raw && raw.version === 1 && Array.isArray(raw.orders)) {
        this.orders = raw.orders;
        this.processed = Array.isArray(raw.processedTxids) ? raw.processedTxids : [];
      }
    } catch {
      this.orders = [];
      this.processed = [];
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp.${Date.now()}`;
    const payload: StoreFile = {
      version: 1,
      orders: this.orders,
      processedTxids: this.processed,
    };
    writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
    renameSync(tmp, this.filePath);
  }

  create(order: ExchangeOrder): ExchangeOrder {
    this.orders.push(order);
    this.save();
    return order;
  }

  get(id: string): ExchangeOrder | undefined {
    const key = id.trim().toLowerCase();
    return this.orders.find(o => o.id === key);
  }

  update(
    id: string,
    patch: Partial<ExchangeOrder>,
  ): ExchangeOrder | null {
    const order = this.get(id);
    if (!order) return null;
    Object.assign(order, patch);
    this.save();
    return order;
  }

  hasProcessedTx(txid: string): boolean {
    return this.processed.includes(txid.trim().toLowerCase());
  }

  addProcessedTx(txid: string): void {
    const id = txid.trim().toLowerCase();
    if (this.processed.includes(id)) return;
    this.processed.push(id);
    if (this.processed.length > MAX_PROCESSED_TXIDS) {
      this.processed = this.processed.slice(-MAX_PROCESSED_TXIDS);
    }
    this.save();
  }

  /** Mark unpaid orders past their expiry. Returns how many expired. */
  pruneExpired(now = Date.now()): number {
    let n = 0;
    for (const order of this.orders) {
      if (order.status === 'open' && order.expiresAt <= now) {
        order.status = 'expired';
        n++;
      }
    }
    if (n > 0) this.save();
    return n;
  }

  list(limit = 20): ExchangeOrder[] {
    return [...this.orders].reverse().slice(0, limit);
  }
}
