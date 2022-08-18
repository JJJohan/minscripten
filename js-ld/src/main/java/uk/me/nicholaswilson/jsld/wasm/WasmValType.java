package uk.me.nicholaswilson.jsld.wasm;

import uk.me.nicholaswilson.jsld.LdException;

public enum WasmValType {
  i32(0x7f),
  i64(0x7e),
  f32(0x7d),
  f64(0x7c),
  v128(0x7B),
  funcref(0x70),
  func(0x60);

  public final int code;

  WasmValType(int code) {
    this.code = code;
  }

  public static WasmValType of(byte code) {
    for (WasmValType type : values())
      if (type.code == code)
        return type;
    throw new LdException("Invalid Wasm file: bad valtype");
  }
}
