import { BadRequestException, Injectable, Logger } from '@nestjs/common';

export type EinvoiceGspConfig = {
  enabled: boolean;
  provider: 'cleartax' | 'generic';
  host: string;
  authToken: string;
  gstin: string;
};

export type GenerateIrnResult = {
  mode: 'live' | 'demo';
  irn: string;
  ackNo?: string;
  ackDt?: string;
  signedQrCode?: string;
  signedInvoice?: string;
  raw?: unknown;
  note: string;
};

/**
 * ClearTax / GSP-compatible e-invoice client.
 * Set EINVOICE_GSP_AUTH_TOKEN + EINVOICE_GSP_GSTIN (+ optional HOST) for live IRN.
 */
@Injectable()
export class EinvoiceGspClient {
  private readonly logger = new Logger(EinvoiceGspClient.name);

  getConfig(): EinvoiceGspConfig {
    const authToken = process.env.EINVOICE_GSP_AUTH_TOKEN?.trim() ?? '';
    const gstin = process.env.EINVOICE_GSP_GSTIN?.trim() ?? '';
    const host =
      process.env.EINVOICE_GSP_HOST?.trim() ||
      'https://api-sandbox.clear.in';
    const provider = (process.env.EINVOICE_GSP_PROVIDER?.trim() || 'cleartax') as
      | 'cleartax'
      | 'generic';
    return {
      enabled: Boolean(authToken && gstin),
      provider,
      host: host.replace(/\/$/, ''),
      authToken,
      gstin,
    };
  }

  async generateIrn(payload: Record<string, unknown>): Promise<GenerateIrnResult> {
    const cfg = this.getConfig();
    if (!cfg.enabled) {
      if (process.env.EINVOICE_ALLOW_DEMO === 'false') {
        throw new BadRequestException(
          'E-invoice GSP not configured. Set EINVOICE_GSP_AUTH_TOKEN and EINVOICE_GSP_GSTIN.',
        );
      }
      const irn = `IRN-DEMO-${Date.now()}`;
      return {
        mode: 'demo',
        irn,
        signedQrCode: String(payload.demoQr ?? ''),
        note: 'Demo IRN — set EINVOICE_GSP_AUTH_TOKEN + EINVOICE_GSP_GSTIN for live ClearTax/NIC GSP.',
      };
    }

    if (cfg.provider === 'cleartax') {
      return this.generateClearTax(cfg, payload);
    }

    return this.generateGeneric(cfg, payload);
  }

  private async generateClearTax(
    cfg: EinvoiceGspConfig,
    payload: Record<string, unknown>,
  ): Promise<GenerateIrnResult> {
    const url = `${cfg.host}/einv/v1/govt/api/Invoice/`;
    this.logger.log(`Calling GSP IRN: ${url}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cleartax-auth-token': cfg.authToken,
        'x-cleartax-product': 'EInvoice',
        gstin: cfg.gstin,
      },
      body: JSON.stringify(payload.transaction ?? payload),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new BadRequestException(`GSP returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      throw new BadRequestException(
        `GSP IRN failed (${res.status}): ${JSON.stringify(data).slice(0, 500)}`,
      );
    }

    // Govt-compatible response shape
    const success = String(data.Success ?? data.success ?? '').toUpperCase();
    const irn = String(data.Irn ?? data.irn ?? '');
    if (success === 'N' || !irn) {
      throw new BadRequestException(
        `GSP rejected invoice: ${JSON.stringify(data.ErrorDetails ?? data.error ?? data).slice(0, 500)}`,
      );
    }

    return {
      mode: 'live',
      irn,
      ackNo: data.AckNo != null ? String(data.AckNo) : undefined,
      ackDt: data.AckDt != null ? String(data.AckDt) : undefined,
      signedQrCode: data.SignedQRCode != null ? String(data.SignedQRCode) : undefined,
      signedInvoice: data.SignedInvoice != null ? String(data.SignedInvoice) : undefined,
      raw: data,
      note: 'Live IRN generated via GSP',
    };
  }

  private async generateGeneric(
    cfg: EinvoiceGspConfig,
    payload: Record<string, unknown>,
  ): Promise<GenerateIrnResult> {
    const path = process.env.EINVOICE_GSP_GENERATE_PATH?.trim() || '/einvoice/generate';
    const url = `${cfg.host}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.authToken}`,
        gstin: cfg.gstin,
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new BadRequestException(`GSP error: ${JSON.stringify(data).slice(0, 400)}`);
    }
    const irn = String(data.irn ?? data.Irn ?? '');
    if (!irn) throw new BadRequestException('GSP response missing IRN');
    return {
      mode: 'live',
      irn,
      signedQrCode: data.signedQrCode != null ? String(data.signedQrCode) : undefined,
      raw: data,
      note: 'Live IRN via generic GSP',
    };
  }

  async generateEway(
    payload: Record<string, unknown>,
  ): Promise<{ mode: 'live' | 'demo'; ewayBillNo: string; note: string; raw?: unknown }> {
    const cfg = this.getConfig();
    if (!cfg.enabled) {
      return {
        mode: 'demo',
        ewayBillNo: `EWB-DEMO-${Date.now().toString().slice(-10)}`,
        note: 'Demo e-way — set EINVOICE_GSP_AUTH_TOKEN + GSTIN for live GSP e-way.',
      };
    }

    const path = process.env.EINVOICE_GSP_EWAY_PATH?.trim() || '/einv/v1/govt/api/ewaybills/';
    const url = `${cfg.host}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cleartax-auth-token': cfg.authToken,
          'x-cleartax-product': 'EInvoice',
          gstin: cfg.gstin,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const ewb =
        String(data.EwbNo ?? data.ewayBillNo ?? data.EwbBillNo ?? data.ewbNo ?? '');
      if (!res.ok || !ewb) {
        throw new BadRequestException(
          `GSP e-way failed: ${JSON.stringify(data).slice(0, 400)}`,
        );
      }
      return { mode: 'live', ewayBillNo: ewb, note: 'Live e-way via GSP', raw: data };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(`GSP e-way error: ${String(e)}`);
    }
  }
}
