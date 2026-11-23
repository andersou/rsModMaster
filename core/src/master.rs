//! O mestre Modbus: a conexão (serial RTU ou TCP), uma transação por vez, o scan numa thread e
//! os eventos que a tela recebe (quadros brutos e resultados do scan).

use std::{
    io::{self, Read, Write},
    net::{SocketAddr, TcpStream},
    sync::{
        Arc, Mutex,
        mpsc::{self, Receiver, RecvTimeoutError, Sender},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serialport::{DataBits, Parity, SerialPort, StopBits};

use crate::frame;

/// Tempo de resposta: o qModMaster grava `TimeOut = 0`, o que não serve; menos de 1 s vira 1 s.
pub fn timeout(ms: &str) -> Duration {
    let ms = ms.trim().parse::<f64>().map_or(1000, |v| v as u64);
    Duration::from_millis(ms.max(1000))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rtu {
    pub port: String,
    pub baud: u32,
    /// "None", "Even", "Odd" (basta a inicial).
    pub parity: String,
    pub data_bits: u8,
    pub stop_bits: u8,
    /// "None"/"Disable" não mexe no RTS; "Enable"/"True"/"1" liga; o resto desliga.
    pub rts: String,
    pub timeout_ms: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tcp {
    pub ip: String,
    pub port: String,
    pub timeout_ms: String,
}

/// Uma transação: função, escravo, endereço inicial, quantidade e, nas escritas, os valores.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub slave: u8,
    pub function: u8,
    pub start: u16,
    pub count: u16,
    #[serde(default)]
    pub values: Vec<u16>,
}

/// Resultado de uma transação, com os contadores depois dela. Erro: `values` vazio e a mensagem.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub values: Vec<u16>,
    pub error: Option<String>,
    pub packets: u64,
    pub errors: u64,
    /// Fim da transação, em ms desde 1970: o gráfico usa esta hora, não a de chegada (os eventos
    /// do scan chegam em lote).
    pub at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Event {
    /// Quadro enviado (`tx`) ou recebido, com a hora (ms desde 1970) e os campos decodificados.
    Raw {
        tx: bool,
        at: u64,
        mode: &'static str,
        hex: String,
        detail: String,
    },
    /// Resultado de cada volta do scan.
    Scan(Outcome),
}

enum Link {
    Serial {
        port: Box<dyn SerialPort>,
        /// silêncio de 3,5 caracteres entre quadros
        gap: Duration,
    },
    Tcp {
        stream: Option<TcpStream>,
        addr: SocketAddr,
        timeout: Duration,
        transaction: u16,
    },
}

struct State {
    link: Option<Link>,
    packets: u64,
    errors: u64,
}

struct Scan {
    stop: Sender<()>,
    thread: JoinHandle<()>,
}

pub struct Master {
    state: Arc<Mutex<State>>,
    scan: Mutex<Option<Scan>>,
    events: Sender<Event>,
}

impl Master {
    pub fn new() -> (Master, Receiver<Event>) {
        let (events, rx) = mpsc::channel();
        let state = State {
            link: None,
            packets: 0,
            errors: 0,
        };
        let master = Master {
            state: Arc::new(Mutex::new(state)),
            scan: Mutex::new(None),
            events,
        };
        (master, rx)
    }

    pub fn connect_rtu(&self, cfg: &Rtu) -> Result<(), String> {
        self.disconnect();
        let parity = match cfg
            .parity
            .trim()
            .chars()
            .next()
            .map(|c| c.to_ascii_uppercase())
        {
            Some('E') => Parity::Even,
            Some('O') => Parity::Odd,
            _ => Parity::None,
        };
        let data_bits = if cfg.data_bits == 7 {
            DataBits::Seven
        } else {
            DataBits::Eight
        };
        let stop_bits = if cfg.stop_bits == 2 {
            StopBits::Two
        } else {
            StopBits::One
        };
        let mut port = serialport::new(&cfg.port, cfg.baud)
            .parity(parity)
            .data_bits(data_bits)
            .stop_bits(stop_bits)
            .timeout(timeout(&cfg.timeout_ms))
            .open()
            .map_err(|err| format!("Connection failed on {}: {err}", cfg.port))?;
        let rts = cfg.rts.to_lowercase();
        if !matches!(rts.as_str(), "" | "none" | "disable") {
            let level = matches!(rts.as_str(), "enable" | "true" | "1");
            if let Err(err) = port.write_request_to_send(level) {
                log::warn!("RTS not applied (ignored): {err}");
            }
        }
        let gap = frame_gap(cfg.baud);
        self.state.lock().unwrap().link = Some(Link::Serial { port, gap });
        log::info!("RTU connected on {} @ {} baud", cfg.port, cfg.baud);
        Ok(())
    }

    pub fn connect_tcp(&self, cfg: &Tcp) -> Result<(), String> {
        let ip = crate::strip_ip(&cfg.ip)
            .ok_or_else(|| format!("Connection failed: invalid IP address '{}'.", cfg.ip))?;
        let port: u16 = cfg
            .port
            .trim()
            .parse()
            .ok()
            .filter(|&p| p > 0)
            .ok_or("Connection failed: TCP port must be 1..65535.")?;
        self.disconnect();
        let addr = SocketAddr::new(ip.into(), port);
        let timeout = timeout(&cfg.timeout_ms);
        let stream =
            open_tcp(addr, timeout).map_err(|err| format!("Connection failed to {addr}: {err}"))?;
        self.state.lock().unwrap().link = Some(Link::Tcp {
            stream: Some(stream),
            addr,
            timeout,
            transaction: 0,
        });
        log::info!("TCP connected to {addr}");
        Ok(())
    }

    pub fn disconnect(&self) {
        self.stop_scan();
        self.state.lock().unwrap().link = None;
    }

    pub fn connected(&self) -> bool {
        self.state.lock().unwrap().link.is_some()
    }

    /// Uma transação; conta nos pacotes ou nos erros. Sem conexão é erro, sem contar.
    pub fn transaction(&self, req: &Request) -> Result<Outcome, String> {
        run(&self.state, &self.events, req)
    }

    pub fn reset_counters(&self) {
        let mut state = self.state.lock().unwrap();
        (state.packets, state.errors) = (0, 0);
    }

    /// Repete `req` a cada `rate` até `stop_scan` (ou desconectar); cada volta vira um evento.
    pub fn start_scan(&self, req: Request, rate: Duration) -> Result<(), String> {
        if !self.connected() {
            return Err("Not connected".into());
        }
        // requisição inválida falharia em silêncio a cada volta da thread
        frame::request_pdu(req.function, req.start, req.count, &req.values)?;
        self.stop_scan();
        let (stop, wait) = mpsc::channel();
        let (state, events) = (self.state.clone(), self.events.clone());
        let thread = thread::Builder::new()
            .name("scan".into())
            .spawn(move || {
                loop {
                    let started = Instant::now();
                    match run(&state, &events, &req) {
                        Ok(outcome) => {
                            if events.send(Event::Scan(outcome)).is_err() {
                                return;
                            }
                        }
                        Err(_) => return, // desconectado
                    }
                    let rest = rate
                        .max(Duration::from_millis(1))
                        .saturating_sub(started.elapsed());
                    if wait.recv_timeout(rest) != Err(RecvTimeoutError::Timeout) {
                        return;
                    }
                }
            })
            .map_err(|err| err.to_string())?;
        *self.scan.lock().unwrap() = Some(Scan { stop, thread });
        Ok(())
    }

    pub fn stop_scan(&self) {
        if let Some(scan) = self.scan.lock().unwrap().take() {
            let _ = scan.stop.send(());
            let _ = scan.thread.join();
        }
    }

    /// Report Slave ID (0x11), em texto para o Tools.
    pub fn report_slave_id(&self, slave: u8) -> String {
        let pdu = [frame::REPORT_SLAVE_ID];
        let result =
            exchange(&self.state, &self.events, slave, &pdu).and_then(|pdu| frame::slave_id(&pdu));
        match result {
            Ok((status, data)) => {
                let id = data.first().map_or("-".into(), u8::to_string);
                let mut text = format!(
                    "Report Slave ID\nRun Status: {}\nSlave ID: {id}",
                    if status { "ON" } else { "OFF" }
                );
                if !data.is_empty() {
                    let bytes: Vec<String> = data.iter().map(|b| format!("{b:02X}")).collect();
                    text.push_str(&format!("\nData: {}", bytes.join(" ")));
                }
                text
            }
            Err(err) => format!("Report Slave ID\nError: {err}"),
        }
    }
}

impl Drop for Master {
    fn drop(&mut self) {
        self.stop_scan();
    }
}

fn run(state: &Mutex<State>, events: &Sender<Event>, req: &Request) -> Result<Outcome, String> {
    let pdu = frame::request_pdu(req.function, req.start, req.count, &req.values)?;
    let result = exchange(state, events, req.slave, &pdu)
        .and_then(|pdu| frame::response_values(req.function, req.count, &req.values, &pdu));
    if let Err(err) = &result {
        if err == "Not connected" {
            return Err(err.clone());
        }
        log::error!("Modbus transaction error: {err}");
    }
    let mut state = state.lock().unwrap();
    match result {
        Ok(_) => state.packets += 1,
        Err(_) => state.errors += 1,
    }
    let (values, error) = match result {
        Ok(values) => (values, None),
        Err(err) => (vec![], Some(err)),
    };
    Ok(Outcome {
        values,
        error,
        packets: state.packets,
        errors: state.errors,
        at: now_ms(),
    })
}

/// Envia o PDU ao escravo e devolve o PDU da resposta, já sem envelope e conferido (CRC, endereço,
/// id da transação). Os dois quadros vão para o bus monitor, inclusive uma resposta pela metade.
fn exchange(
    state: &Mutex<State>,
    events: &Sender<Event>,
    slave: u8,
    pdu: &[u8],
) -> Result<Vec<u8>, String> {
    let mut state = state.lock().unwrap();
    let link = state.link.as_mut().ok_or("Not connected")?;
    let tcp = matches!(link, Link::Tcp { .. });
    let raw = |tx: bool, data: &[u8]| {
        let at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as u64);
        let _ = events.send(Event::Raw {
            tx,
            at,
            mode: if tcp { "TCP" } else { "RTU" },
            hex: frame::hex(data),
            detail: frame::describe(tx, tcp, data),
        });
    };
    match link {
        Link::Serial { port, gap } => {
            let adu = frame::rtu_adu(slave, pdu);
            let _ = port.clear(serialport::ClearBuffer::Input); // sobras de uma resposta atrasada
            thread::sleep(*gap);
            raw(true, &adu);
            port.write_all(&adu).map_err(|err| err.to_string())?;
            let mut reply = Vec::new();
            let read = read_rtu(port.as_mut(), &mut reply);
            if !reply.is_empty() {
                raw(false, &reply);
            }
            read.map_err(|err| io_message(&err))?;
            if frame::crc16(&reply) != 0 {
                return Err("CRC error in response".into());
            }
            if reply[0] != slave {
                return Err(format!(
                    "Response from slave {} (expected {slave})",
                    reply[0]
                ));
            }
            Ok(reply[1..reply.len() - 2].to_vec())
        }
        Link::Tcp {
            stream,
            addr,
            timeout,
            transaction,
        } => {
            *transaction = transaction.wrapping_add(1);
            let adu = frame::tcp_adu(*transaction, slave, pdu);
            // conexão caída: reabre na próxima transação, como o pymodbus
            let conn = match stream {
                Some(conn) => conn,
                None => stream.insert(open_tcp(*addr, *timeout).map_err(|err| io_message(&err))?),
            };
            raw(true, &adu);
            let mut reply = Vec::new();
            let result = conn
                .write_all(&adu)
                .and_then(|()| read_tcp(conn, &mut reply));
            if !reply.is_empty() {
                raw(false, &reply);
            }
            if let Err(err) = result {
                *stream = None; // uma resposta atrasada não pode casar com a próxima pergunta
                return Err(io_message(&err));
            }
            let id = u16::from_be_bytes([reply[0], reply[1]]);
            if id != *transaction || reply[6] != slave {
                *stream = None;
                return Err("Response does not match the request".into());
            }
            Ok(reply[7..].to_vec())
        }
    }
}

/// Silêncio entre quadros RTU: 3,5 caracteres de 11 bits; acima de 19200 baud (ou sem velocidade,
/// como num pseudo-terminal) a especificação fixa 1,75 ms.
fn frame_gap(baud: u32) -> Duration {
    match baud {
        1..=19200 => Duration::from_micros(38_500_000 / u64::from(baud)),
        _ => Duration::from_micros(1750),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn open_tcp(addr: SocketAddr, timeout: Duration) -> io::Result<TcpStream> {
    let stream = TcpStream::connect_timeout(&addr, timeout)?;
    stream.set_read_timeout(Some(timeout))?;
    stream.set_write_timeout(Some(timeout))?;
    let _ = stream.set_nodelay(true);
    Ok(stream)
}

fn read_rtu(port: &mut dyn SerialPort, reply: &mut Vec<u8>) -> io::Result<()> {
    loop {
        let missing = match frame::rtu_remaining(reply) {
            Some(0) => return Ok(()),
            Some(n) => n,
            None => 1, // ainda não dá para saber o tamanho
        };
        let mut chunk = vec![0; missing];
        let n = port.read(&mut chunk)?;
        if n == 0 {
            return Err(io::ErrorKind::TimedOut.into());
        }
        reply.extend(&chunk[..n]);
    }
}

fn read_tcp(conn: &mut TcpStream, reply: &mut Vec<u8>) -> io::Result<()> {
    let mut head = [0; 7];
    read_into(conn, &mut head, reply)?;
    let len = usize::from(u16::from_be_bytes([head[4], head[5]]));
    if !(2..=254).contains(&len) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid MBAP length",
        ));
    }
    let mut body = vec![0; len - 1];
    read_into(conn, &mut body, reply)
}

/// `read_exact` que guarda o que chegou mesmo se faltar o resto (para o bus monitor).
fn read_into(conn: &mut TcpStream, buf: &mut [u8], reply: &mut Vec<u8>) -> io::Result<()> {
    let mut filled = 0;
    while filled < buf.len() {
        match conn.read(&mut buf[filled..]) {
            Ok(0) => return Err(io::ErrorKind::UnexpectedEof.into()),
            Ok(n) => {
                reply.extend(&buf[filled..filled + n]);
                filled += n;
            }
            Err(err) if err.kind() == io::ErrorKind::Interrupted => {}
            Err(err) => return Err(err),
        }
    }
    Ok(())
}

fn io_message(err: &io::Error) -> String {
    match err.kind() {
        io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock => "No response (timeout)".into(),
        io::ErrorKind::UnexpectedEof => "Connection closed by the slave".into(),
        _ => err.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;

    use super::*;

    /// Escravo TCP de teste: 10 holding registers (valor = endereço), 16 bobinas; escrita muda.
    fn slave() -> (TcpListener, String) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port().to_string();
        (listener, port)
    }

    fn serve(listener: TcpListener, replies: usize) -> JoinHandle<()> {
        thread::spawn(move || {
            let (mut conn, _) = listener.accept().unwrap();
            let mut regs: Vec<u16> = (0..10).collect();
            for _ in 0..replies {
                let mut head = [0; 7];
                if conn.read_exact(&mut head).is_err() {
                    return;
                }
                let mut pdu = vec![0; usize::from(head[5]) - 1];
                conn.read_exact(&mut pdu).unwrap();
                let word = |i: usize| usize::from(u16::from_be_bytes([pdu[i], pdu[i + 1]]));
                let reply: Vec<u8> = match pdu[0] {
                    3 if word(1) + word(3) <= regs.len() => {
                        let mut r = vec![3, (word(3) * 2) as u8];
                        regs[word(1)..word(1) + word(3)]
                            .iter()
                            .for_each(|v| r.extend(v.to_be_bytes()));
                        r
                    }
                    6 => {
                        regs[word(1)] = word(3) as u16;
                        pdu.clone()
                    }
                    0x11 => vec![0x11, 3, 0x2A, 0x01, 0xFF],
                    fc => vec![fc | 0x80, 2],
                };
                let adu = frame::tcp_adu(u16::from_be_bytes([head[0], head[1]]), head[6], &reply);
                conn.write_all(&adu).unwrap();
            }
        })
    }

    fn tcp(port: &str) -> Tcp {
        Tcp {
            ip: "127.000.000.001".into(),
            port: port.into(),
            timeout_ms: "0".into(),
        }
    }

    fn read(start: u16, count: u16) -> Request {
        Request {
            slave: 1,
            function: 3,
            start,
            count,
            values: vec![],
        }
    }

    #[test]
    fn reads_writes_and_counts_against_a_tcp_slave() {
        let (listener, port) = slave();
        let server = serve(listener, 4);
        let (master, events) = Master::new();
        master.connect_tcp(&tcp(&port)).unwrap();

        let ok = master.transaction(&read(2, 3)).unwrap();
        assert_eq!(
            (ok.values, ok.error, ok.packets, ok.errors),
            (vec![2, 3, 4], None, 1, 0)
        );

        let write = Request {
            function: 6,
            values: vec![500],
            ..read(4, 1)
        };
        assert_eq!(master.transaction(&write).unwrap().values, [500]);
        assert_eq!(master.transaction(&read(4, 1)).unwrap().values, [500]);

        let err = master.transaction(&read(8, 5)).unwrap();
        assert_eq!(
            err.error.as_deref(),
            Some("Modbus exception 2 (illegal data address)")
        );
        assert_eq!((err.packets, err.errors), (3, 1));

        master.reset_counters();
        server.join().unwrap();
        let raws = events
            .try_iter()
            .filter(|e| matches!(e, Event::Raw { .. }))
            .count();
        assert_eq!(raws, 8); // tx + rx de cada transação
    }

    #[test]
    fn report_slave_id_does_not_count() {
        let (listener, port) = slave();
        let server = serve(listener, 2);
        let (master, _events) = Master::new();
        master.connect_tcp(&tcp(&port)).unwrap();
        let text = master.report_slave_id(1);
        assert_eq!(
            text,
            "Report Slave ID\nRun Status: ON\nSlave ID: 42\nData: 2A 01 FF"
        );
        assert_eq!(master.transaction(&read(0, 2)).unwrap().packets, 1);
        server.join().unwrap();
    }

    #[test]
    fn timeout_without_reply_counts_an_error_and_reconnects() {
        let (listener, port) = slave();
        let (master, _events) = Master::new();
        master.connect_tcp(&tcp(&port)).unwrap();
        let (_held, _) = listener.accept().unwrap(); // aceita e nunca responde
        let started = Instant::now();
        let out = master.transaction(&read(0, 1)).unwrap();
        assert_eq!(out.error.as_deref(), Some("No response (timeout)"));
        assert_eq!(out.errors, 1);
        assert!(started.elapsed() >= Duration::from_millis(1000)); // TimeOut 0 vira 1 s
    }

    #[test]
    fn scan_repeats_until_stopped() {
        let (listener, port) = slave();
        let server = serve(listener, 3);
        let (master, events) = Master::new();
        master.connect_tcp(&tcp(&port)).unwrap();
        master
            .start_scan(read(0, 2), Duration::from_millis(20))
            .unwrap();
        let scans: Vec<Outcome> = events
            .iter()
            .filter_map(|e| {
                if let Event::Scan(o) = e {
                    Some(o)
                } else {
                    None
                }
            })
            .take(3)
            .collect();
        master.stop_scan();
        assert_eq!(scans.last().unwrap().packets, 3);
        assert!(scans.iter().all(|o| o.values == [0, 1]));
        server.join().unwrap();
    }

    #[test]
    fn bad_addresses_and_no_connection_are_errors() {
        let (master, _events) = Master::new();
        assert!(master.connect_tcp(&tcp("0")).is_err());
        assert!(
            master
                .connect_tcp(&Tcp {
                    ip: "300.1.1.1".into(),
                    ..tcp("502")
                })
                .is_err()
        );
        assert_eq!(
            master.transaction(&read(0, 1)).unwrap_err(),
            "Not connected"
        );
        assert!(
            master
                .start_scan(read(0, 1), Duration::from_secs(1))
                .is_err()
        );
    }

    /// RTU de verdade num par de pseudo-terminais: o mestre abre um lado pelo nome, o teste
    /// responde pelo outro.
    #[cfg(unix)]
    #[test]
    fn reads_over_rtu_and_rejects_a_bad_crc() {
        let (mut device, line) = serialport::TTYPort::pair().unwrap();
        let name = line.name().unwrap();
        device.set_timeout(Duration::from_secs(2)).unwrap();
        let server = thread::spawn(move || {
            for crc_ok in [true, false] {
                let mut request = [0; 8];
                device.read_exact(&mut request).unwrap();
                assert_eq!(request, frame::rtu_adu(7, &[3, 0, 1, 0, 1])[..]);
                let mut reply = frame::rtu_adu(7, &[3, 2, 0x12, 0x34]);
                if !crc_ok {
                    reply[3] ^= 0xFF;
                }
                device.write_all(&reply).unwrap();
            }
            device // fechar o lado do dispositivo descarta o que ainda não foi lido (macOS)
        });
        let (master, events) = Master::new();
        let rtu = Rtu {
            port: name,
            baud: 0, // pseudo-terminal não tem velocidade (no macOS, setar dá ENOTTY)
            parity: "None".into(),
            data_bits: 8,
            stop_bits: 1,
            rts: "None".into(),
            timeout_ms: "1000".into(),
        };
        master.connect_rtu(&rtu).unwrap();
        let req = Request {
            slave: 7,
            ..read(1, 1)
        };
        assert_eq!(master.transaction(&req).unwrap().values, [0x1234]);
        let bad = master.transaction(&req).unwrap();
        assert_eq!(bad.error.as_deref(), Some("CRC error in response"));
        server.join().unwrap();
        drop(line);
        let first = events.try_iter().next();
        assert!(
            matches!(
                first,
                Some(Event::Raw {
                    tx: true,
                    mode: "RTU",
                    ..
                })
            ),
            "{first:?}"
        );
    }

    #[test]
    fn rtu_frame_gap_follows_the_spec() {
        assert_eq!(frame_gap(9600), Duration::from_micros(4010));
        assert_eq!(frame_gap(1200), Duration::from_micros(32_083));
        assert_eq!(frame_gap(19200), Duration::from_micros(2005));
        assert_eq!(frame_gap(115_200), Duration::from_micros(1750));
        assert_eq!(frame_gap(0), Duration::from_micros(1750));
    }

    #[test]
    fn timeout_has_a_one_second_floor() {
        assert_eq!(timeout("0"), Duration::from_secs(1));
        assert_eq!(timeout("abc"), Duration::from_secs(1));
        assert_eq!(timeout("2500"), Duration::from_millis(2500));
    }
}
