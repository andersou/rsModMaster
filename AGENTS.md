# AGENTS.md

Orientações para agentes de código (Claude Code, Codex etc.) neste repositório. Para o que o app
faz e como usá-lo, leia o [`README.md`](README.md).

rsModMaster é um mestre Modbus RTU/TCP para desktop: núcleo em Rust, janela em Tauri 2, tela em
SolidJS. Sucessor do fModMaster (Python/Flet) e compatível com o INI do qModMaster.

## Mapa do projeto

| caminho | o que é | regra |
|---|---|---|
| `core/` (`modmaster-core`) | protocolo e regras, **sem UI e sem Tauri** | tudo aqui tem teste de unidade no próprio arquivo |
| `core/src/frame.rs` | PDUs, envelopes RTU (CRC) e TCP (MBAP), decodificação para o bus monitor | funções puras |
| `core/src/master.rs` | conexão, uma transação por vez, thread do scan, eventos | E/S bloqueante atrás de um `Mutex` |
| `core/src/settings.rs` | INI do qModMaster (`Settings`) | veja "INI" abaixo |
| `core/src/convert.rs` | converters Lua em sandbox (mlua, Lua 5.4) | veja "Lua" abaixo |
| `core/src/lib.rs` | ping, teste de porta TCP, lista de portas seriais | |
| `core/converters/*.lua` | exemplos que vão nos pacotes de release | testados em `convert.rs` (`EXAMPLES`) |
| `core/tests/simulator.rs` | conformidade contra um escravo externo (`#[ignore]`) | |
| `src/main.rs` (`rsmodmaster`) | **só a cola do desktop**: comandos Tauri, diálogos, caminhos do INI/log/converters, ponte de eventos | sem regra de negócio |
| `tauri.conf.json`, `capabilities/default.json` | janela, CSP, permissões da webview | não afrouxar sem pedido explícito |
| `ui/src/lib/*.ts` | **lógica pura da tela** (formatos, grade, gráfico, validação, log, tema), sem DOM | Vitest em `*.test.ts` |
| `ui/src/i18n/` | idioma da tela: dicionários `en`/`pt`/`es`, `t`, `errorText` | veja "Convenções" |
| `core/src/msg.rs` | `Msg`: erro para a tela como código + parâmetros | texto em inglês só no `Display` (log) |
| `ui/src/appStore.ts` | estado (sinais e stores) e as ações que chamam o core | |
| `ui/src/api.ts` | os comandos e eventos do IPC, tipados | um por comando de `src/main.rs` |
| `ui/src/components/*.tsx` | componentes Solid | só apresentação |
| `ui/src/styles.css` | design system e tokens dos temas | |
| `ui/mock.html`, `ui/mock.ts` | a UI no navegador com o IPC simulado (fora do build) | |
| `tools/modbus_sim.py` | escravo Modbus TCP para teste manual | |
| `.github/workflows/ci.yml`, `release.config.cjs` | CI e semantic-release | |

Regra nova de protocolo ou de INI vai no `core/`; regra nova de exibição vai em `ui/src/lib/` com
teste. Comando novo: `src/main.rs` (função + `generate_handler!`) e `ui/src/api.ts`.

## Comandos

Não há Tauri CLI. Rust >= 1.95, Node 24.

```sh
(cd ui && npm ci && npm run build)        # tsc + vite build -> ui/dist (o binário embute)
cargo run -p rsmodmaster                  # roda o app (precisa de ui/dist)

# HMR, em dois terminais
cd ui && npm run dev
TAURI_CONFIG='{"build":{"devUrl":"http://localhost:5173"}}' cargo run -p rsmodmaster

# release, como o `tauri build` faria
cargo build --release -p rsmodmaster --features tauri/custom-protocol
```

Antes de dar a tarefa por pronta:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
(cd ui && npm test)          # Vitest
(cd ui && npm run check)     # tsc
```

- O `tauri::generate_context!` exige `ui/dist`: sem ele, `cargo clippy`/`cargo test` do workspace
  não compilam. Para mexer só no núcleo, use `-p modmaster-core`.
- **O CI usa o Rust estável mais recente** (`dtolnay/rust-toolchain@stable`). Uma API marcada como
  obsoleta numa versão nova quebra o clippy lá mesmo que passe aqui (já aconteceu com
  `AtomicU32::fetch_update`). Evite APIs recém-depreciadas e não fixe a versão do Rust para contornar.
- O CI roda `clippy` e `test` com `--locked`: se mudar dependências, commite o `Cargo.lock`.
- Conformidade contra um escravo externo:
  `MODBUS_SIM=127.0.0.1:5020 cargo test -p modmaster-core --test simulator -- --ignored`.

## Convenções

- **Comentários e documentação em pt-BR.** A tela fala inglês, português e espanhol
  (`@solid-primitives/i18n`, dicionários em `ui/src/i18n/`):
  - nenhum texto visível fixo em componente: tudo passa por `t('chave')`. Texto novo entra em
    `en.ts` (a referência) e, com o mesmo formato, em `pt.ts` e `es.ts`; o tipo `Dict` não deixa
    faltar chave, e um teste confere as chaves e os `{{ parâmetros }}` dos três;
  - erro que o Rust manda para a tela é um `Msg` (`core/src/msg.rs`: código + parâmetros, com o
    macro `msg!`); a tela mostra com `errorText(err)`. Código novo vai no `english()` do `msg.rs` e em
    `errors` dos três dicionários (o mesmo teste confere os dois lados);
  - o log (arquivo e painel) continua em inglês, que é o que se manda para quem dá suporte;
  - rótulos em pt/es podem ser mais longos: confira no `mock.html` se os campos estreitos não cortam.
- Comente o porquê, em uma linha; o código mostra o quê.
- **Conventional Commits em inglês**, como o histórico (`feat(ui): ...`, `fix(core): ...`). Eles
  geram a versão: `feat` → minor, `fix` → patch, `perf` → patch, `feat!`/`BREAKING CHANGE` → major;
  `chore`, `docs`, `ci`, `refactor` e `test` não geram release.
- **Não faça push enquanto um run de release estiver compilando:** com um commit mais novo na
  branch, o semantic-release daquele run pula a release.
- Não edite a versão no `Cargo.toml` à mão: o commit `chore(release): X.Y.Z [skip ci]` faz isso.
- Diffs pequenos. Sem abstração, opção ou configuração que ninguém pediu.
- **Nenhuma dependência nova por poucas linhas** (o INI, o CRC e o MBAP são feitos à mão de
  propósito).
- Só commite ou faça push quando o usuário pedir.

## Invariantes

### INI (compatibilidade com o qModMaster)

- Chaves **gravadas em CamelCase**, como o qModMaster (`TCPPort`, `SlaveIP`, `ModBusMode`), e
  **lidas sem diferenciar maiúsculas** (o fModMaster gravava em minúsculas). Chave nova: grave em
  CamelCase em `to_ini` e leia em minúsculas em `overlay`.
- Chave ausente ou número inválido mantém o padrão do campo; arquivo ausente = padrões.
- `[Session] Base` e `DefaultBase` são gravadas com o mesmo valor (índice do qModMaster: 0 Hex,
  1 Dec, 2 Bin, 3 Float). `[RegisterFormats]` usa outra codificação (2, 10, 16 e 3 = float).
- `[Session] FunctionCode` é o **índice** na lista `FUNCTIONS` (`ui/src/lib/registers.ts`), não o
  código da função. Não reordene a lista.
- Dados que o qModMaster não conhece vão em **seções próprias** (`[RegisterConverters]`,
  `[RegisterLabels]`, `[RegisterCharts]`...): o qModMaster as ignora, e o fModMaster as apaga se
  salvar o arquivo. Não ponha chaves novas nas seções do qModMaster sem necessidade.
- Tudo o que vem do INI é validado ao ler (id de converter, label de até 32 caracteres em uma
  linha, cor do gráfico 0..7).
- Preferências que não são da sessão (tema, janela do gráfico) ficam em `localStorage`, não no INI.

### Modbus

- **Escrita exige exatamente um valor por item:** `frame::request_pdu` recusa se
  `values.len() != count`. Nunca complete com zeros: isso iria para um equipamento real.
- Os limites de quantidade são os da especificação e existem nos dois lados (`request_pdu` e
  `FUNCTIONS`); mude os dois juntos.
- RTU: CRC-16/Modbus (0xA001), little-endian no fim do quadro; a resposta é conferida (CRC e
  endereço do escravo). Antes de cada envio há o silêncio de 3,5 caracteres (`frame_gap`: 1,75 ms
  fixos acima de 19200 baud) e a limpeza do buffer de entrada.
- TCP: MBAP com id de transação crescente; a resposta precisa casar o id e o unit id. Em erro de
  E/S ou resposta que não casa, o stream é descartado e reaberto na próxima transação (uma resposta
  atrasada não pode casar com a pergunta seguinte).
- Timeout de resposta: mínimo de 1 s (`master::timeout`), porque o qModMaster grava `TimeOut = 0`.
- Os dois quadros de cada transação vão para o bus monitor, inclusive uma resposta pela metade.
- O `Base Addr` é descontado na UI (`request()` em `appStore.ts`); o core recebe o endereço final.

### Fronteira com a webview

- **Caminhos de arquivo vêm só de diálogos nativos abertos pelo Rust** (`load_session`,
  `save_session`, `save_text`). Nenhum comando aceita um caminho vindo da webview.
- Dos converters a webview envia só o **id**, validado por `convert::valid_id` (`[A-Za-z0-9_-]`,
  1 a 64 caracteres) antes de virar nome de arquivo. Todo caminho de converter passa por `path_of`.
- **CSP estrita** (`default-src 'self'`, sem `unsafe-inline` nem `unsafe-eval`):
  - nada de `style="..."` em strings de HTML nem `innerHTML` com estilo. Estilos dinâmicos vão por
    Solid (`style={{...}}`, `classList`) ou CSSOM, como o `CodeEditor` faz com os tokens do Shiki;
  - **sem WASM**: o Shiki usa o motor de regex em JavaScript (`ui/src/lib/highlight.ts`);
  - sem scripts inline, fontes ou recursos externos. A única saída de rede da webview é o
    `connect-src https://api.github.com` do aviso de versão nova (`ui/src/updates.ts`); a página da
    release abre pelo opener, que só aceita `https://github.com/*`.
- Capabilities mínimas (`capabilities/default.json`): permissão nova só com motivo; `opener` abre
  apenas `https://github.com/*`.
- `convert_decode`/`convert_encode` aceitam no máximo 125 itens por chamada.

### Lua (converters)

- Sandbox: só `math`, `string` e `table`. Removidos `load`, `loadfile`, `dofile`, `collectgarbage`,
  `print`, `pcall`, `xpcall` e `string.dump`. **Não devolva `pcall`/`xpcall`:** sem eles o limite de
  instruções não pode ser contornado.
- Limites: 100 mil instruções por chamada (hook a cada 1000), 16 MB de memória, texto de até 64
  caracteres, até 125 registradores por converter, 200 arquivos de até 64 KB.
- Cada arquivo roda no seu próprio ambiente (globais de um não vazam para outro).
- `Converters::load` nunca falha: um arquivo ruim entra em `errors()` e os outros seguem valendo.
- `decode` recebe exatamente `registers` valores; o retorno de `encode` é conferido no Rust
  (quantidade e faixa 0..65535).

### Threads e eventos

- **Nada que bloqueie roda na thread da janela.** Comandos que fazem E/S serial/TCP, esperam o lock
  do link ou rodam Lua são `async` e passam por `blocking()` (`spawn_blocking`). Vale até para
  `reset_counters`, que espera o lock durante uma transação em curso.
- **Eventos vão em lote para a webview:** `forward` junta o que estiver na fila num único
  `emit("core", Vec<Event>)`. A UI recebe arrays (`onCoreEvents`); não emita evento por quadro.
- O gráfico usa a hora do fim da transação (`Outcome.at`), não a de chegada do evento.
- `start_scan` valida a requisição antes de criar a thread; `stop_scan` e `disconnect` fazem `join`.

## Armadilhas da UI (Solid)

- **`<select>` nativo:** o `value` precisa ser aplicado depois que as `<option>` existem. Use sempre
  `SelectField` (`components/Field.tsx`), que reaplica o valor num efeito e num `MutationObserver`
  (opções que chegam depois, como a lista de portas). Um `<select value=...>` cru fica na primeira opção.
- **Grade com `<Index>`, não `<For>`:** a cada volta do scan o texto das células muda no lugar; com
  `<For>` as células seriam recriadas (foco e edição perdidos, custo alto).
- **Só a visão na tela é renderizada:**
  - no gráfico, a tabela é desmontada e o memo `rows` fica parado (devolve o valor anterior);
  - na tabela, o `ChartView` é desmontado; o decode dos converters no gráfico cobre só as séries;
  - no painel de baixo, só a aba aberta é montada e o filtro do log só roda com o painel aberto.
  Não troque isso por `hidden`/CSS.
- **`Dialog` e `showModal`:** o `onOpen` prepara o conteúdo e o `showModal()` vai num
  `queueMicrotask`, para o foco inicial (`autofocus`) já ver o DOM novo. Não chame `showModal`
  direto no efeito.
- **Temas por tokens:** as cores vêm das variáveis de `:root` e `:root[data-theme="light"]` em
  `styles.css` (inclusive `--series-1..8` do gráfico). Nenhuma cor fixa em componente; cor nova =
  token nos dois temas. O uPlot é recriado ao trocar o tema.
- Ícones são `<symbol>` Lucide no sprite do `ui/index.html`. O `ui/mock.html` é uma cópia dele com
  o script trocado; ao acrescentar um ícone, regenere-o (comando no topo de `ui/mock.ts`).
- O menu de contexto nativo é bloqueado fora de campos de texto, `pre` e `.log-list`.
- Atalhos globais (`App.tsx`) não agem com um diálogo aberto.
- O IPC usa camelCase (`serde(rename_all = "camelCase")`); mantenha `ui/src/lib/types.ts` igual às
  structs do Rust.

## Como verificar uma mudança

1. **Testes de unidade** (seção "Comandos"). Lógica nova não trivial ganha um teste: no módulo do
   Rust ou em `ui/src/lib/*.test.ts`.
2. **Teste de fumaça**, por um destes caminhos:
   - **No navegador, com o IPC simulado:** `cd ui && npm run dev` e abra
     `http://localhost:5173/mock.html`. Serve para tudo o que é de tela (as capturas do README
     saíram daqui). O `ui/mock.ts` responde só a alguns comandos; acrescente o que precisar.
   - **No app, contra um escravo:**
     `uv run --with 'pymodbus==3.13.*' python tools/modbus_sim.py 5020 --vary` e conecte por TCP
     em `127.0.0.1:5020`. Com `--vary`, os registradores 9 (senoide) e 10 (rampa) variam, para o
     gráfico; sem ele os valores ficam parados, que é o que o teste de conformidade espera.
3. **Nunca controle o mouse ou o teclado da máquina do usuário** para testar a GUI sem perguntar
   antes. Prefira o navegador com `mock.html`; se o teste precisar do app de verdade, peça.
4. Mudou algo que o README descreve (função, limite, atalho, caminho)? Atualize o README. As
   capturas ficam em `docs/images/` (2360×1560, tiradas do `mock.html`).

## Lacunas conhecidas

- **Gráfico:** rajadas de amostras separadas no tempo (scan parado e retomado) são ligadas por uma
  reta; só valor ausente vira lacuna.
- **RTU sem teste em hardware real:** só o teste com pseudo-terminal (Unix) e o protocolo em si.
  Temporização em adaptadores USB-RS485 e o controle de RTS não foram validados.
- **Sem instalador:** `bundle.active` é `false`; os pacotes são o executável + `converters/`, sem
  assinatura.
- **macOS só arm64**; Linux e Windows só x64.
- **pymodbus fixo na 3.13** para o `tools/modbus_sim.py`: outras versões servem os blocos de
  holding e input trocados de outro jeito, e o teste de conformidade falha.
- Só IPv4 no TCP (`strip_ip`); sem nome de host.
- O histórico do gráfico e o painel de log ficam só em memória (20 mil amostras; 5000 linhas).
