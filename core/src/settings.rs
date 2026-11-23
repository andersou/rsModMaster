//! Configuração e sessão (`settings.toml`, `*.rmm-session.toml`) em TOML, com `version` no topo
//! para migrar o formato. Os padrões são os do qModMaster (`ModbusCommSettings`).

use std::{collections::BTreeMap, fs, io, path::Path};

use serde::{Deserialize, Serialize};

/// Campos texto no qModMaster continuam texto aqui (a UI edita e valida); `time_out` inclusive.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
// `default`: chave ausente no arquivo mantém o padrão
#[serde(rename_all = "camelCase", default)]
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
    /// Custom converter usado como formato padrão da tabela (vazio = nenhum).
    pub default_converter: String,
    /// Formato por endereço, quando difere do padrão (2 = Bin, 10 = Dec, 16 = Hex, 3 = Float).
    pub register_formats: BTreeMap<i64, i32>,
    pub register_float_endians: BTreeMap<i64, i32>,
    /// Custom converter por endereço inicial (id = nome do arquivo `.lua`).
    pub register_converters: BTreeMap<i64, String>,
    /// Nome dado ao registrador (tooltip, legenda do gráfico), até 32 caracteres.
    pub register_labels: BTreeMap<i64, String>,
    /// Registradores no gráfico: endereço -> cor (0..=7), que acompanha o registrador.
    pub register_charts: BTreeMap<i64, i32>,
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
            default_converter: String::new(),
            register_formats: BTreeMap::new(),
            register_float_endians: BTreeMap::new(),
            register_converters: BTreeMap::new(),
            register_labels: BTreeMap::new(),
            register_charts: BTreeMap::new(),
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

/// Versão do formato, gravada em `version` no topo. Mudança que o código antigo leria errado
/// (chave renomeada, codificação nova): suba e converta em `migrate`. Chave nova opcional não
/// precisa de versão nova.
pub const FORMAT_VERSION: i64 = 1;

/// Confere a versão e leva a tabela lida à versão atual, um passo por versão, em ordem. Versão mais
/// nova é erro: ler só o que se conhece e salvar por cima perderia o resto.
fn migrate(table: &mut toml::Table) -> io::Result<()> {
    let version = match table.remove("version") {
        Some(toml::Value::Integer(version)) if version >= 1 => version,
        Some(other) => return Err(invalid(format!("invalid version: {other}"))),
        None => return Err(invalid("not an rsModMaster file (no version)")),
    };
    if version > FORMAT_VERSION {
        return Err(invalid(format!(
            "format version {version} is newer than this app supports ({FORMAT_VERSION})"
        )));
    }
    // 1 é a primeira versão. Próxima: `if version < 2 { /* converte table */ }`.
    Ok(())
}

/// Mapas por endereço do `Settings` (o formato do IPC); no arquivo viram `[registers]`.
const REGISTER_MAPS: [&str; 5] = [
    "registerFormats",
    "registerFloatEndians",
    "registerConverters",
    "registerLabels",
    "registerCharts",
];

/// Uma linha de `[registers]`: `10 = { format = 3, label = "Tensão" }`, só com o que foi definido.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Register {
    /// 2 = Bin, 10 = Dec, 16 = Hex, 3 = Float.
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    float_endian: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    converter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    label: Option<String>,
    /// Cor no gráfico (0..=7).
    #[serde(skip_serializing_if = "Option::is_none")]
    chart: Option<i32>,
}

fn invalid(err: impl std::fmt::Display) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, err.to_string())
}

/// Rótulo aceito: uma linha, sem espaços nas pontas, 1 a 32 caracteres.
fn label(raw: &str) -> Option<String> {
    let text: String = raw.trim().chars().take(32).collect();
    (!text.is_empty() && !text.contains(['\n', '\r'])).then_some(text)
}

impl Settings {
    /// Lê `path` sobre os padrões. Sem o arquivo, os padrões; chave ausente mantém o padrão.
    pub fn load(path: &Path) -> io::Result<Settings> {
        match fs::read_to_string(path) {
            Ok(text) => Settings::parse(&text),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(Settings::default()),
            Err(err) => Err(err),
        }
    }

    /// Arquivo quebrado, sem `version` ou com valor de tipo errado é erro, nunca padrões calados.
    fn parse(text: &str) -> io::Result<Settings> {
        let mut table: toml::Table = text.parse().map_err(invalid)?;
        migrate(&mut table)?;
        let registers = match table.remove("registers") {
            Some(toml::Value::Table(registers)) => registers,
            Some(_) => return Err(invalid("registers: expected a table")),
            None => toml::Table::new(),
        };
        let mut settings: Settings = table.try_into().map_err(invalid)?;
        for (addr, register) in registers {
            let addr = addr
                .parse()
                .map_err(|_| invalid(format!("registers: {addr}")))?;
            settings.set_register(addr, register.try_into().map_err(invalid)?);
        }
        settings.validate();
        Ok(settings)
    }

    fn set_register(&mut self, addr: i64, register: Register) {
        if let Some(format) = register.format {
            self.register_formats.insert(addr, format);
        }
        if let Some(endian) = register.float_endian {
            self.register_float_endians.insert(addr, endian);
        }
        if let Some(id) = register.converter {
            self.register_converters.insert(addr, id);
        }
        if let Some(text) = register.label {
            self.register_labels.insert(addr, text);
        }
        if let Some(slot) = register.chart {
            self.register_charts.insert(addr, slot);
        }
    }

    fn registers(&self) -> BTreeMap<i64, Register> {
        let mut out = BTreeMap::<i64, Register>::new();
        for (&addr, &format) in &self.register_formats {
            out.entry(addr).or_default().format = Some(format);
        }
        for (&addr, &endian) in &self.register_float_endians {
            out.entry(addr).or_default().float_endian = Some(endian);
        }
        for (&addr, id) in &self.register_converters {
            out.entry(addr).or_default().converter = Some(id.clone());
        }
        for (&addr, text) in &self.register_labels {
            out.entry(addr).or_default().label = Some(text.clone());
        }
        for (&addr, &slot) in &self.register_charts {
            out.entry(addr).or_default().chart = Some(slot);
        }
        out
    }

    /// Arquivo pode vir de outra máquina: o id do converter vira nome de arquivo, o label vai para a
    /// tela e a cor indexa a paleta.
    fn validate(&mut self) {
        if !crate::convert::valid_id(&self.default_converter) {
            self.default_converter.clear();
        }
        self.register_converters
            .retain(|_, id| crate::convert::valid_id(id));
        self.register_labels = std::mem::take(&mut self.register_labels)
            .into_iter()
            .filter_map(|(addr, text)| Some((addr, label(&text)?)))
            .collect();
        self.register_charts.retain(|_, slot| (0..8).contains(slot));
    }

    /// Grava num `.tmp` ao lado e renomeia: uma queda no meio não deixa o arquivo cortado.
    pub fn save(&self, path: &Path) -> io::Result<()> {
        let mut tmp = path.as_os_str().to_owned();
        tmp.push(".tmp");
        fs::write(&tmp, self.to_toml().map_err(io::Error::other)?)?;
        fs::rename(&tmp, path)
    }

    fn to_toml(&self) -> Result<String, toml::ser::Error> {
        // sem os mapas: chave inteira não vira `Table` (`KeyNotString`), e eles vão em `[registers]`
        let flat = Settings {
            register_formats: BTreeMap::new(),
            register_float_endians: BTreeMap::new(),
            register_converters: BTreeMap::new(),
            register_labels: BTreeMap::new(),
            register_charts: BTreeMap::new(),
            ..self.clone()
        };
        let mut fields = toml::Table::try_from(flat)?;
        for key in REGISTER_MAPS {
            fields.remove(key);
        }
        let mut out = format!("version = {FORMAT_VERSION}\n{}", toml::to_string(&fields)?);
        let registers = self.registers();
        if !registers.is_empty() {
            // à mão: o serializer gravaria um `[registers.N]` por endereço, não uma linha inline
            out.push_str("\n[registers]\n");
            for (addr, register) in registers {
                out.push_str(&format!("{addr} = {}\n", toml::Value::try_from(register)?));
            }
        }
        Ok(out)
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
        let settings = Settings::load(&temp("missing.toml")).unwrap();
        assert_eq!(settings, Settings::default());
        assert_eq!(settings.tcp_port, "502");
        assert_eq!(settings.time_out, "0");
        if !cfg!(windows) {
            assert_eq!(settings.serial_port_name, "/dev/ttyS0");
        }
    }

    #[test]
    fn save_and_load_round_trip_in_toml() {
        let path = temp("roundtrip.rmm-session.toml");
        let mut settings = Settings {
            slave_ip: "192.168.0.10".into(),
            modbus_mode: 1,
            default_base: 2,
            ..Settings::default()
        };
        settings.register_formats.insert(10, 3);
        settings.register_float_endians.insert(-1, 3);
        settings
            .register_converters
            .insert(100, "UInt32_abcd".into());
        settings
            .register_labels
            .insert(100, "Tensão \"L1\" = fase".into());
        settings.register_charts.insert(100, 3);
        settings.default_converter = "int16_div10".into();
        settings.save(&path).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(
            text.starts_with("version = 1\ntcpPort = \"502\"\n"),
            "{text}"
        );
        assert!(text.contains("slaveIp = \"192.168.0.10\"\n"), "{text}");
        assert!(text.contains("modbusMode = 1\n"), "{text}");
        let registers = "\n[registers]\n-1 = { floatEndian = 3 }\n10 = { format = 3 }\n\
            100 = { converter = \"UInt32_abcd\", label = 'Tensão \"L1\" = fase', chart = 3 }\n";
        assert!(text.ends_with(registers), "{text}");
        assert!(!text.contains("registerFormats"), "{text}");
        assert_eq!(Settings::load(&path).unwrap(), settings);
        assert!(!fs::exists(path.with_extension("toml.tmp")).unwrap());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn missing_keys_keep_the_defaults_and_values_are_validated() {
        let text = "version = 1\nslaveId = 7\nnewKey = true\ndefaultConverter = \"../x\"\n\
            [registers]\n1 = { converter = \"ok_id\", chart = 9, label = \"  Pressão  \" }\n\
            2 = { converter = \"../x\", label = \" \" }\n\
            3 = { label = \"0123456789012345678901234567890123456789\" }\n";
        let settings = Settings::parse(text).unwrap();
        assert_eq!(settings.slave_id, 7);
        assert_eq!(settings.tcp_port, "502");
        assert_eq!(settings.default_converter, "");
        assert_eq!(
            settings.register_converters,
            BTreeMap::from([(1, "ok_id".to_owned())])
        );
        assert!(settings.register_charts.is_empty());
        assert_eq!(settings.register_labels[&1], "Pressão");
        assert!(!settings.register_labels.contains_key(&2));
        assert_eq!(settings.register_labels[&3].chars().count(), 32);
    }

    #[test]
    fn bad_files_are_errors_not_silent_defaults() {
        for text in [
            "version = 1\nslaveIp = 10.0.0.1\n",        // valor sem aspas
            "version = 1\nslaveId = 7\ntcpPort = \"50", // cortado no meio
            "slaveId = 7\n",                            // sem versão
            "version = 0\n",
            "version = \"1\"\n",
            "version = 2\n",                    // mais nova que o app
            "version = 1\nslaveId = \"abc\"\n", // tipo errado
            "version = 1\ntcpPort = 502\n",
            "version = 1\nregisters = 3\n",
            "version = 1\n[registers]\nx = { format = 3 }\n",
            "[TCP]\nTCPPort = 502\n", // INI do qModMaster
        ] {
            assert!(Settings::parse(text).is_err(), "{text}");
        }
    }
}
