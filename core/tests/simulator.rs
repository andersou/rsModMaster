//! Conformidade com uma implementação independente: todas as funções contra um escravo Modbus TCP
//! de verdade (o pymodbus do fModMaster, por exemplo). Não roda no `cargo test` comum:
//!
//! ```sh
//! MODBUS_SIM=127.0.0.1:5020 cargo test -p modmaster-core --test simulator -- --ignored
//! ```
//! O escravo precisa de 100 bobinas `1,0,1,0...`, 100 entradas `0,1,0,1...`, holding registers
//! `0..100` e input registers `1000..1100` a partir do endereço 0.

use modmaster_core::{Master, Request, Tcp};

fn connect() -> Master {
    let addr = std::env::var("MODBUS_SIM").expect("defina MODBUS_SIM=ip:porta");
    let (ip, port) = addr.rsplit_once(':').expect("ip:porta");
    let (master, _events) = Master::new();
    let tcp = Tcp {
        ip: ip.into(),
        port: port.into(),
        timeout_ms: "1000".into(),
    };
    master.connect_tcp(&tcp).unwrap();
    master
}

fn run(master: &Master, function: u8, start: u16, count: u16, values: &[u16]) -> Vec<u16> {
    let req = Request {
        slave: 1,
        function,
        start,
        count,
        values: values.to_vec(),
    };
    let out = master.transaction(&req).unwrap();
    assert_eq!(out.error, None, "fc {function:#04x}");
    out.values
}

#[test]
#[ignore = "precisa de um escravo Modbus TCP em MODBUS_SIM"]
fn every_function_round_trips_against_a_real_slave() {
    let m = connect();
    assert_eq!(run(&m, 1, 0, 4, &[]), [1, 0, 1, 0]);
    assert_eq!(run(&m, 2, 0, 3, &[]), [0, 1, 0]);
    assert_eq!(run(&m, 3, 10, 3, &[]), [10, 11, 12]);
    assert_eq!(run(&m, 4, 5, 2, &[]), [1005, 1006]);

    run(&m, 5, 1, 1, &[1]);
    assert_eq!(run(&m, 1, 1, 1, &[]), [1]);
    run(&m, 6, 20, 1, &[0xBEEF]);
    assert_eq!(run(&m, 3, 20, 1, &[]), [0xBEEF]);
    run(&m, 0x0F, 30, 10, &[1, 1, 0, 0, 1, 0, 1, 0, 1, 1]);
    assert_eq!(run(&m, 1, 30, 10, &[]), [1, 1, 0, 0, 1, 0, 1, 0, 1, 1]);
    run(&m, 0x10, 40, 3, &[7, 8, 0xFFFF]);
    assert_eq!(run(&m, 3, 40, 3, &[]), [7, 8, 0xFFFF]);

    // endereço fora do bloco: exceção do escravo, contada como erro
    let bad = Request {
        slave: 1,
        function: 3,
        start: 500,
        count: 1,
        values: vec![],
    };
    let out = m.transaction(&bad).unwrap();
    let err = out.error.unwrap();
    assert_eq!((err.code, err.args["code"].as_str()), ("exception", "2"));
    assert_eq!((out.packets, out.errors), (12, 1));
}
