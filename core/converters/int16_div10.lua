-- Signed 16-bit integer divided by 10 (e.g. temperature in tenths of a degree).
-- string.pack/unpack reinterpret the raw register: ">i2" = big-endian signed 16 bits.
return {
  name = "Int16 / 10",
  registers = 1,
  decode = function(regs)
    local value = string.unpack(">i2", string.pack(">I2", regs[1]))
    return string.format("%.1f", value / 10)
  end,
  encode = function(text)
    local value = tonumber(text) or error("number expected")
    local raw = math.floor(value * 10 + 0.5)
    if raw < -32768 or raw > 32767 then error("out of range (-3276.8 to 3276.7)") end
    return { raw & 0xFFFF }
  end,
}
