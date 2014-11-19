var GIFEncoder = require('../encoder');
var GIFDecoder = require('../decoder');
var assert = require('assert');
var fs = require('fs');
var concat = require('concat-stream');
var PassThrough = require('stream').PassThrough;

describe('GIFEncoder', function() {
  it('encodes a single frame', function(done) {
    var palette = new Buffer([ 204, 0, 153, 0, 0, 0 ]);
    var pixels = new Buffer(10 * 10);
    pixels.fill(0);
    
    var enc = new GIFEncoder(10, 10, { palette: palette });
        
    enc.pipe(concat(function(buf) {
      assert.equal(buf.toString('ascii', 0, 6), 'GIF89a');
      
      var dec = new GIFDecoder;
      dec.pipe(concat(function(pix) {
        assert.deepEqual(dec.format, {
          width: 10,
          height: 10,
          colorSpace: 'rgb',
          repeatCount: 0
        });
        assert.equal(pix.length, 10 * 10 * 3);
        
        var expected = new Buffer(10 * 10 * 3);
        for (var i = 0; i < expected.length; i += 3) {
          expected[i] = 204;
          expected[i + 1] = 0;
          expected[i + 2] = 153;
        }
        
        assert.deepEqual(pix, expected);
        done();
      }));
      
      dec.end(buf);
    }));
    
    enc.end(pixels);
  });
  
  it('encodes an animated image', function(done) {
    var palette = new Buffer([ 204, 0, 153, 22, 204, 13 ]);
    var frame1 = new Buffer(10 * 10);
    frame1.fill(0);
    
    var frame2 = new Buffer(10 * 10);
    frame2.fill(1);
    
    var enc = new GIFEncoder(10, 10, { palette: palette, repeatCount: 3 });
        
    enc.pipe(concat(function(buf) {
      assert.equal(buf.toString('ascii', 0, 6), 'GIF89a');
      
      var dec = new GIFDecoder;
      dec.pipe(concat(function(pix) {
        assert.deepEqual(dec.format, {
          width: 10,
          height: 10,
          colorSpace: 'rgb',
          repeatCount: 3
        });
        assert.equal(pix.length, 10 * 10 * 3 * 2);
        
        var expected = new Buffer(10 * 10 * 3 * 2);
        for (var i = 0; i < expected.length / 2; i += 3) {
          expected[i] = 204;
          expected[i + 1] = 0;
          expected[i + 2] = 153;
        }
        
        for (var i = expected.length / 2; i < expected.length; i += 3) {
          expected[i] = 22;
          expected[i + 1] = 204;
          expected[i + 2] = 13;
        }
        
        assert.deepEqual(pix, expected);
        done();
      }));
      
      dec.end(buf);
    }));
    
    enc.write(frame1);
    enc.end(frame2);
  });
  
  it('can use different palettes for each frame', function(done) {
    var palette1 = new Buffer([ 204, 0, 153, 0, 0, 0 ]);
    var palette2 = new Buffer([ 22, 204, 13, 0, 0, 0 ]);
    var frame1 = new Buffer(10 * 10);
    frame1.fill(0);
    
    var frame2 = new Buffer(10 * 10);
    frame2.fill(0);
    
    var enc = new GIFEncoder(10, 10);
        
    enc.pipe(concat(function(buf) {
      assert.equal(buf.toString('ascii', 0, 6), 'GIF89a');
      
      var dec = new GIFDecoder;
      dec.pipe(concat(function(pix) {
        assert.deepEqual(dec.format, {
          width: 10,
          height: 10,
          colorSpace: 'rgb',
          repeatCount: 0
        });
        assert.equal(pix.length, 10 * 10 * 3 * 2);
        
        var expected = new Buffer(10 * 10 * 3 * 2);
        for (var i = 0; i < expected.length / 2; i += 3) {
          expected[i] = 204;
          expected[i + 1] = 0;
          expected[i + 2] = 153;
        }
        
        for (var i = expected.length / 2; i < expected.length; i += 3) {
          expected[i] = 22;
          expected[i + 1] = 204;
          expected[i + 2] = 13;
        }
        
        assert.deepEqual(pix, expected);
        done();
      }));
      
      dec.end(buf);
    }));
    
    enc.addFrame({ palette: palette1 });
    enc.write(frame1);
    
    enc.addFrame({ palette: palette2 });
    enc.end(frame2);
  });
  
  it('infinite repeat count', function(done) {
    var palette = new Buffer([ 204, 0, 153, 22, 204, 13 ]);
    var pixels = new Buffer(10 * 10);
    pixels.fill(0);
    
    var enc = new GIFEncoder(10, 10, { palette: palette, repeatCount: Infinity });
        
    enc.pipe(concat(function(buf) {
      assert.equal(buf.toString('ascii', 0, 6), 'GIF89a');
      
      var dec = new GIFDecoder;
      dec.pipe(concat(function(pix) {
        assert.equal(dec.format.repeatCount, Infinity);
        done();
      }));
      
      dec.end(buf);
    }));
    
    enc.end(pixels);
  });
  
  it('learns repeatCount and palette from piped streams', function(done) {
    var s = new PassThrough;
    var enc = new GIFEncoder;
        
    enc.pipe(concat(function(buf) {
      assert.equal(buf.toString('ascii', 0, 6), 'GIF89a');
      
      var dec = new GIFDecoder;
      dec.pipe(concat(function(pix) {
        assert.deepEqual(dec.format, {
          width: 10,
          height: 10,
          colorSpace: 'rgb',
          repeatCount: 10
        });
        assert.equal(pix.length, 10 * 10 * 3);
        
        var expected = new Buffer(10 * 10 * 3);
        for (var i = 0; i < expected.length; i += 3) {
          expected[i] = 204;
          expected[i + 1] = 0;
          expected[i + 2] = 153;
        }
        
        assert.deepEqual(pix, expected);
        done();
      }));
      
      dec.end(buf);
    }));
    
    s.pipe(enc);
    s.emit('format', {
      width: 10,
      height: 10,
      colorSpace: 'indexed',
      repeatCount: 10,
      palette: new Buffer([ 204, 0, 153, 22, 204, 13 ])
    });
    
    var pixels = new Buffer(10 * 10);
    pixels.fill(0);
    s.end(pixels);
  });
  
  it('errors if colorSpace of piped stream is not indexed', function(done) {
    var s = new PassThrough;    
    var pixels = new Buffer(10 * 10 * 3);
    pixels.fill(255);
    
    var enc = new GIFEncoder({ repeatCount: 10 });
    
    enc.on('error', function(err) {
      assert(err instanceof Error);
      assert.equal(err.message, 'Only indexed input is allowed in GIFEncoder');
      done();
    });
    
    s.pipe(enc);
    s.emit('format', {
      width: 10,
      height: 10,
      colorSpace: 'rgb'
    });
    
    s.end(pixels);
  });
  
  it('errors if there is no palette', function(done) {
    var enc = new GIFEncoder(10, 10);
    var pixels = new Buffer(10 * 10);
    pixels.fill(0);
        
    enc.on('error', function(err) {
      assert(err instanceof Error);
      assert.equal(err.message, 'No palette');
      done();
    });
    
    enc.end(pixels);
  });
  
  it('errors if palette length < 2', function(done) {
    var enc = new GIFEncoder(10, 10, { palette: new Buffer([]) });
    var pixels = new Buffer(10 * 10);
    pixels.fill(0);
        
    enc.on('error', function(err) {
      assert(err instanceof Error);
      assert.equal(err.message, 'Palette size must be a power of 2 in the range 2..256');
      done();
    });
    
    enc.end(pixels);
  });
  
  it('errors if palette length > 256', function(done) {
    var enc = new GIFEncoder(10, 10, { palette: new Buffer(512) });
    var pixels = new Buffer(10 * 10);
    pixels.fill(0);
        
    enc.on('error', function(err) {
      assert(err instanceof Error);
      assert.equal(err.message, 'Palette size must be a power of 2 in the range 2..256');
      done();
    });
    
    enc.end(pixels);
  });
  
  it('errors if palette length not a power of 2', function(done) {
    var enc = new GIFEncoder(10, 10, { palette: new Buffer(3) });
    var pixels = new Buffer(10 * 10);
    pixels.fill(0);
        
    enc.on('error', function(err) {
      assert(err instanceof Error);
      assert.equal(err.message, 'Palette size must be a power of 2 in the range 2..256');
      done();
    });
    
    enc.end(pixels);
  });
});
