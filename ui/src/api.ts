// Comandos e eventos do core (src/main.rs), tipados. Os argumentos vão em camelCase.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { CoreEvent, Outcome, Request, Settings } from './lib/types';

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
  saveText: (text: string, name: string) => invoke<string | null>('save_text', { text, name }),
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
  openUrl,
  onCoreEvents: (handler: (events: CoreEvent[]) => void) => listen<CoreEvent[]>('core', (e) => handler(e.payload)),
};
