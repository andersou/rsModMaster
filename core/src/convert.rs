//! Custom converters: funções Lua do usuário que transformam um ou mais registradores num texto
//! (`decode`) e, quando existe `encode`, o texto digitado de volta em registradores. O motor é o
//! do garten-updater (mlua, Lua 5.4), mas com sandbox: sem disco, rede ou `require`, com limite de
//! instruções por chamada e de memória. Um script ruim vira erro, nunca trava o app.
//!
//! Um arquivo por converter, `<id>.lua`, que retorna
//! `{ name = "...", registers = N, decode = function(regs) ... end, encode = function(text) ... end }`.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
};

use mlua::{Function, HookTriggers, Lua, LuaOptions, StdLib, Table, Value, VmState};
use serde::Serialize;

/// Instruções por chamada (`decode`, `encode` ou o topo do arquivo); acima disso, erro.
pub const MAX_INSTRUCTIONS: u32 = 100_000;
const HOOK_EVERY: u32 = 1_000;
pub const MEMORY_LIMIT: usize = 16 * 1024 * 1024;
/// Texto mostrado na célula e texto digitado para o `encode`, em caracteres.
pub const MAX_TEXT: usize = 64;
pub const MAX_REGISTERS: usize = 125;
const MAX_FILES: usize = 200;
pub const MAX_SOURCE: usize = 64 * 1024;

/// Ponto de partida do botão New do editor.
pub const TEMPLATE: &str = r#"-- regs = { reg1, reg2, ... } (unsigned 16-bit values), exactly `registers` items.
-- decode returns the text (or number) shown in the cell; encode (optional) turns the typed
-- text back into registers. Without encode the converter is read-only.
return {
  name = "My converter",
  registers = 1,
  decode = function(regs)
    return regs[1]
  end,
  encode = function(text)
    local value = math.tointeger(tonumber(text)) or error("integer expected")
    if value < 0 or value > 0xFFFF then error("out of range") end
    return { value }
  end,
}
"#;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub id: String,
    pub name: String,
    pub registers: usize,
    pub writable: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LoadError {
    pub file: String,
    pub message: String,
}

struct Item {
    info: Info,
    decode: Function,
    encode: Option<Function>,
}

pub struct Converters {
    lua: Lua,
    /// Fatias de `HOOK_EVERY` instruções que ainda restam à chamada em curso.
    budget: Arc<AtomicU32>,
    items: BTreeMap<String, Item>,
    errors: Vec<LoadError>,
}

/// Nome de arquivo aceito como id (é a chave gravada no INI e nunca vira caminho sem passar aqui).
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn path_of(dir: &Path, id: &str) -> Result<PathBuf, String> {
    if valid_id(id) {
        Ok(dir.join(format!("{id}.lua")))
    } else {
        Err(format!(
            "Invalid converter name '{id}': use letters, digits, _ and -"
        ))
    }
}

pub fn source(dir: &Path, id: &str) -> Result<String, String> {
    let path = path_of(dir, id)?;
    fs::read_to_string(&path).map_err(|err| format!("{}: {err}", path.display()))
}

pub fn save(dir: &Path, id: &str, source: &str) -> Result<(), String> {
    let path = path_of(dir, id)?;
    if source.len() > MAX_SOURCE {
        return Err(format!("Converter is larger than {} KB", MAX_SOURCE / 1024));
    }
    fs::create_dir_all(dir).map_err(|err| format!("{}: {err}", dir.display()))?;
    fs::write(&path, source).map_err(|err| format!("{}: {err}", path.display()))
}

pub fn delete(dir: &Path, id: &str) -> Result<(), String> {
    let path = path_of(dir, id)?;
    fs::remove_file(&path).map_err(|err| format!("{}: {err}", path.display()))
}

/// Primeira linha útil de um erro do Lua: a causa de um erro vindo do hook, sem o traceback.
fn message(err: &mlua::Error) -> String {
    let err = match err {
        mlua::Error::CallbackError { cause, .. } => cause.as_ref(),
        other => other,
    };
    let text = match err {
        mlua::Error::RuntimeError(text) | mlua::Error::SyntaxError { message: text, .. } => {
            text.clone()
        }
        mlua::Error::MemoryError(_) => "memory limit exceeded".into(),
        other => other.to_string(),
    };
    text.lines().next().unwrap_or_default().to_owned()
}

fn truncate(text: &str) -> String {
    text.chars().take(MAX_TEXT).collect()
}

impl Converters {
    /// Carrega todos os `*.lua` da pasta. Nunca falha: um arquivo ruim entra em `errors()` e os
    /// outros seguem valendo (pasta inexistente = nenhum converter).
    pub fn load(dir: &Path) -> Converters {
        let mut converters = Converters::empty();
        let mut files: Vec<PathBuf> = fs::read_dir(dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.extension().is_some_and(|ext| ext == "lua"))
            .collect();
        files.sort();
        for path in files.iter().take(MAX_FILES) {
            let file = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let id = path
                .file_stem()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let loaded = fs::read_to_string(path)
                .map_err(|err| err.to_string())
                .and_then(|source| converters.add(&id, &source));
            if let Err(message) = loaded {
                log::warn!("converter {file}: {message}");
                converters.errors.push(LoadError { file, message });
            }
        }
        if files.len() > MAX_FILES {
            converters.errors.push(LoadError {
                file: dir.display().to_string(),
                message: format!("only the first {MAX_FILES} converters were loaded"),
            });
        }
        converters
    }

    fn empty() -> Converters {
        // sem io, os, package, coroutine e debug; da base saem as funções que carregam código,
        // mexem no coletor ou engolem erros (sem pcall, o limite de instruções não é contornável)
        let lua = Lua::new_with(
            StdLib::MATH | StdLib::STRING | StdLib::TABLE,
            LuaOptions::default(),
        )
        .expect("Lua with math/string/table");
        let globals = lua.globals();
        for name in [
            "load",
            "loadfile",
            "dofile",
            "collectgarbage",
            "print",
            "pcall",
            "xpcall",
        ] {
            let _ = globals.raw_remove(name);
        }
        if let Ok(string) = globals.get::<Table>("string") {
            let _ = string.raw_remove("dump");
        }
        let _ = lua.set_memory_limit(MEMORY_LIMIT);
        let budget = Arc::new(AtomicU32::new(0));
        let counter = budget.clone();
        let triggers = HookTriggers::new().every_nth_instruction(HOOK_EVERY);
        let hook = lua.set_hook(triggers, move |_, _| {
            // o hook roda na thread que segura a VM (atrás do Mutex): sem corrida entre ler e baixar
            if counter.load(Ordering::Relaxed) == 0 {
                return Err(mlua::Error::RuntimeError(format!(
                    "instruction limit exceeded ({MAX_INSTRUCTIONS})"
                )));
            }
            counter.fetch_sub(1, Ordering::Relaxed);
            Ok(VmState::Continue)
        });
        hook.expect("instruction hook");
        Converters {
            lua,
            budget,
            items: BTreeMap::new(),
            errors: Vec::new(),
        }
    }

    fn reset_budget(&self) {
        self.budget
            .store(MAX_INSTRUCTIONS / HOOK_EVERY, Ordering::Relaxed);
    }

    /// Ambiente próprio do arquivo: lê os globais, mas o que ele define fica nele (um `helper`
    /// sem `local` não vaza para outro converter). O metatable fica escondido do script.
    fn environment(&self) -> mlua::Result<Table> {
        let env = self.lua.create_table()?;
        let meta = self.lua.create_table()?;
        meta.set("__index", self.lua.globals())?;
        meta.set("__metatable", false)?;
        env.set_metatable(Some(meta))?;
        Ok(env)
    }

    fn add(&mut self, id: &str, source: &str) -> Result<(), String> {
        if !valid_id(id) {
            return Err("invalid file name: use letters, digits, _ and -".into());
        }
        if source.len() > MAX_SOURCE {
            return Err(format!("larger than {} KB", MAX_SOURCE / 1024));
        }
        let env = self.environment().map_err(|err| message(&err))?;
        self.reset_budget();
        let table: Table = self
            .lua
            .load(source)
            .set_name(format!("@{id}.lua"))
            .set_environment(env)
            .eval()
            .map_err(|err| message(&err))?;
        let name = match table.get::<Value>("name").map_err(|err| message(&err))? {
            Value::Nil => id.to_owned(),
            Value::String(name) => truncate(&name.to_string_lossy()),
            _ => return Err("name must be a string".into()),
        };
        let registers = match table
            .get::<Value>("registers")
            .map_err(|err| message(&err))?
        {
            Value::Nil => 1,
            Value::Integer(n) if (1..=MAX_REGISTERS as i64).contains(&n) => n as usize,
            _ => {
                return Err(format!(
                    "registers must be an integer from 1 to {MAX_REGISTERS}"
                ));
            }
        };
        let decode = match table.get::<Value>("decode").map_err(|err| message(&err))? {
            Value::Function(f) => f,
            _ => return Err("decode(regs) function is missing".into()),
        };
        let encode = match table.get::<Value>("encode").map_err(|err| message(&err))? {
            Value::Function(f) => Some(f),
            Value::Nil => None,
            _ => return Err("encode must be a function".into()),
        };
        let info = Info {
            id: id.to_owned(),
            name,
            registers,
            writable: encode.is_some(),
        };
        self.items.insert(
            id.to_owned(),
            Item {
                info,
                decode,
                encode,
            },
        );
        Ok(())
    }

    pub fn list(&self) -> Vec<Info> {
        self.items.values().map(|item| item.info.clone()).collect()
    }

    pub fn errors(&self) -> &[LoadError] {
        &self.errors
    }

    fn item(&self, id: &str) -> Result<&Item, String> {
        self.items
            .get(id)
            .ok_or_else(|| format!("converter '{id}' not found"))
    }

    /// Texto da célula a partir de exatamente `registers` valores.
    pub fn decode(&self, id: &str, regs: &[u16]) -> Result<String, String> {
        let item = self.item(id)?;
        if regs.len() != item.info.registers {
            return Err(format!(
                "{id} needs {} register(s), got {}",
                item.info.registers,
                regs.len()
            ));
        }
        let table = self
            .lua
            .create_sequence_from(regs.iter().map(|&r| i64::from(r)))
            .map_err(|err| message(&err))?;
        self.reset_budget();
        let value: Value = item.decode.call(table).map_err(|err| message(&err))?;
        match value {
            Value::String(_) | Value::Integer(_) | Value::Number(_) => {
                let text = value.to_string().map_err(|err| message(&err))?;
                Ok(truncate(&text))
            }
            other => Err(format!(
                "decode must return a string or a number, got {}",
                other.type_name()
            )),
        }
    }

    /// Registradores a escrever a partir do texto digitado; conferidos aqui (quantidade e faixa).
    pub fn encode(&self, id: &str, text: &str) -> Result<Vec<u16>, String> {
        let item = self.item(id)?;
        let Some(encode) = &item.encode else {
            return Err(format!("{} is read-only", item.info.name));
        };
        if text.chars().count() > MAX_TEXT {
            return Err(format!("text longer than {MAX_TEXT} characters"));
        }
        self.reset_budget();
        let value: Value = encode.call(text).map_err(|err| message(&err))?;
        let Value::Table(table) = value else {
            return Err("encode must return a table of registers".into());
        };
        let regs: Vec<i64> = table
            .sequence_values::<i64>()
            .collect::<mlua::Result<_>>()
            .map_err(|_| "encode must return integers".to_string())?;
        if regs.len() != item.info.registers {
            return Err(format!(
                "encode returned {} register(s), expected {}",
                regs.len(),
                item.info.registers
            ));
        }
        regs.into_iter()
            .map(|r| {
                u16::try_from(r).map_err(|_| format!("register value {r} is outside 0..65535"))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Os exemplos que vão na pasta `converters/` dos pacotes de release.
    const EXAMPLES: [(&str, &str); 3] = [
        ("int16_div10", include_str!("../converters/int16_div10.lua")),
        ("uint32_abcd", include_str!("../converters/uint32_abcd.lua")),
        ("status_bits", include_str!("../converters/status_bits.lua")),
    ];

    fn with(files: &[(&str, &str)]) -> (Converters, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "rsmodmaster-conv-{}-{}",
            std::process::id(),
            files.first().map_or("none", |f| f.0)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        for (name, source) in files {
            fs::write(dir.join(name), source).unwrap();
        }
        (Converters::load(&dir), dir)
    }

    fn one(source: &str) -> Converters {
        with(&[("c.lua", source)]).0
    }

    #[test]
    fn loads_valid_files_and_reports_broken_ones() {
        let (c, dir) = with(&[
            (
                "a_ok.lua",
                "return { decode = function(r) return r[1] end }",
            ),
            (
                "b_syntax.lua",
                "return {\n  decode = function(r) return r[1] end,\n  oops oops\n}",
            ),
            ("c_nodecode.lua", "return { registers = 2 }"),
            (
                "d_regs.lua",
                "return { registers = 200, decode = function() end }",
            ),
            ("bad name.lua", "return { decode = function() end }"),
            ("readme.txt", "ignored"),
        ]);
        assert_eq!(
            c.list(),
            [Info {
                id: "a_ok".into(),
                name: "a_ok".into(),
                registers: 1,
                writable: false
            }]
        );
        let errors: Vec<(&str, &str)> = c
            .errors()
            .iter()
            .map(|e| (e.file.as_str(), e.message.as_str()))
            .collect();
        assert_eq!(errors.len(), 4, "{errors:?}");
        assert!(
            errors[0].0 == "b_syntax.lua" && errors[0].1.contains("b_syntax.lua:3:"),
            "{errors:?}"
        );
        assert!(errors[1].0 == "bad name.lua" && errors[1].1.contains("invalid file name"));
        assert!(errors[2].1.contains("decode"));
        assert!(errors[3].1.contains("1 to 125"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn sandbox_has_no_disk_network_or_loaders() {
        let c = one("return { decode = function()
               local names = {}
               for _, n in ipairs({'io','os','require','load','loadfile','dofile','pcall','xpcall',
                                   'coroutine','debug','package','collectgarbage','print'}) do
                 if _ENV[n] ~= nil then names[#names + 1] = n end
               end
               if string.dump then names[#names + 1] = 'string.dump' end
               return table.concat(names, ',')
             end }");
        assert_eq!(c.decode("c", &[0]).unwrap(), "");
    }

    #[test]
    fn globals_do_not_leak_between_files() {
        let (c, dir) = with(&[
            (
                "a.lua",
                "helper = 'from a'\nreturn { decode = function() return helper end }",
            ),
            (
                "b.lua",
                "return { decode = function() return tostring(helper) end }",
            ),
        ]);
        assert_eq!(c.decode("a", &[0]).unwrap(), "from a");
        assert_eq!(c.decode("b", &[0]).unwrap(), "nil");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn infinite_loops_and_memory_bombs_become_errors() {
        let (c, dir) = with(&[
            (
                "loop.lua",
                "return { decode = function() while true do end end }",
            ),
            (
                "mem.lua",
                "return { decode = function() return #string.rep('x', 1e9) end }",
            ),
            (
                "ok.lua",
                "return { decode = function(r) return r[1] * 2 end }",
            ),
            ("top.lua", "while true do end"),
        ]);
        assert!(
            c.decode("loop", &[0])
                .unwrap_err()
                .contains("instruction limit")
        );
        assert!(c.decode("mem", &[0]).unwrap_err().contains("memory"));
        assert_eq!(c.decode("ok", &[21]).unwrap(), "42"); // a VM segue usável
        assert!(c.errors()[0].message.contains("instruction limit"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn decode_accepts_strings_and_numbers_only() {
        let (c, dir) = with(&[
            ("f.lua", "return { decode = function() return 1.5 end }"),
            ("n.lua", "return { decode = function() return nil end }"),
            (
                "long.lua",
                "return { decode = function() return string.rep('y', 100) end }",
            ),
            (
                "two.lua",
                "return { registers = 2, decode = function(r) return r[1] + r[2] end }",
            ),
        ]);
        assert_eq!(c.decode("f", &[0]).unwrap(), "1.5");
        assert!(c.decode("n", &[0]).unwrap_err().contains("got nil"));
        assert_eq!(c.decode("long", &[0]).unwrap().len(), MAX_TEXT);
        assert!(c.decode("two", &[1]).unwrap_err().contains("needs 2"));
        assert!(c.decode("missing", &[1]).unwrap_err().contains("not found"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn encode_results_are_checked() {
        let (c, dir) = with(&[
            (
                "count.lua",
                "return { registers = 2, decode = function() return 0 end, encode = function() return {1} end }",
            ),
            (
                "range.lua",
                "return { decode = function() return 0 end, encode = function() return {70000} end }",
            ),
            (
                "frac.lua",
                "return { decode = function() return 0 end, encode = function() return {1.5} end }",
            ),
            (
                "err.lua",
                "return { decode = function() return 0 end, encode = function() error('bad input') end }",
            ),
            (
                "ro.lua",
                "return { name = 'RO', decode = function() return 0 end }",
            ),
        ]);
        assert!(c.encode("count", "1").unwrap_err().contains("expected 2"));
        assert!(c.encode("range", "1").unwrap_err().contains("70000"));
        assert!(c.encode("frac", "1").unwrap_err().contains("integers"));
        assert!(c.encode("err", "1").unwrap_err().contains("bad input"));
        assert_eq!(c.encode("ro", "1").unwrap_err(), "RO is read-only");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn examples_round_trip() {
        let files: Vec<(String, &str)> = EXAMPLES
            .iter()
            .map(|(id, src)| (format!("{id}.lua"), *src))
            .collect();
        let refs: Vec<(&str, &str)> = files.iter().map(|(n, s)| (n.as_str(), *s)).collect();
        let (c, dir) = with(&refs);
        assert!(c.errors().is_empty(), "{:?}", c.errors());
        assert_eq!(c.decode("int16_div10", &[0xFF9C]).unwrap(), "-10.0");
        assert_eq!(c.encode("int16_div10", "-10").unwrap(), [0xFF9C]);
        assert_eq!(c.encode("int16_div10", "21.5").unwrap(), [215]);
        assert_eq!(c.decode("uint32_abcd", &[0x0001, 0x0002]).unwrap(), "65538");
        assert_eq!(
            c.encode("uint32_abcd", "4294967295").unwrap(),
            [0xFFFF, 0xFFFF]
        );
        assert!(c.encode("uint32_abcd", "-1").is_err());
        assert_eq!(c.decode("status_bits", &[0b0101]).unwrap(), "RUN|FAULT");
        assert_eq!(c.decode("status_bits", &[0]).unwrap(), "IDLE");
        assert!(
            !c.list()
                .iter()
                .find(|i| i.id == "status_bits")
                .unwrap()
                .writable
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn files_are_only_reached_through_valid_ids() {
        let dir =
            std::env::temp_dir().join(format!("rsmodmaster-conv-files-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert!(save(&dir, "../escape", "x").is_err());
        assert!(source(&dir, "a/b").is_err());
        save(&dir, "mine", TEMPLATE).unwrap();
        assert_eq!(source(&dir, "mine").unwrap(), TEMPLATE);
        assert!(Converters::load(&dir).errors().is_empty());
        delete(&dir, "mine").unwrap();
        assert!(source(&dir, "mine").is_err());
        assert!(save(&dir, "big", &"x".repeat(MAX_SOURCE + 1)).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
