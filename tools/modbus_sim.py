"""Escravo Modbus TCP de teste (pymodbus 3.13): 100 bobinas 1,0,1,0..., 100 entradas 0,1,0,1...,
holding registers 0..99 e input registers 1000..1099 a partir do endereço 0; o registrador 9 varia
como senoide e o 10 como rampa (para o gráfico). É o escravo de core/tests/simulator.rs.

    uv run --with 'pymodbus>=3.13' python tools/modbus_sim.py 5020
"""
import asyncio, math, sys
from pymodbus.datastore import ModbusDeviceContext, ModbusSequentialDataBlock, ModbusServerContext
from pymodbus.server import StartAsyncTcpServer

# pymodbus 3.13 serve `ir` na FC 03 e `hr` na FC 04
regs = ModbusSequentialDataBlock(1, list(range(100)))
ctx = ModbusDeviceContext(
    co=ModbusSequentialDataBlock(1, [1, 0] * 50),
    di=ModbusSequentialDataBlock(1, [0, 1] * 50),
    ir=regs,
    hr=ModbusSequentialDataBlock(1, list(range(1000, 1100))),
)

server_ctx = ModbusServerContext(devices=ctx, single=True)

async def vary(port):
    # registrador 9: senoide em torno de 1000; 10: rampa 0..499 (para o gráfico ter movimento),
    # escritos como um cliente faria (a API interna do datastore mudou no pymodbus 3.13)
    from pymodbus.client import AsyncModbusTcpClient
    await asyncio.sleep(0.5)
    client = AsyncModbusTcpClient("127.0.0.1", port=port)
    await client.connect()
    t = 0.0
    while True:
        t += 0.1
        await client.write_registers(9, [int(1000 + 800 * math.sin(t)) & 0xFFFF, int(t * 10) % 500], device_id=1)
        await asyncio.sleep(0.1)

async def main():
    asyncio.create_task(vary(int(sys.argv[1])))
    await StartAsyncTcpServer(context=server_ctx, address=("127.0.0.1", int(sys.argv[1])))

asyncio.run(main())
