//! Núcleo do rsModMaster, sem UI: o mestre Modbus RTU/TCP ([`master`]), os quadros e a
//! decodificação do bus monitor ([`frame`]), configurações e sessão em TOML ([`settings`]) e os comandos de
//! diagnóstico do Tools (ping e porta TCP).

pub mod convert;
pub mod frame;
pub mod master;
pub mod msg;
pub mod settings;

use std::{
    net::{Ipv4Addr, SocketAddr, TcpStream},
    process::Command,
    time::Duration,
};

use serde::Serialize;

pub use master::{Event, Master, Outcome, Request, Rtu, SlaveId, Tcp};
pub use msg::Msg;
pub use settings::Settings;

const TOOL_TIMEOUT: Duration = Duration::from_secs(5);

/// IPv4 sem zeros à esquerda (`127.000.000.001` -> `127.0.0.1`), como o `stripIP` do qModMaster;
/// `None` se não forem 4 octetos de 0 a 255.
pub fn strip_ip(ip: &str) -> Option<Ipv4Addr> {
    let octets: Vec<u8> = ip
        .trim()
        .split('.')
        .map(|o| o.parse().ok())
        .collect::<Option<_>>()?;
    let [a, b, c, d] = octets[..] else {
        return None;
    };
    Some(Ipv4Addr::new(a, b, c, d))
}

/// Resultado do ping: o alvo, se respondeu e a saída do programa do sistema (no idioma dele).
#[derive(Debug, Clone, Serialize)]
pub struct Ping {
    pub target: String,
    pub success: bool,
    pub output: String,
}

/// Um ping pelo programa do sistema, com a saída dele.
pub fn ping(ip: &str) -> Result<Ping, Msg> {
    let target = strip_ip(ip).ok_or_else(|| msg!("invalid_ip", ip = ip))?;
    let target = target.to_string();
    // espera de 5 s: no Windows e no macOS em ms, no Linux em s
    let args: [&str; 4] = if cfg!(windows) {
        ["-n", "1", "-w", "5000"]
    } else if cfg!(target_os = "macos") {
        ["-c", "1", "-W", "5000"]
    } else {
        ["-c", "1", "-W", "5"]
    };
    let mut command = Command::new("ping");
    command.args(args).arg(&target);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: sem console piscando
    }
    let out = command.output().map_err(|err| msg!("other", text = err))?;
    let text: Vec<String> = [out.stdout, out.stderr]
        .iter()
        .map(|b| String::from_utf8_lossy(b).trim().to_owned())
        .filter(|t| !t.is_empty())
        .collect();
    Ok(Ping {
        target,
        success: out.status.success(),
        output: if text.is_empty() {
            out.status.to_string()
        } else {
            text.join("\n")
        },
    })
}

/// Se a porta TCP aceita conexão (5 s no máximo): `Ok("ip:porta")` se aceitou.
pub fn port_status(ip: &str, port: &str) -> Result<String, Msg> {
    let target = strip_ip(ip).ok_or_else(|| msg!("invalid_ip", ip = ip))?;
    let port: u16 = port
        .trim()
        .parse()
        .map_err(|_| msg!("invalid_port", port = port))?;
    let addr = SocketAddr::new(target.into(), port);
    TcpStream::connect_timeout(&addr, TOOL_TIMEOUT)
        .map(|_| addr.to_string())
        .map_err(|err| msg!("port_closed", target = addr, err = err))
}

/// Portas seriais do sistema, pelo nome.
pub fn serial_ports() -> Vec<String> {
    serialport::available_ports()
        .map(|ports| ports.into_iter().map(|p| p.port_name).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;

    use super::*;

    #[test]
    fn strip_ip_drops_leading_zeros_and_rejects_the_rest() {
        assert_eq!(strip_ip("127.000.000.001"), Some(Ipv4Addr::LOCALHOST));
        assert_eq!(strip_ip(" 10.6.6.1 "), Some(Ipv4Addr::new(10, 6, 6, 1)));
        for bad in ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "a.b.c.d"] {
            assert_eq!(strip_ip(bad), None, "{bad}");
        }
    }

    #[test]
    fn port_status_reports_open_and_closed() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port().to_string();
        assert_eq!(
            port_status("127.0.0.1", &port),
            Ok(format!("127.0.0.1:{port}"))
        );
        drop(listener);
        assert_eq!(
            port_status("127.0.0.1", &port).unwrap_err().code,
            "port_closed"
        );
        assert_eq!(
            port_status("127.0.0.1", "x").unwrap_err().code,
            "invalid_port"
        );
    }
}
