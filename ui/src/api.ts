// Comandos e eventos do core (src/main.rs), tipados. Os argumentos vão em camelCase.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Catalog, ConvertResult, CoreEvent, Outcome, Request, Settings } from './lib/types';

export interface RtuConfig {
  port: string;
  baud: number;
  parity: string;
  dataBits: number;
  stopBits: number;
  rts: string;
  timeoutMs: string;
}

export interface TcpConfig {
  ip: string;
  port: string;
  timeoutMs: string;
}

export const api = {
  loadSettings: () => invoke<Settings>('load_settings'),
  saveSettings: (settings: Settings) => invoke<void>('save_settings', { settings }),
  /** `null`: o usuário cancelou o diálogo */
  loadSession: () => invoke<Settings | null>('load_session'),
  saveSession: (settings: Settings) => invoke<string | null>('save_session', { settings }),
  saveText: (text: string, name: string, title: string) => invoke<string | null>('save_text', { text, name, title }),
  serialPorts: () => invoke<string[]>('serial_ports'),
  connectRtu: (cfg: RtuConfig) => invoke<void>('connect_rtu', { cfg }),
  connectTcp: (cfg: TcpConfig) => invoke<void>('connect_tcp', { cfg }),
  disconnect: () => invoke<void>('disconnect'),
  transaction: (req: Request) => invoke<Outcome>('transaction', { req }),
  startScan: (req: Request, rateMs: number) => invoke<void>('start_scan', { req, rateMs }),
  stopScan: () => invoke<void>('stop_scan'),
  resetCounters: () => invoke<void>('reset_counters'),
  reportSlaveId: (slave: number) => invoke<string>('report_slave_id', { slave }),
  ping: (ip: string) => invoke<string>('ping', { ip }),
  portStatus: (ip: string, port: string) => invoke<string>('port_status', { ip, port }),
  openLog: () => invoke<void>('open_log'),
  /** com `reload`, relê a pasta de converters antes */
  converters: (reload = false) => invoke<Catalog>('converters', { reload }),
  convertDecode: (items: { id: string; regs: number[] }[]) => invoke<ConvertResult<string>[]>('convert_decode', { items }),
  convertEncode: (items: { id: string; text: string }[]) => invoke<ConvertResult<number[]>[]>('convert_encode', { items }),
  converterSource: (id: string) => invoke<string>('converter_source', { id }),
  saveConverter: (id: string, source: string) => invoke<Catalog>('save_converter', { id, source }),
  deleteConverter: (id: string) => invoke<Catalog>('delete_converter', { id }),
  openConvertersDir: () => invoke<void>('open_converters_dir'),
  openUrl,
  onCoreEvents: (handler: (events: CoreEvent[]) => void) => listen<CoreEvent[]>('core', (e) => handler(e.payload)),
};
