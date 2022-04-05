"use strict";

// TODO generate these automatically?
const MINSCRIPTEN_RELEASE = "1.0";
const MINSCRIPTEN_BUILD = "1";

//
// Helpers
//

const sizeofInt = 4,
  sizeofLong = 4,
  sizeofLonglong = 8;
const sizeofUint = sizeofInt,
  sizeofUlong = sizeofLong,
  sizeofUlonglong = sizeofLonglong;
const NULL = 0;


// From sys/time.h:
const CLOCK_REALTIME = 0,
  CLOCK_MONOTONIC = 1;


import { memory as linearMem } from "__symbols"; // XXX should be __linear_memory

const Buffer = class Buffer extends Uint8Array {
  toString(encoding, offset, end) {
    if (typeof offset !== 'number')
      offset = 0;
    if (typeof end !== 'number')
      end = this.byteLength;
    if (typeof encoding !== 'string' || encoding === '')
      encoding = 'utf8';
    if (offset < 0 || end < offset || end > this.byteLength)
      throw new RangeError('Out of bounds write');
    if (encoding !== 'utf8' && encoding !== 'utf-8')
      throw new TypeError('Unsupported encoding: ' + encoding);

    const nullPos = this.subarray(0, end).indexOf(0, offset);
    if (nullPos >= 0)
      end = nullPos;
    const codePoints = new Uint32Array(end - offset);
    let nCodePoints = 0;

    // Can't have multiple out-values in JS, so we decode with a closure, which
    // should be inlined.
    let i = offset;
    const buffer = this;
    function readCodePoint() {
      let u = buffer[i++];
      if (u < 0x80) return u; // ASCII, nothing to do
      if (u >= 0xf8 || u < 0xc0)
        return 0xfffd; // replace bad lead byte
      let trailBytes;
      if (u >= 0xf0) { trailBytes = 3; u &= 0x7; }
      else if (u >= 0xe0) { trailBytes = 2; u &= 0xf; }
      else { trailBytes = 1; u &= 0x1f; }
      const cpEnd = i + trailBytes;
      if (cpEnd > end) {
        i = end;
        return 0xfffd; // replace truncated sequence
      }
      let j = i; i = cpEnd;
      while (j < cpEnd) {
        const u2 = buffer[j++];
        if (u2 >= 0xc0) return 0xfffd; // replace bad trail byte
        u = (u << 6) | (u2 & 0x3f);
      }
      if (u > 0x10ffff || (u & ~0x7ff) == 0xd800)
        return 0xfffd; // replace out-of-range / surrogate code points
      const minimalBytes = (u < 0x80) ? 1 : (u < 0x800) ? 2 : (u < 0x10000) ? 3 : 4;
      if (trailBytes + 1 != minimalBytes)
        return 0xfffd; // replace non-minimally-encoded
      return u;
    }
    while (i < end)
      codePoints[nCodePoints++] = readCodePoint();

    let rv = '';
    // Sadly, apply() goes through the JavaScript stack, which limits us to smallish
    // amounts of text per call, so we use a loop to be safe.
    const codePointsPerApply = 1024;
    for (let i = 0; i < nCodePoints;) {
      const n = Math.min(nCodePoints - i, codePointsPerApply);
      rv += String.fromCodePoint.apply(String, codePoints.subarray(i, i + n));
      i += n;
    }
    return rv;
  }
  write(string, offset, length, encoding) {
    if (typeof offset !== 'number')
      offset = 0;
    if (typeof length !== 'number')
      length = this.length;
    if (typeof encoding !== 'string' || encoding === '')
      encoding = 'utf8';
    if (offset < 0 || length < 0 || offset + length > this.length)
      throw new RangeError('Out of bounds write');
    if (encoding !== 'utf8' && encoding !== 'utf-8')
      throw new TypeError('Unsupported encoding: ' + encoding);
    const end = offset + length;
    let outIdx = offset;
    for (let inIdx = 0; inIdx < string.length; ++inIdx) {
      let c = string.codePointAt(inIdx);
      if (c >= 0x10000)
        ++inIdx; // skip trailing surrogate half
      else if (c >= 0xd800 && c <= 0xdfff)
        c = 0xfffd; // replace unpaired surrogate half
      else if (c > 0x10ffff)
        c = 0xfffd; // replace out-of-range surrogate pair
      if (c < 0x80) {
        if (outIdx + 1 > end) break;
        this[outIdx++] = c;
      } else if (c < 0x800) {
        if (outIdx + 2 > end) break;
        this[outIdx++] = 0xc0 | (c >> 6);
        this[outIdx++] = 0x80 | (c & 0x3f);
      } else if (c < 0x10000) {
        if (outIdx + 3 > end) break;
        this[outIdx++] = 0xe0 | (c >> 12);
        this[outIdx++] = 0x80 | ((c >> 6) & 0x3f);
        this[outIdx++] = 0x80 | (c & 0x3f);
      } else {
        if (outIdx + 4 > end) break;
        this[outIdx++] = 0xf0 | (c >> 18);
        this[outIdx++] = 0x80 | ((c >> 12) & 0x3f);
        this[outIdx++] = 0x80 | ((c >> 6) & 0x3f);
        this[outIdx++] = 0x80 | (c & 0x3f);
      }
    }
    return outIdx - offset;
  }
};

const memory = new class {
  constructor() {
    this.u8 = null;
    this.u32 = null;
    this.s32 = null;
    this.f32 = null;

    const tester = new Uint32Array(1);
    tester[0] = 0x01;
    if (new Uint8Array(tester.buffer)[0] !== 0x01)
      throw new Error("Unsupported platform, TypedArray must be little-endian");
  }
  getU8() {
    let u8 = this.u8;
    if (u8 !== null && u8.buffer == linearMem.buffer)
      return u8;
    return (this.u8 = new Buffer(linearMem.buffer));
  }
  getU32() {
    let u32 = this.u32;
    if (u32 !== null && u32.buffer == linearMem.buffer)
      return u32;
    return (this.u32 = new Uint32Array(linearMem.buffer));
  }

  getF32() {
    let f32 = this.f32;
    if (f32 !== null && f32.buffer == linearMem.buffer)
      return f32;
    return (this.f32 = new Float32Array(linearMem.buffer));
  }

  getS32() {
    let s32 = this.s32;
    if (s32 !== null && s32.buffer == linearMem.buffer)
      return s32;
    return (this.s32 = new Int32Array(linearMem.buffer));
  }
  getUsage() {
    return linearMem.buffer.byteLength;
  }
};

function writeU32(address, value) {
  address = address >>> 0;
  value = value >>> 0;
  const u32 = memory.getU32();
  if ((address & 0x3) !== 0 || (address >>= 2) >= u32.length)
    return false;
  u32[address] = value;
  return true;
}
function writeS32(address, value) {
  address = address >>> 0;
  value = value | 0;
  const s32 = memory.getS32();
  if ((address & 0x3) !== 0 || (address >>= 2) >= s32.length)
    return false;
  s32[address] = value;
  return true;
}
function writeU64(address, value) {
  value = Math.floor(value);
  const max = 0xfffffffffffff800;
  value = Math.max(0, Math.min(value, max));
  const low = value >>> 0;
  const high = Math.floor(value / 0x100000000) >>> 0;
  return writeU32(address, low) && writeU32(address + 4, high);
}
function writeS64(address, value) {
  value = Math.floor(value);
  const max = 0x7ffffffffffffc00;
  const min = -0x7ffffffffffffc00;
  value = Math.max(min, Math.min(value, max));
  const low = value >>> 0;
  const high = Math.floor(value / 0x100000000) | 0;
  return writeU32(address, low) && writeS32(address + 4, high);
}
function writeString(address, str, maxLen) {
  address = address >>> 0;
  maxLen = maxLen >>> 0;
  const u8 = memory.getU8();
  if (maxLen < 1 || address + maxLen > u8.length)
    return false;
  const len = u8.write(str, address, maxLen - 1, 'utf8');
  u8[address + len] = 0; // Null-terminate
  return true;
}
function writeFill(address, value, len) {
  address = address >>> 0;
  value = value | 0;
  const u8 = memory.getU8();
  if (address + len >= u8.length)
    return false;
  u8.fill(value, address, address + len);
  return true;
}
function writeUint8Array(address, array) {
  address = address >>> 0;
  const u8 = memory.getU8();
  if (address + array.length > u8.length)
    return false;
  u8.set(array, address);
  return true;
}
const writeUint = writeU32,
  writeInt = writeS32,
  writeUlong = writeU32,
  writeLong = writeS32,
  writeUlonglong = writeU64,
  writeLonglong = writeS64;
const writeGidt = writeUint,
  writeUidt = writeUint,
  writeClockt = writeLong,
  writeTimet = writeLonglong,
  writeSusecondst = writeLonglong;

function readU32(address) {
  address = address >>> 0;
  const u32 = memory.getU32();
  if ((address & 0x3) !== 0 || (address >>= 2) >= u32.length)
    return [0, false];
  return [u32[address], true];
}
function readS32(address) {
  address = address >>> 0;
  const s32 = memory.getS32();
  if ((address & 0x3) !== 0 || (address >>= 2) >= s32.length)
    return [0, false];
  return [s32[address], true];
}

function readF32(address) {
  address = address >>> 0;
  const f32 = memory.getF32();
  if ((address & 0x3) !== 0 || (address >>= 2) >= f32.length)
    return [0, false];
  return [f32[address], true];
}

function readU64(address) {
  let low, high, result;
  [low, result] = readU32(address);
  if (!result)
    return [0, false];
  [high, result] = readU32(address + 4);
  if (!result)
    return [0, false];
  return [high * 0x100000000 + low, true];
}
function readS64(address) {
  let low, high, result;
  [low, result] = readU32(address);
  if (!result)
    return [0, false];
  [high, result] = readS32(address + 4);
  if (!result)
    return [0, false];
  let value = high * 0x100000000;
  if (Math.sign(high) < 0) value -= low;
  else value += low;
  return [value, true];
}
const readUint = readU32,
  readInt = readS32,
  readUlong = readU32,
  readLong = readS32,
  readUlonglong = readU64,
  readLonglong = readS64;

function toUlong(long) {
  return long >>> 0; // Coerce to u32
}


// wasi api minimalist implementation


var WASI_ESUCCESS = 0;
var WASI_EBADF = 8;
var WASI_EINVAL = 28;
var WASI_ENOSYS = 52;
var WASI_STDOUT_FILENO = 1;
var WASI_EFAULT = 21;


function fd_prestat_get(fd, bufPtr) {
  return WASI_EBADF;
} function fd_prestat_dir_name(fd, pathPtr, pathLen) {
  return WASI_EINVAL;
}

function environ_sizes_get(environCount, environBufSize) {
  writeU32(environCount, 0);
  writeU32(environBufSize, 0);
  return WASI_ESUCCESS;
}

function environ_get__(environ, environBuf) {
  return WASI_ESUCCESS;
}

function args_sizes_get(argc, argvBufSize) {
  writeU32(argc, 0);
  writeU32(argvBufSize, 0);
  return WASI_ESUCCESS;
}

function args_get(argv, argvBuf) {
  return WASI_ESUCCESS;
}

function fd_fdstat_get(fd, bufPtr) {
  return WASI_ENOSYS;
}
function poll_oneoff(sin, sout, nsubscriptions, nevents) {
  return WASI_ENOSYS;
} function proc_exit(rval) {
  return WASI_ENOSYS;
} function fd_close(fd) {
  return WASI_ENOSYS;
} function fd_seek(fd, offset, whence, newOffsetPtr) {
} function fd_close(fd) {
  return WASI_ENOSYS;
}
function fd_fdstat_set_flags(fd, flags) {
  return WASI_ENOSYS;
}

function fd_prestat_dir_name(fd, buf) {
  return WASI_ENOSYS;
}

function fd_read(fd, iovs, iovs_len, nread) {
  return WASI_ENOSYS;
}

function path_open(dirfd, dirflags, path, path_len, oflags, fs_rights_base, fs_rights_inheriting, fs_flags, fd) {
  return WASI_ENOSYS;
}


function clock_time_get(clockId, precision, ts) {
  let now;
  switch (clockId) {
    case CLOCK_REALTIME: now = Date.now() * 1e6;
      break;
    default: return WASI_EINVAL;
  }
  if (!writeU64(ts, now)) return WASI_EFAULT;
  return WASI_ESUCCESS;
}
//ssize_t writev (int, const struct iovec *, int);
export function __syscall_writev(fd, iovec, nWritten) {
  let piovec, niovec, result;
  let buff = memory.getU8();

  let str = "";
  let curr = iovec;
  let bytes = 0;
  for (let i = 0; i < nWritten; ++i) {

    [piovec, result] = readS32(curr);
    curr += 4;
    if (!result)
      throw new Error("Unable to read iovec address");

    [niovec, result] = readS32(curr);
    if (!result)
      throw new Error("Unable to read iovec size");
    curr += 4;
    bytes += niovec;
    str += buff.toString("utf8", piovec, piovec + niovec)
  }
  //__root.console.log("iovec size =" +niovec);
  __root.console.log(str);

  return bytes;
}





__symbols_wasi["environ_sizes_get"] = environ_sizes_get;
__symbols_wasi["args_sizes_get"] = args_sizes_get;
__symbols_wasi["fd_prestat_get"] = fd_prestat_get;
__symbols_wasi["fd_fdstat_get"] = fd_fdstat_get;
__symbols_wasi["environ_get"] = environ_get__;
__symbols_wasi["clock_time_get"] = clock_time_get;
__symbols_wasi["fd_close"] = fd_close;
__symbols_wasi["fd_fdstat_set_flags"] = fd_fdstat_set_flags;
__symbols_wasi["fd_prestat_dir_name"] = fd_prestat_dir_name;
__symbols_wasi["fd_write"] = __syscall_writev;
__symbols_wasi["args_get"] = args_get;
__symbols_wasi["poll_oneoff"] = poll_oneoff;
__symbols_wasi["fd_read"] = fd_read;
__symbols_wasi["fd_seek"] = fd_seek;
__symbols_wasi["path_open"] = path_open;
__symbols_wasi["proc_exit"] = proc_exit;


//

// wasi_snapshot_preview1:__symbols_wasi