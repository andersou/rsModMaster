// Regras dos campos de configuração (sem UI).

/** IPv4 de 4 octetos 0..255, aceitando zeros à esquerda como o qModMaster. */
export const validIp = (ip: string) => {
  const parts = ip.trim().split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
};

export const validPort = (port: string) => /^\d{1,5}$/.test(port.trim()) && Number(port) >= 1 && Number(port) <= 65535;

/** `serialDev` e `serialPort` da sessão a partir do nome da porta (`/dev/ttyS0` -> `/dev/ttyS`, `1`),
 *  o inverso do `setSerialPort` do qModMaster. */
export function splitSerialPortName(name: string): [string, string] {
  const cleaned = name.trim().replace(/^\\\\\.\\/, '');
  const digits = /\d+$/.exec(cleaned)?.[0] ?? '';
  const prefix = digits ? cleaned.slice(0, -digits.length) : cleaned;
  const number = !digits ? '1' : prefix.startsWith('/dev/ttyS') ? String(Number(digits) + 1) : digits;
  return [prefix, number];
}
