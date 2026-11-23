//! Configuração e sessão no formato INI do qModMaster (`ModbusCommSettings`): os mesmos grupos,
//! chaves e padrões, para que `fModMaster.ini` e os `.ses` sigam valendo nos dois programas.
//! Chaves são lidas sem diferenciar maiúsculas (o fModMaster em Python gravava tudo minúsculo) e
//! gravadas como o qModMaster grava.

use std::{collections::BTreeMap, fs, io, path::Path};

use serde::{Deserialize, Serialize};

/// Campos texto no qModMaster continuam texto aqui (a UI edita e valida); `time_out` inclusive.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    // [TCP]
    pub tcp_port: String,
    pub slave_ip: String,
    // [RTU]
    pub serial_dev: String,
    pub serial_port: String,
    pub serial_port_name: String,
    pub baud: String,
    pub data_bits: String,
    pub stop_bits: String,
    pub parity: String,
    pub rts: String,
    // [Var]
    pub max_no_of_lines: String,
    pub base_addr: String,
    pub time_out: String,
    pub logging_level: i32,
    // [Session]
    /// 0 = RTU, 1 = TCP.
    pub modbus_mode: i32,
    pub slave_id: i32,
    pub scan_rate: i32,
    /// Índice na lista de funções da tela (0 = Read Coils), como o qModMaster grava.
    pub function_code: i32,
    pub start_addr: i32,
    pub no_of_regs: i32,
    /// Formato padrão no índice do qModMaster: 0 = Hex, 1 = Dec, 2 = Bin, 3 = Float.
    pub default_base: i32,
    pub float_endian: i32,
    /// Formato por endereço, quando difere do padrão (2 = Bin, 10 = Dec, 16 = Hex, 3 = Float).
    pub register_formats: BTreeMap<i64, i32>,
    pub register_float_endians: BTreeMap<i64, i32>,
    /// Custom converter por endereço inicial (id = nome do arquivo `.lua`).
    #[serde(default)]
    pub register_converters: BTreeMap<i64, String>,
}

impl Default for Settings {
    fn default() -> Self {
        let win = cfg!(windows);
        let serial_dev = if win { "COM" } else { "/dev/ttyS" }.to_owned();
        let serial_port = "1".to_owned();
        Settings {
            tcp_port: "502".into(),
            slave_ip: "127.0.0.1".into(),
            serial_port_name: serial_port_name(&serial_dev, &serial_port),
            serial_dev,
            serial_port,
            baud: "9600".into(),
            data_bits: "8".into(),
            stop_bits: "1".into(),
            parity: "None".into(),
            rts: if win { "Disable" } else { "None" }.into(),
            max_no_of_lines: "60".into(),
            base_addr: "0".into(),
            time_out: "0".into(),
            logging_level: 3,
            modbus_mode: 0,
            slave_id: 1,
            scan_rate: 1000,
            function_code: 0,
            start_addr: 0,
            no_of_regs: 0,
            default_base: 1,
            float_endian: 0,
            register_formats: BTreeMap::new(),
            register_float_endians: BTreeMap::new(),
            register_converters: BTreeMap::new(),
        }
    }
}

/// `ModbusCommSettings::setSerialPort`: `COMn` (ou `\\.\COMn` acima de 9) no Windows; no resto,
/// o dispositivo + (n - 1).
fn serial_port_name(dev: &str, port: &str) -> String {
    match port.parse::<i64>() {
        Ok(n) if cfg!(windows) && n > 9 => format!("\\\\.\\COM{port}"),
        _ if cfg!(windows) => format!("COM{port}"),
        Ok(n) => format!("{dev}{}", n - 1),
        Err(_) => format!("{dev}{port}"),
    }
}

type Ini = BTreeMap<String, BTreeMap<String, String>>;

/// INI mínimo: `[seção]`, `chave = valor` (ou `:`), comentários `#`/`;`. Chaves em minúsculas.
fn parse_ini(text: &str) -> Ini {
    let mut ini = Ini::new();
    let mut section = String::new();
    for line in text.lines().map(str::trim) {
        if line.is_empty() || line.starts_with(['#', ';']) {
            continue;
        }
        if let Some(name) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
            section = name.trim().to_owned();
        } else if let Some((key, value)) = line.split_once(['=', ':']) {
            ini.entry(section.clone())
                .or_default()
                .insert(key.trim().to_lowercase(), value.trim().to_owned());
        }
    }
    ini
}

impl Settings {
    /// Lê `path` sobre os padrões. Sem o arquivo, os padrões; chave ausente ou número inválido
    /// mantém o padrão daquele campo (como o qModMaster e o fModMaster).
    pub fn load(path: &Path) -> io::Result<Settings> {
        let mut settings = Settings::default();
        match fs::read_to_string(path) {
            Ok(text) => settings.overlay(&parse_ini(&text)),
            Err(err) if err.kind() == io::ErrorKind::NotFound => {}
            Err(err) => return Err(err),
        }
        Ok(settings)
    }

    fn overlay(&mut self, ini: &Ini) {
        let get = |section: &str, key: &str| ini.get(section)?.get(key).cloned();
        let text = |field: &mut String, section: &str, key: &str| {
            if let Some(value) = get(section, key) {
                *field = value;
            }
        };
        let int = |field: &mut i32, section: &str, key: &str| {
            if let Some(value) = get(section, key).and_then(|v| v.parse().ok()) {
                *field = value;
            }
        };
        text(&mut self.tcp_port, "TCP", "tcpport");
        text(&mut self.slave_ip, "TCP", "slaveip");
        if !cfg!(windows) {
            text(&mut self.serial_dev, "RTU", "serialdev"); // no Windows o qModMaster força "COM"
        }
        text(&mut self.serial_port, "RTU", "serialport");
        text(&mut self.serial_port_name, "RTU", "serialportname");
        text(&mut self.baud, "RTU", "baud");
        text(&mut self.data_bits, "RTU", "databits");
        text(&mut self.stop_bits, "RTU", "stopbits");
        text(&mut self.parity, "RTU", "parity");
        text(&mut self.rts, "RTU", "rts");
        // MaxNoOfLines = 0 volta ao padrão, como no qModMaster
        if let Some(lines) = get("Var", "maxnooflines").filter(|v| v.parse() != Ok(0)) {
            self.max_no_of_lines = lines;
        }
        text(&mut self.base_addr, "Var", "baseaddr");
        text(&mut self.time_out, "Var", "timeout");
        int(&mut self.logging_level, "Var", "logginglevel");
        int(&mut self.modbus_mode, "Session", "modbusmode");
        int(&mut self.slave_id, "Session", "slaveid");
        int(&mut self.scan_rate, "Session", "scanrate");
        int(&mut self.function_code, "Session", "functioncode");
        int(&mut self.start_addr, "Session", "startaddr");
        int(&mut self.no_of_regs, "Session", "noofregs");
        // Base é a chave do qModMaster; DefaultBase, quando existe, vale sobre ela
        int(&mut self.default_base, "Session", "base");
        int(&mut self.default_base, "Session", "defaultbase");
        int(&mut self.float_endian, "Session", "floatendian");
        let map = |section: &str| -> Option<BTreeMap<i64, i32>> {
            let entries = ini.get(section)?.iter();
            Some(
                entries
                    .filter_map(|(k, v)| Some((k.parse().ok()?, v.parse().ok()?)))
                    .collect(),
            )
        };
        if let Some(formats) = map("RegisterFormats") {
            self.register_formats = formats;
        }
        if let Some(endians) = map("RegisterFloatEndians") {
            self.register_float_endians = endians;
        }
        if let Some(entries) = ini.get("RegisterConverters") {
            self.register_converters = entries
                .iter()
                .filter_map(|(k, v)| Some((k.parse().ok()?, v.clone())))
                .filter(|(_, id): &(i64, String)| crate::convert::valid_id(id))
                .collect();
        }
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        fs::write(path, self.to_ini())
    }

    fn to_ini(&self) -> String {
        let mut sections: Vec<(&str, Vec<(String, String)>)> = vec![
            (
                "TCP",
                vec![
                    ("TCPPort".into(), self.tcp_port.clone()),
                    ("SlaveIP".into(), self.slave_ip.clone()),
                ],
            ),
            (
                "RTU",
                vec![
                    ("SerialDev".into(), self.serial_dev.clone()),
                    ("SerialPort".into(), self.serial_port.clone()),
                    ("SerialPortName".into(), self.serial_port_name.clone()),
                    ("Baud".into(), self.baud.clone()),
                    ("DataBits".into(), self.data_bits.clone()),
                    ("StopBits".into(), self.stop_bits.clone()),
                    ("Parity".into(), self.parity.clone()),
                    ("RTS".into(), self.rts.clone()),
                ],
            ),
            (
                "Var",
                vec![
                    ("MaxNoOfLines".into(), self.max_no_of_lines.clone()),
                    ("BaseAddr".into(), self.base_addr.clone()),
                    ("TimeOut".into(), self.time_out.clone()),
                    ("LoggingLevel".into(), self.logging_level.to_string()),
                ],
            ),
            (
                "Session",
                [
                    ("ModBusMode", self.modbus_mode),
                    ("SlaveID", self.slave_id),
                    ("ScanRate", self.scan_rate),
                    ("FunctionCode", self.function_code),
                    ("StartAddr", self.start_addr),
                    ("NoOfRegs", self.no_of_regs),
                    ("Base", self.default_base),
                    ("DefaultBase", self.default_base),
                    ("FloatEndian", self.float_endian),
                ]
                .map(|(k, v)| (k.to_owned(), v.to_string()))
                .into(),
            ),
        ];
        let pairs = |map: &BTreeMap<i64, i32>| -> Vec<(String, String)> {
            map.iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect()
        };
        if !self.register_formats.is_empty() {
            sections.push(("RegisterFormats", pairs(&self.register_formats)));
        }
        if !self.register_float_endians.is_empty() {
            sections.push(("RegisterFloatEndians", pairs(&self.register_float_endians)));
        }
        if !self.register_converters.is_empty() {
            let entries = self.register_converters.iter();
            sections.push((
                "RegisterConverters",
                entries.map(|(k, v)| (k.to_string(), v.clone())).collect(),
            ));
        }
        let mut out = String::new();
        for (name, entries) in sections {
            out.push_str(&format!("[{name}]\n"));
            for (key, value) in entries {
                out.push_str(&format!("{key} = {value}\n"));
            }
            out.push('\n');
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("rsmodmaster-{}-{name}", std::process::id()))
    }

    #[test]
    fn missing_file_gives_the_qmodmaster_defaults() {
        let settings = Settings::load(&temp("missing.ini")).unwrap();
        assert_eq!(settings, Settings::default());
        assert_eq!(settings.tcp_port, "502");
        assert_eq!(settings.time_out, "0");
        if !cfg!(windows) {
            assert_eq!(settings.serial_port_name, "/dev/ttyS0");
        }
    }

    #[test]
    fn reads_the_lowercase_ini_written_by_fmodmaster() {
        // o fModMaster.ini do repositório Python, como o configparser grava
        let text = "[TCP]\ntcpport = 502\nslaveip = 10.6.6.1\n\n[RTU]\nbaud = 19200\nparity = Even\n\n\
            [Var]\nmaxnooflines = 0\ntimeout = 0\n\n[Session]\nmodbusmode = 1\nfunctioncode = 2\n\
            startaddr = 58\nnoofregs = 2\nbase = 1\ndefaultbase = 3\nfloatendian = 2\n\n\
            [RegisterFormats]\n0 = 3\n58 = 2\nlixo = 1\n\n[RegisterFloatEndians]\n0 = 1\n";
        let mut settings = Settings::default();
        settings.overlay(&parse_ini(text));
        assert_eq!(settings.slave_ip, "10.6.6.1");
        assert_eq!(settings.baud, "19200");
        assert_eq!(settings.parity, "Even");
        assert_eq!(settings.max_no_of_lines, "60"); // 0 volta ao padrão
        assert_eq!(settings.modbus_mode, 1);
        assert_eq!((settings.start_addr, settings.no_of_regs), (58, 2));
        assert_eq!(settings.default_base, 3); // DefaultBase vale sobre Base
        assert_eq!(settings.float_endian, 2);
        assert_eq!(settings.register_formats, BTreeMap::from([(0, 3), (58, 2)]));
        assert_eq!(settings.register_float_endians, BTreeMap::from([(0, 1)]));
    }

    #[test]
    fn converter_ids_that_are_not_file_names_are_dropped() {
        let mut settings = Settings::default();
        settings.overlay(&parse_ini(
            "[RegisterConverters]\n10 = ok_id\n11 = ../x\nabc = y\n",
        ));
        assert_eq!(
            settings.register_converters,
            BTreeMap::from([(10, "ok_id".to_owned())])
        );
    }

    #[test]
    fn invalid_numbers_keep_the_default() {
        let mut settings = Settings::default();
        settings.overlay(&parse_ini("[Session]\nSlaveID = abc\nScanRate = 250\n"));
        assert_eq!((settings.slave_id, settings.scan_rate), (1, 250));
    }

    #[test]
    fn save_and_load_round_trip_with_qmodmaster_keys() {
        let path = temp("roundtrip.ses");
        let mut settings = Settings {
            slave_ip: "192.168.0.10".into(),
            modbus_mode: 1,
            default_base: 2,
            ..Settings::default()
        };
        settings.register_formats.insert(10, 3);
        settings.register_float_endians.insert(10, 3);
        settings
            .register_converters
            .insert(100, "UInt32_abcd".into());
        settings.save(&path).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("[Session]\nModBusMode = 1\n"), "{text}");
        assert!(text.contains("SlaveIP = 192.168.0.10"));
        assert!(
            text.contains("[RegisterConverters]\n100 = UInt32_abcd\n"),
            "{text}"
        );
        assert_eq!(Settings::load(&path).unwrap(), settings);
        fs::remove_file(path).unwrap();
    }
}
