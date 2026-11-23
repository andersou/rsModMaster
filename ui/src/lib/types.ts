// Tipos do que vai e volta pelo IPC (camelCase, como o serde do core).

/** Erro do core (`core/src/msg.rs`): código e parâmetros; o texto sai de `errorText` (i18n). */
export interface Msg {
  code: string;
  args: Record<string, string>;
}

/** Configurações e sessão (core/src/settings.rs), gravadas em TOML. */
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
  /** custom converter usado como formato padrão da tabela ('' = nenhum) */
  defaultConverter: string;
  /** endereço -> base (2, 10, 16 ou 3 = float) */
  registerFormats: Record<string, number>;
  registerFloatEndians: Record<string, number>;
  /** endereço inicial -> id do custom converter (arquivo .lua) */
  registerConverters: Record<string, string>;
  /** endereço -> nome dado ao registrador */
  registerLabels: Record<string, string>;
  /** endereço -> cor da série no gráfico (0..7) */
  registerCharts: Record<string, number>;
}

export interface ConverterInfo {
  id: string;
  name: string;
  registers: number;
  writable: boolean;
}

/** Converters carregados da pasta, com os arquivos que não carregaram. */
export interface Catalog {
  dir: string;
  converters: ConverterInfo[];
  errors: { file: string; message: Msg }[];
  template: string;
}

/** Resultado de um item de decode/encode: o valor ou o erro do script. */
export interface ConvertResult<T> {
  value?: T;
  error?: Msg;
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
  error: Msg | null;
  packets: number;
  errors: number;
  /** fim da transação, ms desde 1970 */
  at: number;
}

export type CoreEvent =
  | { kind: 'raw'; tx: boolean; at: number; mode: 'RTU' | 'TCP'; hex: string; fields: [string, string][] }
  | ({ kind: 'scan' } & Outcome);

/** Report Slave ID: estado (último byte 0xFF) e os bytes de dados (o primeiro é o id). */
export interface SlaveId {
  running: boolean;
  data: number[];
}

export interface Ping {
  target: string;
  success: boolean;
  /** saída do programa ping do sistema, no idioma dele */
  output: string;
}
