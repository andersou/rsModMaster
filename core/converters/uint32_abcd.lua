-- Unsigned 32-bit integer in two registers, high word first (ABCD).
-- For the low word first (CDAB), swap regs[1] and regs[2] here and in encode.
return {
  name = "UInt32 ABCD",
  registers = 2,
  decode = function(regs)
    return (regs[1] << 16) | regs[2]
  end,
  encode = function(text)
    local value = math.tointeger(tonumber(text)) or error("integer expected")
    if value < 0 or value > 0xFFFFFFFF then error("out of range (0 to 4294967295)") end
    return { (value >> 16) & 0xFFFF, value & 0xFFFF }
  end,
}
