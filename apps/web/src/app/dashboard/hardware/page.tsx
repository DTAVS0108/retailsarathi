'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card } from '@retail-sarathi/ui';
import { AppLoader } from '@/app/_components/app-loader';
import { confirmDialog } from '@/app/_components/confirm-dialog';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  EmptyState,
  StatCard,
  cn,
  inputClassName,
  parseError,
  selectClassName,
} from '../_components/dashboard-ui';

type PresetField = {
  key: string;
  label: string;
  placeholder?: string;
  options?: string[];
};

type Preset = {
  type: string;
  label: string;
  blurb?: string;
  defaults: Record<string, unknown>;
  fields?: PresetField[];
};

type HardwareDevice = {
  id: string;
  name: string;
  deviceType: string;
  isActive: boolean;
  settings?: Record<string, unknown>;
  branch?: { id: string; name: string } | null;
};

type Overview = {
  deviceCount: number;
  activeCount: number;
  printerCount: number;
  scannerCount: number;
  byType: Record<string, number>;
};

type InvoiceOption = { id: string; invoiceNumber: string };

type ThermalJob = {
  text: string;
  escposBase64: string;
  transport?: string;
  bluetoothAddress?: string | null;
  printerName?: string | null;
  paperWidth?: number;
  invoiceNumber?: string;
  instructions?: string;
  note?: string;
  mode?: string;
};

const FALLBACK_PRESETS: Preset[] = [
  {
    type: 'THERMAL_PRINTER',
    label: 'Thermal Printer',
    blurb: '58/80mm ESC/POS receipt printer',
    defaults: { paperWidth: 80, port: 'USB', bluetoothAddress: '' },
    fields: [
      { key: 'port', label: 'Transport', options: ['BLUETOOTH', 'USB'] },
      { key: 'paperWidth', label: 'Paper width (mm)', options: ['58', '80'] },
      { key: 'bluetoothAddress', label: 'Bluetooth MAC', placeholder: 'AA:BB:CC:DD:EE:FF' },
    ],
  },
  {
    type: 'BARCODE_SCANNER',
    label: 'Barcode Scanner',
    blurb: 'USB keyboard-wedge scanner',
    defaults: { mode: 'KEYBOARD_WEDGE', suffix: 'Enter' },
    fields: [
      { key: 'mode', label: 'Mode', options: ['KEYBOARD_WEDGE', 'SERIAL'] },
      { key: 'suffix', label: 'Suffix key', placeholder: 'Enter' },
    ],
  },
  {
    type: 'CASH_DRAWER',
    label: 'Cash Drawer',
    blurb: 'Kick via printer or dedicated pulse',
    defaults: { trigger: 'PRINTER_KICK', pin: 2 },
    fields: [
      { key: 'trigger', label: 'Trigger', options: ['PRINTER_KICK', 'DIRECT'] },
      { key: 'pin', label: 'Pin', placeholder: '2' },
    ],
  },
  {
    type: 'WEIGHING_SCALE',
    label: 'Weighing Scale',
    blurb: 'Serial scale for weighed SKUs',
    defaults: { protocol: 'SERIAL', baudRate: 9600 },
    fields: [
      { key: 'protocol', label: 'Protocol', options: ['SERIAL', 'USB'] },
      { key: 'baudRate', label: 'Baud rate', placeholder: '9600' },
      { key: 'port', label: 'Port', placeholder: 'COM3' },
    ],
  },
  {
    type: 'CUSTOMER_DISPLAY',
    label: 'Customer Display',
    blurb: '2-line pole display at counter',
    defaults: { lines: 2, port: 'COM1' },
    fields: [
      { key: 'lines', label: 'Lines', options: ['1', '2'] },
      { key: 'port', label: 'Port', placeholder: 'COM1' },
    ],
  },
  {
    type: 'LABEL_PRINTER',
    label: 'Label Printer',
    blurb: 'Barcode / price labels',
    defaults: { labelSize: '50x25mm', dpi: 203 },
    fields: [
      { key: 'labelSize', label: 'Label size', placeholder: '50x25mm' },
      { key: 'dpi', label: 'DPI', options: ['203', '300'] },
    ],
  },
];

function presetFor(presets: Preset[], type: string) {
  return presets.find((p) => p.type === type) ?? FALLBACK_PRESETS.find((p) => p.type === type);
}

function settingsRecord(device: HardwareDevice): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = device.settings ?? {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    out[k] = String(v);
  }
  return out;
}

function summarizeSettings(settings: Record<string, unknown> | undefined, type: string) {
  if (!settings) return 'No settings';
  if (type === 'THERMAL_PRINTER') {
    const port = String(settings.port || settings.transport || 'USB');
    const width = settings.paperWidth ? `${settings.paperWidth}mm` : '80mm';
    const mac = String(settings.bluetoothAddress || settings.mac || '');
    return mac ? `${port} · ${width} · ${mac}` : `${port} · ${width}`;
  }
  return Object.entries(settings)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
}

export default function HardwarePage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [devices, setDevices] = useState<HardwareDevice[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [guideOpen, setGuideOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deviceType, setDeviceType] = useState('THERMAL_PRINTER');
  const [deviceName, setDeviceName] = useState('');
  const [createSettings, setCreateSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSettings, setEditSettings] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [invoiceId, setInvoiceId] = useState('');
  const [printerId, setPrinterId] = useState('');
  const [thermalJob, setThermalJob] = useState<ThermalJob | null>(null);
  const [printing, setPrinting] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const activePresets = presets.length ? presets : FALLBACK_PRESETS;
  const selectedPreset = useMemo(
    () => presetFor(activePresets, deviceType) ?? activePresets[0],
    [activePresets, deviceType],
  );

  const printers = useMemo(
    () => devices.filter((d) => d.deviceType === 'THERMAL_PRINTER' && d.isActive),
    [devices],
  );

  const filteredDevices = useMemo(
    () => (typeFilter ? devices.filter((d) => d.deviceType === typeFilter) : devices),
    [devices, typeFilter],
  );

  const load = useCallback(async () => {
    const [p, d, ov, inv] = await Promise.all([
      apiWithAuth<Preset[]>('/hardware/presets'),
      apiWithAuth<HardwareDevice[]>('/hardware'),
      apiWithAuth<Overview>('/hardware/overview'),
      apiWithAuth<{ items: InvoiceOption[] }>('/invoices?pageSize=15').catch(() => ({
        items: [] as InvoiceOption[],
      })),
    ]);
    setPresets(p);
    setDevices(d);
    setOverview(ov);
    setInvoices(inv.items || []);

    if (!deviceType && p[0]) setDeviceType(p[0].type);
    if (!invoiceId && inv.items?.[0]) setInvoiceId(inv.items[0].id);
    if (!printerId) {
      const firstPrinter = d.find((x) => x.deviceType === 'THERMAL_PRINTER' && x.isActive);
      if (firstPrinter) setPrinterId(firstPrinter.id);
    }
  }, [deviceType, invoiceId, printerId]);

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((e) => setError(parseError(e)))
      .finally(() => setLoading(false));
    // intentionally once on mount; filters reload via explicit load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openAdd(type?: string) {
    const nextType = type || selectedPreset?.type || 'THERMAL_PRINTER';
    const preset = presetFor(activePresets, nextType) ?? activePresets[0];
    setDeviceType(preset.type);
    setDeviceName(`${preset.label}`);
    const defaults: Record<string, string> = {};
    for (const [k, v] of Object.entries(preset.defaults ?? {})) {
      defaults[k] = String(v ?? '');
    }
    setCreateSettings(defaults);
    setAddOpen(true);
    setError('');
  }

  function selectType(type: string) {
    const preset = presetFor(activePresets, type);
    if (!preset) return;
    setDeviceType(type);
    if (!deviceName.trim() || activePresets.some((p) => p.label === deviceName)) {
      setDeviceName(preset.label);
    }
    const defaults: Record<string, string> = {};
    for (const [k, v] of Object.entries(preset.defaults ?? {})) {
      defaults[k] = String(v ?? '');
    }
    setCreateSettings(defaults);
  }

  async function createDevice(e: React.FormEvent) {
    e.preventDefault();
    const name = deviceName.trim();
    if (!name) {
      setError('Device name is required');
      return;
    }
    const settings: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(createSettings)) {
      const trimmed = v.trim();
      if (!trimmed) continue;
      const asNum = Number(trimmed);
      settings[k] = Number.isFinite(asNum) && /^-?\d+(\.\d+)?$/.test(trimmed) ? asNum : trimmed;
    }
    try {
      setSaving(true);
      setError('');
      await apiWithAuth('/hardware', {
        method: 'POST',
        body: JSON.stringify({ deviceType, name, settings }),
      });
      setSuccess(`${name} added`);
      setAddOpen(false);
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(device: HardwareDevice) {
    setEditingId(device.id);
    setEditName(device.name);
    setEditSettings(settingsRecord(device));
  }

  async function saveEdit(device: HardwareDevice) {
    const name = editName.trim();
    if (!name) {
      setError('Device name is required');
      return;
    }
    const settings: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(editSettings)) {
      const trimmed = v.trim();
      if (!trimmed) {
        settings[k] = '';
        continue;
      }
      const asNum = Number(trimmed);
      settings[k] = Number.isFinite(asNum) && /^-?\d+(\.\d+)?$/.test(trimmed) ? asNum : trimmed;
    }
    try {
      setBusyId(device.id);
      setError('');
      await apiWithAuth(`/hardware/${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, settings }),
      });
      setSuccess(`Updated ${name}`);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDevice(device: HardwareDevice) {
    try {
      setBusyId(device.id);
      setError('');
      await apiWithAuth(`/hardware/${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !device.isActive }),
      });
      setSuccess(device.isActive ? `${device.name} paused` : `${device.name} resumed`);
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function removeDevice(device: HardwareDevice) {
    const ok = await confirmDialog.confirm({
      title: 'Remove device?',
      message: `Remove “${device.name}” from this shop’s hardware list?`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setBusyId(device.id);
      setError('');
      await apiWithAuth(`/hardware/${device.id}`, { method: 'DELETE' });
      if (printerId === device.id) setPrinterId('');
      if (editingId === device.id) setEditingId(null);
      setSuccess('Device removed');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function previewThermal() {
    const id = invoiceId.trim();
    if (!id) {
      setError('Select or enter an invoice to preview.');
      return;
    }
    try {
      setPrinting(true);
      setError('');
      const data = await apiWithAuth<ThermalJob>(`/invoices/${id}/thermal`);
      setThermalJob(data);
      setSuccess('Thermal preview ready — copy text or download .bin');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setPrinting(false);
    }
  }

  async function printThermalJob() {
    const id = invoiceId.trim();
    if (!id) {
      setError('Select or enter an invoice to print.');
      return;
    }
    try {
      setPrinting(true);
      setError('');
      const job = await apiWithAuth<ThermalJob>('/hardware/print-thermal', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: id,
          ...(printerId ? { hardwareConfigId: printerId } : {}),
        }),
      });
      setThermalJob(job);
      setSuccess(
        job.printerName
          ? `Print job ready for ${job.printerName}${
              job.bluetoothAddress ? ` @ ${job.bluetoothAddress}` : ''
            }`
          : job.note || job.instructions || 'Thermal payload ready',
      );
    } catch (err) {
      setError(parseError(err));
    } finally {
      setPrinting(false);
    }
  }

  function downloadEscpos() {
    const b64 = thermalJob?.escposBase64;
    if (!b64) {
      setError('Preview or prepare a print job first.');
      return;
    }
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bin], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${thermalJob?.invoiceNumber || invoiceId.trim() || 'thermal'}.bin`;
    a.click();
    URL.revokeObjectURL(url);
    setSuccess('Downloaded ESC/POS .bin file');
  }

  async function copyPreview() {
    if (!thermalJob?.text) return;
    try {
      await navigator.clipboard.writeText(thermalJob.text);
      setSuccess('Receipt text copied');
    } catch {
      setError('Could not copy to clipboard');
    }
  }

  function renderFields(
    fields: PresetField[] | undefined,
    values: Record<string, string>,
    onChange: (key: string, value: string) => void,
  ) {
    if (!fields?.length) return null;
    return fields.map((field) => {
      const showBt =
        field.key !== 'bluetoothAddress' ||
        String(values.port || values.transport || '').toUpperCase() === 'BLUETOOTH';
      if (!showBt && field.key === 'bluetoothAddress') return null;

      return (
        <label key={field.key} className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{field.label}</span>
          {field.options?.length ? (
            <select
              className={selectClassName}
              value={values[field.key] ?? field.options[0]}
              onChange={(e) => onChange(field.key, e.target.value)}
            >
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputClassName}
              value={values[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          )}
        </label>
      );
    });
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Hardware"
        description="Register counter devices — thermal printers, scanners, drawers, scales, and displays — then test ESC/POS receipts."
        actions={
          <Button type="button" onClick={() => openAdd()}>
            Add device
          </Button>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <MessageBanner tone="info" autoHideMs={0} alsoToast={false}>
        Web can preview and download ESC/POS. Bluetooth / USB write to a physical printer runs from the
        RetailSarathi desktop or mobile app using the device settings saved here.
      </MessageBanner>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Devices"
          value={String(overview?.deviceCount ?? 0)}
          hint={`${overview?.activeCount ?? 0} active`}
        />
        <StatCard
          label="Thermal printers"
          value={String(overview?.printerCount ?? 0)}
          hint="Used for receipt jobs"
        />
        <StatCard
          label="Scanners"
          value={String(overview?.scannerCount ?? 0)}
          hint="Barcode / keyboard wedge"
        />
        <StatCard
          label="Other peripherals"
          value={String(
            Math.max(
              0,
              (overview?.deviceCount ?? 0) -
                (overview?.printerCount ?? 0) -
                (overview?.scannerCount ?? 0),
            ),
          )}
          hint="Drawer, scale, display, labels"
        />
      </section>

      <Card className="border-slate-200">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={() => setGuideOpen((o) => !o)}
          aria-expanded={guideOpen}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">How hardware setup works</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Add device → set transport / MAC → preview invoice → print from desktop/mobile
            </p>
          </div>
          <span className="text-sm font-medium text-teal-700">{guideOpen ? 'Hide' : 'Show'}</span>
        </button>
        {guideOpen ? (
          <ol className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600 md:grid-cols-3">
            <li className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="font-semibold text-slate-900">1. Register devices</p>
              <p className="mt-1">
                Add each printer, scanner, or drawer with the settings your counter actually uses.
              </p>
            </li>
            <li className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="font-semibold text-slate-900">2. Configure printer</p>
              <p className="mt-1">
                Choose USB or Bluetooth. For BT, save the printer MAC address before print jobs.
              </p>
            </li>
            <li className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="font-semibold text-slate-900">3. Test a receipt</p>
              <p className="mt-1">
                Preview any invoice as ESC/POS, download a .bin, or queue a print job for the app.
              </p>
            </li>
          </ol>
        ) : null}
      </Card>

      {addOpen ? (
        <Card className="border-teal-200 bg-gradient-to-br from-teal-50/80 via-white to-white">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add device</h2>
              <p className="text-sm text-slate-500">
                Pick a device type and fill the settings used at this counter.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
          </div>

          <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activePresets.map((p) => (
              <button
                key={p.type}
                type="button"
                onClick={() => selectType(p.type)}
                className={cn(
                  'rounded-2xl border px-3 py-3 text-left transition',
                  deviceType === p.type
                    ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-100'
                    : 'border-slate-200 bg-white hover:border-teal-200',
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{p.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {p.blurb || 'Counter peripheral'}
                </p>
              </button>
            ))}
          </div>

          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void createDevice(e)}>
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Device name</span>
              <input
                className={inputClassName}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder={selectedPreset?.label || 'Device name'}
                required
              />
            </label>
            {renderFields(selectedPreset?.fields, createSettings, (key, value) =>
              setCreateSettings((prev) => ({ ...prev, [key]: value })),
            )}
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save device'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
                Close
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="border-teal-200 bg-gradient-to-br from-slate-50 via-white to-teal-50/40">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Thermal ESC/POS workshop</h2>
          <p className="mt-1 text-sm text-slate-500">
            Preview a receipt, download raw bytes, or prepare a print job for an active thermal printer.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Invoice</span>
            {invoices.length ? (
              <select
                className={selectClassName}
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
              >
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputClassName}
                placeholder="Paste invoice ID"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
              />
            )}
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Target printer</span>
            <select
              className={selectClassName}
              value={printerId}
              onChange={(e) => setPrinterId(e.target.value)}
            >
              <option value="">Auto (latest active) / preview only</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" disabled={printing} onClick={() => void previewThermal()}>
            {printing ? 'Working…' : 'Preview'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={printing}
            onClick={() => void printThermalJob()}
          >
            Prepare print job
          </Button>
          <Button type="button" variant="secondary" onClick={downloadEscpos}>
            Download .bin
          </Button>
          <Button type="button" variant="secondary" onClick={() => void copyPreview()}>
            Copy text
          </Button>
        </div>

        {thermalJob ? (
          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {thermalJob.printerName ? (
                <Badge color="teal">{thermalJob.printerName}</Badge>
              ) : (
                <Badge color="gray">Preview only</Badge>
              )}
              {thermalJob.transport ? <Badge color="gray">{thermalJob.transport}</Badge> : null}
              {thermalJob.paperWidth ? (
                <Badge color="gray">{thermalJob.paperWidth}mm</Badge>
              ) : null}
              {thermalJob.bluetoothAddress ? (
                <Badge color="amber">{thermalJob.bluetoothAddress}</Badge>
              ) : null}
            </div>
            {thermalJob.instructions || thermalJob.note ? (
              <p className="text-sm text-slate-600">{thermalJob.note || thermalJob.instructions}</p>
            ) : null}
            <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-xs leading-5 text-emerald-200 whitespace-pre-wrap">
              {thermalJob.text}
            </pre>
          </div>
        ) : null}
      </Card>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Registered devices</h2>
            <p className="text-sm text-slate-500">Pause, edit settings, or remove hardware for this shop.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className={cn(selectClassName, 'min-w-[11rem]')}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              {activePresets.map((p) => (
                <option key={p.type} value={p.type}>
                  {p.label}
                </option>
              ))}
            </select>
            {!addOpen ? (
              <Button type="button" variant="secondary" onClick={() => openAdd()}>
                Add another
              </Button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <AppLoader label="Loading hardware…" />
        ) : !filteredDevices.length ? (
          <EmptyState
            title={devices.length ? 'No devices in this filter' : 'No hardware yet'}
            description={
              devices.length
                ? 'Try another device type filter, or clear the filter.'
                : 'Add a thermal printer first so billing can prepare ESC/POS jobs.'
            }
            action={
              <Button type="button" onClick={() => openAdd(typeFilter || 'THERMAL_PRINTER')}>
                Add device
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredDevices.map((device) => {
              const preset = presetFor(activePresets, device.deviceType);
              const isEditing = editingId === device.id;
              return (
                <Card
                  key={device.id}
                  className={cn('border-slate-200', !device.isActive && 'opacity-80')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-slate-900">
                          {device.name}
                        </h3>
                        <Badge color={device.isActive ? 'green' : 'gray'}>
                          {device.isActive ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {preset?.label || device.deviceType}
                      </p>
                    </div>
                  </div>

                  {!isEditing ? (
                    <p className="mt-3 text-sm text-slate-600">
                      {summarizeSettings(device.settings, device.deviceType)}
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3">
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-700">Name</span>
                        <input
                          className={inputClassName}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </label>
                      {renderFields(preset?.fields, editSettings, (key, value) =>
                        setEditSettings((prev) => ({ ...prev, [key]: value })),
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyId === device.id}
                          onClick={() => void saveEdit(device)}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => startEdit(device)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busyId === device.id}
                          onClick={() => void toggleDevice(device)}
                        >
                          {device.isActive ? 'Pause' : 'Resume'}
                        </Button>
                        {device.deviceType === 'THERMAL_PRINTER' && device.isActive ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setPrinterId(device.id)}
                          >
                            Use for print
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busyId === device.id}
                          onClick={() => void removeDevice(device)}
                        >
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
