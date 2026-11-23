import { describe, expect, it } from 'vitest';
import { splitSerialPortName, validIp, validPort } from './settings';

describe('configuração', () => {
  it('IP e porta', () => {
    expect(validIp('127.000.000.001')).toBe(true);
    expect(validIp('256.1.1.1')).toBe(false);
    expect(validIp('1.2.3')).toBe(false);
    expect(validPort('502')).toBe(true);
    expect(validPort('0')).toBe(false);
    expect(validPort('65536')).toBe(false);
  });

  it('separa o nome da porta serial como o fModMaster', () => {
    expect(splitSerialPortName('/dev/ttyS0')).toEqual(['/dev/ttyS', '1']);
    expect(splitSerialPortName('/dev/ttyUSB3')).toEqual(['/dev/ttyUSB', '3']);
    expect(splitSerialPortName('\\\\.\\COM12')).toEqual(['COM', '12']);
    expect(splitSerialPortName('/dev/cu.usbserial')).toEqual(['/dev/cu.usbserial', '1']);
  });
});
