var GIFDecoder = require('../decoder');
var assert = require('assert');
var fs = require('fs');
var concat = require('concat-frames');

describe('GIFDecoder', function() {
  it('can probe to see if a file is a gif', function() {
    var file = fs.readFileSync(__dirname + '/images/animated.gif');
    assert(GIFDecoder.probe(file));
    assert(!GIFDecoder.probe(new Buffer(100)));
  });
  
  it('works with non-animated gifs', function(done) {
    fs.createReadStream(__dirname + '/images/trees.gif')
      .pipe(new GIFDecoder)
      .pipe(concat(function(frames) {
        assert.equal(frames.length, 1);
        assert.equal(frames[0].x, 0);
        assert.equal(frames[0].y, 0);
        assert.equal(frames[0].width, 400);
        assert.equal(frames[0].height, 533);
        assert.equal(frames[0].colorSpace, 'rgb');
        assert.deepEqual(frames[0].pixels.slice(0, 10), new Buffer([ 0x50, 0x8f, 0xd5, 0x50, 0x8f, 0xd5, 0x50, 0x8f, 0xd5, 0x50 ]));
        done();
      }));
  });
  
  it('decodes multiple frames', function(done) {
    var decoder = new GIFDecoder;
    
    fs.createReadStream(__dirname + '/images/animated.gif')
      .pipe(decoder)
      .pipe(concat(function(frames) {
        assert.equal(frames.length, 2);
        assert.equal(frames[0].x, 0);
        assert.equal(frames[0].y, 0);
        assert.equal(frames[0].width, 16);
        assert.equal(frames[0].height, 16);
        assert.equal(frames[0].colorSpace, 'rgb');
        assert.equal(frames[0].pixels.length, 16 * 16 * 3);
        assert.deepEqual(frames[0].pixels.slice(0, 3), new Buffer([ 204, 0, 153 ]));
        assert.equal(frames[1].x, 0);
        assert.equal(frames[1].y, 0);
        assert.equal(frames[1].width, 16);
        assert.equal(frames[1].height, 16);
        assert.equal(frames[1].colorSpace, 'rgb');
        assert.equal(frames[1].pixels.length, 16 * 16 * 3);
        assert.deepEqual(frames[1].pixels.slice(0, 3), new Buffer([ 0, 102, 102 ]));
        
        assert.equal(decoder.repeatCount, Infinity);
        done();
      }));
  });
  
  it('can read a byte at a time', function(done) {
    var file = fs.readFileSync(__dirname + '/images/animated.gif');
    var decoder = new GIFDecoder;
    
    decoder.pipe(concat(function(frames) {
      assert.equal(frames.length, 2);
      done();
    }));
    
    for (var i = 0; i < file.length; i++) {
      decoder.write(file.slice(i, i + 1));
    }
    
    decoder.end();
  });
  
  it('handles frame offsets, widths, and dispose ops', function(done) {
    fs.createReadStream(__dirname + '/images/animated-gif-with-offsets.gif')
      .pipe(new GIFDecoder)
      .pipe(concat(function(frames) {
        assert.equal(frames.length, 5);
        
        frames.forEach(function(frame) {
          assert.equal(frame.colorSpace, 'rgb');
          assert.equal(frame.pixels.length, frame.width * frame.height * 3);
          delete frame.pixels;
          delete frame.transparentColor;
          delete frame.colorSpace;
        });
        
        assert.deepEqual(frames, [
          { disposeOp: 1, delay: 0, x: 0, y: 0, width: 100, height: 100 },
          { disposeOp: 3, delay: 10, x: 35, y: 40, width: 32, height: 32 },
          { disposeOp: 3, delay: 10, x: 65, y: 60, width: 32, height: 32 },
          { disposeOp: 3, delay: 10, x: 92, y: 80, width: 32, height: 32 },
          { disposeOp: 3, delay: 10, x: 40, y: 85, width: 32, height: 32 }
        ]);
        
        done();
      }));
  });
  
  it('ignores empty frames', function(done) {
    // this image has a second frame with no data in it
    fs.createReadStream(__dirname + '/images/broken.gif')
      .pipe(new GIFDecoder)
      .pipe(concat(function(frames) {
        assert.equal(frames.length, 1);
        done();
      }));
  });
  
  it('errors for invalid LZW codes', function(done) {
    // The first LZW codes in the image are invalid values that try to create a loop
    // in the dictionary. Decoding should fail, but not infinitely loop or corrupt memory.    
    fs.createReadStream(__dirname + '/images/bad-initial-code.gif')
      .pipe(new GIFDecoder)
      .on('error', function(err) {
        assert(err instanceof Error);
        assert.equal(err.message, 'Invalid LZW code');
        done();
      });
  });
  
  it('errors for LZW code overflow', function(done) {
    // The first LZW codes in the image are invalid values that try to create a loop
    // in the dictionary. Decoding should fail, but not infinitely loop or corrupt memory.    
    fs.createReadStream(__dirname + '/images/bad-code.gif')
      .pipe(new GIFDecoder)
      .on('error', function(err) {
        assert(err instanceof Error);
        assert.equal(err.message, 'Invalid LZW code');
        done();
      });
  });
  
  it('works when there is no global palette', function(done) {
    fs.createReadStream(__dirname + '/images/chompy.gif')
      .pipe(new GIFDecoder)
      .pipe(concat(function(frames) {
        assert.equal(frames.length, 21);
        done();
      }));
  });
});
