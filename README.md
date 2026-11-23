# rsModMaster

Mestre Modbus RTU/TCP para desktop, sucessor do [fModMaster](https://github.com/andersou/fModMaster)
(Python/Flet) e inspirado no [qModMaster](https://github.com/epsilonrt/qmodmaster). Lê e grava o
mesmo `fModMaster.ini` e as mesmas sessões `.fmmsess`.

| pasta | pacote Cargo | o que é |
|---|---|---|
| `core/` | `modmaster-core` (biblioteca, sem UI) | Modbus RTU (serial, CRC) e TCP (MBAP) implementado à mão, scan numa thread, decodificação dos quadros para o bus monitor, INI do qModMaster, ping e porta TCP |
| `.` (`src/`, `tauri.conf.json`, `capabilities/`) | `rsmodmaster` | app desktop (Tauri 2): janela, diálogos de arquivo, onde fica o INI, log e ponte dos eventos |
| `ui/` | — | a tela em SolidJS + Vite, com o design system do garten-updater (tema escuro, ícones Lucide) |

## Funções

- **RTU ou TCP**, com Report Slave ID (FC 11), ping e checagem de porta no **Tools**.
- **FC 01–06, 0F e 10**, numa tabela de 10 colunas. Na escrita, cada célula vira um campo.
- **Formato por registrador** (botão direito): Bin, Dec, Hex ou Float de 32 bits nas 4 ordens de
  byte do libmodbus (ABCD, DCBA, BADC, CDAB). O float ocupa dois registradores; o segundo mostra `—`.
- **Scan** contínuo, com o intervalo do campo Scan Rate.
- **Bus Monitor**: quadros Tx/Rx brutos e os campos ADU/PDU do quadro escolhido; dá para salvar em `.txt`.
- **Sessões** (`.fmmsess`, e também `.ses`/`.ini`) e configurações persistidas no INI.

- **Custom converters em Lua** (botão `{ }` na barra de título): um script transforma um ou mais
  registradores num texto e, se quiser, o texto digitado de volta em registradores. Veja abaixo.

**Atalhos:** `⌘K` / `Ctrl+K` conecta ou desconecta; `⌘↩` / `Ctrl+Enter` lê ou escreve.

**Onde ficam os arquivos:** o `fModMaster.ini` fica na pasta de configuração do app e o log
(`rsModMaster.log`, aberto pelo botão **Log File**) na pasta de logs. Na primeira vez, um
`fModMaster.ini` na pasta atual ou ao lado do executável é copiado para lá.

| sistema | INI | log |
|---|---|---|
| Windows | `%APPDATA%\io.github.andersou.rsmodmaster` | `%LOCALAPPDATA%\io.github.andersou.rsmodmaster\logs` |
| Linux | `~/.config/io.github.andersou.rsmodmaster` | `~/.local/share/io.github.andersou.rsmodmaster/logs` |
| macOS | `~/Library/Application Support/io.github.andersou.rsmodmaster` | `~/Library/Logs/io.github.andersou.rsmodmaster` |

### Diferenças em relação ao fModMaster

- As chaves do INI são gravadas como o qModMaster grava (`TCPPort`, `SlaveIP`...); o fModMaster
  gravava tudo minúsculo. Os dois formatos são lidos.
- `Base = 0` (Hex) volta como Hex; o fModMaster lia como Dec.
- Timeout menor que 1000 ms (inclusive o `TimeOut = 0` padrão) vira 1000 ms, como antes.
- O ping espera até 5 s também no Windows e no macOS (lá o `-w`/`-W` é em ms, e o fModMaster
  passava `5`).
- Bobinas e entradas discretas ignoram formato: são sempre 0/1.
- O cabeçalho das linhas da tabela segue o Dec/Hex do endereço inicial, não o formato dos valores.
- Erro repetido no scan vira um aviso só, até mudar.
- Campos inválidos (escravo, endereço, quantidade, scan rate) ficam marcados e bloqueiam a leitura,
  a escrita e o scan, em vez de serem ajustados em silêncio. O scan tem mínimo de 50 ms, e alternar
  Dec/Hex converte o endereço digitado.
- Uma escrita que começaria na 2ª metade de um float é recusada (o fModMaster deslocava os valores),
  e o core recusa qualquer escrita sem exatamente um valor por item.
- Uma escrita que falha mantém o que foi digitado; uma que dá certo confirma com um aviso.
- Sem menu nativo: as ações de File, View e Help ficam na barra de título. Não há o "Modbus Manual"
  (o fModMaster só o abria se a documentação do qModMaster estivesse no checkout).

## Custom converters

Cada converter é um arquivo `<id>.lua` na pasta `converters/`, ao lado do `fModMaster.ini` (o diálogo
**Converters** mostra o caminho). O app traz três exemplos na primeira vez: `int16_div10` (inteiro
com sinal ÷ 10), `uint32_abcd` (32 bits em 2 registradores) e `status_bits` (bits viram nomes, só
leitura).

```lua
return {
  name = "UInt32 ABCD",          -- opcional (padrão: o nome do arquivo)
  registers = 2,                 -- opcional (padrão 1, máximo 125)
  decode = function(regs)        -- regs = { u16, ... } com exatamente `registers` itens
    return (regs[1] << 16) | regs[2]           -- texto ou número mostrado na célula
  end,
  encode = function(text)        -- opcional; sem ele o converter é só leitura
    local n = math.tointeger(tonumber(text)) or error("integer expected")
    return { (n >> 16) & 0xFFFF, n & 0xFFFF }  -- exatamente `registers` valores 0..65535
  end,
}
```

- **Usar:** botão direito num registrador → seção *Converters*. A célula inicial mostra o valor e
  as seguintes mostram `—`, como num float. Erro do script aparece como `ERR` (mensagem no tooltip
  e num aviso) e o scan continua.
- **Editar:** o diálogo Converters tem um editor com destaque de sintaxe (Shiki, como o
  web-diff-viewer). **Save** (`⌘S`/`Ctrl+S`) grava e recarrega na hora, mostrando o erro com a linha;
  **New** parte de um modelo. Quem preferir outro editor usa **Open Folder** e **Reload**.
- **Lua 5.4**, o mesmo motor do garten-updater (mlua), mas em sandbox: sem `io`, `os`, `require`,
  `load` nem `pcall`. Operadores de bit e `string.pack`/`string.unpack` (`">i2"`, `">f"`, `"<I4"`...)
  cobrem inteiros com sinal, floats e ordem de bytes.
- **Limites:** 100 mil instruções por chamada e 16 MB de memória (um loop infinito vira erro, não
  trava o app), texto de até 64 caracteres, até 200 arquivos de 64 KB.
- **No INI:** seção `[RegisterConverters]` (`endereço = id`). A sessão guarda só o id: em outra
  máquina sem o arquivo, a célula mostra `ERR`. O qModMaster ignora a seção; o fModMaster a apaga se
  salvar o INI.
- **Escrita:** com `encode`, a célula vira campo. Converter só leitura bloqueia a escrita, e um de
  mais de um registrador exige FC 10.

## Desenvolvimento

**Requisitos:** Rust >= 1.95 e Node 24 + npm. O Tauri CLI não é usado. No Linux, as bibliotecas do
Tauri: `libwebkit2gtk-4.1-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev`.

```sh
(cd ui && npm ci && npm run build)   # tsc + vite build -> ui/dist, que o binário embute
cargo run -p rsmodmaster
```

Release, como o `tauri build` faria:

```sh
cargo build --release -p rsmodmaster --features tauri/custom-protocol
```

UI com recarga instantânea (HMR), em dois terminais:

```sh
cd ui && npm run dev
TAURI_CONFIG='{"build":{"devUrl":"http://localhost:5173"}}' cargo run -p rsmodmaster
```

### Testes

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace     # protocolo, INI, escravo TCP falso e RTU num pseudo-terminal (Unix)
(cd ui && npm test)        # Vitest: formatos, floats, grade, escrita, configurações
```

Conformidade com um escravo de verdade (todas as funções e uma exceção), por exemplo o pymodbus:

```sh
MODBUS_SIM=127.0.0.1:5020 cargo test -p modmaster-core --test simulator -- --ignored
```

O escravo precisa servir 100 bobinas `1,0,1,0...`, 100 entradas `0,1,0,1...`, holding registers
`0..100` e input registers `1000..1100` a partir do endereço 0 (ver `core/tests/simulator.rs`).

## CI e versões

O semantic-release gera as versões a partir dos commits ([Conventional Commits](https://www.conventionalcommits.org/)):
`fix:` sobe o patch, `feat:` sobe o minor e uma breaking change (`feat!:` ou `BREAKING CHANGE:`) sobe
o major. Outros tipos (`chore:`, `docs:`, `ci:`...) não geram versão.

| branch | versões |
|---|---|
| `main` | `X.Y.Z` |
| `next` | `X.Y.Z-preview.N` |

Jobs de `.github/workflows/ci.yml`:

| job | quando | o que faz |
|---|---|---|
| `check` | todo push e PR | Vitest, tipos, `ui/dist`, fmt, clippy (`-D warnings`) e testes do workspace |
| `version` | push em `main`/`next` | calcula a próxima versão (semantic-release em dry-run) e a grava no `Cargo.toml`/`Cargo.lock` dos builds |
| `build` | depois de `check` | binários de Linux x64, macOS arm64 e Windows x64 (artefatos do workflow) |
| `release` | quando há versão nova | tag `vX.Y.Z`, release no GitHub com os três pacotes e o commit da versão (`[skip ci]`) |

No repositório, a versão fica como `0.0.0-dev` até a primeira release; depois, o commit de release
a mantém igual à da última tag. A configuração está em `release.config.cjs` e usa só o
`GITHUB_TOKEN` do workflow.

Os binários não são assinados: o Gatekeeper (macOS) e o SmartScreen (Windows) avisam na primeira
execução. No Linux, o app precisa de `libwebkit2gtk-4.1` (ex.: `apt install libwebkit2gtk-4.1-0`).
No Linux, acessar a porta serial costuma exigir o usuário no grupo `dialout`.

## Licença

MIT. Veja [LICENSE](LICENSE).
