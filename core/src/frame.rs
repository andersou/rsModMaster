//! Quadros Modbus: montar o PDU de cada função, envelopar em RTU (CRC) ou TCP (MBAP), validar a
//! resposta e descrever um quadro bruto para o bus monitor.

use std::fmt::Write;

pub const READ_COILS: u8 = 0x01;
pub const READ_DISCRETE_INPUTS: u8 = 0x02;
pub const READ_HOLDING_REGISTERS: u8 = 0x03;
pub const READ_INPUT_REGISTERS: u8 = 0x04;
pub const WRITE_SINGLE_COIL: u8 = 0x05;
pub const WRITE_SINGLE_REGISTER: u8 = 0x06;
pub const WRITE_MULTIPLE_COILS: u8 = 0x0F;
pub const WRITE_MULTIPLE_REGISTERS: u8 = 0x10;
pub const REPORT_SLAVE_ID: u8 = 0x11;

const READS: [u8; 4] = [
    READ_COILS,
    READ_DISCRETE_INPUTS,
    READ_HOLDING_REGISTERS,
    READ_INPUT_REGISTERS,
];

/// PDU da requisição. `values` só conta nas escritas (bobina: 0 ou diferente de 0). Os limites
/// de quantidade são os da especificação: o escravo recusaria de qualquer jeito.
pub fn request_pdu(fc: u8, start: u16, count: u16, values: &[u16]) -> Result<Vec<u8>, String> {
    let mut pdu = vec![fc];
    pdu.extend(start.to_be_bytes());
    let limit = match fc {
        READ_COILS | READ_DISCRETE_INPUTS => 2000,
        READ_HOLDING_REGISTERS | READ_INPUT_REGISTERS => 125,
        WRITE_MULTIPLE_COILS => 1968,
        WRITE_MULTIPLE_REGISTERS => 123,
        WRITE_SINGLE_COIL | WRITE_SINGLE_REGISTER => 1,
        _ => return Err(format!("Unsupported function code 0x{fc:02X}")),
    };
    if count == 0 || count > limit {
        return Err(format!(
            "Number of items must be 1..{limit} for function 0x{fc:02X}"
        ));
    }
    // escrita: um valor por item, nem mais nem menos (nunca completar com 0 no equipamento)
    let write = matches!(
        fc,
        WRITE_SINGLE_COIL | WRITE_SINGLE_REGISTER | WRITE_MULTIPLE_COILS | WRITE_MULTIPLE_REGISTERS
    );
    if write && values.len() != usize::from(count) {
        return Err(format!(
            "Write needs {count} value(s), got {}",
            values.len()
        ));
    }
    let value = |i: usize| values[i];
    match fc {
        WRITE_SINGLE_COIL => pdu.extend(if value(0) != 0 { [0xFF, 0x00] } else { [0, 0] }),
        WRITE_SINGLE_REGISTER => pdu.extend(value(0).to_be_bytes()),
        WRITE_MULTIPLE_COILS => {
            let mut bits = vec![0u8; usize::from(count).div_ceil(8)];
            for i in 0..usize::from(count) {
                if value(i) != 0 {
                    bits[i / 8] |= 1 << (i % 8);
                }
            }
            pdu.extend(count.to_be_bytes());
            pdu.push(bits.len() as u8);
            pdu.extend(bits);
        }
        WRITE_MULTIPLE_REGISTERS => {
            pdu.extend(count.to_be_bytes());
            pdu.push((count * 2) as u8);
            (0..usize::from(count)).for_each(|i| pdu.extend(value(i).to_be_bytes()));
        }
        _ => pdu.extend(count.to_be_bytes()),
    }
    Ok(pdu)
}

/// Valores da resposta (PDU sem o endereço): bits como 0/1, registradores como u16. Numa
/// escrita, devolve o que foi escrito, como o qModMaster mostra.
pub fn response_values(
    fc: u8,
    count: u16,
    written: &[u16],
    pdu: &[u8],
) -> Result<Vec<u16>, String> {
    check_exception(fc, pdu)?;
    let n = usize::from(count);
    match fc {
        READ_COILS | READ_DISCRETE_INPUTS => {
            let data = payload(pdu, n.div_ceil(8))?;
            Ok((0..n)
                .map(|i| u16::from(data[i / 8] >> (i % 8) & 1))
                .collect())
        }
        READ_HOLDING_REGISTERS | READ_INPUT_REGISTERS => {
            let data = payload(pdu, n * 2)?;
            Ok(data
                .chunks(2)
                .map(|c| u16::from_be_bytes([c[0], c[1]]))
                .collect())
        }
        _ if pdu.len() == 5 => {
            let mut values: Vec<u16> = (0..n)
                .map(|i| written.get(i).copied().unwrap_or(0))
                .collect();
            if fc == WRITE_SINGLE_COIL {
                values[0] = u16::from(values[0] != 0);
            }
            Ok(values)
        }
        _ => Err(format!("Malformed response ({} bytes)", pdu.len())),
    }
}

/// Report Slave ID (0x11), como o pymodbus lê: o identificador são todos os bytes de dados e o
/// estado é o último (0xFF = ligado).
pub fn slave_id(pdu: &[u8]) -> Result<(bool, Vec<u8>), String> {
    check_exception(REPORT_SLAVE_ID, pdu)?;
    let count = usize::from(*pdu.get(1).ok_or("Malformed response")?);
    let data = pdu.get(2..2 + count).ok_or("Malformed response")?.to_vec();
    Ok((data.last() == Some(&0xFF), data))
}

fn check_exception(fc: u8, pdu: &[u8]) -> Result<(), String> {
    match pdu.first() {
        Some(&got) if got == fc | 0x80 => {
            let code = pdu.get(1).copied().unwrap_or(0);
            Err(format!(
                "Modbus exception {code} ({})",
                exception_name(code)
            ))
        }
        Some(&got) if got == fc => Ok(()),
        _ => Err("Response does not match the request".into()),
    }
}

/// Dados de uma resposta de leitura: byte count + `len` bytes.
fn payload(pdu: &[u8], len: usize) -> Result<&[u8], String> {
    if pdu.get(1).map(|&b| usize::from(b)) != Some(len) || pdu.len() < 2 + len {
        return Err(format!("Malformed response ({} bytes)", pdu.len()));
    }
    Ok(&pdu[2..2 + len])
}

fn exception_name(code: u8) -> &'static str {
    match code {
        1 => "illegal function",
        2 => "illegal data address",
        3 => "illegal data value",
        4 => "slave device failure",
        5 => "acknowledge",
        6 => "slave device busy",
        8 => "memory parity error",
        10 => "gateway path unavailable",
        11 => "gateway target failed to respond",
        _ => "unknown",
    }
}

/// CRC-16/Modbus (polinômio 0xA001), gravado little-endian no fim do quadro RTU.
pub fn crc16(data: &[u8]) -> u16 {
    data.iter().fold(0xFFFF, |crc, &byte| {
        (0..8).fold(crc ^ u16::from(byte), |c, _| {
            if c & 1 == 1 { c >> 1 ^ 0xA001 } else { c >> 1 }
        })
    })
}

pub fn rtu_adu(slave: u8, pdu: &[u8]) -> Vec<u8> {
    let mut adu = vec![slave];
    adu.extend(pdu);
    adu.extend(crc16(&adu).to_le_bytes());
    adu
}

pub fn tcp_adu(transaction: u16, unit: u8, pdu: &[u8]) -> Vec<u8> {
    let mut adu = transaction.to_be_bytes().to_vec();
    adu.extend([0, 0]);
    adu.extend((pdu.len() as u16 + 1).to_be_bytes());
    adu.push(unit);
    adu.extend(pdu);
    adu
}

/// Quantos bytes ainda faltam num quadro RTU de resposta, a partir do que já chegou (endereço,
/// função e, quando houver, o byte count). `None`: precisa ler mais um byte para saber.
pub fn rtu_remaining(head: &[u8]) -> Option<usize> {
    let fc = *head.get(1)?;
    let total = if fc & 0x80 != 0 {
        5
    } else if READS.contains(&fc) || fc == REPORT_SLAVE_ID {
        5 + usize::from(*head.get(2)?)
    } else {
        8
    };
    Some(total.saturating_sub(head.len()))
}

/// Campos de um quadro bruto, um por linha, para o painel ADU/PDU do bus monitor (mesmo texto
/// do fModMaster). `tx`: quadro enviado pelo mestre.
pub fn describe(tx: bool, tcp: bool, data: &[u8]) -> String {
    let mut out = String::new();
    let raw = hex(data);
    let header = if tcp { 8 } else { 4 };
    if data.len() < header {
        let mode = if tcp { "TCP" } else { "RTU" };
        return format!("Unparseable: {mode} ADU is too short\nRaw: {raw}");
    }
    let (pdu, crc) = if tcp {
        let word = |i: usize| u16::from_be_bytes([data[i], data[i + 1]]);
        let _ = write!(
            out,
            "Transaction ID: {}\nProtocol ID: {}\nLength: {}\nUnit ID: {}\n",
            word(0),
            word(2),
            word(4),
            data[6]
        );
        (&data[7..], None)
    } else {
        let n = data.len();
        let _ = writeln!(out, "Slave Address: {}", data[0]);
        (
            &data[1..n - 2],
            Some(u16::from_le_bytes([data[n - 2], data[n - 1]])),
        )
    };
    let fc = pdu[0];
    let p = &pdu[1..];
    let word = |i: usize| u16::from_be_bytes([p[i], p[i + 1]]);
    let _ = writeln!(out, "Function Code: 0x{fc:02X}");
    let single = matches!(fc, WRITE_SINGLE_COIL | WRITE_SINGLE_REGISTER);
    let multi = matches!(fc, WRITE_MULTIPLE_COILS | WRITE_MULTIPLE_REGISTERS);
    let read = READS.contains(&fc);
    if fc & 0x80 != 0 {
        if let Some(code) = p.first() {
            let _ = writeln!(out, "Exception Code: {code}");
        }
    } else {
        if (single || multi || read && tx) && p.len() >= 4 {
            let _ = writeln!(out, "Start Address: {}", word(0));
        }
        if (multi || read && tx) && p.len() >= 4 {
            let _ = writeln!(out, "Quantity: {}", word(2));
        }
        let values = if single && p.len() >= 4 {
            vec![word(2)]
        } else if multi && p.len() >= 5 {
            let _ = writeln!(out, "Byte Count: {}", p[4]);
            if tx {
                words(p.get(5..5 + usize::from(p[4])).unwrap_or(&p[5..]))
            } else {
                vec![]
            }
        } else if read && !tx && !p.is_empty() {
            let _ = writeln!(out, "Byte Count: {}", p[0]);
            words(p.get(1..1 + usize::from(p[0])).unwrap_or(&p[1..]))
        } else {
            vec![]
        };
        if !values.is_empty() {
            let list: Vec<String> = values.iter().map(u16::to_string).collect();
            let _ = writeln!(out, "Values: {}", list.join(", "));
        }
    }
    if let Some(crc) = crc {
        let _ = writeln!(out, "CRC: 0x{crc:04X}");
    }
    let _ = write!(out, "Raw: {raw}");
    out
}

/// Pares big-endian quando o tamanho é par; senão, byte a byte (como o fModMaster).
fn words(raw: &[u8]) -> Vec<u16> {
    if raw.len() >= 2 && raw.len().is_multiple_of(2) {
        raw.chunks(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect()
    } else {
        raw.iter().map(|&b| u16::from(b)).collect()
    }
}

pub fn hex(data: &[u8]) -> String {
    data.iter().map(|b| format!("{b:02X}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rtu_frames_carry_the_modbus_crc() {
        // exemplo clássico: escravo 1, lê 2 registradores a partir de 0 -> CRC C4 0B
        let pdu = request_pdu(READ_HOLDING_REGISTERS, 0, 2, &[]).unwrap();
        assert_eq!(rtu_adu(1, &pdu), [0x01, 0x03, 0, 0, 0, 2, 0xC4, 0x0B]);
        assert_eq!(crc16(&[0x01, 0x03, 0, 0, 0, 2, 0xC4, 0x0B]), 0);
    }

    #[test]
    fn tcp_frames_carry_the_mbap_header() {
        let pdu = request_pdu(READ_COILS, 0x13, 0x25, &[]).unwrap();
        assert_eq!(
            tcp_adu(7, 0x11, &pdu),
            [0, 7, 0, 0, 0, 6, 0x11, 1, 0, 0x13, 0, 0x25]
        );
    }

    #[test]
    fn writes_encode_coils_and_registers() {
        assert_eq!(
            request_pdu(WRITE_SINGLE_COIL, 0xAC, 1, &[1]).unwrap(),
            [5, 0, 0xAC, 0xFF, 0]
        );
        assert_eq!(
            request_pdu(WRITE_SINGLE_REGISTER, 1, 1, &[3]).unwrap(),
            [6, 0, 1, 0, 3]
        );
        // spec: 10 bobinas a partir de 0x13 = CD 01
        let coils = [1, 0, 1, 1, 0, 0, 1, 1, 1, 0];
        assert_eq!(
            request_pdu(WRITE_MULTIPLE_COILS, 0x13, 10, &coils).unwrap(),
            [0x0F, 0, 0x13, 0, 10, 2, 0xCD, 0x01]
        );
        assert_eq!(
            request_pdu(WRITE_MULTIPLE_REGISTERS, 1, 2, &[0x0A, 0x102]).unwrap(),
            [0x10, 0, 1, 0, 2, 4, 0, 0x0A, 1, 2]
        );
    }

    #[test]
    fn writes_need_exactly_one_value_per_item() {
        assert!(request_pdu(WRITE_SINGLE_REGISTER, 0, 1, &[]).is_err());
        assert!(request_pdu(WRITE_MULTIPLE_REGISTERS, 0, 2, &[7]).is_err());
        assert!(request_pdu(WRITE_MULTIPLE_COILS, 0, 2, &[1, 0, 1]).is_err());
        assert!(request_pdu(READ_HOLDING_REGISTERS, 0, 2, &[]).is_ok());
    }

    #[test]
    fn quantities_outside_the_spec_are_refused() {
        assert!(request_pdu(READ_HOLDING_REGISTERS, 0, 0, &[]).is_err());
        assert!(request_pdu(READ_HOLDING_REGISTERS, 0, 126, &[]).is_err());
        assert!(request_pdu(READ_COILS, 0, 2000, &[]).is_ok());
        assert!(request_pdu(0x2B, 0, 1, &[]).is_err());
    }

    #[test]
    fn responses_decode_bits_registers_and_exceptions() {
        let bits = response_values(READ_COILS, 10, &[], &[1, 2, 0xCD, 0x01]).unwrap();
        assert_eq!(bits, [1, 0, 1, 1, 0, 0, 1, 1, 1, 0]);
        let regs =
            response_values(READ_INPUT_REGISTERS, 2, &[], &[4, 4, 0, 1, 0xFF, 0xFE]).unwrap();
        assert_eq!(regs, [1, 0xFFFE]);
        let err = response_values(READ_HOLDING_REGISTERS, 1, &[], &[0x83, 2]).unwrap_err();
        assert_eq!(err, "Modbus exception 2 (illegal data address)");
        // byte count errado não vira valor inventado
        assert!(response_values(READ_HOLDING_REGISTERS, 2, &[], &[3, 2, 0, 1]).is_err());
        assert!(response_values(READ_COILS, 1, &[], &[3, 1, 1]).is_err());
        let written = response_values(WRITE_SINGLE_COIL, 1, &[5], &[5, 0, 1, 0xFF, 0]).unwrap();
        assert_eq!(written, [1]);
    }

    #[test]
    fn report_slave_id_reads_status_from_the_last_byte() {
        assert_eq!(
            slave_id(&[0x11, 3, 0x2A, 0x10, 0xFF]).unwrap(),
            (true, vec![0x2A, 0x10, 0xFF])
        );
        assert!(!slave_id(&[0x11, 2, 0x2A, 0]).unwrap().0);
        assert!(slave_id(&[0x91, 1]).is_err());
    }

    #[test]
    fn rtu_reader_knows_how_much_is_left() {
        assert_eq!(rtu_remaining(&[1]), None);
        assert_eq!(rtu_remaining(&[1, 3]), None);
        assert_eq!(rtu_remaining(&[1, 3, 4]), Some(6));
        assert_eq!(rtu_remaining(&[1, 0x83]), Some(3));
        assert_eq!(rtu_remaining(&[1, 6]), Some(6));
    }

    #[test]
    fn describe_matches_the_fmodmaster_bus_monitor() {
        let tx = describe(true, false, &[1, 3, 0, 0x3A, 0, 2, 0xE5, 0xC6]);
        assert_eq!(
            tx,
            "Slave Address: 1\nFunction Code: 0x03\nStart Address: 58\nQuantity: 2\nCRC: 0xC6E5\nRaw: 0103003A0002E5C6"
        );
        let rx = describe(false, true, &[0, 1, 0, 0, 0, 7, 1, 3, 4, 0, 1, 0, 2]);
        assert_eq!(
            rx,
            "Transaction ID: 1\nProtocol ID: 0\nLength: 7\nUnit ID: 1\nFunction Code: 0x03\nByte Count: 4\nValues: 1, 2\nRaw: 00010000000701030400010002"
        );
        assert!(
            describe(false, false, &[1, 0x83, 2]).starts_with("Unparseable: RTU ADU is too short")
        );
        assert!(describe(false, false, &[1, 0x83, 2, 0xC0, 0xF1]).contains("Exception Code: 2"));
    }
}
