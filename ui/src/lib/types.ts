// Tipos do que vai e volta pelo IPC (camelCase, como o serde do core).

/** INI do qModMaster (core/src/settings.rs). */
export interface Settings {
  tcpPort: string;
  slaveIp: string;
  serialDev: string;
  serialPort: string;
  serialPortName: string;
  baud: string;
  dataBits: string;
  stopBits: string;
  parity: string;
  rts: string;
  maxNoOfLines: string;
  baseAddr: string;
  timeOut: string;
  loggingLevel: number;
  /** 0 = RTU, 1 = TCP */
  modbusMode: number;
  slaveId: number;
  scanRate: number;
  /** índice em FUNCTIONS */
  functionCode: number;
  startAddr: number;
  noOfRegs: number;
  /** índice do qModMaster: 0 Hex, 1 Dec, 2 Bin, 3 Float */
  defaultBase: number;
  floatEndian: number;
  /** endereço -> base (2, 10, 16 ou 3 = float) */
  registerFormats: Record<string, number>;
  registerFloatEndians: Record<string, number>;
}

export interface Request {
  slave: number;
  function: number;
  start: number;
  count: number;
  values?: number[];
}

export interface Outcome {
  values: number[];
  error: string | null;
  packets: number;
  errors: number;
}

export type CoreEvent =
  | { kind: 'raw'; tx: boolean; at: number; mode: 'RTU' | 'TCP'; hex: string; detail: string }
  | ({ kind: 'scan' } & Outcome);
