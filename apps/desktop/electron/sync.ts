import { getOutbox, markOutboxSynced, upsertProductsFromServer, getSetting, setSetting } from './database';
import { randomUUID } from 'crypto';

const DEVICE_ID_KEY = 'device-id';

async function pullFullCatalog(token: string, apiUrl: string) {
  const all: Array<Record<string, unknown>> = [];
  let page = 1;
  const pageSize = 200;
  for (;;) {
    const res = await fetch(`${apiUrl}/products?page=${page}&pageSize=${pageSize}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    const items = (data.items ?? data) as Array<Record<string, unknown>>;
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    if (items.length < pageSize) break;
    page += 1;
    if (page > 50) break;
  }
  if (all.length) upsertProductsFromServer(all);
  return all.length;
}

export async function syncWithServer(token: string, apiUrl: string) {
  const deviceId = getDeviceId();
  const base = apiUrl.replace(/\/$/, '');

  const outbox = getOutbox() as Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    operation: string;
    payload: string;
  }>;

  const entries = outbox.map((o) => ({
    entityType: o.entity_type,
    entityId: o.entity_id,
    operation: o.operation,
    payload: JSON.parse(o.payload),
  }));

  let synced = 0;
  if (entries.length > 0) {
    const pushRes = await fetch(`${base}/sync/push?deviceId=${deviceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ entries }),
    });

    if (!pushRes.ok) {
      const errText = await pushRes.text().catch(() => '');
      throw new Error(`Sync push failed (${pushRes.status}): ${errText.slice(0, 200)}`);
    }

    const { results } = await pushRes.json();
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'SYNCED') {
        markOutboxSynced(outbox[i].id);
        synced += 1;
      }
    }
  }

  const pullRes = await fetch(`${base}/sync/pull?deviceId=${deviceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let pulled = false;
  if (pullRes.ok) {
    const data = await pullRes.json();
    if (data.changes?.products?.length) {
      upsertProductsFromServer(data.changes.products);
    }
    pulled = true;
  }

  // Always refresh full catalog into SQLite for offline billing
  let catalogCount = 0;
  try {
    catalogCount = await pullFullCatalog(token, base);
  } catch {
    /* optional */
  }

  return { pushed: synced, pulled, catalogCount };
}

function getDeviceId(): string {
  const existing = getSetting(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = randomUUID();
  setSetting(DEVICE_ID_KEY, id);
  return id;
}
