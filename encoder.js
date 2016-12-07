var util = require('util');
var PixelStream = require('pixel-stream');
var LZWEncoder = require('lzw-stream/encoder');

function GIFEncoder(width, height, opts) {
  PixelStream.apply(this, arguments);
  
  if (typeof width === 'object')
    opts = width;
    
  this._lzw = null;
  this.format.colorSpace = 'indexed';
}

util.inherits(GIFEncoder, PixelStream);

GIFEncoder.prototype.supportedColorSpaces = ['indexed'];

GIFEncoder.prototype._start = function(done) {
  if (this.format.colorSpace !== 'indexed')
    return done(new Error('Only indexed input is allowed in GIFEncoder'));
  
  this._writeHeader();
  this._writeNetscape();
  done();
};

GIFEncoder.prototype._startFrame = function(frame, done) {
  this.palette = frame.palette || this.format.palette;
  if (!this.palette)
    return done(new Error('No palette'));
  
  this._writeGCE(frame);
  this._writeImageHeader(frame);
  this.push(this.palette);
  
  this.push(new Buffer([ 8 ])); // LZW code size
  this._lzw = new LZWEncoder(8);

  this._lzw.on('data', function(block) {
    this.push(new Buffer([block.length]));
    this.push(block);
  }.bind(this));
  
  done();
};

GIFEncoder.prototype._writePixels = function(data, done) {
  this._lzw.write(data);
  done();
};

GIFEncoder.prototype._endFrame = function(done) {
  this._lzw.end(function() {
    this.push(new Buffer([ 0 ])); // end LZW sub-blocks
    done();
  }.bind(this));
};

GIFEncoder.prototype._end = function(done) {
  this.push(new Buffer([ 0x3b ])); // trailer
  done();
};

GIFEncoder.prototype._writeHeader = function() {
  var buf = new Buffer(13);  
  
  buf.write('GIF89a');
  buf.writeUInt16LE(this.format.width, 6);
  buf.writeUInt16LE(this.format.height, 8);
  buf[10] = 0x70; // flags bits 2-4: color resolution = 7
  buf[11] = 0;    // background color index
  buf[12] = 0;    // pixel aspect ratio (1:1)
  
  this.push(buf);
};

GIFEncoder.prototype._writeNetscape = function() {
  var buf = new Buffer(19);
  
  // don't write the extension if we aren't repeating
  if (!this.format.repeatCount) return
  var repeat = this.format.repeatCount === Infinity ? 0 : this.format.repeatCount;
  
  buf[0] = 0x21;                  // extension block
  buf[1] = 0xff;                  // app extension
  buf[2] = 11;                    // block size
  buf.write('NETSCAPE2.0', 3);    // app name
  buf[14] = 3;                    // sub-block size
  buf[15] = 1;                    // loop sub-block id
  buf.writeUInt16LE(repeat, 16);  // repeat count (0 == Infinity)
  buf[18] = 0;                    // block terminator
  
  this.push(buf);
};

GIFEncoder.prototype._writeImageHeader = function(frame) {
  var buf = new Buffer(10);
  var x = frame.x || 0;
  var y = frame.y || 0;
  var w = frame.width || this.format.width;
  var h = frame.height || this.format.height;
  
  // compute palette size flag
  var n = this.palette.length / 3 | 0;
  if (n < 2 || n > 256 || n & (n - 1))
    return this.emit('error', new Error('Palette size must be a power of 2 in the range 2..256'));
    
  var p = (Math.log(n) / Math.LN2 | 0) - 1;
  
  buf[0] = 0x2c;           // image block
  buf.writeUInt16LE(x, 1); // x
  buf.writeUInt16LE(y, 3); // y
  buf.writeUInt16LE(w, 5); // width
  buf.writeUInt16LE(h, 7); // height
  buf[9] = 0x80 | p;       // flags (local palette and palette size)
    
  this.push(buf);
};

GIFEncoder.prototype._writeGCE = function(frame) {
  var buf = new Buffer(8);
  var delay = (frame.delay || 50) / 10 | 0;
  
  buf[0] = 0x21;               // extension block
  buf[1] = 0xf9;               // graphic control extension
  buf[2] = 4;                  // block size
  buf[3] = 0;                  // flags
  buf.writeUInt16LE(delay, 4); // frame delay
  buf[6] = 0;                  // transparent color index
  buf[7] = 0;                  // block terminator
  
  this.push(buf);
};

module.exports = GIFEncoder;
