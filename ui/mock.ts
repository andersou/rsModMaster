// Página de desenvolvimento: a UI no navegador com o IPC do Tauri simulado (@tauri-apps/api/mocks),
// para testar e tirar prints sem o app nem um escravo Modbus. Não entra no build (só o index.html).
//   cd ui && sed 's#/src/main.tsx#/mock.ts#' index.html > mock.html && npx vite   ->  /mock.html
import { emit } from '@tauri-apps/api/event';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
mockWindows('main');
const settings = {
  tcpPort: '5020', slaveIp: '127.0.0.1', serialDev: '/dev/ttyS', serialPort: '1', serialPortName: '/dev/ttyS0', baud: '9600',
  dataBits: '8', stopBits: '1', parity: 'None', rts: 'None', maxNoOfLines: '60', baseAddr: '0', timeOut: '0', loggingLevel: 3,
  modbusMode: 1, slaveId: 1, scanRate: 1000, functionCode: 2, startAddr: 0, noOfRegs: 12, defaultBase: 1, floatEndian: 3, defaultConverter: '',
  registerFormats: { 2: 2, 4: 3, 8: 16 }, registerFloatEndians: { 4: 0 }, registerConverters: { 6: 'int16_div10' }, registerLabels: { 6: 'Temperature', 9: 'Pressure', 10: 'Tank level' },
  registerCharts: { 9: 0, 10: 1 },
};
let packets = 0;
// relógio simulado: cada leitura vale 300 ms, como um scan (para o print do gráfico)
const t0 = Date.now();
mockIPC(async (cmd, args) => {
  if (cmd === 'load_settings') return settings;
  if (cmd === 'connect_tcp') {
    await emit('log://log', { level: 3, message: 'TCP connected to 127.0.0.1:5020' });
    return null;
  }
  if (cmd === 'converters')
    return {
      dir: '/opt/rsModMaster/converters',
      converters: [
        { id: 'int16_div10', name: 'Int16 / 10', registers: 1, writable: true },
        { id: 'uint32_abcd', name: 'UInt32 ABCD', registers: 2, writable: true },
      ],
      errors: [],
      template: '',
    };
  if (cmd === 'converter_source')
    return `-- Signed 16-bit integer divided by 10 (e.g. temperature in tenths of a degree).
-- string.pack/unpack reinterpret the raw register: ">i2" = big-endian signed 16 bits.
return {
  name = "Int16 / 10",
  registers = 1,
  decode = function(regs)
    local value = string.unpack(">i2", string.pack(">I2", regs[1]))
    return string.format("%.1f", value / 10)
  end,
  encode = function(text)
    local value = tonumber(text) or error("number expected")
    local raw = math.floor(value * 10 + 0.5)
    if raw < -32768 or raw > 32767 then error("out of range (-3276.8 to 3276.7)") end
    return { raw & 0xFFFF }
  end,
}
`;
  if (cmd === 'convert_decode')
    return (args as { items: { id: string; regs: number[] }[] }).items.map(({ id, regs }) => ({
      value: id === 'uint32_abcd' ? String(regs[0] * 65536 + regs[1]) : (regs[0] / 10).toFixed(1),
    }));
  if (cmd === 'transaction') {
    const at = t0 + (packets + 1) * 300;
    await emit('core', [
      { kind: 'raw', tx: true, at, mode: 'TCP', hex: '00010000000601030000000C', fields: [['transaction', '1'], ['function', '0x03'], ['start', '0'], ['quantity', '12']] },
      { kind: 'raw', tx: false, at: at + 2, mode: 'TCP', hex: '00010000001B0103180000000100020003', fields: [['transaction', '1'], ['function', '0x03'], ['byteCount', '24']] },
    ]);
    const k = ++packets;
    if (k === 30) await emit('log://log', { level: 4, message: 'Slow response from slave 1 (980 ms)' });
    return { values: [0, 1, 2, 3, 0x4048, 0xf5c3, 6, 7, 8, Math.round(1000 + 800 * Math.sin(k / 3)), (k * 17) % 500, 11].map((v, i) => (i === 6 ? 236 + (k % 7) : v)), error: null, packets: k, errors: 0, at };
  }
  return null;
}, { shouldMockEvents: true });
await import('./src/main.tsx');
