var util = require('util');
var Transform = require('stream').Transform;
var BufferList = require('bl');
var bufferEqual = require('buffer-equal');
var LZWDecoder = require('lzw-stream/decoder');

// decoder states
var GIF_SIGNATURE = 0;
var GIF_HEADER = 1;
var GIF_GLOBAL_PALETTE = 2;
var GIF_LOCAL_PALETTE = 3;
var GIF_BLOCK = 4;
var GIF_EXTENSION = 5;
var GIF_IMAGE_HEADER = 6;
var GIF_LZW = 7;
var GIF_DONE = 8;

function GIFDecoder() {
  Transform.call(this);
  
  this._buffer = new BufferList;
  this._state = GIF_SIGNATURE;
  this._frame = {};
  this._emitFormat = false;
  this.format = {
    width: 0,
    height: 0,
    colorSpace: 'rgb',
    repeatCount: 0
  };
}

util.inherits(GIFDecoder, Transform);

GIFDecoder.probe = function(buf) {
  var sig = buf.toString('ascii', 0, 6);
  return sig === 'GIF87a' || sig === 'GIF89a';
};

GIFDecoder.prototype._transform = function(data, encoding, done) {
  this._buffer.append(data);
  
  // process the state machine until nothing more can be read
  var oldLength = 0;
  do {
    oldLength = this._buffer.length;
        
    switch (this._state) {
      case GIF_SIGNATURE:
        this._readSignature();
        break;
        
      case GIF_HEADER:
        this._readHeader();
        break;
        
      case GIF_GLOBAL_PALETTE:
      case GIF_LOCAL_PALETTE:
        this._readPalette();
        break;
        
      case GIF_BLOCK:
        this._readBlock();
        break;
        
      case GIF_EXTENSION:
        this._readExtension();
        break;
        
      case GIF_IMAGE_HEADER:
        this._readImageHeader();
        break;
        
      case GIF_LZW:
        this._readLZW();
        break;
        
      case GIF_DONE:
        done();
        return;
    }
    
  } while (this._buffer.length < oldLength);
  
  done();
};

GIFDecoder.prototype._readSignature = function() {
  if (this._buffer.length < 6)
    return;
    
  var sig = this._buffer.toString('ascii', 0, 6);
  switch (sig) {
    case 'GIF89a':
      this._version = 89;
      break;
      
    case 'GIF87a':
      this._version = 87;
      break;
      
    default:
      return this.emit('error', new Error('Invalid GIF signature'));
  }
  
  this._buffer.consume(6);
  this._state = GIF_HEADER;
};

GIFDecoder.prototype._readHeader = function() {
  var buf = this._buffer;
  if (buf.length < 7)
    return;
  
  this.format.width = buf.readUInt16LE(0);
  this.format.height = buf.readUInt16LE(2);
    
  var v = buf.get(4);
  var globalMapColors = 2 << (v & 0x07);
    
  if ((v & 0x80) && globalMapColors > 0) {
    this._paletteSize = globalMapColors;
    this._state = GIF_GLOBAL_PALETTE;
  } else {
    this._state = GIF_BLOCK;
  }
  
  buf.consume(7);
};

GIFDecoder.prototype._readPalette = function() {
  var buf = this._buffer;
  var len = this._paletteSize * 3;
  if (buf.length < len)
    return;
    
  this._palette = buf.slice(0, len);
  buf.consume(len);
  
  this._state = this._state === GIF_GLOBAL_PALETTE ? GIF_BLOCK : GIF_LZW;
};

GIFDecoder.prototype._readBlock = function() {
  var buf = this._buffer;
  if (buf.length < 1)
    return;
    
  switch (buf.get(0)) {
    case 0x21:
      this._state = GIF_EXTENSION;
      break;
      
    case 0x2c:
      this._state = GIF_IMAGE_HEADER;
      break;
      
    default:
      this._state = GIF_DONE;
  }
  
  buf.consume(1);
};

GIFDecoder.prototype._readExtension = function() {  
  var buf = this._buffer;
  if (buf.length < 1)
    return;
    
  var type = buf.get(0);
  
  switch (type) {
    case 0xff: // Application specific extension
      if (buf.length < 18)
        return;
      
      // Netscape extension
      if (buf.get(1) === 11 && 
          buf.toString('ascii', 2, 13) === 'NETSCAPE2.0' &&
          buf.get(13) === 3 &&
          buf.get(14) === 1 &&
          buf.get(17) === 0) {
        var repeat = buf.readInt16LE(15);
        
        // -1 = no repeat, 0 = infinity
        this.format.repeatCount = repeat === -1 ? 0 : (repeat || Infinity);
      }
        
      break;
      
    case 0xf9: // Graphic control extension
      if (buf.length < 7)
        return;
                
      if (buf.get(1) === 4 && buf.get(6) === 0) {
        var flags = buf.get(2);
        this._frame.disposeOp = (flags >> 2) & 0x7;
        this._frame.delay = buf.readUInt16LE(3) * 10;
        this._frame.transparentColor = (flags & 1) ? buf.get(5) : null;
      }
      
      break;
  }
  
  var pos = 1;
    
  // consume all of the sub-blocks
  while (pos + 1 < buf.length) {
    var size = buf.get(pos);
    pos += 1 + size;
        
    if (size === 0 && pos < buf.length) {
      this._state = GIF_BLOCK;
      buf.consume(pos);
      return;
    }
  }
};

GIFDecoder.prototype._readImageHeader = function() {
  var buf = this._buffer;
  if (buf.length < 9)
    return;
  
  this._frame.x = buf.readUInt16LE(0);
  this._frame.y = buf.readUInt16LE(2);
  this._frame.width = buf.readUInt16LE(4);
  this._frame.height = buf.readUInt16LE(6);
  var flags = buf.get(8);  
    
  this._interlaced = !!(flags & 0x40);
  if (flags & 0x80) {
    this._paletteSize = 2 << (flags & 0x7);
    this._state = GIF_LOCAL_PALETTE;
  } else {
    this._state = GIF_LZW;
  }
  
  buf.consume(9);
};

GIFDecoder.prototype._readLZW = function() {
  var buf = this._buffer;
  
  if (!this._lzw && buf.length >= 1) {
    if (!this._emitFormat) {
      this.emit('format', this.format);
      this._emitFormat = true;
    }
    
    this.emit('frame', this._frame);
    
    this._lzw = new LZWDecoder(buf.get(0));
    this._lzw.on('data', this._outputScanline.bind(this));
    this._lzw.on('error', function(err) {
      this.emit('error', err);
    }.bind(this));
    
    buf.consume(1);
  }
  
  if (buf.length < 1)
    return;
        
  var size = buf.get(0);
  if (size === 0) { // done!
    buf.consume(1);
    this._lzw.end();
    this._lzw = null;
    this._frame = {};
    this._state = GIF_BLOCK; // more frames?!
    return;
  }
  
  // wait until we have all of the data for this block
  if (buf.length < size + 1)
    return;
    
  // read the block from the buffer
  var block = buf.slice(1, size + 1);
  buf.consume(size + 1);
  
  this._lzw.write(block);
};

GIFDecoder.prototype._outputScanline = function(scanline) {
  var res = new Buffer(scanline.length * 3);
  var p = 0;
  
  for (var i = 0; i < scanline.length; i++) {
    var idx = scanline[i] * 3;
    res[p++] = this._palette[idx];
    res[p++] = this._palette[idx + 1];
    res[p++] = this._palette[idx + 2];
  }
  
  this.push(res);
};

module.exports = GIFDecoder;
