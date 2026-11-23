//! Mensagens para a tela: um código estável e os parâmetros. A UI monta o texto no idioma dela
//! (`ui/src/i18n`, chave `errors.<código>`); o `Display` dá o texto em inglês para o log e os testes.

use std::{collections::BTreeMap, fmt};

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Msg {
    pub code: &'static str,
    pub args: BTreeMap<&'static str, String>,
}

/// `msg!("timeout")`, `msg!("wrong_slave", got = 2, expected = 1)`.
#[macro_export]
macro_rules! msg {
    ($code:literal $(, $name:ident = $value:expr)* $(,)?) => {
        $crate::Msg::new($code)$(.arg(stringify!($name), $value))*
    };
}

impl Msg {
    pub fn new(code: &'static str) -> Msg {
        Msg {
            code,
            args: BTreeMap::new(),
        }
    }

    pub fn arg(mut self, name: &'static str, value: impl fmt::Display) -> Msg {
        self.args.insert(name, value.to_string());
        self
    }
}

/// Texto em inglês de cada código, com `{nome}` no lugar dos parâmetros. Código novo: acrescente
/// aqui e em `errors` nos dicionários da UI (um teste do Vitest confere os dois lados).
fn english(code: &str) -> Option<&'static str> {
    Some(match code {
        "other" => "{text}",
        "io" => "{path}: {err}",
        "save_failed" => "Could not save {path}: {err}",
        "read_failed" => "Could not read {path}: {err}",
        "open_failed" => "Could not open {path}: {err}",
        "unsupported_function" => "Unsupported function code 0x{fc}",
        "bad_quantity" => "Number of items must be 1..{limit} for function 0x{fc}",
        "write_values" => "Write needs {count} value(s), got {got}",
        "malformed" => "Malformed response ({bytes} bytes)",
        "exception" => "Modbus exception {code} ({name})",
        "mismatch" => "Response does not match the request",
        "connect_serial" => "Connection failed on {port}: {err}",
        "connect_tcp" => "Connection failed to {addr}: {err}",
        "invalid_ip" => "Invalid IP address '{ip}'",
        "invalid_port" => "Invalid TCP port '{port}' (use 1..65535)",
        "not_connected" => "Not connected",
        "crc" => "CRC error in response",
        "wrong_slave" => "Response from slave {got} (expected {expected})",
        "timeout" => "No response (timeout)",
        "closed" => "Connection closed by the slave",
        "port_closed" => "{target} is closed ({err})",
        "too_many_items" => "At most {max} converters per call",
        "converter_id" => "Invalid converter name '{id}': use letters, digits, _ and -",
        "converter_size" => "Converter is larger than {kb} KB",
        "too_many_files" => "Only the first {max} converters were loaded",
        "memory" => "Memory limit exceeded",
        "instructions" => "Instruction limit exceeded ({max})",
        "name_type" => "name must be a string",
        "registers_range" => "registers must be an integer from 1 to {max}",
        "decode_missing" => "decode(regs) function is missing",
        "encode_type" => "encode must be a function",
        "converter_missing" => "Converter '{id}' not found",
        "decode_count" => "{id} needs {need} register(s), got {got}",
        "decode_type" => "decode must return a string or a number, got {got}",
        "read_only" => "{name} is read-only",
        "text_length" => "Text longer than {max} characters",
        "encode_table" => "encode must return a table of registers",
        "encode_integers" => "encode must return integers",
        "encode_count" => "encode returned {got} register(s), expected {expected}",
        "register_range" => "Register value {value} is outside 0..65535",
        _ => return None,
    })
}

impl fmt::Display for Msg {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut text = english(self.code).unwrap_or(self.code).to_owned();
        for (name, value) in &self.args {
            text = text.replace(&format!("{{{name}}}"), value);
        }
        f.write_str(&text)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn display_fills_the_english_template() {
        assert_eq!(
            msg!("wrong_slave", got = 2, expected = 1).to_string(),
            "Response from slave 2 (expected 1)"
        );
        assert_eq!(msg!("other", text = "boom").to_string(), "boom");
        assert_eq!(msg!("nope").to_string(), "nope");
    }
}
