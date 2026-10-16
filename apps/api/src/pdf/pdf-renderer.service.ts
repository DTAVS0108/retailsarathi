import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';

/**
 * Renders arbitrary HTML (already built from our own templates — never third-party content) to a
 * PDF buffer via a single shared headless Chromium instance, reused across requests rather than
 * launched per-request (a cold Chromium launch costs ~500ms-1s; reusing it keeps downloads fast).
 * Not invoice-specific on purpose — any module that needs "render this HTML to a PDF" can use it.
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browserPromise: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({ headless: true }).catch((err) => {
        this.browserPromise = null;
        throw err;
      });
    }
    const browser = await this.browserPromise;
    if (!browser.isConnected()) {
      this.browserPromise = null;
      return this.getBrowser();
    }
    return browser;
  }

  async renderPdf(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle' });
      return await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch (err) {
      this.logger.warn(`Error closing shared PDF browser: ${String(err)}`);
    }
  }
}
