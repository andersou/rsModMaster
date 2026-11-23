-- Status word: each bit set becomes a name. Read-only (no encode).
local BITS = { [0] = "RUN", [1] = "ALARM", [2] = "FAULT", [3] = "REMOTE" }

return {
  name = "Status bits",
  registers = 1,
  decode = function(regs)
    local names = {}
    for bit = 0, 15 do
      if regs[1] & (1 << bit) ~= 0 then
        names[#names + 1] = BITS[bit] or ("BIT" .. bit)
      end
    end
    return #names > 0 and table.concat(names, "|") or "IDLE"
  end,
}
